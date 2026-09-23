/* Lecture RÉELLE : le moteur embarqué (dossier moteur/) lit une page de cours
   fabriquée pour l'occasion, sans compte Claude et sans réseau extérieur.
   Nécessite un serveur local sur le port 8321. Lancer : node tests/lecture-reelle.js */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const LIGNES = [
  "1ere STMG            Chap. 6 - Suites arithmetiques",
  "",
  "Chapitre 6",
  "Suites arithmetiques et geometriques",
  "",
  "I. Suites arithmetiques",
  "",
  "1) Definition",
  "Exemple : Considerons une suite numerique Un ou la",
  "difference entre un terme et son precedent reste",
  "constante et egale a 5.",
  "Si le premier terme est egal a 3, les premiers termes",
  "successifs sont :",
  "U0 = 3,",
  "U1 = 8,",
  "U2 = 13,",
  "Une telle suite est appelee une suite arithmetique de",
  "raison 5 et de premier terme 3.",
  "",
  "Propriete : pour tout entier n, Un = U0 + n x r.",
  "Raison : la difference constante entre deux termes.",
];

let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

(async () => {
  const nav = await chromium.launch();

  // Une « photo » de cours, imprimée par le navigateur lui-même.
  const feuille = await nav.newPage({ viewport: { width: 1200, height: 1500 } });
  await feuille.setContent(`<body style="margin:0;background:#fff">
    <div style="padding:48px 56px;font:34px/1.65 Georgia,'DejaVu Serif',serif;color:#000">
      ${LIGNES.map((l) => `<div>${l || '&nbsp;'}</div>`).join('')}
    </div></body>`);
  await feuille.screenshot({ path: '/tmp/cours-test.png' });
  await feuille.close();

  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(`window.claude = { use: async () => null };`);   // aucun compte Claude
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
  // Rien ne doit sortir de l'origine du site.
  const dehors = [];
  page.on('request', (r) => {
    const url = r.url();
    // les URL blob: sont fabriquées par la page elle-même (aperçus, worker)
    if (!url.startsWith('http://localhost:8321') && !url.startsWith('blob:http://localhost:8321')) dehors.push(url);
  });

  await page.goto('http://localhost:8321/index.html');
  await page.click('text=Lycéen'); await page.waitForTimeout(300);
  await page.click('#ouvrir-creation'); await page.click('[data-creation="scan"]'); await page.waitForTimeout(300);
  await page.setInputFiles('#scan-galerie', '/tmp/cours-test.png'); await page.waitForTimeout(300);

  const debut = Date.now();
  await page.click('#scan-analyser');
  const abouti = await page.waitForFunction(
    () => !document.querySelector('#scan-resultat').hidden,
    null, { timeout: 120000 }).then(() => true).catch(() => false);
  const duree = Math.round((Date.now() - debut) / 1000);

  verifier('la page est lue par le moteur embarqué', abouti, await page.innerText('#scan-message').catch(() => '—'));
  if (!abouti) { await nav.close(); process.exit(1); }
  console.log(`      (${duree} s)`);

  verifier('le titre du chapitre est retenu',
    (await page.inputValue('#scan-sujet')).startsWith('Suites arithmetiques'),
    await page.inputValue('#scan-sujet'));
  verifier('la matière est devinée',
    /Mathématiques/.test(await page.innerText('#scan-fiche-lue')),
    (await page.innerText('#scan-fiche-lue')).split('\n').slice(0, 4).join(' · '));
  verifier('la fiche dit qu\'elle vient de l\'appareil',
    /lue sur ton appareil/.test(await page.innerText('#scan-fiche-lue')), '—');
  verifier('aucune requête ne sort du site', dehors.length === 0, dehors.slice(0, 3).join(' | '));

  await page.click('[data-scan-outil="flashcards"]'); await page.waitForTimeout(500);
  await page.click('#nom-valider'); await page.waitForTimeout(1500);

  const fiches = await page.evaluate(() => JSON.parse(localStorage.getItem('mathematique.fiches') || '[]'));
  const cartes = (fiches[0] && fiches[0].cartes) || [];
  verifier('des cartes sortent du texte lu', cartes.length >= 3, `${cartes.length} carte(s)`);
  verifier('les valeurs de la suite sont reprises',
    cartes.some((c) => /que vaut U/i.test(c.recto)), cartes.map((c) => c.recto).join(' | '));
  verifier('les questions se tiennent seules',
    cartes.every((c) => /\?$/.test(c.recto) && c.recto.split(' ').length >= 3),
    cartes.map((c) => c.recto).join(' | '));
  verifier('la propriété du cours devient une carte',
    cartes.some((c) => /Propriete/i.test(c.recto) || /Raison/i.test(c.recto)),
    cartes.map((c) => c.recto).join(' | '));
  verifier('le paquet se lance', await page.isVisible('#jeu-cartes'), 'jeu absent');
  verifier('aucune erreur console', erreurs.length === 0, erreurs.join(' || '));

  await nav.close();
  if (echecs) { console.log(`\n${echecs} vérification(s) en échec.`); process.exit(1); }
  console.log('\nLecture réelle : tout est conforme.');
})();
