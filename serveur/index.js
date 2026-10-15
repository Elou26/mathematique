/* ==========================================================================
   Le serveur de paiement — la seule pièce qui connaît la clé secrète Stripe
   --------------------------------------------------------------------------
   Trois routes, et aucune base de données : c'est Stripe qui garde l'état de
   l'abonnement, on ne fait que le lui demander.

     POST /paiement          → crée la session de paiement, renvoie son adresse
     GET  /licence?session=  → au retour de Stripe : l'abonnement est-il actif ?
     GET  /licence?cle=      → plus tard : cet abonnement est-il toujours actif ?
     POST /webhook           → facultatif, pour journaliser les événements
     POST /lecture           → lit les photos d'un cours et en rend la fiche

   La « licence » rendue à l'app est l'identifiant client Stripe (`cus_…`).
   Le connaître ne donne rien d'autre que la réponse « actif » ou « non » :
   aucune donnée personnelle, aucun moyen de paiement ne transite ici.

   Déploiement : voir serveur/LISEZMOI.md
   ========================================================================== */

"use strict";

const Stripe = require("stripe");
const Anthropic = require("@anthropic-ai/sdk");
const COMPTES = require("./comptes.js");

const CLE_SECRETE = process.env.STRIPE_CLE_SECRETE || process.env.STRIPE_SECRET_KEY || "";
/* ————— Les trois offres ————————————————————————————————————————
   Un tarif Stripe par offre. La clé (« essentiel », « regulier »,
   « illimite ») est ce que la page demande ; l'identifiant price_… ne
   sort jamais d'ici. STRIPE_PRIX seule reste acceptée : une mise en ligne
   faite avant les paliers continue de fonctionner, sur l'offre du milieu.
   ———————————————————————————————————————————————————————————— */
const TARIFS = {
  essentiel: process.env.STRIPE_PRIX_ESSENTIEL || "",
  regulier: process.env.STRIPE_PRIX_REGULIER || process.env.STRIPE_PRIX || process.env.STRIPE_PRICE_ID || "",
  intensif: process.env.STRIPE_PRIX_INTENSIF || "",
};

/* ————— Les mêmes offres, payées à l'année ————————————————————
   Un tarif annuel est un tarif Stripe comme un autre : même offre, même
   quota mensuel, une seule facture. Tant qu'il n'est pas renseigné,
   l'année n'est pas proposée — et personne ne tombe sur une erreur.
   ———————————————————————————————————————————————————————————— */
const TARIFS_AN = {
  essentiel: process.env.STRIPE_PRIX_ESSENTIEL_AN || "",
  regulier: process.env.STRIPE_PRIX_REGULIER_AN || "",
  intensif: process.env.STRIPE_PRIX_INTENSIF_AN || "",
};

/* L'inverse, pour retrouver l'offre d'un abonnement existant — quel que
   soit son rythme : c'est la même offre qu'on a vendue. */
const OFFRE_DU_TARIF = Object.keys(TARIFS).reduce((table, cle) => {
  if (TARIFS[cle]) table[TARIFS[cle]] = cle;
  if (TARIFS_AN[cle]) table[TARIFS_AN[cle]] = cle;
  return table;
}, {});
const AU_MOINS_UN_TARIF = Object.keys(TARIFS).some((cle) => TARIFS[cle]);
const SECRET_WEBHOOK = process.env.STRIPE_WEBHOOK_SECRET || "";

/* ————— Mode d'essai ou vrais paiements ? ————————————————————————
   Le préfixe de la clé le dit, et c'est la seule chose qu'on en montre :
   « test », on encaisse des cartes de démonstration ; « reel », de vraies
   cartes. /sante le répète, pour qu'un coup d'œil suffise après un
   changement de variables chez l'hébergeur.
   ———————————————————————————————————————————————————————————— */
const MODE_STRIPE = !CLE_SECRETE ? "" : (/^(sk|rk)_live_/.test(CLE_SECRETE) ? "reel" : "test");

/* ————— Ces tarifs existent-ils de ce côté-ci ? ——————————————————
   Le piège du passage en réel : on remplace sk_test_ par sk_live_ et on
   garde les price_… du mode test. Stripe les refuse — « No such price » —
   et l'élève ne l'apprend qu'au moment de payer, c'est-à-dire trop tard.

   On demande donc à Stripe lesquels de ces tarifs il connaît, une fois
   toutes les dix minutes, et /sante ne propose que ceux-là. Stripe
   injoignable ne vide pas la page de tarif : dans le doute, on garde ce
   qui est posé — c'est le paiement qui dira non, pas une page vide.
   ———————————————————————————————————————————————————————————— */
const DUREE_CACHE_TARIFS = 10 * 60 * 1000;
let tarifsConnus = null;                    // { le, offres, offresAn }

