/* La fiche imprimée — c'est-à-dire le PDF.
   On ne fabrique pas le fichier nous-mêmes : le navigateur le fait, à partir
   de la feuille d'impression. Ce banc vérifie donc ce qui disparaît (toute
   l'interface), ce qui reste (la fiche, ses formules composées), et que le
   fichier sort bel et bien.
   Nécessite un serveur local sur le port 8321. Lancer : node tests/impression.js */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

const ilYA = (jours) => new Date(Date.now() - jours * 86400000).toISOString();

const FICHE = {
  id: 'f-impression', matiere: 'maths', source: 'scan', banqueId: null,
  titre: 'Suites arithmétiques et géométriques',
  contenu: {
    lu: true, moteur: 'claude', accroche: 'Deux notions, lues sur ta photo.',
    sections: [
      {
        numero: 'I', titre: 'Les suites arithmétiques',
        texte: "On passe d'un terme au suivant en ajoutant toujours le même nombre, appelé la raison.",
        points: ['La suite des multiples de 5 est arithmétique de raison 5.'],
        formules: [
          { nom: 'Terme général', latex: '$$u_n = u_0 + n \\times r$$', conditions: 'pour tout entier naturel $n$' },
        ],
        lexique: [{ terme: 'Raison', definition: 'la différence constante entre un terme et son précédent' }],
        reperes: ['Raison positive : la suite monte.'],
      },
      {
        numero: 'II', titre: 'Les suites géométriques',
        texte: 'On multiplie toujours par le même nombre, appelé la raison q.',
        points: [],
        formules: [{ nom: 'Terme général', latex: '$$u_n = u_0 \\times q^{\\,n}$$', conditions: 'avec $q \\neq 0$' }],
        lexique: [{ terme: 'Raison q', definition: 'le nombre par lequel on multiplie' }],
        reperes: [],
      },
    ],
    points: [], formules: [], exemples: [], pieges: [], texte: '',
  },
  cartes: [
    { recto: 'Raison ?', verso: 'La différence constante.', partie: 0, terme: 'Raison' },
    { recto: 'Terme général ?', verso: 'u_n = u_0 + n × r.', partie: 0, terme: 'Terme général' },
  ],
  maitrise: { 0: 72, 1: 40 }, creee: ilYA(9), derniereRevision: ilYA(9), palier: 1, progression: 56,
};

(async () => {
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(`
    window.claude = { use: async () => null };
    window.MATHEMATIQUE_COMPTE = { api: "" };
    localStorage.setItem('mathematique.niveau', 'lyceen');
    localStorage.setItem('mathematique.fiches', ${JSON.stringify(JSON.stringify([FICHE]))});`);
  const page = await ctx.newPage();
  await page.goto('http://localhost:8321/app.html', { waitUntil: 'load' });
  await page.waitForTimeout(600);

  /* On ouvre la fiche par la porte « résumé », comme l'élève. */
  await page.click('#bloc-aujourdhui [data-revoir]'); await page.waitForTimeout(350);
  await page.click('#reprise-choix [data-reprise="resume"]'); await page.waitForTimeout(900);
  verifier('la fiche est ouverte', await page.isVisible('#page-fiche'), 'page absente');

  /* — 1. Le bouton existe et nomme le fichier — */
  verifier('la page de fiche propose un export PDF',
    await page.isVisible('#fiche-pdf'), 'bouton absent');

  const titre = await page.evaluate(async () => {
    let vu = null;
    window.print = () => { vu = document.title; };     // on n'ouvre pas de dialogue
    document.getElementById('fiche-pdf').click();
    await new Promise((s) => setTimeout(s, 100));
    return vu;
  });
  verifier('le fichier proposé porte le nom de la fiche',
    titre === 'Suites arithmétiques et géométriques — Brainoko', String(titre));
  await page.waitForTimeout(3300);          // le filet de sécurité du titre
  verifier('et le titre de la page est rendu après coup',
    (await page.title()) === 'Brainoko', await page.title());

  /* — 2. À l'impression, l'interface disparaît et la fiche reste — */
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(200);

  for (const [quoi, selecteur] of [
    ['l\'en-tête', '.header'], ['la barre du bas', '.barre-bas'],
    ['les trois portes', '#page-fiche .reprises'], ['le bouton PDF lui-même', '#fiche-pdf'],
  ]) {
    verifier(`${quoi} ne s'imprime pas`, !(await page.isVisible(selecteur)), 'encore visible');
  }

  verifier('le titre de la fiche s\'imprime',
    await page.isVisible('.page-fiche-titre'), 'titre absent');
  verifier('les deux notions aussi',
    (await page.$$('.notion')).length === 2, `${(await page.$$('.notion')).length} notions`);
  /* Deux formules isolées, plus le LaTeX glissé dans leurs conditions
     (« pour tout entier naturel n ») : tout doit être composé. */
  verifier('les formules sont composées, pas laissées en code',
    (await page.$$('.formule-corps .katex')).length === 2,
    `${(await page.$$('.formule-corps .katex')).length} formules composées`);
  verifier('et jusque dans leurs conditions',
    (await page.$$('.formule-conditions .katex')).length === 2,
    `${(await page.$$('.formule-conditions .katex')).length} conditions composées`);
  verifier('la fiche dit d\'où elle vient',
    /brainoko\.com/i.test(await page.innerText('.impression-pied')),
    await page.innerText('.impression-pied').catch(() => '—'));

  /* La couleur de la matière doit arriver jusqu'au papier. */
  const couleur = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.notion-numero')).backgroundColor);
  verifier('le numéro de notion porte la couleur de la matière',
    couleur === 'rgb(79, 91, 213)', couleur);

  /* — 3. Le fichier sort vraiment — */
  const fichier = path.join(os.tmpdir(), 'brainoko-fiche-test.pdf');
  await page.pdf({ path: fichier, format: 'A4', printBackground: true,
                   margin: { top: '14mm', bottom: '14mm', left: '13mm', right: '13mm' } });
  const octets = fs.existsSync(fichier) ? fs.statSync(fichier).size : 0;
  const entete = octets ? fs.readFileSync(fichier).subarray(0, 4).toString('latin1') : '';
  verifier('un vrai PDF est produit', entete === '%PDF' && octets > 15000,
    `${entete} · ${octets} octets`);
  fs.unlinkSync(fichier);

  await nav.close();
  console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est vert.');
  process.exit(echecs ? 1 : 0);
})();
