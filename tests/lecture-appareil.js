/* Vérifie la lecture de secours, sur l'appareil (ocr.js) : sans compte Claude,
   la page charge un moteur OCR, en tire une fiche et des cartes, et le dit.
   Le moteur est simulé (window.Tesseract) : le réseau n'est pas sollicité.
   Nécessite un serveur local sur le port 8321. Lancer : node tests/lecture-appareil.js */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

const COURS = [
  '1ère STMG   Chap. 6 - Suites arithmétiques et géométriques',
  'Chapitre 6',
  'Suites arithmétiques et géométriques',
  'I. Suites arithmétiques',
  '1) Définition',
  'Exemple : Considérons une suite numérique Un où la différence entre un terme et son précédent reste constante et égale à 5.',
  'Si le premier terme est égal à 3, les premiers termes successifs sont :',
  'U0 = 3,',
  'U1 = 8,',
  'U2 = 13,',
  'Une telle suite est appelée une suite arithmétique de raison 5 et de premier terme 3.',
  'Un+1 = Un + 5',
  'Propriété : pour tout entier n, Un = U0 + n x r.',
  'Raison : la différence constante entre deux termes consécutifs.',
].join('\n');

/* mode : ok | vide | panne */
const FAUX = (mode) => `
window.claude = { use: async () => null };          // pas de compte Claude
window.Tesseract = {
  createWorker: async (langs, oem, opts) => {
    if ('${mode}' === 'panne') throw new Error('worker refusé');
    if (opts && opts.logger) { opts.logger({ status: 'loading language traineddata', progress: 0.5 }); }
    return {
      recognize: async () => {
        if (opts && opts.logger) opts.logger({ status: 'recognizing text', progress: 0.5 });
        return { data: { text: '${mode}' === 'vide' ? '   ' : ${JSON.stringify(COURS)} } };
      },
      terminate: async () => {},
    };
  },
};`;

let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

async function attendreMessage(page, delai = 45000) {
  return page.waitForFunction(
    () => { const m = document.querySelector('#scan-message'); return m && !m.hidden && m.textContent; },
    null, { timeout: delai }).then(() => true).catch(() => false);
}

async function ouvrirScan(ctx) {
  const page = await ctx.newPage();
  await page.goto('http://localhost:8321/index.html');
  await page.click('text=Lycéen'); await page.waitForTimeout(400);
  await page.click('#ouvrir-creation');
  await page.click('[data-creation="scan"]'); await page.waitForTimeout(400);
  return page;
}

