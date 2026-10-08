/* Éprouve les bulles d'activité. L'essentiel n'est pas qu'elles s'animent,
   c'est qu'elles ne disent QUE des choses vraies : le module reçoit des
   faits déjà établis et ne sait rien inventer. Un bandeau de fausse
   activité serait, lui, une pratique commerciale trompeuse.
   Lancer : node tests/bulles.js (serveur local sur 8321) */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

const ilYA = (n) => new Date(Date.now() - n * 86400000).toISOString();
const fiche = (n, extra) => Object.assign({
  id: `f${n}`, matiere: 'histoire', titre: `Chapitre ${n}`, source: 'scan', banqueId: null,
  contenu: null, cartes: null, creee: ilYA(1), derniereRevision: ilYA(9), palier: 0, progression: 72,
}, extra || {});

function semence(fiches, journal, record) {
  return `localStorage.setItem('mathematique.niveau','lyceen');
    localStorage.setItem('mathematique.fiches', ${JSON.stringify(JSON.stringify(fiches))});
    localStorage.setItem('mathematique.journal', ${JSON.stringify(JSON.stringify(journal || {}))});
    localStorage.setItem('mathematique.record', ${JSON.stringify(String(record || 0))});`;
}

(async () => {
  const nav = await chromium.launch();

  /* — 1. Un élève actif : les faits sont ceux de ses données — */
  {
    const journal = {};
    for (let i = 0; i < 4; i++) journal[ilYA(i).slice(0, 10)] = 9;
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(semence([fiche(1), fiche(2), fiche(3)], journal, 14));
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
    await page.goto('http://localhost:8321/index.html', { waitUntil: 'load' });
    await page.waitForTimeout(600);

    const faits = await page.evaluate(() => BULLES.__faits());
    const textes = faits.map((f) => f.texte);

    verifier('les faits viennent des données de l\'élève',
      textes.some((t) => /3 fiches créées cette semaine/.test(t))
      && textes.some((t) => /4 jours de révision d'affilée/.test(t))
      && textes.some((t) => /Ton record : 14 cartes/.test(t)),
      textes.join(' | '));
    verifier('la matière citée l\'est avec son vrai pourcentage',
      textes.some((t) => /Histoire-Géo : 72 % de tes notions sues/.test(t)), textes.join(' | '));
    verifier('aucun fait ne parle de quelqu\'un d\'autre que l\'élève',
      !textes.some((t) => /abonn|rejoint|vient de|inscrit|\bo\d+\b/i.test(t)), textes.join(' | '));

    /* La preuve par le code : privé de faits, le module n'a rien à dire.
       Il ne sait pas en produire, seulement en mettre en scène. */
    const muet = await page.evaluate(() => {
      BULLES.demarrer(() => []);
      return BULLES.__prochainFait();
    });
    verifier('privé de faits, le module n\'en fabrique aucun', muet === null, JSON.stringify(muet));

    await page.evaluate(() => BULLES.__montrer({ icone: '✦', texte: 'Essai de bulle' }));
    await page.waitForTimeout(400);
    verifier('une bulle s\'affiche et porte son texte',
      (await page.locator('.bulle').count()) === 1
      && /Essai de bulle/.test(await page.innerText('.bulle')),
      await page.locator('.bulle').count());
    verifier('elle ne vole pas le clic de ce qu\'il y a dessous',
      (await page.evaluate(() => getComputedStyle(document.querySelector('.bulles')).pointerEvents)) === 'none',
      await page.evaluate(() => getComputedStyle(document.querySelector('.bulles')).pointerEvents));
    verifier('elle s\'efface toute seule',
      await page.locator('.bulle').count() === 1
      && await page.waitForFunction(() => document.querySelectorAll('.bulle').length === 0,
          null, { timeout: 9000 }).then(() => true).catch(() => false),
      'la bulle est restée à l\'écran');
    verifier('aucune erreur console', erreurs.length === 0, erreurs.join(' || '));
    await ctx.close();
  }

  /* — 2. Une app neuve n'a rien à raconter, et se tait — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(semence([], {}, 0));
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/index.html', { waitUntil: 'load' });
    await page.waitForTimeout(600);
    const faits = await page.evaluate(() => BULLES.__faits());
    verifier('sans activité, aucun fait n\'est inventé', faits.length === 0, JSON.stringify(faits));
    await page.waitForTimeout(1200);
    verifier('et aucune bulle n\'apparaît', (await page.locator('.bulle').count()) === 0,
      await page.locator('.bulle').count());
    await ctx.close();
  }

  /* — 3. Pendant une révision, on ne coupe pas la concentration — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(semence([fiche(1), fiche(2)], { [ilYA(0).slice(0, 10)]: 9 }, 14));
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/index.html', { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const silence = await page.evaluate(() => {
      document.getElementById('vue-flashcards').hidden = false;
      return typeof BULLES !== 'undefined';
    });
    verifier('le module est chargé', silence, 'BULLES absent');
    await page.evaluate(() => { window.__avant = document.querySelectorAll('.bulle').length; });
    await page.waitForTimeout(1500);
    verifier('aucune bulle ne s\'ouvre pendant les flashcards',
      (await page.locator('.bulle').count()) === 0, await page.locator('.bulle').count());
    await ctx.close();
  }

  await nav.close();
  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nTout est vert.');
  process.exit(echecs ? 1 : 0);
})();
