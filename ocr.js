/* ==========================================================================
   Lecture de secours : l'OCR tourne sur l'appareil du lecteur
   --------------------------------------------------------------------------
   Sans compte, sans serveur, sans rien à payer : Tesseract.js est chargé
   depuis un CDN, le modèle français est téléchargé une fois (~10 Mo, puis
   gardé en cache par le navigateur), et tout se passe dans la page.

   Ce moteur ne fait que LIRE : il rend du texte brut. La mise en fiche et
   les cartes sont fabriquées ici par des règles simples (§ Structuration),
   ce qui donne un résultat honnête sur un cours bien découpé et médiocre
   sur des notes en vrac. C'est le prix à payer pour se passer d'une IA.
   ========================================================================== */

const OCR = (function () {
  "use strict";

  /* Le moteur est servi depuis la même origine que l'app (dossier `moteur/`,
     voir moteur/LISEZMOI.md) : la page publiée n'a pas le droit d'aller
     chercher ses fichiers sur un domaine tiers. Les CDN restent en second,
     pour le cas où l'app serait servie sans ce dossier. */
  const SOURCES = {
    scripts: [
      "moteur/tesseract.min.js",
      "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js",
    ],
    worker: "moteur/worker.min.js",
    coeur: "moteur/",
    // Modèle français « fast » : 600 Ko compressés, largement assez sur de
    // l'imprimé. `langPath` n'a pas de barre finale, le worker l'ajoute.
    langues: [
      "moteur",
      "https://cdn.jsdelivr.net/npm/@tesseract.js-data/fra@1.0.0/4.0.0",
      "https://tessdata.projectnaptha.com/4.0.0",
    ],
  };

  /* Un téléchargement bloqué ne rend jamais la main : toute attente est bornée,
     et une attente qui progresse repousse sa propre limite. */
  const DELAI_SCRIPT = 20000;     // chargement du script depuis le CDN
  const DELAI_SONDE = 5000;       // test d'un chemin de modèle
  const DELAI_SILENCE = 30000;    // sans le moindre signe de vie du moteur

  function veille(delai) {
    let minuteur = null;
    let rejeter = null;
    const promesse = new Promise((_, rej) => { rejeter = rej; });
    const armer = () => {
      clearTimeout(minuteur);
      minuteur = setTimeout(() => rejeter({ code: "bloque" }), delai);
    };
    armer();
    return { promesse, toucher: armer, arreter: () => clearTimeout(minuteur) };
  }

  /** Borne une promesse dans le temps sans laisser de minuteur derrière soi. */
  function avecDelai(promesse, delai, code) {
    let minuteur = null;
    const limite = new Promise((_, rejeter) => {
      minuteur = setTimeout(() => rejeter({ code }), delai);
    });
    return Promise.race([promesse, limite]).finally(() => clearTimeout(minuteur));
  }

  let chargement = null;      // promesse de chargement du script
  let cheminLangue = null;    // premier chemin de modèle qui répond

  /* ————— Chargement du moteur ——————————————————————————————————— */

  function ajouterScript(url) {
    return new Promise((resoudre, rejeter) => {
      const balise = document.createElement("script");
      balise.src = url;
      balise.async = true;
      balise.addEventListener("load", () => resoudre(true));
      balise.addEventListener("error", () => rejeter(new Error("script refusé")));
      document.head.appendChild(balise);
    });
  }

  /** Charge Tesseract une seule fois ; false si aucun CDN n'est joignable. */
  function charger() {
    if (typeof Tesseract !== "undefined") return Promise.resolve(true);
    if (chargement) return chargement;

    chargement = SOURCES.scripts
      .reduce(
        (suite, url) => suite.catch(() => avecDelai(ajouterScript(url), DELAI_SCRIPT, "bloque")),
        Promise.reject(new Error("début"))
      )
      .then(() => typeof Tesseract !== "undefined")
      .catch(() => false);

    return chargement;
  }

  /** Le modèle de langue n'est pas rangé pareil partout : on prend le premier qui répond. */
  async function trouverLangue() {
    if (cheminLangue) return cheminLangue;
    for (const base of SOURCES.langues) {
      const abandon = new AbortController();
      const minuteur = setTimeout(() => abandon.abort(), DELAI_SONDE);
      try {
        const reponse = await fetch(`${base.replace(/\/$/, "")}/fra.traineddata.gz`, {
          method: "HEAD", mode: "cors", signal: abandon.signal,
        });
        if (reponse.ok) { cheminLangue = base; return base; }
      } catch (erreur) { /* bloqué ou trop lent : on essaie le suivant */
      } finally { clearTimeout(minuteur); }
    }
    cheminLangue = SOURCES.langues[0];   // dernier recours : Tesseract dira s'il échoue
    return cheminLangue;
  }

  /* ————— Lecture des pages ——————————————————————————————————————— */

  /**
   * Lit les pages une à une. `surProgres({ etape, part })` reçoit l'avancement,
   * `signal` permet d'arrêter entre deux pages.
   * Renvoie { texte, pages: [texte, …] } ou lève { code }.
   */
  async function lire(pages, { surProgres, signal } = {}) {
    const pret = await charger();
    if (!pret) throw { code: "moteur_absent" };

    const avancer = (etape, part) => { if (surProgres) surProgres({ etape, part }); };
    avancer("chargement", 0);

    const langPath = await trouverLangue();

    // Tant que le moteur progresse, on le laisse faire ; s'il se tait trop
    // longtemps (worker refusé, téléchargement gelé), on rend la main.
    const sentinelle = veille(DELAI_SILENCE);
    const suivre = (info) => {
      if (!info) return;
      sentinelle.toucher();
      if (typeof info.progress !== "number") return;
      if (info.status === "recognizing text") avancer("lecture", info.progress);
      else avancer("chargement", info.progress);
    };

    let ouvrier;
    try {
      ouvrier = await Promise.race([
        Tesseract.createWorker("fra", 1, {
          workerPath: SOURCES.worker,
          corePath: SOURCES.coeur,
          langPath,
          // Le worker est servi par le site : inutile de passer par un blob,
          // que la politique de sécurité de la page peut refuser.
          workerBlobURL: false,
          logger: suivre,
        }),
        sentinelle.promesse,
      ]);
    } catch (erreur) {
      sentinelle.arreter();
      throw erreur && erreur.code === "bloque" ? erreur : { code: "moteur_absent" };
    }

    const textes = [];
    try {
      for (let rang = 0; rang < pages.length; rang++) {
        if (signal && signal.aborted) throw { code: "cancelled" };
        avancer("page", rang / pages.length);
        sentinelle.toucher();
        const resultat = await Promise.race([ouvrier.recognize(pages[rang]), sentinelle.promesse]);
        textes.push(((resultat && resultat.data && resultat.data.text) || "").trim());
      }
    } finally {
      sentinelle.arreter();
      try { await ouvrier.terminate(); } catch (erreur) { /* déjà fermé */ }
    }

    const texte = textes.join("\n").trim();
    if (texte.replace(/\s/g, "").length < 40) throw { code: "illisible" };
    return { texte, pages: textes };
  }

  /* ————— Structuration : du texte brut à une fiche —————————————————
     Aucune IA ici. On s'appuie sur ce qu'un cours écrit laisse voir :
     des intitulés (« Définition », « Propriété »…), des deux-points, des
     égalités et des dates.
     ———————————————————————————————————————————————————————————— */

  // Ce qui fait une bonne carte : une notion qu'on doit savoir restituer.
  const INTITULES_CARTE = /^(d[ée]finition|propri[ée]t[ée]s?|th[ée]or[èe]me|r[èe]gle|formule|m[ée]thode|corollaire|lemme|vocabulaire)\b/i;
  // Ce qui éclaire la fiche sans faire une carte.
  const INTITULES_EXEMPLE = /^(exemple|application|illustration)\b/i;
  const INTITULES = /^(d[ée]finition|propri[ée]t[ée]s?|th[ée]or[èe]me|r[èe]gle|formule|m[ée]thode|remarque|exemple|cons[ée]quence|corollaire|lemme|vocabulaire|rappel|conclusion)\b/i;
  const BRUIT = /^(exercice|page\s*\d+|chapitre\s*\d*|sommaire|table des mati[èe]res|nom\s*:|pr[ée]nom\s*:|classe\s*:|\d{1,2}\s*[\/.]\s*\d{1,2})\s*$/i;

  const MOTS_MATIERES = {
    maths: ["suite", "suites", "derivee", "derivation", "fonction", "equation", "theoreme", "calcul",
            "probabilite", "vecteur", "geometrie", "polynome", "limite", "integrale", "raison",
            "arithmetique", "geometrique", "pourcentage", "statistique"],
    physique: ["force", "energie", "onde", "circuit", "tension", "intensite", "molecule", "atome",
               "reaction", "vitesse", "masse", "electrique", "chimique", "mole", "pression"],
    svt: ["cellule", "gene", "genetique", "espece", "enzyme", "adn", "chromosome", "organisme",
          "metabolisme", "evolution", "neurone", "immunitaire", "photosynthese"],
    histoire: ["guerre", "siecle", "roi", "revolution", "empire", "republique", "traite", "colonie",
               "territoire", "population", "etat", "regime", "frontiere", "urbanisation"],
    philo: ["conscience", "liberte", "verite", "morale", "justice", "devoir", "existence", "raison",
            "autrui", "desir", "bonheur", "kant", "descartes", "platon"],
    francais: ["texte", "auteur", "roman", "vers", "strophe", "metaphore", "narrateur", "registre",
               "poeme", "theatre", "argumentation", "figure de style"],
    economie: ["marche", "entreprise", "offre", "demande", "prix", "production", "chomage",
               "croissance", "inflation", "consommation", "budget"],
    info: ["algorithme", "variable", "boucle", "fonction", "tableau", "python", "programme",
           "condition", "donnees", "reseau"],
  };

  function sansAccents(texte) {
    return String(texte || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function lignesUtiles(texte) {
    return String(texte || "")
      .split(/\r?\n/)
      .map((ligne) => ligne.replace(/\s+/g, " ").trim())
      // Les caractères isolés sont du bruit de reconnaissance ; une égalité,
      // elle, est du contenu même sans mot lisible (« U1 = 8 »).
      .filter((ligne) => ligne.length > 2 && !BRUIT.test(ligne)
        && (/[a-zà-ÿ]{3}/i.test(ligne) || /[=<>]\s*[-\d(]/.test(ligne)));
  }

  /** La matière la plus représentée dans le texte, si elle se détache. */
  function devinerMatiere(texte) {
    const plat = sansAccents(texte);
    let meilleure = null;
    let meilleurScore = 0;

    Object.keys(MOTS_MATIERES).forEach((matiere) => {
      const score = MOTS_MATIERES[matiere].reduce((somme, mot) => {
        const trouves = plat.split(mot).length - 1;
        return somme + Math.min(trouves, 4);
      }, 0);
      if (score > meilleurScore) { meilleurScore = score; meilleure = matiere; }
    });

    return meilleurScore >= 3 ? meilleure : null;
  }

  /**
   * Le titre : sur une page de cours, il est souvent écrit deux fois —
   * dans l'en-tête et dans l'encadré. La ligne reprise ailleurs gagne.
   */
  function devinerTitre(lignes) {
    const debut = lignes.slice(0, 12);
    const candidates = debut.filter((ligne) =>
      ligne.length >= 8 && ligne.length <= 70
      && /[a-zà-ÿ]{3}/i.test(ligne)
      && !/[.;:]$/.test(ligne)
      && ligne.split(" ").length >= 2
      && !INTITULES.test(ligne));
    if (!candidates.length) return (debut[0] || "").slice(0, 70);

    /* Un titre de chapitre : court, sans virgule, capitalisé, haut de page,
       et souvent repris dans l'en-tête. Une phrase du cours coche l'inverse. */
    const plat = sansAccents(lignes.join(" | "));
    let meilleure = candidates[0];
    let meilleurScore = -Infinity;

    candidates.forEach((ligne) => {
      const rang = debut.indexOf(ligne);
      const mots = ligne.split(" ").length;
      const score =
          (plat.split(sansAccents(ligne)).length - 1) * 10   // repris ailleurs
        + (rang >= 0 && rang < 5 ? 6 : 0)                    // haut de page
        + (/^[A-ZÀ-Ý]/.test(ligne) ? 3 : -6)                 // commence par une majuscule
        + (ligne.includes(",") ? -8 : 0)                     // une virgule trahit une phrase
        + (mots <= 8 ? 3 : -2)                               // un titre est court
        + Math.min(ligne.length, 45) / 30;
      if (score > meilleurScore) { meilleurScore = score; meilleure = ligne; }
    });
    return meilleure;
  }

  function phrases(texte) {
    return String(texte || "")
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 25 && p.length < 240);
  }

  /** Cartes tirées des tournures d'un cours : intitulés, deux-points, égalités, dates. */
  function fabriquerCartes(lignes, titre) {
    const cartes = [];
    const vues = new Set();
    const chapitre = String(titre || "").slice(0, 44).replace(/\s+$/, "");

    const ajouter = (recto, verso) => {
      const r = recto.replace(/\s+/g, " ").trim();
      const v = verso.replace(/\s+/g, " ").trim();
      if (r.length < 5 || v.length < 3 || v.length > 320) return;
      const cle = sansAccents(r);
      if (vues.has(cle)) return;
      vues.add(cle);
      cartes.push({ recto: r, verso: v });
    };

    lignes.forEach((ligne, rang) => {
      if (INTITULES_EXEMPLE.test(ligne)) return;     // un exemple n'est pas une carte

      // « Définition : une suite est… » ou « Définition » puis la ligne suivante
      const intitule = ligne.match(INTITULES_CARTE);
      if (intitule) {
        const mot = `${intitule[0][0].toUpperCase()}${intitule[0].slice(1).toLowerCase()}`;
        const reste = ligne.slice(intitule[0].length).replace(/^[\s:—-]+/, "");
        const corps = reste.length > 10 ? reste : (lignes[rang + 1] || "");
        ajouter(chapitre ? `${mot} — ${chapitre} ?` : `${mot} ?`, corps);
        return;
      }

      // « terme : définition »
      const deuxPoints = ligne.match(/^([^:]{3,60}?)\s*:\s*(.{10,})$/);
      if (deuxPoints && /[a-zà-ÿ]/i.test(deuxPoints[1])) {
        ajouter(`${deuxPoints[1].trim()} ?`, deuxPoints[2]);
        return;
      }

      // « Un+1 = Un + 5 » : une formule nommée
      const egalite = ligne.match(/^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9_+\-()]{0,24})\s*=\s*(.{2,120})$/);
      if (egalite) {
        ajouter(`Que vaut ${egalite[1].trim()} ?`, `${egalite[1].trim()} = ${egalite[2].trim()}`);
        return;
      }

      // « 1789 : prise de la Bastille »
      const date = ligne.match(/^(1[0-9]{3}|20[0-9]{2})\s*[:–—-]\s*(.{5,})$/);
      if (date) ajouter(`Que se passe-t-il en ${date[1]} ?`, date[2]);
    });

    return cartes.slice(0, 12);
  }

  /**
   * Met le texte lu en forme de fiche. Renvoie la même structure que la
   * lecture par Claude, avec `moteur: "ocr"` pour que la page puisse le dire.
   */
  /** Retire les redites : une phrase déjà contenue dans une autre ne sert à rien. */
  function sansRedites(liste) {
    const gardees = [];
    liste.forEach((entree) => {
      const plat = sansAccents(entree);
      if (gardees.some((autre) => sansAccents(autre).includes(plat) || plat.includes(sansAccents(autre)))) return;
      gardees.push(entree);
    });
    return gardees;
  }

  function structurer(texte, type) {
    const lignes = lignesUtiles(texte);
    const titre = devinerTitre(lignes);
    const cartes = fabriquerCartes(lignes, titre);

    // Les plus longues phrases portent le cours ; on les remet dans l'ordre du document.
    const platTitre = sansAccents(titre);
    const toutes = sansRedites(phrases(lignes.join(" ")))
      // une « phrase » qui n'est que le titre recopié n'apprend rien
      .filter((phrase) => sansAccents(phrase).split(platTitre).join("").replace(/\W/g, "").length > 25);
    const retenues = toutes.slice().sort((a, b) => b.length - a.length).slice(0, 5);
    const points = toutes.filter((p) => retenues.includes(p));

    const exemples = lignes
      .filter((ligne) => INTITULES_EXEMPLE.test(ligne) && ligne.length > 25)
      .slice(0, 3);

    const formules = sansRedites(lignes
      .filter((ligne) => /=/.test(ligne) && ligne.length < 90))
      .slice(0, 6);

    return {
      titre: titre || "Document lu sur l'appareil",
      matiere: devinerMatiere(texte),
      contenu: {
        lu: true,
        moteur: "ocr",
        accroche: `Texte lu sur ${type === "lecon" ? "ta leçon" : type === "devoir" ? "ton devoir" : "ton contrôle"}, sans IA : relis-le avant de réviser.`,
        points: (points.length ? points : lignes.slice(1, 6)).slice(0, 6),
        formules,
        exemples,
        pieges: [],
        libelleFormules: "Formules & repères repérés",
      },
      cartes,
      texte,
    };
  }

  return { charger, lire, structurer, SOURCES };
})();
