/* Le compte vu du navigateur : la fusion de deux appareils, et la porte qui
   ne s'affiche que si elle ouvre. Le serveur est simulé par interception des
   appels : rien ne sort, aucune base n'est nécessaire.
   Nécessite un serveur local sur le port 8321. Lancer : node tests/comptes-app.js */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

const ilYA = (jours) => new Date(Date.now() - jours * 86400000).toISOString();

function fiche(id, titre, revisee) {
  return {
    id, matiere: 'maths', titre, source: 'scan', banqueId: null,
    contenu: { lu: true, moteur: 'claude', accroche: '', sections: [], points: [], formules: [], exemples: [], pieges: [], texte: '' },
    cartes: [], maitrise: {}, creee: revisee, derniereRevision: revisee, palier: 0, progression: 0,
  };
}

/* Le serveur simulé : il tient une bibliothèque et une version, comme le vrai. */
function fauxServeur(etat) {
  return async (route) => {
    const adresse = route.request().url();
    const methode = route.request().method();
    const rendre = (code, corps) => route.fulfill({
      status: code, contentType: 'application/json; charset=utf-8', body: JSON.stringify(corps),
    });

    if (adresse.includes('/api/sante')) return rendre(200, { pret: false, lecture: false, comptes: etat.comptes !== false });
    if (adresse.includes('/api/compte-demander')) { etat.demandes.push(JSON.parse(route.request().postData() || '{}')); return rendre(200, { envoye: true }); }
    if (adresse.includes('/api/compte-sortir')) { etat.sorties = (etat.sorties || 0) + 1; return rendre(200, { sorti: true }); }
    if (adresse.includes('/api/bibliotheque') && methode === 'GET') {
      return rendre(200, { courriel: 'lea@exemple.fr', version: etat.version, donnees: etat.donnees });
    }
    if (adresse.includes('/api/bibliotheque') && methode === 'PUT') {
      const corps = JSON.parse(route.request().postData() || '{}');
      etat.envois.push(corps);
      if (etat.conflitUneFois) {
        etat.conflitUneFois = false;
        return rendre(409, { erreur: 'version_depassee', version: etat.version, donnees: etat.donnees });
      }
      if (corps.version !== etat.version) {
        return rendre(409, { erreur: 'version_depassee', version: etat.version, donnees: etat.donnees });
      }
      etat.donnees = corps.donnees;
      etat.version += 1;
      return rendre(200, { version: etat.version });
    }
    return rendre(404, { erreur: 'route_inconnue' });
  };
}