async function offresVendables(table) {
  const posees = Object.keys(table).filter((cle) => table[cle]);
  if (!stripe || !posees.length) return posees;
  if (!stripe.prices || typeof stripe.prices.retrieve !== "function") return posees;

  const vivants = [];
  for (const cle of posees) {
    try {
      const tarif = await stripe.prices.retrieve(table[cle]);
      if (tarif && tarif.active !== false) vivants.push(cle);
    } catch (erreur) {
      // Tarif inconnu ici : pas vendable. Panne de réseau : on ne conclut rien.
      if (!erreur || erreur.type !== "StripeInvalidRequestError") return posees;
    }
  }
  return vivants;
}

/** Les deux listes, gardées dix minutes : /sante est appelée à chaque ouverture. */
async function cequonVend() {
  if (tarifsConnus && Date.now() - tarifsConnus.le < DUREE_CACHE_TARIFS) return tarifsConnus;
  const [mois, an] = await Promise.all([offresVendables(TARIFS), offresVendables(TARIFS_AN)]);
  tarifsConnus = { le: Date.now(), offres: mois, offresAn: an };
  return tarifsConnus;
}

/* ————— Lecture des photos : Claude ————————————————————————————
   La clé ne doit pas plus se trouver dans la page que celle de Stripe :
   la photo monte ici, part chez Claude, et seule la fiche revient.

   Un seul appel fait tout le travail — lire l'écriture, garder les titres
   du document, écrire le résumé et les cartes. Les photos partent
   ensemble dans la même requête : un cours sur deux pages reste un cours.
   ———————————————————————————————————————————————————————————— */
const CLE_CLAUDE = process.env.CLAUDE_CLE || process.env.ANTHROPIC_API_KEY || "";
const MODELE = process.env.CLAUDE_MODELE || "claude-sonnet-5-5";
/* Combien le modèle a le droit de réfléchir : low | medium | high | xhigh | max.
   « medium » suffit à lire un cours ; « high » aide sur un manuscrit ingrat.
   Les paliers n'ont pas la même échelle d'un modèle à l'autre : en changeant
   de modèle, il faut réessayer ce réglage plutôt que le supposer acquis. */
const EFFORT = process.env.CLAUDE_EFFORT || "medium";
const PAGES_MAX = Number(process.env.LECTURE_PAGES_MAX) || 4;
const OCTETS_MAX = Number(process.env.LECTURE_OCTETS_MAX) || 14 * 1024 * 1024;
/* Combien de pages un même appareil peut faire lire par heure. Ce n'est pas
   une sécurité — c'est un garde-fou pour la facture, en mémoire du
   processus, remis à zéro à chaque redéploiement. */
const PAGES_PAR_HEURE = Number(process.env.LECTURE_PAGES_PAR_HEURE) || 40;
/* Les adresses autorisées à appeler ce serveur, séparées par des virgules.
   Vide = tout le monde : pratique pour essayer, à resserrer en production. */
const ORIGINES = (process.env.ORIGINES_AUTORISEES || "").split(",").map((o) => o.trim()).filter(Boolean);

const stripe = CLE_SECRETE ? new Stripe(CLE_SECRETE) : null;
const claude = CLE_CLAUDE ? new Anthropic({ apiKey: CLE_CLAUDE }) : null;

/* ————— Outils ————————————————————————————————————————————————— */

function origineAutorisee(origine) {
  if (!ORIGINES.length) return "*";
  return ORIGINES.includes(origine) ? origine : ORIGINES[0];
}

