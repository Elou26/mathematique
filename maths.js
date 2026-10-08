/* ==========================================================================
   Le rendu des formules
   --------------------------------------------------------------------------
   Une fiche de maths arrive avec ses formules en LaTeX : « $\int_a^b f$ ».
   Affichée telle quelle, elle est illisible — pire qu'absente, parce que
   l'élève croit réviser et ne révise rien.

   KaTeX est embarqué dans maths/ (pas de CDN : le site doit marcher quelle
   que soit la page qui l'héberge, et une formule ne doit pas dépendre d'un
   serveur tiers).

   On observe la page plutôt que d'appeler le rendu depuis chaque vue : il y
   a une douzaine d'endroits qui écrivent du contenu, et celui qu'on
   oublierait afficherait du LaTeX brut sans que personne s'en aperçoive.
   ========================================================================== */

const MATHS = (function () {
  "use strict";

  const DELIMITEURS = [
    { left: "$$", right: "$$", display: true },
    { left: "$", right: "$", display: false },
    { left: "\\(", right: "\\)", display: false },
    { left: "\\[", right: "\\]", display: true },
  ];

  function pret() {
    return typeof window !== "undefined"
      && typeof window.renderMathInElement === "function"
      && typeof window.katex !== "undefined";
  }

  /** Vrai si le nœud contient quelque chose qui ressemble à du LaTeX. */
  function porteDesFormules(element) {
    const texte = element && element.textContent;
    return Boolean(texte) && (texte.indexOf("$") !== -1 || texte.indexOf("\\(") !== -1);
  }

  function rendre(racine) {
    const cible = racine || (typeof document !== "undefined" ? document.body : null);
    if (!cible || !pret() || !porteDesFormules(cible)) return false;
    try {
      window.renderMathInElement(cible, {
        delimiters: DELIMITEURS,
        /* Sans cela, le rendu se relirait lui-même à chaque passage. */
        ignoredClasses: ["katex", "katex-display"],
        /* Une formule mal écrite s'affiche en rouge, elle n'arrête pas la page :
           une fiche à moitié rendue vaut mieux qu'une page blanche. */
        throwOnError: false,
        errorColor: "#B4232C",
      });
      return true;
    } catch (erreur) {
      return false;                        // jamais au prix de la page
    }
  }

  function surveiller() {
    if (typeof MutationObserver === "undefined" || typeof document === "undefined") return;
    let prevu = false;
    const observateur = new MutationObserver(() => {
      if (prevu) return;
      prevu = true;
      /* Groupé sur une frame : une vue qui se construit déclenche des
         dizaines de mutations, et on ne veut qu'un rendu. */
      window.requestAnimationFrame(() => { prevu = false; rendre(document.body); });
    });
    observateur.observe(document.body, { childList: true, subtree: true });
    rendre(document.body);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", surveiller);
    else surveiller();
  }

  return { rendre, pret, __porteDesFormules: porteDesFormules };
})();

if (typeof module !== "undefined" && module.exports) module.exports = MATHS;
