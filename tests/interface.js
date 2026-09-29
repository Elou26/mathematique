/* Vérifie ce qu'un élève lit et touche : aucune marque dans l'interface,
   un accueil qui dit par quoi commencer, des entraînements qui font vraiment
   ce qu'ils annoncent, et un profil dont le prénom vient de l'élève.
   Nécessite un serveur local sur le port 8321. Lancer : node tests/interface.js */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const hier = new Date(Date.now() - 4 * 86400000).toISOString();
const FICHES = [
  { id: 'f1', matiere: 'histoire', titre: 'Les contraintes naturelles', source: 'scan', banqueId: null,
    contenu: { lu: true, moteur: 'ocr', accroche: 'Texte lu sur ton document.',
      sections: [{ titre: 'Les contraintes', texte: "Une contrainte gêne l'installation des hommes.",
                   points: [], lexique: [{ terme: 'Densité', definition: 'Habitants par km².' }], reperes: [] }],
      points: [], formules: [], exemples: [], pieges: [] },
    cartes: [
      { recto: 'Densité ?', verso: 'Habitants par km².', partie: 0 },
      { recto: 'Toundra ?', verso: 'Plaine gelée.', partie: 0 },
      { recto: 'Pergélisol ?', verso: 'Sol gelé en permanence.', partie: 0 },
      { recto: 'Oasis ?', verso: 'Espace cultivé au milieu du désert.', partie: 0 },
    ],
    maitrise: {}, creee: hier, derniereRevision: hier, palier: 0, progression: 0 },
];

const SEMEE = `
localStorage.setItem('mathematique.niveau', 'lyceen');
localStorage.setItem('mathematique.fiches', ${JSON.stringify(JSON.stringify(FICHES))});
window.claude = { use: async () => null };`;

let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

(async () => {
  const nav = await chromium.launch();

  /* — 1. Aucune marque dans ce que l'élève lit — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(SEMEE);
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/index.html'); await page.waitForTimeout(500);

    const vues = ['accueil', 'cours', 'profil', 'revision', 'scan', 'ia', 'resume', 'quiz', 'flashcards'];
    const fautes = [];
    for (const vue of vues) {
      await page.evaluate((v) => {
        document.querySelectorAll('.vue').forEach((el) => { el.hidden = el.id !== `vue-${v}`; });
      }, vue);
      await page.waitForTimeout(80);
      const texte = await page.innerText('body');
      if (/claude/i.test(texte)) fautes.push(`${vue} : ${texte.match(/.{0,40}claude.{0,40}/i)[0]}`);
    }
    verifier('aucune marque dans les neuf vues', fautes.length === 0, fautes.join(' | '));

    // Les textes cachés comptent aussi : messages d'erreur, étiquettes, consignes.
    const cache = await page.evaluate(() => document.body.innerHTML);
    verifier('aucune marque dans le balisage rendu',
      !/claude/i.test(cache), (cache.match(/.{0,50}claude.{0,50}/i) || [''])[0]);
    await ctx.close();
  }

  /* — 2. L'accueil dit par quoi commencer — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(`localStorage.setItem('mathematique.niveau','lyceen');
      window.claude = { use: async () => null };`);
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/index.html'); await page.waitForTimeout(500);
    const salut = await page.innerText('#bloc-salut');
    verifier('sans fiche, l\'accueil propose d\'en créer une',
      /Créer ma première fiche/.test(salut), salut.replace(/\n+/g, ' / '));
    await page.click('[data-salut="creer"]'); await page.waitForTimeout(400);
    verifier('le bouton mène bien à la photo', await page.isVisible('#vue-scan'), 'vue scan masquée');
    await ctx.close();
  }

  /* — 3. Les entraînements font ce qu'ils annoncent — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(SEMEE);
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.goto('http://localhost:8321/index.html'); await page.waitForTimeout(500);

    const entrainements = await page.innerText('#liste-entrainements');
    verifier('trois séances sont proposées',
      /Express/.test(entrainements) && /Marathon/.test(entrainements) && /Survie/.test(entrainements),
      entrainements.replace(/\n+/g, ' / '));
    verifier('aucun point fictif n\'est promis',
      !/XP/.test(entrainements), entrainements.replace(/\n+/g, ' / '));
    verifier('aucun adversaire n\'est inventé',
      !(await page.isVisible('#bouton-affronter')), 'bouton « affronter un ami » encore là');

    // Express : 4 cartes en stock, donc un paquet de 4 (et non 10 inventées).
    await page.click('#liste-entrainements .ligne'); await page.waitForTimeout(1100);
    verifier('l\'entraînement ouvre un paquet réel',
      /4 cartes restantes/.test(await page.innerText('#cartes-position')),
      await page.innerText('#cartes-position'));

    // Survie : la séance s'arrête à la troisième erreur.
    await page.evaluate(() => {
      document.querySelectorAll('.vue').forEach((el) => { el.hidden = el.id !== 'vue-accueil'; });
    });
    await page.locator('#liste-entrainements .ligne').nth(2).click(); await page.waitForTimeout(1100);
    for (let i = 0; i < 3; i++) {
      await page.click('#carte-flip'); await page.waitForTimeout(200);
      await page.click('[data-verdict="revoir"]'); await page.waitForTimeout(300);
    }
    verifier('la survie s\'arrête à la 3ᵉ erreur', await page.isVisible('#bilan-cartes'), 'la séance continue');
    verifier('le bilan parle d\'enchaînement',
      /cartes enchaînées/.test(await page.innerText('#bilan-cartes')),
      await page.innerText('#bilan-cartes'));
    verifier('aucune erreur console', erreurs.length === 0, erreurs.join(' || '));
    await ctx.close();
  }

  /* — 4. Le prénom vient de l'élève — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(SEMEE);
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/index.html'); await page.waitForTimeout(400);
    await page.click('.barre-bas [data-onglet="profil"]'); await page.waitForTimeout(250);
    verifier('aucun prénom n\'est inventé',
      (await page.inputValue('#profil-prenom')) === '' && (await page.innerText('#profil-initiales')) === '?',
      await page.innerText('.carte-profil'));

    await page.fill('#profil-prenom', 'Sarah'); await page.waitForTimeout(300);
    verifier('les initiales suivent le prénom',
      (await page.innerText('#profil-initiales')) === 'S', await page.innerText('#profil-initiales'));
    await page.click('.barre-bas [data-onglet="accueil"]'); await page.waitForTimeout(250);
    verifier('l\'accueil salue par le prénom',
      /Sarah/.test(await page.innerText('#bloc-salut')), await page.innerText('#bloc-salut'));

    await page.reload(); await page.waitForTimeout(500);
    verifier('le prénom survit au rechargement',
      /Sarah/.test(await page.innerText('#bloc-salut')), await page.innerText('#bloc-salut'));
    await ctx.close();
  }

  await nav.close();
  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nTout est vert.');
  process.exit(echecs ? 1 : 0);
})();
