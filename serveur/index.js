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

const CLE_SECRETE = process.env.STRIPE_CLE_SECRETE || process.env.STRIPE_SECRET_KEY || "";
const PRIX = process.env.STRIPE_PRIX || process.env.STRIPE_PRICE_ID || "";
const SECRET_WEBHOOK = process.env.STRIPE_WEBHOOK_SECRET || "";

/* ————— Lecture des photos : Claude ————————————————————————————
   La clé ne doit pas plus se trouver dans la page que celle de Stripe :
   la photo monte ici, part chez Claude, et seule la fiche revient.

   Un seul appel fait tout le travail — lire l'écriture, garder les titres
   du document, écrire le résumé et les cartes. Les photos partent
   ensemble dans la même requête : un cours sur deux pages reste un cours.
   ———————————————————————————————————————————————————————————— */
const CLE_CLAUDE = process.env.CLAUDE_CLE || process.env.ANTHROPIC_API_KEY || "";
const MODELE = process.env.CLAUDE_MODELE || "claude-opus-5-5";
/* Combien Claude a le droit de réfléchir : low | medium | high | xhigh | max.
   « medium » suffit à lire un cours ; « high » aide sur un manuscrit ingrat. */
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
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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
  return {
    actif: true,
    cle: typeof client === "string" ? client : (client && client.id) || "",
    expire: fin,
    statut: abonnement.status,
  };
}

/* ————— Les routes ————————————————————————————————————————————— */

/** Crée la session de paiement et renvoie son adresse. */
async function creerPaiement(corps, origine) {
  if (!stripe || !PRIX) return { code: 500, corps: { erreur: "serveur_non_configure" } };

  const appareil = String((corps && corps.appareil) || "").slice(0, 64) || undefined;
  const retour = String((corps && corps.retour) || "").slice(0, 500);
  // On n'accepte de revenir que sur une adresse déclarée : sinon, n'importe
  // quel site pourrait se faire passer pour l'app.
  const base = ORIGINES.length
    ? (ORIGINES.find((o) => retour.startsWith(o)) || ORIGINES[0])
    : retour;
  if (!base || !/^https?:\/\//.test(base)) return { code: 400, corps: { erreur: "retour_invalide" } };

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: PRIX, quantity: 1 }],
    client_reference_id: appareil,
    allow_promotion_codes: true,
    locale: "fr",
    success_url: `${base}?paiement=ok&session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}?paiement=annule`,
  });

  return { code: 200, corps: { url: session.url } };
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
  const reponse = await claude.messages.create({
    model: MODELE,
    max_tokens: 16000,
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

  /* Un refus de sécurité arrive en 200 : sans ce test, on lirait le contenu
     d'une réponse qui n'en a pas. */
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
    repondre(reponse, 200, { pret: Boolean(stripe && PRIX), lecture: Boolean(claude) }, origine);
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
    if (!PRIX) console.log("⚠ STRIPE_PRIX manquante : impossible de créer une session.");
    if (!claude) console.log("⚠ CLAUDE_CLE manquante : /lecture répondra « non configuré ».");
  });
}

module.exports = router;
module.exports.router = router;
module.exports.__creerPaiement = creerPaiement;
module.exports.__lirePhotos = lirePhotos;
module.exports.__lireLicence = lireLicence;
