/* ==========================================================================
   Abonnement : la version gratuite, et l'illimité par Stripe
   --------------------------------------------------------------------------
   Une page statique ne peut pas encaisser un paiement toute seule : la clé
   secrète Stripe ne doit jamais s'y trouver. Le partage est donc :

     - ici, dans la page : le compteur de fiches, le mur de paiement, la
       redirection vers Stripe et la licence gardée sur l'appareil ;
     - dans `serveur/` : la création de la session de paiement et la
       vérification de l'abonnement, avec la clé secrète.

   Tant que `CONFIG.api` est vide, rien n'est déverrouillé et l'app le dit :
   pas de faux « premium » qui donnerait le change.
   ========================================================================== */

const ABONNEMENT = (function () {
  "use strict";

  /* ————— À régler avant la mise en ligne ——————————————————————————
     `api` : l'adresse du petit serveur de `serveur/` une fois déployé,
     sans barre finale. Le reste est de l'affichage.
     ———————————————————————————————————————————————————————————— */
  const CONFIG = {
    api: "",                                  // ex. « https://brainoko.com/api »
    essai: "",                                // ex. « 7 jours offerts »
    /* L'essai : 2 fiches — 200 crédits — données une fois à l'ouverture du
       compte. Elles ne se rechargent jamais, et c'est toute la différence
       avec un abonnement : l'essai sert à juger, pas à réviser gratuitement
       toute l'année en attendant le 1er du mois. */
    gratuit: { fiches: 2 },

    /* ————— Les crédits ————————————————————————————————————————
       Ce que l'élève voit est un solde de crédits ; ce qu'on règle ici
       reste un nombre de fiches. Une seule vérité, donc, et l'autre s'en
       déduit : à 100 crédits la fiche, 30 fiches font 3 000 crédits.

       L'intérêt viendra le jour où tout ne coûtera pas pareil — une fiche
       relue, un quiz régénéré, une page de plus. Un solde sait dire ça,
       un compteur de fiches non. */
    creditsParFiche: 100,

    /* ————— Les trois offres ————————————————————————————————————
       Elles se distinguent par le nombre de fiches par mois, parce que
       c'est le seul poste qui grandit avec l'usage : une fiche coûte
       environ quatre centimes à produire. Un palier qui ne compterait pas
       les fiches laisserait un gros utilisateur manger toute sa marge.

       `fiches` est le plafond mensuel, et chaque offre annonce le sien.
       Aucune ne se dit « illimitée » : un palier qui compte et qui promet
       de ne pas compter est un mensonge qui se découvre au pire moment,
       c'est-à-dire le soir où l'élève en a besoin.

       Le drapeau `illimite` existe toujours, pour le jour où tu voudrais
       une offre sans compteur affiché : il garde le plafond mais cesse de
       l'annoncer comme une limite.
       ———————————————————————————————————————————————————————————— */
    offres: [
      {
        cle: "essentiel", nom: "Essentiel", prix: "4,90 €", periode: "par mois",
        fiches: 10, argument: "Pour une matière, ou un trimestre tranquille.",
      },
      {
        cle: "regulier", nom: "Régulier", prix: "9,90 €", periode: "par mois",
        fiches: 30, argument: "Toutes tes matières, toute l'année.", conseille: true,
      },
      {
        cle: "intensif", nom: "Intensif", prix: "14,90 €", periode: "par mois",
        fiches: 60, argument: "Pour les semaines de révisions à plein régime.",
      },
    ],
  };

  /* Une mise en ligne peut renseigner l'adresse sans toucher à ce fichier :
     <script>window.MATHEMATIQUE_PAIEMENT = { api: "https://…" }</script>
     avant le chargement de ce module. Pratique aussi pour les essais. */
  if (typeof window !== "undefined" && window.MATHEMATIQUE_PAIEMENT) {
    Object.assign(CONFIG, window.MATHEMATIQUE_PAIEMENT);
    if (window.MATHEMATIQUE_PAIEMENT.gratuit) {
      Object.assign(CONFIG.gratuit, window.MATHEMATIQUE_PAIEMENT.gratuit);
    }
  }

  const CLE_ABONNEMENT = "mathematique.abonnement";
  const CLE_APPAREIL = "mathematique.appareil";
  const CLE_CONSOMMATION = "mathematique.consommation";
  const JOUR = 86400000;
  const DELAI_VERIFICATION = JOUR;            // on revérifie une fois par jour
  const DELAI_RESEAU = 15000;

  /* ————— Ce qu'on garde sur l'appareil ———————————————————————————— */

  function lire() {
    try {
      const brut = localStorage.getItem(CLE_ABONNEMENT);
      const etat = brut ? JSON.parse(brut) : null;
      return etat && typeof etat === "object" ? etat : null;
    } catch (erreur) { return null; }
  }

  function ecrire(etat) {
    try {
      if (etat) localStorage.setItem(CLE_ABONNEMENT, JSON.stringify(etat));
      else localStorage.removeItem(CLE_ABONNEMENT);
    } catch (erreur) { /* navigation privée : l'abonnement vaut pour la session */ }
    memoire = etat;
  }

  // Le stockage peut être bloqué : on garde une copie en mémoire.
  let memoire = null;

  function etat() {
    return memoire || lire() || { actif: false, cle: "", expire: 0, verifieLe: 0 };
  }

  /** Un identifiant d'appareil, pour relier un paiement à ce navigateur. */
  function appareil() {
    try {
      let id = localStorage.getItem(CLE_APPAREIL);
      if (!id) {
        id = `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(CLE_APPAREIL, id);
      }
      return id;
    } catch (erreur) {
      return `a${Math.random().toString(36).slice(2, 10)}`;
    }
  }

  /* ————— Ce que la gratuité permet ———————————————————————————————— */

  function configure(reglages) {
    Object.assign(CONFIG, reglages || {});
    if (reglages && reglages.gratuit) Object.assign(CONFIG.gratuit, reglages.gratuit);
    return CONFIG;
  }

  function config() { return CONFIG; }

  /* ————— Le compteur du mois ——————————————————————————————————
     Les offres se comptent par mois, pas en tout : il faut donc savoir
     combien de fiches ce navigateur a produites ce mois-ci.

     Ce compteur vit sur l'appareil. Il guide l'élève, il ne le retient
     pas : vider son navigateur le remet à zéro. Ce n'est pas une faille
     à colmater ici — le vrai garde-fou de ta facture est côté serveur
     (pages par heure et par appareil), et une vraie application du quota
     demanderait des comptes et une base de données.
     ———————————————————————————————————————————————————————————— */

  function moisCourant(quand) {
    const d = quand ? new Date(quand) : new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  /* ————— La fenêtre que compte « fiches » ————————————————————————
     Un quota mensuel qui repart le 1er ne tombe pas avec la facture :
     Stripe prélève à la date d'anniversaire. Qui s'abonne le 28 recevrait
     son quota, puis un second trois jours plus tard — deux quotas pour un
     paiement. Et une carte refusée (statut « past_due ») en toucherait un
     de plus au passage du mois, sans avoir payé.

     Le compteur suit donc la **période payée** quand il y a un abonnement :
     Stripe dit jusqu'à quand elle court (`expire`), et ce repère ne bouge
     qu'au prélèvement suivant. Sans abonnement, c'est le mois civil — mais
     l'essai, lui, se compte sur `total`, qui ne repart jamais.
     ———————————————————————————————————————————————————————————— */
  function fenetreCourante() {
    const courant = etat();
    /* Au jour près : l'échéance d'une période ne bouge pas jusqu'au
       prélèvement suivant, et arrondir absorbe les quelques secondes
       d'écart qu'un renvoi de Stripe pourrait porter — on ne veut pas
       qu'un compteur reparte parce qu'une date a frémi. */
    if (courant.actif && courant.expire) {
      return `p${Math.floor(Number(courant.expire) / 86400000)}`;
    }
    return moisCourant();
  }

  /**
   * Deux compteurs, parce qu'ils ne répondent pas à la même question :
   *
   *   `fiches` — combien sur la période en cours, pour un abonné dont le
   *              quota repart à chaque mois payé ;
   *   `total`  — combien depuis toujours, pour l'essai, qui ne repart
   *              jamais.
   *
   * Les enregistrements d'avant n'avaient que le mois : leur total se
   * déduit au mieux de ce mois-là, plutôt que de rendre deux fiches
   * gratuites à qui en a déjà fait trois.
   */
  function journal() {
    let brut = null;
    try { brut = JSON.parse(localStorage.getItem(CLE_CONSOMMATION) || "null"); }
    catch (erreur) { brut = null; }
    const fenetre = fenetreCourante();
    const duMois = Number(brut && brut.fiches) || 0;
    const total = Math.max(Number(brut && brut.total) || 0, duMois);
    if (brut && brut.mois === fenetre) return { mois: brut.mois, fiches: duMois, total };
    return { mois: fenetre, fiches: 0, total };
  }

  /** Combien de fiches sur la période en cours. */
  function consommation() { return journal().fiches; }

  /** Combien de fiches depuis l'ouverture du compte. C'est ce que mange l'essai. */
  function consommationTotale() { return journal().total; }

  /** Une fiche de plus. Appelé quand une fiche est bel et bien créée. */
  function noterFiche() {
    const suivi = journal();
    suivi.fiches += 1;
    suivi.total += 1;
    try { localStorage.setItem(CLE_CONSOMMATION, JSON.stringify(suivi)); }
    catch (erreur) { /* navigation privée : le compte vaut pour la session */ }
    return suivi.fiches;
  }

  function offres() { return CONFIG.offres.slice(); }

  /* ————— Ce que le serveur sait vraiment vendre ————————————————
     Une offre n'existe que si son identifiant de tarif est posé côté
     serveur. Les proposer toutes alors qu'un seul tarif est créé, c'est
     promettre deux portes qui s'ouvrent sur une erreur — et l'élève, lui,
     croit que l'app est cassée. /sante dit lesquelles sont en vente.
     ———————————————————————————————————————————————————————————— */
  let promesseSante = null;
  let enVente = null;                       // null : on ne sait pas encore

  function sante() {
    if (!CONFIG.api) return Promise.resolve(null);
    if (!promesseSante) {
      promesseSante = demander("/sante", { method: "GET" })
        .then((vue) => {
          enVente = vue && Array.isArray(vue.offres) && vue.offres.length ? vue.offres : null;
          return vue;
        })
        .catch(() => null);
    }
    return promesseSante;
  }

  /** Les offres vendables. Tant qu'on ne sait pas, on les montre toutes. */
  function offresEnVente() {
    if (!enVente) return offres();
    return offres().filter((offre) => enVente.indexOf(offre.cle) !== -1);
  }

  function offreParCle(cle) {
    return CONFIG.offres.filter((o) => o.cle === cle)[0] || null;
  }

  /** L'offre à laquelle l'élève a souscrit, telle que le serveur l'a dite. */
  function offreActive() {
    const courant = etat();
    if (!courant.actif) return null;
    /* Une licence d'avant les paliers, ou une offre retirée du catalogue :
       on ne bloque personne, on lui donne l'offre conseillée. */
    return offreParCle(courant.offre)
      || CONFIG.offres.filter((o) => o.conseille)[0]
      || CONFIG.offres[CONFIG.offres.length - 1];
  }

  /** L'abonnement est-il actif ? Une échéance dépassée ne compte plus. */
  function estIllimite() {
    const courant = etat();
    if (!courant.actif) return false;
    if (courant.expire && Date.now() > courant.expire) return false;
    return true;
  }

  /** Le paiement est-il seulement possible ici ? (serveur renseigné) */
  function estConfigure() { return Boolean(CONFIG.api); }

  /**
   * L'état du quota de fiches : combien il en reste, et si c'est atteint.
   * `dejaCreees` vient de la bibliothèque, seul endroit qui les compte.
   */
  function quotaFiches(dejaCreees) {
    /* Pas de mur sans porte : tant que le paiement n'est pas branché, on ne
       limite rien. Le jour où `api` est renseignée, la gratuité s'applique. */
    if (!estConfigure()) {
      return {
        illimite: true, max: Infinity, reste: Infinity, atteint: false, sansOffre: true,
        /* Rien n'est limité : un solde restant n'aurait aucun sens. On dit
           ce qui a été dépensé, qui est vrai dans tous les cas. */
        depenses: consommation() * CONFIG.creditsParFiche,
      };
    }

    if (estIllimite()) {
      const offre = offreActive();
      const faites = consommation();
      const reste = Math.max(offre.fiches - faites, 0);
      return {
        illimite: Boolean(offre.illimite),       // affiché comme sans limite
        abonne: true, offre, periode: "mois",
        max: offre.fiches, faites, reste, atteint: reste <= 0,
        credits: reste * CONFIG.creditsParFiche,
        creditsMax: offre.fiches * CONFIG.creditsParFiche,
      };
    }

    /* L'essai se compte une fois pour toutes, pas par mois : c'est un essai,
       pas une petite offre gratuite qui se recharge le 1er.

       On prend le plus grand des deux compteurs — les fiches créées depuis
       toujours, et celles encore en bibliothèque. Sans quoi en supprimer une
       rendrait un crédit, et l'essai n'aurait pas de fin. */
    const max = CONFIG.gratuit.fiches;
    const faites = Math.max(consommationTotale(), dejaCreees || 0);
    const reste = Math.max(max - faites, 0);
    return {
      illimite: false, abonne: false, essai: true, max, faites, reste, atteint: reste <= 0,
      credits: reste * CONFIG.creditsParFiche,
      creditsMax: max * CONFIG.creditsParFiche,
    };
  }

  /* ————— Le dialogue avec le serveur de paiement ————————————————— */

  async function demander(chemin, options) {
    if (!CONFIG.api) throw { code: "non_configure" };
    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), DELAI_RESEAU);
    try {
      const reponse = await fetch(`${CONFIG.api}${chemin}`, {
        ...options,
        signal: controleur.signal,
        headers: { "Content-Type": "application/json", ...(options && options.headers) },
      });
      if (!reponse.ok) {
        /* Le serveur nomme ce qui cloche (« portail_non_configure »…) :
           le dire à l'élève vaut mieux qu'un « erreur » pour tout. */
        let dit = null;
        try { dit = await reponse.json(); } catch (erreur) { dit = null; }
        const motif = (dit && dit.erreur) || "";
        throw { code: reponse.status === 404 ? "introuvable" : (motif || "serveur") };
      }
      return await reponse.json();
    } catch (erreur) {
      if (erreur && erreur.code) throw erreur;
      // Une page publiée peut être empêchée de joindre un autre domaine.
      throw { code: erreur && erreur.name === "AbortError" ? "delai" : "injoignable" };
    } finally {
      clearTimeout(minuteur);
    }
  }

  /**
   * Ouvre le paiement : le serveur crée la session Stripe et renvoie son
   * adresse. La page ne voit jamais la clé secrète.
   */
  async function ouvrirPaiement({ retour, offre } = {}) {
    const choisie = offreParCle(offre) || CONFIG.offres.filter((o) => o.conseille)[0] || CONFIG.offres[0];
    const donnees = await demander("/paiement", {
      method: "POST",
      body: JSON.stringify({
        appareil: appareil(),
        offre: choisie.cle,
        retour: retour || window.location.href.split("?")[0],
      }),
    });
    if (!donnees || !donnees.url) throw { code: "serveur" };
    return donnees.url;
  }

  /**
   * Ouvre le portail client de Stripe : résilier, changer de carte, lire
   * ses factures. C'est Stripe qui tient cet écran, à jour et complet ;
   * l'app n'a qu'à y conduire.
   */
  async function ouvrirPortail({ retour, entetes } = {}) {
    const courant = etat();
    const donnees = await demander("/portail", {
      method: "POST",
      headers: entetes || {},
      body: JSON.stringify({
        cle: courant.cle || "",
        retour: retour || window.location.href.split("?")[0],
      }),
    });
    if (!donnees || !donnees.url) throw { code: "serveur" };
    return donnees.url;
  }

  /** Au retour de Stripe : la session confirme (ou non) l'abonnement. */
  async function confirmerSession(session) {
    const donnees = await demander(`/licence?session=${encodeURIComponent(session)}`);
    return retenir(donnees);
  }

  /** Vérifie une licence déjà connue (retour sur l'app, autre appareil…). */
  async function verifierLicence(cle) {
    const donnees = await demander(`/licence?cle=${encodeURIComponent(cle)}`);
    return retenir(donnees);
  }

  /** Range ce que le serveur a répondu, sans jamais inventer un abonnement. */
  function retenir(donnees) {
    if (!donnees || typeof donnees !== "object" || !donnees.actif || !donnees.cle) {
      ecrire({ actif: false, cle: "", expire: 0, verifieLe: Date.now() });
      return false;
    }
    /* ————— Le mois commence au paiement, pas le 1er ————————————
       Le compteur comptait toutes les fiches du mois civil, essai compris.
       Un élève qui s'abonnait le 12, après avoir usé ses deux fiches
       d'essai, recevait 800 crédits sur les 1 000 qu'il venait de payer —
       et il avait raison de le prendre mal.

       C'est la fenêtre de comptage (voir `fenetreCourante`) qui règle ça :
       en rangeant la période payée que Stripe vient de dire, le compteur
       repart de lui-même, et seulement quand une période commence. Une
       revérification quotidienne, qui rend la même période, ne l'efface
       pas. Le total de toujours n'est pas touché : l'essai reste dépensé.
       ———————————————————————————————————————————————————————— */
    /* `depuis` date l'adoption de CETTE licence par cet appareil : c'est
       lui qui départage deux appareils d'un même compte quand ils ne
       portent pas la même (voir `licencePartagee`). Une revérification ne
       le bouge pas, sinon le dernier appareil allumé gagnerait toujours. */
    const avant = etat();
    const cle = String(donnees.cle).slice(0, 80);
    const memeLicence = avant && avant.actif && avant.cle === cle;

    ecrire({
      actif: true,
      cle,
      offre: String(donnees.offre || "").slice(0, 40),
      expire: Number(donnees.expire) || 0,
      depuis: memeLicence ? (Number(avant.depuis) || Date.now()) : Date.now(),
      verifieLe: Date.now(),
    });
    return true;
  }

  /**
   * Revérifie l'abonnement au plus une fois par jour. Hors ligne, on garde
   * l'accès jusqu'à l'échéance : c'est payé, ça ne doit pas sauter parce que
   * le réseau manque.
   */
  async function rafraichir() {
    const courant = etat();
    if (!courant.actif || !courant.cle || !CONFIG.api) return estIllimite();
    if (Date.now() - (courant.verifieLe || 0) < DELAI_VERIFICATION) return estIllimite();
    try {
      await verifierLicence(courant.cle);
    } catch (erreur) {
      // Injoignable : on ne coupe rien, on réessaiera demain.
      ecrire({ ...courant, verifieLe: Date.now() - DELAI_VERIFICATION + 3600000 });
    }
    return estIllimite();
  }

  /** L'élève se désabonne de cet appareil (le compte Stripe n'est pas touché). */
  function oublier() { ecrire(null); }

  /* ————— L'abonnement suit le compte ——————————————————————————
     Payer sur un téléphone et se retrouver devant le mur sur un autre,
     alors qu'on est connecté au même compte, n'a aucun sens pour l'élève.
     Ce qui voyage est l'identifiant client, rien d'autre : l'échéance et
     l'offre, c'est Stripe qui les redira à l'appareil qui l'adopte. Une
     licence trouvée dans le compte n'ouvre donc jamais l'accès à elle
     seule — elle est vérifiée, comme une clé saisie à la main.
     ———————————————————————————————————————————————————————————— */

  /** Ce que cet appareil peut apprendre aux autres. */
  function licencePartagee() {
    const courant = etat();
    if (!courant.actif || !courant.cle) return null;
    return { cle: courant.cle, depuis: Number(courant.depuis) || 0 };
  }

  /**
   * Adopte la licence du compte, si cet appareil n'a pas déjà la bonne.
   * Rend `true` si l'accès vient d'être ouvert ici.
   */
  async function adopterLicence(partagee) {
    if (!partagee || !partagee.cle || !CONFIG.api) return false;
    const courant = etat();
    if (courant.actif && courant.cle === partagee.cle) return false;
    try { return await verifierLicence(partagee.cle); }
    catch (erreur) { return false; }      // hors ligne : on réessaiera
  }

  /** La session de paiement présente dans l'adresse, au retour de Stripe. */
  function sessionDeRetour() {
    try {
      const parametres = new URLSearchParams(window.location.search);
      if (parametres.get("paiement") !== "ok") return null;
      return parametres.get("session") || null;
    } catch (erreur) { return null; }
  }

  /** Efface les paramètres de retour, pour que l'adresse reste propre. */
  function nettoyerAdresse() {
    try {
      if (!window.history || !window.history.replaceState) return;
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    } catch (erreur) { /* sans conséquence */ }
  }

  return {
    config, configure, appareil,
    offres, offresEnVente, sante, offreParCle, offreActive,
    creditsParFiche: () => CONFIG.creditsParFiche,
    creditsDe: (fiches) => fiches * CONFIG.creditsParFiche,
    consommation, consommationTotale, noterFiche, moisCourant,
    estIllimite, estConfigure, quotaFiches,
    ouvrirPaiement, ouvrirPortail, confirmerSession, verifierLicence, rafraichir, oublier,
    licencePartagee, adopterLicence,
    sessionDeRetour, nettoyerAdresse, etat,
  };
})();
