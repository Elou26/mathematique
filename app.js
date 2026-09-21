/* ==========================================================================
   Mathématique — logique de l'interface mobile
   ========================================================================== */

(function () {
  "use strict";

  const $ = (sel, racine = document) => racine.querySelector(sel);
  const $$ = (sel, racine = document) => Array.from(racine.querySelectorAll(sel));

  const JOUR_MS = 86400000;
  const formatDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  const formatCourt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  /** Minuit du jour donné, pour compter des jours pleins sans dérive horaire. */
  function minuit(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function joursEntre(debut, fin) {
    return Math.max(0, Math.round((minuit(fin) - minuit(debut)) / JOUR_MS));
  }

  function accordJours(n) {
    return n <= 1 ? `${n} jour de révision` : `${n} jours de révision`;
  }

  function nombreMembres(n) {
    if (n < 1000) return `${n} membres`;
    const milliers = Math.floor(n / 100) / 10;   // 3970 → 3,9 k (jamais arrondi au-dessus)
    return `${String(milliers).replace(".", ",")} k membres`;
  }

  /* ————— Cartes « Mes révisions » ————————————————————————————— */

  function carteCours(cours) {
    const jours = joursEntre(cours.premierJour, new Date());
    const carte = document.createElement("article");
    carte.className = "carte-cours";
    carte.innerHTML = `
      <div class="carte-entete">
        <h3 class="carte-titre">${cours.titre}</h3>
        <span class="carte-jours">${accordJours(jours)}</span>
      </div>
      <p class="carte-date">Dernière révision : ${formatDate.format(new Date(cours.derniereRevision))}</p>
      <div class="barre-progression" role="progressbar" aria-valuemin="0" aria-valuemax="100"
           aria-valuenow="${cours.progression}" aria-label="Progression de ${cours.titre}">
        <div class="barre-progression-remplie"></div>
      </div>
      <p class="barre-legende">${cours.chapitre} · ${cours.progression} % maîtrisé</p>
      <button class="bouton-reviser" type="button">Réviser maintenant</button>
    `;

    $(".bouton-reviser", carte).addEventListener("click", () => {
      toast(`Séance lancée : ${cours.titre}`);
    });

    // Remplissage animé au moment de l'affichage.
    requestAnimationFrame(() => {
      $(".barre-progression-remplie", carte).style.width = `${cours.progression}%`;
    });

    return carte;
  }

  function rendreCours(conteneur, liste) {
    if (!conteneur) return;
    conteneur.textContent = "";
    liste.forEach((cours) => conteneur.appendChild(carteCours(cours)));
  }

  /* ————— Listes communauté / défis ———————————————————————————— */

  function ligne({ pastille, nom, detail, onClick }) {
    const li = document.createElement("li");
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "ligne";
    bouton.innerHTML = `
      <span class="ligne-pastille">${pastille}</span>
      <span class="ligne-texte">
        <span class="ligne-nom">${nom}</span>
        <span class="ligne-detail">${detail}</span>
      </span>
      <svg class="ligne-fleche" aria-hidden="true"><use href="#i-fleche"></use></svg>
    `;
    bouton.addEventListener("click", onClick);
    li.appendChild(bouton);
    return li;
  }

  function rendreCommunautes(conteneur) {
    if (!conteneur) return;
    conteneur.textContent = "";
    COMMUNAUTES.forEach((c) => {
      conteneur.appendChild(ligne({
        pastille: c.emoji,
        nom: c.nom,
        detail: nombreMembres(c.membres),
        onClick: () => toast(`Communauté rejointe : ${c.nom}`),
      }));
    });
  }

  function rendreDefis(conteneur) {
    if (!conteneur) return;
    conteneur.textContent = "";
    DEFIS.forEach((d) => {
      conteneur.appendChild(ligne({
        pastille: '<svg aria-hidden="true"><use href="#i-epee"></use></svg>',
        nom: d.nom,
        detail: `${d.detail} · +${d.xp} XP`,
        onClick: () => toast(`Défi accepté : ${d.nom}`),
      }));
    });
  }

  /* ————— Révision espacée ————————————————————————————————————— */

  function rendreEcheances(conteneur) {
    if (!conteneur) return;
    conteneur.textContent = "";
    REVISION_ESPACEE.forEach((e) => {
      const date = new Date(e.echeance);
      const ecart = joursEntre(new Date(), date);
      const quand = e.etat === "aujourdhui" ? "À revoir aujourd'hui"
                  : ecart === 1 ? "Demain"
                  : `Dans ${ecart} jours · ${formatCourt.format(date)}`;

      const bloc = document.createElement("div");
      bloc.className = `echeance echeance--${e.etat}`;
      bloc.innerHTML = `
        <span class="echeance-palier">${e.palier}</span>
        <span class="ligne-texte">
          <span class="echeance-titre">${e.titre}</span>
          <span class="echeance-detail">${quand}</span>
        </span>
        <svg class="ligne-fleche" aria-hidden="true"><use href="#i-horloge"></use></svg>
      `;
      conteneur.appendChild(bloc);
    });
  }

  /* ————— Navigation entre vues ———————————————————————————————— */

  const VUES = ["accueil", "cours", "communaute", "profil", "revision"];

  function afficherVue(nom) {
    if (!VUES.includes(nom)) nom = "accueil";

    VUES.forEach((v) => {
      const vue = document.getElementById(`vue-${v}`);
      if (!vue) return;
      const actif = v === nom;
      vue.hidden = !actif;
      vue.classList.toggle("vue--active", actif);
    });

    // La révision espacée n'a pas d'onglet dédié : on garde « Accueil » allumé.
    const ongletActif = nom === "revision" ? "accueil" : nom;
    $$(".barre-bas .onglet").forEach((onglet) => {
      const actif = onglet.dataset.onglet === ongletActif;
      onglet.classList.toggle("onglet--actif", actif);
      if (actif) onglet.setAttribute("aria-current", "page");
      else onglet.removeAttribute("aria-current");
    });

    if (nom === "revision") {
      const pastille = $("#cloche-compteur");
      if (pastille) pastille.hidden = true;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ————— Bascule Défis / Communauté ———————————————————————————— */

  function initBascule() {
    const bascule = $(".bascule");
    if (!bascule) return;
    bascule.dataset.actif = "communaute";

    $$(".bascule-option", bascule).forEach((option) => {
      option.addEventListener("click", () => {
        const cible = option.dataset.bascule;
        bascule.dataset.actif = cible;

        $$(".bascule-option", bascule).forEach((o) => {
          const actif = o === option;
          o.classList.toggle("bascule-option--active", actif);
          o.setAttribute("aria-selected", String(actif));
        });

        [["defis", "#panneau-defis"], ["communaute", "#panneau-communaute"]].forEach(([nom, sel]) => {
          const panneau = $(sel);
          const actif = nom === cible;
          panneau.classList.toggle("panneau--masque", !actif);
          panneau.hidden = !actif;
        });
      });
    });
  }

  /* ————— Toast ————————————————————————————————————————————————— */

  let minuteurToast;
  function toast(message) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("toast--visible");
    clearTimeout(minuteurToast);
    minuteurToast = setTimeout(() => el.classList.remove("toast--visible"), 2200);
  }

  /* ————— Démarrage ————————————————————————————————————————————— */

  function init() {
    rendreCours($("#liste-cours"), COURS.slice(0, 3));
    rendreCours($("#liste-tous-cours"), COURS);
    rendreCommunautes($("#liste-communautes"));
    rendreCommunautes($("#liste-communautes-page"));
    rendreDefis($("#liste-defis"));
    rendreEcheances($("#liste-echeances"));
    initBascule();

    // Statistiques du profil, calculées depuis les données.
    const moyenne = Math.round(COURS.reduce((s, c) => s + c.progression, 0) / COURS.length);
    $("#stat-cours").textContent = COURS.length;
    $("#stat-moyenne").textContent = `${moyenne} %`;

    // Cloche + onglets du bas + logo → changement de vue.
    $$("[data-onglet]").forEach((el) => {
      el.addEventListener("click", (evt) => {
        evt.preventDefault();
        afficherVue(el.dataset.onglet);
      });
    });

    // Outils IA.
    const LIBELLES = { resume: "Créer résumé", quiz: "Créer quiz", flashcards: "FlashCards" };
    $$("[data-outil]").forEach((el) => {
      el.addEventListener("click", () => toast(`${LIBELLES[el.dataset.outil]} — bientôt disponible`));
    });

    $("#bouton-affronter").addEventListener("click", () => toast("Invitation envoyée à un ami 🤺"));

    afficherVue("accueil");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