function enTetes(origine) {
  return {
    "Access-Control-Allow-Origin": origineAutorisee(origine),
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
}

function repondre(reponse, code, corps, origine) {
  reponse.writeHead(code, enTetes(origine));
  reponse.end(JSON.stringify(corps));
}

/** Un abonnement compte comme actif tant qu'il est en cours ou à l'essai. */
const STATUTS_ACTIFS = new Set(["active", "trialing", "past_due"]);

function licenceDe(abonnement, client) {
  if (!abonnement || !STATUTS_ACTIFS.has(abonnement.status)) return { actif: false };
  const fin = abonnement.current_period_end ? abonnement.current_period_end * 1000 : 0;
  /* Quelle offre a-t-il prise ? Le tarif de l'abonnement le dit, donc on
     n'a toujours rien à stocker : Stripe reste la seule source de vérité. */
  const article = ((abonnement.items && abonnement.items.data) || [])[0];
  const tarif = article && article.price && article.price.id;
  /* Le rythme vient de Stripe lui-même : un abonnement annuel donne le
     même quota chaque mois, et l'app a besoin de le savoir pour remettre
     son compteur à zéro douze fois, et non une. */
  const recurrence = article && article.price && article.price.recurring;
  const rythme = recurrence && recurrence.interval === "year" ? "an" : "mois";
  return {
    actif: true,
    cle: typeof client === "string" ? client : (client && client.id) || "",
    offre: (tarif && OFFRE_DU_TARIF[tarif]) || "",
    rythme,
    expire: fin,
    statut: abonnement.status,
  };
}

/* ————— Où l'on revient après Stripe ——————————————————————————
   Deux pièges, et on est tombé dans les deux.

   Le premier : ne garder que l'origine renvoyait l'élève sur la vitrine,
   qui ne sait pas confirmer un paiement — c'est l'app qui le fait. On garde
   donc le chemin demandé (/app.html), sans la requête ni l'ancre.

   Le second : comparer avec startsWith() laissait passer
   « https://brainoko.com.pirate.net/ », qui commence bien par l'origine
   autorisée. On compare les origines, pas les débuts de chaîne.

   Rend "" si rien d'acceptable ne s'en dégage.
   ———————————————————————————————————————————————————————————— */
function adresseDeRetour(voulueBrute) {
  const parDefaut = ORIGINES.length ? `${ORIGINES[0].replace(/\/+$/, "")}/app.html` : "";
  let base = "";
  try {
    const voulue = new URL(String(voulueBrute || ""));
    const permise = !ORIGINES.length || ORIGINES.some((o) => {
      try { return new URL(o).origin === voulue.origin; } catch (erreur) { return false; }
    });
    base = permise ? `${voulue.origin}${voulue.pathname}` : parDefaut;
  } catch (erreur) {
    base = parDefaut;
  }
  return /^https?:\/\//.test(base) ? base : "";
}

/* ————— Les routes ————————————————————————————————————————————— */

/** Crée la session de paiement et renvoie son adresse. */
async function creerPaiement(corps, origine) {
  if (!stripe || !AU_MOINS_UN_TARIF) return { code: 500, corps: { erreur: "serveur_non_configure" } };

  /* L'offre vient de la page, donc on ne lui fait pas confiance : seule une
     clé connue ET dont le tarif est renseigné passe. Sans quoi un visiteur
     pourrait demander une offre qu'on ne vend pas. */
  const demandee = String((corps && corps.offre) || "").slice(0, 40);
  const rythme = (corps && corps.rythme) === "an" ? "an" : "mois";
  const table = rythme === "an" ? TARIFS_AN : TARIFS;
  const prix = table[demandee];
  if (!prix) {
    return {
      code: 400,
      corps: {
        erreur: "offre_inconnue",
        offres: Object.keys(table).filter((c) => table[c]),
      },
    };
  }

  const appareil = String((corps && corps.appareil) || "").slice(0, 64) || undefined;
  const retour = String((corps && corps.retour) || "").slice(0, 500);

  const base = adresseDeRetour(retour);
  if (!base) return { code: 400, corps: { erreur: "retour_invalide" } };

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: prix, quantity: 1 }],
    client_reference_id: appareil,
    allow_promotion_codes: true,
    locale: "fr",
    success_url: `${base}?paiement=ok&session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}?paiement=annule`,
  });

  return { code: 200, corps: { url: session.url } };
}

/* ————— Résilier ——————————————————————————————————————————————
   Un abonnement vendu en ligne doit pouvoir être résilié en ligne, aussi
   simplement qu'il a été pris — c'est la loi, et c'est surtout la moindre
   des choses. Plutôt que d'écrire un écran de résiliation (et la mise à
   jour de carte, et les factures, et les relances), on ouvre le portail
   client de Stripe : il fait tout cela, il est à jour, et aucune donnée
   bancaire ne traverse ce serveur.

   Qui a le droit de l'ouvrir ? Le compte d'abord : c'est lui qui porte la
   licence depuis que l'abonnement suit le compte. À défaut — comptes
   éteints, élève qui a payé sans s'inscrire — la clé `cus_…` fait foi,
   comme pour /licence : elle ouvre déjà l'accès payant, elle ouvre donc
   aussi la porte pour s'en aller.
   ———————————————————————————————————————————————————————————— */
async function clientDeLaDemande(corps, entetes) {
  if (COMPTES.configure()) {
    try {
      const compte = await COMPTES.compteDeLaRequete(entetes);
      if (compte) {
        const vue = await COMPTES.lireBibliotheque(compte);
        const licence = vue && vue.corps && vue.corps.donnees && vue.corps.donnees.licence;
        const cle = (licence && licence.cle) || "";
        if (/^cus_[A-Za-z0-9]+$/.test(cle)) return cle;
      }
    } catch (erreur) { /* base muette : il reste la clé */ }
  }
  const brute = String((corps && corps.cle) || "");
  return /^cus_[A-Za-z0-9]+$/.test(brute) ? brute : "";
}

