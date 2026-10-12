/* ==========================================================================
   Les comptes : entrer par son adresse, et retrouver ses fiches partout
   --------------------------------------------------------------------------
   Jusqu'ici l'app ne connaissait personne : les fiches vivaient dans le
   navigateur, et un téléphone cassé les emportait. Ce module ajoute un
   compte — identifié par une adresse e-mail, sans mot de passe — et une
   bibliothèque gardée côté serveur, la même sur tous les appareils.

   Trois principes, parce qu'on garde ici le travail scolaire de mineurs :

   1. Aucun mot de passe. L'élève demande un lien, le reçoit, clique : il
      est entré. Un mot de passe de plus, c'est un mot de passe réutilisé
      de plus — et une fuite qui déborde sur sa boîte mail.
   2. Le serveur ne garde jamais un jeton en clair. En base, seulement son
      empreinte : qui lirait la table ne pourrait pas s'en servir.
   3. Rien d'autre que le strict nécessaire : une adresse, des fiches, deux
      dates. Pas de nom, pas de classe, pas de mouchard.

   Aucune dépendance npm : la base se parle en HTTPS (PostgREST, l'interface
   REST de PostgreSQL que Supabase expose), le courriel aussi. Sur une
   fonction serverless, du HTTP vaut mieux qu'un pool de connexions TCP
   rouvert à chaque réveil.

   Variables d'environnement (toutes absentes = comptes éteints, et l'app
   fonctionne comme avant, sur l'appareil seul) :

     BASE_URL          https://xxxx.supabase.co
     BASE_CLE          la clé de service (jamais côté navigateur !)
     SECRET_COMPTES    une phrase au hasard, 32 caractères ou plus
     RESEND_CLE        re_… (si tu as un nom de domaine)
     BREVO_CLE         xkeysib-… (sinon : adresse d'expéditeur vérifiée)
     COURRIEL_EXPEDITEUR   "Mathématique <bonjour@tondomaine.fr>"
     SITE_URL          https://mathematique-mu.vercel.app
   ========================================================================== */

"use strict";

const crypto = require("crypto");

