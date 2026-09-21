/* Vérifie que les catégories démarrent vides, qu'elles proposent de créer une
   fiche, et que la fiche créée irrigue la file de révision, le profil et les
   trois outils.
   Nécessite un serveur local sur le port 8321. Lancer : node tests/bibliotheque.js */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

(async () => {
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });

  const ouvrir = async (i) => {
    if (await page.$('.dossier--ouvert')) {
      await page.click('.dossier--ouvert .dossier-tete');
      await page.waitForTimeout(200);
    }
    await page.locator('.dossier-tete').nth(i).click();
    await page.waitForTimeout(250);
  };

  await page.goto('http://localhost:8321/index.html');
  await page.click('text=Lycéen');
  await page.waitForTimeout(300);

  // 1. Les catégories existent, toutes vides.
  await page.click('.barre-bas [data-onglet="cours"]');
  await page.waitForTimeout(300);
  const tetes = await page.$$eval('.dossier-tete', (n) => n.map((b) => b.innerText.replace(/\n/g, ' · ')));
  verifier('une catégorie par matière du profil', tetes.length >= 6, tetes.length);
  verifier('aucun cours livré d\'avance', tetes.every((t) => / 0 fiche · 0 %$/.test(t)), tetes.join(' | '));

  // 2. Ouvrir une catégorie propose d'y créer une fiche.
  await ouvrir(3);
  const panneau = await page.innerText('.dossier--ouvert .dossier-contenu');
  verifier('la catégorie vide propose la création',
    /Aucune fiche en Histoire-Géo/.test(panneau) && /Créer une fiche de révision/.test(panneau), panneau.replace(/\n+/g, ' / '));

  await page.click('.dossier--ouvert .dossier-contenu .bouton-principal');
  await page.waitForTimeout(300);
  verifier('la feuille porte la matière', (await page.innerText('#feuille-titre')) === 'Créer une fiche · Histoire-Géo',
    await page.innerText('#feuille-titre'));

  const tuiles = await page.$$eval('[data-creation]', (n) => n.map((b) => b.dataset.creation));
  verifier('la feuille ne garde que la fiche et la rédaction',
    tuiles.join(',') === 'scan,texte', tuiles.join(','));

  await page.click('[data-creation="scan"]');
  await page.waitForTimeout(300);
  verifier('le scan hérite de la matière', /Histoire-Géo/.test(await page.innerText('#scan-sous-texte')),
    await page.innerText('#scan-sous-texte'));

  // 3. La file de révision et le profil sont vides tant qu'aucune fiche n'existe.
  await page.click('.cloche');
  await page.waitForTimeout(300);
  verifier('file de révision vide', /Rien à revoir pour l'instant/.test(await page.innerText('#liste-echeances')),
    (await page.innerText('#liste-echeances')).slice(0, 60));

  // 4. Un quiz sur sujet libre peut être rangé dans une catégorie.
  await page.evaluate(() => { document.querySelectorAll('.vue').forEach((v) => { v.hidden = v.id !== 'vue-quiz'; }); });
  verifier('le quiz signale la bibliothèque vide',
    /Aucune fiche à réviser/.test(await page.innerText('#choix-cours-quiz')), await page.innerText('#choix-cours-quiz'));

  await page.click('[data-quiz-source="sujet"]');
  await page.fill('#quiz-sujet', 'la guerre froide');
  await page.click('#bouton-quiz');
  await page.waitForTimeout(1600);
  for (let i = 0; i < 5; i++) {
    await page.click('#quiz-reponses button');
    await page.waitForTimeout(300);
    if (await page.isVisible('#quiz-suivant')) { await page.click('#quiz-suivant'); await page.waitForTimeout(300); }
  }
  const garder = await page.$('[data-quiz="garder"]');
  verifier('le bilan propose de garder le sujet', Boolean(garder), 'bouton absent');
  if (garder) { await garder.click(); await page.waitForTimeout(500); }

  // 4 bis. La fiche se nomme comme un chapitre avant d'être rangée.
  verifier('la feuille de nommage s\'ouvre', await page.isVisible('#feuille-nom'), 'feuille absente');
  verifier('le titre proposé est mis en chapitre',
    (await page.inputValue('#nom-champ')) === 'La guerre froide', await page.inputValue('#nom-champ'));
  const matieresNom = await page.$$eval('#nom-matieres .puce--active', (n) => n.map((b) => b.innerText));
  verifier('la matière devinée est pré-sélectionnée', /Histoire/.test(matieresNom.join('')), matieresNom.join(' | '));
  verifier('des chapitres du programme sont proposés',
    (await page.$$('#nom-suggestions .puce')).length > 0, '0 suggestion');
  await page.fill('#nom-champ', 'La guerre froide (1947-1991)');
  await page.click('#nom-valider');
  await page.waitForTimeout(500);
  verifier('la feuille se referme', !(await page.isVisible('#feuille-nom')), 'feuille encore ouverte');

  const rangee = await page.evaluate(() => JSON.parse(localStorage.getItem('mathematique.fiches') || '[]'));
  verifier('la fiche est rangée sous le nom choisi et dans la bonne matière',
    rangee.length === 1 && rangee[0].matiere === 'histoire' && rangee[0].titre === 'La guerre froide (1947-1991)',
    JSON.stringify(rangee));

  // 5. La fiche irrigue les catégories, la file et le profil.
  await page.click('.barre-bas [data-onglet="cours"]');
  await page.waitForTimeout(300);
  await ouvrir(3);
  const rempli = await page.innerText('.dossier--ouvert .dossier-contenu');
  verifier('la fiche apparaît dans sa catégorie',
    /La guerre froide \(1947-1991\)/.test(rempli) && /Réviser maintenant/.test(rempli), rempli.replace(/\n+/g, ' / '));

  await page.click('.cloche');
  await page.waitForTimeout(300);
  verifier('la file reprend la fiche', /La guerre froide/.test(await page.innerText('#liste-echeances')),
    (await page.innerText('#liste-echeances')).replace(/\n+/g, ' / '));

  await page.click('.barre-bas [data-onglet="profil"]');
  await page.waitForTimeout(250);
  verifier('le profil compte la fiche', /1\nfiches créées/.test(await page.innerText('.stats')),
    (await page.innerText('.stats')).replace(/\n+/g, ' · '));

  // 6. Les trois outils voient la fiche.
  await page.evaluate(() => { document.querySelectorAll('.vue').forEach((v) => { v.hidden = v.id !== 'vue-resume'; }); });
  verifier('le résumé propose la fiche', /La guerre froide/.test(await page.innerText('#choix-cours')),
    await page.innerText('#choix-cours'));
  await page.evaluate(() => { document.querySelectorAll('.vue').forEach((v) => { v.hidden = v.id !== 'vue-flashcards'; }); });
  await page.click('#bouton-cartes');
  await page.waitForTimeout(1200);
  verifier('les cartes partent de la fiche', await page.isVisible('#jeu-cartes'), 'paquet non lancé');

  // 7. « Réviser maintenant » relance un quiz sur la fiche.
  await page.click('.barre-bas [data-onglet="cours"]');
  await page.waitForTimeout(300);
  await ouvrir(3);
  await page.click('.dossier--ouvert [data-fiche="reviser"]');
  await page.waitForTimeout(1800);
  verifier('réviser une fiche lance un quiz', (await page.innerText('#quiz-question')).length > 5,
    await page.innerText('#quiz-question'));

  verifier('aucune erreur console', erreurs.length === 0, erreurs.join(' || '));
  await nav.close();
  if (echecs) { console.log(`\n${echecs} vérification(s) en échec.`); process.exit(1); }
  console.log('\nBibliothèque : tout est conforme.');
})();