async function ouvrirPortail(corps, entetes) {
  if (!stripe) return { code: 500, corps: { erreur: "serveur_non_configure" } };
  if (!stripe.billingPortal || !stripe.billingPortal.sessions) {
    return { code: 501, corps: { erreur: "portail_indisponible" } };
  }

  const client = await clientDeLaDemande(corps, entetes);
  if (!client) return { code: 401, corps: { erreur: "licence_inconnue" } };

  const retour = adresseDeRetour(String((corps && corps.retour) || "").slice(0, 500));
  if (!retour) return { code: 400, corps: { erreur: "retour_invalide" } };

  try {
    /* On ramène l'élève sur son profil, et on marque le retour : l'app
       revérifie alors la licence tout de suite, au lieu d'attendre sa
       revérification quotidienne — sans quoi une offre changée au portail
       n'apparaîtrait que le lendemain. La requête est posée ici, pas par la
       page : l'adresse de retour reste entièrement de notre main. */
    const session = await stripe.billingPortal.sessions.create({
      customer: client, return_url: `${retour}?vue=profil&portail=ok`, locale: "fr",
    });
    return { code: 200, corps: { url: session.url } };
  } catch (erreur) {
    /* Le portail se configure une fois dans le tableau de bord. Tant que
       ce n'est pas fait, Stripe refuse — et l'élève doit l'apprendre
       autrement que par une page blanche. */
    if (erreur && erreur.type === "StripeInvalidRequestError") {
      return { code: 409, corps: { erreur: "portail_non_configure" } };
    }
    throw erreur;
  }
}

/** Répond « actif » ou non, à partir d'une session ou d'une clé de licence. */
async function lireLicence(parametres) {
  if (!stripe) return { code: 500, corps: { erreur: "serveur_non_configure" } };

  const session = parametres.get("session");
  const cle = parametres.get("cle");

  try {
    if (session) {
      const complete = await stripe.checkout.sessions.retrieve(session, { expand: ["subscription"] });
      const abonnement = complete && complete.subscription;
      const client = complete && complete.customer;
      if (!abonnement || typeof abonnement === "string") return { code: 200, corps: { actif: false } };
      return { code: 200, corps: licenceDe(abonnement, client) };
    }

    if (cle) {
      if (!/^cus_[A-Za-z0-9]+$/.test(cle)) return { code: 400, corps: { erreur: "cle_invalide" } };
      const abonnements = await stripe.subscriptions.list({ customer: cle, status: "all", limit: 10 });
      const actif = (abonnements.data || []).find((a) => STATUTS_ACTIFS.has(a.status));
      return { code: 200, corps: actif ? licenceDe(actif, cle) : { actif: false } };
    }
  } catch (erreur) {
    // Une session ou un client inconnus ne sont pas une panne : on répond non.
    if (erreur && erreur.type === "StripeInvalidRequestError") return { code: 200, corps: { actif: false } };
    return { code: 502, corps: { erreur: "stripe_injoignable" } };
  }

  return { code: 400, corps: { erreur: "parametre_manquant" } };
}

/* ————— Lire une photo ————————————————————————————————————————— */

/* Un garde-fou en mémoire : {appareil → [horodatages]}. */
const passages = new Map();

function tropDemande(appareil, pages) {
  if (!appareil) return false;
  const maintenant = Date.now();
  const recents = (passages.get(appareil) || []).filter((t) => maintenant - t < 3600000);
  if (recents.length + pages > PAGES_PAR_HEURE) { passages.set(appareil, recents); return true; }
  for (let i = 0; i < pages; i++) recents.push(maintenant);
  passages.set(appareil, recents);
  if (passages.size > 5000) passages.clear();        // on ne garde pas une mémoire qui enfle
  return false;
}

/** Une image envoyée par la page : « data:image/jpeg;base64,… », bornée. */
function imageValide(valeur) {
  return typeof valeur === "string"
    && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(valeur)
    && valeur.length < OCTETS_MAX;
}

/* ————— La consigne ————————————————————————————————————————————
   Elle est rangée par ordre d'importance, parce que c'est dans cet ordre
   qu'un modèle arbitre quand deux règles se gênent. La première est la
   seule qui ne se négocie pas : ne rien inventer. Un élève qui révise une
   fiche inventée révise une erreur, et il n'a aucun moyen de le savoir.
   ———————————————————————————————————————————————————————————— */
