/* Éprouve la lecture payante de bout en bout, sans réseau ni clé :
   - le serveur (serveur/index.js) avec un faux Mistral à la place de fetch ;
   - la mise en fiche du markdown (OCR.structurerMarkdown), qui doit garder
     les titres du document au lieu de les deviner.
   Aucun navigateur. Lancer : node tests/lecture-service.js */
const http = require('http');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

const MARKDOWN = `# Les contraintes naturelles

## 1. Qu'est-ce qu'une contrainte naturelle ?

Une contrainte naturelle est un élément du milieu qui gêne l'installation des hommes.

- **Densité** : le nombre d'habitants rapporté à la superficie du territoire.
- Seuls 10 % des terres émergées concentrent l'essentiel de la population.

| Milieu | Densité |
| --- | --- |
| Toundra | 1 hab./km² |

## 2. Les milieux froids

Le pergélisol empêche toute construction durable.

- **Pergélisol** : un sol gelé en permanence.
`;

/* ————— Faux Mistral : on note ce qu'on lui envoie ————————————————— */
const recu = { appels: [] };
let modeMistral = 'ok';

global.fetch = async (url, options) => {
  const corps = JSON.parse(options.body);
  recu.appels.push({ url, autorisation: options.headers.Authorization, corps });
  if (modeMistral === 'cle') return { ok: false, status: 401, text: async () => 'unauthorized' };
  if (modeMistral === 'quota') return { ok: false, status: 429, text: async () => 'rate limited' };
  if (modeMistral === 'vide') return { ok: true, json: async () => ({ pages: [{ markdown: '   ' }] }) };
  // Première forme refusée : le serveur doit retenter avec l'autre.
  if (modeMistral === 'forme' && corps.document.type === 'image_url') {
    return { ok: false, status: 400, text: async () => 'unsupported document type' };
  }
  return { ok: true, json: async () => ({ pages: [{ markdown: MARKDOWN }] }) };
};

process.env.MISTRAL_CLE = 'cle_de_test';
process.env.STRIPE_CLE_SECRETE = '';
process.env.ORIGINES_AUTORISEES = 'http://localhost:8321';

// Le module charge `stripe` : on le neutralise, ce test ne parle pas de paiement.
const Module = require('module');
const chargerOriginal = Module._load;
Module._load = function (demande) {
  if (demande === 'stripe') return function Stripe() { return {}; };
  return chargerOriginal.apply(this, arguments);
};

const routeur = require(path.join(__dirname, '..', 'serveur', 'index.js'));
const serveur = http.createServer((requete, reponse) => { routeur(requete, reponse); });

const PHOTO = `data:image/jpeg;base64,${Buffer.from('x'.repeat(400)).toString('base64')}`;

