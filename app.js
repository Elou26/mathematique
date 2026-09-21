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

  const VUES = ["accueil", "cours", "communaute", "profil", "revision", "resume"];

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
    // Les vues ouvertes depuis l'accueil (cloche, outils IA) gardent « Accueil » allumé.
    const ongletActif = (nom === "revision" || nom === "resume") ? "accueil" : nom;
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

  /* ————— Page « Créer résumé » ————————————————————————————————— */

  const etatResume = {
    source: "cours",        // cours | texte | fichier
    coursId: COURS[0].id,
    longueur: "standard",
    options: { formules: true, exemples: true, pieges: false },
    fichier: null,
  };

  const LONGUEURS = {
    court: { points: 2, libelle: "Fiche courte" },
    standard: { points: 3, libelle: "Fiche standard" },
    detaille: { points: 99, libelle: "Fiche détaillée" },
  };

  function rendreChoixCours(conteneur) {
    if (!conteneur) return;
    conteneur.textContent = "";
    COURS.forEach((cours) => {
      const li = document.createElement("li");
      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.className = "choix" + (cours.id === etatResume.coursId ? " choix--actif" : "");
      bouton.setAttribute("role", "radio");
      bouton.setAttribute("aria-checked", String(cours.id === etatResume.coursId));
      bouton.innerHTML = `
        <span class="choix-texte">
          <span class="choix-nom">${cours.titre}</span>
          <span class="choix-detail">${cours.chapitre}</span>
        </span>
        <span class="choix-marque" aria-hidden="true"></span>
      `;
      bouton.addEventListener("click", () => {
        etatResume.coursId = cours.id;
        rendreChoixCours(conteneur);
      });
      li.appendChild(bouton);
      conteneur.appendChild(li);
    });
    conteneur.setAttribute("role", "radiogroup");
  }

  /** Source actuellement sélectionnée : titre affiché + contenu de la fiche. */
  function sourceChoisie() {
    if (etatResume.source === "cours") {
      const cours = COURS.find((c) => c.id === etatResume.coursId) || COURS[0];
      return { titre: cours.titre, sousTitre: cours.chapitre, contenu: RESUMES[cours.id] || RESUME_GENERIQUE };
    }
    if (etatResume.source === "fichier") {
      return {
        titre: etatResume.fichier ? etatResume.fichier.replace(/\.[^.]+$/, "") : "Document importé",
        sousTitre: "À partir d'un fichier importé",
        contenu: RESUME_GENERIQUE,
      };
    }
    return { titre: "Texte collé", sousTitre: "À partir de tes notes", contenu: RESUME_GENERIQUE };
  }

  /** Vérifie que la source est exploitable ; renvoie un message d'erreur ou null. */
  function erreurSource() {
    if (etatResume.source === "texte") {
      const texte = $("#texte-source").value.trim();
      if (texte.length < 200) return `Il manque ${200 - texte.length} caractères pour générer une fiche.`;
    }
    if (etatResume.source === "fichier" && !etatResume.fichier) {
      return "Choisis d'abord un fichier à résumer.";
    }
    return null;
  }

  function sectionFiche(titre, elements, classe) {
    if (!elements || !elements.length) return "";
    const items = elements.map((e) => `<li>${e}</li>`).join("");
    return `<section class="fiche-section ${classe}"><h4 class="fiche-soustitre">${titre}</h4><ul>${items}</ul></section>`;
  }

  function rendreFiche() {
    const fiche = $("#fiche-resume");
    const { titre, sousTitre, contenu } = sourceChoisie();
    const max = LONGUEURS[etatResume.longueur].points;
    const { formules, exemples, pieges } = etatResume.options;

    fiche.innerHTML = `
      <header class="fiche-entete">
        <p class="fiche-etiquette">${LONGUEURS[etatResume.longueur].libelle}</p>
        <h3 class="fiche-titre">${titre}</h3>
        <p class="fiche-soustexte">${sousTitre}</p>
      </header>
      <p class="fiche-accroche">${contenu.accroche}</p>
      ${sectionFiche("L'essentiel", contenu.points.slice(0, max), "fiche-section--points")}
      ${formules ? sectionFiche("Formules clés", contenu.formules, "fiche-section--formules") : ""}
      ${exemples ? sectionFiche("Exemples corrigés", contenu.exemples, "fiche-section--exemples") : ""}
      ${pieges ? sectionFiche("Pièges fréquents", contenu.pieges, "fiche-section--pieges") : ""}
      <div class="fiche-actions">
        <button class="bouton-principal" type="button" data-action="enregistrer">Enregistrer dans mes cours</button>
        <button class="bouton-secondaire" type="button" data-action="flashcards">Générer des flashcards</button>
        <button class="bouton-secondaire" type="button" data-action="refaire">Régénérer</button>
      </div>
    `;

    $$("[data-action]", fiche).forEach((bouton) => {
      bouton.addEventListener("click", () => {
        const action = bouton.dataset.action;
        if (action === "enregistrer") toast("Résumé enregistré dans tes cours");
        else if (action === "flashcards") toast("FlashCards — bientôt disponible");
        else genererResume();
      });
    });

    fiche.hidden = false;
    fiche.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  let minuteurGeneration;
  function genererResume() {
    const erreur = erreurSource();
    if (erreur) { toast(erreur); return; }

    const chargement = $("#chargement-resume");
    const bouton = $("#bouton-generer");
    $("#fiche-resume").hidden = true;
    chargement.hidden = false;
    bouton.disabled = true;
    bouton.textContent = "Génération en cours…";

    // Simulation de l'appel au service de génération (à remplacer par l'API).
    clearTimeout(minuteurGeneration);
    minuteurGeneration = setTimeout(() => {
      chargement.hidden = true;
      bouton.disabled = false;
      bouton.textContent = "Regénérer le résumé";
      rendreFiche();
    }, 1200);
  }

  function initResume() {
    const form = $("#form-resume");
    if (!form) return;

    rendreChoixCours($("#choix-cours"));

    // Bascule entre les trois sources.
    $$(".segment", form).forEach((segment) => {
      segment.addEventListener("click", () => {
        etatResume.source = segment.dataset.source;
        $$(".segment", form).forEach((s2) => {
          const actif = s2 === segment;
          s2.classList.toggle("segment--actif", actif);
          s2.setAttribute("aria-selected", String(actif));
        });
        $$("[data-panneau]", form).forEach((panneau) => {
          const actif = panneau.dataset.panneau === etatResume.source;
          panneau.classList.toggle("source--masque", !actif);
          panneau.hidden = !actif;
        });
      });
    });

    // Compteur du texte collé.
    const zone = $("#texte-source");
    zone.addEventListener("input", () => {
      $("#compteur-texte").textContent = zone.value.trim().length;
    });

    // Fichier importé (lecture du seul nom : rien n'est envoyé).
    const champFichier = $("#fichier-source");
    champFichier.addEventListener("change", () => {
      const fichier = champFichier.files && champFichier.files[0];
      etatResume.fichier = fichier ? fichier.name : null;
      const ligneNom = $("#nom-fichier");
      ligneNom.textContent = fichier ? `Fichier prêt : ${fichier.name}` : "";
      ligneNom.hidden = !fichier;
    });

    // Longueur (radio) et options (interrupteurs).
    $$("#puces-longueur .puce").forEach((puce) => {
      puce.addEventListener("click", () => {
        etatResume.longueur = puce.dataset.longueur;
        $$("#puces-longueur .puce").forEach((p2) => {
          const actif = p2 === puce;
          p2.classList.toggle("puce--active", actif);
          p2.setAttribute("aria-checked", String(actif));
        });
      });
    });

    $$("#puces-options .puce").forEach((puce) => {
      puce.addEventListener("click", () => {
        const cle = puce.dataset.option;
        etatResume.options[cle] = !etatResume.options[cle];
        puce.classList.toggle("puce--active", etatResume.options[cle]);
        puce.setAttribute("aria-pressed", String(etatResume.options[cle]));
      });
    });

    form.addEventListener("submit", (evt) => {
      evt.preventDefault();
      genererResume();
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
    const LIBELLES = { quiz: "Créer quiz", flashcards: "FlashCards" };
    $$("[data-outil]").forEach((el) => {
      el.addEventListener("click", () => {
        if (el.dataset.outil === "resume") afficherVue("resume");
        else toast(`${LIBELLES[el.dataset.outil]} — bientôt disponible`);
      });
    });

    initResume();

    $("#bouton-affronter").addEventListener("click", () => toast("Invitation envoyée à un ami 🤺"));

    afficherVue("accueil");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