const CONSIGNE = `Tu lis la photo du cours d'un élève et tu en fais une fiche de révision.

Les règles, par ordre d'importance :

1. Fidélité absolue. N'invente aucune définition, date, formule ni condition
   absente du document. Un passage que tu ne lis pas devient « [illisible] »
   à sa place, et tu l'ajoutes à « a_verifier ». Dire ce qu'on n'a pas lu est
   une bonne réponse ; combler le trou de mémoire n'en est pas une. Si la page
   entière est illisible, vide, ou n'est pas un cours, mets « illisible » à
   vrai et laisse les notions vides.
2. Garde le plan du professeur, dans son ordre. Chaque section du document
   devient une notion, aucune n'est fusionnée ni déplacée. Si le cours annonce
   « II. Les milieux froids », le titre de la notion est « Les milieux froids »
   et son numéro est « II » : le numéro va dans son champ, pas dans le titre.
3. Écris des phrases entières et courtes. Le résumé d'une notion fait deux à
   quatre phrases complètes, qui se terminent. Une phrase coupée au milieu ne
   veut rien dire : mieux vaut une phrase de moins qu'une phrase tronquée.
   Aucune introduction, aucune conclusion, aucune formule de politesse.
4. Les questions des cartes sonnent comme à l'oral : « Qu'est-ce que le
   pergélisol ? », « Aire entre C_f et C_g sur [a ; b] si f ≤ g ? ». Jamais de
   numéro de partie dans une question — « Explique le 2.1 » ne veut rien dire
   loin du cours. Le verso donne la réponse complète : la formule AVEC ses
   conditions, ou la définition telle que le cours la pose.
5. Le lexique ne retient que les termes que la page définit vraiment. Un mot
   employé sans être défini n'y entre pas.
6. Les repères sont les dates, chiffres et lignes de tableau de la page, un
   par ligne, tels qu'ils y figurent.

Quand le document est scientifique — mathématiques, physique, chimie, SI —
trois règles de plus s'appliquent :

7. Toute expression mathématique s'écrit en LaTeX : $...$ dans une phrase,
   $$...$$ pour une formule isolée. Par exemple
   $\\int_a^b f(x)\\,dx = F(b) - F(a)$, ou $\\mathcal{D}$ pour une lettre
   calligraphique. Cela vaut partout : résumés, points, cartes, lexique.
8. Chaque formule va dans « formules », avec son nom et surtout **ses
   conditions** : « f continue sur [a ; b] », « pour tout x > 0 ». Une formule
   sans ses hypothèses est fausse, et un élève qui la révise ainsi apprend une
   erreur. Si le cours ne donne pas les conditions, laisse le champ vide
   plutôt que d'en inventer.
9. Un tableau ou une figure se reformule en cas distincts : « Si f ≥ 0 : … »,
   « Si f ≤ 0 : … », « Si f change de signe : … ». Pour un graphique, une
   phrase disant ce qu'il illustre.

Une notion par section du document, une à quatre cartes par notion. Écris en
français. Appelle l'outil rendre_fiche avec le résultat.`;

/* Le schéma impose la forme ; « strict » la garantit, donc la page n'a
   jamais à se défendre contre une réponse mal bâtie. */
const texte = { type: "string" };
const listeDeTextes = { type: "array", items: texte };

const OUTIL_FICHE = {
  name: "rendre_fiche",
  description: "Rend la fiche de révision tirée des photos du cours.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      illisible: { type: "boolean" },
      titre: texte,
      matiere: texte,
      notions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            numero: texte,
            titre: texte,
            resume: texte,
            points: listeDeTextes,
            reperes: listeDeTextes,
            /* Une formule sans ses hypothèses est fausse : les conditions
               sont un champ à part pour qu'on ne puisse pas les oublier. */
            formules: {
              type: "array",
              items: {
                type: "object",
                properties: { nom: texte, latex: texte, conditions: texte },
                required: ["nom", "latex", "conditions"],
                additionalProperties: false,
              },
            },
            lexique: {
              type: "array",
              items: {
                type: "object",
                properties: { terme: texte, definition: texte },
                required: ["terme", "definition"],
                additionalProperties: false,
              },
            },
            cartes: {
              type: "array",
              items: {
                type: "object",
                properties: { question: texte, reponse: texte },
                required: ["question", "reponse"],
                additionalProperties: false,
              },
            },
          },
          required: ["numero", "titre", "resume", "points", "reperes", "formules", "lexique", "cartes"],
          additionalProperties: false,
        },
      },
      /* Ce que le modèle n'a pas pu lire. L'élève doit le savoir : une fiche
         muette sur ses trous se révise comme si elle était complète. */
      a_verifier: listeDeTextes,
    },
    required: ["illisible", "titre", "matiere", "notions", "a_verifier"],
    additionalProperties: false,
  },
};

/** « data:image/jpeg;base64,AAA… » → le bloc image attendu par l'API. */
function blocImage(uri) {
  const coupe = uri.indexOf(",");
  const media = uri.slice(5, uri.indexOf(";"));
  return {
    type: "image",
    source: { type: "base64", media_type: media, data: uri.slice(coupe + 1) },
  };
}

/**
 * Toutes les photos partent dans le même message : un cours étalé sur deux
 * pages garde son fil, et une notion commencée en bas d'une page se termine
 * en haut de la suivante.
 */
async function demanderFiche(images) {
  const reponse = await claude.beta.messages.create({
    model: MODELE,
    max_tokens: 16000,
    /* Un classificateur de sécurité peut décliner une page — un cours
       d'histoire sur la guerre, un cours de chimie sur les explosifs. Sans
       repli, l'élève lirait « illisible » sur une page parfaitement nette.
       Avec, la demande repart sur un autre modèle dans le même appel. */
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: CONSIGNE,
    output_config: { effort: EFFORT },
    tools: [OUTIL_FICHE],
    messages: [{
      role: "user",
      content: images.map(blocImage).concat([{
        type: "text",
        text: images.length > 1
          ? `Voici ${images.length} pages du même cours, dans l'ordre. Fais-en une seule fiche.`
          : "Voici une page de cours. Fais-en une fiche.",
      }]),
    }],
  });

  /* Un refus arrive en 200 : sans ce test, on lirait le contenu d'une
     réponse qui n'en a pas. Ici, il signifie que même le modèle de repli
     a décliné. */
  if (reponse.stop_reason === "refusal") throw { genre: "refus" };
  if (reponse.stop_reason === "max_tokens") throw { genre: "tronquee" };

  const appel = reponse.content.find((bloc) => bloc.type === "tool_use");
  if (!appel) throw { genre: "sans_fiche" };
  return appel.input;
}