async function ouvrir(nav, { semence = '', etat, adresse = 'http://localhost:8321/app.html' } = {}) {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(`window.claude = { use: async () => null };
    window.MATHEMATIQUE_COMPTE = { api: '/api' };
    localStorage.setItem('mathematique.niveau', 'lyceen');
    ${semence}`);
  const page = await ctx.newPage();
  const soucis = [];
  page.on('pageerror', (e) => soucis.push(String(e)));
  if (etat) await page.route('**/api/**', fauxServeur(etat));
  await page.goto(adresse, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  return { ctx, page, soucis };
}

(async () => {
  const nav = await chromium.launch();

  /* — 1. La fusion, sans réseau : c'est la pièce qui peut perdre du travail — */
  {
    const { ctx, page } = await ouvrir(nav, {});
    const resultat = await page.evaluate(({ a, b }) => COMPTE.__fusionner(a, b), {
      a: {
        fiches: [fiche('f1', 'Suites (révisée ici)', ilYA(1)), fiche('f2', 'Seulement ici', ilYA(5))],
        journal: { '2026-10-10': 3, '2026-10-11': 1 },
        record: 12, prenom: 'Léa', niveau: 'lyceen',
        consommation: { mois: '2026-10', fiches: 4 },
        supprimees: [{ id: 'f9', le: ilYA(2) }],
      },
      b: {
        fiches: [fiche('f1', 'Suites (vieille copie)', ilYA(8)), fiche('f3', 'Seulement là-bas', ilYA(3)),
                 fiche('f9', 'Supprimée ici', ilYA(6))],
        journal: { '2026-10-10': 1, '2026-10-12': 2 },
        record: 20, prenom: '', niveau: '',
        consommation: { mois: '2026-10', fiches: 2 },
        supprimees: [],
      },
    });

    const titres = resultat.fiches.map((f) => f.titre).sort();
    verifier('aucune fiche n\'est perdue à la fusion',
      resultat.fiches.length === 3 && titres.includes('Seulement ici') && titres.includes('Seulement là-bas'),
      titres.join(' | '));
    verifier('à même identifiant, la révision la plus récente gagne',
      resultat.fiches.find((f) => f.id === 'f1').titre === 'Suites (révisée ici)',
      resultat.fiches.find((f) => f.id === 'f1').titre);
    verifier('une fiche supprimée ne revient pas de l\'autre appareil',
      !resultat.fiches.some((f) => f.id === 'f9'), titres.join(' | '));
    verifier('les jours révisés s\'additionnent au mieux',
      resultat.journal['2026-10-10'] === 3 && resultat.journal['2026-10-11'] === 1
      && resultat.journal['2026-10-12'] === 2, JSON.stringify(resultat.journal));
    verifier('le record garde le meilleur des deux', resultat.record === 20, resultat.record);
    verifier('les crédits dépensés prennent le plus haut',
      resultat.consommation.fiches === 4, JSON.stringify(resultat.consommation));
    verifier('le prénom connu l\'emporte sur le vide', resultat.prenom === 'Léa', resultat.prenom);

    /* Une fiche révisée APRÈS sa suppression ailleurs doit survivre : c'est
       la dernière volonté de l'élève qui compte. */
    const apres = await page.evaluate(({ a, b }) => COMPTE.__fusionner(a, b), {
      a: { fiches: [], supprimees: [{ id: 'f5', le: ilYA(4) }] },
      b: { fiches: [fiche('f5', 'Reprise depuis', ilYA(1))], supprimees: [] },
    });
    verifier('une fiche révisée après sa suppression est gardée',
      apres.fiches.length === 1, JSON.stringify(apres.fiches.map((f) => f.id)));
    await ctx.close();
  }

  /* — 2. Sans comptes sur le serveur, aucune porte ne s'affiche — */
  {
    const etat = { comptes: false, version: 0, donnees: {}, envois: [], demandes: [] };
    const { ctx, page } = await ouvrir(nav, { etat });
    await page.evaluate(() => { document.querySelectorAll('.vue').forEach((v) => { v.hidden = v.id !== 'vue-profil'; }); });
    await page.waitForTimeout(400);
    verifier('comptes éteints : le bloc « mon accès » reste absent',
      !(await page.isVisible('#profil-compte')), 'bloc affiché');
    await ctx.close();
  }

  /* — 3. Comptes allumés : la porte s'ouvre, et la demande part — */
  {
    const etat = { version: 0, donnees: {}, envois: [], demandes: [] };
    const { ctx, page } = await ouvrir(nav, { etat });
    await page.evaluate(() => { document.querySelectorAll('.vue').forEach((v) => { v.hidden = v.id !== 'vue-profil'; }); });
    await page.waitForTimeout(400);
    verifier('comptes allumés : le bloc s\'affiche', await page.isVisible('#profil-compte'), 'bloc absent');

    await page.fill('#compte-courriel', 'lea@exemple.fr');
    await page.click('#compte-envoyer');
    await page.waitForTimeout(400);
    verifier('la demande de lien part avec l\'adresse',
      etat.demandes.length === 1 && etat.demandes[0].courriel === 'lea@exemple.fr',
      JSON.stringify(etat.demandes));
    verifier('et l\'élève est renvoyé à sa boîte mail',
      /boîte/i.test(await page.innerText('#compte-message')), await page.innerText('#compte-message'));
    await ctx.close();
  }

  /* — 4. Le lien ramène, et les deux bibliothèques se recollent — */
  {
    const etat = {
      version: 7,
      donnees: { fiches: [fiche('distant', 'Faite sur l\'ordinateur', ilYA(2))], journal: {}, supprimees: [] },
      envois: [], demandes: [],
    };
    const semence = `localStorage.setItem('mathematique.fiches', ${JSON.stringify(JSON.stringify([
      { id: 'local', matiere: 'histoire', titre: 'Faite sur le téléphone', source: 'scan', banqueId: null,
        contenu: { lu: true, moteur: 'claude', accroche: '', sections: [], points: [], formules: [], exemples: [], pieges: [], texte: '' },
        cartes: [], maitrise: {}, creee: ilYA(3), derniereRevision: ilYA(3), palier: 0, progression: 0 },
    ]))});`;
    const { ctx, page, soucis } = await ouvrir(nav, {
      semence, etat, adresse: 'http://localhost:8321/app.html?acces=jeton-de-test',
    });

    verifier('aucune erreur de page pendant l\'entrée', soucis.length === 0, soucis.join(' | '));
    verifier('la session est rangée sur l\'appareil',
      (await page.evaluate(() => localStorage.getItem('mathematique.session'))) === 'jeton-de-test',
      await page.evaluate(() => localStorage.getItem('mathematique.session')));
    verifier('l\'adresse est nettoyée du jeton',
      !(await page.evaluate(() => window.location.search)).includes('acces'),
      await page.evaluate(() => window.location.search));

    const locales = await page.evaluate(() => JSON.parse(localStorage.getItem('mathematique.fiches')).map((f) => f.id));
    verifier('les fiches des deux appareils sont réunies sur celui-ci',
      locales.includes('local') && locales.includes('distant'), locales.join(','));

    const dernier = etat.envois[etat.envois.length - 1] || {};
    verifier('et renvoyées au serveur, avec la version lue',
      dernier.version === 7 && dernier.donnees.fiches.length === 2,
      JSON.stringify({ version: dernier.version, fiches: (dernier.donnees || {}).fiches ? dernier.donnees.fiches.length : 0 }));
    verifier('le serveur garde désormais les deux',
      etat.donnees.fiches.length === 2 && etat.version === 8, `${etat.version} / ${etat.donnees.fiches.length}`);

    /* La fiche venue du serveur doit être comptée sans recharger la page :
       la bibliothèque range par matière, et celle de l'ordinateur est en
       maths quand celle du téléphone est en histoire. */
    await page.evaluate(() => { document.querySelectorAll('.vue').forEach((v) => { v.hidden = v.id !== 'vue-cours'; }); });
    await page.waitForTimeout(300);
    const rangees = await page.innerText('#vue-cours');
    verifier('la fiche de l\'autre appareil est rangée sans recharger',
      /2 fiches/.test(rangees) && /Mathématiques/.test(rangees) && /Histoire/.test(rangees),
      rangees.replace(/\n+/g, ' · ').slice(0, 140));
    await ctx.close();
  }

  /* — 5. Un autre appareil a écrit entre-temps : on refusionne, sans perdre — */
  {
    const etat = {
      version: 3, conflitUneFois: true,
      donnees: { fiches: [fiche('ailleurs', 'Écrite pendant ce temps', ilYA(1))], journal: {}, supprimees: [] },
      envois: [], demandes: [],
    };
    const semence = `localStorage.setItem('mathematique.fiches', ${JSON.stringify(JSON.stringify([
      { id: 'ici', matiere: 'maths', titre: 'La mienne', source: 'scan', banqueId: null,
        contenu: { lu: true, moteur: 'claude', accroche: '', sections: [], points: [], formules: [], exemples: [], pieges: [], texte: '' },
        cartes: [], maitrise: {}, creee: ilYA(2), derniereRevision: ilYA(2), palier: 0, progression: 0 },
    ]))});`;
    const { ctx, page } = await ouvrir(nav, {
      semence, etat, adresse: 'http://localhost:8321/app.html?acces=jeton-de-test',
    });
    await page.waitForTimeout(600);
    verifier('un conflit déclenche un second essai', etat.envois.length >= 2, `${etat.envois.length} envois`);
    verifier('et rien n\'est perdu au passage',
      etat.donnees.fiches.length === 2, JSON.stringify(etat.donnees.fiches.map((f) => f.id)));
    await ctx.close();
  }

  /* — 6. Se déconnecter laisse les fiches sur l'appareil — */
  {
    const etat = { version: 0, donnees: { fiches: [], journal: {}, supprimees: [] }, envois: [], demandes: [] };
    const { ctx, page } = await ouvrir(nav, {
      etat, adresse: 'http://localhost:8321/app.html?acces=jeton-de-test',
    });
    await page.evaluate(() => { document.querySelectorAll('.vue').forEach((v) => { v.hidden = v.id !== 'vue-profil'; }); });
    await page.waitForTimeout(300);
    await page.click('#compte-sortir');
    await page.waitForTimeout(400);
    verifier('la déconnexion est annoncée au serveur', etat.sorties === 1, `${etat.sorties}`);
    verifier('la session est oubliée',
      !(await page.evaluate(() => localStorage.getItem('mathematique.session'))), 'session encore là');
    verifier('le formulaire revient', await page.isVisible('#compte-dehors'), 'formulaire absent');
    await ctx.close();
  }

  await nav.close();
  console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est vert.');
  process.exit(echecs ? 1 : 0);
})();
