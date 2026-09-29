/* Vérifie le parcours du chapitre : une fiche découpée en notions, chacune
   avec sa maîtrise, son lexique, ses cartes et son quiz ; une séance sur une
   notion note cette notion et fait avancer le chapitre.
   Nécessite un serveur local sur le port 8321. Lancer : node tests/parcours.js */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const FICHE = {
  id: 'fparc', matiere: 'histoire', titre: 'Les contraintes naturelles', source: 'scan', banqueId: null,
  contenu: {
    lu: true, moteur: 'ocr',
    accroche: "Texte lu sur ton document, sans IA : relis-le avant de réviser.",
    objectifs: ["Définir une contrainte naturelle", "Expliquer comment les sociétés s'y adaptent"],
    sections: [
      { titre: 'Les contraintes naturelles',
        texte: "Une contrainte naturelle gêne l'installation des hommes.",
        points: ['Les milieux froids restent peu peuplés.'],
        lexique: [{ terme: 'Contrainte naturelle', definition: "Un élément du milieu qui gêne l'installation." },
                  { terme: 'Densité', definition: "Le nombre d'habitants rapporté à la superficie." }],
        reperes: ['Densité = habitants / km²'] },
      { titre: 'Les milieux froids',
        texte: 'Le pergélisol est un sol gelé en permanence.',
        points: [],
        lexique: [{ terme: 'Toundra', definition: 'Une plaine gelée où ne poussent que mousses et lichens.' },
                  { terme: 'Pergélisol', definition: 'Un sol gelé en permanence.' }],
        reperes: [] },
      { titre: "S'adapter aux contraintes",
        texte: 'Les sociétés transforment le milieu pour y vivre.',
        points: ['Les Pays-Bas ont gagné des terres sur la mer.'], lexique: [], reperes: [] },
    ],
    points: [], formules: [], exemples: [], pieges: [], libelleFormules: 'Formules et repères',
  },
  cartes: [
    { recto: "Qu'est-ce qu'une contrainte naturelle ?", verso: "Un élément du milieu qui gêne l'installation.", partie: 0, terme: 'Contrainte naturelle' },
    { recto: 'Que signifie « densité » dans ce cours ?', verso: "Le nombre d'habitants rapporté à la superficie.", partie: 0, terme: 'Densité' },
    { recto: "Qu'est-ce qu'une toundra ?", verso: 'Une plaine gelée où ne poussent que mousses et lichens.', partie: 1, terme: 'Toundra' },
    { recto: "Qu'est-ce que le pergélisol ?", verso: 'Un sol gelé en permanence.', partie: 1, terme: 'Pergélisol' },
  ],
  maitrise: { '0': 80 },
  creee: new Date().toISOString(), derniereRevision: new Date().toISOString(),
  palier: 1, progression: 27,
};

const SEMEE = `
localStorage.setItem('mathematique.niveau', 'lyceen');
localStorage.setItem('mathematique.fiches', ${JSON.stringify(JSON.stringify([FICHE]))});
window.claude = { use: async () => null };`;

let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

async function ouvrirFiche(page) {
  await page.click('.barre-bas [data-onglet="cours"]'); await page.waitForTimeout(250);
  if (!(await page.isVisible('[data-fiche="ouvrir"]'))) {
    await page.click('.dossier-tete:has-text("Histoire")'); await page.waitForTimeout(250);
  }
  await page.click('[data-fiche="ouvrir"]'); await page.waitForTimeout(400);
}

