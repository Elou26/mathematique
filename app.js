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

  /* ————— Bibliothèque de fiches ————————————————————————————————
     Plus aucun cours n'est livré avec l'application : chaque matière
     démarre vide et propose de créer une fiche. Ce que l'utilisateur
     crée reste sur son téléphone.
     ———————————————————————————————————————————————————————————— */

  const CLE_FICHES = "mathematique.fiches";
  const SOURCES_FICHE = {
    scan: "Depuis une photo",
    ia: "Écrite avec Claude",
    texte: "Depuis tes notes",
    cours: "Depuis ton cours",
    libre: "Sujet libre",
  };

  let fiches = [];
  let dossierOuvert = null;

  function lireBibliotheque() {
    try {
      const brut = localStorage.getItem(CLE_FICHES);
      const liste = brut ? JSON.parse(brut) : [];
      if (!Array.isArray(liste)) return [];
      return liste.filter((f) => f && f.id && f.titre && MATIERES[f.matiere]);
    } catch (erreur) { return []; }
  }

  function ecrireBibliotheque() {
    try { localStorage.setItem(CLE_FICHES, JSON.stringify(fiches)); } catch (erreur) { /* stockage indisponible */ }
  }

  /** Ajoute une fiche, ou remonte celle qui porte déjà ce titre dans la matière. */
  function ajouterFiche({ matiere, titre, source, banqueId, contenu, cartes }) {
    const propre = (titre || "").trim().slice(0, 80);
    if (propre.length < 3) return null;

    const cle = MATIERES[matiere] ? matiere : "autre";
    const deja = fiches.find((f) => f.matiere === cle && normaliser(f.titre) === normaliser(propre));
    if (deja) {
      if (banqueId && !deja.banqueId) deja.banqueId = banqueId;
      if (contenu) deja.contenu = contenu;        // une relecture remplace l'ancienne
      if (cartes && cartes.length) deja.cartes = cartes;
      majBibliotheque();
      return deja;
    }

    const maintenant = new Date().toISOString();
    const fiche = {
      id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      matiere: cle,
      titre: propre,
      source: SOURCES_FICHE[source] ? source : "libre",
      banqueId: banqueId || null,
      contenu: contenu || null,       // le résumé lu sur la photo
      cartes: cartes && cartes.length ? cartes : null,
      creee: maintenant,
      derniereRevision: maintenant,
      progression: 0,
    };
    fiches.push(fiche);
    majBibliotheque();
    return fiche;
  }

  function trouverFiche(id) { return fiches.find((f) => f.id === id) || null; }

  function supprimerFiche(id) {
    fiches = fiches.filter((f) => f.id !== id);
    majBibliotheque();
  }

  /** Après une partie : date du jour, et on garde le meilleur score obtenu. */
  function marquerRevisee(id, pourcentage) {
    const fiche = trouverFiche(id);
    if (!fiche) return;
    fiche.derniereRevision = new Date().toISOString();
    if (typeof pourcentage === "number") {
      fiche.progression = Math.max(fiche.progression || 0, pourcentage);
    }
    majBibliotheque();
  }

  /** Porte unique : tout ce qui dépend de la bibliothèque se remet à jour ici. */
  const aRafraichir = [];
  function majBibliotheque() {
    ecrireBibliotheque();
    rendreDossiers();
    rendreEcheances($("#liste-echeances"));
    majCloche();
    majProfil();
    aRafraichir.forEach((rafraichir) => rafraichir());
  }

  /** Les matières du programme, plus celles où l'utilisateur a déjà une fiche. */
  function matieresAffichees() {
    const programme = programmeDuNiveau();
    const cles = programme ? Object.keys(programme) : Object.keys(MATIERES).filter((m) => m !== "autre");
    fiches.forEach((f) => { if (!cles.includes(f.matiere)) cles.push(f.matiere); });
    return cles;
  }

  /** « de Mathématiques », mais « d'Histoire-Géo » (h muet compris). */
  function deLaMatiere(nom) {
    return /^[aeiouyhéèêàâîôûAEIOUYHÉÈÊÀÂÎÔÛ]/.test(nom) ? `d'${nom}` : `de ${nom}`;
  }

  function detailFiche(fiche) {
    const matiere = MATIERES[fiche.matiere];
    const cartes = fiche.cartes && fiche.cartes.length ? ` · ${fiche.cartes.length} cartes` : "";
    return `${matiere ? matiere.nom : "Fiche"} · ${SOURCES_FICHE[fiche.source] || "Sujet libre"}${cartes}`;
  }

  /* ————— Vue « Mes fiches » : une catégorie par matière ————————— */

  function carteFiche(fiche) {
    const jours = joursEntre(fiche.creee, new Date());
    const carte = document.createElement("article");
    carte.className = "carte-cours";
    carte.innerHTML = `
      <div class="carte-entete">
        <h3 class="carte-titre">${echapper(fiche.titre)}</h3>
        <span class="carte-jours">${jours ? accordJours(jours) : "créée aujourd'hui"}</span>
      </div>
      <p class="carte-date">Dernière révision : ${formatDate.format(new Date(fiche.derniereRevision))}</p>
      <div class="barre-progression" role="progressbar" aria-valuemin="0" aria-valuemax="100"
           aria-valuenow="${fiche.progression}" aria-label="Progression de ${echapper(fiche.titre)}">
        <div class="barre-progression-remplie"></div>
      </div>
      <p class="barre-legende">${detailFiche(fiche)} · ${fiche.progression} % maîtrisé</p>
      <div class="carte-actions">
        <button class="bouton-reviser" type="button" data-fiche="reviser">Réviser maintenant</button>
        <button class="bouton-texte" type="button" data-fiche="supprimer">Supprimer</button>
      </div>
    `;

    $$("[data-fiche]", carte).forEach((bouton) => {
      bouton.addEventListener("click", () => {
        if (bouton.dataset.fiche === "reviser") reviserFiche(fiche);
        else { supprimerFiche(fiche.id); toast("Fiche supprimée"); }
      });
    });

    // Remplissage animé au moment de l'affichage.
    requestAnimationFrame(() => {
      $(".barre-progression-remplie", carte).style.width = `${fiche.progression}%`;
    });

    return carte;
  }

  function remplirDossier(contenu, cle, liste) {
    contenu.textContent = "";

    if (!liste.length) {
      const vide = document.createElement("p");
      vide.className = "dossier-vide";
      vide.textContent = `Aucune fiche en ${MATIERES[cle].nom} pour l'instant.`;
      contenu.appendChild(vide);
    } else {
      liste.forEach((fiche) => contenu.appendChild(carteFiche(fiche)));
    }

    const creer = document.createElement("button");
    creer.type = "button";
    creer.className = "bouton-principal";
    creer.textContent = "Créer une fiche de révision";
    creer.addEventListener("click", () => ouvrirFeuilleCreation(cle));
    contenu.appendChild(creer);
  }

  /** Une catégorie par matière : ouverte, elle propose de créer une fiche. */
  function rendreDossiers() {
    const conteneur = $("#liste-tous-cours");
    if (!conteneur) return;
    conteneur.textContent = "";

    matieresAffichees().forEach((cle) => {
      const matiere = MATIERES[cle];
      const liste = fiches.filter((f) => f.matiere === cle);
      const moyenne = liste.length
        ? Math.round(liste.reduce((somme, f) => somme + (f.progression || 0), 0) / liste.length)
        : 0;
      const ouvert = dossierOuvert === cle;

      const dossier = document.createElement("section");
      dossier.className = "dossier" + (ouvert ? " dossier--ouvert" : "");
      dossier.innerHTML = `
        <button class="dossier-tete" type="button" aria-expanded="${ouvert}">
          <span class="dossier-emoji" aria-hidden="true">${matiere.emoji}</span>
          <span class="ligne-texte">
            <span class="ligne-nom">${matiere.nom}</span>
            <span class="ligne-detail">${liste.length} fiche${liste.length > 1 ? "s" : ""} · ${moyenne} %</span>
          </span>
          <svg class="matiere-chevron" aria-hidden="true"><use href="#i-fleche"></use></svg>
        </button>
        <div class="dossier-contenu"${ouvert ? "" : " hidden"}></div>
      `;

      if (ouvert) remplirDossier($(".dossier-contenu", dossier), cle, liste);
      $(".dossier-tete", dossier).addEventListener("click", () => {
        dossierOuvert = ouvert ? null : cle;
        rendreDossiers();
      });
      conteneur.appendChild(dossier);
    });
  }

  /** Rend son texte à un contenu stocké échappé, pour l'envoyer à Claude. */
  function texteBrut(texte) {
    return String(texte || "")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
  }

  /**
   * Réviser une fiche : quiz sur son contenu quand le document a été lu,
   * sinon sur son titre. Claude écrit, les banques locales dépannent.
   */
  function reviserFiche(fiche) {
    etatQuiz.source = "sujet";
    etatQuiz.sujet = fiche.titre;
    etatQuiz.matiereTheme = fiche.matiere === "autre" ? null : fiche.matiere;
    etatQuiz.ficheId = fiche.id;
    etatQuiz.complement = `Fiche « ${fiche.titre} » en ${MATIERES[fiche.matiere].nom}`
      + (niveauChoisi ? `, profil ${libelleNiveau().toLowerCase()}.` : ".");

    // Le document a été lu : les questions portent sur son contenu réel.
    if (fiche.contenu && fiche.contenu.lu) {
      const reperes = []
        .concat(fiche.contenu.points || [], fiche.contenu.formules || [])
        .map(texteBrut)
        .slice(0, 8);
      if (reperes.length) {
        etatQuiz.complement += "\n\nInterroge-moi sur le contenu de cette fiche :\n- " + reperes.join("\n- ");
      }
    }

    afficherVue("quiz");
    choisirSourceQuiz("sujet");
    $("#quiz-sujet").value = fiche.titre;
    $("#quiz-complement").value = etatQuiz.complement;
    $("#compteur-complement").textContent = etatQuiz.complement.length;
    lancerQuiz();
  }

  function majProfil() {
    const total = fiches.length;
    const moyenne = total
      ? Math.round(fiches.reduce((somme, f) => somme + (f.progression || 0), 0) / total)
      : 0;
    if ($("#stat-cours")) $("#stat-cours").textContent = total;
    if ($("#stat-moyenne")) $("#stat-moyenne").textContent = `${moyenne} %`;
    if ($("#stat-serie")) $("#stat-serie").textContent = new Set(fiches.map((f) => f.matiere)).size;
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

  /* ————— Révision espacée ————————————————————————————————————
     La file n'est plus une donnée figée : elle se calcule à partir des
     fiches créées et de leur dernière révision.
     ———————————————————————————————————————————————————————————— */

  function echeancesFiches() {
    const aujourdhui = new Date();
    return fiches
      .map((fiche) => {
        const depuis = joursEntre(fiche.derniereRevision, aujourdhui);
        const palier = PALIERS_REVISION.find((jours) => jours > depuis);
        const reste = palier === undefined ? 0 : palier - depuis;
        const echeance = new Date(minuit(fiche.derniereRevision).getTime()
          + (palier === undefined ? depuis : palier) * JOUR_MS);
        return {
          fiche,
          palier: `J+${palier === undefined ? PALIERS_REVISION[PALIERS_REVISION.length - 1] : palier}`,
          echeance,
          reste,
          etat: reste <= 0 ? "aujourdhui" : reste === 1 ? "demain" : "a-venir",
        };
      })
      .sort((a, b) => a.reste - b.reste);
  }

  function rendreEcheances(conteneur) {
    if (!conteneur) return;
    conteneur.textContent = "";

    const echeances = echeancesFiches();
    if (!echeances.length) {
      const vide = document.createElement("div");
      vide.className = "themes-vide";
      vide.innerHTML = `
        <p class="themes-vide-texte">Rien à revoir pour l'instant : la file se remplit toute seule
        dès que tu crées ta première fiche.</p>
      `;
      const creer = document.createElement("button");
      creer.type = "button";
      creer.className = "bouton-principal";
      creer.textContent = "Créer une fiche de révision";
      creer.addEventListener("click", () => ouvrirFeuilleCreation(null));
      vide.appendChild(creer);
      conteneur.appendChild(vide);
      return;
    }

    echeances.forEach((e) => {
      const quand = e.etat === "aujourdhui" ? "À revoir aujourd'hui"
                  : e.etat === "demain" ? "Demain"
                  : `Dans ${e.reste} jours · ${formatCourt.format(e.echeance)}`;

      const bloc = document.createElement("button");
      bloc.type = "button";
      bloc.className = `echeance echeance--${e.etat}`;
      bloc.innerHTML = `
        <span class="echeance-palier">${e.palier}</span>
        <span class="ligne-texte">
          <span class="echeance-titre">${echapper(e.fiche.titre)}</span>
          <span class="echeance-detail">${MATIERES[e.fiche.matiere] ? MATIERES[e.fiche.matiere].nom + " · " : ""}${quand}</span>
        </span>
        <svg class="ligne-fleche" aria-hidden="true"><use href="#i-horloge"></use></svg>
      `;
      bloc.addEventListener("click", () => reviserFiche(e.fiche));
      conteneur.appendChild(bloc);
    });
  }

  /** Pastille de la cloche : le nombre de fiches à revoir aujourd'hui. */
  function majCloche() {
    const pastille = $("#cloche-compteur");
    if (!pastille) return;
    const dues = echeancesFiches().filter((e) => e.etat === "aujourdhui").length;
    pastille.textContent = dues;
    pastille.hidden = dues === 0;

    const cloche = $(".cloche");
    if (cloche) {
      cloche.setAttribute("aria-label", dues
        ? `Révision espacée — ${dues} fiche${dues > 1 ? "s" : ""} à revoir aujourd'hui`
        : "Révision espacée — rien à revoir aujourd'hui");
    }
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

    if (nom === "scan" && !fiche.pages.length) reinitialiserScan();

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
    rendreDossiers();
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
    etatQuiz.ficheId = null;
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

    const creer = document.createElement("button");
    creer.type = "button";
    creer.className = "bouton-secondaire deplie-creer";
    creer.textContent = `Créer une fiche en ${MATIERES[matiereDepliee].nom}`;
    const ouverte = matiereDepliee;
    creer.addEventListener("click", () => ouvrirFeuilleCreation(ouverte));
    deplie.appendChild(creer);
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

  function emojiMatiere(fiche) {
    const matiere = MATIERES[fiche.matiere];
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
   * Monte un sélecteur « filtre par matière + liste de fiches », partagé par
   * les trois outils. `etat` porte { matiere, ficheId } et est mis à jour en
   * place. Bibliothèque vide : on propose d'en créer une plutôt que d'afficher
   * une liste creuse.
   */
  function initSelecteurCours({ liste, filtres, etat, vide }) {
    const conteneurListe = $(liste);
    const conteneurFiltres = $(filtres);
    if (!conteneurListe || !conteneurFiltres) return;

    const visibles = () =>
      etat.matiere === "toutes" ? fiches.slice() : fiches.filter((f) => f.matiere === etat.matiere);

    function rendreFiltres() {
      const matieres = [...new Set(fiches.map((f) => f.matiere))];
      conteneurFiltres.textContent = "";
      conteneurFiltres.hidden = matieres.length < 2;
      if (matieres.length < 2) return;

      [["toutes", "Toutes"], ...matieres.map((m) => [m, `${MATIERES[m].emoji} ${MATIERES[m].court}`])]
        .forEach(([valeur, libelle]) => {
          const bouton = document.createElement("button");
          bouton.type = "button";
          bouton.className = "puce" + (etat.matiere === valeur ? " puce--active" : "");
          bouton.setAttribute("aria-pressed", String(etat.matiere === valeur));
          bouton.textContent = libelle;
          bouton.addEventListener("click", () => {
            etat.matiere = valeur;
            rendreTout();
          });
          conteneurFiltres.appendChild(bouton);
        });
    }

    function rendreListe() {
      conteneurListe.textContent = "";
      conteneurListe.setAttribute("role", "radiogroup");

      if (!fiches.length) {
        const li = document.createElement("li");
        li.className = "choix-vide";
        const texte = document.createElement("p");
        texte.className = "dossier-vide";
        texte.textContent = vide || "Ta bibliothèque est vide : ta première fiche apparaîtra ici.";
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.className = "bouton-secondaire";
        bouton.textContent = "Créer une fiche";
        bouton.addEventListener("click", () => ouvrirFeuilleCreation(null));
        li.appendChild(texte);
        li.appendChild(bouton);
        conteneurListe.appendChild(li);
        return;
      }

      visibles().forEach((fiche) => {
        const actif = fiche.id === etat.ficheId;
        const li = document.createElement("li");
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.className = "choix" + (actif ? " choix--actif" : "");
        bouton.setAttribute("role", "radio");
        bouton.setAttribute("aria-checked", String(actif));
        bouton.innerHTML = `
          <span class="ligne-pastille">${emojiMatiere(fiche)}</span>
          <span class="choix-texte">
            <span class="choix-nom">${echapper(fiche.titre)}</span>
            <span class="choix-detail">${detailFiche(fiche)}</span>
          </span>
          <span class="choix-marque" aria-hidden="true"></span>
        `;
        bouton.addEventListener("click", () => {
          etat.ficheId = fiche.id;
          rendreListe();
        });
        li.appendChild(bouton);
        conteneurListe.appendChild(li);
      });
    }

    function rendreTout() {
      const restantes = visibles();
      if (!restantes.some((f) => f.id === etat.ficheId)) {
        etat.ficheId = restantes.length ? restantes[0].id : null;
      }
      rendreFiltres();
      rendreListe();
    }

    rendreTout();
    aRafraichir.push(rendreTout);      // la bibliothèque change : le sélecteur suit
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

  let matiereCreation = null;      // matière d'où la feuille a été ouverte

  function ouvrirFeuilleCreation(matiere) {
    matiereCreation = MATIERES[matiere] ? matiere : null;
    $("#feuille-titre").textContent = matiereCreation
      ? `Créer une fiche · ${MATIERES[matiereCreation].nom}`
      : "Option de création de fiche";
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
    const matiere = matiereCreation;
    fermerFeuilleCreation();

    if (option === "scan") {
      afficherVue("scan");
      if (matiere) {
        fiche.matiere = matiere;
        rendreSuggestionsScan(matiere);
        $("#scan-sous-texte").textContent =
          `Fiche ${deLaMatiere(MATIERES[matiere].nom)} : cadre-la, puis choisis ce que tu veux en faire.`;
      }
      return;
    }

    // « Rédiger » ouvre la fiche de résumé sur le texte collé.
    const source = "texte";
    etatResume.source = source;
    if (matiere) etatResume.matiere = matiere;
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
    $("#texte-source").focus();
  }

  /* ————— Feuille « Nommer ta fiche » ——————————————————————————
     Une fiche est un chapitre : avant de la ranger, on propose son
     titre — retouchable — et la matière où elle atterrit.
     ———————————————————————————————————————————————————————————— */

  let validationNom = null;        // ce qu'on fait du titre retenu
  let matiereNom = "autre";

  /** Met un titre libre en forme de chapitre : majuscule initiale, sans ponctuation finale. */
  function enChapitre(texte) {
    const propre = String(texte || "").replace(/\s+/g, " ").trim().replace(/[.,;:!?]+$/, "");
    if (!propre) return "";
    return propre.charAt(0).toUpperCase() + propre.slice(1);
  }

  function rendreMatieresNom() {
    const conteneur = $("#nom-matieres");
    conteneur.textContent = "";
    const cles = matieresAffichees().slice();
    if (!cles.includes(matiereNom)) cles.push(matiereNom);
    if (!cles.includes("autre")) cles.push("autre");

    cles.forEach((cle) => {
      const puce = document.createElement("button");
      puce.type = "button";
      puce.className = "puce" + (cle === matiereNom ? " puce--active" : "");
      puce.setAttribute("aria-pressed", String(cle === matiereNom));
      puce.textContent = `${MATIERES[cle].emoji} ${MATIERES[cle].court}`;
      puce.addEventListener("click", () => {
        matiereNom = cle;
        rendreMatieresNom();
        rendreSuggestionsNom();
      });
      conteneur.appendChild(puce);
    });
  }

  /** Les chapitres du programme de la matière, pour nommer sans tout retaper. */
  function rendreSuggestionsNom() {
    const conteneur = $("#nom-suggestions");
    const etiquette = $("#nom-etiquette-themes");
    const programme = programmeDuNiveau();
    const themes = programme && programme[matiereNom] ? programme[matiereNom].slice(0, 4) : [];

    conteneur.textContent = "";
    etiquette.hidden = !themes.length;
    themes.forEach((theme) => {
      const puce = document.createElement("button");
      puce.type = "button";
      puce.className = "puce";
      puce.textContent = theme;
      puce.addEventListener("click", () => { $("#nom-champ").value = theme; });
      conteneur.appendChild(puce);
    });
  }

  function ouvrirFeuilleNom({ titre, matiere, action, surValider }) {
    validationNom = surValider;
    matiereNom = MATIERES[matiere] ? matiere : "autre";

    const champ = $("#nom-champ");
    champ.value = enChapitre(titre);
    $("#nom-valider").textContent = action || "Enregistrer la fiche";
    rendreMatieresNom();
    rendreSuggestionsNom();

    $("#feuille-fond").hidden = false;
    $("#feuille-nom").hidden = false;
    document.body.classList.add("corps--bloque");
    // Le clavier arrive après la montée de la feuille.
    setTimeout(() => { champ.focus(); champ.select(); }, 260);
  }

  function fermerFeuilleNom() {
    validationNom = null;
    $("#feuille-nom").hidden = true;
    $("#feuille-fond").hidden = true;
    document.body.classList.remove("corps--bloque");
  }

  function validerNom() {
    const nom = enChapitre($("#nom-champ").value);
    if (nom.length < 3) { toast("Donne un titre d'au moins 3 caractères."); return; }
    const suite = validationNom;
    const matiere = matiereNom;
    fermerFeuilleNom();
    if (suite) suite(nom, matiere);
  }

  function initNom() {
    const form = $("#form-nom");
    if (!form) return;
    form.addEventListener("submit", (evt) => { evt.preventDefault(); validerNom(); });
    $("#nom-annuler").addEventListener("click", fermerFeuilleNom);
  }

  function fermerLesFeuilles() {
    if (!$("#feuille-creation").hidden) fermerFeuilleCreation();
    if (!$("#feuille-nom").hidden) fermerFeuilleNom();
  }

  function initCreation() {
    const bouton = $("#ouvrir-creation");
    if (!bouton) return;

    bouton.addEventListener("click", () => ouvrirFeuilleCreation(null));
    $("#feuille-fond").addEventListener("click", fermerLesFeuilles);
    $("#fermer-creation").addEventListener("click", fermerFeuilleCreation);
    $$("[data-creation]").forEach((tuile) => {
      tuile.addEventListener("click", () => lancerCreation(tuile.dataset.creation));
    });

    document.addEventListener("keydown", (evt) => {
      if (evt.key === "Escape") fermerLesFeuilles();
    });
  }

  /* ————— Page « Photographier mon cours » ————————————————————————
     Une leçon, un devoir ou un contrôle en photo. Claude lit les pages
     (c'est lui l'OCR) et en tire une fiche de révision et un paquet de
     flashcards. Sans lui, on garde le chemin manuel : on confirme le
     thème et on travaille sur les banques locales.
     ———————————————————————————————————————————————————————————— */

  const TYPES_DOCUMENT = {
    lecon: {
      nom: "leçon",
      aide: "Le cours, la leçon du cahier ou la fiche du manuel.",
      consigne: "C'est une leçon : garde la structure du cours, les définitions, les formules et les repères.",
    },
    devoir: {
      nom: "devoir",
      aide: "Un exercice, un DM, une feuille d'entraînement — corrigée ou non.",
      consigne: "C'est un devoir : retiens les méthodes de résolution, les étapes attendues et les erreurs à éviter ; "
        + "les flashcards portent sur la méthode et sur les notions mobilisées.",
    },
    controle: {
      nom: "contrôle",
      aide: "Un contrôle rendu, un DS, un bac blanc — avec ou sans corrigé.",
      consigne: "C'est un contrôle : cible ce qui est tombé et ce qui a été raté ; "
        + "les flashcards reprennent les questions du contrôle et leur réponse attendue.",
    },
  };

  const CONSIGNE_LECTURE = [
    "Tu es professeur et tu aides un élève francophone à réviser.",
    "",
    "Les images jointes sont les pages d'un même document : <<<TYPE>>>.",
    "<<<CONSIGNE_TYPE>>>",
    "Profil de l'élève : <<<PROFIL>>>.",
    "",
    "Lis ces pages (texte imprimé comme manuscrit) et réponds uniquement avec un objet JSON de cette forme :",
    '{"lisible": true, "titre": "Titre de chapitre, court", "matiere": "<<<MATIERES>>>",',
    ' "resume": {"accroche": "une phrase qui situe le chapitre",',
    '            "points": ["3 à 6 points essentiels"],',
    '            "formules": ["formules, dates ou repères clés, 0 à 6"],',
    '            "exemples": ["exemples corrigés tirés du document, 0 à 3"],',
    '            "pieges": ["erreurs classiques, 0 à 4"]},',
    ' "flashcards": [{"recto": "question courte", "verso": "réponse courte"}]}',
    "",
    "Règles :",
    "- reste fidèle au document : n'invente rien qui ne s'y trouve pas ;",
    "- 6 à 12 flashcards, recto = une question, verso = la réponse en une ligne ;",
    "- texte brut uniquement, pas de HTML ni de Markdown ;",
    '- si les pages sont illisibles ou ne contiennent pas de cours, réponds {"lisible": false, "raison": "…"} ;',
    "- tout est en français, calé sur le niveau de l'élève ;",
    "- aucun texte en dehors du JSON.",
  ].join("\n");

  const fiche = { pages: [], apercus: [], type: "lecon", nom: "", sujet: "", matiere: null, lecture: null };
  let controleurScan = null;

  /** Coupe et échappe : ce que Claude renvoie est affiché, jamais interprété. */
  function nettoyer(texte, max = 240) {
    return echapper(String(texte == null ? "" : texte).replace(/\s+/g, " ").trim().slice(0, max));
  }

  function listeNettoyee(valeur, maximum, max = 240) {
    if (!Array.isArray(valeur)) return [];
    return valeur.map((e) => nettoyer(e, max)).filter((e) => e.length > 1).slice(0, maximum);
  }

  /** Vérifie la lecture renvoyée par Claude ; null si elle n'est pas exploitable. */
  function validerLecture(donnees, { minCartes = 3 } = {}) {
    if (!donnees || typeof donnees !== "object") return null;
    if (donnees.lisible === false) return { illisible: true, raison: nettoyer(donnees.raison, 160) };

    const titre = nettoyer(donnees.titre, 80);
    const brut = donnees.resume && typeof donnees.resume === "object" ? donnees.resume : {};
    const points = listeNettoyee(brut.points, 8);
    const cartes = (Array.isArray(donnees.flashcards) ? donnees.flashcards : [])
      .filter((c) => c && typeof c === "object")
      .map((c) => ({ recto: nettoyer(c.recto, 200), verso: nettoyer(c.verso, 300) }))
      .filter((c) => c.recto.length > 2 && c.verso.length > 0)
      .slice(0, 20);

    if (titre.length < 3 || !points.length || cartes.length < minCartes) return null;

    return {
      titre,
      matiere: MATIERES[donnees.matiere] ? donnees.matiere : null,
      contenu: {
        lu: true,
        accroche: nettoyer(brut.accroche, 300) || `Fiche tirée de ${TYPES_DOCUMENT[fiche.type].nom}.`,
        points,
        formules: listeNettoyee(brut.formules, 6),
        exemples: listeNettoyee(brut.exemples, 3, 400),
        pieges: listeNettoyee(brut.pieges, 4),
        libelleFormules: "Formules & repères",
      },
      cartes,
    };
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

  /** Vignettes des pages ajoutées, avec retrait au clic. */
  function rendrePagesScan() {
    const bande = $("#scan-pages");
    if (!bande) return;
    bande.textContent = "";
    bande.hidden = fiche.apercus.length < 1;

    fiche.apercus.forEach((url, rang) => {
      const vignette = document.createElement("button");
      vignette.type = "button";
      vignette.className = "scan-page";
      vignette.setAttribute("aria-label", `Retirer la page ${rang + 1}`);
      vignette.innerHTML = `<img src="${url}" alt=""><span class="scan-page-numero">${rang + 1}</span>`;
      vignette.addEventListener("click", () => retirerPage(rang));
      bande.appendChild(vignette);
    });

    const apercu = $("#scan-apercu");
    if (fiche.apercus.length) {
      apercu.src = fiche.apercus[fiche.apercus.length - 1];
      apercu.hidden = false;
      $("#scanner").classList.add("scanner--capture");
      $("#scan-aide").hidden = true;
    } else {
      apercu.hidden = true;
      apercu.removeAttribute("src");
      $("#scanner").classList.remove("scanner--capture");
      $("#scan-aide").hidden = false;
    }

    const prete = fiche.pages.length > 0;
    $("#scan-capture").hidden = prete;
    $("#scan-lecture").hidden = !prete;
    const pages = fiche.pages.length > 1 ? `mes ${fiche.pages.length} pages` : "ma page";
    $("#scan-analyser").textContent = peutLirePhotos()
      ? `Lire ${pages} et créer ma fiche`
      : `Lire ${pages} sur mon appareil`;
    $("#scan-manuel").hidden = peutLirePhotos() || !prete;
    etapesScan(prete ? ["cadrage"] : []);
  }

  function retirerPage(rang) {
    URL.revokeObjectURL(fiche.apercus[rang]);
    fiche.pages.splice(rang, 1);
    fiche.apercus.splice(rang, 1);
    rendrePagesScan();
  }

  function ajouterPages(fichiers) {
    const images = Array.from(fichiers || []).filter((f) => f && f.type.startsWith("image/"));
    if (!images.length) { toast("Choisis une photo de ta page."); return; }

    const maximum = maxPagesScan();
    images.forEach((image) => {
      if (fiche.pages.length >= maximum) return;
      fiche.pages.push(image);
      fiche.apercus.push(URL.createObjectURL(image));
      if (!fiche.nom) fiche.nom = image.name || "page.jpg";
    });
    if (fiche.pages.length >= maximum) toast(`${maximum} pages au maximum par document.`);

    messageScan("");
    $("#scan-resultat").hidden = true;
    $("#scan-fiche-lue").hidden = true;
    rendrePagesScan();
  }

  function reinitialiserScan() {
    fiche.apercus.forEach((url) => URL.revokeObjectURL(url));
    fiche.pages = [];
    fiche.apercus = [];
    fiche.nom = "";
    fiche.sujet = "";
    fiche.matiere = null;
    fiche.lecture = null;

    $("#scan-balayage").hidden = true;
    $("#scan-resultat").hidden = true;
    $("#scan-fiche-lue").hidden = true;
    $("#scan-sujet").value = "";
    $("#chargement-scan").hidden = true;
    $("#scan-stop").hidden = true;
    messageScan("");
    $("#scan-sous-texte").textContent = "Prends en photo ta leçon, ton devoir ou ton contrôle : "
      + "la fiche de révision et les flashcards en sont tirées.";
    rendrePagesScan();
    afficherMoteurScan();
  }

  function messageScan(texte, ton) {
    const ligne = $("#scan-message");
    if (!ligne) return;
    ligne.textContent = texte || "";
    ligne.className = `ia-message${ton ? " ia-message--" + ton : ""}`;
    ligne.hidden = !texte;
  }

  /** Pourquoi la lecture est possible — ou non. */
  function raisonLecture() {
    if (!claudeResolu) return { etat: "attente", texte: "Connexion à Claude…" };
    if (peutLirePhotos()) return { etat: "prete", texte: "✳︎ Claude lit tes pages et en tire la fiche et les cartes." };
    const secours = "Ton appareil peut lire la page lui-même, gratuitement et sans compte "
      + "(~10 Mo à télécharger la première fois) : le texte est repris tel quel, la fiche est plus brute.";
    if (!sampleClaude) {
      return {
        etat: "sans-claude",
        texte: "Claude n'est pas joignable sur cette page — sa lecture se fait sur ton compte, "
          + "connecte-toi à claude.ai puis rouvre ce lien pour en profiter. " + secours,
      };
    }
    return {
      etat: "sans-images",
      texte: "Claude répond ici, mais cette vue ne peut pas lui envoyer de photos. " + secours,
    };
  }

  function afficherMoteurScan() {
    const ligne = $("#scan-moteur");
    if (!ligne) return;
    const raison = raisonLecture();
    const prete = raison.etat === "prete";

    ligne.textContent = raison.texte;
    ligne.classList.toggle("ia-moteur--actif", prete);
    ligne.hidden = raison.etat === "attente";

    // Le même constat, juste au-dessus du bouton : c'est là qu'on le cherche.
    const note = $("#scan-raison");
    if (note) {
      note.textContent = prete || raison.etat === "attente" ? "" : raison.texte;
      note.hidden = prete || raison.etat === "attente";
    }
  }

  /** Lance la lecture des pages par Claude. */
  async function lirePages() {
    const type = TYPES_DOCUMENT[fiche.type];
    const invite = CONSIGNE_LECTURE
      .replace("<<<TYPE>>>", type.nom)
      .replace("<<<CONSIGNE_TYPE>>>", type.consigne)
      .replace("<<<PROFIL>>>", niveauChoisi ? libelleNiveau().toLowerCase() : "non précisé")
      .replace("<<<MATIERES>>>", Object.keys(MATIERES).join("|"));

    controleurScan = new AbortController();
    $("#scan-lecture").hidden = true;
    $("#chargement-scan").hidden = false;
    $("#scan-stop").hidden = false;
    $("#scan-balayage").hidden = false;
    $("#scan-progres").textContent = "Claude lit tes pages…";
    messageScan("");
    etapesScan(["cadrage", "lecture"]);

    let aCommence = false;
    const rappel = setTimeout(() => {
      if (!aCommence) {
        $("#scan-progres").textContent = "Toujours en attente… Si une demande d'autorisation s'est ouverte, accepte-la.";
      }
    }, 20000);

    try {
      const donnees = await sampleClaude.json(invite, {
        images: fiche.pages,
        modelTier: "default",
        cache: false,
        signal: controleurScan.signal,
        onText: ({ text }) => {
          aCommence = true;
          $("#scan-progres").textContent = `Claude rédige ta fiche… (${text.length} caractères)`;
        },
      });

      const lecture = validerLecture(donnees);
      if (!lecture) throw { code: "invalid_json", message: "forme inattendue" };
      if (lecture.illisible) {
        messageScan(lecture.raison
          ? `Pages non exploitées : ${lecture.raison}`
          : "Ces pages n'ont pas pu être lues. Reprends la photo à plat, bien éclairée.", "erreur");
        etapesScan(["cadrage"]);
        return;
      }

      fiche.lecture = lecture;
      if (lecture.matiere) fiche.matiere = lecture.matiere;
      fiche.sujet = lecture.titre;
      etapesScan(["cadrage", "lecture", "notions"]);
      afficherLecture(lecture);
      return;                          // le bloc de capture reste fermé
    } catch (erreur) {
      const code = erreur && erreur.code ? erreur.code : "upstream_error";
      etapesScan(["cadrage"]);
      if (code === "cancelled") { messageScan("Lecture arrêtée."); return; }
      if (code === "images_unavailable") {
        limitesClaude = null;
        afficherMoteurScan();
        messageScan("Les photos ne peuvent pas être envoyées depuis cette page : indique le thème à la main.", "erreur");
        ouvrirEtapeManuelle();
        return;
      }
      messageScan(MESSAGES_IA[code] || MESSAGES_IA.upstream_error, REPLIS_LOCAUX.has(code) ? null : "erreur");
      if (REPLIS_LOCAUX.has(code) && code !== "rate_limited") { sampleClaude = null; afficherMoteurIA(); afficherMoteurScan(); }
      ouvrirEtapeManuelle();
    } finally {
      clearTimeout(rappel);
      controleurScan = null;
      $("#chargement-scan").hidden = true;
      $("#scan-stop").hidden = true;
      $("#scan-balayage").hidden = true;
      $("#scan-lecture").hidden = fiche.pages.length === 0 || Boolean(fiche.lecture);
    }
  }

  /** Le document a été lu : on montre ce qui en a été tiré. */
  function afficherLecture(lecture) {
    const apercu = $("#scan-fiche-lue");
    const parAppareil = lecture.contenu && lecture.contenu.moteur === "ocr";
    const pages = `${fiche.pages.length} page${fiche.pages.length > 1 ? "s" : ""}`;
    apercu.innerHTML = `
      <header class="fiche-entete">
        <p class="fiche-etiquette">${TYPES_DOCUMENT[fiche.type].nom} ${parAppareil ? "lue sur ton appareil" : "lue par Claude"} · ${pages}</p>
        <h3 class="fiche-titre">${lecture.titre}</h3>
        <p class="fiche-soustexte">${lecture.matiere ? MATIERES[lecture.matiere].nom + " · " : ""}${lecture.cartes.length} flashcards prêtes</p>
      </header>
      <p class="fiche-accroche">${lecture.contenu.accroche}</p>
      ${sectionFiche("L'essentiel", lecture.contenu.points.slice(0, 3), "fiche-section--points")}
      ${parAppareil && lecture.texte ? `
        <details class="reglages">
          <summary>Voir le texte lu</summary>
          <p class="texte-lu">${echapper(String(lecture.texte).slice(0, 4000))}</p>
        </details>` : ""}
    `;
    apercu.hidden = false;

    $("#scan-sujet").value = lecture.titre;
    $("#outil-cartes-detail").textContent = lecture.cartes.length
      ? `${lecture.cartes.length} cartes`
      : "aucune carte";
    $("#scan-sous-texte").textContent = "Document lu. Vérifie le titre, puis choisis ce que tu veux en faire.";
    rendreSuggestionsScan(null);
    $("#scan-resultat").hidden = false;
    $("#scan-resultat").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /** Repli : pas de lecture, on demande le thème à la main. */
  function ouvrirEtapeManuelle() {
    fiche.lecture = null;
    $("#scan-fiche-lue").hidden = true;
    $("#outil-cartes-detail").textContent = "Recto-verso";
    $("#scan-sous-texte").textContent = "Indique le thème de ce document, puis choisis quoi en faire.";
    rendreSuggestionsScan(fiche.matiere);
    $("#scan-resultat").hidden = false;
    $("#scan-resultat").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /**
   * Lecture de secours, sur l'appareil : Tesseract lit, des règles mettent
   * en fiche (voir ocr.js). Aucun compte, rien à payer, résultat plus brut —
   * et on le dit au lecteur plutôt que de le laisser croire à une IA.
   */
  async function lireSurAppareil() {
    if (typeof OCR === "undefined") { ouvrirEtapeManuelle(); return; }

    controleurScan = new AbortController();
    $("#scan-lecture").hidden = true;
    $("#chargement-scan").hidden = false;
    $("#scan-stop").hidden = false;
    $("#scan-balayage").hidden = false;
    $("#scan-progres").textContent = "Préparation du moteur de lecture…";
    messageScan("");
    etapesScan(["cadrage", "lecture"]);

    const pourcent = (part) => `${Math.round(Math.min(Math.max(part, 0), 1) * 100)} %`;

    try {
      const lecture = await OCR.lire(fiche.pages, {
        signal: controleurScan.signal,
        surProgres: ({ etape, part }) => {
          if (etape === "chargement") {
            $("#scan-progres").textContent = `Téléchargement du moteur de lecture… ${pourcent(part)}`;
          } else if (etape === "page") {
            const rang = Math.round(part * fiche.pages.length) + 1;
            $("#scan-progres").textContent = fiche.pages.length > 1
              ? `Lecture de la page ${Math.min(rang, fiche.pages.length)} sur ${fiche.pages.length}…`
              : "Lecture de ta page…";
          } else {
            $("#scan-progres").textContent = `Lecture du texte… ${pourcent(part)}`;
          }
        },
      });

      const brute = OCR.structurer(lecture.texte, fiche.type);
      // Sur l'appareil, une seule carte vaut mieux que rien : on n'exige pas les trois.
      const propre = validerLecture({
        lisible: true,
        titre: brute.titre,
        matiere: brute.matiere,
        resume: brute.contenu,
        flashcards: brute.cartes,
      }, { minCartes: 0 });

      if (!propre) {
        messageScan("J'ai lu du texte, mais pas de quoi en tirer une fiche fiable. "
          + "Reprends la photo bien à plat, ou indique le thème à la main.", "erreur");
        etapesScan(["cadrage"]);
        ouvrirEtapeManuelle();
        return;
      }

      propre.contenu.moteur = "ocr";
      propre.contenu.accroche = brute.contenu.accroche;
      propre.contenu.libelleFormules = brute.contenu.libelleFormules;
      propre.texte = lecture.texte;

      fiche.lecture = propre;
      if (propre.matiere) fiche.matiere = propre.matiere;
      fiche.sujet = propre.titre;
      etapesScan(["cadrage", "lecture", "notions"]);
      afficherLecture(propre);
      return;
    } catch (erreur) {
      const code = erreur && erreur.code ? erreur.code : "echec";
      etapesScan(["cadrage"]);
      if (code === "cancelled") { messageScan("Lecture arrêtée."); }
      else if (code === "moteur_absent") {
        messageScan("Le moteur de lecture n'a pas pu être chargé sur cette page "
          + "(connexion ou blocage du navigateur). Indique le thème à la main.", "erreur");
      } else if (code === "illisible") {
        messageScan("Presque rien n'a été lu sur cette photo. Reprends-la à plat, bien éclairée, "
          + "ou indique le thème à la main.", "erreur");
      } else {
        messageScan("La lecture a échoué sur cet appareil. Indique le thème à la main.", "erreur");
      }
      if (code !== "cancelled") ouvrirEtapeManuelle();
    } finally {
      controleurScan = null;
      $("#chargement-scan").hidden = true;
      $("#scan-stop").hidden = true;
      $("#scan-balayage").hidden = true;
      $("#scan-lecture").hidden = fiche.pages.length === 0 || Boolean(fiche.lecture);
    }
  }

  function lancerLecture() {
    if (!fiche.pages.length) { toast("Prends d'abord ta page en photo."); return; }

    if (!claudeResolu && attenteClaude) {
      $("#scan-progres").textContent = "Connexion à Claude…";
      $("#chargement-scan").hidden = false;
      attenteClaude.then(() => { $("#chargement-scan").hidden = true; lancerLecture(); });
      return;
    }
    if (!peutLirePhotos()) { lireSurAppareil(); return; }
    lirePages();
  }

  function initScan() {
    const capture = $("#scan-photo");
    if (!capture) return;

    [capture, $("#scan-galerie"), $("#scan-page-plus")].forEach((champ) => {
      champ.addEventListener("change", () => {
        ajouterPages(champ.files);
        champ.value = "";               // pour pouvoir reprendre la même photo
      });
    });

    brancherPuces("#scan-types .puce", "type", (valeur) => {
      fiche.type = TYPES_DOCUMENT[valeur] ? valeur : "lecon";
      $("#scan-type-aide").textContent = TYPES_DOCUMENT[fiche.type].aide;
    });

    $("#scan-analyser").addEventListener("click", lancerLecture);
    $("#scan-stop").addEventListener("click", () => { if (controleurScan) controleurScan.abort(); });
    $("#scan-manuel").addEventListener("click", ouvrirEtapeManuelle);
    $("#scan-recommencer").addEventListener("click", reinitialiserScan);
    $("#scan-refaire").addEventListener("click", reinitialiserScan);

    $("#scan-sujet").addEventListener("input", (evt) => {
      fiche.sujet = evt.target.value;
      $$("#scan-suggestions .puce").forEach((puce) => puce.classList.remove("puce--active"));
    });

    $$("[data-scan-outil]").forEach((tuile) => {
      tuile.addEventListener("click", () => exploiterFiche(tuile.dataset.scanOutil));
    });
  }

  /** Envoie la fiche scannée vers l'un des trois outils — et l'ajoute à la bibliothèque. */
  function exploiterFiche(outil) {
    const sujet = $("#scan-sujet").value.trim();
    if (sujet.length < 3) {
      toast("Indique le thème de ta fiche pour continuer.");
      $("#scan-sujet").focus();
      return;
    }
    fiche.sujet = sujet;
    const chapitre = chercherBanque(sujet, fiche.matiere);

    // On nomme la fiche comme un chapitre avant de la ranger.
    ouvrirFeuilleNom({
      titre: sujet,
      matiere: fiche.matiere || (chapitre ? chapitre.matiere : "autre"),
      action: "Enregistrer et continuer",
      surValider: (nom, matiere) => rangerFicheScannee(nom, matiere, outil),
    });
  }

  /** La fiche est nommée : on la range avec ce qui a été lu, puis on ouvre l'outil. */
  function rangerFicheScannee(nom, matiere, outil) {
    const sujet = nom;
    const lecture = fiche.lecture;
    const banque = chercherBanque(nom, matiere === "autre" ? null : matiere);
    const enregistree = ajouterFiche({
      matiere,
      titre: nom,
      source: "scan",
      banqueId: banque ? banque.id : null,
      contenu: lecture ? lecture.contenu : null,
      cartes: lecture ? lecture.cartes : null,
    });
    if (enregistree) {
      toast(lecture
        ? `Fiche « ${enregistree.titre} » et ${lecture.cartes.length} cartes rangées en ${MATIERES[matiere].nom}`
        : `Fiche « ${enregistree.titre} » rangée en ${MATIERES[matiere].nom}`);
    }

    if (outil === "quiz") {
      if (enregistree) { reviserFiche(enregistree); return; }
      etatQuiz.sujet = sujet;
      etatQuiz.matiereTheme = matiere === "autre" ? null : matiere;
      etatQuiz.ficheId = null;
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
      if (enregistree && cartesDeLaFiche(enregistree).length) {
        etatCartes.ficheId = enregistree.id;
        lancerCartes(null);
      } else {
        toast("Pas de cartes pour cette fiche : lance plutôt un quiz.");
        $("#form-cartes").hidden = false;
        $("#jeu-cartes").hidden = true;
        $("#bilan-cartes").hidden = true;
      }
      return;
    }

    // Résumé : on part de la fiche enregistrée, sinon de la photo elle-même.
    afficherVue("resume");
    $("#form-resume").hidden = false;
    if (enregistree) {
      etatResume.source = "cours";
      etatResume.ficheId = enregistree.id;
      etatResume.matiere = "toutes";
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

  /* ————— Page « Créer résumé » ————————————————————————————————— */

  const etatResume = {
    source: "cours",        // cours | texte | fichier
    matiere: "toutes",
    ficheId: null,
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
      const fiche = trouverFiche(etatResume.ficheId);
      if (!fiche) return null;
      return {
        titre: fiche.titre,
        sousTitre: detailFiche(fiche),
        contenu: fiche.contenu || RESUMES[fiche.banqueId] || RESUME_GENERIQUE,
        matiere: fiche.matiere,
        ficheId: fiche.id,
      };
    }
    if (etatResume.source === "fichier") {
      return {
        titre: etatResume.fichier ? etatResume.fichier.replace(/\.[^.]+$/, "") : "Document importé",
        sousTitre: "À partir d'un fichier importé",
        contenu: RESUME_GENERIQUE,
        matiere: null,
        ficheId: null,
      };
    }
    return {
      titre: "Texte collé",
      sousTitre: "À partir de tes notes",
      contenu: RESUME_GENERIQUE,
      matiere: null,
      ficheId: null,
    };
  }

  /** Vérifie que la source est exploitable ; renvoie un message d'erreur ou null. */
  function erreurSource() {
    if (etatResume.source === "cours" && !trouverFiche(etatResume.ficheId)) {
      return fiches.length
        ? "Choisis d'abord une fiche à résumer."
        : "Ta bibliothèque est vide : crée d'abord une fiche.";
    }
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

  /** Les cartes d'une fiche : celles lues sur le document, sinon une banque. */
  function cartesDeLaFiche(fiche) {
    if (!fiche) return [];
    if (fiche.cartes && fiche.cartes.length) {
      return fiche.cartes.map((carte) => ({ recto: carte.recto, verso: carte.verso }));
    }
    const banqueId = banqueDeLaFiche(fiche);
    return banqueId ? (FLASHCARDS[banqueId] || []).slice() : [];
  }

  /** Le chapitre de secours associé à une fiche, s'il en existe un. */
  function banqueDeLaFiche(fiche) {
    if (!fiche) return null;
    if (fiche.banqueId && (FLASHCARDS[fiche.banqueId] || []).length) return fiche.banqueId;
    const trouve = chercherBanque(fiche.titre, fiche.matiere === "autre" ? null : fiche.matiere);
    return trouve && (FLASHCARDS[trouve.id] || []).length ? trouve.id : null;
  }

  /**
   * Range le résumé affiché dans la bibliothèque. La fiche est d'abord
   * nommée comme un chapitre, sauf si elle y est déjà : `suite` reçoit
   * alors la fiche retenue.
   */
  function enregistrerLaFiche(source, suite) {
    if (source.ficheId) {
      const deja = trouverFiche(source.ficheId);
      if (deja) { marquerRevisee(deja.id); suite(deja); return; }
    }
    const reconnu = chercherBanque(source.titre, null);
    const matiere = source.matiere
      || (etatResume.matiere !== "toutes" ? etatResume.matiere : null)
      || (reconnu ? reconnu.matiere : "autre");

    ouvrirFeuilleNom({
      titre: source.titre,
      matiere,
      surValider: (nom, choisie) => {
        const banque = chercherBanque(nom, choisie === "autre" ? null : choisie) || reconnu;
        const gardee = ajouterFiche({
          matiere: choisie,
          titre: nom,
          source: etatResume.source === "cours" ? "cours" : "texte",
          banqueId: banque ? banque.id : null,
        });
        if (!gardee) { toast("Donne un titre à ta fiche pour l'enregistrer."); return; }
        suite(gardee);
      },
    });
  }

  function rendreFiche() {
    const fiche = $("#fiche-resume");
    const source = sourceChoisie();
    if (!source) return;
    const { titre, sousTitre, contenu } = source;
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
        <button class="bouton-principal" type="button" data-action="enregistrer">Enregistrer dans mes fiches</button>
        <button class="bouton-secondaire" type="button" data-action="flashcards">Générer des flashcards</button>
        <button class="bouton-secondaire" type="button" data-action="refaire">Régénérer</button>
      </div>
    `;

    $$("[data-action]", fiche).forEach((bouton) => {
      bouton.addEventListener("click", () => {
        const action = bouton.dataset.action;
        if (action === "refaire") { genererResume(); return; }

        enregistrerLaFiche(source, (gardee) => {
          if (action === "enregistrer") {
            toast(`Fiche « ${gardee.titre} » enregistrée en ${MATIERES[gardee.matiere].nom}`);
            return;
          }
          // Flashcards : seulement si un paquet existe pour ce sujet.
          if (!cartesDeLaFiche(gardee).length) {
            toast("Pas encore de cartes pour ce sujet : lance plutôt un quiz.");
            return;
          }
          etatCartes.ficheId = gardee.id;
          afficherVue("flashcards");
          lancerCartes(null);
        });
      });
    });

    fiche.hidden = false;
    fiche.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  let minuteurGeneration;
  function genererResume() {
    const erreur = erreurSource();
    if (erreur) { toast(erreur); return; }

    // Fiche déjà lue sur la photo : il n'y a rien à générer, on l'affiche.
    const source = sourceChoisie();
    if (source && source.contenu && source.contenu.lu) {
      $("#chargement-resume").hidden = true;
      $("#bouton-generer").textContent = "Regénérer le résumé";
      rendreFiche();
      return;
    }

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
      vide: "Aucune fiche à résumer : crée-en une, elle apparaîtra ici.",
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
  let attenteClaude = null;
  let limitesClaude = null;       // { images: { maxCount, mediaTypes } } quand les photos passent

  /** La vue publiée peut-elle envoyer des photos à Claude ? */
  function peutLirePhotos() {
    return Boolean(sampleClaude && limitesClaude && limitesClaude.images);
  }

  function maxPagesScan() {
    const max = limitesClaude && limitesClaude.images ? limitesClaude.images.maxCount : 4;
    return Math.max(1, Math.min(max || 4, 8));
  }

  function preparerClaude() {
    attenteClaude = resoudreClaude();
    return attenteClaude;
  }

  async function resoudreClaude() {
    try {
      if (typeof claude === "undefined" || !claude || typeof claude.use !== "function") return;
      sampleClaude = await claude.use("sample");
      if (sampleClaude && typeof sampleClaude.limits === "function") {
        limitesClaude = await sampleClaude.limits().catch(() => null);
      }
    } catch (erreur) {
      sampleClaude = null;
    } finally {
      claudeResolu = true;
      afficherMoteurIA();
      if ($("#scan-moteur")) { afficherMoteurScan(); rendrePagesScan(); }
      const accepte = limitesClaude && limitesClaude.images && limitesClaude.images.mediaTypes;
      if (accepte && accepte.length) {
        ["#scan-photo", "#scan-galerie", "#scan-page-plus"].forEach((sel) => {
          if ($(sel)) $(sel).accept = accepte.join(",");
        });
      }
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
      ficheId: etatQuiz.ficheId || null,
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

  let controleurIA = null;

  /** Les deux pages d'où l'on peut lancer une génération ont leur propre attente. */
  const ZONES_ATTENTE = {
    ia: { form: "#form-ia", chargement: "#chargement-ia", progres: "#ia-progres", stop: "#ia-stop", message: "#ia-message" },
    quiz: { form: "#form-quiz", chargement: "#chargement-quiz", progres: "#quiz-progres", stop: "#quiz-stop", message: "#quiz-message" },
  };

  function messageIA(texte, ton, origine = "ia") {
    const ligne = $(ZONES_ATTENTE[origine].message);
    if (!ligne) return;
    ligne.textContent = texte || "";
    ligne.className = `ia-message${ton ? " ia-message--" + ton : ""}`;
    ligne.hidden = !texte;
  }

  /**
   * Demande le quiz à Claude. Renvoie true si la demande est traitée (quiz
   * lancé, arrêt volontaire, erreur passagère annoncée), false s'il faut
   * basculer sur les chapitres connus.
   */
  async function genererAvecClaude(demande, origine = "ia") {
    const zone = ZONES_ATTENTE[origine];
    const invite = CONSIGNE_QUIZ
      .replace("<<<DEMANDE>>>", demande)
      .replace("<<<PROFIL>>>", niveauChoisi ? libelleNiveau().toLowerCase() : "non précisé");

    controleurIA = new AbortController();
    $(zone.form).hidden = true;
    $(zone.chargement).hidden = false;
    $(zone.stop).hidden = false;
    $(zone.progres).textContent = "Claude rédige ton quiz…";
    messageIA("", null, origine);
    $("#indispo-quiz").hidden = true;
    $("#jeu-quiz").hidden = true;
    $("#bilan-quiz").hidden = true;

    let aCommence = false;
    // L'attente peut venir d'une autorisation restée ouverte : on le dit.
    const rappel = setTimeout(() => {
      if (!aCommence) {
        $(zone.progres).textContent = "Toujours en attente… Si une demande d'autorisation s'est ouverte, accepte-la.";
      }
    }, 20000);

    try {
      const donnees = await sampleClaude.json(invite, {
        modelTier: "default",
        cache: false,
        signal: controleurIA.signal,
        onText: ({ text }) => {
          aCommence = true;
          $(zone.progres).textContent = `Claude rédige ton quiz… (${text.length} caractères)`;
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
      if (code === "cancelled") { messageIA("Génération arrêtée.", null, origine); return true; }
      messageIA(MESSAGES_IA[code] || MESSAGES_IA.upstream_error, REPLIS_LOCAUX.has(code) ? null : "erreur", origine);
      if (REPLIS_LOCAUX.has(code) && code !== "rate_limited") { sampleClaude = null; afficherMoteurIA(); return false; }
      return true;                       // erreur passagère : on laisse réessayer
    } finally {
      clearTimeout(rappel);
      controleurIA = null;
      $(zone.chargement).hidden = true;
      $(zone.stop).hidden = true;
      $(zone.form).hidden = false;
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
    BANQUES.forEach((chapitre) => libelles.push(chapitre.titre, ...(chapitre.motsCles || [])));
    fiches.forEach((fiche) => libelles.push(fiche.titre));
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
    if (!claudeResolu && attenteClaude) {
      $("#ia-progres").textContent = "Connexion à Claude…";
      $("#form-ia").hidden = true;
      $("#chargement-ia").hidden = false;
      attenteClaude.then(() => {
        $("#chargement-ia").hidden = true;
        $("#form-ia").hidden = false;
        lancerDemandeIA();
      });
      return;
    }

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
    etatQuiz.ficheId = null;
    // Une demande rédigée noie le chapitre dans une phrase : on n'exige plus
    // qu'il pèse la moitié des mots, seulement qu'il y figure en entier.
    etatQuiz.couvertureSujet = 0;

    afficherVue("quiz");
    choisirSourceQuiz("sujet");
    $("#quiz-sujet").value = demande.slice(0, 80);
    $("#quiz-complement").value = demande;
    $("#compteur-complement").textContent = demande.length;
    lancerQuizLocal();
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
    source: "cours",        // cours (mes fiches) | sujet
    matiere: "toutes",
    ficheId: null,
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
    BANQUES
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
    const proches = fiches.slice(-3).reverse();

    $("#form-quiz").hidden = true;
    const panneau = $("#indispo-quiz");
    panneau.innerHTML = `
      <p class="bilan-message"><strong>« ${echapper(sujet)} »</strong> ne correspond à aucune banque de questions déjà
      présente dans l'application.</p>
      <p class="bilan-pourcentage">${sampleClaude
        ? "Claude peut l'écrire à la demande : lance la génération ci-dessous."
        : "Claude n'est pas joignable dans cette vue. Autorise-le, ou choisis un chapitre déjà prêt."}</p>
      <ul class="demande">
        <li><span class="demande-cle">Sujet</span><span class="demande-valeur">${echapper(sujet)}</span></li>
        <li><span class="demande-cle">Complément</span><span class="demande-valeur">${complement ? echapper(complement) : "—"}</span></li>
        <li><span class="demande-cle">Niveau</span><span class="demande-valeur">${libelleNiveau() || "non renseigné"}</span></li>
        <li><span class="demande-cle">Format</span><span class="demande-valeur">${etatQuiz.taille === "infini" ? "Sans fin" : etatQuiz.taille + " questions"} · correction ${etatQuiz.mode === "immediate" ? "immédiate" : "à la fin"}</span></li>
      </ul>
      ${proches.length ? `
      <h4 class="bilan-soustitre">En attendant, tes dernières fiches</h4>
      <ul class="bilan-erreurs">
        ${proches.map((f) => `
          <li><span class="bilan-question">${echapper(f.titre)}</span>
              <span class="bilan-explication">${detailFiche(f)}</span></li>`).join("")}
      </ul>` : ""}
      <div class="bilan-actions">
        ${sampleClaude ? '<button class="bouton-principal" type="button" data-indispo="claude">Demander à Claude</button>' : ""}
        ${proches.length ? `<button class="${sampleClaude ? "bouton-secondaire" : "bouton-principal"}" type="button" data-indispo="cours">Choisir une fiche</button>` : ""}
        <button class="bouton-secondaire" type="button" data-indispo="sujet">Modifier le sujet</button>
      </div>
    `;
    panneau.hidden = false;

    $$("[data-indispo]", panneau).forEach((bouton) => {
      bouton.addEventListener("click", () => {
        panneau.hidden = true;
        if (bouton.dataset.indispo === "claude") {
          genererAvecClaude(sujet, "quiz").then((traite) => { if (!traite) panneauSujetIndisponible(sujet); });
          return;
        }
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
    // Une fiche révisée : on note la date et le meilleur score, la file suit.
    if (partieQuiz.ficheId) marquerRevisee(partieQuiz.ficheId, pourcentage);
    const dejaRangee = Boolean(partieQuiz.ficheId);
    const sujetLibre = etatQuiz.source === "sujet" ? etatQuiz.sujet.trim() : "";
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
        ${!dejaRangee && sujetLibre.length >= 3
          ? '<button class="bouton-secondaire" type="button" data-quiz="garder">Garder ce sujet dans mes fiches</button>'
          : ""}
        <button class="bouton-secondaire" type="button" data-quiz="chapitre">Changer de sujet</button>
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
        else if (action === "garder") {
          const reconnu = chercherBanque(sujetLibre, etatQuiz.matiereTheme);
          ouvrirFeuilleNom({
            titre: sujetLibre,
            matiere: etatQuiz.matiereTheme || (reconnu ? reconnu.matiere : "autre"),
            surValider: (nom, matiere) => {
              const banque = chercherBanque(nom, matiere === "autre" ? null : matiere) || reconnu;
              const gardee = ajouterFiche({
                matiere,
                titre: nom,
                source: sampleClaude ? "ia" : "libre",
                banqueId: banque ? banque.id : null,
              });
              if (!gardee) { toast("Sujet trop court pour être enregistré."); return; }
              marquerRevisee(gardee.id, pourcentage);
              bouton.disabled = true;
              bouton.textContent = "Rangée dans tes fiches";
              toast(`Fiche « ${gardee.titre} » ajoutée en ${MATIERES[matiere].nom}`);
            },
          });
        }
        else { bilan.hidden = true; $("#form-quiz").hidden = false; }
      });
    });
  }

  let minuteurQuiz;

  /** Tout sujet libre — thème du carrousel, fiche scannée, atelier — passe par Claude. */
  function lancerQuiz() {
    // Mode « Mes fiches » : la fiche choisie devient le sujet du quiz.
    if (etatQuiz.source === "cours") {
      const fiche = trouverFiche(etatQuiz.ficheId);
      if (!fiche) {
        toast(fiches.length ? "Choisis une fiche à réviser." : "Ta bibliothèque est vide : crée d'abord une fiche.");
        return;
      }
      reviserFiche(fiche);
      return;
    }

    // Le runtime met un instant à répondre : on ne bascule pas au local trop tôt.
    if (etatQuiz.source === "sujet" && !claudeResolu && attenteClaude) {
      $("#form-quiz").hidden = true;
      $("#chargement-quiz").hidden = false;
      $("#quiz-progres").textContent = "Connexion à Claude…";
      attenteClaude.then(() => { $("#chargement-quiz").hidden = true; lancerQuiz(); });
      return;
    }

    if (etatQuiz.source === "sujet" && sampleClaude) {
      const sujet = etatQuiz.sujet.trim();
      if (sujet.length < 3) { toast("Indique d'abord le sujet du quiz."); return; }
      const complement = (etatQuiz.complement || "").trim();
      const demande = complement ? `${sujet}\n\n${complement}` : sujet;
      genererAvecClaude(demande, "quiz").then((traite) => { if (!traite) lancerQuizLocal(); });
      return;
    }
    lancerQuizLocal();
  }

  /** Repli : questions rédigées et générateurs de l'application. */
  function lancerQuizLocal() {
    let coursId = null;
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

    if (!coursId) { toast("Indique d'abord le sujet du quiz."); return; }

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
      partieQuiz = {
        questions, index: 0, score: 0, mode: etatQuiz.mode, coursId, sansFin, tirer,
        ficheId: etatQuiz.ficheId || null,
      };
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
      segment.addEventListener("click", () => {
        if (segment.dataset.quizSource === "sujet") etatQuiz.ficheId = null;
        choisirSourceQuiz(segment.dataset.quizSource);
      });
    });

    const champSujet = $("#quiz-sujet");
    champSujet.addEventListener("input", () => {
      etatQuiz.sujet = champSujet.value;
      etatQuiz.matiereTheme = null;
      etatQuiz.ficheId = null;
    });

    $("#ouvrir-atelier").addEventListener("click", () => {
      afficherVue("ia");
      const champ = $("#ia-demande");
      const sujet = etatQuiz.sujet.trim();
      if (sujet && !champ.value.trim()) {
        champ.value = sujet;
        rafraichirDemande();
      }
      champ.focus();
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
      vide: "Aucune fiche à réviser : crée-en une, ou passe en « Sujet libre ».",
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
    $("#quiz-stop").addEventListener("click", () => { if (controleurIA) controleurIA.abort(); });
    $("#quiz-quitter").addEventListener("click", () => {
      if (partieQuiz && partieQuiz.sansFin) { bilanQuiz(); return; }
      $("#jeu-quiz").hidden = true;
      $("#bilan-quiz").hidden = true;
      $("#indispo-quiz").hidden = true;
      form.hidden = false;
    });
  }

  /* ————— Page « FlashCards » ————————————————————————————————————— */

  const etatCartes = { matiere: "toutes", ficheId: null, ordre: "melange" };
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
    const fiche = trouverFiche(etatCartes.ficheId);
    if (!fiche) {
      toast(fiches.length ? "Choisis une fiche." : "Ta bibliothèque est vide : crée d'abord une fiche.");
      return;
    }
    const source = cartesDeLaFiche(fiche);
    let cartes = source.map((carte, i) => ({ ...carte, id: `${fiche.id}-${i}`, repassee: false }));
    if (seulement) cartes = cartes.filter((c) => seulement.has(c.id));
    if (!cartes.length) { toast("Pas encore de cartes pour cette fiche : lance plutôt un quiz."); return; }
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
      vide: "Aucune fiche pour l'instant : crée-en une pour en tirer des cartes.",
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
    fiches = lireBibliotheque();
    rendreDefis($("#liste-defis"));

    // Cloche + onglets du bas + logo → changement de vue.
    $$("[data-onglet]").forEach((el) => {
      el.addEventListener("click", (evt) => {
        evt.preventDefault();
        afficherVue(el.dataset.onglet);
      });
    });

    initCreation();
    initNom();
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

    // Dossiers, file de révision, cloche, profil et sélecteurs d'un seul coup.
    majBibliotheque();

    if (!niveauChoisi) ouvrirEcranNiveau();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
