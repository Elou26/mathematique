/* Éprouve la version gratuite et le passage à l'illimité, côté app :
   le compteur de fiches, le mur de paiement, le retour de Stripe et la
   licence retrouvée. Le serveur de paiement est simulé sur un port local.
   Nécessite un serveur local sur le port 8321. Lancer : node tests/abonnement.js */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http');

const hier = new Date(Date.now() - 86400000).toISOString();
const fiche = (n) => ({
  id: `f${n}`, matiere: 'histoire', titre: `Chapitre ${n}`, source: 'scan', banqueId: null,
  contenu: null, cartes: null, creee: hier, derniereRevision: hier, palier: 0, progression: 30,
});

let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

/* ————— Faux serveur de paiement ————————————————————————————————
   Il répond comme serveur/index.js, sans Stripe : on éprouve ici ce que
   fait la page, pas ce que fait Stripe (voir tests/serveur-paiement.js). */
const recu = { paiements: [], licences: [] };
const faux = http.createServer((requete, reponse) => {
  const adresse = new URL(requete.url, 'http://localhost');
  const entetes = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  };
  if (requete.method === 'OPTIONS') { reponse.writeHead(204, entetes); reponse.end(); return; }

  if (adresse.pathname === '/paiement') {
    const morceaux = [];
    requete.on('data', (m) => morceaux.push(m));
    requete.on('end', () => {
      recu.paiements.push(JSON.parse(Buffer.concat(morceaux).toString('utf8') || '{}'));
      reponse.writeHead(200, entetes);
      reponse.end(JSON.stringify({ url: 'http://localhost:8321/index.html?faux-stripe=1' }));
    });
    return;
  }

  if (adresse.pathname === '/licence') {
    const session = adresse.searchParams.get('session');
    const cle = adresse.searchParams.get('cle');
    recu.licences.push({ session, cle });
    const actif = session === 'cs_payee' || cle === 'cus_bon';
    reponse.writeHead(200, entetes);
    reponse.end(JSON.stringify(actif
      ? { actif: true, cle: 'cus_bon', expire: Date.now() + 30 * 86400000 }
      : { actif: false }));
    return;
  }

  reponse.writeHead(404, entetes);
  reponse.end('{}');
});

function semence(fiches, paiement) {
  return `
    localStorage.setItem('mathematique.niveau', 'lyceen');
    localStorage.setItem('mathematique.fiches', ${JSON.stringify(JSON.stringify(fiches))});
    ${paiement ? `window.MATHEMATIQUE_PAIEMENT = ${JSON.stringify(paiement)};` : ''}
    window.claude = { use: async () => null };`;
}

