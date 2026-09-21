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
      <p class="barre-legende">${libelleCours(cours)} · ${cours.progression} % maîtrisé</p>
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

  /* ————— Liste des défis ——————————————————————————————————————— */

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
          <span class="echeance-detail">${MATIERES[e.matiere] ? MATIERES[e.matiere].nom + " · " : ""}${quand}</span>
        </span>
        <svg class="ligne-fleche" aria-hidden="true"><use href="#i-horloge"></use></svg>
      `;
      conteneur.appendChild(bloc);
    });
  }

  /* ————— Navigation entre vues ———————————————————————————————— */

  const VUES = ["accueil", "cours", "profil", "revision", "scan", "ia", "resume", "quiz", "flashcards"];

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
    const OUVERTES_DEPUIS_ACCUEIL = ["revision", "scan", "ia", "resume", "quiz", "flashcards"];
    const ongletActif = OUVERTES_DEPUIS_ACCUEIL.includes(nom) ? "accueil" : nom;
    $$(".barre-bas .onglet").forEach((onglet) => {
      const actif = onglet.dataset.onglet === ongletActif;
      onglet.classList.toggle("onglet--actif", actif);
      if (actif) onglet.setAttribute("aria-current", "page");
      else onglet.removeAttribute("aria-current");
    });

    if (nom === "scan" && !fiche.image) reinitialiserScan();

    if (nom === "revision") {
      const pastille = $("#cloche-compteur");
      if (pastille) pastille.hidden = true;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ————— Niveau de l'utilisateur ————————————————————————————————— */

  const CLE_NIVEAU = "mathematique.niveau";
  let niveauChoisi = null;

  /** Le stockage peut être indisponible (navigation privée, cookies bloqués). */
  function lireNiveau() {
    try { return localStorage.getItem(CLE_NIVEAU); } catch (erreur) { return null; }
  }

  function ecrireNiveau(niveau) {
    try { localStorage.setItem(CLE_NIVEAU, niveau); } catch (erreur) { /* on garde la valeur en mémoire */ }
  }

  function profilNiveau() { return NIVEAUX.find((profil) => profil.id === niveauChoisi) || null; }
  function libelleNiveau() { const profil = profilNiveau(); return profil ? profil.nom : ""; }

  function appliquerNiveau(niveau) {
    // Les versions précédentes enregistraient une classe précise : on la convertit.
    niveauChoisi = ANCIENS_NIVEAUX[niveau] || niveau || null;
    if (niveauChoisi && !profilNiveau()) niveauChoisi = null;
    if (niveauChoisi && niveauChoisi !== niveau) ecrireNiveau(niveauChoisi);

    const ligne = $("#profil-niveau");
    if (ligne) ligne.textContent = niveauChoisi ? libelleNiveau() : "Profil non renseigné";
    rendreThemes();
    if ($("#ia-ajouts")) rendreAjoutsIA();
  }

  function ouvrirEcranNiveau() {
    const ecran = $("#ecran-niveau");
    const conteneur = $("#groupes-niveaux");

    conteneur.textContent = "";
    NIVEAUX.forEach((profil) => {
      const carte = document.createElement("button");
      carte.type = "button";
      carte.className = "carte-niveau" + (profil.id === niveauChoisi ? " carte-niveau--active" : "");
      carte.innerHTML = `
        <span class="carte-niveau-emoji" aria-hidden="true">${profil.emoji}</span>
        <span class="carte-niveau-texte">
          <span class="carte-niveau-nom">${profil.nom}</span>
          <span class="carte-niveau-detail">${profil.detail}</span>
        </span>
      `;
      // Un seul geste : choisir ferme l'écran.
      carte.addEventListener("click", () => {
        ecrireNiveau(profil.id);
        appliquerNiveau(profil.id);
        fermerEcranNiveau();
        toast(`Profil enregistré : ${profil.nom}`);
      });
      conteneur.appendChild(carte);
    });

    $("#passer-niveau").onclick = fermerEcranNiveau;
    ecran.hidden = false;
    document.body.classList.add("corps--bloque");
  }

  function fermerEcranNiveau() {
    $("#ecran-niveau").hidden = true;
    document.body.classList.remove("corps--bloque");
  }

  /* ————— Carrousel dépliant des thèmes du niveau ————————————————— */

  let matiereDepliee = null;

  /**
   * Fusionne les programmes d'un profil en piochant à tour de rôle dans chacun,
   * pour que le collégien voie des thèmes de la 6ᵉ comme de la 3ᵉ.
   */
  function programmeDuNiveau(maximum = 12) {
    const cles = PROGRAMMES_PAR_NIVEAU[niveauChoisi];
    if (!cles) return null;

    const tables = cles.map((cle) => CATALOGUE[cle]).filter(Boolean);
    const matieres = [...new Set(tables.flatMap((table) => Object.keys(table)))];
    const fusion = {};

    matieres.forEach((matiere) => {
      const listes = tables.map((table) => table[matiere] || []);
      const themes = [];
      for (let rang = 0; themes.length < maximum && listes.some((liste) => liste.length > rang); rang++) {
        listes.forEach((liste) => {
          if (liste[rang] && themes.length < maximum && !themes.includes(liste[rang])) themes.push(liste[rang]);
        });
      }
      fusion[matiere] = themes;
    });
    return fusion;
  }

  /** Ouvre « Créer quiz » en mode sujet libre, pré-rempli avec le thème. */
  function lancerThemeEnQuiz(theme, matiere) {
    etatQuiz.sujet = theme;
    etatQuiz.matiereTheme = matiere;
    etatQuiz.complement = `Programme ${libelleNiveau().toLowerCase()} en ${MATIERES[matiere].nom}.`;
    afficherVue("quiz");
    choisirSourceQuiz("sujet");
    $("#quiz-sujet").value = theme;
    $("#quiz-complement").value = etatQuiz.complement;
    $("#compteur-complement").textContent = etatQuiz.complement.length;
    $("#form-quiz").hidden = false;
    $("#jeu-quiz").hidden = true;
    $("#bilan-quiz").hidden = true;
    $("#indispo-quiz").hidden = true;
  }

  function deplierMatiere(matiere, programme, deplie, cartes) {
    matiereDepliee = matiereDepliee === matiere ? null : matiere;

    cartes.forEach((carte) => {
      const actif = carte.dataset.matiere === matiereDepliee;
      carte.classList.toggle("matiere-carte--active", actif);
      carte.setAttribute("aria-expanded", String(actif));
      if (actif) carte.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    });

    if (!matiereDepliee) { deplie.hidden = true; return; }

    const themes = programme[matiereDepliee];
    deplie.innerHTML = `
      <p class="deplie-titre">${MATIERES[matiereDepliee].emoji} ${MATIERES[matiereDepliee].nom}
        <span class="deplie-niveau">${libelleNiveau()}</span></p>
      <ul class="liste-themes">
        ${themes.map((theme, i) => `
          <li>
            <button class="theme" type="button" data-theme="${i}">
              <span class="theme-numero">${i + 1}</span>
              <span class="theme-nom">${theme}</span>
              <svg class="ligne-fleche" aria-hidden="true"><use href="#i-fleche"></use></svg>
            </button>
          </li>`).join("")}
      </ul>
    `;
    deplie.hidden = false;

    $$("[data-theme]", deplie).forEach((bouton) => {
      bouton.addEventListener("click", () => {
        lancerThemeEnQuiz(themes[Number(bouton.dataset.theme)], matiereDepliee);
      });
    });
  }

  function rendreThemes() {
    const bloc = $("#bloc-themes");
    const titre = $("#titre-themes");
    if (!bloc) return;

    const programme = programmeDuNiveau();
    matiereDepliee = null;
    bloc.textContent = "";

    if (!programme) {
      titre.textContent = "Thèmes de ton programme";
      const vide = document.createElement("div");
      vide.className = "themes-vide";
      vide.innerHTML = `
        <p class="themes-vide-texte">Indique ton profil pour afficher les thèmes de ton programme,
        matière par matière.</p>
        <button class="bouton-principal" type="button" id="themes-choisir-niveau">Choisir mon profil</button>
      `;
      bloc.appendChild(vide);
      $("#themes-choisir-niveau").addEventListener("click", ouvrirEcranNiveau);
      return;
    }

    titre.textContent = `Thèmes · ${libelleNiveau()}`;

    const carrousel = document.createElement("div");
    carrousel.className = "carrousel";
    carrousel.setAttribute("aria-label", `Matières du programme de ${niveauChoisi}`);

    const deplie = document.createElement("div");
    deplie.className = "deplie";
    deplie.hidden = true;

    const cartes = Object.keys(programme).map((matiere) => {
      const carte = document.createElement("button");
      carte.type = "button";
      carte.className = "matiere-carte";
      carte.dataset.matiere = matiere;
      carte.setAttribute("aria-expanded", "false");
      carte.innerHTML = `
        <span class="matiere-emoji" aria-hidden="true">${MATIERES[matiere].emoji}</span>
        <span class="matiere-nom">${MATIERES[matiere].nom}</span>
        <span class="matiere-compte">${programme[matiere].length} thèmes</span>
        <svg class="matiere-chevron" aria-hidden="true"><use href="#i-fleche"></use></svg>
      `;
      carrousel.appendChild(carte);
      return carte;
    });

    cartes.forEach((carte) => {
      carte.addEventListener("click", () => deplierMatiere(carte.dataset.matiere, programme, deplie, cartes));
    });

    bloc.appendChild(carrousel);
    bloc.appendChild(deplie);
  }

  /* ————— Matières et sélecteur de cours (partagé par les 3 outils) ——— */

  function libelleCours(cours) {
    const matiere = MATIERES[cours.matiere];
    return `${matiere ? matiere.nom : "Cours"} · ${cours.chapitre}`;
  }

  function emojiMatiere(cours) {
    const matiere = MATIERES[cours.matiere];
    return matiere ? matiere.emoji : "📘";
  }

  function melanger(tableau) {
    const copie = tableau.slice();
    for (let i = copie.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copie[i], copie[j]] = [copie[j], copie[i]];
    }
    return copie;
  }

  /**
   * Monte un sélecteur « filtre par matière + liste de chapitres ».
   * `etat` porte { matiere, coursId } et est mis à jour en place.
   * `filtreCours` permet de n'afficher que les chapitres disposant de contenu.
   */
  function initSelecteurCours({ liste, filtres, etat, filtreCours }) {
    const conteneurListe = $(liste);
    const conteneurFiltres = $(filtres);
    if (!conteneurListe || !conteneurFiltres) return;

    const disponibles = filtreCours ? COURS.filter(filtreCours) : COURS.slice();
    if (!disponibles.some((c) => c.id === etat.coursId)) etat.coursId = disponibles[0].id;

    const visibles = () =>
      etat.matiere === "toutes" ? disponibles : disponibles.filter((c) => c.matiere === etat.matiere);

    function rendreFiltres() {
      const matieres = [...new Set(disponibles.map((c) => c.matiere))];
      conteneurFiltres.textContent = "";
      [["toutes", "Toutes"], ...matieres.map((m) => [m, `${MATIERES[m].emoji} ${MATIERES[m].court}`])]
        .forEach(([valeur, libelle]) => {
          const bouton = document.createElement("button");
          bouton.type = "button";
          bouton.className = "puce" + (etat.matiere === valeur ? " puce--active" : "");
          bouton.setAttribute("aria-pressed", String(etat.matiere === valeur));
          bouton.textContent = libelle;
          bouton.addEventListener("click", () => {
            etat.matiere = valeur;
            const restants = visibles();
            if (!restants.some((c) => c.id === etat.coursId)) etat.coursId = restants[0].id;
            rendreFiltres();
            rendreListe();
          });
          conteneurFiltres.appendChild(bouton);
        });
    }

    function rendreListe() {
      conteneurListe.textContent = "";
      conteneurListe.setAttribute("role", "radiogroup");
      visibles().forEach((cours) => {
        const actif = cours.id === etat.coursId;
        const li = document.createElement("li");
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.className = "choix" + (actif ? " choix--actif" : "");
        bouton.setAttribute("role", "radio");
        bouton.setAttribute("aria-checked", String(actif));
        bouton.innerHTML = `
          <span class="ligne-pastille">${emojiMatiere(cours)}</span>
          <span class="choix-texte">
            <span class="choix-nom">${cours.titre}</span>
            <span class="choix-detail">${libelleCours(cours)}</span>
          </span>
          <span class="choix-marque" aria-hidden="true"></span>
        `;
        bouton.addEventListener("click", () => {
          etat.coursId = cours.id;
          rendreListe();
        });
        li.appendChild(bouton);
        conteneurListe.appendChild(li);
      });
    }

    rendreFiltres();
    rendreListe();
  }

  /** Applique le choix « radio » à un groupe de puces et renvoie la valeur retenue. */
  function brancherPuces(selecteur, cle, surChoix) {
    $$(selecteur).forEach((puce) => {
      puce.addEventListener("click", () => {
        $$(selecteur).forEach((autre) => {
          const actif = autre === puce;
          autre.classList.toggle("puce--active", actif);
          autre.setAttribute("aria-checked", String(actif));
        });
        surChoix(puce.dataset[cle]);
      });
    });
  }

  /* ————— Feuille « Option de création de fiche » ————————————————— */

  function ouvrirFeuilleCreation() {
    $("#feuille-fond").hidden = false;
    $("#feuille-creation").hidden = false;
    document.body.classList.add("corps--bloque");
  }

  function fermerFeuilleCreation() {
    $("#feuille-fond").hidden = true;
    $("#feuille-creation").hidden = true;
    document.body.classList.remove("corps--bloque");
  }

  /** Chaque option mène au bon outil, déjà réglé sur la bonne source. */
  function lancerCreation(option) {
    fermerFeuilleCreation();

    if (option === "scan") { afficherVue("scan"); return; }

    if (option === "ia") {
      afficherVue("ia");
      $("#ia-demande").focus();
      return;
    }

    // « Avec tes cours » et « Rédiger » ouvrent la fiche de résumé, sur la bonne source.
    const source = option === "cours" ? "cours" : "texte";
    etatResume.source = source;
    afficherVue("resume");
    $("#form-resume").hidden = false;
    $("#fiche-resume").hidden = true;
    $$("[data-source]", $("#form-resume")).forEach((segment) => {
      const actif = segment.dataset.source === source;
      segment.classList.toggle("segment--actif", actif);
      segment.setAttribute("aria-selected", String(actif));
    });
    $$("[data-panneau]", $("#form-resume")).forEach((panneau) => {
      const actif = panneau.dataset.panneau === source;
      panneau.classList.toggle("source--masque", !actif);
      panneau.hidden = !actif;
    });
    if (source === "texte") $("#texte-source").focus();
  }

  function initCreation() {
    const bouton = $("#ouvrir-creation");
    if (!bouton) return;

    bouton.addEventListener("click", ouvrirFeuilleCreation);
    $("#feuille-fond").addEventListener("click", fermerFeuilleCreation);
    $("#fermer-creation").addEventListener("click", fermerFeuilleCreation);
    $$("[data-creation]").forEach((tuile) => {
      tuile.addEventListener("click", () => lancerCreation(tuile.dataset.creation));
    });

    document.addEventListener("keydown", (evt) => {
      if (evt.key === "Escape" && !$("#feuille-creation").hidden) fermerFeuilleCreation();
    });
  }

  /* ————— Page « Scanner ma fiche » ————————————————————————————— */

  const fiche = { image: null, nom: "", sujet: "", matiere: null };

  /**
   * Point d'accroche unique pour la lecture du texte de la fiche.
   * Tant qu'aucun service d'OCR n'est branché, on ne fabrique pas de faux
   * texte : on demande confirmation du thème, en proposant les thèmes du
   * programme de la classe.
   */
  function lireLaFiche(/* image */) {
    return Promise.resolve({ texte: "", titre: "" });
  }

  function etapesScan(actives) {
    const liste = $("#scan-etapes");
    liste.hidden = !actives.length;
    $$("li", liste).forEach((ligne) => {
      ligne.classList.toggle("scan-etape--faite", actives.includes(ligne.dataset.etape));
    });
  }

  /** Raccourcis sous le champ : les matières du programme, puis leurs thèmes. */
  function rendreSuggestionsScan(matiereOuverte) {
    const conteneur = $("#scan-suggestions");
    const programme = programmeDuNiveau();
    conteneur.textContent = "";
    if (!programme) return;

    const ajouterPuce = (libelle, surClic, active) => {
      const puce = document.createElement("button");
      puce.type = "button";
      puce.className = "puce" + (active ? " puce--active" : "");
      puce.textContent = libelle;
      puce.addEventListener("click", surClic);
      conteneur.appendChild(puce);
      return puce;
    };

    if (!matiereOuverte) {
      Object.keys(programme).forEach((matiere) => {
        ajouterPuce(`${MATIERES[matiere].emoji} ${MATIERES[matiere].court}`,
          () => rendreSuggestionsScan(matiere));
      });
      return;
    }

    ajouterPuce("← Matières", () => rendreSuggestionsScan(null));
    programme[matiereOuverte].forEach((theme) => {
      ajouterPuce(theme, () => {
        fiche.sujet = theme;
        fiche.matiere = matiereOuverte;
        $("#scan-sujet").value = theme;
        rendreSuggestionsScan(matiereOuverte);
      }, theme === fiche.sujet);
    });
  }

  function reinitialiserScan() {
    if (fiche.image) URL.revokeObjectURL(fiche.image);
    fiche.image = null;
    fiche.nom = "";
    fiche.sujet = "";
    fiche.matiere = null;

    $("#scanner").classList.remove("scanner--capture");
    $("#scan-apercu").hidden = true;
    $("#scan-apercu").removeAttribute("src");
    $("#scan-aide").hidden = false;
    $("#scan-balayage").hidden = true;
    $("#scan-capture").hidden = false;
    $("#scan-resultat").hidden = true;
    $("#scan-sujet").value = "";
    $("#scan-sous-texte").textContent = "Pose ta fiche à plat, cadre-la, et choisis ensuite ce que tu veux en faire.";
    etapesScan([]);
  }

  let minuteurScan;
  function analyserFiche(fichier) {
    if (!fichier || !fichier.type.startsWith("image/")) {
      toast("Choisis une photo de ta fiche.");
      return;
    }

    if (fiche.image) URL.revokeObjectURL(fiche.image);
    fiche.image = URL.createObjectURL(fichier);
    fiche.nom = fichier.name || "fiche.jpg";

    const apercu = $("#scan-apercu");
    apercu.src = fiche.image;
    apercu.hidden = false;
    $("#scanner").classList.add("scanner--capture");
    $("#scan-aide").hidden = true;
    $("#scan-capture").hidden = true;
    $("#scan-balayage").hidden = false;
    $("#scan-sous-texte").textContent = "Lecture de la fiche…";
    etapesScan(["cadrage"]);

    clearTimeout(minuteurScan);
    minuteurScan = setTimeout(() => etapesScan(["cadrage", "lecture"]), 700);

    lireLaFiche(fichier).then((lecture) => {
      setTimeout(() => {
        etapesScan(["cadrage", "lecture", "notions"]);
        $("#scan-balayage").hidden = true;
        $("#scan-sous-texte").textContent = "Fiche capturée. Confirme son thème, puis choisis quoi en faire.";

        if (lecture.titre) {
          fiche.sujet = lecture.titre;
          $("#scan-sujet").value = lecture.titre;
        }
        rendreSuggestionsScan(null);
        $("#scan-resultat").hidden = false;
        $("#scan-resultat").scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 1400);
    });
  }

  /** Envoie la fiche scannée vers l'un des trois outils. */
  function exploiterFiche(outil) {
    const sujet = $("#scan-sujet").value.trim();
    if (sujet.length < 3) {
      toast("Indique le thème de ta fiche pour continuer.");
      $("#scan-sujet").focus();
      return;
    }
    fiche.sujet = sujet;
    const chapitre = chercherBanque(sujet, fiche.matiere);

    if (outil === "quiz") {
      etatQuiz.sujet = sujet;
      etatQuiz.matiereTheme = fiche.matiere;
      etatQuiz.complement = `Fiche scannée${niveauChoisi ? " — profil " + libelleNiveau().toLowerCase() : ""}.`;
      afficherVue("quiz");
      choisirSourceQuiz("sujet");
      $("#quiz-sujet").value = sujet;
      $("#quiz-complement").value = etatQuiz.complement;
      $("#compteur-complement").textContent = etatQuiz.complement.length;
      lancerQuiz();
      return;
    }

    if (outil === "flashcards") {
      afficherVue("flashcards");
      if (chapitre && (FLASHCARDS[chapitre.id] || []).length) {
        etatCartes.coursId = chapitre.id;
        lancerCartes(null);
      } else {
        toast("Aucun paquet tout prêt pour cette fiche : choisis un chapitre.");
        $("#form-cartes").hidden = false;
        $("#jeu-cartes").hidden = true;
        $("#bilan-cartes").hidden = true;
      }
      return;
    }

    // Résumé : on part du chapitre reconnu, sinon de la fiche scannée elle-même.
    afficherVue("resume");
    $("#form-resume").hidden = false;
    if (chapitre) {
      etatResume.source = "cours";
      etatResume.coursId = chapitre.id;
    } else {
      etatResume.source = "fichier";
      etatResume.fichier = fiche.nom;
      const ligneNom = $("#nom-fichier");
      ligneNom.textContent = `Fiche scannée : ${fiche.nom}`;
      ligneNom.hidden = false;
    }
    $$("[data-source]", $("#form-resume")).forEach((segment) => {
      const actif = segment.dataset.source === etatResume.source;
      segment.classList.toggle("segment--actif", actif);
      segment.setAttribute("aria-selected", String(actif));
    });
    $$("[data-panneau]", $("#form-resume")).forEach((panneau) => {
      const actif = panneau.dataset.panneau === etatResume.source;
      panneau.classList.toggle("source--masque", !actif);
      panneau.hidden = !actif;
    });
    genererResume();
  }

  function initScan() {
    const capture = $("#scan-photo");
    if (!capture) return;

    [capture, $("#scan-galerie")].forEach((champ) => {
      champ.addEventListener("change", () => {
        analyserFiche(champ.files && champ.files[0]);
        champ.value = "";               // pour pouvoir reprendre la même photo
      });
    });

    $("#scan-sujet").addEventListener("input", (evt) => {
      fiche.sujet = evt.target.value;
      fiche.matiere = null;             // un thème retapé n'est plus lié à une matière
      $$("#scan-suggestions .puce").forEach((puce) => puce.classList.remove("puce--active"));
    });

    $$("[data-scan-outil]").forEach((tuile) => {
      tuile.addEventListener("click", () => exploiterFiche(tuile.dataset.scanOutil));
    });

    $("#scan-refaire").addEventListener("click", reinitialiserScan);
  }

  /* ————— Page « Créer résumé » ————————————————————————————————— */

  const etatResume = {
    source: "cours",        // cours | texte | fichier
    matiere: "toutes",
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

  /** Source actuellement sélectionnée : titre affiché + contenu de la fiche. */
  function sourceChoisie() {
    if (etatResume.source === "cours") {
      const cours = COURS.find((c) => c.id === etatResume.coursId) || COURS[0];
      return { titre: cours.titre, sousTitre: libelleCours(cours), contenu: RESUMES[cours.id] || RESUME_GENERIQUE };
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
      ${formules ? sectionFiche(
          contenu.libelleFormules || "Formules clés",
          contenu.formules,
          contenu.libelleFormules ? "fiche-section--reperes" : "fiche-section--formules"
        ) : ""}
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

    initSelecteurCours({
      liste: "#choix-cours",
      filtres: "#filtres-resume",
      etat: etatResume,
    });

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
    const majResumeFiche = () => {
      const retenues = Object.entries(etatResume.options).filter(([, actif]) => actif).length;
      $("#resume-fiche").textContent =
        `${LONGUEURS[etatResume.longueur].libelle.toLowerCase()} · ${retenues} option${retenues > 1 ? "s" : ""}`;
    };

    $$("#puces-longueur .puce").forEach((puce) => {
      puce.addEventListener("click", () => {
        etatResume.longueur = puce.dataset.longueur;
        majResumeFiche();
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
        majResumeFiche();
      });
    });

    majResumeFiche();

    form.addEventListener("submit", (evt) => {
      evt.preventDefault();
      genererResume();
    });
  }

  /* ————— Génération par Claude ——————————————————————————————————— */

  /**
   * La page publiée peut demander un quiz à Claude, sur le compte du
   * lecteur. Hors de ce cadre (site servi tel quel, capacité refusée),
   * `claude.use` est absent ou répond null : on retombe alors sur les
   * banques et générateurs locaux.
   */
  let sampleClaude = null;
  let claudeResolu = false;

  async function preparerClaude() {
    try {
      if (typeof claude === "undefined" || !claude || typeof claude.use !== "function") return;
      sampleClaude = await claude.use("sample");
    } catch (erreur) {
      sampleClaude = null;
    } finally {
      claudeResolu = true;
      afficherMoteurIA();
    }
  }

  function afficherMoteurIA() {
    const ligne = $("#ia-moteur");
    if (!ligne) return;
    if (!claudeResolu) { ligne.hidden = true; return; }
    ligne.textContent = sampleClaude
      ? "✳︎ Les questions sont écrites par Claude, à la demande."
      : "Claude n'est pas joignable ici : les questions viennent des chapitres déjà connus.";
    ligne.classList.toggle("ia-moteur--actif", Boolean(sampleClaude));
    ligne.hidden = false;
  }

  const CONSIGNE_QUIZ = [
    "Tu es professeur et tu rédiges un QCM de révision pour un élève francophone.",
    "",
    "Demande de l'élève :",
    "<<<DEMANDE>>>",
    "",
    "Profil de l'élève : <<<PROFIL>>>.",
    "",
    "Réponds uniquement avec un objet JSON de cette forme :",
    '{"titre": "Titre court du quiz", "questions": [{"enonce": "…", "choix": ["…", "…", "…", "…"], "bonne": 0, "explication": "…"}]}',
    "",
    "Règles :",
    "- respecte le nombre de questions demandé ; à défaut, rédige-en 5 (jamais plus de 15) ;",
    "- exactement quatre propositions par question, une seule correcte ;",
    '- "bonne" est l\'indice de la bonne réponse dans "choix" (0, 1, 2 ou 3) ;',
    "- varie la position de la bonne réponse d'une question à l'autre ;",
    "- les propositions fausses doivent être plausibles et refléter des erreurs classiques ;",
    "- l'explication tient en une ou deux phrases et justifie la bonne réponse ;",
    "- tout est en français et calé sur le niveau de l'élève ;",
    "- aucun texte en dehors du JSON.",
  ].join("\n");

  /** Vérifie la forme de ce que Claude renvoie avant d'en faire un quiz. */
  function validerQuizIA(donnees) {
    if (!donnees || !Array.isArray(donnees.questions)) return null;

    const questions = donnees.questions
      .filter((question) => question && typeof question.enonce === "string" && Array.isArray(question.choix))
      .map((question) => {
        const choix = question.choix.map((texte) => String(texte).trim()).filter(Boolean);
        const bonne = Number(question.bonne);
        if (choix.length !== 4 || new Set(choix).size !== 4) return null;
        if (!Number.isInteger(bonne) || bonne < 0 || bonne > 3) return null;
        if (!question.enonce.trim()) return null;
        return formaterQuestion({
          q: question.enonce.trim(),
          choix,
          bonne,
          explication: String(question.explication || "").trim() || "Pas d'explication fournie.",
        });
      })
      .filter(Boolean);

    return questions.length ? questions.slice(0, 20) : null;
  }

  /** Démarre une partie avec des questions déjà écrites (pas de tirage local). */
  function demarrerPartie(questions, contexte, demandeIA) {
    const ligneContexte = $("#quiz-contexte");
    ligneContexte.textContent = contexte || "";
    ligneContexte.hidden = !contexte;

    $("#form-quiz").hidden = true;
    $("#chargement-quiz").hidden = true;
    $("#bilan-quiz").hidden = true;
    $("#indispo-quiz").hidden = true;

    partieQuiz = {
      questions, index: 0, score: 0,
      mode: etatQuiz.mode, coursId: null, sansFin: false,
      tirer: () => null, demandeIA,
    };
    $("#quiz-quitter").textContent = "Quitter le quiz";
    $("#jeu-quiz").hidden = false;
    afficherQuestion();
  }

  const MESSAGES_IA = {
    not_granted: "Tu n'as pas autorisé cette page à utiliser Claude : je pioche dans les chapitres connus.",
    sampling_disabled: "Claude n'est pas disponible sur ce compte : je pioche dans les chapitres connus.",
    not_declared: "Claude n'est pas disponible ici : je pioche dans les chapitres connus.",
    capability_disabled: "Claude n'est pas disponible ici : je pioche dans les chapitres connus.",
    capability_removed: "Cette version de l'application ne sait pas appeler Claude : je pioche dans les chapitres connus.",
    rate_limited: "Trop de demandes d'un coup. Réessaie dans un moment.",
    session_expired: "Ta session a expiré : reconnecte-toi puis réessaie.",
    refused: "Claude a décliné cette demande. Reformule-la autrement.",
    empty_completion: "Claude n'a rien écrit. Demande un peu moins à la fois.",
    invalid_json: "La réponse de Claude n'était pas exploitable. Réessaie, ou précise ta demande.",
    prompt_too_large: "Ta demande est trop longue : résume-la.",
    upstream_error: "La connexion à Claude a échoué. Réessaie dans un instant.",
  };
  const REPLIS_LOCAUX = new Set(["not_granted", "sampling_disabled", "not_declared",
    "capability_disabled", "capability_removed", "rate_limited"]);

  function messageIA(texte, ton) {
    const ligne = $("#ia-message");
    ligne.textContent = texte || "";
    ligne.className = `ia-message${ton ? " ia-message--" + ton : ""}`;
    ligne.hidden = !texte;
  }

  let controleurIA = null;

  async function genererAvecClaude(demande) {
    const invite = CONSIGNE_QUIZ
      .replace("<<<DEMANDE>>>", demande)
      .replace("<<<PROFIL>>>", niveauChoisi ? libelleNiveau().toLowerCase() : "non précisé");

    controleurIA = new AbortController();
    $("#form-ia").hidden = true;
    $("#chargement-ia").hidden = false;
    $("#ia-stop").hidden = false;
    $("#ia-progres").textContent = "Claude rédige ton quiz…";
    messageIA("");

    try {
      const donnees = await sampleClaude.json(invite, {
        modelTier: "default",
        cache: false,
        signal: controleurIA.signal,
        onText: ({ text }) => {
          // On ne montre pas le JSON brut : seulement le fait que ça avance.
          $("#ia-progres").textContent = `Claude rédige ton quiz… (${text.length} caractères)`;
        },
      });

      const questions = validerQuizIA(donnees);
      if (!questions) throw { code: "invalid_json", message: "forme inattendue" };

      const titre = String(donnees.titre || "").trim();
      afficherVue("quiz");
      demarrerPartie(questions, `${titre || "Quiz sur mesure"} · écrit par Claude`, demande);
      return true;
    } catch (erreur) {
      const code = erreur && erreur.code ? erreur.code : "upstream_error";
      if (code === "cancelled") { messageIA("Génération arrêtée.", null); return true; }
      messageIA(MESSAGES_IA[code] || MESSAGES_IA.upstream_error, REPLIS_LOCAUX.has(code) ? null : "erreur");
      if (REPLIS_LOCAUX.has(code) && code !== "rate_limited") { sampleClaude = null; afficherMoteurIA(); return false; }
      return true;                       // erreur passagère : on laisse l'élève réessayer
    } finally {
      controleurIA = null;
      $("#chargement-ia").hidden = true;
      $("#ia-stop").hidden = true;
      $("#form-ia").hidden = false;
    }
  }

  /* ————— Page « Générer par l'IA » ————————————————————————————— */

  const MOTS_NIVEAU = /\b(college|collegien|6e|5e|4e|3e|sixieme|cinquieme|quatrieme|troisieme|lycee|lyceen|seconde|premiere|terminale|bac|prepa|licence|master|doctorat|bts|but|etudiant|superieur)\b/;
  const MOTS_ANGLE = /\b(surtout|uniquement|seulement|plutot|insiste|insistant|focalise|concentre|evite|sans|exercice|exercices|calcul|calculs|definition|definitions|date|dates|demonstration|methode|piege|pieges|cours|corrige|application)\b/;

  /** Thèmes du catalogue et chapitres suivis, découpés une fois pour toutes. */
  let sujetsConnus = null;
  function chargerSujetsConnus() {
    if (sujetsConnus) return sujetsConnus;
    const libelles = [];
    Object.values(CATALOGUE).forEach((programme) => {
      Object.values(programme).forEach((themes) => libelles.push(...themes));
    });
    COURS.forEach((cours) => libelles.push(cours.titre, ...(cours.motsCles || [])));
    sujetsConnus = libelles.map(motsUtiles).filter((mots) => mots.length);
    return sujetsConnus;
  }

  /** Ce qui manque à une demande pour qu'elle donne un quiz fiable. */
  function analyserDemande(texte) {
    const normalise = normaliser(texte);
    const mots = motsUtiles(texte);
    // Nommer un chapitre connu suffit, même en peu de mots.
    const chapitreNomme = chargerSujetsConnus().some((attendus) => attendus.every((mot) => mots.includes(mot)));
    return {
      sujet: chapitreNomme || mots.length >= 3,
      niveau: MOTS_NIVEAU.test(normalise),
      format: /\b\d{1,2}\b/.test(normalise) && /(question|qcm|quiz)/.test(normalise),
      angle: MOTS_ANGLE.test(normalise) || texte.trim().length >= 140,
    };
  }

  const NOTES_PRECISION = [
    "Demande trop vague",
    "Encore vague",
    "Correcte",
    "Précise",
    "Très précise",
  ];

  function rafraichirDemande() {
    const texte = $("#ia-demande").value;
    const criteres = analyserDemande(texte);
    const score = Object.values(criteres).filter(Boolean).length;

    $("#ia-compteur").textContent = texte.length;
    $("#ia-score").textContent = `${score} / 4`;
    $("#ia-note").textContent = NOTES_PRECISION[score];
    $("#ia-jauge").style.width = `${(score / 4) * 100}%`;
    $(".precision").dataset.niveau = score >= 3 ? "haute" : score >= 2 ? "moyenne" : "basse";

    $$("#ia-criteres li").forEach((ligne) => {
      ligne.classList.toggle("critere--rempli", Boolean(criteres[ligne.dataset.critere]));
    });

    // En dessous de deux critères, générer donnerait un quiz à côté de la plaque.
    $("#bouton-ia").disabled = score < 2 || texte.trim().length < 15;
    return { criteres, score };
  }

  /** Ajoute un bout de phrase à la demande, sans doublon. */
  function ajouterALaDemande(fragment) {
    const champ = $("#ia-demande");
    const actuel = champ.value.trim();
    if (normaliser(actuel).includes(normaliser(fragment))) return;
    champ.value = actuel ? `${actuel.replace(/[.\s]+$/, "")}, ${fragment}.` : `${fragment.charAt(0).toUpperCase()}${fragment.slice(1)}.`;
    champ.focus();
    rafraichirDemande();
  }

  function rendreAjoutsIA() {
    const conteneur = $("#ia-ajouts");
    conteneur.textContent = "";
    const propositions = [
      niveauChoisi ? `niveau ${libelleNiveau().toLowerCase()}` : "niveau lycéen",
      "10 questions",
      "avec un corrigé détaillé",
      "surtout des exercices de calcul",
      "en évitant les questions de cours",
    ];
    propositions.forEach((fragment) => {
      const puce = document.createElement("button");
      puce.type = "button";
      puce.className = "puce";
      puce.textContent = `+ ${fragment}`;
      puce.addEventListener("click", () => ajouterALaDemande(fragment));
      conteneur.appendChild(puce);
    });
  }

  /** La demande part vers le moteur de quiz, telle qu'elle a été écrite. */
  function lancerDemandeIA() {
    const demande = $("#ia-demande").value.trim();
    const { score } = rafraichirDemande();
    if (score < 2 || demande.length < 15) {
      toast("Précise ta demande : au moins le chapitre et un second critère.");
      return;
    }

    if (sampleClaude) {
      genererAvecClaude(demande).then((traite) => { if (!traite) lancerDepuisLesChapitres(demande); });
      return;
    }
    lancerDepuisLesChapitres(demande);
  }

  /** Repli : on cherche le chapitre correspondant dans ce que l'application connaît. */
  function lancerDepuisLesChapitres(demande) {
    etatQuiz.sujet = demande;
    etatQuiz.complement = "Demande rédigée dans l'atelier IA.";
    etatQuiz.matiereTheme = null;
    // Une demande rédigée noie le chapitre dans une phrase : on n'exige plus
    // qu'il pèse la moitié des mots, seulement qu'il y figure en entier.
    etatQuiz.couvertureSujet = 0;

    afficherVue("quiz");
    choisirSourceQuiz("sujet");
    $("#quiz-sujet").value = demande.slice(0, 80);
    $("#quiz-complement").value = demande;
    $("#compteur-complement").textContent = demande.length;
    lancerQuiz();
  }

  function initIA() {
    const form = $("#form-ia");
    if (!form) return;

    $("#ia-demande").addEventListener("input", rafraichirDemande);
    $("#ia-utiliser-exemple").addEventListener("click", () => {
      $("#ia-demande").value = $("#ia-exemple").textContent.replace(/\s+/g, " ").trim();
      rafraichirDemande();
      $("#ia-demande").focus();
    });

    form.addEventListener("submit", (evt) => { evt.preventDefault(); lancerDemandeIA(); });
    $("#ia-stop").addEventListener("click", () => { if (controleurIA) controleurIA.abort(); });

    rendreAjoutsIA();
    rafraichirDemande();
    afficherMoteurIA();
    preparerClaude();
  }

  /* ————— Page « Créer quiz » ——————————————————————————————————— */

  const etatQuiz = {
    source: "cours",        // cours | sujet
    matiere: "toutes",
    coursId: COURS[0].id,
    sujet: "",
    matiereTheme: null,     // matière imposée quand le sujet vient du carrousel
    couvertureSujet: undefined,
    complement: "",
    taille: 5,
    mode: "immediate",
  };
  let partieQuiz = null;

  /** Met une question brute en forme et mélange l'ordre des réponses. */
  function formaterQuestion(brute) {
    return {
      enonce: brute.q,
      explication: brute.explication,
      choix: melanger(brute.choix.map((texte, i) => ({ texte, correct: i === brute.bonne }))),
    };
  }

  /**
   * Ouvre un tirage pour un chapitre : les questions rédigées d'abord, puis des
   * questions fabriquées à la volée par les générateurs, sans jamais répéter un
   * énoncé déjà posé. Renvoie null seulement si le chapitre n'a rien du tout.
   */
  function ouvrirTirage(coursId) {
    const restantes = melanger(QUIZ[coursId] || []);
    const modeles = GENERATEURS[coursId] || [];
    const vues = new Set();

    return function tirer() {
      // On panache les questions rédigées et les questions générées.
      if (restantes.length && (!modeles.length || Math.random() < 0.45)) {
        const brute = restantes.pop();
        vues.add(normaliser(brute.q));
        return formaterQuestion(brute);
      }

      for (let essai = 0; essai < 60 && modeles.length; essai++) {
        const brute = modeles[Math.floor(Math.random() * modeles.length)]();
        const signature = normaliser(brute.q);
        if (vues.has(signature)) continue;
        vues.add(signature);
        return formaterQuestion(brute);
      }

      if (restantes.length) {
        const brute = restantes.pop();
        vues.add(normaliser(brute.q));
        return formaterQuestion(brute);
      }
      return null;   // plus rien de neuf à proposer
    };
  }

  /** Tire `taille` questions d'un chapitre (mode classique). */
  function preparerQuestions(coursId, taille) {
    const tirer = ouvrirTirage(coursId);
    const questions = [];
    for (let i = 0; i < taille; i++) {
      const question = tirer();
      if (!question) break;
      questions.push(question);
    }
    return questions;
  }

  /** Minuscules sans accents ni ponctuation, pour comparer un sujet saisi librement. */
  function normaliser(texte) {
    return texte
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Échappe un texte saisi par l'utilisateur avant une insertion en HTML. */
  function echapper(texte) {
    const div = document.createElement("div");
    div.textContent = texte;
    return div.innerHTML;
  }

  const MOTS_VIDES = new Set([
    "les", "des", "une", "aux", "avec", "dans", "pour", "sur", "par", "leur", "leurs", "que",
    "qui", "quoi", "est", "sont", "son", "ses", "cette", "ces", "mon", "mes", "ton", "tes",
    "notre", "nos", "votre", "vos", "entre", "chez", "sans", "sous", "plus", "moins", "tout",
    "tous", "toute", "toutes", "comment", "pourquoi", "quand", "quel", "quelle", "mais", "donc",
  ]);

  /** Mots significatifs d'un texte, au singulier approximatif. */
  function motsUtiles(texte) {
    return normaliser(texte)
      .split(" ")
      .filter((mot) => mot.length > 3 && !MOTS_VIDES.has(mot))
      .map((mot) => (mot.length > 4 ? mot.replace(/[sx]$/, "") : mot));
  }

  /**
   * L'expression est-elle entièrement retrouvée dans le sujet, et y pèse-t-elle
   * assez ? Le seuil de moitié évite qu'un mot isolé emporte la décision :
   * « Circuits en série et en dérivation » ne doit pas lancer un QCM de dérivées.
   */
  function expressionCouverte(expression, mots, couvertureMinimale = 0.5) {
    const attendus = motsUtiles(expression);
    if (!attendus.length || !attendus.every((mot) => mots.includes(mot))) return false;
    return attendus.length / mots.length >= couvertureMinimale;
  }

  /**
   * Cherche la banque de questions correspondant au sujet saisi.
   * Seule une correspondance franche est acceptée — titre identique, ou
   * expression-clé entièrement retrouvée dans le sujet : hors de question de
   * servir un QCM de probabilités à quelqu'un qui demande « Classer les êtres
   * vivants ». Sinon c'est au service de génération de produire les questions.
   * `matiereAttendue` verrouille la matière quand le sujet vient du carrousel.
   */
  function chercherBanque(sujet, matiereAttendue, couvertureMinimale = 0.5) {
    const recherche = normaliser(sujet);
    if (recherche.length < 3) return null;
    const mots = motsUtiles(sujet);
    if (!mots.length) return null;

    let meilleur = null;
    COURS
      .filter((cours) => (QUIZ[cours.id] || []).length)
      .filter((cours) => !matiereAttendue || cours.matiere === matiereAttendue)
      .forEach((cours) => {
        const expressions = [cours.titre, ...(cours.motsCles || [])];
        let score = 0;

        expressions.forEach((expression) => {
          if (normaliser(expression) === recherche) score = Math.max(score, 10);
          else if (expressionCouverte(expression, mots, couvertureMinimale)) score = Math.max(score, 8);
        });

        if (score && (!meilleur || score > meilleur.score)) meilleur = { cours, score };
      });

    return meilleur ? meilleur.cours : null;
  }

  function panneauSujetIndisponible(sujet) {
    const complement = etatQuiz.complement.trim();
    const proches = [];
    COURS.filter((cours) => (QUIZ[cours.id] || []).length).forEach((cours) => {
      if (proches.length < 3 && !proches.some((autre) => autre.matiere === cours.matiere)) proches.push(cours);
    });

    $("#form-quiz").hidden = true;
    const panneau = $("#indispo-quiz");
    panneau.innerHTML = `
      <p class="bilan-message"><strong>« ${echapper(sujet)} »</strong> ne correspond à aucune banque de questions déjà
      présente dans l'application.</p>
      <p class="bilan-pourcentage">Ta demande est prête pour le générateur : elle partira au service d'IA dès
      qu'il sera branché.</p>
      <ul class="demande">
        <li><span class="demande-cle">Sujet</span><span class="demande-valeur">${echapper(sujet)}</span></li>
        <li><span class="demande-cle">Complément</span><span class="demande-valeur">${complement ? echapper(complement) : "—"}</span></li>
        <li><span class="demande-cle">Niveau</span><span class="demande-valeur">${libelleNiveau() || "non renseigné"}</span></li>
        <li><span class="demande-cle">Format</span><span class="demande-valeur">${etatQuiz.taille === "infini" ? "Sans fin" : etatQuiz.taille + " questions"} · correction ${etatQuiz.mode === "immediate" ? "immédiate" : "à la fin"}</span></li>
      </ul>
      <h4 class="bilan-soustitre">En attendant, des chapitres disponibles</h4>
      <ul class="bilan-erreurs">
        ${proches.map((cours) => `
          <li><span class="bilan-question">${cours.titre}</span>
              <span class="bilan-explication">${libelleCours(cours)}</span></li>`).join("")}
      </ul>
      <div class="bilan-actions">
        <button class="bouton-principal" type="button" data-indispo="cours">Choisir un chapitre</button>
        <button class="bouton-secondaire" type="button" data-indispo="sujet">Modifier le sujet</button>
      </div>
    `;
    panneau.hidden = false;

    $$("[data-indispo]", panneau).forEach((bouton) => {
      bouton.addEventListener("click", () => {
        panneau.hidden = true;
        $("#form-quiz").hidden = false;
        choisirSourceQuiz(bouton.dataset.indispo);
      });
    });
  }

  function afficherQuestion() {
    const { questions, index, score } = partieQuiz;
    const question = questions[index];

    $("#quiz-position").textContent = partieQuiz.sansFin
      ? `Question ${index + 1} · sans fin`
      : `Question ${index + 1} / ${questions.length}`;
    $("#quiz-score").textContent = score <= 1 ? `${score} point` : `${score} points`;
    $("#quiz-progression").hidden = partieQuiz.sansFin;
    if (!partieQuiz.sansFin) $("#quiz-barre").style.width = `${(index / questions.length) * 100}%`;
    $("#quiz-question").innerHTML = question.enonce;
    $("#quiz-explication").hidden = true;
    $("#quiz-suivant").hidden = true;

    const conteneur = $("#quiz-reponses");
    conteneur.textContent = "";
    question.choix.forEach((choix, rang) => {
      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.className = "reponse";
      bouton.dataset.rang = rang;
      bouton.innerHTML = choix.texte;
      bouton.addEventListener("click", () => repondre(choix, bouton));
      conteneur.appendChild(bouton);
    });
  }

  function repondre(choix, bouton) {
    const { questions, index, mode } = partieQuiz;
    const question = questions[index];
    if (question.repondu) return;

    question.repondu = true;
    question.reussie = choix.correct;
    question.donnee = choix.texte;
    if (choix.correct) partieQuiz.score += 1;

    if (mode === "immediate") {
      $$("#quiz-reponses .reponse").forEach((autre) => {
        autre.disabled = true;
        if (question.choix[Number(autre.dataset.rang)].correct) autre.classList.add("reponse--juste");
      });
      if (!choix.correct) bouton.classList.add("reponse--faux");

      const explication = $("#quiz-explication");
      explication.className = `explication ${choix.correct ? "explication--juste" : "explication--faux"}`;
      explication.innerHTML = `<strong>${choix.correct ? "Bonne réponse" : "Raté"}</strong> — ${question.explication}`;
      explication.hidden = false;

      const suivant = $("#quiz-suivant");
      suivant.textContent = (partieQuiz.sansFin || index + 1 < questions.length)
        ? "Question suivante" : "Voir mon résultat";
      suivant.hidden = false;
      $("#quiz-score").textContent = partieQuiz.score <= 1 ? `${partieQuiz.score} point` : `${partieQuiz.score} points`;
    } else {
      questionSuivante();
    }
  }

  function questionSuivante() {
    partieQuiz.index += 1;

    if (partieQuiz.index >= partieQuiz.questions.length) {
      if (!partieQuiz.sansFin) { bilanQuiz(); return; }

      const question = partieQuiz.tirer();
      if (!question) {                      // cas limite : le chapitre est à sec
        toast("Tu as fait le tour de ce chapitre !");
        bilanQuiz();
        return;
      }
      partieQuiz.questions.push(question);
    }
    afficherQuestion();
  }

  function bilanQuiz() {
    const { score } = partieQuiz;
    const demandeIA = partieQuiz.demandeIA;
    const questions = partieQuiz.questions.filter((question) => question.repondu);
    const total = questions.length;
    if (!total) {                            // quitté avant la première réponse
      $("#jeu-quiz").hidden = true;
      $("#form-quiz").hidden = false;
      return;
    }
    const pourcentage = Math.round((score / total) * 100);
    const rates = questions.filter((q) => !q.reussie);
    const message = pourcentage === 100 ? "Sans faute — le chapitre est solide."
                  : pourcentage >= 60 ? "Bonne base : reprends les questions ratées."
                  : "À retravailler : relis la fiche avant de refaire un tour.";

    const corrections = rates.length ? `
      <h4 class="bilan-soustitre">À revoir</h4>
      <ul class="bilan-erreurs">
        ${rates.map((q) => `
          <li>
            <span class="bilan-question">${q.enonce}</span>
            <span class="bilan-mauvaise">Ta réponse : ${q.donnee}</span>
            <span class="bilan-bonne">Réponse : ${q.choix.find((c) => c.correct).texte}</span>
            <span class="bilan-explication">${q.explication}</span>
          </li>`).join("")}
      </ul>` : "";

    $("#jeu-quiz").hidden = true;
    const bilan = $("#bilan-quiz");
    bilan.innerHTML = `
      <p class="bilan-score">${score} / ${total}</p>
      <p class="bilan-pourcentage">${pourcentage} % de bonnes réponses</p>
      <p class="bilan-message">${message}</p>
      ${corrections}
      <div class="bilan-actions">
        <button class="bouton-principal" type="button" data-quiz="rejouer">Refaire un quiz</button>
        <button class="bouton-secondaire" type="button" data-quiz="chapitre">Changer de chapitre</button>
        <button class="bouton-secondaire" type="button" data-quiz="enregistrer">Enregistrer le score</button>
      </div>
    `;
    bilan.hidden = false;

    $$("[data-quiz]", bilan).forEach((bouton) => {
      bouton.addEventListener("click", () => {
        const action = bouton.dataset.quiz;
        if (action === "rejouer") {
          if (demandeIA && sampleClaude) {
            afficherVue("ia");
            $("#ia-demande").value = demandeIA;
            rafraichirDemande();
            lancerDemandeIA();
          } else lancerQuiz();
        }
        else if (action === "enregistrer") toast("Score ajouté à ta progression");
        else { bilan.hidden = true; $("#form-quiz").hidden = false; }
      });
    });
  }

  let minuteurQuiz;
  function lancerQuiz() {
    let coursId = etatQuiz.coursId;
    let contexte = "";

    if (etatQuiz.source === "sujet") {
      const sujet = etatQuiz.sujet.trim();
      if (sujet.length < 3) { toast("Indique d'abord le sujet du quiz."); return; }

      const couverture = etatQuiz.couvertureSujet === undefined ? 0.5 : etatQuiz.couvertureSujet;
      const banque = chercherBanque(sujet, etatQuiz.matiereTheme, couverture);
      etatQuiz.couvertureSujet = undefined;
      if (!banque) { panneauSujetIndisponible(sujet); return; }

      coursId = banque.id;
      const resume = sujet.length > 48 ? `${sujet.slice(0, 45)}…` : sujet;
      contexte = `${resume} — questions du chapitre « ${banque.titre} »`;
    }

    const sansFin = etatQuiz.taille === "infini";
    const tirer = ouvrirTirage(coursId);
    const questions = [];
    const voulues = sansFin ? 1 : etatQuiz.taille;
    for (let i = 0; i < voulues; i++) {
      const question = tirer();
      if (!question) break;
      questions.push(question);
    }
    if (!questions.length) { toast("Aucune question disponible pour ce chapitre."); return; }

    const ligneContexte = $("#quiz-contexte");
    ligneContexte.textContent = contexte;
    ligneContexte.hidden = !contexte;

    const form = $("#form-quiz");
    const chargement = $("#chargement-quiz");
    form.hidden = true;
    $("#bilan-quiz").hidden = true;
    $("#indispo-quiz").hidden = true;
    $("#jeu-quiz").hidden = true;
    chargement.hidden = false;

    // Génération simulée (à remplacer par l'appel au service).
    clearTimeout(minuteurQuiz);
    minuteurQuiz = setTimeout(() => {
      chargement.hidden = true;
      partieQuiz = { questions, index: 0, score: 0, mode: etatQuiz.mode, coursId, sansFin, tirer };
      $("#quiz-quitter").textContent = sansFin ? "Terminer et voir mon score" : "Quitter le quiz";
      $("#jeu-quiz").hidden = false;
      afficherQuestion();
    }, 900);
  }

  /** Bascule le formulaire quiz entre « Mes cours » et « Sujet libre ». */
  function choisirSourceQuiz(source) {
    etatQuiz.source = source;
    $$("[data-quiz-source]").forEach((segment) => {
      const actif = segment.dataset.quizSource === source;
      segment.classList.toggle("segment--actif", actif);
      segment.setAttribute("aria-selected", String(actif));
    });
    $$("[data-panneau-quiz]").forEach((panneau) => {
      const actif = panneau.dataset.panneauQuiz === source;
      panneau.classList.toggle("source--masque", !actif);
      panneau.hidden = !actif;
    });
    $("#bouton-quiz").textContent = source === "sujet" ? "Générer le quiz sur ce sujet" : "Générer le quiz";
    $("#mention-quiz").textContent = source === "sujet"
      ? "Décris le sujet de ton choix : le complément affine le niveau et les notions visées."
      : "Les questions sont tirées du chapitre choisi, puis mélangées à chaque partie.";
  }

  function initQuiz() {
    const form = $("#form-quiz");
    if (!form) return;

    $$("[data-quiz-source]").forEach((segment) => {
      segment.addEventListener("click", () => choisirSourceQuiz(segment.dataset.quizSource));
    });

    const champSujet = $("#quiz-sujet");
    champSujet.addEventListener("input", () => {
      etatQuiz.sujet = champSujet.value;
      etatQuiz.matiereTheme = null;
    });

    const champComplement = $("#quiz-complement");
    champComplement.addEventListener("input", () => {
      etatQuiz.complement = champComplement.value;
      $("#compteur-complement").textContent = champComplement.value.length;
    });

    initSelecteurCours({
      liste: "#choix-cours-quiz",
      filtres: "#filtres-quiz",
      etat: etatQuiz,
      filtreCours: (cours) => (QUIZ[cours.id] || []).length > 0,
    });

    const majResumeQuiz = () => {
      $("#resume-quiz").textContent =
        `${etatQuiz.taille === "infini" ? "sans fin" : etatQuiz.taille + " questions"} · correction ${etatQuiz.mode === "immediate" ? "immédiate" : "à la fin"}`;
    };
    brancherPuces("#puces-quiz-taille .puce", "taille", (valeur) => {
      etatQuiz.taille = valeur === "infini" ? "infini" : Number(valeur);
      majResumeQuiz();
    });
    brancherPuces("#puces-quiz-mode .puce", "mode", (valeur) => { etatQuiz.mode = valeur; majResumeQuiz(); });
    majResumeQuiz();

    form.addEventListener("submit", (evt) => { evt.preventDefault(); lancerQuiz(); });
    $("#quiz-suivant").addEventListener("click", questionSuivante);
    $("#quiz-quitter").addEventListener("click", () => {
      if (partieQuiz && partieQuiz.sansFin) { bilanQuiz(); return; }
      $("#jeu-quiz").hidden = true;
      $("#bilan-quiz").hidden = true;
      $("#indispo-quiz").hidden = true;
      form.hidden = false;
    });
  }

  /* ————— Page « FlashCards » ————————————————————————————————————— */

  const etatCartes = { matiere: "toutes", coursId: COURS[0].id, ordre: "melange" };
  let paquet = null;

  function afficherCarte() {
    const carte = paquet.file[0];
    const total = paquet.total;

    $("#carte-flip").classList.remove("carte-flip--retournee");
    $("#verdicts-cartes").hidden = true;
    $("#carte-recto").innerHTML = carte.recto;
    $("#carte-verso").innerHTML = carte.verso;
    $("#cartes-position").textContent = paquet.file.length <= 1
      ? "Dernière carte"
      : `${paquet.file.length} cartes restantes`;
    $("#cartes-score").textContent = paquet.sues.size <= 1
      ? `${paquet.sues.size} sue`
      : `${paquet.sues.size} sues`;
    $("#cartes-barre").style.width = `${(paquet.sues.size / total) * 100}%`;
  }

  function verdictCarte(verdict) {
    const carte = paquet.file.shift();

    if (verdict === "su") {
      paquet.sues.add(carte.id);
    } else {
      paquet.ratees.add(carte.id);
      paquet.sues.delete(carte.id);
      if (!carte.repassee) {           // une seule reprise par carte, pour ne pas boucler
        carte.repassee = true;
        paquet.file.push(carte);
      } else {
        paquet.sues.add(carte.id);     // vue deux fois : on la considère traitée
      }
    }

    if (paquet.file.length) afficherCarte();
    else bilanCartes();
  }

  function bilanCartes() {
    const total = paquet.total;
    const ratees = paquet.ratees.size;
    const duPremierCoup = total - ratees;

    $("#jeu-cartes").hidden = true;
    const bilan = $("#bilan-cartes");
    bilan.innerHTML = `
      <p class="bilan-score">${duPremierCoup} / ${total}</p>
      <p class="bilan-pourcentage">cartes sues du premier coup</p>
      <p class="bilan-message">${ratees
        ? `${ratees} carte${ratees > 1 ? "s" : ""} à replacer dans ta révision espacée.`
        : "Paquet maîtrisé — prochaine révision dans quelques jours."}</p>
      <div class="bilan-actions">
        ${ratees ? '<button class="bouton-principal" type="button" data-cartes="ratees">Rejouer les cartes ratées</button>' : ""}
        <button class="${ratees ? "bouton-secondaire" : "bouton-principal"}" type="button" data-cartes="tout">Rejouer tout le paquet</button>
        <button class="bouton-secondaire" type="button" data-cartes="chapitre">Changer de chapitre</button>
      </div>
    `;
    bilan.hidden = false;

    const idsRates = new Set(paquet.ratees);
    $$("[data-cartes]", bilan).forEach((bouton) => {
      bouton.addEventListener("click", () => {
        const action = bouton.dataset.cartes;
        if (action === "chapitre") { bilan.hidden = true; $("#form-cartes").hidden = false; }
        else lancerCartes(action === "ratees" ? idsRates : null);
      });
    });
  }

  let minuteurCartes;
  function lancerCartes(seulement) {
    const source = FLASHCARDS[etatCartes.coursId] || [];
    let cartes = source.map((carte, i) => ({ ...carte, id: `${etatCartes.coursId}-${i}`, repassee: false }));
    if (seulement) cartes = cartes.filter((c) => seulement.has(c.id));
    if (!cartes.length) { toast("Aucune carte disponible pour ce chapitre."); return; }
    if (etatCartes.ordre === "melange") cartes = melanger(cartes);

    const form = $("#form-cartes");
    form.hidden = true;
    $("#bilan-cartes").hidden = true;
    $("#jeu-cartes").hidden = true;
    $("#chargement-cartes").hidden = false;

    clearTimeout(minuteurCartes);
    minuteurCartes = setTimeout(() => {
      $("#chargement-cartes").hidden = true;
      paquet = { file: cartes, total: cartes.length, sues: new Set(), ratees: new Set() };
      $("#jeu-cartes").hidden = false;
      afficherCarte();
    }, 700);
  }

  function initCartes() {
    const form = $("#form-cartes");
    if (!form) return;

    initSelecteurCours({
      liste: "#choix-cours-cartes",
      filtres: "#filtres-cartes",
      etat: etatCartes,
      filtreCours: (cours) => (FLASHCARDS[cours.id] || []).length > 0,
    });

    brancherPuces("#puces-cartes-ordre .puce", "ordre", (valeur) => { etatCartes.ordre = valeur; });

    form.addEventListener("submit", (evt) => { evt.preventDefault(); lancerCartes(null); });

    $("#carte-flip").addEventListener("click", () => {
      const carte = $("#carte-flip");
      carte.classList.toggle("carte-flip--retournee");
      $("#verdicts-cartes").hidden = !carte.classList.contains("carte-flip--retournee");
    });

    $$("[data-verdict]").forEach((bouton) => {
      bouton.addEventListener("click", () => verdictCarte(bouton.dataset.verdict));
    });

    $("#cartes-quitter").addEventListener("click", () => {
      $("#jeu-cartes").hidden = true;
      $("#bilan-cartes").hidden = true;
      form.hidden = false;
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
    rendreDefis($("#liste-defis"));
    rendreEcheances($("#liste-echeances"));

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

    initCreation();
    initIA();
    initScan();
    initResume();
    initQuiz();
    initCartes();

    $("#bouton-affronter").addEventListener("click", () => toast("Invitation envoyée à un ami 🤺"));

    // Bouton « Changer de niveau » du profil.
    $("#changer-niveau").addEventListener("click", ouvrirEcranNiveau);

    afficherVue("accueil");

    // Première visite : on demande la classe avant tout le reste.
    appliquerNiveau(lireNiveau());
    if (!niveauChoisi) ouvrirEcranNiveau();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
