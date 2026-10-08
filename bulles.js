/* ==========================================================================
   Les bulles d'activité
   --------------------------------------------------------------------------
   De petites cartes qui glissent en bas de l'écran, s'attardent, puis
   s'effacent.

   Elles ne disent QUE des choses vraies, tirées du travail de l'élève :
   « 3 fiches créées cette semaine », « ton record : 14 cartes d'affilée ».
   Ce module ne sait rien inventer — il reçoit des faits déjà établis et se
   contente de les mettre en scène. C'est voulu : un module d'animation qui
   saurait fabriquer ses propres messages finirait tôt ou tard par en
   fabriquer de faux.

   Trois retenues, parce qu'une bulle qui s'impose agace plus qu'elle ne
   motive :
     - rien pendant une révision (flashcards, quiz) : on ne coupe pas
       quelqu'un qui se concentre ;
     - rien quand l'onglet est en arrière-plan ;
     - rien de plus à dire → on s'arrête, au lieu de tourner en rond.
   ========================================================================== */

const BULLES = (function () {
  "use strict";

  const PREMIER_DELAI = 9000;          // le temps d'arriver sur la page
  const ENTRE_DEUX = [22000, 38000];   // irrégulier : un métronome se repère
  const DUREE = 6000;                  // ce qu'une bulle reste à l'écran
  const VUES_SILENCIEUSES = ["flashcards", "quiz", "scan"];

  let conteneur = null;
  let minuteur = null;
  let fournisseur = null;
  let dejaDits = [];
  let enMarche = false;

  function animationsBienvenues() {
    try {
      return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (erreur) { return true; }
  }

  function vueSilencieuse() {
    return VUES_SILENCIEUSES.some((nom) => {
      const vue = document.getElementById(`vue-${nom}`);
      return vue && !vue.hidden;
    });
  }

  function creerConteneur() {
    if (conteneur) return conteneur;
    conteneur = document.createElement("div");
    conteneur.className = "bulles";
    /* Ni rôle d'alerte ni focus : c'est un décor informatif, il ne doit pas
       interrompre un lecteur d'écran au milieu d'une phrase. */
    conteneur.setAttribute("aria-live", "polite");
    conteneur.setAttribute("aria-atomic", "false");
    document.body.appendChild(conteneur);
    return conteneur;
  }

  /** Un fait qu'on n'a pas déjà montré, tant qu'il en reste. */
  function prochainFait() {
    const faits = (fournisseur ? fournisseur() : []).filter((f) => f && f.texte);
    if (!faits.length) return null;
    const neufs = faits.filter((f) => dejaDits.indexOf(f.texte) === -1);
    if (!neufs.length) return null;          // tout a été dit : on se tait
    return neufs[Math.floor(Math.random() * neufs.length)];
  }

  function montrer(fait) {
    const boite = creerConteneur();
    const bulle = document.createElement("article");
    bulle.className = "bulle";
    bulle.innerHTML = `<span class="bulle-icone" aria-hidden="true">${fait.icone || "✦"}</span>`
      + `<span class="bulle-texte"></span>`;
    bulle.querySelector(".bulle-texte").textContent = fait.texte;
    boite.appendChild(bulle);

    // Une frame d'écart, sinon la transition d'entrée ne se joue pas.
    requestAnimationFrame(() => bulle.classList.add("bulle--entree"));

    setTimeout(() => {
      bulle.classList.remove("bulle--entree");
      bulle.classList.add("bulle--sortie");
      setTimeout(() => bulle.remove(), 500);
    }, DUREE);

    dejaDits.push(fait.texte);
  }

  function programmer(delai) {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => {
      if (!enMarche) return;
      /* Onglet caché ou élève en pleine révision : on repasse plus tard
         sans rien dépenser. */
      if (document.hidden || vueSilencieuse()) { programmer(12000); return; }
      const fait = prochainFait();
      if (!fait) { enMarche = false; return; }
      montrer(fait);
      programmer(ENTRE_DEUX[0] + Math.random() * (ENTRE_DEUX[1] - ENTRE_DEUX[0]));
    }, delai);
  }

  /** `donneDesFaits` doit rendre un tableau de { icone, texte } déjà vérifiés. */
  function demarrer(donneDesFaits) {
    if (typeof donneDesFaits !== "function") return;
    fournisseur = donneDesFaits;
    if (!animationsBienvenues()) return;     // réglage système : on n'insiste pas
    enMarche = true;
    programmer(PREMIER_DELAI);
  }

  function arreter() {
    enMarche = false;
    clearTimeout(minuteur);
    if (conteneur) conteneur.innerHTML = "";
  }

  /** Une nouvelle activité peut relancer des bulles qui s'étaient tues. */
  function reveiller() {
    if (enMarche || !fournisseur || !animationsBienvenues()) return;
    if (!prochainFait()) return;
    enMarche = true;
    programmer(ENTRE_DEUX[0]);
  }

  return {
    demarrer, arreter, reveiller,
    __montrer: montrer, __prochainFait: prochainFait,
    /* Ce que le module a le droit de dire, à cet instant : la prise par
       laquelle les tests vérifient qu'il ne dit rien d'autre. */
    __faits: () => (fournisseur ? fournisseur() : []),
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = BULLES;
