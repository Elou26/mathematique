/* ==========================================================================
   La vitrine — ce qui bouge sur la page d'accueil publique
   --------------------------------------------------------------------------
   Trois choses, pas une de plus :

   1. Les formules sont écrites depuis abonnement.js, jamais recopiées dans
      la page. Un prix qui vit à deux endroits finit par différer de
      lui-même, et c'est l'élève qui le découvre au moment de payer.
   2. Celui qui a déjà des fiches n'est pas un prospect : on lui propose de
      reprendre, au lieu de lui vendre ce qu'il utilise déjà.
   3. Le rappel du bas apparaît une fois l'accroche passée, et disparaît
      quand elle revient — deux boutons identiques à l'écran ne font pas
      deux chances, ils font du bruit.

   Rien n'est écrit sur l'appareil depuis cette page : elle lit, elle ne
   touche pas à la bibliothèque de l'élève.
   ========================================================================== */

(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  /* ————— Les formules ———————————————————————————————————————— */

  function ecrireOffres() {
    const hote = $("#offres");
    if (!hote || typeof ABONNEMENT === "undefined") return;

    const offres = ABONNEMENT.offres();
    const parFiche = ABONNEMENT.creditsParFiche();
    /* Le paiement est branché, ou il ne l'est pas. Dans le second cas la
       page le dit et n'envoie personne sur un mur : le bouton ramène à
       l'app, qui est gratuite et sans limite tant que Stripe dort. */
    const ouvert = ABONNEMENT.estConfigure();

    const chiffre = $("#credits-par-fiche");
    if (chiffre) chiffre.textContent = String(parFiche);

    const encart = $("#encart-gratuit");
    if (encart) encart.hidden = ouvert;

    hote.textContent = "";
    offres.forEach((offre) => {
      const credits = (offre.fiches * parFiche).toLocaleString("fr-FR");
      const carte = document.createElement("article");
      carte.className = "offre" + (offre.conseille ? " offre--conseille" : "");
      carte.innerHTML = `
        ${offre.conseille ? '<span class="offre-ruban">Conseillé</span>' : ""}
        <p class="offre-nom">${offre.nom}</p>
        <p class="offre-prix">${offre.prix}<span> ${offre.periode}</span></p>
        <p class="offre-volume">${offre.fiches} fiches par mois</p>
        <p class="offre-credits">soit ${credits} crédits</p>
        <p class="offre-argument">${offre.argument}</p>
        <a class="bouton ${offre.conseille ? "bouton--principal" : "bouton--creux"}"
           href="${ouvert ? "app.html?vue=abonnement" : "app.html?vue=scan"}">
          ${ouvert ? `Choisir ${offre.nom}` : "Commencer gratuitement"}
        </a>`;
      hote.appendChild(carte);
    });
  }

  /* ————— Celui qui revient ——————————————————————————————————— */

  function compterLesFiches() {
    try {
      const brut = localStorage.getItem("mathematique.fiches");
      const lues = brut ? JSON.parse(brut) : [];
      return Array.isArray(lues) ? lues.length : 0;
    } catch (erreur) { return 0; }
  }

  function saluerLeRetour() {
    const bande = $("#retour-band");
    const texte = $("#retour-texte");
    if (!bande || !texte) return;

    const combien = compterLesFiches();
    if (!combien) return;                   // premier passage : rien à dire

    texte.textContent = combien === 1
      ? "Tu as déjà une fiche qui t'attend."
      : `Tu as déjà ${combien} fiches qui t'attendent.`;
    bande.hidden = false;
  }

  /* ————— Le rappel du bas ————————————————————————————————————— */

  function suivreLAccroche() {
    const rappel = $("#rappel");
    const accroche = $(".hero-actions");
    if (!rappel || !accroche) return;

    if (!("IntersectionObserver" in window)) return;   // vieux navigateur : pas de rappel
    const oeil = new IntersectionObserver((entrees) => {
      entrees.forEach((entree) => { rappel.hidden = entree.isIntersecting; });
    }, { rootMargin: "-10px 0px 0px 0px" });
    oeil.observe(accroche);
  }

  function demarrer() {
    ecrireOffres();
    saluerLeRetour();
    suivreLAccroche();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", demarrer);
  } else {
    demarrer();
  }
})();