const BASE_URL = (process.env.BASE_URL || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const BASE_CLE = process.env.BASE_CLE || process.env.SUPABASE_SERVICE_KEY || "";
const SECRET = process.env.SECRET_COMPTES || "";
const RESEND_CLE = process.env.RESEND_CLE || "";
const BREVO_CLE = process.env.BREVO_CLE || "";
const EXPEDITEUR = process.env.COURRIEL_EXPEDITEUR || "Mathématique <onboarding@resend.dev>";
const SITE = (process.env.SITE_URL || "").replace(/\/+$/, "");

/* Les adresses des services, surchargeables : les tests les pointent vers
   un faux serveur local, et aucun appel ne sort. */
const RESEND_URL = process.env.RESEND_URL || "https://api.resend.com/emails";
const BREVO_URL = process.env.BREVO_URL || "https://api.brevo.com/v3/smtp/email";

const VIE_DU_LIEN = 20 * 60 * 1000;          // 20 minutes pour cliquer
const VIE_DE_LA_SESSION = 90 * 86400 * 1000; // 90 jours avant de redemander
const TAILLE_MAX = 4 * 1024 * 1024;          // une bibliothèque au-delà : refusée

/** Les comptes ne s'allument que si tout est réglé : à moitié, ils nuisent. */
function configure() {
  return Boolean(BASE_URL && BASE_CLE && SECRET && (RESEND_CLE || BREVO_CLE));
}

/* ————— La base, en HTTPS ———————————————————————————————————————
   PostgREST rend toujours un tableau de lignes. `conditions` s'écrit dans
   son langage : "courriel=eq.a@b.fr", "version=eq.3".
   ———————————————————————————————————————————————————————————— */

async function base(table, { methode = "GET", conditions = "", corps = null, entetes = {} } = {}) {
  const adresse = `${BASE_URL}/rest/v1/${table}${conditions ? `?${conditions}` : ""}`;
  const reponse = await fetch(adresse, {
    method: methode,
    headers: {
      apikey: BASE_CLE,
      Authorization: `Bearer ${BASE_CLE}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...entetes,
    },
    body: corps === null ? undefined : JSON.stringify(corps),
  });
  const texte = await reponse.text();
  if (!reponse.ok) {
    const erreur = new Error(`base ${reponse.status} : ${texte.slice(0, 200)}`);
    erreur.statut = reponse.status;
    throw erreur;
  }
  try { return texte ? JSON.parse(texte) : []; } catch (erreur) { return []; }
}

/* ————— Adresses ————————————————————————————————————————————— */

/** Une adresse plausible, normalisée. Rien de plus : le lien fait le reste. */
function adresseValide(brut) {
  const propre = String(brut || "").trim().toLowerCase();
  if (propre.length < 6 || propre.length > 254) return "";
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(propre)) return "";
  return propre;
}

/* ————— Jetons ——————————————————————————————————————————————— */

const empreinte = (valeur) => crypto.createHash("sha256").update(String(valeur)).digest("hex");

function signer(charge) {
  const corps = Buffer.from(JSON.stringify(charge), "utf8").toString("base64url");
  const sceau = crypto.createHmac("sha256", SECRET).update(corps).digest("base64url");
  return `${corps}.${sceau}`;
}

function verifier(jeton) {
  const morceaux = String(jeton || "").split(".");
  if (morceaux.length !== 2) return null;
  const [corps, sceau] = morceaux;
  const attendu = crypto.createHmac("sha256", SECRET).update(corps).digest("base64url");
  /* Comparaison à temps constant : comparer deux chaînes avec « === » laisse
     fuir, par la durée, le nombre de caractères devinés. */
  const a = Buffer.from(sceau);
  const b = Buffer.from(attendu);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const charge = JSON.parse(Buffer.from(corps, "base64url").toString("utf8"));
    if (!charge || typeof charge !== "object") return null;
    if (!charge.expire || Date.now() > charge.expire) return null;
    return charge;
  } catch (erreur) { return null; }
}

/* ————— Garde-fou contre l'envoi en rafale ——————————————————————
   En mémoire, donc remis à zéro à chaque réveil de la fonction : c'est un
   garde-fou de facturation, pas une sécurité. Le vrai rempart est que le
   lien n'ouvre que la boîte de celui qui l'a demandé.
   ———————————————————————————————————————————————————————————— */

const demandes = new Map();
function tropDeDemandes(cle, plafond, fenetre) {
  const maintenant = Date.now();
  const passees = (demandes.get(cle) || []).filter((date) => maintenant - date < fenetre);
  passees.push(maintenant);
  demandes.set(cle, passees);
  if (demandes.size > 5000) demandes.clear();      // on ne grossit pas sans fin
  return passees.length > plafond;
}

/* ————— Le courriel ——————————————————————————————————————————— */

function messageDuLien(lien) {
  const texte = [
    "Voici ton lien pour entrer sur Mathématique :",
    "",
    lien,
    "",
    "Il est valable 20 minutes et ne sert qu'une fois.",
    "Si tu n'as rien demandé, ignore ce message : personne ne peut entrer sans ce lien.",
  ].join("\n");

  const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;
      font-size:16px;line-height:1.5;color:#11182F;max-width:520px">
    <p>Voici ton lien pour entrer sur&nbsp;Mathématique&nbsp;:</p>
    <p style="margin:28px 0">
      <a href="${lien}" style="background:#1B2A6B;color:#fff;text-decoration:none;
         padding:14px 24px;border-radius:999px;font-weight:700;display:inline-block">
        Ouvrir Mathématique</a></p>
    <p style="color:#5B6170;font-size:14px">Il est valable 20&nbsp;minutes et ne sert qu'une fois.<br>
      Si tu n'as rien demandé, ignore ce message&nbsp;: personne ne peut entrer sans ce lien.</p>
  </div>`;

  return { texte, html };
}

/** Deux services possibles, selon que tu possèdes un nom de domaine ou non. */
async function envoyerCourriel(destinataire, sujet, { texte, html }) {
  if (RESEND_CLE) {
    const reponse = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_CLE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EXPEDITEUR, to: [destinataire], subject: sujet, text: texte, html }),
    });
    if (!reponse.ok) throw new Error(`resend ${reponse.status} : ${(await reponse.text()).slice(0, 200)}`);
    return;
  }

  /* Brevo accepte une simple adresse d'expéditeur vérifiée, sans domaine :
     c'est la porte d'entrée quand on n'a pas encore acheté de nom. */
  const nom = (EXPEDITEUR.match(/^(.*?)\s*</) || [, "Mathématique"])[1];
  const adresse = (EXPEDITEUR.match(/<(.+)>/) || [, EXPEDITEUR])[1];
  const reponse = await fetch(BREVO_URL, {
    method: "POST",
    headers: { "api-key": BREVO_CLE, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: nom, email: adresse },
      to: [{ email: destinataire }],
      subject: sujet, textContent: texte, htmlContent: html,
    }),
  });
  if (!reponse.ok) throw new Error(`brevo ${reponse.status} : ${(await reponse.text()).slice(0, 200)}`);
}

