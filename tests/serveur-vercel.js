/* Éprouve ce qui change quand le serveur tourne en fonction (Vercel) :
   - les routes vivent sous /api, le routeur doit retirer le préfixe ;
   - l'hébergeur a déjà lu le corps et l'a posé dans requete.body, donc
     relire le flux bloquerait pour toujours.
   Aucun réseau, aucune clé. Lancer : node tests/serveur-vercel.js */
const path = require('path');
const fs = require('fs');

let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

/* Faux Claude : la fiche revient sans qu'aucun appel ne sorte. */
const FICHE = {
  illisible: false,
  titre: 'Les séismes',
  matiere: 'Physique-Chimie',
  notions: [{
    titre: '1. Une plaque qui glisse',
    resume: 'La secousse part du foyer, en profondeur, et se propage jusqu\'à la surface.',
    points: [],
    reperes: [],
    lexique: [{ terme: 'Foyer', definition: 'Le point de départ de la rupture, en profondeur.' }],
    cartes: [{ question: 'Qu\'est-ce que le foyer d\'un séisme ?',
               reponse: 'Le point de départ de la rupture, en profondeur.' }],
  }],
};

process.env.CLAUDE_CLE = 'cle_de_test';
process.env.STRIPE_CLE_SECRETE = '';
process.env.ORIGINES_AUTORISEES = '';

const Module = require('module');
const chargerOriginal = Module._load;
Module._load = function (demande) {
  if (demande === 'stripe') return function Stripe() { return {}; };
  if (demande === '@anthropic-ai/sdk') {
    return function Anthropic() {
      const messages = { create: async () => ({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', name: 'rendre_fiche', input: FICHE }],
      }) };
      return { messages, beta: { messages } };
    };
  }
  return chargerOriginal.apply(this, arguments);
};

const routeur = require(path.join(__dirname, '..', 'serveur', 'index.js'));

const PHOTO = `data:image/jpeg;base64,${Buffer.from('x'.repeat(400)).toString('base64')}`;

/* Une requête à la manière de Vercel : le corps est DÉJÀ un objet, et le flux
   est épuisé — aucun évènement « data » n'arrivera jamais. */
function requeteVercel(url, methode, corps) {
  const fausse = {
    url, method: methode, headers: { host: 'mon-site.vercel.app', 'content-type': 'application/json' },
    on() { /* le flux est fini : personne ne nous rappellera */ },
    destroy() {},
  };
  if (corps !== undefined) fausse.body = corps;
  return fausse;
}

function reponseFactice() {
  const vue = { code: 0, corps: null, enTetes: null };
  return {
    vue,
    writeHead(code, enTetes) { vue.code = code; vue.enTetes = enTetes; },
    end(texte) { try { vue.corps = JSON.parse(texte); } catch (e) { vue.corps = texte; } },
  };
}

/* Un appel qui n'aboutit pas doit échouer franchement, pas rester pendu :
   sans garde-fou, lireCorps() attendrait un flux qui ne viendra jamais. */
function appeler(url, methode, corps) {
  const reponse = reponseFactice();
  return Promise.race([
    routeur(requeteVercel(url, methode, corps), reponse).then(() => reponse.vue),
    new Promise((_, rejeter) => setTimeout(() => rejeter(new Error('resté pendu')), 2000)),
  ]);
}

/* ————— Le paquet que Vercel installera ————————————————————————
   Vercel n'installe que le package.json de la racine. Si une dépendance
   n'y figure que dans serveur/, la fonction se charge en local — où
   serveur/node_modules existe — et plante en ligne. C'est arrivé.
   ———————————————————————————————————————————————————————————— */
{
  const lire = (chemin) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', chemin), 'utf8'));
  const racine = lire('package.json').dependencies || {};
  const serveur = lire('serveur/package.json').dependencies || {};
  const manquantes = Object.keys(serveur).filter((nom) => racine[nom] !== serveur[nom]);
  verifier('la racine déclare tout ce dont le serveur a besoin, à la même version',
    manquantes.length === 0,
    manquantes.map((n) => `${n} : racine ${racine[n] || 'absente'} ≠ serveur ${serveur[n]}`).join(' | '));

  const relais = fs.readFileSync(path.join(__dirname, '..', 'api', '_relais.js'), 'utf8');
  verifier('le relais demande les dépendances dans son try, pas au-dessus',
    relais.indexOf('try {') < relais.indexOf('require("@anthropic-ai/sdk")'),
    'un require hors du try replanterait à l\'endroit qu\'il doit rendre lisible');
}

(async () => {
  /* — 1. Le préfixe /api est retiré — */
  const sante = await appeler('/api/sante', 'GET');
  verifier('/api/sante répond comme /sante',
    sante.code === 200 && sante.corps.lecture === true, JSON.stringify(sante.corps));

  const inconnue = await appeler('/api/nawak', 'GET');
  verifier('une route inconnue reste inconnue',
    inconnue.code === 404, JSON.stringify(inconnue.corps));

  /* — 2. Un corps déjà lu est utilisé tel quel, sans attendre le flux — */
  const lue = await appeler('/api/lecture', 'POST', { pages: [PHOTO], appareil: 'vercel-1' });
  verifier('une photo passe avec un corps déjà lu',
    lue.code === 200 && lue.corps.fiche && lue.corps.fiche.titre === 'Les séismes',
    JSON.stringify(lue.corps).slice(0, 120));

  /* — 3. Le plafond s'applique aussi à un corps déjà lu — */
  const enorme = await appeler('/api/lecture', 'POST', { pages: [PHOTO], gros: 'o'.repeat(20 * 1024 * 1024) });
  verifier('un corps déjà lu trop gros est refusé, pas envoyé au modèle',
    enorme.code === 413, JSON.stringify(enorme.corps).slice(0, 80));

  /* — 4. Le chemin sans préfixe marche toujours (Render, local) — */
  const direct = await appeler('/sante', 'GET');
  verifier('/sante marche encore sans préfixe',
    direct.code === 200 && direct.corps.lecture === true, JSON.stringify(direct.corps));

  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nTout est vert.');
  process.exit(echecs ? 1 : 0);
})().catch((erreur) => {
  console.log(`[ÉCHEC] le routeur n'a pas répondu : ${erreur.message}`);
  process.exit(1);
});