(async () => {
  fs.writeFileSync('/tmp/page-cours.png', PIXEL);
  const nav = await chromium.launch();

  /* — 1. Sans compte, la page lit quand même — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(FAUX('ok'));
    const page = await ouvrirScan(ctx);
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));

    verifier('le bandeau propose la lecture sur l\'appareil',
      /appareil peut lire la page lui-même/.test(await page.innerText('#scan-moteur')),
      await page.innerText('#scan-moteur'));

    await page.setInputFiles('#scan-galerie', '/tmp/page-cours.png'); await page.waitForTimeout(300);
    verifier('le bouton annonce la lecture locale',
      /Lire ma page sur mon appareil/.test(await page.innerText('#scan-analyser')),
      await page.innerText('#scan-analyser'));
    verifier('le passage manuel reste offert', await page.isVisible('#scan-manuel'), 'bouton absent');

    await page.click('#scan-analyser'); await page.waitForTimeout(1500);

    const lue = await page.innerText('#scan-fiche-lue');
    verifier('la fiche dit qui a lu', /lue sur ton appareil/.test(lue), lue.split('\n')[0]);
    verifier('le titre du chapitre est repéré',
      (await page.inputValue('#scan-sujet')) === 'Suites arithmétiques et géométriques',
      await page.inputValue('#scan-sujet'));
    verifier('des cartes sont tirées du texte',
      /\d+ cartes/.test(await page.innerText('#outil-cartes-detail')),
      await page.innerText('#outil-cartes-detail'));
    await page.evaluate(() => { const d = document.querySelector('#scan-fiche-lue details'); if (d) d.open = true; });
    verifier('le texte lu reste consultable',
      /Suites arithmétiques/.test(await page.innerText('.texte-lu')),
      (await page.innerText('.texte-lu')).slice(0, 60));

    await page.click('[data-scan-outil="flashcards"]'); await page.waitForTimeout(500);
    verifier('la matière devinée est proposée',
      /Maths/.test((await page.$$eval('#nom-matieres .puce--active', (n) => n.map((b) => b.innerText))).join('')),
      (await page.$$eval('#nom-matieres .puce--active', (n) => n.map((b) => b.innerText))).join(' | '));
    await page.click('#nom-valider'); await page.waitForTimeout(1400);
    verifier('le paquet vient du document lu',
      /U0|U1|U2|Propriété|Raison/.test(await page.innerText('#carte-recto')),
      await page.innerText('#carte-recto'));

    const rangee = await page.evaluate(() => JSON.parse(localStorage.getItem('mathematique.fiches') || '[]'));
    verifier('la fiche garde la trace du moteur',
      rangee.length === 1 && rangee[0].contenu && rangee[0].contenu.moteur === 'ocr' && rangee[0].cartes.length >= 1,
      JSON.stringify(rangee).slice(0, 140));

    verifier('aucune erreur console', erreurs.length === 0, erreurs.join(' || '));
    await ctx.close();
  }

  /* — 2. Photo muette : on le dit, on n'invente pas — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(FAUX('vide'));
    const page = await ouvrirScan(ctx);
    await page.setInputFiles('#scan-galerie', '/tmp/page-cours.png'); await page.waitForTimeout(300);
    await page.click('#scan-analyser');
    await attendreMessage(page);
    verifier('une photo muette est annoncée',
      /Presque rien n'a été lu/.test(await page.innerText('#scan-message')), await page.innerText('#scan-message'));
    verifier('le thème est alors demandé à la main', await page.isVisible('#scan-sujet'), 'champ absent');
    verifier('aucune fiche inventée',
      (await page.evaluate(() => localStorage.getItem('mathematique.fiches') || '[]')) === '[]',
      await page.evaluate(() => localStorage.getItem('mathematique.fiches')));
    await ctx.close();
  }

  /* — 3 bis. Moteur muet : on ne tourne pas à l'infini — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(`
      window.claude = { use: async () => null };
      window.Tesseract = { createWorker: () => new Promise(() => {}) };   // ne répond jamais
    `);
    const page = await ouvrirScan(ctx);
    await page.setInputFiles('#scan-galerie', '/tmp/page-cours.png'); await page.waitForTimeout(300);
    // On raccourcit la veille pour ne pas attendre 30 s dans le test.
    await page.evaluate(() => { window.__t0 = Date.now(); });
    await page.click('#scan-analyser');
    const bloque = await attendreMessage(page);
    verifier('un moteur muet finit par rendre la main', bloque,
      bloque ? '' : 'toujours en attente après 45 s');
    if (bloque) {
      verifier('le blocage est expliqué',
        /s'est arrêté en chemin/.test(await page.innerText('#scan-message')),
        await page.innerText('#scan-message'));
    }
    await ctx.close();
  }

  /* — 3. Moteur inaccessible : message franc — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(FAUX('panne'));
    const page = await ouvrirScan(ctx);
    await page.setInputFiles('#scan-galerie', '/tmp/page-cours.png'); await page.waitForTimeout(300);
    await page.click('#scan-analyser');
    await attendreMessage(page);
    verifier('un moteur injoignable est annoncé',
      /moteur de lecture n'a pas pu être chargé/.test(await page.innerText('#scan-message')),
      await page.innerText('#scan-message'));
    await ctx.close();
  }

  await nav.close();
  if (echecs) { console.log(`\n${echecs} vérification(s) en échec.`); process.exit(1); }
  console.log('\nLecture sur l\'appareil : tout est conforme.');
})();
