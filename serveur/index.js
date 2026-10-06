/* ==========================================================================
   Le serveur de paiement — la seule pièce qui connaît la clé secrète Stripe
   --------------------------------------------------------------------------
   Trois routes, et aucune base de données : c'est Stripe qui garde l'état de
   l'abonnement, on ne fait que le lui demander.

     POST /paiement          → crée la session de paiement, renvoie son adresse
     GET  /licence?session=  → au retour de Stripe : l'abonnement est-il actif ?
     GET  /licence?cle=      → plus tard : cet abonnement est-il toujours actif ?
     POST /webhook           → facultatif, pour journaliser les événements

   La « licence » rendue à l'app est l'identifiant client Stripe (`cus_…`).
   Le connaître ne donne rien d'autre que la réponse « actif » ou « non » :
   aucune donnée personnelle, aucun moyen de paiement ne transite ici.

   Déploiement : voir serveur/LISEZMOI.md
   ========================================================================== */

"use strict";

const Stripe = require("stripe");

const CLE_SECRETE = process.env.STRIPE_CLE_SECRETE || process.env.STRIPE_SECRET_KEY || "";
const PRIX = process.env.STRIPE_PRIX || process.env.STRIPE_PRICE_ID || "";
const SECRET_WEBHOOK = process.env.STRIPE_WEBHOOK_SECRET || "";

/* ————— Lecture des photos : Mistral Document AI ————————————————
   La clé ne doit pas plus se trouver dans la page que celle de Stripe :
   la photo monte ici, repart chez Mistral, et seul le texte revient.
   ———————————————————————————————————————————————————————————— */
const CLE_MISTRAL = process.env.MISTRAL_CLE || process.env.MISTRAL_API_KEY || "";
const MODELE_OCR = process.env.MISTRAL_MODELE || "mistral-ocr-latest";
const OCR_URL = process.env.MISTRAL_URL || "https://api.mistral.ai/v1/ocr";
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

/**
 * Mistral attend un « document ». Pour une photo, c'est `image_url` ; pour
 * un PDF, `document_url`. Si la forme devait changer, c'est le seul endroit
 * à corriger — et l'erreur de l'API est renvoyée telle quelle pour qu'on la
 * voie tout de suite (voir docs.mistral.ai/api/endpoint/ocr).
 */
function corpsOcr(image, type) {
  return {
    model: MODELE_OCR,
    document: type === "document_url"
      ? { type: "document_url", document_url: image }
      : { type: "image_url", image_url: image },
    include_image_base64: false,
  };
}

async function demanderOcr(image) {
  const essais = ["image_url", "document_url"];
  let derniere = null;
  for (const type of essais) {
    const reponse = await fetch(OCR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${CLE_MISTRAL}` },
      body: JSON.stringify(corpsOcr(image, type)),
    });
    if (reponse.ok) return await reponse.json();
    derniere = { code: reponse.status, texte: (await reponse.text()).slice(0, 400) };
    // Une 400 peut vouloir dire « mauvaise forme de document » : on tente l'autre.
    if (reponse.status !== 400) break;
  }
  throw derniere || { code: 502, texte: "pas de réponse" };
}

/** Le markdown de toutes les pages, mis bout à bout. */
function markdownDe(resultat) {
  const pages = (resultat && Array.isArray(resultat.pages)) ? resultat.pages : [];
  return pages
    .map((page) => String((page && (page.markdown || page.text)) || "").trim())
    .filter(Boolean)
    .join("\n\n");
}

async function lirePhotos(corps) {
  if (!CLE_MISTRAL) return { code: 503, corps: { erreur: "lecture_non_configuree" } };

  const images = Array.isArray(corps && corps.pages) ? corps.pages : [];
  if (!images.length) return { code: 400, corps: { erreur: "aucune_page" } };
  if (images.length > PAGES_MAX) return { code: 400, corps: { erreur: "trop_de_pages", maximum: PAGES_MAX } };
  if (!images.every(imageValide)) return { code: 400, corps: { erreur: "image_invalide" } };

  const appareil = String((corps && corps.appareil) || "").slice(0, 64);
  if (tropDemande(appareil, images.length)) {
    return { code: 429, corps: { erreur: "trop_de_lectures", parHeure: PAGES_PAR_HEURE } };
  }

  const morceaux = [];
  for (const image of images) {
    try {
      const resultat = await demanderOcr(image);
      const markdown = markdownDe(resultat);
      if (markdown) morceaux.push(markdown);
    } catch (erreur) {
      const code = erreur && erreur.code;
      if (code === 401 || code === 403) return { code: 502, corps: { erreur: "cle_refusee" } };
      if (code === 429) return { code: 429, corps: { erreur: "ocr_surcharge" } };
      return { code: 502, corps: { erreur: "ocr_injoignable", detail: (erreur && erreur.texte) || "" } };
    }
  }

  const markdown = morceaux.join("\n\n").trim();
  if (markdown.replace(/\s/g, "").length < 20) return { code: 200, corps: { illisible: true } };
  // La photo n'est ni gardée ni journalisée : seul le texte repart.
  return { code: 200, corps: { markdown, pages: morceaux.length, moteur: "mistral" } };
}

/* ————— Serveur ———————————————————————————————————————————————— */

function lireCorps(requete, plafond = 64 * 1024) {
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

  if (requete.method === "OPTIONS") { reponse.writeHead(204, enTetes(origine)); reponse.end(); return; }

  if (adresse.pathname === "/sante") {
    repondre(reponse, 200, { pret: Boolean(stripe && PRIX), lecture: Boolean(CLE_MISTRAL) }, origine);
    return;
  }

  if (adresse.pathname === "/paiement" && requete.method === "POST") {
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

  if (adresse.pathname === "/lecture" && requete.method === "POST") {
    let corps = {};
    try { corps = JSON.parse((await lireCorps(requete, OCTETS_MAX)).toString("utf8") || "{}"); }
    catch (erreur) { repondre(reponse, 413, { erreur: "corps_trop_gros" }, origine); return; }
    const resultat = await lirePhotos(corps);
    repondre(reponse, resultat.code, resultat.corps, origine);
    return;
  }

  if (adresse.pathname === "/licence" && requete.method === "GET") {
    const resultat = await lireLicence(adresse.searchParams);
    repondre(reponse, resultat.code, resultat.corps, origine);
    return;
  }

  /* Facultatif : Stripe prévient des changements d'abonnement. On n'en a pas
     besoin pour fonctionner — l'app revérifie chaque jour — mais c'est le
     bon endroit pour journaliser ou prévenir l'élève. */
  if (adresse.pathname === "/webhook" && requete.method === "POST") {
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
    if (!CLE_MISTRAL) console.log("⚠ MISTRAL_CLE manquante : /lecture répondra « non configuré ».");
  });
}

module.exports = router;
module.exports.router = router;
module.exports.__creerPaiement = creerPaiement;
module.exports.__lirePhotos = lirePhotos;
module.exports.__lireLicence = lireLicence;
