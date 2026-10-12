/* Le quiz d'une fiche photographiée.
   Il ne savait partir que d'un chapitre du catalogue : une fiche prise en
   photo n'en a aucun, donc il renonçait et renvoyait l'élève vers une IA
   qui n'existe pas hors de l'artifact. Son lexique et ses cartes suffisent.
   Lancer : node tests/quiz-fiche.js (serveur local sur 8321) */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

const ilYA = (n) => new Date(Date.now() - n * 86400000).toISOString();

function ficheAvec(nbCartes, lexique) {
  const cartes = [];
  for (let i = 1; i <= nbCartes; i++) {
    cartes.push({ recto: `Question ${i} ?`, verso: `Réponse ${i}.`, partie: i % 2, terme: `Terme ${i}` });
  }
  return {
    id: 'f1', matiere: 'autre', titre: 'Habiter des espaces à fortes contraintes',
    source: 'scan', banqueId: null,
    contenu: {
      lu: true, moteur: 'claude', accroche: 'Deux notions.',
      sections: [
        { titre: 'Les contraintes', texte: 'Une contrainte gêne l’installation des hommes.',
          points: [], reperes: [], formules: [], lexique: lexique.slice(0, Math.ceil(lexique.length / 2)) },
        { titre: 'Les milieux froids', texte: 'Le pergélisol empêche de construire.',
          points: [], reperes: [], formules: [], lexique: lexique.slice(Math.ceil(lexique.length / 2)) },
      ],
      points: [], formules: [], exemples: [], pieges: [], texte: '',
    },
    cartes, creee: ilYA(6), derniereRevision: ilYA(6), palier: 0, progression: 33,
  };
}

const LEXIQUE = [
  { terme: 'Densité', definition: 'le nombre d’habitants par kilomètre carré' },
  { terme: 'Pergélisol', definition: 'un sol gelé en permanence' },
  { terme: 'Aridité', definition: 'le manque durable de précipitations' },
  { terme: 'Toundra', definition: 'une végétation rase des milieux froids' },
];

function semence(fiche) {
  return `localStorage.setItem('mathematique.niveau','lyceen');
    window.claude = { use: async () => null };    /* aucune IA : c'est tout l'enjeu */
    localStorage.setItem('mathematique.fiches', ${JSON.stringify(JSON.stringify([fiche]))});`;
}

async function ouvrirQuiz(ctx) {
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
  page.on('pageerror', (e) => erreurs.push('PAGE: ' + String(e)));
  await page.goto('http://localhost:8321/app.html', { waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.click('#bloc-aujourdhui [data-revoir]'); await page.waitForTimeout(350);
  await page.click('#reprise-choix [data-reprise="quiz"]'); await page.waitForTimeout(2200);
  return { page, erreurs };
}

(async () => {
  const nav = await chromium.launch();

  /* — 1. Une fiche nourrie : le quiz part d'elle, sans IA ni banque — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(semence(ficheAvec(13, LEXIQUE)));
    const { page, erreurs } = await ouvrirQuiz(ctx);

    verifier('le quiz démarre sur une fiche photographiée',
      await page.isVisible('#jeu-quiz'), await page.innerText('#vue-quiz').then((t) => t.slice(0, 120)));
    verifier('il dit d\'où viennent ses questions',
      /questions tirées de ta fiche/.test(await page.innerText('#quiz-contexte')),
      await page.innerText('#quiz-contexte'));
    verifier('chaque question offre quatre propositions',
      (await page.locator('#quiz-reponses button').count()) === 4,
      await page.locator('#quiz-reponses button').count());

    /* On joue juste à chaque tour : le score doit suivre, sinon la bonne
       réponse n'est pas celle qu'on croit. */
    let justes = 0;
    for (let tour = 0; tour < 8; tour++) {
      if (!(await page.isVisible('#quiz-reponses button'))) break;
      const enonce = (await page.innerText('#quiz-question')).trim();
      /* Trois formes de question cohabitent : celles tirées des cartes, et
         les deux sens du lexique. On sait répondre juste aux trois, sinon
         l'assertion sur le score ne prouverait rien. */
      let attendue = null;
      const rang = (enonce.match(/Question (\d+)/) || [])[1];
      if (rang) attendue = `Réponse ${rang}.`;
      else {
        const parDefinition = enonce.match(/correspond à\s*:\s*(.+?)\s*\?$/);
        const parTerme = enonce.match(/Que désigne\s*«\s*(.+?)\s*»/);
        if (parDefinition) {
          const entree = LEXIQUE.find((e) => e.definition === parDefinition[1]);
          attendue = entree && entree.terme;
        } else if (parTerme) {
          const entree = LEXIQUE.find((e) => e.terme === parTerme[1]);
          attendue = entree && (entree.definition.charAt(0).toUpperCase() + entree.definition.slice(1));
        }
      }

      const boutons = await page.$$('#quiz-reponses button');
      let fait = false;
      for (const b of boutons) {
        if (attendue && (await b.innerText()).trim() === attendue) { await b.click(); justes++; fait = true; break; }
      }
      if (!fait) { console.log('        (énoncé non reconnu par le test :', enonce, ')'); await boutons[0].click(); }
      await page.waitForTimeout(320);
      if (await page.isVisible('#quiz-suivant')) { await page.click('#quiz-suivant'); await page.waitForTimeout(320); }
    }
    await page.waitForTimeout(500);

    const bilan = await page.innerText('#bilan-quiz');
    verifier('répondre juste donne le score plein',
      justes === 5 && /100 % de bonnes/.test(bilan), `${justes} justes · ${bilan.split('\n')[1] || ''}`);
    verifier('aucune erreur de page', erreurs.length === 0, erreurs.join(' || '));
    await ctx.close();
  }

  /* — 2. Trop peu de matière : on le dit, on n'invente pas un QCM bancal — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(semence(ficheAvec(2, LEXIQUE.slice(0, 2))));
    const { page } = await ouvrirQuiz(ctx);

    verifier('sans assez d\'entrées, aucun QCM bancal n\'est fabriqué',
      !(await page.isVisible('#jeu-quiz')) && (await page.isVisible('#indispo-quiz')),
      await page.innerText('#vue-quiz').then((t) => t.slice(0, 100)));
    await ctx.close();
  }

  await nav.close();
  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nTout est vert.');
  process.exit(echecs ? 1 : 0);
})();
