/* Vérifie la lecture d'une leçon / d'un devoir / d'un contrôle photographié :
   Claude lit les pages (faux runtime), la fiche et les cartes en sortent, et le
   repli manuel tient quand les photos ne peuvent pas être envoyées.
   Nécessite un serveur local sur le port 8321. Lancer : node tests/lecture-photo.js */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

/* mode : ok | illisible | sans-images | absent */
const FAUX = (mode) => `
window.claude = { use: async (n) => {
  if (n !== 'sample' || '${mode}' === 'absent') return null;
  const f = async () => ({ text: '', truncated: false });
  f.limits = async () => ('${mode}' === 'sans-images'
    ? { maxInputBytes: 100000 }
    : { maxInputBytes: 100000, images: { maxCount: 4, mediaTypes: ['image/jpeg', 'image/png'] } });
  f.json = async (invite, opts) => {
    window.__invite = invite;
    window.__images = opts && opts.images ? Array.from(opts.images).length : 0;
    await new Promise(r => setTimeout(r, 150));
    if (invite.indexOf('flashcards') === -1) {          // c'est une demande de quiz
      return { titre: 'Quiz de contrôle', questions: [
        { enonce: 'Question ?', choix: ['a','b','c','d'], bonne: 1, explication: 'Parce que.' }] };
    }
    if ('${mode}' === 'illisible') return { lisible: false, raison: 'photo trop floue' };
    return {
      lisible: true,
      titre: 'La révolution française',
      matiere: 'histoire',
      resume: {
        accroche: "Dix ans qui font basculer l'Europe.",
        points: ['1789 : prise de la Bastille', 'Abolition des privilèges', 'Chute de la monarchie'],
        formules: ['1789-1799'],
        exemples: ['Nuit du 4 août'],
        pieges: ['Ne pas confondre Directoire et Consulat'],
      },
      flashcards: [
        { recto: 'Date de la prise de la Bastille ?', verso: '14 juillet 1789' },
        { recto: 'Que se passe-t-il le 4 août 1789 ?', verso: "L'abolition des privilèges" },
        { recto: 'Qui est arrêté à Varennes ?', verso: 'Louis XVI, en juin 1791' },
        { recto: 'Quand la République est-elle proclamée ?', verso: 'Le 22 septembre 1792' },
      ],
    };
  };
  return f;
} };`;

let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