(async () => {
  const nav = await chromium.launch();

  /* — 1. Le chapitre s'affiche comme un parcours — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(SEMEE);
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.goto('http://localhost:8321/index.html'); await page.waitForTimeout(400);

    await page.click('.barre-bas [data-onglet="cours"]'); await page.waitForTimeout(250);
    await page.click('.dossier-tete:has-text("Histoire")'); await page.waitForTimeout(250);
    verifier('la liste annonce la notion à reprendre',
      /À reprendre : Les milieux froids/.test(await page.innerText('.carte-reprise')),
      await page.innerText('.carte-reprise'));

    await page.click('[data-fiche="ouvrir"]'); await page.waitForTimeout(400);
    verifier('l\'en-tête compte les notions',
      /3 notions/.test(await page.innerText('.page-fiche-meta')),
      await page.innerText('.page-fiche-meta'));
    verifier('le parcours liste les notions et leur maîtrise',
      (await page.$$eval('.page-fiche-sommaire li', (n) => n.length)) === 3
      && /80 %/.test(await page.innerText('.page-fiche-sommaire')),
      await page.innerText('.page-fiche-sommaire'));
    verifier('les objectifs sont affichés',
      /Définir une contrainte naturelle/.test(await page.innerText('.page-fiche-objectifs')),
      await page.innerText('.page-fiche-objectifs'));
    verifier('chaque notion a son bloc',
      (await page.$$eval('.notion', (n) => n.length)) === 3,
      await page.$$eval('.notion', (n) => n.length));
    verifier('le lexique de la notion est affiché',
      /Pergélisol/.test(await page.innerText('#partie-2 .lexique')),
      await page.innerText('#partie-2 .lexique'));
    verifier('les repères restent avec leur notion',
      /Densité = habitants/.test(await page.innerText('#partie-1 .notion-reperes')),
      await page.innerText('#partie-1 .notion-reperes'));
    verifier('une notion non testée le dit',
      /Pas encore testée/.test(await page.innerText('#partie-2 .notion-etat')),
      await page.innerText('#partie-2 .notion-etat'));
    verifier('le lexique du chapitre rassemble les termes',
      /4 termes/.test(await page.innerText('#page-fiche details')),
      await page.innerText('#page-fiche details'));
    verifier('aucune erreur console', erreurs.length === 0, erreurs.join(' || '));
    await ctx.close();
  }

  /* — 2. Réviser une notion ne sort que ses cartes, et la note — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(SEMEE);
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/index.html'); await page.waitForTimeout(400);
    await ouvrirFiche(page);

    await page.click('#partie-2 [data-notion="cartes"]'); await page.waitForTimeout(1100);
    verifier('les cartes sont celles de la notion',
      /2 cartes restantes/.test(await page.innerText('#cartes-position')),
      await page.innerText('#cartes-position'));
    const recto = await page.innerText('#carte-recto');
    verifier('la carte vient bien de cette notion',
      /toundra|pergélisol/i.test(recto), recto);

    for (let i = 0; i < 2; i++) {
      await page.click('#carte-flip'); await page.waitForTimeout(250);
      await page.click('[data-verdict="su"]'); await page.waitForTimeout(350);
    }
    verifier('le bilan du paquet apparaît', await page.isVisible('#bilan-cartes'), 'bilan absent');

    const rangee = await page.evaluate(() => JSON.parse(localStorage.getItem('mathematique.fiches'))[0]);
    verifier('la notion révisée est notée', rangee.maitrise['1'] === 100, JSON.stringify(rangee.maitrise));
    verifier('la progression du chapitre est la moyenne des notions',
      rangee.progression === 60, `${rangee.progression} %`);

    await ouvrirFiche(page);
    verifier('la page montre la notion à jour',
      /100 % maîtrisé/.test(await page.innerText('#partie-2 .notion-etat')),
      await page.innerText('#partie-2 .notion-etat'));
    verifier('la reprise passe à la notion suivante',
      /S'adapter aux contraintes/.test(await page.innerText('.page-fiche-reprise')),
      await page.innerText('.page-fiche-reprise'));
    await ctx.close();
  }

  /* — 3. Se tester sur une notion cible cette notion — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(SEMEE);
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/index.html'); await page.waitForTimeout(400);
    await ouvrirFiche(page);

    await page.click('#partie-1 [data-notion="quiz"]'); await page.waitForTimeout(600);
    verifier('le quiz s\'ouvre', await page.isVisible('#vue-quiz'), 'vue quiz masquée');
    const complement = await page.inputValue('#quiz-complement');
    verifier('la consigne cible la notion',
      /notion « Les contraintes naturelles »/.test(complement), complement.slice(0, 120));
    verifier('la consigne ne part pas sur les autres notions',
      !/pergélisol/i.test(complement), complement.slice(0, 200));
    verifier('le lexique de la notion est donné à réviser',
      /Densité : Le nombre/.test(complement), complement.slice(-200));
    await ctx.close();
  }

  await nav.close();
  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nTout est vert.');
  process.exit(echecs ? 1 : 0);
})();