/** Ce qu'on accepte de rendre à la page : la forme est garantie, le fond non. */
function ficheUtile(brute) {
  const notions = (Array.isArray(brute && brute.notions) ? brute.notions : [])
    .filter((n) => n && String(n.titre || "").trim())
    .slice(0, 10);
  if (brute && brute.illisible) return null;
  const nourrie = notions.some((n) => String(n.resume || "").trim().length > 20
    || (Array.isArray(n.lexique) && n.lexique.length)
    || (Array.isArray(n.points) && n.points.length));
  return nourrie ? Object.assign({}, brute, { notions }) : null;
}

async function lirePhotos(corps) {
  if (!claude) return { code: 503, corps: { erreur: "lecture_non_configuree" } };

  const images = Array.isArray(corps && corps.pages) ? corps.pages : [];
  if (!images.length) return { code: 400, corps: { erreur: "aucune_page" } };
  if (images.length > PAGES_MAX) return { code: 400, corps: { erreur: "trop_de_pages", maximum: PAGES_MAX } };
  if (!images.every(imageValide)) return { code: 400, corps: { erreur: "image_invalide" } };

  const appareil = String((corps && corps.appareil) || "").slice(0, 64);
  if (tropDemande(appareil, images.length)) {
    return { code: 429, corps: { erreur: "trop_de_lectures", parHeure: PAGES_PAR_HEURE } };
  }

  let brute;
  try {
    brute = await demanderFiche(images);
  } catch (erreur) {
    if (erreur && erreur.genre === "refus") return { code: 200, corps: { illisible: true } };
    if (erreur && erreur.genre === "tronquee") return { code: 502, corps: { erreur: "lecture_tronquee" } };
    if (erreur && erreur.genre === "sans_fiche") return { code: 200, corps: { illisible: true } };
    const code = (erreur && erreur.status) || 0;
    if (code === 401 || code === 403) return { code: 502, corps: { erreur: "cle_refusee" } };
    if (code === 429) return { code: 429, corps: { erreur: "ocr_surcharge" } };
    return { code: 502, corps: { erreur: "ocr_injoignable", detail: String((erreur && erreur.message) || "").slice(0, 200) } };
  }

  const fiche = ficheUtile(brute);
  if (!fiche) return { code: 200, corps: { illisible: true } };
  // La photo n'est ni gardée ni journalisée : seule la fiche repart.
  return { code: 200, corps: { fiche, pages: images.length, moteur: "claude" } };
}

/* ————— Serveur ———————————————————————————————————————————————— */

function lireCorps(requete, plafond = 64 * 1024) {
  /* Certains hébergeurs (Vercel, Express…) lisent le flux avant nous et
     posent le résultat dans `requete.body`. Le relire bloquerait pour
     toujours : on se sert de ce qu'ils ont déjà. */
  if (requete.body !== undefined && requete.body !== null) {
    const deja = Buffer.isBuffer(requete.body) ? requete.body
      : typeof requete.body === "string" ? Buffer.from(requete.body, "utf8")
      : Buffer.from(JSON.stringify(requete.body), "utf8");
    return deja.length > plafond
      ? Promise.reject(new Error("corps trop gros"))
      : Promise.resolve(deja);
  }
  return new Promise((resoudre, rejeter) => {
    const morceaux = [];
    let taille = 0;
    requete.on("data", (morceau) => {
      taille += morceau.length;
      if (taille > plafond) { rejeter(new Error("corps trop gros")); requete.destroy(); return; }
      morceaux.push(morceau);
    });
    requete.on("end", () => resoudre(Buffer.concat(morceaux)));
    requete.on("error", rejeter);
  });
}