(async () => {
  fs.writeFileSync('/tmp/page-cours.png', PIXEL);
  const nav = await chromium.launch();

  /* — 1. Lecture réussie : leçon → fiche + cartes — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(FAUX('ok'));
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.goto('http://localhost:8321/index.html');
    await page.click('text=Lycéen'); await page.waitForTimeout(400);
    await page.click('#ouvrir-creation'); await page.waitForTimeout(200);
    await page.click('[data-creation="scan"]'); await page.waitForTimeout(300);

    verifier('le moteur annonce la lecture par Claude',
      /Claude lit tes pages/.test(await page.innerText('#scan-moteur')), await page.innerText('#scan-moteur'));

    await page.click('[data-type="controle"]'); await page.waitForTimeout(150);
    verifier("le type choisi change l'aide", /contrôle rendu/.test(await page.innerText('#scan-type-aide')),
      await page.innerText('#scan-type-aide'));

    await page.setInputFiles('#scan-galerie', ['/tmp/page-cours.png', '/tmp/page-cours.png']);
    await page.waitForTimeout(400);
    verifier('les deux pages sont en vignettes', (await page.$$('.scan-page')).length === 2,
      (await page.$$('.scan-page')).length);
    verifier('le bouton annonce la lecture', /Lire mes 2 pages/.test(await page.innerText('#scan-analyser')),
      await page.innerText('#scan-analyser'));

    await page.click('#scan-analyser'); await page.waitForTimeout(1200);
    verifier('les images sont bien envoyées', (await page.evaluate(() => window.__images)) === 2,
      await page.evaluate(() => window.__images));
    verifier("l'invite décrit un contrôle", /contrôle/.test(await page.evaluate(() => window.__invite || '')),
      (await page.evaluate(() => window.__invite || '')).slice(0, 80));
    verifier('la fiche lue est affichée',
      /La révolution française/.test(await page.innerText('#scan-fiche-lue')), await page.innerText('#scan-fiche-lue'));
    verifier('le titre lu remplit le champ',
      (await page.inputValue('#scan-sujet')) === 'La révolution française', await page.inputValue('#scan-sujet'));
    verifier('la tuile annonce les cartes', /4 cartes/.test(await page.innerText('#outil-cartes-detail')),
      await page.innerText('#outil-cartes-detail'));

    await page.click('[data-scan-outil="flashcards"]'); await page.waitForTimeout(500);
    verifier('la feuille de nommage reprend le titre lu',
      (await page.inputValue('#nom-champ')) === 'La révolution française', await page.inputValue('#nom-champ'));
    await page.click('#nom-valider'); await page.waitForTimeout(1400);
    verifier('le paquet vient du document', /Bastille|4 août|Varennes|République/.test(await page.innerText('#carte-recto')),
      await page.innerText('#carte-recto'));

    const rangee = await page.evaluate(() => JSON.parse(localStorage.getItem('mathematique.fiches') || '[]'));
    verifier('la fiche garde son contenu et ses cartes',
      rangee.length === 1 && rangee[0].matiere === 'histoire'
        && rangee[0].contenu && rangee[0].contenu.points.length === 3 && rangee[0].cartes.length === 4,
      JSON.stringify(rangee).slice(0, 160));

    // le résumé de cette fiche est celui qui a été lu, sans génération
    await page.evaluate(() => { document.querySelectorAll('.vue').forEach((v) => { v.hidden = v.id !== 'vue-resume'; }); });
    await page.click('#bouton-generer'); await page.waitForTimeout(400);
    verifier('la fiche de résumé affiche le contenu lu',
      /Bastille/.test(await page.innerText('#fiche-resume')), (await page.innerText('#fiche-resume')).slice(0, 120));

    verifier('aucune erreur console', erreurs.length === 0, erreurs.join(' || '));
    await ctx.close();
  }

  /* — 2. Photo illisible : on le dit, on ne fabrique rien — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(FAUX('illisible'));
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/index.html');
    await page.click('text=Lycéen'); await page.waitForTimeout(400);
    await page.click('#ouvrir-creation'); await page.click('[data-creation="scan"]'); await page.waitForTimeout(300);
    await page.setInputFiles('#scan-galerie', '/tmp/page-cours.png'); await page.waitForTimeout(300);
    await page.click('#scan-analyser'); await page.waitForTimeout(1000);
    verifier('une photo illisible est annoncée', /trop floue/.test(await page.innerText('#scan-message')),
      await page.innerText('#scan-message'));
    verifier('aucune fiche inventée',
      (await page.evaluate(() => (localStorage.getItem('mathematique.fiches') || '[]'))) === '[]',
      await page.evaluate(() => localStorage.getItem('mathematique.fiches')));
    await ctx.close();
  }

  /* — 3. Pas d'envoi d'images possible : chemin manuel — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(FAUX('sans-images'));
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/index.html');
    await page.click('text=Lycéen'); await page.waitForTimeout(400);
    await page.click('#ouvrir-creation'); await page.click('[data-creation="scan"]'); await page.waitForTimeout(300);
    verifier('le repli manuel est annoncé', /ne peut pas lui envoyer de photos/.test(await page.innerText('#scan-moteur')),
      await page.innerText('#scan-moteur'));
    await page.setInputFiles('#scan-galerie', '/tmp/page-cours.png'); await page.waitForTimeout(300);
    verifier('le bouton propose de continuer', /Continuer sans lecture/.test(await page.innerText('#scan-analyser')),
      await page.innerText('#scan-analyser'));
    verifier('la raison est rappelée au-dessus du bouton',
      /ne peut pas lui envoyer de photos/.test(await page.innerText('#scan-raison')),
      await page.innerText('#scan-raison'));
    await page.click('#scan-analyser'); await page.waitForTimeout(500);
    verifier('le thème est demandé à la main', await page.isVisible('#scan-sujet'), 'champ absent');
    verifier('aucune fiche lue affichée', !(await page.isVisible('#scan-fiche-lue')), 'aperçu visible');
    await ctx.close();
  }

  /* — 4. Claude absent (lecteur déconnecté) : on dit quoi faire — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(FAUX('absent'));
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/index.html');
    await page.click('text=Lycéen'); await page.waitForTimeout(400);
    await page.click('#ouvrir-creation'); await page.click('[data-creation="scan"]'); await page.waitForTimeout(400);
    verifier('déconnecté : le message renvoie à la connexion',
      /connecte-toi à claude\.ai/i.test(await page.innerText('#scan-moteur')), await page.innerText('#scan-moteur'));
    await page.setInputFiles('#scan-galerie', '/tmp/page-cours.png'); await page.waitForTimeout(300);
    verifier('déconnecté : la raison est sous les yeux',
      /connecte-toi à claude\.ai/i.test(await page.innerText('#scan-raison')), await page.innerText('#scan-raison'));
    await ctx.close();
  }

  await nav.close();
  if (echecs) { console.log(`\n${echecs} vérification(s) en échec.`); process.exit(1); }
  console.log('\nLecture photo : tout est conforme.');
})();
