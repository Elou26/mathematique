/* Vérifie la fiche en pleine page et le refus d'une lecture illisible.
   Une fiche se relit sur sa propre page (sommaire, parties numérotées,
   actions) ; une photo trop mal lue ne fabrique aucune fiche.
   Nécessite un serveur local sur le port 8321. Lancer : node tests/page-fiche.js */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

/* Une fiche déjà rangée, telle que la lecture d'une photo la produit. */
const FICHE = {
  id: 'ftest01',
  matiere: 'histoire',
  titre: 'Les contraintes naturelles',
  source: 'scan',
  banqueId: null,
  contenu: {
    lu: true,
    moteur: 'ocr',
    accroche: 'Texte lu sur ton document, sans IA : relis-le avant de réviser.',
    sections: [
      { titre: 'Définition', texte: "Une contrainte naturelle gêne l'installation des hommes.", points: ["Les milieux froids sont peu peuplés."] },
      { titre: 'En montagne', texte: "L'altitude rend les transports difficiles.", points: [] },
      { titre: 'Les adaptations', texte: 'Les habitants construisent des tunnels et des serres.', points: [] },
    ],
    points: ["Une contrainte naturelle gêne l'installation des hommes."],
    formules: ['Densité = habitants / km²'],
    exemples: ['Exemple : les Alpes, où les routes montent en lacets.'],
    pieges: [],
    libelleFormules: 'Formules et repères',
    texte: 'CONTRAINTES\nUne contrainte naturelle gêne\n',
  },
  cartes: [{ recto: "Qu'est-ce qu'une contrainte naturelle ?", verso: "Un élément du milieu qui gêne l'installation des hommes." }],
  creee: new Date().toISOString(),
  derniereRevision: new Date().toISOString(),
  palier: 0,
  progression: 40,
};

const SEMEE = `
localStorage.setItem('mathematique.niveau', 'lyceen');
localStorage.setItem('mathematique.fiches', ${JSON.stringify(JSON.stringify([FICHE]))});
window.claude = { use: async () => null };`;

/* Moteur simulé : on choisit le texte rendu et la confiance annoncée. */
const FAUX = (texte, confiance) => `
window.claude = { use: async () => null };
window.Tesseract = {
  createWorker: async (langs, oem, opts) => ({
    recognize: async () => {
      if (opts && opts.logger) opts.logger({ status: 'recognizing text', progress: 0.5 });
      return { data: { text: ${JSON.stringify(texte)}, confidence: ${confiance} } };
    },
    terminate: async () => {},
  }),
};`;

const COURS = [
  '1ère STMG   Chap. 6 - Suites arithmétiques et géométriques',
  'Chapitre 6',
  'Suites arithmétiques et géométriques',
  'I. Suites arithmétiques',
  '1) Définition',
  'Exemple : Considérons une suite numérique Un où la différence entre un terme et son précédent reste constante et égale à 5.',
  'Une telle suite est appelée une suite arithmétique de raison 5 et de premier terme 3.',
  'Propriété : pour tout entier n, Un = U0 + n x r.',
  'Raison : la différence constante entre deux termes consécutifs.',
].join('\n');

/* Ce que rend une photo floue : des mots qui n'existent pas. */
const BOUILLIE = ['nn] 4 US> PES j= [ xz vv} l1 m rn] tt',
  'hhj kk] 3 zz> ww qq] vv nn rr] mm tt} ll',
  'bb] cc> dd ff] gg hh jj] kk ll> mm nn]',
  'pp qq] rr ss> tt vv] ww xx yy] zz bb',
  'cc] dd ff> gg hh jj] kk ll mm] nn pp'].join('\n');

let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