/* ————— Demander un lien ————————————————————————————————————— */

async function demanderLien(corps, venantDe) {
  if (!configure()) return { code: 503, corps: { erreur: "comptes_eteints" } };

  const courriel = adresseValide(corps && corps.courriel);
  if (!courriel) return { code: 400, corps: { erreur: "adresse_invalide" } };

  /* On répond pareil dans tous les cas, y compris quand on n'envoie rien :
     sinon la page devient un outil pour savoir qui a un compte ici. */
  const reponsePolie = { code: 200, corps: { envoye: true } };

  if (tropDeDemandes(`a:${courriel}`, 3, 15 * 60 * 1000)) return reponsePolie;
  if (venantDe && tropDeDemandes(`v:${venantDe}`, 30, 15 * 60 * 1000)) return reponsePolie;

  const jeton = crypto.randomBytes(32).toString("base64url");
  const expire = new Date(Date.now() + VIE_DU_LIEN).toISOString();

  await base("connexions", {
    methode: "POST",
    corps: { empreinte: empreinte(jeton), courriel, expire_le: expire },
  });

  const racine = SITE || "";
  const lien = `${racine}/api/compte-entrer?jeton=${encodeURIComponent(jeton)}`;
  await envoyerCourriel(courriel, "Ton lien pour entrer sur Mathématique", messageDuLien(lien));

  return reponsePolie;
}

/* ————— Entrer avec le lien ————————————————————————————————— */

/** Le compte, créé s'il n'existait pas. */
async function trouverOuCreer(courriel) {
  const connus = await base("comptes", { conditions: `courriel=eq.${encodeURIComponent(courriel)}&select=*` });
  if (connus.length) return connus[0];
  const crees = await base("comptes", { methode: "POST", corps: { courriel, donnees: {} } });
  return crees[0];
}

async function entrer(parametres) {
  if (!configure()) return { code: 503, corps: { erreur: "comptes_eteints" } };

  const jeton = String(parametres.get("jeton") || "");
  if (!jeton) return { code: 400, corps: { erreur: "jeton_absent" } };

  const lignes = await base("connexions", {
    conditions: `empreinte=eq.${empreinte(jeton)}&utilise=is.false&select=*`,
  });
  const ligne = lignes[0];
  if (!ligne) return { code: 401, corps: { erreur: "lien_inconnu" } };
  if (new Date(ligne.expire_le).getTime() < Date.now()) return { code: 401, corps: { erreur: "lien_expire" } };

  /* Un lien ne sert qu'une fois : on le brûle avant d'ouvrir la porte, et
     seul celui qui gagne la course (la condition « utilise=is.false »)
     obtient la session. */
  const brules = await base("connexions", {
    methode: "PATCH",
    conditions: `empreinte=eq.${ligne.empreinte}&utilise=is.false`,
    corps: { utilise: true },
  });
  if (!brules.length) return { code: 401, corps: { erreur: "lien_deja_utilise" } };

  const compte = await trouverOuCreer(ligne.courriel);
  return { code: 200, corps: { session: sessionPour(compte), courriel: compte.courriel } };
}

function sessionPour(compte) {
  return signer({
    compte: compte.id,
    jetons: compte.jetons_version || 1,
    expire: Date.now() + VIE_DE_LA_SESSION,
  });
}