(async () => {
  await new Promise((r) => faux.listen(0, r));
  const api = `http://127.0.0.1:${faux.address().port}`;
  const nav = await chromium.launch();

  /* — 0. Sans paiement branché, rien n'est limité : pas de mur sans porte — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(semence([fiche(1), fiche(2), fiche(3), fiche(4)], null));
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.goto('http://localhost:8321/index.html'); await page.waitForTimeout(500);

    await page.click('#ouvrir-creation'); await page.waitForTimeout(300);
    verifier('sans serveur de paiement, la création reste libre',
      (await page.isVisible('#feuille-creation')) && !(await page.isVisible('#vue-abonnement')),
      'un mur est apparu alors qu\'on ne peut pas payer');
    await page.click('#fermer-creation'); await page.waitForTimeout(200);

    await page.click('.barre-bas [data-onglet="profil"]'); await page.waitForTimeout(250);
    const plan = await page.innerText('#profil-abonnement');
    verifier('le profil dit que rien n\'est limité',
      /rien n'est limité/.test(plan), plan.replace(/\n+/g, ' / '));

    // L'offre reste visible, mais ne promet rien de faux.
    await page.click('[data-offre="payer"]'); await page.waitForTimeout(400);
    verifier('la page de tarif reste consultable',
      await page.isVisible('#vue-abonnement'), 'page de tarif inatteignable');
    verifier('le tarif y est affiché',
      /9,90 €/.test(await page.innerText('.tarif-prix')), await page.innerText('.tarif-prix'));
    verifier('elle annonce l\'offre comme à venir',
      /Offre en préparation/.test(await page.innerText('#illimite-note')),
      await page.innerText('#illimite-note'));
    verifier('et le paiement est annoncé indisponible',
      (await page.isDisabled('#illimite-payer'))
      && /Rien ne t'est débité/.test(await page.innerText('#illimite-mention')),
      await page.innerText('#illimite-mention'));
    verifier('aucun abonnement n\'est accordé pour autant',
      (await page.evaluate(() => localStorage.getItem('mathematique.abonnement'))) === null,
      await page.evaluate(() => localStorage.getItem('mathematique.abonnement')));
    await page.click('#illimite-retour'); await page.waitForTimeout(250);
    verifier('aucune erreur console', erreurs.length === 0, erreurs.join(' || '));
    await ctx.close();
  }

  /* — 1. Avec une offre, la gratuité s'arrête là où c'est annoncé — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(semence([fiche(1), fiche(2)], { api }));
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.goto('http://localhost:8321/index.html'); await page.waitForTimeout(500);

    await page.click('#ouvrir-creation'); await page.waitForTimeout(300);
    verifier('sous le quota, la création s\'ouvre normalement',
      await page.isVisible('#feuille-creation'), 'feuille de création masquée');
    await page.click('#fermer-creation'); await page.waitForTimeout(200);

    await page.click('.barre-bas [data-onglet="profil"]'); await page.waitForTimeout(250);
    verifier('le profil dit où en est le quota',
      /2 fiches sur 3/.test(await page.innerText('#profil-abonnement')),
      await page.innerText('#profil-abonnement'));
    verifier('aucune erreur console', erreurs.length === 0, erreurs.join(' || '));
    await ctx.close();
  }

  /* — 2. Au bout du quota, le mur s'ouvre avant la photo — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(semence([fiche(1), fiche(2), fiche(3)], { api }));
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/index.html'); await page.waitForTimeout(500);

    await page.click('#ouvrir-creation'); await page.waitForTimeout(300);
    verifier('la page de tarif s\'ouvre au lieu de la création',
      (await page.isVisible('#vue-abonnement')) && !(await page.isVisible('#feuille-creation')),
      'vue inattendue');
    verifier('elle annonce le tarif',
      /9,90 €/.test(await page.innerText('.tarif-prix'))
      && /par mois/.test(await page.innerText('.tarif-prix')),
      await page.innerText('.tarif-prix'));
    verifier('elle dit ce que l\'illimité débloque',
      /Fiches sans limite/.test(await page.innerText('.offre')),
      await page.innerText('.offre').then((t) => t.slice(0, 80)));
    verifier('le comparatif reprend la limite gratuite',
      (await page.innerText('#comparatif-gratuit')) === '3',
      await page.innerText('#comparatif-gratuit'));
    verifier('le mur dit pourquoi',
      /3 fiches gratuites sont utilisées/.test(await page.innerText('#illimite-raison')),
      await page.innerText('#illimite-raison'));
    verifier('aucun abonnement n\'est inventé',
      (await page.evaluate(() => localStorage.getItem('mathematique.abonnement'))) === null,
      await page.evaluate(() => localStorage.getItem('mathematique.abonnement')));

    // Et la porte tient : impossible d'ajouter une fiche en douce.
    await page.click('#illimite-retour'); await page.waitForTimeout(250);
    verifier('le retour ramène d\'où l\'on vient',
      await page.isVisible('#vue-accueil'), 'accueil masqué');
    const restantes = await page.evaluate(
      () => JSON.parse(localStorage.getItem('mathematique.fiches')).length);
    verifier('la bibliothèque reste à trois fiches', restantes === 3, restantes);
    await ctx.close();
  }

  /* — 3. Payer : la page passe par le serveur, jamais par une clé secrète — */
  {
    recu.paiements.length = 0;
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(semence([fiche(1), fiche(2), fiche(3)], { api }));
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/index.html'); await page.waitForTimeout(500);
    await page.click('#ouvrir-creation'); await page.waitForTimeout(300);

    verifier('avec un serveur, le paiement est proposé',
      !(await page.isDisabled('#illimite-payer'))
      && /Payer avec Stripe/.test(await page.innerText('#illimite-payer')),
      await page.innerText('#illimite-payer'));

    await page.click('#illimite-payer'); await page.waitForTimeout(900);
    verifier('la page demande la session au serveur', recu.paiements.length === 1,
      JSON.stringify(recu.paiements));
    verifier('elle transmet l\'appareil et l\'adresse de retour',
      recu.paiements[0] && /^a/.test(recu.paiements[0].appareil)
      && /localhost:8321/.test(recu.paiements[0].retour),
      JSON.stringify(recu.paiements[0]));

    const source = await page.content();
    verifier('aucune clé Stripe ne traîne dans la page',
      !/sk_(test|live)_/.test(source), 'clé secrète trouvée dans la page');
    await ctx.close();
  }

  /* — 4. Retour de Stripe : l'abonnement est confirmé par le serveur — */
  {
    recu.licences.length = 0;
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(semence([fiche(1), fiche(2), fiche(3)], { api }));
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/index.html?paiement=ok&session=cs_payee');
    await page.waitForTimeout(1200);

    verifier('la session est vérifiée auprès du serveur',
      recu.licences.some((l) => l.session === 'cs_payee'), JSON.stringify(recu.licences));
    verifier('l\'adresse est nettoyée',
      !/paiement=ok/.test(page.url()), page.url());

    await page.click('.barre-bas [data-onglet="profil"]'); await page.waitForTimeout(300);
    const profil = await page.innerText('#profil-abonnement');
    verifier('le profil passe à « Illimité »', /illimité/i.test(profil), profil.replace(/\n+/g, ' / '));
    verifier('la clé est donnée pour un autre appareil',
      (await page.inputValue('#profil-licence')) === 'cus_bon', await page.inputValue('#profil-licence'));

    await page.click('.barre-bas [data-onglet="accueil"]'); await page.waitForTimeout(200);
    await page.click('#ouvrir-creation'); await page.waitForTimeout(300);
    verifier('la création n\'est plus bloquée',
      await page.isVisible('#feuille-creation'), 'mur encore là');
    await ctx.close();
  }

  /* — 5. Une session non payée ne déverrouille rien — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(semence([fiche(1), fiche(2), fiche(3)], { api }));
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/index.html?paiement=ok&session=cs_abandonnee');
    await page.waitForTimeout(1200);
    await page.click('#ouvrir-creation'); await page.waitForTimeout(300);
    verifier('une session non payée laisse le mur en place',
      await page.isVisible('#vue-abonnement'), 'création ouverte à tort');
    await ctx.close();
  }

  /* — 6. Retrouver son abonnement sur un autre téléphone — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(semence([fiche(1), fiche(2), fiche(3)], { api }));
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/index.html'); await page.waitForTimeout(500);
    await page.click('#ouvrir-creation'); await page.waitForTimeout(300);
    await page.click('#illimite-restaurer'); await page.waitForTimeout(200);

    await page.fill('#licence-cle', 'cus_faux');
    await page.click('#licence-valider'); await page.waitForTimeout(700);
    verifier('une clé inconnue est refusée',
      /Aucun abonnement actif/.test(await page.innerText('#illimite-message')),
      await page.innerText('#illimite-message'));

    await page.fill('#licence-cle', 'cus_bon');
    await page.click('#licence-valider'); await page.waitForTimeout(800);
    verifier('la bonne clé rend l\'illimité',
      !(await page.isVisible('#vue-abonnement')), 'mur encore ouvert');
    await page.click('.barre-bas [data-onglet="profil"]'); await page.waitForTimeout(300);
    verifier('le profil le confirme',
      /illimité/i.test(await page.innerText('#profil-abonnement')),
      await page.innerText('#profil-abonnement'));
    await ctx.close();
  }

  await nav.close();
  faux.close();
  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nTout est vert.');
  process.exit(echecs ? 1 : 0);
})();
