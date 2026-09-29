/* Vérifie que les flashcards sont écrites comme le quiz : à partir de la fiche,
   par l'IA quand elle est joignable, avec repli sur les cartes locales sinon.
   Le runtime d'artefact est simulé : aucun appel réseau.
   Nécessite un serveur local sur le port 8321. Lancer : node tests/cartes-ia.js */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const hier = new Date(Date.now() - 4 * 86400000).toISOString();
const FICHE = {
  id: 'fia', matiere: 'histoire', titre: 'Les contraintes naturelles', source: 'scan', banqueId: null,
  contenu: { lu: true, moteur: 'ocr', accroche: 'Texte lu sur ton document.',
    sections: [
      { titre: 'Les contraintes naturelles',
        texte: "Une contrainte naturelle gêne l'installation des hommes.",
        points: ['Les milieux froids restent peu peuplés.'],
        lexique: [{ terme: 'Densité', definition: 'Habitants par km².' }],
        reperes: ['Densité = habitants / km²'] },
      { titre: 'Les milieux froids', texte: 'Le pergélisol est un sol gelé en permanence.',
        points: [], lexique: [{ terme: 'Toundra', definition: 'Plaine gelée.' }], reperes: [] },
    ],
    points: [], formules: [], exemples: [], pieges: [] },
  // Une seule carte locale, volontairement pauvre : l'IA doit faire mieux.
  cartes: [{ recto: 'Densité ?', verso: 'Habitants par km².', partie: 0 }],
  maitrise: {}, creee: hier, derniereRevision: hier, palier: 0, progression: 0,
};

/* mode : ok | cassé | absent */
const FAUX = (mode) => `
localStorage.setItem('mathematique.niveau', 'lyceen');
localStorage.setItem('mathematique.fiches', ${JSON.stringify(JSON.stringify([FICHE]))});
window.claude = {
  use: async (nom) => {
    if (nom !== 'sample' || '${mode}' === 'absent') return null;
    const f = async () => ({ text: '', truncated: false });
    f.json = async (invite, opts) => {
      window.__invite = invite;
      if (opts && opts.onText) opts.onText({ text: '{"cartes"' });
      await new Promise((r) => setTimeout(r, 100));
      if ('${mode}' === 'cassé') return { cartes: [{ recto: 'Densité', verso: '' }] };
      return { cartes: [
        { recto: "Qu'est-ce qu'une contrainte naturelle ?", verso: "Un élément du milieu qui gêne l'installation des hommes.", partie: 0, terme: 'Contrainte naturelle' },
        { recto: 'Que signifie « densité » dans ce cours ?', verso: "Le nombre d'habitants rapporté à la superficie.", partie: 0, terme: 'Densité' },
        { recto: 'Comment calcule-t-on la densité ?', verso: 'En divisant le nombre d habitants par la superficie.', partie: 0, terme: 'Densité' },
        { recto: "Qu'est-ce que le pergélisol ?", verso: 'Un sol gelé en permanence.', partie: 1, terme: 'Pergélisol' },
        { recto: "Qu'est-ce qu'une toundra ?", verso: 'Une plaine gelée où ne poussent que mousses et lichens.', partie: 1, terme: 'Toundra' },
        { recto: 'Recto sans point d interrogation', verso: 'À jeter.', partie: 0 },
      ] };
    };
    f.limits = async () => ({ maxPromptBytes: 65536 });
    return f;
  }
};`;

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

  /* — 1. L'IA écrit le paquet à partir de la fiche — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(FAUX('ok'));
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.goto('http://localhost:8321/index.html'); await page.waitForTimeout(500);
    await ouvrirFiche(page);
    await page.click('[data-page="cartes"]'); await page.waitForTimeout(1600);

    const invite = await page.evaluate(() => window.__invite || '');
    verifier("l'invite part de la fiche, notion par notion",
      /Notion 0 — Les contraintes naturelles/.test(invite) && /Notion 1 — Les milieux froids/.test(invite),
      invite.slice(0, 200));
    verifier("l'invite donne le lexique de la fiche",
      /Densité : Habitants par km²/.test(invite), invite.slice(-400));
    verifier("l'invite réclame 10 à 18 cartes réparties",
      /10 à 18 cartes, RÉPARTIES sur toutes les notions/.test(invite), 'consigne absente');
    verifier("l'invite interdit les questions creuses",
      /INTERDIT : « Définition \? »/.test(invite), 'garde-fou absent');

    verifier('le paquet est ouvert', await page.isVisible('#jeu-cartes'), 'jeu masqué');
    verifier('les cartes mal formées sont écartées',
      /5 cartes restantes/.test(await page.innerText('#cartes-position')),
      await page.innerText('#cartes-position'));

    const rangee = await page.evaluate(() => JSON.parse(localStorage.getItem('mathematique.fiches'))[0]);
    verifier('le paquet est gardé avec la fiche',
      rangee.cartes.length === 5 && rangee.cartesIA === true,
      JSON.stringify({ n: rangee.cartes.length, ia: rangee.cartesIA }));
    verifier('chaque carte sait de quelle notion elle vient',
      rangee.cartes.every((c) => typeof c.partie === 'number'),
      JSON.stringify(rangee.cartes.map((c) => c.partie)));
    verifier('toute question est une vraie question',
      rangee.cartes.every((c) => /\?$/.test(c.recto) && c.recto.split(' ').length >= 3),
      rangee.cartes.map((c) => c.recto).join(' | '));
    verifier('aucune erreur console', erreurs.length === 0, erreurs.join(' || '));
    await ctx.close();
  }

  /* — 2. Une notion ne sort que ses cartes, une fois le paquet écrit — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(FAUX('ok'));
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/index.html'); await page.waitForTimeout(400);
    await ouvrirFiche(page);
    await page.click('#partie-2 [data-notion="cartes"]'); await page.waitForTimeout(1600);
    verifier('la notion 2 sort ses deux cartes',
      /2 cartes restantes/.test(await page.innerText('#cartes-position')),
      await page.innerText('#cartes-position'));
    await ctx.close();
  }

  /* — 3. Réponse inexploitable : on garde les cartes locales — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(FAUX('cassé'));
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/index.html'); await page.waitForTimeout(400);
    await ouvrirFiche(page);
    await page.click('[data-page="cartes"]'); await page.waitForTimeout(1600);
    verifier('le repli garde la carte locale',
      /Dernière carte|1 cartes restantes/.test(await page.innerText('#cartes-position')),
      await page.innerText('#cartes-position'));
    const rangee = await page.evaluate(() => JSON.parse(localStorage.getItem('mathematique.fiches'))[0]);
    verifier('la fiche n\'est pas marquée comme écrite par l\'IA',
      !rangee.cartesIA, JSON.stringify(rangee.cartesIA));
    await ctx.close();
  }

  /* — 4. Sans IA, les cartes locales suffisent — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(FAUX('absent'));
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/index.html'); await page.waitForTimeout(400);
    await ouvrirFiche(page);
    await page.click('[data-page="cartes"]'); await page.waitForTimeout(1400);
    verifier('sans IA, la séance démarre quand même',
      await page.isVisible('#jeu-cartes'), 'jeu masqué');
    verifier('aucune écriture n\'est tentée',
      (await page.evaluate(() => window.__invite || '')) === '', 'invite envoyée');
    await ctx.close();
  }

  await nav.close();
  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nTout est vert.');
  process.exit(echecs ? 1 : 0);
})();