/* ————— Reconnaître le porteur d'une session ————————————————— */

async function compteDeLaRequete(entetes) {
  const brut = String((entetes && entetes.authorization) || "");
  const jeton = brut.startsWith("Bearer ") ? brut.slice(7).trim() : "";
  if (!jeton) return null;
  const charge = verifier(jeton);
  if (!charge || !charge.compte) return null;

  const lignes = await base("comptes", { conditions: `id=eq.${charge.compte}&select=*` });
  const compte = lignes[0];
  if (!compte) return null;
  /* « Déconnecter partout » incrémente ce numéro : les sessions émises
     avant ne valent plus rien, sans table de sessions à tenir. */
  if ((compte.jetons_version || 1) !== charge.jetons) return null;
  return compte;
}

/* ————— La bibliothèque ————————————————————————————————————— */

async function lireBibliotheque(compte) {
  return {
    code: 200,
    corps: {
      courriel: compte.courriel,
      version: compte.version,
      donnees: compte.donnees || {},
      majLe: compte.vu_le,
    },
  };
}

async function ecrireBibliotheque(compte, corps) {
  const donnees = corps && corps.donnees;
  if (!donnees || typeof donnees !== "object" || Array.isArray(donnees)) {
    return { code: 400, corps: { erreur: "donnees_invalides" } };
  }
  const poids = Buffer.byteLength(JSON.stringify(donnees), "utf8");
  if (poids > TAILLE_MAX) return { code: 413, corps: { erreur: "bibliotheque_trop_grosse" } };

  const attendue = Number(corps.version);
  if (!Number.isInteger(attendue) || attendue < 0) {
    return { code: 400, corps: { erreur: "version_absente" } };
  }

  /* Concurrence optimiste : on n'écrit que si la version en base est bien
     celle qu'on a lue. Sinon un autre appareil a écrit entre-temps, et
     c'est à lui de fusionner — pas à nous d'écraser. */
  const ecrites = await base("comptes", {
    methode: "PATCH",
    conditions: `id=eq.${compte.id}&version=eq.${attendue}`,
    corps: { donnees, version: attendue + 1, vu_le: new Date().toISOString() },
  });

  if (!ecrites.length) {
    const lignes = await base("comptes", { conditions: `id=eq.${compte.id}&select=*` });
    const frais = lignes[0];
    return {
      code: 409,
      corps: {
        erreur: "version_depassee",
        version: frais ? frais.version : null,
        donnees: frais ? frais.donnees || {} : {},
      },
    };
  }
  return { code: 200, corps: { version: ecrites[0].version, majLe: ecrites[0].vu_le } };
}

/* ————— Sortir, exporter, effacer ———————————————————————————— */

/** Déconnecte cet appareil et tous les autres : les sessions ne valent plus. */
async function sortirDePartout(compte) {
  await base("comptes", {
    methode: "PATCH",
    conditions: `id=eq.${compte.id}`,
    corps: { jetons_version: (compte.jetons_version || 1) + 1 },
  });
  return { code: 200, corps: { sorti: true } };
}

/** RGPD, portabilité : tout ce qui est gardé, dans un seul fichier. */
function exporter(compte) {
  return {
    code: 200,
    corps: {
      courriel: compte.courriel,
      creeLe: compte.cree_le,
      derniereEcriture: compte.vu_le,
      version: compte.version,
      donnees: compte.donnees || {},
    },
  };
}

/** RGPD, effacement : la ligne part, et rien n'en reste. */
async function effacer(compte) {
  await base("connexions", {
    methode: "DELETE",
    conditions: `courriel=eq.${encodeURIComponent(compte.courriel)}`,
  });
  await base("comptes", { methode: "DELETE", conditions: `id=eq.${compte.id}` });
  return { code: 200, corps: { efface: true } };
}

module.exports = {
  configure, adresseValide, demanderLien, entrer, compteDeLaRequete,
  lireBibliotheque, ecrireBibliotheque, sortirDePartout, exporter, effacer,
  /* exposés pour les tests */
  __signer: signer, __verifier: verifier, __empreinte: empreinte,
};