(async () => {
  fs.writeFileSync('/tmp/page-cours.png', PIXEL);
  const nav = await chromium.launch();

  /* — 1. Une fiche rangée s'ouvre en pleine page — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    /* Ces suites éprouvent la lecture SANS service : on l'éteint
       explicitement, au lieu de compter sur le défaut de la page. */
    await ctx.addInitScript(`window.MATHEMATIQUE_LECTURE = { api: "" };
    window.MATHEMATIQUE_PAIEMENT = { api: "" };`);
    await ctx.addInitScript(SEMEE);
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.goto('http://localhost:8321/app.html');
    await page.waitForTimeout(400);

    await page.click('.barre-bas [data-onglet="cours"]'); await page.waitForTimeout(300);
    await page.click('.dossier-tete:has-text("Histoire")'); await page.waitForTimeout(300);
    await page.click('[data-reprise="resume"]'); await page.waitForTimeout(400);

    verifier('la fiche s\'ouvre sur sa propre page', await page.isVisible('#vue-fiche'), 'vue masquée');
    verifier('le titre est en tête',
      /Les contraintes naturelles/.test(await page.innerText('.page-fiche-titre')),
      await page.innerText('.page-fiche-titre'));
    verifier('la matière est affichée',
      /Histoire/i.test(await page.innerText('.page-fiche-matiere')),
      await page.innerText('.page-fiche-matiere'));
    verifier('le sommaire liste les parties',
      (await page.$$eval('.page-fiche-sommaire li', (n) => n.length)) === 3,
      await page.$$eval('.page-fiche-sommaire li', (n) => n.length));
    verifier('les notions sont numérotées et titrées',
      (await page.$$eval('.page-fiche-corps .notion', (n) => n.length)) === 3,
      await page.$$eval('.page-fiche-corps .notion', (n) => n.length));
    const corps = await page.innerText('.page-fiche-corps');
    verifier('les repères du cours y sont', /Densité = habitants/.test(corps), corps.slice(0, 80));
    verifier('les exemples du cours y sont', /les Alpes/.test(corps), corps.slice(0, 80));
    verifier('le texte lu reste vérifiable',
      await page.isVisible('#page-fiche details'), 'dépliant absent');

    await page.click('.page-fiche-sommaire button'); await page.waitForTimeout(400);
    verifier('le sommaire mène à la partie',
      await page.isVisible('#partie-1'), 'ancre absente');

    verifier('l\'onglet « Mes fiches » reste allumé',
      await page.isVisible('.barre-bas [data-onglet="cours"].onglet--actif'), 'onglet éteint');

    await page.click('[data-page="tester"]'); await page.waitForTimeout(600);
    verifier('on peut se tester depuis la fiche', await page.isVisible('#vue-quiz'), 'quiz non ouvert');

    verifier('aucune erreur console', erreurs.length === 0, erreurs.join(' || '));
    await ctx.close();
  }

  /* — 2. Retour : on revient d'où l'on vient — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    /* Ces suites éprouvent la lecture SANS service : on l'éteint
       explicitement, au lieu de compter sur le défaut de la page. */
    await ctx.addInitScript(`window.MATHEMATIQUE_LECTURE = { api: "" };
    window.MATHEMATIQUE_PAIEMENT = { api: "" };`);
    await ctx.addInitScript(SEMEE);
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/app.html'); await page.waitForTimeout(400);
    await page.click('.barre-bas [data-onglet="cours"]'); await page.waitForTimeout(300);
    await page.click('.dossier-tete:has-text("Histoire")'); await page.waitForTimeout(300);
    await page.click('[data-reprise="resume"]'); await page.waitForTimeout(300);
    await page.click('#fiche-retour'); await page.waitForTimeout(300);
    verifier('le retour ramène à mes fiches', await page.isVisible('#vue-cours'), 'vue cours masquée');
    await ctx.close();
  }

  /* — 3. Une photo trop mal lue ne fabrique pas de fiche — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    /* Ces suites éprouvent la lecture SANS service : on l'éteint
       explicitement, au lieu de compter sur le défaut de la page. */
    await ctx.addInitScript(`window.MATHEMATIQUE_LECTURE = { api: "" };
    window.MATHEMATIQUE_PAIEMENT = { api: "" };`);
    await ctx.addInitScript(FAUX(BOUILLIE, 88));
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/app.html');
    await page.click('text=Lycéen'); await page.waitForTimeout(400);
    await page.click('#ouvrir-creation'); await page.waitForTimeout(400);
    await page.setInputFiles('#scan-galerie', '/tmp/page-cours.png'); await page.waitForTimeout(300);
    await page.click('#scan-analyser');
    await page.waitForFunction(
      () => { const m = document.querySelector('#scan-message'); return m && !m.hidden && m.textContent; },
      null, { timeout: 45000 }).catch(() => {});
    const message = await page.innerText('#scan-message');
    verifier('la lecture illisible est annoncée', /trop mal lue/.test(message), message);
    verifier('le motif est donné', /mots lus n'en sont pas|peu de texte/.test(message), message);
    verifier('aucune fiche n\'est montrée', !(await page.isVisible('#scan-fiche-lue')), 'aperçu visible');
    verifier('le thème est demandé à la main', await page.isVisible('#scan-sujet'), 'champ absent');
    await ctx.close();
  }

  /* — 4. Après une lecture réussie, la fiche s'ouvre en pleine page — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    /* Ces suites éprouvent la lecture SANS service : on l'éteint
       explicitement, au lieu de compter sur le défaut de la page. */
    await ctx.addInitScript(`window.MATHEMATIQUE_LECTURE = { api: "" };
    window.MATHEMATIQUE_PAIEMENT = { api: "" };`);
    await ctx.addInitScript(FAUX(COURS, 90));
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/app.html');
    await page.click('text=Lycéen'); await page.waitForTimeout(400);
    await page.click('#ouvrir-creation'); await page.waitForTimeout(400);
    await page.setInputFiles('#scan-galerie', '/tmp/page-cours.png'); await page.waitForTimeout(300);
    await page.click('#scan-analyser'); await page.waitForTimeout(2000);
    verifier('la fiche lue est présentée', await page.isVisible('#scan-fiche-lue'), 'aperçu absent');
    await page.click('[data-scan-outil="resume"]'); await page.waitForTimeout(400);
    await page.click('#nom-valider'); await page.waitForTimeout(800);
    verifier('la fiche lue s\'ouvre sur sa page', await page.isVisible('#vue-fiche'), 'vue fiche masquée');
    verifier('le titre lu est en tête',
      /Suites arithmétiques/.test(await page.innerText('.page-fiche-titre')),
      await page.innerText('.page-fiche-titre'));
    await ctx.close();
  }

  /* — Une fiche de sciences : les formules sont le contenu qu'on vient
     chercher, pas une ligne grise de plus. Elles étaient rendues en chasse
     fixe, dans la même liste que les dates — donc elles ressemblaient à du
     code, et leurs hypothèses se noyaient dedans. — */
  {
    const hier = new Date(Date.now() - 86400000).toISOString();
    const MATHS = [{
      id: 'fm', matiere: 'maths', titre: 'Intégrales', source: 'scan', banqueId: null,
      contenu: {
        lu: true, moteur: 'claude', accroche: 'Deux notions.',
        sections: [{
          numero: 'II', titre: 'L\u2019intégrale', texte: 'L\u2019intégrale vaut l\u2019aire sous la courbe.',
          points: [], reperes: ['Repère de date · 1700'],
          formules: [{ nom: 'Théorème fondamental', latex: '$\\int_a^b f(x)\\,dx = F(b) - F(a)$',
                       conditions: 'f continue sur [a ; b]' }],
          lexique: [{ terme: 'Primitive', definition: 'Fonction dont la dérivée est $f$.' }],
        }],
        points: [], formules: [], exemples: [], pieges: [], texte: '',
        aVerifier: ['La légende du graphique est [illisible].'],
      },
      cartes: [{ recto: 'Que vaut l\u2019intégrale ?', verso: '$F(b) - F(a)$.', partie: 0, terme: '' }],
      creee: hier, derniereRevision: hier, palier: 1, progression: 50,
    }];

    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(`window.MATHEMATIQUE_LECTURE = { api: "" };
    window.MATHEMATIQUE_PAIEMENT = { api: "" };
      localStorage.setItem('mathematique.niveau','lyceen');
      localStorage.setItem('mathematique.fiches', ${JSON.stringify(JSON.stringify(MATHS))});`);
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.goto('http://localhost:8321/app.html'); await page.waitForTimeout(400);
    await page.click('.barre-bas [data-onglet="cours"]'); await page.waitForTimeout(300);
    await page.click('.dossier-tete:has-text("Math")'); await page.waitForTimeout(300);
    await page.click('[data-reprise="resume"]'); await page.waitForTimeout(900);

    verifier('la formule a sa carte, pas une ligne de liste',
      (await page.locator('.formule').count()) === 1, await page.locator('.formule').count());
    verifier('son nom est donné',
      /Théorème fondamental/.test(await page.innerText('.formule-nom')),
      await page.innerText('.formule-nom'));
    verifier('ses conditions sont détachées, pas noyées dans la formule',
      /f continue sur \[a ; b\]/.test(await page.innerText('.formule-conditions')),
      await page.innerText('.formule-conditions'));
    verifier('le LaTeX est rendu, aucun $ ne subsiste',
      (await page.locator('.formule .katex').count()) >= 1
      && !/\$/.test(await page.innerText('#page-fiche')),
      await page.locator('.formule .katex').count());
    verifier('un repère qui n\'est pas une formule reste un repère',
      /1700/.test(await page.innerText('.notion-reperes')),
      await page.innerText('.notion-reperes'));
    verifier('la numérotation du document est gardée',
      (await page.innerText('.notion-numero')).trim() === 'II',
      await page.innerText('.notion-numero'));
    verifier('ce que la lecture n\'a pas su lire est dit à l\'élève',
      /illisible/.test(await page.innerText('.page-fiche-verifier')),
      await page.innerText('.page-fiche-verifier'));
    verifier('la page ne déborde pas en largeur',
      !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)),
      'débordement horizontal');
    verifier('aucune erreur de page', erreurs.length === 0, erreurs.join(' || '));
    await ctx.close();
  }

  await nav.close();
  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nTout est vert.');
  process.exit(echecs ? 1 : 0);
})();
