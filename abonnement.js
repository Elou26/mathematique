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
    api: "",                                  // ex. « https://mathematique-paiement.vercel.app »
    prix: "3,99 €",
    periode: "par mois",
    essai: "",                                // ex. « 7 jours offerts »
    gratuit: { fiches: 3 },                   // ce que la version gratuite permet
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
    const max = CONFIG.gratuit.fiches;
    /* Pas de mur sans porte : tant que le paiement n'est pas branché, on ne
       limite rien. Le jour où `api` est renseignée, la gratuité s'applique. */
    if (!estConfigure()) return { illimite: true, max: Infinity, reste: Infinity, atteint: false, sansOffre: true };
    if (estIllimite()) return { illimite: true, max: Infinity, reste: Infinity, atteint: false };
    const reste = Math.max(max - (dejaCreees || 0), 0);
    return { illimite: false, max, reste, atteint: reste <= 0 };
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
      if (!reponse.ok) throw { code: reponse.status === 404 ? "introuvable" : "serveur" };
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
  async function ouvrirPaiement({ retour } = {}) {
    const donnees = await demander("/paiement", {
      method: "POST",
      body: JSON.stringify({
        appareil: appareil(),
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
    ecrire({
      actif: true,
      cle: String(donnees.cle).slice(0, 80),
      expire: Number(donnees.expire) || 0,
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
    estIllimite, estConfigure, quotaFiches,
    ouvrirPaiement, confirmerSession, verifierLicence, rafraichir, oublier,
    sessionDeRetour, nettoyerAdresse, etat,
  };
})();