function appeler(chemin, corps) {
  return new Promise((resoudre, rejeter) => {
    const requete = http.request(
      { host: '127.0.0.1', port: serveur.address().port, path: chemin, method: corps ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8321' } },
      (reponse) => {
        const morceaux = [];
        reponse.on('data', (m) => morceaux.push(m));
        reponse.on('end', () => {
          const texte = Buffer.concat(morceaux).toString('utf8');
          let lu = null;
          try { lu = JSON.parse(texte); } catch (e) { lu = texte; }
          resoudre({ code: reponse.statusCode, corps: lu });
        });
      });
    requete.on('error', rejeter);
    if (corps) requete.write(JSON.stringify(corps));
    requete.end();
  });
}

serveur.listen(0, async () => {
  /* — 1. Une photo lue — */
  const lue = await appeler('/lecture', { pages: [PHOTO], appareil: 'a1' });
  verifier('la photo revient en markdown',
    lue.code === 200 && /^# Les contraintes naturelles/.test(lue.corps.markdown || ''),
    JSON.stringify(lue.corps).slice(0, 120));
  verifier('le moteur est annoncé', lue.corps.moteur === 'mistral', lue.corps.moteur);

  const appel = recu.appels[recu.appels.length - 1];
  verifier('la clé part dans l\'en-tête, jamais dans la page',
    appel.autorisation === 'Bearer cle_de_test', appel.autorisation);
  verifier('le modèle demandé est celui d\'OCR',
    appel.corps.model === 'mistral-ocr-latest', appel.corps.model);
  verifier('la photo est envoyée comme image',
    appel.corps.document.type === 'image_url' && appel.corps.document.image_url.startsWith('data:image/'),
    JSON.stringify(appel.corps.document).slice(0, 80));

  /* — 2. Si la forme est refusée, le serveur en essaie une autre — */
  modeMistral = 'forme';
  recu.appels.length = 0;
  const repli = await appeler('/lecture', { pages: [PHOTO], appareil: 'a2' });
  verifier('une forme refusée est retentée autrement',
    repli.code === 200 && recu.appels.length === 2
    && recu.appels[1].corps.document.type === 'document_url',
    recu.appels.map((a) => a.corps.document.type).join(' → '));

  /* — 3. Les refus sont dits, jamais inventés — */
  modeMistral = 'cle';
  const cle = await appeler('/lecture', { pages: [PHOTO], appareil: 'a3' });
  verifier('une clé refusée est signalée',
    cle.code === 502 && cle.corps.erreur === 'cle_refusee', JSON.stringify(cle.corps));

  modeMistral = 'quota';
  const quota = await appeler('/lecture', { pages: [PHOTO], appareil: 'a4' });
  verifier('une surcharge est signalée',
    quota.code === 429 && quota.corps.erreur === 'ocr_surcharge', JSON.stringify(quota.corps));

  modeMistral = 'vide';
  const vide = await appeler('/lecture', { pages: [PHOTO], appareil: 'a5' });
  verifier('une page muette est annoncée illisible',
    vide.code === 200 && vide.corps.illisible === true, JSON.stringify(vide.corps));

  modeMistral = 'ok';

  /* — 4. Ce qu'on refuse d'envoyer — */
  const sansPage = await appeler('/lecture', { pages: [] });
  verifier('sans page, rien n\'est envoyé', sansPage.code === 400, JSON.stringify(sansPage.corps));

  const pasUneImage = await appeler('/lecture', { pages: ['pas-une-image'] });
  verifier('une donnée qui n\'est pas une image est refusée',
    pasUneImage.code === 400 && pasUneImage.corps.erreur === 'image_invalide',
    JSON.stringify(pasUneImage.corps));

  const trop = await appeler('/lecture', { pages: [PHOTO, PHOTO, PHOTO, PHOTO, PHOTO] });
  verifier('au-delà de quatre pages, on refuse',
    trop.code === 400 && trop.corps.erreur === 'trop_de_pages', JSON.stringify(trop.corps));

  /* — 5. Le garde-fou de facture — */
  let derniere = null;
  for (let i = 0; i < 45; i++) derniere = await appeler('/lecture', { pages: [PHOTO], appareil: 'glouton' });
  verifier('un appareil trop gourmand est freiné',
    derniere.code === 429 && derniere.corps.erreur === 'trop_de_lectures',
    JSON.stringify(derniere.corps));
  const autre = await appeler('/lecture', { pages: [PHOTO], appareil: 'sage' });
  verifier('mais les autres passent toujours', autre.code === 200, JSON.stringify(autre.corps).slice(0, 60));

  /* — 6. La santé dit si la lecture est prête — */
  const sante = await appeler('/sante');
  verifier('la santé annonce la lecture', sante.corps.lecture === true, JSON.stringify(sante.corps));

  /* — 7. Le markdown devient une fiche qui garde les titres du document — */
  const OCR = vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'ocr.js'), 'utf8') + '\n;OCR',
    vm.createContext({ console }));
  const f = OCR.structurerMarkdown(MARKDOWN, { moteur: 'mistral' });

  verifier('le titre du document est repris tel quel',
    f.titre === 'Les contraintes naturelles', f.titre);
  verifier('les notions sont celles du document',
    f.contenu.sections.length === 2
    && /Qu'est-ce qu'une contrainte naturelle/.test(f.contenu.sections[0].titre)
    && f.contenu.sections[1].titre === 'Les milieux froids',
    f.contenu.sections.map((s) => s.titre).join(' | '));
  verifier('le numéro de partie ne reste pas dans le titre',
    !/^\d/.test(f.contenu.sections[0].titre), f.contenu.sections[0].titre);
  verifier('les termes en gras forment le lexique',
    f.contenu.sections[0].lexique.some((e) => e.terme === 'Densité')
    && f.contenu.sections[1].lexique.some((e) => e.terme === 'Pergélisol'),
    JSON.stringify(f.contenu.sections.map((s) => s.lexique.map((e) => e.terme))));
  verifier('une puce ordinaire reste un point, pas une définition',
    f.contenu.sections[0].points.some((p) => /10 %/.test(p)),
    JSON.stringify(f.contenu.sections[0].points));
  verifier('le tableau devient un repère, sans sa ligne d\'en-tête',
    f.contenu.sections[0].reperes.some((r) => /Toundra · 1 hab/.test(r))
    && !f.contenu.sections[0].reperes.some((r) => /^Milieu · Densité$/.test(r)),
    JSON.stringify(f.contenu.sections[0].reperes));
  verifier('les cartes viennent du lexique, rattachées à leur notion',
    f.cartes.length >= 2 && f.cartes.every((c) => /\?$/.test(c.recto) && typeof c.partie === 'number'),
    f.cartes.map((c) => `[${c.partie}] ${c.recto}`).join(' | '));
  verifier('aucune définition n\'est répétée dans le paragraphe',
    !/le nombre d'habitants rapporté/i.test(f.contenu.sections[0].texte),
    f.contenu.sections[0].texte);

  serveur.close();
  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nTout est vert.');
  process.exit(echecs ? 1 : 0);
});