async function router(requete, reponse) {
  const origine = requete.headers.origin || "";
  const adresse = new URL(requete.url, `http://${requete.headers.host || "localhost"}`);
  /* Chez Vercel, les routes vivent forcément sous /api : on retire ce préfixe
     pour que les chemins ci-dessous s'écrivent pareil partout. */
  const chemin = adresse.pathname.replace(/^\/api(?=\/|$)/, "") || "/";

  if (requete.method === "OPTIONS") { reponse.writeHead(204, enTetes(origine)); reponse.end(); return; }

  if (chemin === "/sante") {
    const vendables = await cequonVend();
    const offres = vendables.offres;
    repondre(reponse, 200, {
      pret: Boolean(stripe && offres.length),
      mode: MODE_STRIPE,
      offres,
      offresAn: vendables.offresAn,
      lecture: Boolean(claude),
      comptes: COMPTES.configure(),
      google: COMPTES.clientGoogle(),      // public : la page en a besoin pour le bouton
    }, origine);
    return;
  }

  if (chemin === "/paiement" && requete.method === "POST") {
    let corps = {};
    try { corps = JSON.parse((await lireCorps(requete)).toString("utf8") || "{}"); }
    catch (erreur) { repondre(reponse, 400, { erreur: "json_invalide" }, origine); return; }
    try {
      const resultat = await creerPaiement(corps, origine);
      repondre(reponse, resultat.code, resultat.corps, origine);
    } catch (erreur) {
      repondre(reponse, 502, { erreur: "stripe_injoignable" }, origine);
    }
    return;
  }

  if (chemin === "/portail" && requete.method === "POST") {
    let corps = {};
    try { corps = JSON.parse((await lireCorps(requete)).toString("utf8") || "{}"); }
    catch (erreur) { repondre(reponse, 400, { erreur: "json_invalide" }, origine); return; }
    try {
      const resultat = await ouvrirPortail(corps, requete.headers);
      repondre(reponse, resultat.code, resultat.corps, origine);
    } catch (erreur) {
      repondre(reponse, 502, { erreur: "stripe_injoignable" }, origine);
    }
    return;
  }

  if (chemin === "/lecture" && requete.method === "POST") {
    let corps = {};
    try { corps = JSON.parse((await lireCorps(requete, OCTETS_MAX)).toString("utf8") || "{}"); }
    catch (erreur) { repondre(reponse, 413, { erreur: "corps_trop_gros" }, origine); return; }
    const resultat = await lirePhotos(corps);
    repondre(reponse, resultat.code, resultat.corps, origine);
    return;
  }

  if (chemin === "/licence" && requete.method === "GET") {
    const resultat = await lireLicence(adresse.searchParams);
    repondre(reponse, resultat.code, resultat.corps, origine);
    return;
  }

  /* Facultatif : Stripe prévient des changements d'abonnement. On n'en a pas
     besoin pour fonctionner — l'app revérifie chaque jour — mais c'est le
     bon endroit pour journaliser ou prévenir l'élève. */
  if (chemin === "/webhook" && requete.method === "POST") {
    const brut = await lireCorps(requete);
    if (!SECRET_WEBHOOK || !stripe) { repondre(reponse, 200, { recu: true }, origine); return; }
    try {
      const evenement = stripe.webhooks.constructEvent(brut, requete.headers["stripe-signature"], SECRET_WEBHOOK);
      console.log(`[stripe] ${evenement.type}`);
      repondre(reponse, 200, { recu: true }, origine);
    } catch (erreur) {
      repondre(reponse, 400, { erreur: "signature_invalide" }, origine);
    }
    return;
  }

  /* ————— Les comptes ————————————————————————————————————————————
     Un compte sert à retrouver ses fiches ailleurs que sur le téléphone
     où elles sont nées. Toutes ces routes répondent « comptes_eteints »
     tant que la base et l'envoi de courriel ne sont pas réglés : mieux
     vaut une app qui marche comme avant qu'un compte à moitié branché.
     ———————————————————————————————————————————————————————————— */

  if (chemin === "/compte-demander" && requete.method === "POST") {
    let corps = {};
    try { corps = JSON.parse((await lireCorps(requete)).toString("utf8") || "{}"); }
    catch (erreur) { repondre(reponse, 400, { erreur: "json_invalide" }, origine); return; }
    try {
      /* Qui demande, et non d'où : sur Vercel toutes les requêtes de l'app
         portent la même origine, et un seul seau pour tout le monde punit
         les élèves sans gêner personne d'autre. */
      const venantDe = String(requete.headers["x-forwarded-for"] || "").split(",")[0].trim()
        || (requete.socket && requete.socket.remoteAddress) || origine;
      const resultat = await COMPTES.demanderLien(corps, venantDe);
      repondre(reponse, resultat.code, resultat.corps, origine);
    } catch (erreur) {
      console.error("[compte-demander]", erreur.message);
      repondre(reponse, 502, { erreur: "envoi_impossible" }, origine);
    }
    return;
  }

  if (chemin === "/compte-google" && requete.method === "POST") {
    let corps = {};
    try { corps = JSON.parse((await lireCorps(requete)).toString("utf8") || "{}"); }
    catch (erreur) { repondre(reponse, 400, { erreur: "json_invalide" }, origine); return; }
    try {
      const resultat = await COMPTES.entrerAvecGoogle(corps);
      repondre(reponse, resultat.code, resultat.corps, origine);
    } catch (erreur) {
      console.error("[compte-google]", erreur.message);
      repondre(reponse, 502, { erreur: "base_injoignable" }, origine);
    }
    return;
  }

  /* Le lien du courriel ouvre l'app, pas un bout de JSON : on redirige,
     la session dans l'adresse, que compte.js ramasse puis efface. */
  if (chemin === "/compte-entrer" && requete.method === "GET") {
    const racine = (process.env.SITE_URL || "").replace(/\/+$/, "");
    let suite;
    try {
      const resultat = await COMPTES.entrer(adresse.searchParams);
      suite = resultat.code === 200
        ? `${racine}/app.html?acces=${encodeURIComponent(resultat.corps.session)}`
        : `${racine}/app.html?entree=${encodeURIComponent(resultat.corps.erreur)}`;
    } catch (erreur) {
      console.error("[compte-entrer]", erreur.message);
      suite = `${racine}/app.html?entree=panne`;
    }
    reponse.writeHead(302, { Location: suite || "/app.html", "Cache-Control": "no-store" });
    reponse.end();
    return;
  }

  /* Tout ce qui suit demande une session valide. On la vérifie une fois. */
  if (chemin === "/compte-moi" || chemin === "/compte-sortir" || chemin === "/compte-export"
      || chemin === "/compte-effacer" || chemin === "/bibliotheque") {
    if (!COMPTES.configure()) { repondre(reponse, 503, { erreur: "comptes_eteints" }, origine); return; }

    let compte = null;
    try { compte = await COMPTES.compteDeLaRequete(requete.headers); }
    catch (erreur) {
      console.error("[compte]", erreur.message);
      repondre(reponse, 502, { erreur: "base_injoignable" }, origine); return;
    }
    if (!compte) { repondre(reponse, 401, { erreur: "session_invalide" }, origine); return; }

    try {
      if (chemin === "/compte-moi" && requete.method === "GET") {
        repondre(reponse, 200, { courriel: compte.courriel, creeLe: compte.cree_le, version: compte.version }, origine);
        return;
      }
      if (chemin === "/compte-sortir" && requete.method === "POST") {
        const resultat = await COMPTES.sortirDePartout(compte);
        repondre(reponse, resultat.code, resultat.corps, origine); return;
      }
      if (chemin === "/compte-export" && requete.method === "GET") {
        const resultat = COMPTES.exporter(compte);
        repondre(reponse, resultat.code, resultat.corps, origine); return;
      }
      if (chemin === "/compte-effacer" && requete.method === "DELETE") {
        const resultat = await COMPTES.effacer(compte);
        repondre(reponse, resultat.code, resultat.corps, origine); return;
      }
      if (chemin === "/bibliotheque" && requete.method === "GET") {
        const resultat = await COMPTES.lireBibliotheque(compte);
        repondre(reponse, resultat.code, resultat.corps, origine); return;
      }
      if (chemin === "/bibliotheque" && requete.method === "PUT") {
        let corps = {};
        try { corps = JSON.parse((await lireCorps(requete, 5 * 1024 * 1024)).toString("utf8") || "{}"); }
        catch (erreur) { repondre(reponse, 413, { erreur: "corps_trop_gros" }, origine); return; }
        const resultat = await COMPTES.ecrireBibliotheque(compte, corps);
        repondre(reponse, resultat.code, resultat.corps, origine); return;
      }
    } catch (erreur) {
      console.error("[compte]", erreur.message);
      repondre(reponse, 502, { erreur: "base_injoignable" }, origine);
      return;
    }
    repondre(reponse, 405, { erreur: "methode_inattendue" }, origine);
    return;
  }

  repondre(reponse, 404, { erreur: "route_inconnue" }, origine);
}

