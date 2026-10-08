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
    ia: "Écrite par l'IA",
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

    // Une fiche de plus : c'est ici que la version gratuite s'arrête.
    if (!peutCreerUneFiche()) return null;

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
      palier: 0,                      // revient à J+1, puis J+3, J+7…
      progression: 0,
    };
    fiches.push(fiche);
    majBibliotheque();
    return fiche;
  }

  /* ————— Journal : une ligne par jour de révision ————————————————
     Réviser un peu chaque jour vaut mieux que tout d'un coup : la série
     et le compte du jour sont là pour le rendre visible.
     ———————————————————————————————————————————————————————————— */

  const CLE_JOURNAL = "mathematique.journal";
  let journal = {};

  function cleJour(date) {
    const d = minuit(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function lireJournal() {
    try {
      const brut = localStorage.getItem(CLE_JOURNAL);
      const lu = brut ? JSON.parse(brut) : {};
      return lu && typeof lu === "object" && !Array.isArray(lu) ? lu : {};
    } catch (erreur) { return {}; }
  }

  function ecrireJournal() {
    try { localStorage.setItem(CLE_JOURNAL, JSON.stringify(journal)); } catch (erreur) { /* stockage indisponible */ }
  }

  function noterRevision() {
    const jour = cleJour(new Date());
    journal[jour] = (journal[jour] || 0) + 1;
    ecrireJournal();
  }

  function revisionsDuJour() { return journal[cleJour(new Date())] || 0; }

  /** Jours consécutifs avec au moins une révision ; hier compte encore. */
  function serieJours() {
    const curseur = minuit(new Date());
    if (!journal[cleJour(curseur)]) curseur.setDate(curseur.getDate() - 1);
    let serie = 0;
    while (journal[cleJour(curseur)]) {
      serie++;
      curseur.setDate(curseur.getDate() - 1);
    }
    return serie;
  }

  function trouverFiche(id) { return fiches.find((f) => f.id === id) || null; }

  function supprimerFiche(id) {
    fiches = fiches.filter((f) => f.id !== id);
    majBibliotheque();
  }

  /** Après une partie : date du jour, et on garde le meilleur score obtenu. */
  /**
   * Une révision réussie espace la suivante ; une révision ratée rapproche.
   * Sans score (simple relecture), le palier ne bouge pas.
   */
  function marquerRevisee(id, pourcentage) {
    const fiche = trouverFiche(id);
    if (!fiche) return;
    fiche.derniereRevision = new Date().toISOString();
    noterRevision();

    const palier = Math.max(fiche.palier || 0, 0);
    if (typeof pourcentage === "number") {
      fiche.progression = Math.max(fiche.progression || 0, pourcentage);
      if (pourcentage >= 60) fiche.palier = Math.min(palier + 1, PALIERS_REVISION.length - 1);
      else if (pourcentage < 40) fiche.palier = 0;     // à revoir dès demain
      else fiche.palier = palier;
    }
    majBibliotheque();
  }

  /** Porte unique : tout ce qui dépend de la bibliothèque se remet à jour ici. */
  const aRafraichir = [];
  function majBibliotheque() {
    ecrireBibliotheque();
    rendreDossiers();
    rendreEcheances($("#liste-echeances"));
    rendreSalut();
    rendreAujourdhui();
    rendreAbonnement();
    rendreEntrainements($("#liste-entrainements"));
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
    const notions = notionsDeLaFiche(fiche).length;
    const parcours = notions ? ` · ${notions} notion${notions > 1 ? "s" : ""}` : "";
    const cartes = fiche.cartes && fiche.cartes.length ? ` · ${fiche.cartes.length} cartes` : "";
    return `${matiere ? matiere.nom : "Fiche"} · ${SOURCES_FICHE[fiche.source] || "Sujet libre"}${parcours}${cartes}`;
  }

  /* ————— Gratuit ou illimité ————————————————————————————————————
     La version gratuite laisse créer quelques fiches ; au-delà, il faut
     un abonnement. Tout ce qui touche à l'argent vit dans abonnement.js
     et dans serveur/ : ici, on ne fait qu'ouvrir la porte, ou pas.
     ———————————————————————————————————————————————————————————— */

  const OFFRE = typeof ABONNEMENT !== "undefined" ? ABONNEMENT : null;

  function estIllimite() { return Boolean(OFFRE && OFFRE.estIllimite()); }

  /** Ce que la gratuité laisse encore faire, à cet instant. */
  function quotaFiches() {
    if (!OFFRE) return { illimite: true, max: Infinity, reste: Infinity, atteint: false };
    return OFFRE.quotaFiches(fiches.length);
  }

  /**
   * La porte : peut-on créer une fiche de plus ? Sinon on ouvre le mur de
   * paiement plutôt que de laisser l'élève buter sans comprendre.
   */
  function peutCreerUneFiche({ silencieux = false } = {}) {
    const quota = quotaFiches();
    if (!quota.atteint) return true;
    if (!silencieux) ouvrirPageIllimite(
      `Tes ${quota.max} fiches gratuites sont utilisées. L'illimité les débloque toutes.`,
      vueCourante());
    return false;
  }

  let retourAbonnement = "accueil";       // d'où l'on vient, pour le bouton de retour

  /** Ouvre la page de tarif. `raison` dit pourquoi on y arrive. */
  function ouvrirPageIllimite(raison, depuis) {
    const page = $("#vue-abonnement");
    if (!page || !OFFRE) return;
    const config = OFFRE.config();
    retourAbonnement = VUES.includes(depuis) ? depuis : "accueil";

    $("#illimite-raison").textContent = raison
      || "Autant de fiches que tu veux, sur toutes tes matières.";
    $("#illimite-prix").textContent = config.prix;
    $("#illimite-periode").textContent = config.periode;
    // Sans serveur de paiement, on ne fait pas semblant : on le dit.
    const pret = OFFRE.estConfigure();
    $("#illimite-note").textContent = !pret
      ? "Offre en préparation — aujourd'hui, tout est gratuit et sans limite."
      : config.essai
        ? `${config.essai} · sans engagement, résiliable en un clic`
        : "Sans engagement · résiliable en un clic";
    const casGratuit = $("#comparatif-gratuit");
    if (casGratuit) casGratuit.textContent = String(config.gratuit.fiches);

    $("#illimite-payer").disabled = !pret;
    $("#illimite-payer").textContent = pret ? "Payer avec Stripe" : "Paiement bientôt disponible";
    $("#illimite-mention").textContent = pret
      ? "Paiement chez Stripe : l'app ne voit jamais ta carte."
      : "Le paiement n'est pas encore branché sur cette version. Rien ne t'est débité.";
    $("#illimite-restaurer").hidden = !pret;
    $("#form-licence").hidden = true;
    messageIllimite("");

    afficherVue("abonnement");
  }

  function fermerPageIllimite() { afficherVue(retourAbonnement); }

  function messageIllimite(texte, ton) {
    const ligne = $("#illimite-message");
    if (!ligne) return;
    ligne.textContent = texte || "";
    ligne.className = `ia-message${ton ? " ia-message--" + ton : ""}`;
    ligne.hidden = !texte;
  }

  const ENNUIS_PAIEMENT = {
    non_configure: "Le paiement n'est pas branché sur cette version.",
    injoignable: "Le service de paiement n'est pas joignable depuis cette page. Réessaie, ou ouvre l'app depuis son adresse habituelle.",
    delai: "Le service de paiement met trop de temps à répondre. Réessaie dans un instant.",
    serveur: "Le service de paiement a répondu de travers. Réessaie dans un instant.",
    introuvable: "Cette clé d'abonnement est inconnue.",
  };

  async function lancerPaiement() {
    if (!OFFRE || !OFFRE.estConfigure()) return;
    const bouton = $("#illimite-payer");
    bouton.disabled = true;
    messageIllimite("Ouverture du paiement sécurisé…");
    try {
      const url = await OFFRE.ouvrirPaiement({});
      /* Une page publiée peut être empêchée de changer d'adresse : on tente
         l'onglet, et si le navigateur le refuse on donne le lien à toucher. */
      const onglet = window.open(url, "_blank", "noopener");
      if (!onglet) {
        messageIllimite("");
        const ligne = $("#illimite-message");
        ligne.innerHTML = `Ouvre le paiement ici : <a href="${echapper(url)}" target="_blank" rel="noopener">page de paiement Stripe</a>`;
        ligne.className = "ia-message";
        ligne.hidden = false;
      } else {
        messageIllimite("Le paiement s'est ouvert dans un autre onglet. Reviens ici une fois réglé.");
      }
    } catch (erreur) {
      const code = (erreur && erreur.code) || "serveur";
      messageIllimite(ENNUIS_PAIEMENT[code] || ENNUIS_PAIEMENT.serveur, "erreur");
    } finally {
      bouton.disabled = false;
    }
  }

  async function retrouverAbonnement(cle) {
    if (!OFFRE) return;
    const propre = String(cle || "").trim();
    if (propre.length < 6) { messageIllimite("Colle la clé affichée dans ton profil.", "erreur"); return; }
    messageIllimite("Vérification…");
    try {
      const actif = await OFFRE.verifierLicence(propre);
      if (!actif) { messageIllimite("Aucun abonnement actif pour cette clé.", "erreur"); return; }
      fermerPageIllimite();
      majBibliotheque();
      toast("Abonnement retrouvé : c'est illimité.");
    } catch (erreur) {
      const code = (erreur && erreur.code) || "serveur";
      messageIllimite(ENNUIS_PAIEMENT[code] || ENNUIS_PAIEMENT.serveur, "erreur");
    }
  }

  /** Au retour de Stripe : on confirme auprès du serveur, jamais sur parole. */
  async function verifierRetourDePaiement() {
    if (!OFFRE) return;
    const session = OFFRE.sessionDeRetour();
    if (!session) { OFFRE.rafraichir().then(majBibliotheque); return; }
    OFFRE.nettoyerAdresse();
    try {
      const actif = await OFFRE.confirmerSession(session);
      majBibliotheque();
      toast(actif
        ? "C'est bon : tes fiches sont illimitées."
        : "Le paiement n'a pas été confirmé. Rien ne t'a été débité.");
    } catch (erreur) {
      toast("Paiement reçu, mais la confirmation n'a pas abouti. Réessaie depuis ton profil.");
    }
  }

  /** Le bloc du profil : où on en est, et la clé pour retrouver son abonnement. */
  function rendreAbonnement() {
    const bloc = $("#profil-abonnement");
    if (!bloc || !OFFRE) return;
    const quota = quotaFiches();

    bloc.hidden = false;

    /* Le paiement n'est pas encore branché : on ne limite rien, mais l'offre
       reste visible — sinon la page de tarif n'existe pour personne. */
    if (quota.sansOffre) {
      bloc.innerHTML = `
        <p class="offre-etiquette">Version gratuite</p>
        <p class="offre-detail">Pour l'instant, rien n'est limité : crée autant de fiches que tu veux.</p>
        <button class="bouton-secondaire" type="button" data-offre="payer">Voir l'offre illimitée</button>`;
    } else if (quota.illimite) {
      const courant = OFFRE.etat();
      const fin = courant.expire
        ? `Prochain renouvellement le ${formatDate.format(new Date(courant.expire))}.`
        : "";
      bloc.innerHTML = `
        <p class="offre-etiquette offre-etiquette--actif">Illimité</p>
        <p class="offre-detail">Fiches, cartes et quiz sans compteur. ${fin}</p>
        <label class="champ-libelle champ-libelle--discret" for="profil-licence">
          Ta clé, pour retrouver l'abonnement sur un autre téléphone</label>
        <input class="champ-texte" id="profil-licence" type="text" readonly value="${echapper(courant.cle)}">
        <button class="bouton-texte" type="button" data-offre="oublier">Retirer l'abonnement de cet appareil</button>`;
    } else {
      bloc.innerHTML = `
        <p class="offre-etiquette">Version gratuite</p>
        <p class="offre-detail">${fiches.length} fiche${fiches.length > 1 ? "s" : ""} sur ${quota.max}.
          ${quota.reste ? `Il t'en reste ${quota.reste}.` : "Tu les as toutes utilisées."}</p>
        <button class="bouton-secondaire" type="button" data-offre="payer">Passer en illimité</button>`;
    }

    $$("[data-offre]", bloc).forEach((bouton) => {
      bouton.addEventListener("click", () => {
        if (bouton.dataset.offre === "payer") { ouvrirPageIllimite(null, "profil"); return; }
        OFFRE.oublier();
        majBibliotheque();
        toast("Abonnement retiré de cet appareil.");
      });
    });
  }

  function initIllimite() {
    if (!$("#vue-abonnement")) return;
    $("#illimite-retour").addEventListener("click", fermerPageIllimite);
    $("#illimite-payer").addEventListener("click", lancerPaiement);
    $("#illimite-restaurer").addEventListener("click", () => {
      const form = $("#form-licence");
      form.hidden = !form.hidden;
      if (!form.hidden) $("#licence-cle").focus();
    });
    $("#form-licence").addEventListener("submit", (evenement) => {
      evenement.preventDefault();
      retrouverAbonnement($("#licence-cle").value);
    });
  }

  /* ————— Vue « Mes fiches » : une catégorie par matière ————————— */
  /* ————— Vue « Mes fiches » : une catégorie par matière ————————— */

  function carteFiche(fiche) {
    const jours = joursEntre(fiche.creee, new Date());
    // La notion la plus fragile s'annonce dès la liste : on sait par où reprendre.
    const reprise = notionsDeLaFiche(fiche).length > 1 ? notionLaPlusFaible(fiche) : null;
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
      ${reprise ? `<p class="carte-reprise">À reprendre : ${echapper(reprise.titre)}${
        reprise.maitrise === null ? "" : ` (${reprise.maitrise} %)`}</p>` : ""}
      <div class="carte-actions">
        <button class="bouton-reviser" type="button" data-fiche="reviser">Réviser maintenant</button>
        <button class="bouton-texte" type="button" data-fiche="ouvrir">Lire la fiche</button>
        <button class="bouton-texte" type="button" data-fiche="supprimer">Supprimer</button>
      </div>
    `;

    $$("[data-fiche]", carte).forEach((bouton) => {
      bouton.addEventListener("click", () => {
        const action = bouton.dataset.fiche;
        if (action === "reviser") reviserFiche(fiche);
        else if (action === "ouvrir") ouvrirFiche(fiche, "cours");
        else { supprimerFiche(fiche.id); toast("Fiche supprimée"); }
      });
    });

    // Toucher la carte ailleurs que sur un bouton ouvre la fiche.
    carte.addEventListener("click", (evenement) => {
      if (evenement.target.closest("[data-fiche]")) return;
      ouvrirFiche(fiche, "cours");
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
    creer.addEventListener("click", () => {
      if (peutCreerUneFiche()) ouvrirFeuilleCreation(cle);
    });
    contenu.appendChild(creer);
  }

  /** Une catégorie par matière : ouverte, elle propose de créer une fiche. */
  function rendreDossiers() {
    const conteneur = $("#liste-tous-cours");
    if (!conteneur) return;
    conteneur.textContent = "";

    /* Les matières où l'élève a déjà travaillé passent devant : un mur de
       dossiers vides, c'est six clics avant de retrouver sa fiche. */
    const cles = matieresAffichees();
    const remplies = cles.filter((cle) => fiches.some((f) => f.matiere === cle));
    const vides = cles.filter((cle) => !remplies.includes(cle));

    const entete = $("#cours-etat");
    if (entete) {
      const dues = fiches.length ? echeancesFiches().filter((e) => e.etat === "aujourdhui").length : 0;
      entete.textContent = fiches.length
        ? `${fiches.length} fiche${fiches.length > 1 ? "s" : ""}${dues ? ` · ${dues} à revoir aujourd'hui` : " · tout est à jour"}`
        : "Aucune fiche pour l'instant. Touche une matière pour en créer une.";
    }

    [].concat(remplies, vides).forEach((cle, rang) => {
      if (rang === remplies.length && remplies.length && vides.length) {
        const separateur = document.createElement("p");
        separateur.className = "dossiers-separateur";
        separateur.textContent = "Pas encore de fiche ici";
        conteneur.appendChild(separateur);
      }
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
            <span class="ligne-detail">${liste.length
              ? `${liste.length} fiche${liste.length > 1 ? "s" : ""} · ${moyenne} % maîtrisé`
              : "toucher pour créer une fiche"}</span>
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
  function reviserFiche(fiche, partie) {
    const notions = notionsDeLaFiche(fiche);
    const notion = typeof partie === "number" ? notions[partie] : null;

    etatQuiz.source = "sujet";
    etatQuiz.sujet = notion ? `${fiche.titre} — ${texteBrut(notion.titre)}` : fiche.titre;
    etatQuiz.matiereTheme = fiche.matiere === "autre" ? null : fiche.matiere;
    etatQuiz.ficheId = fiche.id;
    etatQuiz.partie = notion ? partie : null;
    etatQuiz.complement = `Fiche « ${fiche.titre} » en ${MATIERES[fiche.matiere].nom}`
      + (notion ? `, notion « ${texteBrut(notion.titre)} »` : "")
      + (niveauChoisi ? `, profil ${libelleNiveau().toLowerCase()}.` : ".");

    // Le document a été lu : les questions portent sur ses termes, pas sur le thème en général.
    if (fiche.contenu && fiche.contenu.lu) {
      /* Sur une notion, on ne donne QUE cette notion : le quiz reste dessus
         au lieu de se disperser sur tout le chapitre. */
      const contenuVise = notion
        ? [].concat(notion.texte || [], notion.points || [], notion.reperes || [])
        : [].concat(pointsDeLaFiche(fiche.contenu), fiche.contenu.formules || []);
      const reperes = contenuVise
        .map(texteBrut)
        .filter((ligne) => ligne.length > 10)
        .slice(0, 14);
      const lexique = notion
        ? (notion.lexique || []).map((entree) => `${texteBrut(entree.terme)} : ${texteBrut(entree.definition)}`)
        : lexiqueDeLaFiche(fiche).map((entree) => `${texteBrut(entree.terme)} : ${texteBrut(entree.definition)}`);
      const termes = lexique.length
        ? lexique.slice(0, 14)
        : cartesDeLaFiche(fiche, notion ? partie : undefined).map((carte) => texteBrut(carte.recto)).slice(0, 14);

      if (reperes.length) {
        etatQuiz.complement += "\n\nPose au moins 10 questions, uniquement sur ce contenu,"
          + " en reprenant ses termes exacts (mots, dates, notations) :\n- " + reperes.join("\n- ");
        if (termes.length) {
          etatQuiz.complement += "\n\nTermes à faire réviser :\n- " + termes.join("\n- ");
        }
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
    // Une notion est acquise à partir de 80 % : c'est ce qui se voit dans un contrôle.
    let acquises = 0;
    let cartes = 0;
    fiches.forEach((fiche) => {
      notionsDeLaFiche(fiche).forEach((_, rang) => {
        if ((maitriseNotion(fiche, rang) || 0) >= 80) acquises++;
      });
      cartes += cartesDeLaFiche(fiche).length;
    });

    if ($("#stat-cours")) $("#stat-cours").textContent = total;
    if ($("#stat-moyenne")) $("#stat-moyenne").textContent = `${moyenne} %`;
    if ($("#stat-serie")) $("#stat-serie").textContent = serieJours();
    if ($("#stat-notions")) $("#stat-notions").textContent = acquises;
    if ($("#stat-cartes")) $("#stat-cartes").textContent = cartes;
    if ($("#stat-record")) $("#stat-record").textContent = recordSurvie() || "—";
    if ($("#profil-initiales")) $("#profil-initiales").textContent = initialesDe(prenom);
  }

  /** Le prénom se saisit dans le profil, et sert partout ailleurs. */
  function initPrenom() {
    const champ = $("#profil-prenom");
    if (!champ) return;
    champ.value = prenom;
    champ.addEventListener("input", () => {
      prenom = champ.value.trim().slice(0, 24);
      ecrirePrenom(prenom);
      if ($("#profil-initiales")) $("#profil-initiales").textContent = initialesDe(prenom);
      rendreSalut();
    });
  }

  /** Le meilleur score en mode survie, gardé sur l'appareil. */
  const CLE_RECORD = "mathematique.record";
  function recordSurvie() {
    try { return Number(localStorage.getItem(CLE_RECORD)) || 0; } catch (erreur) { return 0; }
  }
  function noterRecordSurvie(score) {
    if (score <= recordSurvie()) return;
    try { localStorage.setItem(CLE_RECORD, String(score)); } catch (erreur) { /* mémoire seule */ }
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

  /* ————— S'entraîner ————————————————————————————————————————————
     Trois séances courtes sur ses propres cartes, tirées de toutes les
     fiches. Rien n'est simulé : pas de points fictifs, pas d'adversaire
     inventé — ce qui est annoncé est ce qui se passe.
     ———————————————————————————————————————————————————————————— */

  function rendreEntrainements(conteneur) {
    if (!conteneur) return;
    conteneur.textContent = "";
    const stock = cartesDeToutesLesFiches().length;
    ENTRAINEMENTS.forEach((mode) => {
      const assez = stock > 0;
      conteneur.appendChild(ligne({
        pastille: '<svg aria-hidden="true"><use href="#i-epee"></use></svg>',
        nom: mode.nom,
        detail: assez ? mode.detail : "il te faut d'abord des cartes",
        onClick: () => lancerEntrainement(mode),
      }));
    });
  }

  /** Toutes les cartes de toutes les fiches, chacune sachant d'où elle vient. */
  function cartesDeToutesLesFiches() {
    const toutes = [];
    fiches.forEach((fiche) => {
      cartesDeLaFiche(fiche).forEach((carte, rang) => {
        toutes.push({ ...carte, id: `${fiche.id}-${rang}`, chapitre: fiche.titre });
      });
    });
    return toutes;
  }

  function lancerEntrainement(mode) {
    const toutes = cartesDeToutesLesFiches();
    if (!toutes.length) {
      toast("Crée d'abord une fiche : tes cartes en sortiront.");
      afficherVue("scan");
      return;
    }
    const cartes = melanger(toutes).slice(0, mode.taille);
    etatCartes.ficheId = null;
    etatCartes.partie = null;
    afficherVue("flashcards");
    ouvrirPaquet(cartes, {
      survie: mode.survie || null,
      nom: mode.nom,
      rejouer: () => lancerEntrainement(mode),     // un nouveau tirage, pas le même paquet
    });
  }

  /* ————— Révision espacée ————————————————————————————————————
     La file n'est plus une donnée figée : elle se calcule à partir des
     fiches créées et de leur dernière révision.
     ———————————————————————————————————————————————————————————— */

  /** Le délai d'une fiche dépend du nombre de fois où elle a été revue, pas du temps passé. */
  function attenteDeLaFiche(fiche) {
    const rang = Math.min(Math.max(fiche.palier || 0, 0), PALIERS_REVISION.length - 1);
    return PALIERS_REVISION[rang];
  }

  /**
   * Une fiche oubliée reste due : son échéance ne glisse pas d'un palier à
   * l'autre toute seule. C'est la révision réussie qui fait monter le palier.
   */
  function echeancesFiches() {
    const aujourdhui = new Date();
    return fiches
      .map((fiche) => {
        const attente = attenteDeLaFiche(fiche);
        const depuis = joursEntre(fiche.derniereRevision, aujourdhui);
        const reste = attente - depuis;
        return {
          fiche,
          palier: `J+${attente}`,
          echeance: new Date(minuit(fiche.derniereRevision).getTime() + attente * JOUR_MS),
          reste,
          retard: Math.max(-reste, 0),
          etat: reste <= 0 ? "aujourdhui" : reste === 1 ? "demain" : "a-venir",
        };
      })
      // Le plus en retard d'abord : c'est ce qu'on est le plus près d'oublier.
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
      const quand = e.retard > 1 ? `En retard de ${e.retard} jours`
                  : e.etat === "aujourdhui" ? "À revoir aujourd'hui"
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

  /* ————— Accueil : ce qui est dû aujourd'hui ————————————————————
     Une fiche qu'on ne revoit pas s'oublie. Ce bloc met la révision du
     jour devant, au lieu de la cacher derrière la cloche.
     ———————————————————————————————————————————————————————————— */

  /* ————— L'état de la journée ————————————————————————————————————
     La première chose qu'on lit en ouvrant l'app : où on en est, et le
     geste qui suit. Un élève ouvre son appli entre deux cours — il ne
     doit pas avoir à chercher par quoi commencer.
     ———————————————————————————————————————————————————————————— */

  function rendreSalut() {
    const bloc = $("#bloc-salut");
    if (!bloc) return;

    const heure = new Date().getHours();
    const moment = heure < 5 ? "Bonne nuit" : heure < 18 ? "Salut" : "Bonsoir";
    const nom = prenom ? ` ${echapper(prenom)}` : "";
    const dues = fiches.length ? echeancesFiches().filter((e) => e.etat === "aujourdhui") : [];
    const serie = serieJours();

    let phrase;
    let action = "";
    if (!fiches.length) {
      phrase = "Prends ton premier cours en photo : fiche, cartes et quiz en sortent.";
      action = `<button class="bouton-principal" type="button" data-salut="creer">Créer ma première fiche</button>`;
    } else if (dues.length) {
      phrase = `${dues.length} fiche${dues.length > 1 ? "s" : ""} à revoir aujourd'hui.`;
      action = `<button class="bouton-principal" type="button" data-salut="reviser">Réviser maintenant</button>`;
    } else {
      phrase = "Tout est à jour. Un tour de cartes pour entretenir ?";
      action = `<button class="bouton-principal" type="button" data-salut="entrainement">Lancer un entraînement</button>`;
    }

    bloc.innerHTML = `
      <p class="salut-titre">${moment}${nom} 👋</p>
      <p class="salut-phrase">${phrase}</p>
      ${serie > 1 ? `<p class="salut-serie">🔥 ${serie} jours d'affilée — ne casse pas la série.</p>` : ""}
      ${action}`;

    $$("[data-salut]", bloc).forEach((bouton) => {
      bouton.addEventListener("click", () => {
        const quoi = bouton.dataset.salut;
        if (quoi === "creer") { afficherVue("scan"); return; }
        if (quoi === "entrainement") { lancerEntrainement(ENTRAINEMENTS[0]); return; }
        const premiere = dues[0];
        if (premiere) reviserFiche(premiere.fiche);
      });
    });
  }

  function rendreAujourdhui() {
    const bloc = $("#bloc-aujourdhui");
    if (!bloc) return;

    if (!fiches.length) { bloc.hidden = true; return; }

    const echeances = echeancesFiches();
    const dues = echeances.filter((e) => e.etat === "aujourdhui");
    const faites = revisionsDuJour();
    const objectif = Math.max(dues.length + faites, 1);
    const part = Math.round((faites / objectif) * 100);

    /* La salutation dit déjà où on en est : ce bloc ne répète ni le compte
       ni la série, il montre la file et rien d'autre. */
    const entete = `
      <div class="aujourdhui-entete">
        <h2 class="aujourdhui-titre">Ta file du jour</h2>
      </div>
      <p class="aujourdhui-detail">${faites} sur ${dues.length + faites} ${
        dues.length + faites > 1 ? "faites" : "faite"}</p>
      <div class="barre-progression" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${part}"
           aria-label="Avancement des révisions du jour">
        <div class="barre-progression-remplie" style="width:${part}%"></div>
      </div>`;

    // Rien à revoir : la salutation propose déjà la suite, le bloc s'efface.
    if (!dues.length) {
      const prochaine = echeances[0];
      if (!faites) { bloc.hidden = true; return; }
      bloc.innerHTML = `${entete}
        <p class="aujourdhui-vide">Tout est à jour.${prochaine
          ? ` Prochaine : « ${echapper(prochaine.fiche.titre)} » ${prochaine.reste === 1 ? "demain" : `dans ${prochaine.reste} jours`}.`
          : ""}</p>`;
    } else {
      bloc.innerHTML = `${entete}
        <ul class="aujourdhui-liste">
          ${dues.slice(0, 3).map((e) => `
            <li>
              <span class="ligne-pastille">${MATIERES[e.fiche.matiere] ? MATIERES[e.fiche.matiere].emoji : "📘"}</span>
              <span class="ligne-texte">
                <span class="ligne-nom">${echapper(e.fiche.titre)}</span>
                <span class="ligne-detail">${e.retard > 1 ? `en retard de ${e.retard} jours` : e.palier} · ${e.fiche.progression} % maîtrisé</span>
              </span>
              <button class="bouton-reviser bouton-reviser--petit" type="button" data-revoir="${e.fiche.id}">Réviser</button>
            </li>`).join("")}
        </ul>
        ${dues.length > 3 ? `<button class="bouton-texte" type="button" data-aujourdhui="tout">Voir les ${dues.length} fiches à revoir</button>` : ""}`;
    }

    bloc.hidden = false;
    $$("[data-revoir]", bloc).forEach((bouton) => {
      bouton.addEventListener("click", () => {
        const fiche = trouverFiche(bouton.dataset.revoir);
        if (fiche) reviserFiche(fiche);
      });
    });
    $$("[data-aujourdhui]", bloc).forEach((bouton) => {
      bouton.addEventListener("click", () => {
        if (bouton.dataset.aujourdhui === "tout") { afficherVue("revision"); return; }
        // Piocher au hasard mélange les sujets : c'est ce qui ancre le mieux.
        const fiche = fiches[Math.floor(Math.random() * fiches.length)];
        if (fiche) reviserFiche(fiche);
      });
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

  const VUES = ["accueil", "cours", "profil", "revision", "scan", "ia", "resume", "fiche",
    "quiz", "flashcards", "abonnement"];

  /** La vue affichée en ce moment, pour y revenir ensuite. */
  function vueCourante() {
    const ouverte = VUES.find((v) => {
      const vue = document.getElementById(`vue-${v}`);
      return vue && !vue.hidden;
    });
    return ouverte || "accueil";
  }

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
    const OUVERTES_DEPUIS_ACCUEIL = ["revision", "scan", "ia", "resume", "quiz", "flashcards", "abonnement"];
    // La fiche en pleine page garde allumé l'onglet d'où on l'a ouverte.
    const ongletActif = nom === "fiche"
      ? (retourFiche === "cours" ? "cours" : "accueil")
      : OUVERTES_DEPUIS_ACCUEIL.includes(nom) ? "accueil" : nom;
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

  /* Le prénom vient de l'élève : on n'en invente pas, et il reste sur l'appareil. */
  const CLE_PRENOM = "mathematique.prenom";
  let prenom = "";

  function lirePrenom() {
    try { return localStorage.getItem(CLE_PRENOM) || ""; } catch (erreur) { return ""; }
  }

  function ecrirePrenom(valeur) {
    try { localStorage.setItem(CLE_PRENOM, valeur); } catch (erreur) { /* mémoire seule */ }
  }

  function initialesDe(nom) {
    const propre = String(nom || "").trim();
    if (!propre) return "?";
    return propre.split(/[\s-]+/).slice(0, 2).map((mot) => mot.charAt(0).toUpperCase()).join("");
  }

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
      titre.textContent = "Chapitres de ton programme";
      const vide = document.createElement("div");
      vide.className = "themes-vide";
      vide.innerHTML = `
        <p class="themes-vide-texte">Dis-nous où tu en es dans tes études : tu auras les chapitres
        de ton programme, matière par matière.</p>
        <button class="bouton-principal" type="button" id="themes-choisir-niveau">Choisir ma classe</button>
      `;
      bloc.appendChild(vide);
      $("#themes-choisir-niveau").addEventListener("click", ouvrirEcranNiveau);
      return;
    }

    titre.textContent = `Chapitres · ${libelleNiveau()}`;

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
        <span class="matiere-compte">${programme[matiere].length} chapitres</span>
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
        bouton.addEventListener("click", () => {
          if (peutCreerUneFiche()) ouvrirFeuilleCreation(null);
        });
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
          `Fiche ${deLaMatiere(MATIERES[matiere].nom)} : cadre ta page.`;
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

    bouton.addEventListener("click", () => {
      // Mieux vaut le dire avant la photo qu'après l'avoir prise.
      if (peutCreerUneFiche()) ouvrirFeuilleCreation(null);
    });
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

  const CONSIGNE_LECTURE = [
    "Tu es professeur et tu rédiges, pour un élève francophone, la fiche de révision",
    "de son document : un condensé fidèle, structuré, qui lui évite de rouvrir la page.",
    "",
    "Les images jointes sont les pages d'un même document : une leçon, un devoir ou un",
    "contrôle — reconnais toi-même ce que c'est et adapte la fiche :",
    "- une leçon : garde la structure du cours, les définitions, les formules et les repères ;",
    "- un devoir : retiens les méthodes de résolution, les étapes attendues et les erreurs à éviter ;",
    "- un contrôle : cible ce qui est tombé et la réponse attendue.",
    "Profil de l'élève : <<<PROFIL>>>.",
    "",
    "Lis ces pages (texte imprimé comme manuscrit) et réponds uniquement avec un objet JSON de cette forme :",
    '{"lisible": true, "titre": "Titre de chapitre, court", "matiere": "<<<MATIERES>>>",',
    ' "resume": {"accroche": "deux phrases qui situent le chapitre et disent à quoi il sert",',
    '            "objectifs": ["ce que l\'élève doit savoir faire après ce chapitre, 2 à 4"],',
    '            "sections": [{"titre": "Titre de la notion, comme dans le document",',
    '                          "texte": "le paragraphe qui explique cette notion",',
    '                          "points": ["les éléments à retenir de cette notion, 0 à 6"],',
    '                          "lexique": [{"terme": "le mot à connaître", "definition": "sa définition, en une phrase"}],',
    '                          "reperes": ["les formules, dates ou chiffres de cette notion, 0 à 4"]}],',
    '            "formules": ["toutes les formules, dates ou repères du document, 0 à 12"],',
    '            "exemples": ["chaque exemple du document, énoncé puis résolution, 0 à 6"],',
    '            "pieges": ["erreurs classiques que ce document permet d\'éviter, 0 à 4"]},',
    ' "flashcards": [{"recto": "le terme ou la question", "verso": "sa définition, en une phrase",',
    '                 "partie": 0, "terme": "le mot du lexique sur lequel porte la carte"}]}',
    "",
    "LE RÉSUMÉ — un chapitre découpé en notions, comme une fiche de révision :",
    "- découpe-le en 3 à 8 notions titrées, dans l'ordre du document ; reprends les titres",
    "  du document quand il en a (« Définition », « Caractéristiques », « Répartition »…) ;",
    "- chaque notion a un paragraphe qui explique, des points qui listent ce qui se retient,",
    "  son LEXIQUE (les mots à connaître de cette notion, avec leur définition) et ses REPÈRES",
    "  (ses formules, ses dates, ses chiffres) — c'est sur cette notion-là que l'élève sera",
    "  interrogé, alors tout ce qui la concerne doit s'y trouver ;",
    "- REPRENDS LES TERMES DU DOCUMENT, exactement : le vocabulaire, les noms propres, les",
    "  dates, les unités, les notations (variables, indices). N'en reformule aucun, ne les",
    "  remplace pas par des synonymes : l'élève sera interrogé sur ces mots-là ;",
    "- couvre TOUT le document, partie par partie, sans en sauter ;",
    "- reprends CHAQUE exemple : rappelle l'énoncé, puis déroule la résolution avec ses valeurs ;",
    "- en histoire-géo : garde toutes les dates, les lieux, les acteurs et les termes d'époque ;",
    "- reste fidèle : n'invente rien qui ne s'y trouve pas, ne complète pas par ce que tu sais,",
    "  et si un passage est illisible, ne le devine pas — laisse-le de côté.",
    "",
    "LES FLASHCARDS — au moins 10, une par terme à connaître :",
    "- 10 à 18 cartes ; s'il y a moins de 10 termes dans le document, prends aussi les dates,",
    "  les formules, les valeurs des exemples et les méthodes ;",
    "- RÉPARTIS-LES sur toutes les notions : chaque notion a ses cartes, et « partie » donne",
    "  le rang de la notion (0 pour la première), « terme » le mot du lexique qu'elle teste ;",
    "- recto : LE TERME du document (« Espace à fortes contraintes », « Doctrine Truman »,",
    "  « Raison d'une suite ») ou une question précise sur lui ;",
    "- verso : sa définition telle que le document la donne, en une phrase ;",
    '- questions à proscrire : "Propriété ?", "Définition ?", "Que dit le cours ?", ou tout',
    "  recto qui reprend un mot vague suivi d'un point d'interrogation ;",
    "- le verso répond vraiment, jamais par oui ou non.",
    "",
    "Enfin :",
    "- texte brut uniquement, pas de HTML ni de Markdown ;",
    '- si les pages sont illisibles ou ne contiennent pas de cours, réponds {"lisible": false, "raison": "…"} ;',
    "- tout est en français, calé sur le niveau de l'élève ;",
    "- aucun texte en dehors du JSON.",
  ].join("\n");

  const fiche = { pages: [], apercus: [], nom: "", sujet: "", matiere: null, lecture: null };
  let controleurScan = null;

  /** Coupe et échappe : ce que Claude renvoie est affiché, jamais interprété. */
  function nettoyer(texte, max = 240) {
    return echapper(couperNet(String(texte == null ? "" : texte).replace(/\s+/g, " ").trim(), max));
  }

  /**
   * Une phrase coupée en plein milieu ne veut plus rien dire — et c'est ce
   * qu'on lit ensuite dans la fiche. On coupe à la dernière fin de phrase
   * avant la limite ; à défaut, au dernier mot entier, suivi de points de
   * suspension pour que la coupe se voie.
   */
  function couperNet(texte, max) {
    if (texte.length <= max) return texte;
    const morceau = texte.slice(0, max);
    const fin = Math.max(
      morceau.lastIndexOf(". "), morceau.lastIndexOf("! "), morceau.lastIndexOf("? "),
      morceau.lastIndexOf("."), morceau.lastIndexOf("!"), morceau.lastIndexOf("?"));
    if (fin > max * 0.45) return morceau.slice(0, fin + 1).trim();
    const espace = morceau.lastIndexOf(" ");
    return `${(espace > 0 ? morceau.slice(0, espace) : morceau).trim()}…`;
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
    const sections = (Array.isArray(brut.sections) ? brut.sections : [])
      .filter((s) => s && typeof s === "object")
      .map((s) => ({
        titre: nettoyer(s.titre, 90),
        texte: nettoyer(s.texte, 900),
        points: listeNettoyee(s.points, 6, 320),
        // Le lexique de la notion : c'est lui qui nourrit les cartes et le quiz.
        lexique: (Array.isArray(s.lexique) ? s.lexique : [])
          .filter((entree) => entree && typeof entree === "object")
          .map((entree) => ({ terme: nettoyer(entree.terme, 60), definition: nettoyer(entree.definition, 300) }))
          .filter((entree) => entree.terme.length > 1 && entree.definition.length > 2)
          .slice(0, 8),
        reperes: listeNettoyee(s.reperes, 4, 200),
      }))
      .filter((s) => s.titre.length > 2 && (s.texte.length > 10 || s.points.length))
      .slice(0, 10);
    // Les anciennes fiches n'ont qu'une liste de points : on la garde telle quelle.
    const points = listeNettoyee(brut.points, 12, 400);
    const cartes = (Array.isArray(donnees.flashcards) ? donnees.flashcards : [])
      .filter((c) => c && typeof c === "object")
      .map((c) => {
        const carte = { recto: nettoyer(c.recto, 200), verso: nettoyer(c.verso, 300) };
        // La notion d'où vient la carte : c'est ce qui permet de réviser notion par notion.
        const partie = Number(c.partie);
        if (Number.isInteger(partie) && partie >= 0 && partie < sections.length) carte.partie = partie;
        const terme = nettoyer(c.terme, 60);
        if (terme.length > 1) carte.terme = terme;
        return carte;
      })
      .filter((c) => c.recto.length > 2 && c.verso.length > 0)
      .slice(0, 24);

    if (titre.length < 3 || (!sections.length && !points.length) || cartes.length < minCartes) return null;

    return {
      titre,
      matiere: MATIERES[donnees.matiere] ? donnees.matiere : null,
      contenu: {
        lu: true,
        accroche: nettoyer(brut.accroche, 400) || "Fiche tirée de ton document.",
        objectifs: listeNettoyee(brut.objectifs, 4, 200),
        sections,
        points,
        formules: listeNettoyee(brut.formules, 10),
        exemples: listeNettoyee(brut.exemples, 6, 700),
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
    $("#scan-sous-texte").textContent = "Photographie ta page : fiche, cartes et quiz en sortent.";
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
    if (typeof OCR !== "undefined" && OCR.serviceConfigure()) {
      return { etat: "prete", texte: "✳︎ Ta page est lue par un service spécialisé : titres, listes et écriture manuscrite." };
    }
    if (!claudeResolu) return { etat: "attente", texte: "Connexion…" };
    if (peutLirePhotos()) return { etat: "prete", texte: "✳︎ L'IA lit tes pages et écrit la fiche." };
    const secours = "Ton appareil peut la lire lui-même, gratuitement : fiche plus brute.";
    if (!sampleClaude) {
      return {
        etat: "sans-claude",
        texte: `Connecte-toi pour que l'IA rédige ta fiche. ${secours}`,
      };
    }
    return {
      etat: "sans-images",
      texte: `Les photos ne passent pas dans cette vue. ${secours}`,
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
    const invite = CONSIGNE_LECTURE
      .replace("<<<PROFIL>>>", niveauChoisi ? libelleNiveau().toLowerCase() : "non précisé")
      .replace("<<<MATIERES>>>", Object.keys(MATIERES).join("|"));

    controleurScan = new AbortController();
    $("#scan-lecture").hidden = true;
    $("#chargement-scan").hidden = false;
    $("#scan-stop").hidden = false;
    $("#scan-balayage").hidden = false;
    $("#scan-progres").textContent = "Lecture de tes pages…";
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
          $("#scan-progres").textContent = `Rédaction de ta fiche… (${text.length} caractères)`;
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
        messageScan("Les photos ne peuvent pas être envoyées depuis cette page : écris le chapitre toi-même.", "erreur");
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
        <p class="fiche-etiquette">${parAppareil ? "Lue sur ton appareil" : "Lue par l'IA"} · ${pages}</p>
        <h3 class="fiche-titre">${echapper(lecture.titre)}</h3>
        <p class="fiche-soustexte">${lecture.matiere ? MATIERES[lecture.matiere].nom + " · " : ""}${lecture.cartes.length} flashcards prêtes</p>
      </header>
      <p class="fiche-accroche">${lecture.contenu.accroche}</p>
      ${(lecture.contenu.sections || []).length
        ? `<ul class="fiche-sommaire">${lecture.contenu.sections
            .map((section) => `<li>${echapper(section.titre)}</li>`).join("")}</ul>`
        : sectionFiche("L'essentiel", (lecture.contenu.points || []).slice(0, 3), "fiche-section--points")}
      ${sectionFiche(lecture.contenu.libelleFormules || "Formules clés",
                     (lecture.contenu.formules || []).slice(0, 6), "fiche-section--reperes")}
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
    $("#scan-sous-texte").textContent = "C'est lu. Vérifie le titre, puis choisis.";
    rendreSuggestionsScan(null);
    $("#scan-resultat").hidden = false;
    $("#scan-resultat").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /** Repli : pas de lecture, on demande le thème à la main. */
  function ouvrirEtapeManuelle() {
    fiche.lecture = null;
    $("#scan-fiche-lue").hidden = true;
    $("#outil-cartes-detail").textContent = "Recto-verso";
    $("#scan-sous-texte").textContent = "Écris le chapitre, puis choisis.";
    rendreSuggestionsScan(fiche.matiere);
    $("#scan-resultat").hidden = false;
    $("#scan-resultat").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /**
   * Lecture de secours, sur l'appareil : Tesseract lit, des règles mettent
   * en fiche (voir ocr.js). Aucun compte, rien à payer, résultat plus brut —
   * et on le dit au lecteur plutôt que de le laisser croire à une IA.
   */
  async function lireSurAppareil({ avis = "" } = {}) {
    if (typeof OCR === "undefined") { ouvrirEtapeManuelle(); return; }

    controleurScan = new AbortController();
    $("#scan-lecture").hidden = true;
    $("#chargement-scan").hidden = false;
    $("#scan-stop").hidden = false;
    $("#scan-balayage").hidden = false;
    $("#scan-progres").textContent = "Préparation du moteur de lecture…";
    // L'avis du chemin précédent survit : sinon l'élève ne saurait pas pourquoi.
    messageScan(avis);
    etapesScan(["cadrage", "lecture"]);

    const pourcent = (part) => `${Math.round(Math.min(Math.max(part, 0), 1) * 100)} %`;

    try {
      const lecture = await OCR.lire(fiche.pages, {
        signal: controleurScan.signal,
        surProgres: ({ etape, part }) => {
          if (etape === "chargement") {
            $("#scan-progres").textContent = part > 0
              ? `Téléchargement du moteur de lecture… ${pourcent(part)}`
              : "Téléchargement du moteur de lecture… (quelques Mo, une seule fois)";
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

      /* Une photo floue rend du texte, mais du texte qui ne veut rien dire.
         Fabriquer une fiche avec ça ne rend pas service : on le dit. */
      const qualite = lecture.qualite || { verdict: "bon" };
      if (qualite.verdict === "mauvais") {
        messageScan(`Cette photo est trop mal lue pour en tirer une fiche fiable`
          + `${qualite.motif ? ` (${qualite.motif})` : ""}. Reprends-la à plat, bien éclairée, `
          + `en cadrant la page entière — ou écris le chapitre toi-même.`, "erreur");
        etapesScan(["cadrage"]);
        ouvrirEtapeManuelle();
        return;
      }

      const brute = OCR.structurer(lecture.texte, lecture.confiance);
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
          + "Reprends la photo bien à plat, ou écris le chapitre toi-même.", "erreur");
        etapesScan(["cadrage"]);
        ouvrirEtapeManuelle();
        return;
      }

      propre.contenu.moteur = "ocr";
      propre.contenu.accroche = brute.contenu.accroche;
      propre.contenu.libelleFormules = brute.contenu.libelleFormules;
      // Le texte lu voyage avec la fiche : on peut le relire pour vérifier.
      propre.contenu.texte = String(lecture.texte || "").slice(0, 6000);
      propre.texte = lecture.texte;

      fiche.lecture = propre;
      if (propre.matiere) fiche.matiere = propre.matiere;
      fiche.sujet = propre.titre;
      etapesScan(["cadrage", "lecture", "notions"]);
      if (qualite.verdict === "moyen") {
        messageScan(`Photo lue difficilement (${qualite.lisibles} % des mots sont sûrs). `
          + "Vérifie le titre et les formules, ou reprends la photo à plat.", "erreur");
      }
      afficherLecture(propre);
      return;
    } catch (erreur) {
      const code = erreur && erreur.code ? erreur.code : "echec";
      etapesScan(["cadrage"]);
      if (code === "cancelled") { messageScan("Lecture arrêtée."); }
      else if (code === "bloque") {
        messageScan("Le téléchargement du moteur s'est arrêté en chemin : cette page n'arrive pas à "
          + "le récupérer (réseau lent, ou blocage du navigateur). Écris le chapitre toi-même — "
          + "et dis-le-moi, c'est réparable.", "erreur");
      }
      else if (code === "moteur_absent") {
        messageScan("Le moteur de lecture n'a pas pu être chargé sur cette page "
          + "(connexion ou blocage du navigateur). Écris le chapitre toi-même.", "erreur");
      } else if (code === "illisible") {
        messageScan("Presque rien n'a été lu sur cette photo. Reprends-la à plat, bien éclairée, "
          + "ou écris le chapitre toi-même.", "erreur");
      } else {
        messageScan("La lecture a échoué sur cet appareil. Écris le chapitre toi-même.", "erreur");
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

  /* ————— Lecture par le service payant ————————————————————————————
     Le meilleur des trois chemins quand il est branché : il lit le
     manuscrit et rend du markdown déjà structuré, donc la fiche garde les
     titres du document au lieu de les deviner. La clé vit sur le serveur
     (voir serveur/LISEZMOI.md) ; ici on n'envoie que la photo.
     ———————————————————————————————————————————————————————————— */

  const ENNUIS_LECTURE = {
    service_absent: "La lecture par service n'est pas branchée sur cette version.",
    service_injoignable: "Le service de lecture n'est pas joignable depuis cette page.",
    service_lent: "Le service de lecture met trop de temps. Réessaie dans un instant.",
    service_sature: "Trop de lectures d'affilée : laisse passer un moment.",
    service_refuse: "Le service de lecture a refusé la demande (clé invalide côté serveur).",
    service_panne: "Le service de lecture a répondu de travers. Réessaie dans un instant.",
    service_trop_gros: "Tes photos pèsent trop lourd d'un coup. Reprends-en moins à la fois (deux suffisent).",
    illisible: "Presque rien n'a été lu sur cette photo. Reprends-la à plat, bien éclairée.",
  };

  async function lireParService() {
    controleurScan = new AbortController();
    $("#scan-lecture").hidden = true;
    $("#chargement-scan").hidden = false;
    $("#scan-stop").hidden = false;
    $("#scan-balayage").hidden = false;
    $("#scan-progres").textContent = "Envoi de ta page…";
    messageScan("");
    etapesScan(["cadrage", "lecture"]);

    try {
      const lecture = await OCR.lireParService(fiche.pages, {
        signal: controleurScan.signal,
        appareil: typeof ABONNEMENT !== "undefined" ? ABONNEMENT.appareil() : "",
        surProgres: ({ etape, part }) => {
          $("#scan-progres").textContent = etape === "envoi"
            ? `Envoi de tes pages… ${Math.round(part * 100)} %`
            : "Lecture de ta page…";
        },
      });

      const brute = OCR.structurerFiche(lecture.fiche, { moteur: "claude" });
      const propre = validerLecture({
        lisible: true,
        titre: brute.titre,
        matiere: brute.matiere,
        resume: brute.contenu,
        flashcards: brute.cartes,
      }, { minCartes: 0 });

      if (!propre) {
        messageScan("La page a été lue, mais il n'y a pas de quoi en tirer une fiche. "
          + "Vérifie que la photo montre bien un cours.", "erreur");
        etapesScan(["cadrage"]);
        ouvrirEtapeManuelle();
        return { fait: true };
      }

      propre.contenu.moteur = "claude";
      propre.contenu.accroche = brute.contenu.accroche;
      propre.contenu.libelleFormules = brute.contenu.libelleFormules;
      propre.contenu.sections = brute.contenu.sections;
      /* Ce que le service n'a pas su lire suit la fiche : une fiche muette
         sur ses trous se révise comme si elle était complète. */
      propre.contenu.aVerifier = brute.aVerifier || [];
      propre.contenu.texte = brute.contenu.texte;
      propre.texte = brute.texte;

      fiche.lecture = propre;
      if (propre.matiere) fiche.matiere = propre.matiere;
      fiche.sujet = propre.titre;
      etapesScan(["cadrage", "lecture", "notions"]);
      afficherLecture(propre);
      return { fait: true };
    } catch (erreur) {
      const code = (erreur && erreur.code) || "service_panne";
      if (code === "cancelled") { etapesScan(["cadrage"]); messageScan("Lecture arrêtée."); return { fait: true }; }
      /* Le service a flanché : plutôt que de laisser l'élève en plan, on
         repasse par l'appareil — et c'est la lecture suivante qui le dira,
         pour que le message ne soit pas effacé en chemin. */
      return {
        fait: false,
        avis: `${ENNUIS_LECTURE[code] || ENNUIS_LECTURE.service_panne} Je lis la page sur ton appareil.`,
      };
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

    // Le service payant d'abord : c'est lui qui lit le mieux.
    if (typeof OCR !== "undefined" && OCR.serviceConfigure()) {
      lireParService().then((issue) => { if (!issue.fait) lireSurAppareil({ avis: issue.avis }); });
      return;
    }

    if (!claudeResolu && attenteClaude) {
      $("#scan-progres").textContent = "Connexion…";
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
      toast("Dis de quoi parle ta fiche pour continuer.");
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
        etatCartes.partie = null;
        lancerCartes(null);
      } else {
        toast("Pas de cartes pour cette fiche : lance plutôt un quiz.");
        $("#form-cartes").hidden = false;
        $("#jeu-cartes").hidden = true;
        $("#bilan-cartes").hidden = true;
      }
      return;
    }

    // Résumé : la fiche lue a sa propre page, on l'y ouvre directement.
    if (enregistree && contenuDeLaFiche(enregistree)) { ouvrirFiche(enregistree, "cours"); return; }

    // Sans contenu lu, il reste l'atelier résumé.
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

  /** Tout ce que la fiche retient, à plat : sert au quiz et aux repères. */
  function pointsDeLaFiche(contenu) {
    if (!contenu) return [];
    if (Array.isArray(contenu.sections) && contenu.sections.length) {
      return contenu.sections.reduce((tout, section) => {
        if (section.texte) tout.push(section.texte);
        return tout.concat(section.points || []);
      }, []);
    }
    return contenu.points || [];
  }

  /** Les sections titrées du document, numérotées comme dans un cours. */
  function sectionsFiche(sections, ancre) {
    if (!Array.isArray(sections) || !sections.length) return "";
    return sections.map((section, rang) => `
      <section class="fiche-partie"${ancre ? ` id="${ancre}-${rang + 1}"` : ""}>
        <h4 class="fiche-partie-titre"><span class="fiche-partie-numero">${echapper(section.numero || String(rang + 1))}</span>${echapper(section.titre)}</h4>
        ${section.texte ? `<p class="fiche-partie-texte">${echapper(section.texte)}</p>` : ""}
        ${(section.points || []).length
          ? `<ul class="fiche-partie-points">${section.points.map((p) => `<li>${echapper(p)}</li>`).join("")}</ul>`
          : ""}
      </section>`).join("");
  }

  function sectionFiche(titre, elements, classe) {
    if (!elements || !elements.length) return "";
    const items = elements.map((e) => `<li>${echapper(e)}</li>`).join("");
    return `<section class="fiche-section ${classe}"><h4 class="fiche-soustitre">${titre}</h4><ul>${items}</ul></section>`;
  }

  /* ————— La fiche en pleine page ————————————————————————————————
     Relire, c'est le moment où l'on a besoin de calme : la fiche a sa
     propre page, sans réglages autour, avec le sommaire en tête et une
     partie par bloc. C'est là qu'on arrive après une lecture de photo.
     ———————————————————————————————————————————————————————————— */

  let retourFiche = "cours";       // d'où l'on vient, pour le bouton de retour
  let fichePageId = null;

  /** Le contenu lisible d'une fiche : ce qui a été lu, sinon le chapitre reconnu. */
  function contenuDeLaFiche(fiche) {
    if (!fiche) return null;
    if (fiche.contenu) return fiche.contenu;
    const banqueId = banqueDeLaFiche(fiche);
    return (banqueId && RESUMES[banqueId]) || null;
  }

  function ouvrirFiche(fiche, depuis) {
    if (!fiche) return;
    retourFiche = VUES.includes(depuis) ? depuis : "cours";
    fichePageId = fiche.id;
    const nom = $("#fiche-retour-nom");
    if (nom) nom.textContent = retourFiche === "cours" ? "Mes fiches" : "Retour";
    rendrePageFiche(fiche);
    afficherVue("fiche");
  }

  function blocPageFiche(titre, elements, classe) {
    if (!elements || !elements.length) return "";
    const lignes = elements.map((element) => {
      // « Exemple : … » sous un titre « Exemples » : on ne le dit pas deux fois.
      const texte = String(element).replace(/^Exemples?\s*[:\u202f]+\s*/i, "");
      // Seul ce qui se calcule mérite la police à chasse fixe.
      const calcul = /[=<>≤≥±×÷√∑]/.test(texte);
      return `<li${calcul ? ' class="calcul"' : ""}>${echapper(texte)}</li>`;
    }).join("");
    return `<section class="page-fiche-bloc ${classe || ""}">
        <h3>${echapper(titre)}</h3>
        <ul>${lignes}</ul>
      </section>`;
  }

  /** Une notion du parcours : son titre, sa maîtrise, son contenu et ses deux gestes. */
  function blocNotion(fiche, notion, rang) {
    const note = maitriseNotion(fiche, rang);
    const cartes = cartesDeLaFiche(fiche, rang);
    const etat = note === null ? "Pas encore testée" : `${note} % maîtrisé`;
    const lexique = (notion.lexique || []).slice(0, 8);

    return `
      <section class="notion" id="partie-${rang + 1}">
        <header class="notion-entete">
          <span class="notion-numero">${rang + 1}</span>
          <h3 class="notion-titre">${echapper(notion.titre)}</h3>
        </header>
        <div class="notion-jauge" role="progressbar" aria-valuemin="0" aria-valuemax="100"
             aria-valuenow="${note === null ? 0 : note}" aria-label="Maîtrise de ${echapper(notion.titre)}">
          <div class="notion-jauge-remplie" data-part="${note === null ? 0 : note}"></div>
        </div>
        <p class="notion-etat">${etat}${cartes.length ? ` · ${cartes.length} carte${cartes.length > 1 ? "s" : ""}` : ""}</p>

        ${notion.texte ? `<p class="notion-texte">${echapper(notion.texte)}</p>` : ""}
        ${(notion.points || []).length
          ? `<ul class="notion-points">${notion.points.map((point) => `<li>${echapper(point)}</li>`).join("")}</ul>`
          : ""}

        ${lexique.length ? `
          <dl class="lexique">
            ${lexique.map((entree) => `
              <dt>${echapper(entree.terme)}</dt>
              <dd>${echapper(entree.definition)}</dd>`).join("")}
          </dl>` : ""}

        ${(notion.reperes || []).length
          ? `<ul class="notion-reperes">${notion.reperes.map((repere) => `<li>${echapper(repere)}</li>`).join("")}</ul>`
          : ""}

        <div class="notion-actions">
          ${cartes.length || sampleClaude
            ? `<button class="bouton-notion" type="button" data-notion="cartes" data-rang="${rang}">${
                cartes.length ? "Réviser les cartes" : "Préparer mes cartes"}</button>`
            : ""}
          <button class="bouton-notion bouton-notion--test" type="button" data-notion="quiz" data-rang="${rang}">Me tester</button>
        </div>
      </section>`;
  }

  function rendrePageFiche(fiche) {
    const hote = $("#page-fiche");
    if (!hote) return;
    const contenu = contenuDeLaFiche(fiche);
    const matiere = MATIERES[fiche.matiere];
    const cartes = cartesDeLaFiche(fiche);
    const notions = notionsDeLaFiche(fiche);
    const lexique = lexiqueDeLaFiche(fiche);
    const points = (contenu && contenu.points) || [];
    const faible = notionLaPlusFaible(fiche);
    const meta = [
      SOURCES_FICHE[fiche.source] || "Sujet libre",
      notions.length ? `${notions.length} notion${notions.length > 1 ? "s" : ""}` : null,
      cartes.length ? `${cartes.length} carte${cartes.length > 1 ? "s" : ""}` : null,
      `révisée le ${formatDate.format(new Date(fiche.derniereRevision))}`,
    ].filter(Boolean).join(" · ");

    // Sans notions (fiche ancienne ou chapitre du catalogue), on garde la mise en page d'avant.
    const corps = notions.length
      ? notions.map((notion, rang) => blocNotion(fiche, notion, rang)).join("")
      : sectionFiche("L'essentiel", points, "fiche-section--points");

    hote.innerHTML = `
      <header class="page-fiche-entete">
        <span class="page-fiche-matiere">${matiere ? echapper(matiere.nom) : "Fiche"}</span>
        <h2 class="page-fiche-titre">${echapper(fiche.titre)}</h2>
        <p class="page-fiche-meta">${meta}</p>
        <div class="page-fiche-jauge" role="progressbar" aria-valuemin="0" aria-valuemax="100"
             aria-valuenow="${fiche.progression}" aria-label="Progression">
          <div class="page-fiche-jauge-remplie"></div>
        </div>
        <p class="page-fiche-meta">${fiche.progression} % maîtrisé</p>
      </header>

      ${faible && notions.length > 1 ? `
        <button class="page-fiche-reprise" type="button" data-page="reprendre" data-rang="${faible.rang}">
          <span class="page-fiche-reprise-titre">Reprendre par ${echapper(faible.titre)}</span>
          <span class="page-fiche-reprise-detail">${faible.maitrise === null
            ? "notion jamais testée"
            : `notion la plus fragile · ${faible.maitrise} %`}</span>
        </button>` : ""}

      ${contenu && contenu.accroche ? `<p class="page-fiche-avis">${contenu.accroche}</p>` : ""}

      ${(contenu && (contenu.objectifs || []).length) ? `
        <section class="page-fiche-objectifs">
          <h3>Ce que tu dois savoir</h3>
          <ul>${contenu.objectifs.map((objectif) => `<li>${echapper(objectif)}</li>`).join("")}</ul>
        </section>` : ""}

      ${notions.length > 1 ? `
        <nav class="page-fiche-sommaire" aria-label="Parcours du chapitre">
          <h3>Parcours du chapitre</h3>
          <ol>${notions.map((notion, rang) => {
            const note = maitriseNotion(fiche, rang);
            return `<li><button type="button" data-ancre="partie-${rang + 1}">
              <span>${echapper(notion.titre)}</span>
              <span class="sommaire-note">${note === null ? "—" : `${note} %`}</span>
            </button></li>`;
          }).join("")}</ol>
        </nav>` : ""}

      ${corps ? `<div class="page-fiche-corps">
        ${corps}
        ${blocPageFiche(contenu.libelleFormules || "Formules clés", contenu.formules, "page-fiche-bloc--reperes")}
        ${blocPageFiche("Exemples du cours", contenu.exemples)}
        ${blocPageFiche("Pièges fréquents", contenu.pieges)}
      </div>` : `<p class="page-fiche-vide">Cette fiche n'a pas encore de contenu lu. Photographie ta page :
        le texte, les notions et les cartes en sortiront.</p>`}

      ${lexique.length ? `
        <details class="reglages">
          <summary>Lexique du chapitre (${lexique.length} termes)</summary>
          <dl class="lexique lexique--tout">
            ${lexique.map((entree) => `
              <dt>${echapper(entree.terme)}</dt>
              <dd>${echapper(entree.definition)}</dd>`).join("")}
          </dl>
        </details>` : ""}

      ${contenu && contenu.texte ? `
        <details class="reglages">
          <summary>Voir le texte lu sur ta page</summary>
          <p class="texte-lu">${echapper(String(contenu.texte).slice(0, 6000))}</p>
        </details>` : ""}

      <div class="page-fiche-actions">
        <button class="bouton-principal" type="button" data-page="tester">Me tester sur tout le chapitre</button>
        <button class="bouton-secondaire" type="button" data-page="cartes">${
          cartes.length ? `Réviser les ${cartes.length} cartes` : "Préparer mes cartes"}</button>
        ${sampleClaude && cartes.length ? `<button class="bouton-texte" type="button" data-page="refaire-cartes">Refaire les cartes</button>` : ""}
        <button class="bouton-secondaire" type="button" data-page="photo">Ajouter une page photographiée</button>
      </div>
    `;

    $$("[data-ancre]", hote).forEach((lien) => {
      lien.addEventListener("click", () => {
        const cible = document.getElementById(lien.dataset.ancre);
        if (cible) cible.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    // Réviser une notion : les cartes de cette notion, le quiz sur elle seule.
    $$("[data-notion]", hote).forEach((bouton) => {
      bouton.addEventListener("click", () => {
        const rang = Number(bouton.dataset.rang);
        if (bouton.dataset.notion === "quiz") { reviserFiche(fiche, rang); return; }
        etatCartes.ficheId = fiche.id;
        etatCartes.partie = rang;
        afficherVue("flashcards");
        lancerCartes(null);
      });
    });

    $$("[data-page]", hote).forEach((bouton) => {
      bouton.addEventListener("click", () => {
        const action = bouton.dataset.page;
        if (action === "reprendre") {
          const rang = Number(bouton.dataset.rang);
          const cible = document.getElementById(`partie-${rang + 1}`);
          if (cible) cible.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        if (action === "tester") { reviserFiche(fiche); return; }
        if (action === "cartes" || action === "refaire-cartes") {
          etatCartes.ficheId = fiche.id;
          etatCartes.partie = null;
          afficherVue("flashcards");
          lancerCartes(null, { refaire: action === "refaire-cartes" });
          return;
        }
        afficherVue("scan");
      });
    });

    requestAnimationFrame(() => {
      const jauge = $(".page-fiche-jauge-remplie", hote);
      if (jauge) jauge.style.width = `${fiche.progression}%`;
      $$(".notion-jauge-remplie", hote).forEach((barre) => {
        barre.style.width = `${barre.dataset.part}%`;
      });
    });
  }

  function initPageFiche() {
    const retour = $("#fiche-retour");
    if (retour) retour.addEventListener("click", () => afficherVue(retourFiche));

    // Une notion notée pendant une séance : la page la montre à jour au retour.
    aRafraichir.push(() => {
      const ouverte = trouverFiche(fichePageId);
      if (ouverte) rendrePageFiche(ouverte);
    });
  }

  /* ————— Un chapitre, ses notions ————————————————————————————————
     Une fiche ne se révise pas d'un bloc : elle se révise notion par
     notion. Chaque notion porte son lexique, ses repères, ses cartes et
     sa maîtrise — et c'est la plus faible qu'on propose de reprendre.
     ———————————————————————————————————————————————————————————— */

  /** Les notions d'une fiche, dans l'ordre du document. */
  function notionsDeLaFiche(fiche) {
    const contenu = contenuDeLaFiche(fiche);
    return (contenu && Array.isArray(contenu.sections) ? contenu.sections : []);
  }

  /** La maîtrise d'une notion, en pourcentage ; null tant qu'elle n'a pas été testée. */
  function maitriseNotion(fiche, rang) {
    const table = fiche && fiche.maitrise;
    const valeur = table ? table[String(rang)] : null;
    return typeof valeur === "number" ? valeur : null;
  }

  /** Après une séance sur une notion : on garde le score et on recalcule la fiche. */
  function noterNotion(ficheId, rang, pourcentage) {
    const fiche = trouverFiche(ficheId);
    if (!fiche || typeof rang !== "number" || typeof pourcentage !== "number") return;
    fiche.maitrise = fiche.maitrise || {};
    fiche.maitrise[String(rang)] = Math.round(pourcentage);

    // La progression du chapitre, c'est la moyenne de ses notions — les
    // notions jamais testées comptent pour zéro : rien n'est acquis d'avance.
    const notions = notionsDeLaFiche(fiche);
    if (notions.length) {
      const somme = notions.reduce((total, _, i) => total + (maitriseNotion(fiche, i) || 0), 0);
      fiche.progression = Math.round(somme / notions.length);
    }
    majBibliotheque();
  }

  /** La notion la plus fragile : celle par laquelle reprendre. */
  function notionLaPlusFaible(fiche) {
    const notions = notionsDeLaFiche(fiche);
    if (!notions.length) return null;
    let rang = null;
    let pire = Infinity;
    notions.forEach((notion, i) => {
      const note = maitriseNotion(fiche, i);
      const valeur = note === null ? -1 : note;     // jamais testée = la plus urgente
      if (valeur < pire) { pire = valeur; rang = i; }
    });
    return rang === null ? null : { rang, titre: notions[rang].titre, maitrise: pire < 0 ? null : pire };
  }

  /** Le lexique du chapitre : les termes de chaque notion, sans doublon. */
  function lexiqueDeLaFiche(fiche) {
    const entrees = [];
    const vus = new Set();
    notionsDeLaFiche(fiche).forEach((notion, rang) => {
      (notion.lexique || []).forEach((entree) => {
        const cle = normaliser(entree.terme);
        if (!cle || vus.has(cle)) return;
        vus.add(cle);
        entrees.push({ ...entree, partie: rang });
      });
    });
    return entrees;
  }

  /**
   * Les cartes d'une fiche : celles lues sur le document, sinon une banque.
   * Avec un rang de notion, on ne garde que les cartes de cette notion.
   */
  function cartesDeLaFiche(fiche, partie) {
    if (!fiche) return [];
    if (fiche.cartes && fiche.cartes.length) {
      return fiche.cartes
        .filter((carte) => typeof partie !== "number" || carte.partie === partie)
        .map((carte) => ({ recto: carte.recto, verso: carte.verso, partie: carte.partie }));
    }
    if (typeof partie === "number") return [];
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
        if (!gardee) {
          // Sans titre, ou parce que la gratuité s'arrête là : le mur l'a déjà dit.
          if (!quotaFiches().atteint) toast("Donne un titre à ta fiche pour l'enregistrer.");
          return;
        }
        suite(gardee);
      },
    });
  }

  function rendreFiche() {
    const fiche = $("#fiche-resume");
    const source = sourceChoisie();
    if (!source) return;
    const { titre, sousTitre, contenu } = source;
    // Une fiche lue sur un document est déjà à la bonne taille : on ne la rabote pas.
    const anciens = contenu.points || [];
    const max = contenu.lu ? anciens.length : LONGUEURS[etatResume.longueur].points;
    const parties = sectionsFiche(contenu.sections);
    // Une fiche lue est un travail complet : on n'en cache aucune section.
    const { formules, exemples, pieges } = contenu.lu
      ? { formules: true, exemples: true, pieges: true }
      : etatResume.options;

    fiche.innerHTML = `
      <header class="fiche-entete">
        <p class="fiche-etiquette">${contenu.lu
          ? (contenu.moteur === "ocr" ? "Fiche lue sur ton document" : "Fiche écrite par l'IA")
          : LONGUEURS[etatResume.longueur].libelle}</p>
        <h3 class="fiche-titre">${echapper(titre)}</h3>
        <p class="fiche-soustexte">${sousTitre}</p>
      </header>
      <p class="fiche-accroche">${contenu.accroche}</p>
      ${parties || sectionFiche("L'essentiel", anciens.slice(0, max), "fiche-section--points")}
      ${formules ? sectionFiche(
          contenu.libelleFormules || "Formules clés",
          contenu.formules,
          contenu.libelleFormules ? "fiche-section--reperes" : "fiche-section--formules"
        ) : ""}
      ${exemples ? sectionFiche("Exemples corrigés", contenu.exemples, "fiche-section--exemples") : ""}
      ${pieges ? sectionFiche("Pièges fréquents", contenu.pieges, "fiche-section--pieges") : ""}
      ${sectionFiche("À vérifier sur ton cours", contenu.aVerifier, "fiche-section--verifier")}
      <div class="fiche-actions">
        <button class="bouton-principal" type="button" data-action="tester">Me tester sur cette fiche</button>
        <button class="bouton-secondaire" type="button" data-action="enregistrer">Enregistrer dans mes fiches</button>
        <button class="bouton-secondaire" type="button" data-action="flashcards">Réviser en flashcards</button>
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
            ouvrirFiche(gardee, "cours");
            return;
          }
          // Relire ne suffit pas : se tester juste après fixe bien mieux.
          if (action === "tester") { reviserFiche(gardee); return; }
          // Flashcards : seulement si un paquet existe pour ce sujet.
          if (!cartesDeLaFiche(gardee).length) {
            toast("Pas encore de cartes pour ce sujet : lance plutôt un quiz.");
            return;
          }
          etatCartes.ficheId = gardee.id;
          etatCartes.partie = null;
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
      ? "✳︎ Les questions sont écrites par l'IA, à la demande."
      : "L'IA n'est pas joignable ici : les questions viennent des chapitres déjà prêts.";
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

  /* ————— Des cartes écrites comme le quiz ————————————————————————
     Les cartes tirées par règles disent parfois n'importe quoi. Quand
     l'IA est joignable, elle écrit le paquet à partir de la fiche elle-
     même, exactement comme elle écrit le quiz — et le paquet est gardé
     avec la fiche, pour ne pas le refaire à chaque séance.
     ———————————————————————————————————————————————————————————— */

  const CONSIGNE_CARTES = [
    "Tu es professeur et tu prépares le paquet de flashcards de révision d'un élève francophone,",
    "à partir de SA fiche. Une flashcard : une question au recto, la réponse au verso.",
    "",
    "Chapitre : « <<<TITRE>>> » (<<<MATIERE>>>). Profil de l'élève : <<<PROFIL>>>.",
    "",
    "Contenu de la fiche, notion par notion :",
    "<<<CONTENU>>>",
    "",
    "Réponds uniquement avec un objet JSON de cette forme :",
    '{"cartes": [{"recto": "la question", "verso": "la réponse, en une phrase",',
    '             "partie": 0, "terme": "le mot du cours sur lequel porte la carte"}]}',
    "",
    "Règles :",
    "- 10 à 18 cartes, RÉPARTIES sur toutes les notions ; « partie » est le rang de la notion",
    "  (0 pour la première), et il y a au moins une carte par notion ;",
    "- une carte par terme à connaître : les définitions d'abord, puis les dates, les formules,",
    "  les valeurs des exemples et les méthodes ;",
    "- le recto est une VRAIE question, qui se comprend seule une semaine plus tard :",
    '  « Qu\'est-ce qu\'une contrainte naturelle ? », « Que signifie « densité » ? »,',
    '  « En quelle année commence la guerre froide ? », « Comment calcule-t-on la raison ? » ;',
    '- INTERDIT : « Définition ? », « Propriété ? », « Que dit le cours ? », un mot seul suivi',
    "  d'un point d'interrogation, ou une question qui renvoie à « cette » notion sans la nommer ;",
    "- le verso répond vraiment, en une phrase complète, jamais par oui ou non, et REPREND LES",
    "  TERMES DU DOCUMENT sans les reformuler ;",
    "- n'invente rien qui ne soit pas dans la fiche ;",
    "- tout est en français, calé sur le niveau de l'élève ;",
    "- aucun texte en dehors du JSON.",
  ].join("\n");

  /** La fiche mise à plat pour l'IA : ses notions, leur lexique, leurs repères. */
  function contenuPourIA(fiche) {
    const notions = notionsDeLaFiche(fiche);
    if (!notions.length) {
      const contenu = contenuDeLaFiche(fiche);
      const points = (contenu && contenu.points) || [];
      return points.map(texteBrut).slice(0, 12).map((point) => `- ${point}`).join("\n");
    }
    return notions.map((notion, rang) => {
      const morceaux = [`Notion ${rang} — ${texteBrut(notion.titre)}`];
      if (notion.texte) morceaux.push(texteBrut(notion.texte));
      (notion.points || []).slice(0, 6).forEach((point) => morceaux.push(`- ${texteBrut(point)}`));
      (notion.lexique || []).slice(0, 8).forEach((entree) => {
        morceaux.push(`- ${texteBrut(entree.terme)} : ${texteBrut(entree.definition)}`);
      });
      (notion.reperes || []).slice(0, 4).forEach((repere) => morceaux.push(`- ${texteBrut(repere)}`));
      return morceaux.join("\n");
    }).join("\n\n").slice(0, 6000);
  }

  /** Vérifie la forme des cartes rendues par l'IA avant d'en faire un paquet. */
  function validerCartesIA(donnees, notions) {
    if (!donnees || !Array.isArray(donnees.cartes)) return null;
    const cartes = donnees.cartes
      .filter((carte) => carte && typeof carte === "object")
      .map((carte) => {
        const propre = { recto: nettoyer(carte.recto, 200), verso: nettoyer(carte.verso, 300) };
        const partie = Number(carte.partie);
        if (Number.isInteger(partie) && partie >= 0 && partie < notions) propre.partie = partie;
        const terme = nettoyer(carte.terme, 60);
        if (terme.length > 1) propre.terme = terme;
        return propre;
      })
      // Une question digne de ce nom : trois mots et un point d'interrogation.
      .filter((carte) => carte.recto.split(" ").length >= 3 && /\?$/.test(carte.recto)
        && carte.verso.length > 3)
      .slice(0, 24);
    return cartes.length >= 4 ? cartes : null;
  }

  /**
   * Demande le paquet à l'IA et le range avec la fiche. Renvoie true si des
   * cartes ont été écrites, false s'il faut se rabattre sur les cartes locales.
   */
  async function ecrireCartesAvecIA(fiche) {
    const contenu = contenuPourIA(fiche);
    if (!contenu || contenu.length < 40) return false;

    const invite = CONSIGNE_CARTES
      .replace("<<<TITRE>>>", texteBrut(fiche.titre))
      .replace("<<<MATIERE>>>", MATIERES[fiche.matiere] ? MATIERES[fiche.matiere].nom : "matière libre")
      .replace("<<<PROFIL>>>", niveauChoisi ? libelleNiveau().toLowerCase() : "non précisé")
      .replace("<<<CONTENU>>>", contenu);

    controleurIA = new AbortController();
    $("#form-cartes").hidden = true;
    $("#jeu-cartes").hidden = true;
    $("#bilan-cartes").hidden = true;
    $("#chargement-cartes").hidden = false;
    $("#cartes-stop").hidden = false;
    $("#cartes-progres").textContent = "Écriture de tes cartes…";
    messageCartes("");

    try {
      const donnees = await sampleClaude.json(invite, {
        modelTier: "default",
        cache: false,
        signal: controleurIA.signal,
        onText: ({ text }) => {
          $("#cartes-progres").textContent = `Écriture de tes cartes… (${text.length} caractères)`;
        },
      });

      const cartes = validerCartesIA(donnees, notionsDeLaFiche(fiche).length || 99);
      if (!cartes) throw { code: "invalid_json", message: "forme inattendue" };

      fiche.cartes = cartes;
      fiche.cartesIA = true;
      majBibliotheque();
      return true;
    } catch (erreur) {
      const code = erreur && erreur.code ? erreur.code : "upstream_error";
      if (code === "cancelled") { messageCartes("Écriture arrêtée."); return false; }
      messageCartes(MESSAGES_IA[code] || MESSAGES_IA.upstream_error, REPLIS_LOCAUX.has(code) ? null : "erreur");
      if (REPLIS_LOCAUX.has(code) && code !== "rate_limited") { sampleClaude = null; afficherMoteurIA(); }
      return false;
    } finally {
      controleurIA = null;
      $("#chargement-cartes").hidden = true;
      $("#cartes-stop").hidden = true;
    }
  }

  function messageCartes(texte, ton) {
    const ligne = $("#cartes-message");
    if (!ligne) return;
    ligne.textContent = texte || "";
    ligne.className = `ia-message${ton ? " ia-message--" + ton : ""}`;
    ligne.hidden = !texte;
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
      partie: typeof etatQuiz.partie === "number" ? etatQuiz.partie : null,
      tirer: () => null, demandeIA,
    };
    $("#quiz-quitter").textContent = "Quitter le quiz";
    $("#jeu-quiz").hidden = false;
    afficherQuestion();
  }

  const MESSAGES_IA = {
    not_granted: "Tu n'as pas autorisé cette page à utiliser l'IA : je pioche dans les chapitres déjà prêts.",
    sampling_disabled: "L'IA n'est pas disponible sur ce compte : je pioche dans les chapitres déjà prêts.",
    not_declared: "L'IA n'est pas disponible ici : je pioche dans les chapitres déjà prêts.",
    capability_disabled: "L'IA n'est pas disponible ici : je pioche dans les chapitres déjà prêts.",
    capability_removed: "Cette version de l'application ne sait pas appeler l'IA : je pioche dans les chapitres déjà prêts.",
    rate_limited: "Trop de demandes d'un coup. Réessaie dans un moment.",
    session_expired: "Ta session a expiré : reconnecte-toi puis réessaie.",
    refused: "Cette demande a été déclinée. Reformule-la autrement.",
    empty_completion: "Rien n'a été écrit. Demande un peu moins à la fois.",
    invalid_json: "La réponse n'était pas exploitable. Réessaie, ou précise ta demande.",
    prompt_too_large: "Ta demande est trop longue : résume-la.",
    upstream_error: "La connexion a échoué. Réessaie dans un instant.",
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
    $(zone.progres).textContent = "Rédaction de ton quiz…";
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
          $(zone.progres).textContent = `Rédaction de ton quiz… (${text.length} caractères)`;
        },
      });

      const questions = validerQuizIA(donnees);
      if (!questions) throw { code: "invalid_json", message: "forme inattendue" };

      const titre = String(donnees.titre || "").trim();
      afficherVue("quiz");
      demarrerPartie(questions, `${titre || "Quiz sur mesure"} · écrit par l'IA`, demande);
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
      $("#ia-progres").textContent = "Connexion…";
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
        ? "L'IA peut l'écrire à la demande : lance la génération ci-dessous."
        : "L'IA n'est pas joignable dans cette vue. Autorise-la, ou choisis un chapitre déjà prêt."}</p>
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
        ${sampleClaude ? `<button class="bouton-principal" type="button" data-indispo="claude">Demander à l'IA</button>` : ""}
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
    if (partieQuiz.ficheId) {
      marquerRevisee(partieQuiz.ficheId, pourcentage);
      // Testé sur une notion : c'est cette notion-là qui progresse.
      if (typeof partieQuiz.partie === "number") noterNotion(partieQuiz.ficheId, partieQuiz.partie, pourcentage);
    }
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
        ${rates.length
          ? `<button class="bouton-principal" type="button" data-quiz="erreurs">Revoir mes ${rates.length} erreur${rates.length > 1 ? "s" : ""}</button>`
          : ""}
        <button class="${rates.length ? "bouton-secondaire" : "bouton-principal"}" type="button" data-quiz="rejouer">Refaire un quiz</button>
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
        if (action === "erreurs") {
          // Reprendre juste ce qui a manqué : c'est là que le progrès se joue.
          const reprise = rates.map((q) => ({
            enonce: q.enonce,
            explication: q.explication,
            choix: melanger(q.choix.map((c) => ({ texte: c.texte, correct: c.correct }))),
          }));
          bilan.hidden = true;
          demarrerPartie(reprise, `Reprise de tes ${rates.length} erreur${rates.length > 1 ? "s" : ""}`, demandeIA);
          return;
        }
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
      $("#quiz-progres").textContent = "Connexion…";
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
        partie: typeof etatQuiz.partie === "number" ? etatQuiz.partie : null,
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

    form.addEventListener("submit", (evt) => {
      evt.preventDefault();
      etatQuiz.partie = null;              // depuis le formulaire : tout le chapitre
      lancerQuiz();
    });
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

  const etatCartes = { matiere: "toutes", ficheId: null, ordre: "melange", partie: null };
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

  /* Plus la réponse a été difficile, plus la carte revient tôt : c'est le
     principe des paquets de Leitner, ramené à l'échelle d'une séance. */
  const RETOUR_CARTE = { revoir: 2, presque: 5 };
  const REPRISES_MAX = 2;

  function verdictCarte(verdict) {
    const carte = paquet.file.shift();
    paquet.vues += 1;

    if (verdict === "su") {
      paquet.sues.add(carte.id);
    } else {
      paquet.ratees.add(carte.id);
      paquet.sues.delete(carte.id);
      carte.reprises = (carte.reprises || 0) + 1;
      if (carte.reprises <= REPRISES_MAX) {
        const saut = Math.min(RETOUR_CARTE[verdict] || 3, paquet.file.length);
        paquet.file.splice(saut, 0, carte);   // replacée plus loin, pas en fin de paquet
      } else {
        paquet.sues.add(carte.id);            // trois passages : on la laisse pour la prochaine séance
      }
    }

    // Survie : la séance s'arrête à la nᵉ erreur, comme annoncé.
    if (paquet.survie && paquet.ratees.size >= paquet.survie) { bilanCartes(); return; }
    if (paquet.file.length) afficherCarte();
    else bilanCartes();
  }

  function bilanCartes() {
    const survie = Boolean(paquet.survie);
    // Un entraînement libre ne vient d'aucune fiche : ses boutons ne parlent pas de chapitre.
    const libre = !etatCartes.ficheId;
    const nomSeance = paquet.nom ? `« ${paquet.nom} »` : "l'entraînement";
    // En survie, on compte ce qu'on a tenu ; ailleurs, ce qu'on savait déjà.
    const total = survie ? paquet.vues : paquet.total;
    const ratees = paquet.ratees.size;
    const duPremierCoup = Math.max(total - ratees, 0);

    /* Un paquet fini est une révision : la fiche avance, et si le paquet
       portait sur une notion, c'est cette notion qui est notée. Un
       entraînement libre ne vise aucune fiche : il compte pour la série. */
    const pourcentage = total ? Math.round((duPremierCoup / total) * 100) : 0;
    if (etatCartes.ficheId && !paquet.partiel) {
      marquerRevisee(etatCartes.ficheId, pourcentage);
      if (typeof paquet.partie === "number") noterNotion(etatCartes.ficheId, paquet.partie, pourcentage);
    } else if (!etatCartes.ficheId && !paquet.partiel) {
      noterRevision();
      majBibliotheque();
    }
    if (survie) noterRecordSurvie(duPremierCoup);

    $("#jeu-cartes").hidden = true;
    const bilan = $("#bilan-cartes");
    bilan.innerHTML = `
      <p class="bilan-score">${survie ? duPremierCoup : `${duPremierCoup} / ${total}`}</p>
      <p class="bilan-pourcentage">${survie
        ? `cartes enchaînées${recordSurvie() > duPremierCoup ? ` · record : ${recordSurvie()}` : " · nouveau record !"}`
        : "cartes sues du premier coup"}</p>
      <p class="bilan-message">${ratees
        ? `${ratees} carte${ratees > 1 ? "s" : ""} à replacer dans ta révision espacée.`
        : "Paquet maîtrisé — prochaine révision dans quelques jours."}</p>
      <div class="bilan-actions">
        ${ratees ? `<button class="bouton-principal" type="button" data-cartes="ratees">Rejouer les ${ratees} carte${ratees > 1 ? "s" : ""} ratée${ratees > 1 ? "s" : ""}</button>` : ""}
        <button class="${ratees ? "bouton-secondaire" : "bouton-principal"}" type="button" data-cartes="tout">${
          libre ? `Relancer ${nomSeance}` : "Rejouer tout le paquet"}</button>
        <button class="bouton-secondaire" type="button" data-cartes="chapitre">${
          libre ? "Revenir à l'accueil" : "Changer de chapitre"}</button>
      </div>
    `;
    bilan.hidden = false;

    const idsRates = new Set(paquet.ratees);
    const rejouer = paquet.rejouer;
    $$("[data-cartes]", bilan).forEach((bouton) => {
      bouton.addEventListener("click", () => {
        const action = bouton.dataset.cartes;
        if (action === "chapitre") {
          bilan.hidden = true;
          if (libre) { afficherVue("accueil"); return; }
          $("#form-cartes").hidden = false;
          return;
        }
        if (action === "tout" && rejouer) { bilan.hidden = true; rejouer(); return; }
        lancerCartes(action === "ratees" ? idsRates : null);
      });
    });
  }

  let minuteurCartes;
  /**
   * Lance une séance sur une fiche. Comme pour le quiz, l'IA écrit le paquet
   * à partir de la fiche quand elle est joignable ; les cartes tirées par
   * règles restent le repli. `refaire` force une nouvelle écriture.
   */
  async function lancerCartes(seulement, { refaire = false } = {}) {
    const fiche = trouverFiche(etatCartes.ficheId);
    if (!fiche) {
      toast(fiches.length ? "Choisis une fiche." : "Ta bibliothèque est vide : crée d'abord une fiche.");
      return;
    }
    messageCartes("");

    // Un rejeu des ratées reprend le paquet en place : on ne le réécrit pas.
    const aEcrire = !seulement && sampleClaude && (refaire || !fiche.cartesIA)
      && (contenuDeLaFiche(fiche) || cartesDeLaFiche(fiche).length === 0);
    if (aEcrire) {
      const ecrit = await ecrireCartesAvecIA(fiche);
      if (!ecrit && !cartesDeLaFiche(fiche).length) {
        $("#form-cartes").hidden = false;
        messageCartes("Je n'ai pas pu écrire les cartes de cette fiche. Lance plutôt un quiz.", "erreur");
        return;
      }
    }

    const source = cartesDeLaFiche(fiche, typeof etatCartes.partie === "number" ? etatCartes.partie : undefined);
    let cartes = source.map((carte, i) => ({ ...carte, id: `${fiche.id}-${i}`, repassee: false }));
    if (seulement) cartes = cartes.filter((c) => seulement.has(c.id));
    if (!cartes.length) { toast("Pas encore de cartes pour cette fiche : lance plutôt un quiz."); return; }
    if (etatCartes.ordre === "melange") cartes = melanger(cartes);

    ouvrirPaquet(cartes, { partiel: Boolean(seulement) });
  }

  /**
   * Ouvre une séance de cartes. `survie` arrête la séance à la nᵉ erreur ;
   * `partiel` marque un rejeu, qui ne renote pas la notion.
   */
  function ouvrirPaquet(cartes, { survie = null, partiel = false, nom = "", rejouer = null } = {}) {
    $("#form-cartes").hidden = true;
    $("#bilan-cartes").hidden = true;
    $("#jeu-cartes").hidden = true;
    $("#chargement-cartes").hidden = false;

    clearTimeout(minuteurCartes);
    minuteurCartes = setTimeout(() => {
      $("#chargement-cartes").hidden = true;
      paquet = {
        file: cartes, total: cartes.length, sues: new Set(), ratees: new Set(),
        partie: typeof etatCartes.partie === "number" ? etatCartes.partie : null,
        partiel, survie, nom, rejouer, vues: 0,
      };
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

    form.addEventListener("submit", (evt) => {
      evt.preventDefault();
      etatCartes.partie = null;            // depuis le formulaire : tout le paquet
      lancerCartes(null);
    });

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

    $("#cartes-stop").addEventListener("click", () => { if (controleurIA) controleurIA.abort(); });
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
    journal = lireJournal();
    prenom = lirePrenom();
    rendreEntrainements($("#liste-entrainements"));
    initPrenom();

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
    initPageFiche();
    initQuiz();
    initCartes();
    initIllimite();

    // Bouton « Changer de niveau » du profil.
    $("#changer-niveau").addEventListener("click", ouvrirEcranNiveau);

    afficherVue("accueil");

    // Retour d'un paiement, ou simple revérification quotidienne.
    verifierRetourDePaiement();

    // Première visite : on demande la classe avant tout le reste.
    appliquerNiveau(lireNiveau());

    // Dossiers, file de révision, cloche, profil et sélecteurs d'un seul coup.
    majBibliotheque();

    if (!niveauChoisi) ouvrirEcranNiveau();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
