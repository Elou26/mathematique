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

  /* ————— Lecture par service : Claude ——————————————————————————————
     Tesseract tourne sur l'appareil et ne coûte rien, mais il rend du
     texte à plat : il faut ensuite deviner où sont les titres, et le
     manuscrit lui échappe. Le service payant, lui, rend la fiche déjà
     faite — les notions du cours, leur résumé en phrases entières, le
     lexique et les cartes. Il n'y a donc plus rien à deviner ici.

     La clé n'est pas dans ce fichier : l'appel passe par `serveur/`, qui
     seul la connaît (voir serveur/LISEZMOI.md).

     L'adresse se règle sans toucher à ce fichier :
       <script>window.MATHEMATIQUE_LECTURE = { api: "https://…" }</script>
     À défaut, on réutilise celle du serveur de paiement : c'est le même.
     ———————————————————————————————————————————————————————————— */
  const SERVICE = { api: "", pagesMax: 4, delai: 90000 };

  if (typeof window !== "undefined") {
    const reglages = window.MATHEMATIQUE_LECTURE || null;
    const paiement = window.MATHEMATIQUE_PAIEMENT || null;
    if (reglages && reglages.api) SERVICE.api = reglages.api;
    else if (paiement && paiement.api) SERVICE.api = paiement.api;
    if (reglages && reglages.pagesMax) SERVICE.pagesMax = reglages.pagesMax;
  }

  function serviceConfigure() { return Boolean(SERVICE.api); }

  /** Une image en « data:…;base64,… », ce que le serveur attend. */
  function enDataURI(fichier) {
    return new Promise((resoudre, rejeter) => {
      const lecteur = new FileReader();
      lecteur.onload = () => resoudre(String(lecteur.result || ""));
      lecteur.onerror = () => rejeter({ code: "image_illisible" });
      lecteur.readAsDataURL(fichier);
    });
  }

  /**
   * Fait lire les pages par le service. Renvoie `{ markdown, pages, moteur }`.
   * Rejette avec un code que l'app sait dire à l'élève.
   */
  async function lireParService(pages, { surProgres, signal, appareil } = {}) {
    if (!serviceConfigure()) throw { code: "service_absent" };
    const avancer = (etape, part) => { if (surProgres) surProgres({ etape, part }); };

    avancer("envoi", 0);
    const images = [];
    for (let rang = 0; rang < Math.min(pages.length, SERVICE.pagesMax); rang++) {
      if (signal && signal.aborted) throw { code: "cancelled" };
      images.push(await enDataURI(pages[rang]));
      avancer("envoi", (rang + 1) / pages.length);
    }

    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), SERVICE.delai);
    if (signal) signal.addEventListener("abort", () => controleur.abort(), { once: true });

    try {
      avancer("lecture", 0.5);
      const reponse = await fetch(`${SERVICE.api}/lecture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages: images, appareil: appareil || "" }),
        signal: controleur.signal,
      });
      const donnees = await reponse.json().catch(() => null);
      if (!reponse.ok || !donnees) {
        const erreur = (donnees && donnees.erreur) || "";
        if (reponse.status === 503 || erreur === "lecture_non_configuree") throw { code: "service_absent" };
        if (reponse.status === 429) throw { code: "service_sature" };
        if (erreur === "cle_refusee") throw { code: "service_refuse" };
        /* 413 : le lot est plus lourd que ce que l'hébergeur laisse passer.
           C'est l'élève qui peut y remédier — encore faut-il le lui dire, au
           lieu de lui annoncer une panne qu'il ne peut pas réparer. Certains
           hébergeurs coupent eux-mêmes, sans JSON : d'où le test sur le code. */
        if (reponse.status === 413 || erreur === "corps_trop_gros") throw { code: "service_trop_gros" };
        throw { code: "service_panne" };
      }
      if (donnees.illisible) throw { code: "illisible" };
      if (!donnees.fiche) throw { code: "illisible" };
      avancer("lecture", 1);
      return { fiche: donnees.fiche, pages: donnees.pages || images.length, moteur: donnees.moteur || "claude" };
    } catch (erreur) {
      if (erreur && erreur.code) throw erreur;
      if (signal && signal.aborted) throw { code: "cancelled" };
      // Une page publiée peut être empêchée de joindre un autre domaine.
      throw { code: erreur && erreur.name === "AbortError" ? "service_lent" : "service_injoignable" };
    } finally {
      clearTimeout(minuteur);
    }
  }

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
    /* Modèle français « fast », servi sous le nom `modele-fra.txt` et encodé
       en base64 : l'hébergement ne sert ni les `.gz` ni les `.txt` binaires.
       Le worker embarqué demande ce nom-là et décode lui-même — les deux
       lignes modifiées sont détaillées dans moteur/LISEZMOI.md. */
    modele: "moteur",
    // Repli quand l'app tourne sans le dossier moteur/ : tout vient du CDN.
    secours: {
      worker: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
      coeur: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/",
      modele: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/fra@1.0.0/4.0.0",
    },
  };

  /* Un téléchargement bloqué ne rend jamais la main : toute attente est bornée,
     et une attente qui progresse repousse sa propre limite. */
  const DELAI_SCRIPT = 20000;     // chargement du script depuis le CDN
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
  let embarque = true;        // vrai tant qu'on sert le moteur nous-mêmes

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
        (suite, url) => suite.catch(() => avecDelai(ajouterScript(url), DELAI_SCRIPT, "bloque")
          .then(() => { embarque = url.indexOf("://") === -1; })),
        Promise.reject(new Error("début"))
      )
      .then(() => typeof Tesseract !== "undefined")
      .catch(() => false);

    return chargement;
  }

  /* ————— Préparation de l'image ————————————————————————————————
     Une photo de cahier a des ombres, un contraste mou et souvent trop
     ou pas assez de pixels. Trois gestes avant de lire : mettre à la
     bonne taille, effacer l'éclairage inégal, durcir le contraste.
     ———————————————————————————————————————————————————————————— */

  const LARGEUR_CIBLE = 1800;      // ce que Tesseract lit le mieux
  const AGRANDISSEMENT_MAX = 2;

  function toileDepuis(source, largeur, hauteur) {
    const toile = document.createElement("canvas");
    toile.width = largeur;
    toile.height = hauteur;
    const ctx = toile.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, largeur, hauteur);
    return toile;
  }

  /** Divise l'image par son propre flou : l'ombre s'efface, le texte reste. */
  function aplatirEclairage(toile) {
    const ctx = toile.getContext("2d", { willReadFrequently: true });
    const image = ctx.getImageData(0, 0, toile.width, toile.height);

    const petit = toileDepuis(toile, Math.max(1, toile.width >> 4), Math.max(1, toile.height >> 4));
    const flou = toileDepuis(petit, toile.width, toile.height)
      .getContext("2d", { willReadFrequently: true })
      .getImageData(0, 0, toile.width, toile.height);

    const pixels = image.data;
    const fond = flou.data;
    for (let i = 0; i < pixels.length; i += 4) {
      const gris = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      const base = Math.max(1, 0.299 * fond[i] + 0.587 * fond[i + 1] + 0.114 * fond[i + 2]);
      // Le papier est ramené vers le blanc quelle que soit l'ombre qui le couvre.
      let v = Math.min(255, (gris / base) * 205);
      // Puis on écarte l'encre du papier, sans binariser : Tesseract aime les gris.
      v = v < 115 ? v * 0.65 : Math.min(255, 115 + (v - 115) * 1.7);
      pixels[i] = pixels[i + 1] = pixels[i + 2] = v;
    }
    ctx.putImageData(image, 0, 0);
    return toile;
  }

  /** Renvoie une image prête à lire, ou le fichier d'origine si le navigateur ne suit pas. */
  async function preparerImage(fichier) {
    try {
      if (typeof createImageBitmap !== "function" || typeof document === "undefined") return fichier;
      const bitmap = await createImageBitmap(fichier);
      const facteur = Math.min(LARGEUR_CIBLE / bitmap.width, AGRANDISSEMENT_MAX);
      const largeur = Math.round(bitmap.width * (facteur > 0 ? facteur : 1));
      const hauteur = Math.round(bitmap.height * (facteur > 0 ? facteur : 1));
      const toile = aplatirEclairage(toileDepuis(bitmap, largeur, hauteur));
      if (typeof bitmap.close === "function") bitmap.close();

      const blob = await new Promise((resoudre) => {
        if (typeof toile.toBlob === "function") toile.toBlob(resoudre, "image/png");
        else resoudre(null);
      });
      return blob || fichier;
    } catch (erreur) {
      return fichier;                 // un traitement raté ne doit jamais bloquer la lecture
    }
  }

  /* ————— Filtrage par confiance ————————————————————————————————
     Tesseract note chaque mot. Sur une photo, les taches d'encre et les
     ombres ressortent en « mots » à 0 ou 30 de confiance : ce sont eux
     qui polluaient les fiches. On ne garde que ce dont il est sûr.
     ———————————————————————————————————————————————————————————— */

  /* Réglés au banc d'essai (tests/qualite-lecture.js) : sur une image nettoyée,
     un filtre serré coûte du texte sans gagner en propreté ; sur une image
     restée sale, il sauve la fiche. On s'adapte donc à ce que le moteur dit
     de sa propre lecture. */
  const SEUILS_NET = { mot: 30, ligne: 40 };
  const SEUILS_DIFFICILE = { mot: 60, ligne: 70 };
  const CONFIANCE_NETTE = 75;

  const SEUIL_MOT = SEUILS_NET.mot;
  const SEUIL_LIGNE = SEUILS_NET.ligne;

  function texteFiable(donnees, seuilMot, seuilLigne) {
    const lignes = (donnees && donnees.lines) || [];
    if (!lignes.length) return (donnees && donnees.text) || "";
    const difficile = typeof donnees.confidence === "number" && donnees.confidence < CONFIANCE_NETTE;
    const defauts = difficile ? SEUILS_DIFFICILE : SEUILS_NET;
    const parMot = typeof seuilMot === "number" ? seuilMot : defauts.mot;
    const parLigne = typeof seuilLigne === "number" ? seuilLigne : defauts.ligne;

    const gardees = [];
    lignes.forEach((ligne) => {
      const brut = String(ligne.text || "").trim();
      // Une ligne de formule est toujours moins sûre : on ne la juge pas comme du texte.
      const formule = /[=<>]|\d/.test(brut);
      const mots = (ligne.words || [])
        .filter((mot) => mot && mot.confidence >= (formule ? parMot - 20 : parMot) && String(mot.text || "").trim());
      if (!mots.length) return;

      const moyenne = mots.reduce((somme, mot) => somme + mot.confidence, 0) / mots.length;
      if (moyenne < (formule ? parLigne - 20 : parLigne)) return;

      const texte = mots.map((mot) => mot.text).join(" ").replace(/\s+/g, " ").trim();
      // Une « ligne » d'un seul signe est un reste d'ombre, pas du cours.
      if (texte.replace(/[^A-Za-zÀ-ÿ0-9]/g, "").length < 2) return;
      gardees.push(texte);
    });

    return gardees.join("\n");
  }

  /** Un mot coupé en fin de ligne est recollé. */
  function recollerCoupures(texte) {
    return String(texte || "").replace(/([A-Za-zÀ-ÿ])[-‐‑–]\s*\n\s*([a-zà-ÿ])/g, "$1$2");
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

    const chemins = embarque
      ? { worker: SOURCES.worker, coeur: SOURCES.coeur, modele: SOURCES.modele }
      : SOURCES.secours;

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
          workerPath: chemins.worker,
          corePath: chemins.coeur,
          langPath: chemins.modele,
          // Le worker est servi par le site : inutile de passer par un blob,
          // que la politique de sécurité de la page peut refuser.
          workerBlobURL: false,
          logger: suivre,
        }).then(async (w) => {
          // Les espaces entre mots comptent dans une formule.
          try { await w.setParameters({ preserve_interword_spaces: "1" }); } catch (erreur) { /* option absente */ }
          return w;
        }),
        sentinelle.promesse,
      ]);
    } catch (erreur) {
      sentinelle.arreter();
      throw erreur && erreur.code === "bloque" ? erreur : { code: "moteur_absent" };
    }

    const textes = [];
    const confiances = [];
    try {
      for (let rang = 0; rang < pages.length; rang++) {
        if (signal && signal.aborted) throw { code: "cancelled" };
        avancer("page", rang / pages.length);
        sentinelle.toucher();
        const image = await preparerImage(pages[rang]);
        sentinelle.toucher();
        const resultat = await Promise.race([ouvrier.recognize(image), sentinelle.promesse]);
        const donnees = (resultat && resultat.data) || {};
        confiances.push(typeof donnees.confidence === "number" ? donnees.confidence : 0);
        textes.push(recollerCoupures(texteFiable(donnees)).trim());
      }
    } finally {
      sentinelle.arreter();
      try { await ouvrier.terminate(); } catch (erreur) { /* déjà fermé */ }
    }

    const texte = textes.join("\n").trim();
    if (texte.replace(/\s/g, "").length < 40) throw { code: "illisible" };
    const confiance = confiances.length
      ? Math.round(confiances.reduce((somme, c) => somme + c, 0) / confiances.length)
      : 0;
    return { texte, pages: textes, confiance, qualite: qualiteTexte(texte, confiance) };
  }

  /* ————— Verdict de lisibilité ——————————————————————————————————
     Une photo floue donne du texte, mais du texte qui ne veut rien dire.
     Mieux vaut le dire à l'élève que de lui fabriquer une fiche incom-
     préhensible : on compte la part de mots qui existent vraiment.
     ———————————————————————————————————————————————————————————— */

  /* Un mot français plausible : des lettres, éventuellement un tiret ou
     une apostrophe. « nn] », « US> », « 4j » n'en sont pas. */
  const MOT_PLAUSIBLE = /^(?:[ldnmtscjLDNMTSCJ]['’])?[A-Za-zÀ-ÿ]{3,}(?:['’\-][A-Za-zÀ-ÿ]+){0,2}$/;
  const PETITS_MOTS = new Set(("a à au aux ce ces cet de des du en et est été il ils je la le les leur "
    + "lui ma me mes moi mon ne ni non nos notre nous on ont ou où par pas peu plus pour que qui quoi "
    + "sa se ses si son sont sur ta te tes toi ton tu un une vos votre vous y d l n s c j m t "
    + "ai as eu fut ont sois soit").split(" "));
  /* Un mot sans voyelle de trois lettres ou plus n'existe pas en français :
     c'est du bruit de lecture. */
  const SANS_VOYELLE = /^[^aeiouyàâäéèêëîïôöùûüAEIOUYÀÂÄÉÈÊËÎÏÔÖÙÛÜ]{3,}$/;

  /** Part des mots qui existent vraiment, entre 0 et 1, et compte de jetons. */
  function partLisible(texte) {
    const jetons = String(texte || "")
      .split(/\s+/)
      .map((mot) => mot.replace(/^[^A-Za-zÀ-ÿ0-9]+|[^A-Za-zÀ-ÿ0-9]+$/g, ""))
      .filter((mot) => mot.length > 0);
    let lisibles = 0;
    let bruit = 0;
    jetons.forEach((mot) => {
      const plat = mot.toLowerCase();
      if (MOT_PLAUSIBLE.test(mot) || PETITS_MOTS.has(plat) || /^\d[\d.,/%°-]*$/.test(mot)) lisibles++;
      else if (SANS_VOYELLE.test(mot) || mot.length <= 2) bruit++;
    });
    return { mots: jetons.length, part: jetons.length ? lisibles / jetons.length : 0, bruit };
  }

  function qualiteTexte(texte, confiance) {
    const { mots: total, part: fraction, bruit } = partLisible(texte);
    const jetons = { length: total };
    if (!total) return { verdict: "mauvais", motif: "aucun mot lisible", mots: 0, lisibles: 0, confiance: confiance || 0 };

    const part = Math.round(fraction * 100);
    const note = typeof confiance === "number" ? confiance : 100;
    const verdict =
        jetons.length < 20 ? "mauvais"
      : part < 60 ? "mauvais"
      : note < 55 && part < 75 ? "mauvais"
      : part < 78 || note < 68 ? "moyen"
      : "bon";
    const motif =
        jetons.length < 20 ? "trop peu de texte lu"
      : part < 60 ? `${100 - part} % des mots lus n'en sont pas`
      : note < 55 && part < 75 ? "photo trop peu nette"
      : "";

    return { verdict, motif, mots: jetons.length, lisibles: part, bruit, confiance: note };
  }

  /* ————— Structuration : du texte brut à une fiche —————————————————
     Aucune IA ici. On s'appuie sur ce qu'un cours écrit laisse voir :
     des intitulés (« Définition », « Propriété »…), des deux-points, des
     égalités et des dates.
     ———————————————————————————————————————————————————————————— */

  // Ce qui fait une bonne carte : une notion qu'on doit savoir restituer.
  const NUMERO = "(?:[IVX]+|\\d+(?:\\.\\d+)?)\\s*(?:[).\\-]\\s*|\\s+(?=[A-ZÀ-Ý]))";

  // `\b` ne voit pas les accents comme des lettres : « Propriété » n'était
  // jamais reconnu. On teste donc « pas suivi d'une lettre ».
  const FIN_MOT = "(?![a-zà-ÿ])";
  const INTITULES_CARTE = new RegExp(
    `^(?:${NUMERO})?(d[ée]finition|propri[ée]t[ée]s?|th[ée]or[èe]me|r[èe]gle|formule|m[ée]thode|corollaire|lemme|vocabulaire)${FIN_MOT}`, "i");
  // Ce qui éclaire la fiche sans faire une carte.
  const INTITULES_EXEMPLE = new RegExp(`^(?:${NUMERO})?(exemple|application|illustration)${FIN_MOT}`, "i");
  const INTITULES = new RegExp(
    `^(?:${NUMERO})?(d[ée]finition|propri[ée]t[ée]s?|th[ée]or[èe]me|r[èe]gle|formule|m[ée]thode|remarque|exemple|cons[ée]quence|corollaire|lemme|vocabulaire|rappel|conclusion)${FIN_MOT}`, "i");
  const BRUIT = /^(exercice|page\s*\d+|chapitre\s*\d*|sommaire|table des mati[èe]res|nom\s*:|pr[ée]nom\s*:|classe\s*:|\d{1,2}\s*[\/.]\s*\d{1,2})\s*$/i;

  /* Une capture d'écran de l'application (ou du navigateur) se reconnaît à ses
     propres mots : on les écarte du cours, et on prévient si elle domine. */
  const BRUIT_APP = new RegExp([
    "claude\\.ai", "connexion", "le contenu est g[ée]n[ée]r[ée]", "pages cadr[ée]es",
    "lecture du document", "continuer sans lecture", "flashcards? [ée]crites",
    "photographier", "qu'est-ce que tu veux en faire", "accueil\\s+fiches\\s+profil",
    "le cours, la le[çc]on du cahier", "cadre ta page", "prendre une photo",
    "choisir une image", "ajouter une page", "th[èe]me de la fiche", "recommencer",
    "mati[èe]res? suivies?", "fiches cr[ée][ée]es",
  ].join("|"), "i");

  /* Les scories que l'OCR accroche aux bords d'une ligne : une lettre isolée,
     un « 1 > », un « US > », un « PES » ou un « nn] 4 » en fin de phrase.
     Elles ne veulent rien dire et polluaient titres et cartes. */
  const SCORIES_DEBUT = /^(?:[A-ZÀ-Ýa-zà-ÿ]\s+(?=[A-ZÀ-Ý])|[A-Z]{1,4}\s*[>»]\s*|\d{1,3}\s*[>»]\s*|[^A-Za-zÀ-ÿ0-9]{1,3}\s*)+/;
  const SCORIES_FIN = /(?:\s+[A-Z]{2,4}|\s+[a-zà-ÿ]|\s*[\]\[|=~—–]+\s*\d{0,2}|\s+\d{1,2}\s*[\]\[|])+$/;

  function retirerScories(ligne) {
    let propre = ligne.replace(SCORIES_DEBUT, "");
    // On ne rogne la fin que si la ligne garde de quoi être une phrase.
    const rogne = propre.replace(SCORIES_FIN, "");
    if (rogne.replace(/[^A-Za-zÀ-ÿ]/g, "").length >= 12) propre = rogne;
    return propre.trim();
  }

  /* Corrections de reconnaissance les plus fréquentes sur un cours. */
  function nettoyerLigne(ligne) {
    return retirerScories(ligne
      .replace(/^[«»"'|@©®*•·~^_=+\-–—.\s]+/, "")     // décorations de début de ligne
      .replace(/\s[|¦~]\s/g, " ")                      // barres et tildes lus en plein texte
      .replace(/\s*([=<>])\s*/g, " $1 ")               // « U =8 » → « U = 8 »
      .replace(/\s+([,;:.!?])/g, "$1")                 // espace avant ponctuation
      .replace(/([^\s])([;:!?])/g, "$1\u202f$2")        // … et on remet l'espace fine du français
      .replace(/\s{2,}/g, " ")
      .replace(/[,;]\s*$/, "")                         // virgule ou point-virgule orphelin
      .trim());
  }

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
      .map((ligne) => nettoyerLigne(ligne.replace(/\s+/g, " ").trim()))
      .filter((ligne) => !BRUIT_APP.test(ligne))
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
      && !INTITULES.test(ligne));
    if (!candidates.length) return (debut[0] || "").slice(0, 70);

    /* Un titre de chapitre : court, sans virgule, capitalisé, haut de page,
       et souvent repris dans l'en-tête. Une phrase du cours coche l'inverse.
       « CONTRAINTES » en capitales est un titre ; « 1.1 Qu'est-ce qu'une
       contrainte ? » est une partie, pas le titre du document. */
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
        + (CAPITALES.test(ligne) ? 9 : 0)                     // un intertitre s'écrit en capitales
        + (ligne.includes(",") ? -8 : 0)                     // une virgule trahit une phrase
        + (/\?$/.test(ligne) ? -9 : 0)                       // une question ouvre une partie
        + (TITRE_NUMEROTE.test(ligne) ? -7 : 0)              // « 1.1 … » numérote une partie
        + (mots <= 8 ? 3 : -2)                               // un titre est court
        + Math.min(ligne.length, 45) / 30;
      if (score > meilleurScore) { meilleurScore = score; meilleure = ligne; }
    });
    return nettoyerTitre(meilleure);
  }

  /** Une ligne tout en capitales : trois lettres majuscules, aucune minuscule. */
  const CAPITALES = /^[^a-zà-ÿ]*[A-ZÀ-Ý][^a-zà-ÿ]*$/;

  /**
   * Découpe en phrases lisibles. Une fiche se lit en un coup d'œil : on écarte
   * les fragments, les pavés et tout ce qui vient de l'interface.
   */
  function phrases(texte) {
    return String(texte || "")
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?:])\s+(?=[A-ZÀ-Ý0-9])/)
      .map((p) => nettoyerLigne(p))
      .filter((p) =>
        p.length >= 30 && p.length <= 220
        && p.split(" ").length >= 5
        && /[a-zà-ÿ]{3}/i.test(p)
        && !BRUIT_APP.test(p)
        && !/[:;]$/.test(p)                            // « … sont : » annonce une liste
        && p.split("=").length <= 2                    // deux égalités : c'est une ligne de calcul
        && partLisible(p).part >= 0.85                 // une phrase qui se lit, mot après mot
        && /^[A-ZÀ-Ý0-9«"]/.test(p));                  // une phrase, pas un bout de phrase
  }

  /** Cartes tirées des tournures d'un cours : intitulés, deux-points, égalités, dates. */
  /* ————— Des questions qui se tiennent seules ————————————————————
     Une carte dont le recto est « Propriété ? » ne veut rien dire une
     semaine plus tard. Chaque recto nomme donc ce sur quoi il porte.
     ———————————————————————————————————————————————————————————— */

  const VERBES_DEFINITION = /\s(?:est|sont|se d[ée]finit|d[ée]signe|s'appelle|correspond)\s/i;
  /* « une telle suite », « cette valeur », « ce nombre » : ce n'est pas un
     terme du cours, c'est un renvoi à la phrase d'avant. Une carte là-dessus
     ne veut plus rien dire une semaine après. */
  const TERME_VAGUE = new RegExp(
    "^(?:l'|la |le |les |un |une |des |du |de la )?"
    + "(?:tel|telle|tels|telles|ce|cet|cette|ces|autre|autres|m[êe]me|m[êe]mes|chaque|tout|toute|"
    + "tous|toutes|certain|certains|premier|premi[èe]re|dernier|derni[èe]re|nombre|valeur|exemple|"
    + "chose|cas|r[ée]sultat|suivant|suivante|pr[ée]c[ée]dent|pr[ée]c[ée]dente)"
    + FIN_MOT, "i");
  const ARTICLES = /^(?:l'|la |le |les |un |une |des |du |de la )/i;

  /**
   * « Qu'est-ce qu'une suite arithmétique ? » quand le terme porte son article,
   * « Que signifie « raison » ? » sinon — inventer un article se trompe de genre.
   */
  function questionDefinition(terme) {
    let propre = terme
      .replace(/^[«»"']+|[»"'.]+$/g, "")
      // « 2.1 Les milieux froids » : le numéro du cours n'a rien à faire dans une question.
      .replace(new RegExp(`^(?:${NUMERO})`), "")
      .replace(/^[\s.)\-–—]+/, "")
      .trim();
    if (propre.length < 3) return "";
    if (TERME_VAGUE.test(propre)) return "";

    if (!ARTICLES.test(propre)) {
      // Un terme nu se cite tel quel : lui inventer un article se trompe de genre
      // une fois sur deux. Mais on ne cite qu'un terme, pas un titre de partie.
      if (propre.split(" ").length > 4) return "";
      /* « Contrainte naturelle » se dit en minuscules au milieu d'une phrase ;
         « Doctrine Truman » garde sa majuscule interne, donc on n'y touche pas. */
      const nomPropre = /[A-ZÀ-Ý]/.test(propre.slice(1));
      const mot = !nomPropre && /^[A-ZÀ-Ý]/.test(propre)
        ? propre.charAt(0).toLowerCase() + propre.slice(1)
        : propre;
      return `Que signifie « ${mot} » dans ce cours ?`;
    }

    // « Une suite… » au milieu d'une question : la majuscule n'a plus lieu d'être.
    if (/^[A-ZÀ-Ý][a-zà-ÿ]/.test(propre)) propre = propre[0].toLowerCase() + propre.slice(1);
    // Le pluriel appelle « Que sont… » : « Qu'est-ce que les milieux froids ? » sonne faux.
    if (/^(?:les |des )/.test(propre)) return `Que sont ${propre} ?`;
    const elide = /^(?:un |une |l')/i.test(propre) || /^[aeiouyéèêàh]/i.test(propre);
    return `Qu'est-ce qu${elide ? "'" : "e "}${propre} ?`;
  }

  /** Le sujet d'une définition : « une suite arithmétique est … » → « une suite arithmétique ». */
  function sujetDefini(corps) {
    const coupe = corps.split(VERBES_DEFINITION);
    if (coupe.length < 2) return "";
    const sujet = coupe[0].trim();
    if (sujet.length < 4 || sujet.length > 60 || sujet.split(" ").length > 8) return "";
    return sujet;
  }

  /** Une phrase de réponse : majuscule au début, point à la fin. */
  function enReponse(texte) {
    const propre = texte.replace(/^[\s:—–-]+/, "").replace(/\s+/g, " ").trim();
    if (!propre) return "";
    const majuscule = propre[0].toUpperCase() + propre.slice(1);
    return /[.!?)]$/.test(majuscule) ? majuscule : `${majuscule}.`;
  }

  /**
   * Le terme tel qu'il entre au lexique : sans numéro, sans article, capitalisé.
   * « une oasis » → « Oasis », « 2.1 Les milieux froids » → « Milieux froids ».
   */
  function termeLexique(brut) {
    const propre = String(brut || "")
      .replace(/^[«»"']+|[»"'.:]+$/g, "")
      .replace(new RegExp(`^(?:${NUMERO})`), "")
      .replace(ARTICLES, "")
      .replace(/^[\s.)\-–—]+/, "")
      .trim();
    if (propre.length < 2) return "";
    return propre.charAt(0).toUpperCase() + propre.slice(1);
  }

  function fabriquerCartes(lignes, titre, partieDeLigne) {
    const cartes = [];
    const vues = new Set();
    let partie = null;       // la notion de la ligne en cours de lecture
    const brutTitre = String(titre || "").slice(0, 44).replace(/\s+$/, "");
    // « … sur CONTRAINTES ? » crie au milieu d'une phrase : on rend sa casse au titre.
    const casse = CAPITALES.test(brutTitre) && brutTitre.length > 3
      ? brutTitre.charAt(0) + brutTitre.slice(1).toLowerCase()
      : brutTitre;
    /* Comment nommer le chapitre dans une question : « sur les suites
       arithmétiques » quand le titre porte son article, « sur le chapitre
       « Contraintes » » sinon — « sur Contraintes » n'est pas du français. */
    const chapitre = !casse ? ""
      : ARTICLES.test(casse) ? casse.charAt(0).toLowerCase() + casse.slice(1)
      : `le chapitre « ${casse} »`;

    const ajouter = (recto, verso, terme) => {
      const r = recto.replace(/\s+/g, " ").trim();
      const v = enReponse(verso);
      // Une question digne de ce nom : au moins trois mots et une forme interrogative.
      if (r.length < 12 || r.split(" ").length < 3 || !/\?$/.test(r)) return;
      if (v.length < 4 || v.length > 320) return;
      const cle = sansAccents(r);
      if (vues.has(cle)) return;
      vues.add(cle);
      const carte = { recto: r, verso: v };
      if (partie !== null && partie >= 0) carte.partie = partie;
      // Un terme défini entre aussi au lexique de sa notion.
      const mot = termeLexique(terme);
      if (mot && mot.length <= 48) carte.terme = mot;
      cartes.push(carte);
    };

    lignes.forEach((ligne, rang) => {
      partie = partieDeLigne ? partieDeLigne(rang) : null;
      if (INTITULES_EXEMPLE.test(ligne)) return;     // un exemple n'est pas une carte

      // « Définition : une suite arithmétique est… », numéro éventuel compris
      const intitule = ligne.match(INTITULES_CARTE);
      if (intitule) {
        const brut = intitule[1].toLowerCase();
        const reste = ligne.slice(intitule[0].length).replace(/^[\s:—–-]+/, "");
        const corps = reste.length > 10 ? reste : (lignes[rang + 1] || "");
        const sujet = sujetDefini(corps);

        if (/^d[ée]finition|vocabulaire/.test(brut) && sujet) {
          ajouter(questionDefinition(sujet), corps, sujet);
        } else if (/^(propri[ée]t|th[ée]or[èe]me|r[èe]gle|corollaire|lemme)/.test(brut)) {
          ajouter(chapitre
            ? `Quelle ${brut.replace(/s$/, "")} le cours énonce-t-il sur ${chapitre} ?`
            : `Quelle ${brut.replace(/s$/, "")} le cours énonce-t-il ?`, corps);
        } else if (/^(formule|m[ée]thode)/.test(brut)) {
          ajouter(chapitre
            ? `Quelle ${brut} retenir pour ${chapitre} ?`
            : `Quelle ${brut} le cours donne-t-il ?`, corps);
        } else if (sujet) {
          ajouter(questionDefinition(sujet), corps, sujet);
        }
        return;
      }

      // « raison : la différence constante… » — un terme suivi de sa définition
      const deuxPoints = ligne.match(/^([^:]{3,48}?)\s*:\s*(.{10,})$/);
      if (deuxPoints) {
        const terme = deuxPoints[1].trim();
        const court = terme.split(" ").length <= 5;
        const sansVerbe = !VERBES_DEFINITION.test(` ${terme} `) && !/\b(donc|ainsi|alors|par)\b/i.test(terme);
        if (court && sansVerbe && /[a-zà-ÿ]{3}/i.test(terme)) {
          ajouter(questionDefinition(terme), deuxPoints[2], terme);
          return;
        }
      }

      // Une ou plusieurs égalités sur la même ligne : « Uo = 3, U1 = 8, U2 = 13 »
      const egalites = repererFormules([ligne]);
      if (egalites.length) {
        egalites.forEach((formule) => {
          const nom = formule.split(" = ")[0];
          const valeur = formule.split(" = ").slice(1).join(" = ");
          // Une valeur seule se demande ; une formule se demande autrement.
          ajouter(/^[-+]?[\d\s,.]+$/.test(valeur)
            ? `Dans l'exemple du cours, que vaut ${nom} ?`
            : `Quelle expression donne ${nom} ?`, formule);
        });
        return;
      }

      // « 1789 : prise de la Bastille »
      const date = ligne.match(/^(1[0-9]{3}|20[0-9]{2})\s*[:–—-]\s*(.{5,})$/);
      if (date) { ajouter(`Que se passe-t-il en ${date[1]} ?`, date[2]); return; }

      // « Un espace à fortes contraintes est une région où… » : le terme se définit
      // dans la phrase elle-même. C'est la carte la plus utile d'un cours.
      phrases(ligne).forEach((phrase) => {
        const defini = phrase.match(
          /^(L'|La |Le |Les |Un |Une |Des )?([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’\- ]{3,50}?)\s(?:est|sont|d[ée]signe|d[ée]signent|correspond à|correspondent à|se caract[ée]rise(?:nt)? par|regroupe(?:nt)?|comprend|comprennent|consiste à)\s(.{15,240})$/);
        if (!defini) return;
        const article = defini[1] || "";
        const terme = defini[2].trim();
        if (terme.split(" ").length > 7) return;
        // L'article du cours est conservé : inventer « le » se trompe une fois sur deux.
        ajouter(questionDefinition(`${article}${terme}`.trim()), phrase, terme);
      });
    });

    return cartes.slice(0, 14);
  }

  /**
   * Repère les égalités, même alignées sur une seule ligne :
   * « Uo = 3, U1 = 8, U2 = 13 » en rend trois.
   */
  const FORMULE = /([A-Za-zÀ-ÿ][\wÀ-ÿ+\-()]{0,12})\s*=\s*([^,;]{1,60}?)(?=$|[,;]|\s+(?:et|puis|donc|avec|or)\s)/g;

  function repererFormules(lignes) {
    const trouvees = [];
    lignes.forEach((ligne) => {
      if (ligne.length > 200) return;
      let coup;
      FORMULE.lastIndex = 0;
      while ((coup = FORMULE.exec(ligne)) !== null) {
        const nom = coup[1].trim();
        const valeur = coup[2].trim()
          .replace(/\s+(et|puis|donc|avec)\s+\S*$/i, "")   // « = Un + 5 et Uo » → « = Un + 5 »
          .replace(/[.,;]$/, "");
        if (nom.length && valeur.length) trouvees.push(`${nom} = ${valeur}`);
        if (trouvees.length > 12) break;
      }
    });
    return trouvees;
  }

  /**
   * Un exemple ne s'arrête pas à sa première ligne : on prend le bloc, de
   * l'énoncé jusqu'au prochain intitulé, pour garder la résolution avec lui.
   */
  function repererExemples(lignes) {
    const blocs = [];
    lignes.forEach((ligne, rang) => {
      if (!INTITULES_EXEMPLE.test(ligne) || blocs.length >= 4) return;
      const morceaux = [ligne];
      for (let i = rang + 1; i < lignes.length; i++) {
        const suivante = lignes[i];
        if (INTITULES.test(suivante) || suivante.length < 4) break;
        morceaux.push(suivante);
        if (morceaux.join(" ").length > 500) break;
      }
      const bloc = morceaux.join(" ").replace(/\s+/g, " ").trim();
      if (bloc.length > 30) blocs.push(bloc.slice(0, 600));
    });
    return blocs;
  }

  /* Ce qui fait une phrase de cours plutôt qu'une phrase de remplissage. */
  const VERBES_COURS = /\b(est|sont|d[ée]signe|s'appelle|appelle|correspond|permet|signifie|d[ée]finit|vaut|s'[ée]crit|se calcule|not[ée]e?)\b/i;
  const LIENS_COURS = /\b(donc|ainsi|c'est-[àa]-dire|autrement dit|si|alors|lorsque|quand|car|parce que|pour tout)\b/i;
  const CONSIGNE = /^(calculer|montrer|d[ée]montrer|justifier|d[ée]terminer|r[ée]soudre|tracer|compl[ée]ter|exercice)/i;

  /** Note une phrase : plus elle explique, plus elle monte dans la fiche. */
  function pertinence(phrase, titre) {
    const mots = phrase.split(" ").length;
    const motsTitre = sansAccents(titre).split(" ").filter((m) => m.length > 4);
    const plat = sansAccents(phrase);

    let note = 0;
    if (VERBES_COURS.test(phrase)) note += 3;                 // elle définit
    if (LIENS_COURS.test(phrase)) note += 2;                  // elle raisonne
    if (motsTitre.some((m) => plat.includes(m))) note += 2;   // elle parle du chapitre
    if (/\d/.test(phrase)) note += 1;                         // une valeur, une date
    if (CONSIGNE.test(phrase)) note -= 5;                     // c'est une consigne d'exercice
    if (INTITULES_EXEMPLE.test(phrase)) note -= 2;            // l'exemple a sa section
    if (mots < 8) note -= 2;
    if (mots > 32) note -= 2;
    return note;
  }

  /* Un titre de partie : « I. Les milieux froids », « 2) Définition », ou une
     ligne courte sans ponctuation finale. C'est ce qui découpe le cours. */
  const TITRE_NUMEROTE = new RegExp(`^(?:${NUMERO})(.{3,70})$`);

  function estTitre(ligne) {
    /* « Définition » seul ouvre une partie ; « Définition : une toundra est
       une plaine gelée… » est du contenu, pas un titre — sans quoi la
       définition remplacerait le vrai titre de la partie. */
    if (INTITULES.test(ligne)) return ligne.length <= 30;
    if (TITRE_NUMEROTE.test(ligne) && !/[.!]$/.test(ligne) && !/[;,]/.test(ligne)) return true;
    /* Sans numéro, il faut que la ligne ressemble vraiment à un titre :
       courte, capitalisée, et sans ponctuation interne — « Les habitants
       doivent s'adapter : maisons isolées, vêtements » est une phrase. */
    return ligne.split(" ").length <= 7 && !/[.!?,;:]/.test(ligne)
      && /^[A-ZÀ-Ý]/.test(ligne) && ligne.length >= 8;
  }

  /** Le titre lisible d'une partie : sans numéro, sans deux-points final. */
  function nettoyerTitre(ligne) {
    return String(ligne || "")
      .replace(new RegExp(`^(?:${NUMERO})`), "")
      .replace(/\s*[:\-–—]\s*$/, "")
      .replace(/^[\s:;,.\-–—]+/, "")
      .trim()
      .slice(0, 70);
  }

  /**
   * À quelle partie appartient chaque ligne. Le tableau renvoyé a la longueur
   * de `lignes` : à chaque rang, le numéro brut de la partie (-1 avant la
   * première). C'est ce qui permet de rattacher une carte à sa notion.
   */
  function partiesDesLignes(lignes, titre) {
    const platTitre = sansAccents(titre);
    const appartenance = [];
    let courante = -1;
    lignes.forEach((ligne, rang) => {
      if (estTitre(ligne) && sansAccents(ligne) !== platTitre) courante++;
      appartenance[rang] = courante;
    });
    return appartenance;
  }

  /** Découpe le document en parties titrées, comme le cours lui-même. */
  function repererSections(lignes, titre) {
    const platTitre = sansAccents(titre);
    const sections = [];
    let courante = null;

    lignes.forEach((ligne) => {
      if (estTitre(ligne)) {
        if (sansAccents(ligne) === platTitre) return;      // le titre du cours n'est pas une partie
        courante = { titre: nettoyerTitre(ligne), lignes: [], brut: sections.length };
        sections.push(courante);
        return;
      }
      if (courante) courante.lignes.push(ligne);
    });

    return sections
      .map((section) => {
        const corps = section.lignes.join(" ").replace(/\s+/g, " ").trim();
        /* On rend les phrases entières, dans l'ordre du cours : c'est
           `structurer()` qui en fait un paragraphe, une fois le lexique
           connu — une définition ne doit pas être dite deux fois. */
        return {
          titre: section.titre,
          phrases: sansRedites(phrases(corps)),
          secours: debutLisible(corps, 300),
          // Chaque notion porte ses propres repères : c'est ce qu'on révise avec elle.
          reperes: sansRedites(repererFormules(section.lignes)).slice(0, 4),
          brut: section.brut,
        };
      })
      .filter((section) => section.titre.length > 2 && (section.phrases.length || section.secours.length > 15))
      .slice(0, 8);
  }

  /**
   * L'intro de la fiche : ce que le chapitre couvre, dit avec ses propres
   * notions. On n'invente rien — on annonce ce qui suit, ce qui manquait
   * pour s'y retrouver d'un coup d'œil. La qualité de lecture s'y ajoute
   * quand la photo était difficile.
   */
  function accroche(sections, confiance) {
    const titres = sections.map((section) => section.titre).filter(Boolean);
    const doute = typeof confiance === "number" && confiance < 70
      ? " Photo difficile à lire : vérifie les termes et les formules."
      : "";
    if (titres.length >= 2) {
      const liste = titres.length > 3
        ? `${titres.slice(0, 3).join(", ")}…`
        : `${titres.slice(0, -1).join(", ")} et ${titres[titres.length - 1]}`;
      return `Ce chapitre couvre ${titres.length} notions : ${liste}.${doute}`;
    }
    if (titres.length === 1) return `Ce chapitre porte sur ${titres[0]}.${doute}`;
    return `Texte lu sur ton document : relis-le avant de réviser.${doute}`;
  }

  /**
   * Le début d'un texte, arrêté à une fin de phrase — jamais au milieu d'un
   * mot. C'est ce qu'on affiche quand aucune phrase nette n'a été trouvée.
   */
  function debutLisible(texte, max) {
    const propre = String(texte || "").replace(/\s+/g, " ").trim();
    if (propre.length <= max) return propre;
    const morceau = propre.slice(0, max);
    const fin = Math.max(morceau.lastIndexOf("."), morceau.lastIndexOf("!"), morceau.lastIndexOf("?"));
    if (fin > 40) return morceau.slice(0, fin + 1).trim();
    const espace = morceau.lastIndexOf(" ");
    return espace > 40 ? `${morceau.slice(0, espace).trim()}…` : morceau.trim();
  }

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

  /* ————— Du markdown à la fiche ————————————————————————————————
     Quand le service a lu la page, on ne devine plus rien : les titres
     sont des titres, les listes des listes. Tout le travail de `structurer()`
     — repérer les parties, trier les phrases — devient inutile ; il reste à
     ranger ce qui est déjà rangé, et à en tirer le lexique et les cartes.
     ———————————————————————————————————————————————————————————— */

  /** Enlève le balisage d'une ligne de markdown, en gardant le texte. */
  function sansBalises(ligne) {
    return String(ligne || "")
      .replace(/^#{1,6}\s*/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+[.)]\s+/, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  const NIVEAU_TITRE = /^(#{1,6})\s+(.+)$/;
  const PUCE = /^\s*(?:[-*+]|\d+[.)])\s+(.+)$/;
  const LIGNE_TABLEAU = /^\s*\|.*\|\s*$/;
  /* « **Densité** : nombre d'habitants… » ou « Densité : nombre… » :
     un terme court suivi de sa définition, c'est une entrée de lexique. */
  const ENTREE_LEXIQUE = /^([^:]{2,48}?)\s*[:\u202f]\s*(.{10,})$/;

  /** Une entrée de lexique, si la ligne en est une. */
  function entreeLexique(ligne, gras) {
    const coup = ligne.match(ENTREE_LEXIQUE);
    if (!coup) return null;
    const terme = termeLexique(coup[1]);
    const definition = enReponse(coup[2]);
    // Un terme en gras est une définition annoncée ; sinon il faut qu'il soit court.
    const credible = gras || (terme.split(" ").length <= 4 && !VERBES_DEFINITION.test(` ${coup[1]} `));
    if (!terme || !credible || TERME_VAGUE.test(terme) || definition.length < 10) return null;
    return { terme, definition };
  }

  function structurerMarkdown(markdown, options = {}) {
    const lignes = String(markdown || "").split(/\r?\n/);

    let titre = "";
    const parties = [];
    let courante = null;
    let niveauTitre = 0;

    lignes.forEach((brute) => {
      const ligne = brute.replace(/\s+$/, "");
      if (!ligne.trim()) return;

      const entete = ligne.match(NIVEAU_TITRE);
      if (entete) {
        const niveau = entete[1].length;
        const texte = sansBalises(entete[2]);
        if (!texte) return;
        // Le premier titre, et lui seul, nomme le document.
        if (!titre && (niveau === 1 || !parties.length)) { titre = texte; niveauTitre = niveau; return; }
        if (niveau <= niveauTitre) { /* un second titre de même niveau ouvre quand même une partie */ }
        courante = { titre: nettoyerTitre(texte), paragraphes: [], puces: [], reperes: [] };
        parties.push(courante);
        return;
      }

      if (!courante) {
        // Du texte avant le premier sous-titre : il ouvre une partie sans nom.
        courante = { titre: titre || "L'essentiel", paragraphes: [], puces: [], reperes: [] };
        parties.push(courante);
      }

      if (LIGNE_TABLEAU.test(ligne)) {
        const cellules = ligne.split("|").map((c) => sansBalises(c)).filter(Boolean);
        /* La ligne de séparation (---|---) n'apprend rien — et elle dit que
           la ligne d'avant était l'en-tête du tableau : on la retire. */
        if (/^[-: ]+$/.test(cellules.join(""))) { courante.reperes.pop(); return; }
        if (cellules.length >= 2) courante.reperes.push(cellules.join(" · "));
        return;
      }

      const puce = ligne.match(PUCE);
      if (puce) {
        courante.puces.push({ texte: sansBalises(puce[1]), gras: /\*\*|__/.test(puce[1]) });
        return;
      }

      courante.paragraphes.push(sansBalises(ligne));
    });

    // Chaque partie devient une notion : paragraphe, points, lexique, repères.
    const sections = parties.map((partie) => {
      const lexique = [];
      const points = [];
      partie.puces.forEach((puce) => {
        const entree = entreeLexique(puce.texte, puce.gras);
        if (entree && lexique.length < 8) lexique.push(entree);
        else if (puce.texte.length > 8) points.push(puce.texte);
      });

      const prose = partie.paragraphes.filter((p) => p.length > 20);
      prose.forEach((ligne) => {
        const entree = entreeLexique(ligne, false);
        if (entree && lexique.length < 8 && !lexique.some((e) => e.terme === entree.terme)) lexique.push(entree);
      });

      const dits = new Set(lexique.map((e) => sansAccents(e.definition)));
      const texte = prose
        .filter((ligne) => !dits.has(sansAccents(ligne)))
        .slice(0, 3)
        .join(" ");

      return {
        titre: partie.titre,
        texte: texte || debutLisible(prose.join(" "), 300),
        points: points.slice(0, 6),
        reperes: sansRedites(partie.reperes.concat(repererFormules(prose))).slice(0, 4),
        lexique,
      };
    }).filter((section) => section.titre && (section.texte.length > 15 || section.points.length || section.lexique.length))
      .slice(0, 10);

    // Les cartes viennent du lexique : une question par terme, comme ailleurs.
    const cartes = [];
    const vues = new Set();
    sections.forEach((section, rang) => {
      section.lexique.forEach((entree) => {
        const recto = questionDefinition(entree.terme);
        if (!recto) return;
        const cle = sansAccents(recto);
        if (vues.has(cle)) return;
        vues.add(cle);
        cartes.push({ recto, verso: entree.definition, partie: rang, terme: entree.terme });
      });
    });

    const plat = sections.map((s) => `${s.titre} ${s.texte} ${s.points.join(" ")}`).join(" ");
    const formules = sansRedites([].concat(...sections.map((s) => s.reperes))).slice(0, 6);

    return {
      titre: titre || (sections[0] && sections[0].titre) || "Document lu",
      matiere: devinerMatiere(`${titre} ${plat}`),
      contenu: {
        lu: true,
        moteur: options.moteur || "service",
        accroche: accroche(sections, 100),
        sections,
        points: sections.map((s) => s.texte).filter(Boolean).slice(0, 6),
        formules,
        exemples: [],
        pieges: [],
        libelleFormules: "Formules et repères",
        texte: String(markdown || "").slice(0, 6000),
      },
      cartes: cartes.slice(0, 18),
      texte: markdown,
    };
  }

  /**
   * La fiche rendue par le service, rangée comme l'app l'attend.
   *
   * Ici on n'interprète rien : les titres, le résumé et les cartes sont
   * déjà écrits. On se contente de vérifier, de borner, et de rattacher
   * chaque carte à sa notion — le travail de deviner, lui, n'a plus lieu
   * d'être. C'est toute la différence avec `structurer()`, qui part d'un
   * texte à plat et doit tout reconstruire.
   */
  function structurerFiche(donnees, options = {}) {
    const brut = donnees && typeof donnees === "object" ? donnees : {};
    const ligne = (valeur, max) => String(valeur == null ? "" : valeur).replace(/\s+/g, " ").trim().slice(0, max);

    const sections = (Array.isArray(brut.notions) ? brut.notions : [])
      .map((notion) => {
        const n = notion && typeof notion === "object" ? notion : {};
        const lexique = (Array.isArray(n.lexique) ? n.lexique : [])
          .map((e) => ({ terme: ligne(e && e.terme, 60), definition: ligne(e && e.definition, 300) }))
          .filter((e) => e.terme && e.definition)
          .slice(0, 8);
        /* Une formule devient un repère portant ses conditions : « Une
           formule sans ses hypothèses est fausse » n'est pas qu'une
           consigne, c'est ce qu'on affiche. */
        const formules = (Array.isArray(n.formules) ? n.formules : [])
          .map((f) => {
            const latex = ligne(f && f.latex, 200);
            const nom = ligne(f && f.nom, 60);
            const conditions = ligne(f && f.conditions, 160);
            if (!latex) return "";
            return `${nom ? nom + " : " : ""}${latex}${conditions ? " — " + conditions : ""}`;
          })
          .filter(Boolean)
          .slice(0, 6);
        return {
          numero: ligne(n.numero, 12),
          titre: ligne(n.titre, 90),
          texte: ligne(n.resume, 600),
          points: (Array.isArray(n.points) ? n.points : []).map((pt) => ligne(pt, 220)).filter(Boolean).slice(0, 6),
          reperes: sansRedites(formules.concat(
            (Array.isArray(n.reperes) ? n.reperes : []).map((r) => ligne(r, 120)).filter(Boolean))).slice(0, 8),
          lexique,
          cartes: (Array.isArray(n.cartes) ? n.cartes : [])
            .map((c) => ({ recto: ligne(c && c.question, 180), verso: ligne(c && c.reponse, 400) }))
            .filter((c) => c.recto && c.verso)
            .slice(0, 5),
        };
      })
      .filter((section) => section.titre && (section.texte.length > 15 || section.points.length || section.lexique.length))
      .slice(0, 10);

    /* Les cartes sont celles du service, rattachées à leur notion. Une
       question posée deux fois ne sert qu'une fois. */
    const cartes = [];
    const vues = new Set();
    sections.forEach((section, rang) => {
      section.cartes.forEach((carte) => {
        const cle = sansAccents(carte.recto);
        if (vues.has(cle)) return;
        vues.add(cle);
        const entree = section.lexique.find((e) => sansAccents(carte.recto).includes(sansAccents(e.terme)));
        cartes.push({ recto: carte.recto, verso: carte.verso, partie: rang, terme: entree ? entree.terme : "" });
      });
      delete section.cartes;                 // la notion ne les porte plus : la fiche les tient
    });

    const plat = sections.map((s) => `${s.titre} ${s.texte} ${s.points.join(" ")}`).join(" ");
    const titre = ligne(brut.titre, 90) || (sections[0] && sections[0].titre) || "Document lu";

    return {
      titre,
      matiere: ligne(brut.matiere, 40) || devinerMatiere(`${titre} ${plat}`),
      contenu: {
        lu: true,
        moteur: options.moteur || "service",
        accroche: accroche(sections, 100),
        sections,
        points: sections.map((s) => s.texte).filter(Boolean).slice(0, 6),
        formules: sansRedites([].concat(...sections.map((s) => s.reperes))).slice(0, 6),
        exemples: [],
        pieges: [],
        libelleFormules: "Formules et repères",
        texte: plat.slice(0, 6000),
      },
      cartes: cartes.slice(0, 18),
      aVerifier: (Array.isArray(brut.a_verifier) ? brut.a_verifier : [])
        .map((v) => ligne(v, 160)).filter(Boolean).slice(0, 6),
      texte: plat,
    };
  }

  function structurer(texte, confiance) {
    const lignes = lignesUtiles(texte);
    const titre = devinerTitre(lignes);

    /* ————— Le chapitre et ses notions ————————————————————————————
       Une fiche n'est pas un bloc : c'est un chapitre découpé en notions,
       et chaque notion porte son lexique, ses repères et ses cartes. On
       révise une notion, pas « la fiche » — c'est ce qui rend le travail
       ciblé plutôt que flou.
       ———————————————————————————————————————————————————————————— */
    const sectionsBrutes = repererSections(lignes, titre);
    const rangDeBrut = new Map();
    sectionsBrutes.forEach((section, rang) => rangDeBrut.set(section.brut, rang));
    const appartenance = partiesDesLignes(lignes, titre);
    const cartes = fabriquerCartes(lignes, titre, (rang) => {
      const brut = appartenance[rang];
      return rangDeBrut.has(brut) ? rangDeBrut.get(brut) : null;
    });

    // Le lexique d'une notion, ce sont les termes que ses cartes définissent.
    const sections = sectionsBrutes.map((section, rang) => {
      const lexique = [];
      const vus = new Set();
      cartes.forEach((carte) => {
        if (carte.partie !== rang || !carte.terme) return;
        const cle = sansAccents(carte.terme);
        if (vus.has(cle)) return;
        vus.add(cle);
        lexique.push({ terme: carte.terme, definition: carte.verso });
      });
      /* Une phrase déjà donnée comme définition dans le lexique ne se répète
         pas dans le paragraphe : l'élève lirait deux fois la même chose. */
      const plats = lexique.map((entree) => sansAccents(entree.definition));
      const restantes = section.phrases.filter((phrase) => {
        const plat = sansAccents(phrase);
        return !plats.some((definition) => plat.includes(definition) || definition.includes(plat));
      });
      const base = restantes.length ? restantes : section.phrases;

      return {
        titre: section.titre,
        texte: base.slice(0, 3).join(" ") || section.secours,
        points: base.slice(3, 7),
        reperes: section.reperes,
        lexique: lexique.slice(0, 8),
      };
    });

    // Quatre phrases claires valent mieux que six pavés : on garde l'ordre du cours.
    const platTitre = sansAccents(titre);
    /* Ce qui entre dans la prose : des phrases, rien d'autre. Un titre, un
       en-tête de page ou un intitulé recollé au texte fabriquerait des
       phrases qui n'existent pas dans le cours. */
    const prose = lignes
      .filter((ligne) => ligne.length >= 25)
      .filter((ligne) => sansAccents(ligne) !== platTitre)
      .filter((ligne) => /[.!?]$/.test(ligne) || ligne.split(" ").length > 8)
      .join(" ");
    const candidates = sansRedites(phrases(prose))
      // une « phrase » qui n'est que le titre recopié n'apprend rien
      .filter((phrase) => sansAccents(phrase).split(platTitre).join("").replace(/\W/g, "").length > 25);
    const notees = candidates
      .map((phrase, rang) => ({ phrase, rang, note: pertinence(phrase, titre) }))
      .sort((a, b) => b.note - a.note || a.rang - b.rang);
    // Une phrase qui n'explique rien n'entre pas, même s'il reste de la place —
    // sauf si la fiche serait vide sans elle.
    const dignes = notees.filter((e) => e.note >= 2);
    const points = (dignes.length >= 3 ? dignes : notees.slice(0, 4))
      .slice(0, 6)
      .sort((a, b) => a.rang - b.rang)
      .map((entree) => entree.phrase);

    const exemples = repererExemples(lignes);

    const formules = sansRedites(repererFormules(lignes)).slice(0, 6);

    return {
      titre: titre || "Document lu sur l'appareil",
      matiere: devinerMatiere(texte),
      contenu: {
        lu: true,
        moteur: "ocr",
        accroche: accroche(sections, confiance),
        sections,
        points: points.length ? points : lignes.filter((l) => l.length > 30).slice(0, 6),
        formules,
        exemples,
        pieges: [],
        libelleFormules: "Formules et repères",
      },
      cartes,
      texte,
    };
  }

  // Exposés pour le banc d'essai (tests/qualite-lecture.js), pas pour l'app.
  return {
    charger, lire, structurer, qualiteTexte, SOURCES,
    lireParService, structurerMarkdown, structurerFiche, serviceConfigure, SERVICE,
    __preparerImage: preparerImage, __texteFiable: texteFiable,
  };
})();