/* Lancé directement : petit serveur HTTP. Importé (Vercel, Netlify…) :
   c'est `router` qui sert de gestionnaire. */
if (require.main === module) {
  const http = require("http");
  const port = Number(process.env.PORT) || 8787;
  http.createServer((requete, reponse) => {
    router(requete, reponse).catch(() => {
      try { repondre(reponse, 500, { erreur: "panne" }, requete.headers.origin || ""); } catch (e) { /* déjà fermé */ }
    });
  }).listen(port, () => {
    console.log(`Paiement en écoute sur http://localhost:${port}`);
    if (!stripe) console.log("⚠ STRIPE_CLE_SECRETE manquante : les routes répondront « non configuré ».");
    else console.log(MODE_STRIPE === "reel"
      ? "Stripe en mode RÉEL : les cartes sont débitées pour de bon."
      : "Stripe en mode test : seules les cartes de démonstration passent.");
    if (!AU_MOINS_UN_TARIF) console.log("⚠ Aucun STRIPE_PRIX_* : impossible de créer une session.");
    if (!Object.keys(TARIFS_AN).some((cle) => TARIFS_AN[cle])) {
      console.log("ℹ Aucun STRIPE_PRIX_*_AN : l'année n'est pas proposée.");
    }
    else {
      const absentes = Object.keys(TARIFS).filter((cle) => !TARIFS[cle]);
      if (absentes.length) console.log(`⚠ Offres sans tarif, donc invendables : ${absentes.join(", ")}`);
    }
    if (!claude) console.log("⚠ CLAUDE_CLE manquante : /lecture répondra « non configuré ».");
  });
}

module.exports = router;
module.exports.router = router;
module.exports.__creerPaiement = creerPaiement;
module.exports.__ouvrirPortail = ouvrirPortail;
module.exports.__lirePhotos = lirePhotos;
module.exports.__lireLicence = lireLicence;
