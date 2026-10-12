/* ==========================================================================
   Le compte : la même bibliothèque sur tous ses appareils
   --------------------------------------------------------------------------
   Les fiches vivent toujours dans le navigateur — l'app marche sans compte,
   hors connexion, exactement comme avant. Un compte ajoute une copie sur le
   serveur, et la recolle à l'identique sur le téléphone, la tablette et
   l'ordinateur.

   Le point délicat est la fusion. Deux appareils peuvent travailler en même
   temps, chacun sans savoir ce que l'autre a fait. Écraser l'un par l'autre
   ferait perdre une soirée de révision, alors on fusionne, avec trois
   règles qui tiennent sur une ligne chacune :

     - les fiches s'additionnent (jamais de perte) ; à même identifiant, on
       garde celle qui a été révisée le plus récemment ;
     - les compteurs (journal, série, record, crédits) prennent le maximum ;
     - une fiche supprimée laisse une pierre tombale, sinon elle reviendrait
       de l'autre appareil à la synchronisation suivante.

   Le serveur refuse une écriture fondée sur une version périmée (409) : on
   relit, on refusionne, on réessaie. C'est tout le protocole.
   ========================================================================== */

const COMPTE = (function () {
  "use strict";

  /* L'adresse du serveur se pose explicitement, comme pour le paiement :
     tant que la base et l'envoi de courriel ne sont pas branchés, cette
     ligne reste commentée dans app.html, aucun appel ne part, et le bloc
     « Mon accès » n'existe pas. Une porte qui n'ouvre pas reste fermée. */
  const CONFIG = {
    api: (window.MATHEMATIQUE_COMPTE && window.MATHEMATIQUE_COMPTE.api) || "",
  };

  const CLE_SESSION = "mathematique.session";
  const CLE_COURRIEL = "mathematique.courriel";
  const CLE_VERSION = "mathematique.version";
  const CLE_TOMBES = "mathematique.supprimees";

  /* Les clés de l'app qui voyagent. Pas `abonnement` ni `appareil` : une
     licence est liée à l'appareil et au compte Stripe, pas à la bibliothèque. */
  const CLES = {
    fiches: "mathematique.fiches",
    journal: "mathematique.journal",
    prenom: "mathematique.prenom",
    record: "mathematique.record",
    niveau: "mathematique.niveau",
    consommation: "mathematique.consommation",
  };

  const VIE_DES_TOMBES = 180 * 86400000;      // au-delà, plus personne ne les contredit
  const DELAI_ENVOI = 2500;                   // on laisse l'élève finir son geste

  let minuteur = null;
  let enCours = false;
  let abonnes = [];
  let dernierMessage = "";

  /* ————— Le petit magasin local ————————————————————————————————— */

  function lireBrut(cle, defaut) {
    try {
      const brut = localStorage.getItem(cle);
      return brut === null ? defaut : JSON.parse(brut);
    } catch (erreur) { return defaut; }
  }
  function ecrireBrut(cle, valeur) {
    try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch (erreur) { /* mémoire seule */ }
  }
  function lireTexte(cle) {
    try { return localStorage.getItem(cle) || ""; } catch (erreur) { return ""; }
  }
  function ecrireTexte(cle, valeur) {
    try {
      if (valeur) localStorage.setItem(cle, valeur);
      else localStorage.removeItem(cle);
    } catch (erreur) { /* mémoire seule */ }
  }

  function session() { return lireTexte(CLE_SESSION); }
  function courriel() { return lireTexte(CLE_COURRIEL); }
  function version() { return Number(lireTexte(CLE_VERSION)) || 0; }

  /** Tout ce qui voyage, lu d'un bloc. */
  function lireTout() {
    return {
      fiches: lireBrut(CLES.fiches, []) || [],
      journal: lireBrut(CLES.journal, {}) || {},
      consommation: lireBrut(CLES.consommation, null),
      prenom: lireTexte(CLES.prenom),
      niveau: lireTexte(CLES.niveau),
      record: Number(lireTexte(CLES.record)) || 0,
      supprimees: lireBrut(CLE_TOMBES, []) || [],
    };
  }

  /** Et réécrit d'un bloc, après fusion. */
  function ecrireTout(donnees) {
    ecrireBrut(CLES.fiches, donnees.fiches || []);
    ecrireBrut(CLES.journal, donnees.journal || {});
    if (donnees.consommation) ecrireBrut(CLES.consommation, donnees.consommation);
    if (donnees.prenom) ecrireTexte(CLES.prenom, donnees.prenom);
    if (donnees.niveau) ecrireTexte(CLES.niveau, donnees.niveau);
    if (donnees.record) ecrireTexte(CLES.record, String(donnees.record));
    ecrireBrut(CLE_TOMBES, donnees.supprimees || []);
  }

  /* ————— La fusion ——————————————————————————————————————————— */

  const dateDe = (fiche) => Math.max(
    Date.parse(fiche && fiche.derniereRevision) || 0,
    Date.parse(fiche && fiche.creee) || 0);

  function maxParCle(a, b) {
    const resultat = { ...(b || {}) };
    Object.keys(a || {}).forEach((cle) => {
      const gauche = Number(a[cle]) || 0;
      const droite = Number(resultat[cle]) || 0;
      resultat[cle] = Math.max(gauche, droite);
    });
    return resultat;
  }

  /** Les crédits du mois : le mois le plus récent gagne, sinon le plus dépensé. */
  function fusionnerConsommation(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    if (a.mois !== b.mois) return a.mois > b.mois ? a : b;
    return { mois: a.mois, fiches: Math.max(a.fiches || 0, b.fiches || 0) };
  }

  function fusionnerTombes(a, b) {
    const limite = Date.now() - VIE_DES_TOMBES;
    const parId = new Map();
    [...(a || []), ...(b || [])].forEach((tombe) => {
      if (!tombe || !tombe.id) return;
      const quand = Date.parse(tombe.le) || 0;
      if (quand < limite) return;
      const connue = parId.get(tombe.id);
      if (!connue || quand > (Date.parse(connue.le) || 0)) parId.set(tombe.id, tombe);
    });
    return [...parId.values()];
  }

  /**
   * Fusionne deux bibliothèques. L'ordre compte peu : seul le départage des
   * égalités prend `local` comme favori, parce que c'est l'appareil qu'on a
   * sous les yeux.
   */
  function fusionner(local, distant) {
    const ici = local || {};
    const ailleurs = distant || {};

    const parId = new Map();
    [...(ailleurs.fiches || []), ...(ici.fiches || [])].forEach((fiche) => {
      if (!fiche || !fiche.id) return;
      const connue = parId.get(fiche.id);
      if (!connue || dateDe(fiche) >= dateDe(connue)) parId.set(fiche.id, fiche);
    });

    /* Une fiche supprimée ne revient pas — sauf si elle a été révisée APRÈS
       sa suppression, auquel cas c'est la révision qui est la dernière
       volonté de l'élève. */
    const tombes = fusionnerTombes(ici.supprimees, ailleurs.supprimees);
    tombes.forEach((tombe) => {
      const fiche = parId.get(tombe.id);
      if (fiche && dateDe(fiche) <= (Date.parse(tombe.le) || 0)) parId.delete(tombe.id);
    });

    return {
      fiches: [...parId.values()],
      journal: maxParCle(ici.journal, ailleurs.journal),
      consommation: fusionnerConsommation(ici.consommation, ailleurs.consommation),
      prenom: ici.prenom || ailleurs.prenom || "",
      niveau: ici.niveau || ailleurs.niveau || "",
      record: Math.max(ici.record || 0, ailleurs.record || 0),
      supprimees: tombes,
    };
  }

  /** Deux bibliothèques se valent-elles ? Sert à ne pas réécrire pour rien. */
  function identiques(a, b) {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch (erreur) { return false; }
  }

  /* ————— Le réseau ———————————————————————————————————————————— */

  async function appeler(route, { methode = "GET", corps } = {}) {
    if (!CONFIG.api) throw new Error("comptes_eteints");
    const reponse = await fetch(`${CONFIG.api}${route}`, {
      method: methode,
      headers: {
        "Content-Type": "application/json",
        ...(session() ? { Authorization: `Bearer ${session()}` } : {}),
      },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
    let charge = null;
    try { charge = await reponse.json(); } catch (erreur) { charge = {}; }
    return { code: reponse.status, corps: charge || {} };
  }

  /** Ce que le serveur sait faire. Demandé une fois par onglet. */
  let promesseSante = null;
  function sante() {
    if (!CONFIG.api) return Promise.resolve({ comptes: false, google: "" });
    if (!promesseSante) {
      promesseSante = appeler("/sante")
        .then((vue) => ({
          comptes: Boolean(vue.corps && vue.corps.comptes),
          /* L'identifiant client Google est public par construction : il
             part dans la page, c'est son rôle. Ce qui est secret, c'est la
             vérification du jeton — et elle se fait sur le serveur. */
          google: (vue.corps && vue.corps.google) || "",
        }))
        .catch(() => ({ comptes: false, google: "" }));
    }
    return promesseSante;
  }

  function disponible() { return sante().then((etat) => etat.comptes); }

  /* ————— Entrer ——————————————————————————————————————————————— */

  async function demander(adresse) {
    const vue = await appeler("/compte-demander", { methode: "POST", corps: { courriel: adresse } });
    if (vue.code === 200) return { envoye: true };
    if (vue.code === 400) throw new Error("adresse_invalide");
    if (vue.code === 503) throw new Error("comptes_eteints");
    throw new Error((vue.corps && vue.corps.erreur) || "envoi_impossible");
  }

  /* ————— Entrer avec Google ——————————————————————————————————
     Le script de Google n'est chargé que si un identifiant client existe :
     tant que ce n'est pas branché, aucun élève n'est présenté à Google.
     ———————————————————————————————————————————————————————————— */

  let promesseScriptGoogle = null;
  function chargerGoogle() {
    if (window.google && window.google.accounts) return Promise.resolve();
    if (!promesseScriptGoogle) {
      promesseScriptGoogle = new Promise((suite, echec) => {
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.onload = () => suite();
        script.onerror = () => echec(new Error("google_injoignable"));
        document.head.appendChild(script);
      });
    }
    return promesseScriptGoogle;
  }

  async function entrerAvecGoogle(jeton) {
    const vue = await appeler("/compte-google", { methode: "POST", corps: { jeton } });
    if (vue.code !== 200) throw new Error((vue.corps && vue.corps.erreur) || "google_refuse");
    ecrireTexte(CLE_SESSION, vue.corps.session);
    ecrireTexte(CLE_COURRIEL, vue.corps.courriel || "");
    ecrireTexte(CLE_VERSION, "0");
    return vue.corps;
  }

  /**
   * Pose le bouton de Google dans `hote`, et prévient `ensuite(erreur)` une
   * fois l'élève entré. Rend `false` si Google n'est pas branché : l'appelant
   * garde alors sa mise en page sans trou.
   */
  function boutonGoogle(hote, ensuite) {
    if (!hote) return Promise.resolve(false);
    return sante().then((etat) => {
      if (!etat.google) return false;
      return chargerGoogle().then(() => {
        window.google.accounts.id.initialize({
          client_id: etat.google,
          callback: (reponse) => {
            entrerAvecGoogle(reponse && reponse.credential)
              .then(() => ensuite(null))
              .catch((erreur) => ensuite(erreur));
          },
        });
        window.google.accounts.id.renderButton(hote, {
          theme: "outline", size: "large", text: "continue_with",
          shape: "pill", locale: "fr", logo_alignment: "center",
          width: Math.max(220, Math.min(380, hote.clientWidth || 300)),
        });
        return true;
      }).catch(() => false);
    });
  }

  /**
   * Le lien du courriel ramène ici avec ?acces=… : on le range, on nettoie
   * l'adresse (elle traînerait dans l'historique), et on se présente.
   */
  function ramasserSession() {
    let parametres;
    try { parametres = new URLSearchParams(window.location.search); } catch (erreur) { return null; }

    /* « acces » et pas « session » : le retour de Stripe utilise déjà
       ?paiement=ok&session=cs_… — se partager un nom de paramètre, c'est
       se voler la session l'un l'autre. */
    const jeton = parametres.get("acces");
    const souci = parametres.get("entree");
    if (!jeton && !souci) return null;

    if (jeton) {
      ecrireTexte(CLE_SESSION, jeton);
      ecrireTexte(CLE_VERSION, "0");        // on ne sait pas encore où en est le serveur
    }
    nettoyerAdresse();
    return jeton ? { entre: true } : { erreur: souci };
  }

  function nettoyerAdresse() {
    try {
      if (!window.history || !window.history.replaceState) return;
      const adresse = new URL(window.location.href);
      ["acces", "entree"].forEach((cle) => adresse.searchParams.delete(cle));
      window.history.replaceState({}, "", adresse.pathname + adresse.search + adresse.hash);
    } catch (erreur) { /* sans conséquence */ }
  }

  /* ————— Synchroniser ———————————————————————————————————————— */

  function prevenir() { abonnes.forEach((fn) => { try { fn(); } catch (erreur) { /* rien */ } }); }

  /**
   * Un aller-retour complet : on lit le serveur, on fusionne, on réécrit
   * localement si besoin, puis on renvoie le résultat. Si un autre appareil
   * a écrit entre-temps (409), on refait le tour une fois.
   */
  async function synchroniser({ essai = 0 } = {}) {
    if (!session()) return { etat: "dehors" };
    if (enCours) return { etat: "deja" };
    enCours = true;
    try {
      const lu = await appeler("/bibliotheque");
      if (lu.code === 401) { oublierSession(); return { etat: "session_perdue" }; }
      if (lu.code === 503) return { etat: "eteint" };
      if (lu.code !== 200) return { etat: "panne" };

      ecrireTexte(CLE_COURRIEL, lu.corps.courriel || courriel());

      const local = lireTout();
      const fusionnee = fusionner(local, lu.corps.donnees || {});
      if (!identiques(local, fusionnee)) { ecrireTout(fusionnee); prevenir(); }

      const ecrit = await appeler("/bibliotheque", {
        methode: "PUT", corps: { version: lu.corps.version, donnees: fusionnee },
      });

      if (ecrit.code === 200) {
        ecrireTexte(CLE_VERSION, String(ecrit.corps.version));
        return { etat: "a-jour", quand: Date.now() };
      }
      if (ecrit.code === 409 && essai < 1) {
        enCours = false;
        return synchroniser({ essai: essai + 1 });
      }
      if (ecrit.code === 413) return { etat: "trop-gros" };
      return { etat: "panne" };
    } catch (erreur) {
      return { etat: "hors-ligne" };
    } finally {
      enCours = false;
    }
  }

  /** Après un changement : on attend quelques secondes, puis on envoie. */
  function pousser() {
    if (!session()) return;
    clearTimeout(minuteur);
    minuteur = setTimeout(() => { synchroniser().then(montrerEtat); }, DELAI_ENVOI);
  }

  function noterSuppression(id) {
    if (!id) return;
    const tombes = lireBrut(CLE_TOMBES, []) || [];
    tombes.push({ id, le: new Date().toISOString() });
    ecrireBrut(CLE_TOMBES, fusionnerTombes(tombes, []));
    pousser();
  }

  function oublierSession() {
    ecrireTexte(CLE_SESSION, "");
    ecrireTexte(CLE_VERSION, "");
  }

  async function sortir() {
    try { await appeler("/compte-sortir", { methode: "POST" }); } catch (erreur) { /* tant pis */ }
    oublierSession();
    ecrireTexte(CLE_COURRIEL, "");
    return true;
  }

  async function effacer() {
    const vue = await appeler("/compte-effacer", { methode: "DELETE" });
    if (vue.code !== 200) throw new Error((vue.corps && vue.corps.erreur) || "effacement_impossible");
    oublierSession();
    ecrireTexte(CLE_COURRIEL, "");
    return true;
  }

  async function exporter() {
    const vue = await appeler("/compte-export");
    if (vue.code !== 200) throw new Error("export_impossible");
    return vue.corps;
  }

  /* ————— Le bloc « Mon accès », dans le profil ————————————————— */

  const $ = (sel) => document.querySelector(sel);

  function message(texte, duree = 6000) {
    const el = $("#compte-message");
    if (!el) return;
    dernierMessage = texte;
    el.textContent = texte;
    el.hidden = !texte;
    if (texte && duree) {
      setTimeout(() => { if (dernierMessage === texte) { el.hidden = true; el.textContent = ""; } }, duree);
    }
  }

  function montrerEtat(resultat) {
    const el = $("#compte-etat");
    if (!el || !resultat) return;
    const quand = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const phrases = {
      "a-jour": `Tes fiches sont à jour (${quand}).`,
      "hors-ligne": "Hors connexion : tes fiches partiront dès que le réseau reviendra.",
      "panne": "Le serveur n'a pas répondu. Tes fiches restent sur cet appareil.",
      "trop-gros": "Ta bibliothèque dépasse la taille qu'on peut garder. Supprime quelques fiches.",
      "session_perdue": "Ta session a expiré : redemande un lien.",
      "eteint": "Les comptes ne sont pas encore ouverts.",
    };
    el.textContent = phrases[resultat.etat] || "";
    if (resultat.etat === "session_perdue") peindre();
  }

  /** Affiche le bon visage : le formulaire, ou le compte connecté. */
  function peindre() {
    const bloc = $("#profil-compte");
    if (!bloc) return;
    const dedans = Boolean(session());
    const champDehors = $("#compte-dehors");
    const champDedans = $("#compte-dedans");
    if (champDehors) champDehors.hidden = dedans;
    if (champDedans) champDedans.hidden = !dedans;
    const adresse = $("#compte-adresse");
    if (adresse) adresse.textContent = courriel() || "Compte ouvert";
  }

  function brancher() {
    const bloc = $("#profil-compte");
    if (!bloc) return;

    /* On ne montre la porte que si elle ouvre : tant que le serveur n'a pas
       de base ni d'envoi de courriel, le bloc reste absent.

       Mais on ne le demande qu'au moment où l'élève ouvre son profil. Poser
       la question au chargement, c'était un appel réseau à chaque ouverture
       de l'app — y compris pour les trois quarts des élèves qui ne verront
       jamais cette page, et y compris dans le métro sans réseau. */
    function consulter() {
      disponible().then((pret) => {
        bloc.hidden = !pret && !session();
        if (pret || session()) peindre();
      });
    }

    const profil = document.getElementById("vue-profil");
    if (profil && "IntersectionObserver" in window) {
      /* Une vue masquée n'a pas de boîte : l'observateur ne se déclenche
         qu'au moment où le profil s'affiche pour de bon. */
      const oeil = new IntersectionObserver((entrees) => {
        if (entrees.some((e) => e.isIntersecting)) { oeil.disconnect(); consulter(); }
      });
      oeil.observe(profil);
    } else {
      document.querySelectorAll('[data-onglet="profil"]').forEach((bouton) => {
        bouton.addEventListener("click", consulter, { once: true });
      });
    }

    /* Google au-dessus du champ : un élève qui a un compte Google entre en
       un geste, et n'a pas à aller chercher un courriel qui peut tomber
       dans les indésirables. */
    boutonGoogle($("#compte-google"), (erreur) => {
      if (erreur) { message("Google n'a pas pu te faire entrer. Essaie avec ton adresse."); return; }
      peindre();
      message("Te voilà entré.");
      synchroniser().then(montrerEtat);
    }).then((pose) => {
      const separateur = $("#compte-ou");
      if (separateur) separateur.hidden = !pose;
    });

    const formulaire = $("#compte-form");
    if (formulaire) {
      formulaire.addEventListener("submit", async (evenement) => {
        evenement.preventDefault();
        const champ = $("#compte-courriel");
        const bouton = $("#compte-envoyer");
        const adresse = (champ.value || "").trim();
        if (!adresse) return;
        bouton.disabled = true;
        bouton.textContent = "Envoi…";
        try {
          await demander(adresse);
          message(`C'est parti : regarde ta boîte, le lien arrive à ${adresse}. Il vaut 20 minutes.`, 0);
          formulaire.hidden = true;
        } catch (erreur) {
          const quoi = String(erreur.message || erreur);
          message(quoi === "adresse_invalide"
            ? "Cette adresse ne ressemble pas à une adresse e-mail."
            : quoi === "comptes_eteints"
              ? "Les comptes ne sont pas encore ouverts sur ce site."
              : "L'envoi a échoué. Réessaie dans un instant.");
        } finally {
          bouton.disabled = false;
          bouton.textContent = "Recevoir mon lien";
        }
      });
    }

    const synchro = $("#compte-synchro");
    if (synchro) {
      synchro.addEventListener("click", async () => {
        synchro.disabled = true;
        montrerEtat(await synchroniser());
        synchro.disabled = false;
      });
    }

    const partir = $("#compte-sortir");
    if (partir) {
      partir.addEventListener("click", async () => {
        await sortir();
        peindre();
        message("Déconnecté. Tes fiches restent sur cet appareil.");
      });
    }

    const telecharger = $("#compte-exporter");
    if (telecharger) {
      telecharger.addEventListener("click", async () => {
        try {
          const tout = await exporter();
          const lien = document.createElement("a");
          lien.href = URL.createObjectURL(new Blob([JSON.stringify(tout, null, 2)], { type: "application/json" }));
          lien.download = "mathematique-mes-donnees.json";
          lien.click();
          URL.revokeObjectURL(lien.href);
        } catch (erreur) { message("Le téléchargement a échoué. Réessaie."); }
      });
    }

    /* Supprimer son compte demande deux gestes : le premier arme, le second
       exécute. Un seul clic sur un bouton rouge, ça arrive par accident. */
    const supprimer = $("#compte-effacer");
    if (supprimer) {
      let arme = null;
      supprimer.addEventListener("click", async () => {
        if (!arme) {
          supprimer.textContent = "Confirmer la suppression";
          supprimer.classList.add("bouton-texte--arme");
          arme = setTimeout(() => {
            arme = null;
            supprimer.textContent = "Supprimer mon compte";
            supprimer.classList.remove("bouton-texte--arme");
          }, 6000);
          return;
        }
        clearTimeout(arme);
        arme = null;
        supprimer.textContent = "Supprimer mon compte";
        supprimer.classList.remove("bouton-texte--arme");
        try {
          await effacer();
          peindre();
          message("Compte supprimé. Il ne reste rien de toi sur le serveur ; tes fiches sont toujours sur cet appareil.", 0);
        } catch (erreur) { message("La suppression a échoué. Réessaie."); }
      });
    }
  }

  /* ————— Démarrage ——————————————————————————————————————————— */

  function demarrer() {
    const arrivee = ramasserSession();
    brancher();
    /* Déjà entré : on n'a pas besoin de demander au serveur s'il veut bien
       des comptes, la réponse est dans la poche. */
    if (session()) {
      const bloc = $("#profil-compte");
      if (bloc) bloc.hidden = false;
      peindre();
    }

    if (arrivee && arrivee.erreur) {
      const phrases = {
        lien_expire: "Ce lien a expiré. Demande-s'en un autre, c'est immédiat.",
        lien_deja_utilise: "Ce lien a déjà servi. Demande-s'en un autre.",
        lien_inconnu: "Ce lien n'est pas valable. Demande-s'en un autre.",
      };
      message(phrases[arrivee.erreur] || "L'entrée a échoué. Redemande un lien.", 0);
    }

    if (session()) {
      synchroniser().then((resultat) => {
        montrerEtat(resultat);
        if (arrivee && arrivee.entre && resultat.etat === "a-jour") {
          message("Te voilà entré : tes fiches te suivront d'un appareil à l'autre.");
        }
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer);
  else demarrer();

  return {
    disponible, sante, boutonGoogle, entrerAvecGoogle,
    demander, synchroniser, pousser, noterSuppression,
    sortir, effacer, exporter, peindre,
    connecte: () => Boolean(session()),
    courriel,
    surChangement: (fn) => { if (typeof fn === "function") abonnes.push(fn); },
    /* exposés pour les tests */
    __fusionner: fusionner, __lireTout: lireTout, __ecrireTout: ecrireTout,
  };
})();
