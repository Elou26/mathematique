/* Vérifie la boucle d'apprentissage : ce qui est dû passe devant, une révision
   réussie espace la suivante, les erreurs se reprennent seules, et une carte
   ratée revient dans la séance.
   Nécessite un serveur local sur le port 8321. Lancer : node tests/apprentissage.js */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

(async () => {
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(`window.claude = { use: async () => null };`);   // moteur local
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });

  await page.goto('http://localhost:8321/index.html');
  await page.click('text=Lycéen'); await page.waitForTimeout(300);

  // Une fiche oubliée depuis 9 jours, une revue hier, et trois jours de série.
  await page.evaluate(() => {
    const jours = (n) => new Date(Date.now() - n * 86400000).toISOString();
    localStorage.setItem('mathematique.fiches', JSON.stringify([
      { id: 'f1', matiere: 'maths', titre: 'Dérivées et taux de variation', source: 'scan',
        banqueId: 'derivees', creee: jours(20), derniereRevision: jours(9), palier: 2, progression: 40 },
      { id: 'f2', matiere: 'histoire', titre: 'La guerre froide (1947-1991)', source: 'ia',
        banqueId: 'guerrefroide', creee: jours(20), derniereRevision: jours(1), palier: 0, progression: 70 },
    ]));
    const cle = (n) => { const d = new Date(Date.now() - n * 86400000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    localStorage.setItem('mathematique.journal', JSON.stringify({ [cle(1)]: 2, [cle(2)]: 1, [cle(3)]: 4 }));
  });
  await page.reload(); await page.waitForTimeout(600);

  // 1. L'accueil ouvre sur ce qui est dû.
  const bloc = await page.innerText('#bloc-aujourdhui');
  verifier('l\'accueil ouvre sur les révisions dues', /À revoir aujourd'hui/.test(bloc), bloc.split('\n')[0]);
  verifier('les deux fiches dues sont comptées',
    (await page.innerText('.aujourdhui-compte')) === '2', await page.innerText('.aujourdhui-compte'));
  // palier 2 → J+7 ; revue il y a 9 jours → deux jours de retard
  verifier('le retard est dit', /en retard de 2 jours/.test(bloc), bloc.replace(/\n+/g, ' / '));
  verifier('la plus en retard passe devant',
    (await page.$$eval('[data-revoir]', (n) => n.map((b) => b.dataset.revoir)))[0] === 'f1',
    (await page.$$eval('[data-revoir]', (n) => n.map((b) => b.dataset.revoir))).join(','));
  verifier('la série est réelle', /3 jours d'affilée/.test(bloc), bloc.replace(/\n+/g, ' / '));

  // 2. Réviser depuis l'accueil lance le quiz de cette fiche.
  await page.click('[data-revoir="f1"]'); await page.waitForTimeout(1800);
  verifier('réviser lance le quiz', await page.isVisible('#jeu-quiz'), 'quiz absent');

  for (let i = 0; i < 5; i++) {
    await page.click('#quiz-reponses button'); await page.waitForTimeout(280);
    if (await page.isVisible('#quiz-suivant')) { await page.click('#quiz-suivant'); await page.waitForTimeout(280); }
  }
  const pourcentage = Number((await page.innerText('#bilan-quiz')).match(/(\d+) % de bonnes/)[1]);

  // 3. Le palier suit le résultat : réussi il monte, raté il retombe à zéro.
  const f1 = await page.evaluate(() => JSON.parse(localStorage.getItem('mathematique.fiches'))[0]);
  const attendu = pourcentage >= 60 ? 3 : pourcentage < 40 ? 0 : 2;
  verifier(`le palier suit le score (${pourcentage} %)`, f1.palier === attendu,
    `palier ${f1.palier}, attendu ${attendu}`);
  verifier('la révision du jour est notée',
    (await page.evaluate(() => JSON.parse(localStorage.getItem('mathematique.journal')))) [
      (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })()
    ] === 1, 'journal du jour');

  // 4. Les erreurs se reprennent seules.
  const erreursBouton = await page.$('[data-quiz="erreurs"]');
  if (pourcentage < 100) {
    verifier('le bilan propose de reprendre les erreurs', Boolean(erreursBouton), 'bouton absent');
    if (erreursBouton) {
      await erreursBouton.click(); await page.waitForTimeout(600);
      verifier('la reprise ne rejoue que les erreurs',
        /Reprise de tes \d+ erreur/.test(await page.innerText('#quiz-contexte')),
        await page.innerText('#quiz-contexte'));
    }
  } else {
    verifier('sans erreur, pas de bouton de reprise', !erreursBouton, 'bouton présent');
  }

  // 5. L'accueil reflète la révision qui vient d'être faite.
  await page.click('.barre-bas [data-onglet="accueil"]'); await page.waitForTimeout(500);
  const apres = await page.innerText('#bloc-aujourdhui');
  verifier('le compte du jour a avancé', /1 révision aujourd'hui/.test(apres), apres.replace(/\n+/g, ' / '));
  verifier('la série a grandi', /4 jours d'affilée/.test(apres), apres.replace(/\n+/g, ' / '));

  // 6. Les cartes : trois niveaux, et une carte ratée revient dans la séance.
  await page.evaluate(() => { document.querySelectorAll('.vue').forEach((v) => { v.hidden = v.id !== 'vue-flashcards'; }); });
  await page.click('#bouton-cartes'); await page.waitForTimeout(1200);
  const verdicts = await page.$$eval('[data-verdict]', (n) => n.map((b) => b.dataset.verdict));
  verifier('trois niveaux d\'auto-évaluation', verdicts.join(',') === 'revoir,presque,su', verdicts.join(','));

  const restantes = async () => Number((await page.innerText('#cartes-position')).match(/\d+/)[0]);
  await page.click('#carte-flip'); await page.waitForTimeout(350);
  const avant = await restantes();
  await page.click('[data-verdict="revoir"]'); await page.waitForTimeout(350);
  verifier('une carte ratée revient dans la séance', (await restantes()) === avant,
    `${avant} → ${await restantes()}`);
  await page.click('#carte-flip'); await page.waitForTimeout(350);
  await page.click('[data-verdict="su"]'); await page.waitForTimeout(350);
  verifier('une carte sue sort du paquet', (await restantes()) === avant - 1,
    `${avant} → ${await restantes()}`);

  verifier('aucune erreur console', erreurs.length === 0, erreurs.join(' || '));
  await nav.close();
  if (echecs) { console.log(`\n${echecs} vérification(s) en échec.`); process.exit(1); }
  console.log('\nBoucle d\'apprentissage : tout est conforme.');
})();
