/* Le parcours complet dans l'app quand le service de lecture est branché :
   la photo part au serveur, le markdown revient, la fiche garde les titres
   du document — et si le service flanche, l'appareil prend le relais.
   Nécessite un serveur local sur le port 8321. Lancer : node tests/lecture-app-service.js */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http');

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

const MARKDOWN = `# La guerre froide

## 1. Un monde coupé en deux

Après 1947, deux blocs s'opposent sans s'affronter directement.

- **Doctrine Truman** : la politique américaine d'endiguement du communisme, annoncée en 1947.
- **Rideau de fer** : la frontière fermée qui sépare l'Europe de l'Est de l'Europe de l'Ouest.

## 2. Les crises

Le blocus de Berlin, en 1948, est la première épreuve de force.

- **Blocus de Berlin** : la fermeture des accès terrestres à Berlin-Ouest par l'URSS.
`;

let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

/* mode : ok | panne */
let mode = 'ok';
const recu = { lectures: [] };
const faux = http.createServer((requete, reponse) => {
  const entetes = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  };
  if (requete.method === 'OPTIONS') { reponse.writeHead(204, entetes); reponse.end(); return; }
  const morceaux = [];
  requete.on('data', (m) => morceaux.push(m));
  requete.on('end', () => {
    const corps = JSON.parse(Buffer.concat(morceaux).toString('utf8') || '{}');
    recu.lectures.push(corps);
    if (mode === 'panne') { reponse.writeHead(502, entetes); reponse.end(JSON.stringify({ erreur: 'ocr_injoignable' })); return; }
    reponse.writeHead(200, entetes);
    reponse.end(JSON.stringify({ markdown: MARKDOWN, pages: 1, moteur: 'mistral' }));
  });
});

/* Tesseract simulé, pour le repli : il rend un texte à plat. */
const FAUX_TESSERACT = `
window.Tesseract = {
  createWorker: async (langs, oem, opts) => ({
    recognize: async () => ({ data: { text: 'CHAPITRE\\nLa guerre froide oppose deux blocs de 1947 a 1991.\\nDefinition : le rideau de fer separe les deux Europes.', confidence: 82 } }),
    terminate: async () => {},
  }),
};`;

(async () => {
  await new Promise((r) => faux.listen(0, r));
  const api = `http://127.0.0.1:${faux.address().port}`;
  const fs = require('fs');
  fs.writeFileSync('/tmp/page-cours.png', PIXEL);
  const nav = await chromium.launch();

  async function ouvrirScan(ctx) {
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/index.html');
    await page.click('text=Lycéen'); await page.waitForTimeout(400);
    await page.click('#ouvrir-creation');
    await page.click('[data-creation="scan"]'); await page.waitForTimeout(400);
    return page;
  }

  /* — 1. Le service lit, et la fiche garde les titres du document — */
  {
    recu.lectures.length = 0;
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(`window.MATHEMATIQUE_LECTURE = { api: ${JSON.stringify(api)} };
      window.claude = { use: async () => null };${FAUX_TESSERACT}`);
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.goto('http://localhost:8321/index.html');
    await page.click('text=Lycéen'); await page.waitForTimeout(400);
    await page.click('#ouvrir-creation');
    await page.click('[data-creation="scan"]'); await page.waitForTimeout(400);

    verifier('le bandeau annonce le service',
      /service spécialisé/.test(await page.innerText('#scan-moteur')), await page.innerText('#scan-moteur'));

    await page.setInputFiles('#scan-galerie', '/tmp/page-cours.png'); await page.waitForTimeout(300);
    await page.click('#scan-analyser'); await page.waitForTimeout(1800);

    verifier('la photo est bien partie au service', recu.lectures.length === 1,
      JSON.stringify(recu.lectures.length));
    verifier('elle part en data:image, pas en clair',
      (recu.lectures[0].pages || []).every((p) => p.startsWith('data:image/')),
      JSON.stringify((recu.lectures[0].pages || []).map((p) => p.slice(0, 20))));

    const lue = await page.innerText('#scan-fiche-lue');
    verifier('le titre du document est repris', /La guerre froide/.test(lue), lue.split('\n').slice(0, 3).join(' / '));
    verifier('les notions du document sont là',
      /Un monde coupé en deux/.test(lue) && /Les crises/.test(lue), lue.replace(/\n+/g, ' / ').slice(0, 160));
    verifier('des cartes sont tirées du lexique',
      /\d+ cartes/.test(await page.innerText('#outil-cartes-detail')),
      await page.innerText('#outil-cartes-detail'));

    await page.click('[data-scan-outil="flashcards"]'); await page.waitForTimeout(400);
    await page.click('#nom-valider'); await page.waitForTimeout(1200);
    const rangee = await page.evaluate(() => JSON.parse(localStorage.getItem('mathematique.fiches'))[0]);
    verifier('la fiche garde la trace du moteur', rangee.contenu.moteur === 'mistral', rangee.contenu.moteur);
    verifier('les notions sont rangées avec leur lexique',
      rangee.contenu.sections.length === 2
      && rangee.contenu.sections[0].lexique.some((e) => /Truman/.test(e.terme)),
      JSON.stringify(rangee.contenu.sections.map((s) => s.lexique.map((e) => e.terme))));
    verifier('un nom propre garde sa majuscule dans la question',
      rangee.cartes.some((c) => /Doctrine Truman/.test(c.recto)),
      rangee.cartes.map((c) => c.recto).join(' | '));
    verifier('aucune erreur console', erreurs.length === 0, erreurs.join(' || '));
    await ctx.close();
  }

  /* — 2. Le service flanche : l'appareil prend le relais, et on le dit — */
  {
    mode = 'panne';
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(`window.MATHEMATIQUE_LECTURE = { api: ${JSON.stringify(api)} };
      window.claude = { use: async () => null };${FAUX_TESSERACT}`);
    const page = await ouvrirScan(ctx);
    await page.setInputFiles('#scan-galerie', '/tmp/page-cours.png'); await page.waitForTimeout(300);
    await page.click('#scan-analyser'); await page.waitForTimeout(2500);

    const message = await page.innerText('#scan-message');
    verifier('la panne du service est dite', /service de lecture/.test(message), message);
    verifier('et le relais annoncé', /sur ton appareil/.test(message), message);
    verifier('la page est quand même lue',
      await page.isVisible('#scan-fiche-lue'), 'aucune fiche produite');
    const lue = await page.innerText('#scan-fiche-lue');
    verifier('le repli dit qu\'il a lu sur l\'appareil', /appareil/i.test(lue), lue.split('\n')[0]);
    await ctx.close();
    mode = 'ok';
  }

  await nav.close();
  faux.close();
  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nTout est vert.');
  process.exit(echecs ? 1 : 0);
})();
