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
const recu = { paiements: [], licences: [] , offresEnVente: ['essentiel', 'regulier', 'intensif']};
let offreRendue = 'essentiel';     // l'offre que le faux serveur dit avoir vendue
let expireRendu = null;            // l'échéance de la période, quand un cas l'impose
const faux = http.createServer((requete, reponse) => {
  const adresse = new URL(requete.url, 'http://localhost');
  const entetes = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  };
  if (requete.method === 'OPTIONS') { reponse.writeHead(204, entetes); reponse.end(); return; }

  if (adresse.pathname === '/sante') {
    reponse.writeHead(200, entetes);
    reponse.end(JSON.stringify({ pret: true, lecture: true, comptes: false, offres: recu.offresEnVente }));
    return;
  }

  if (adresse.pathname === '/paiement') {
    const morceaux = [];
    requete.on('data', (m) => morceaux.push(m));
    requete.on('end', () => {
      recu.paiements.push(JSON.parse(Buffer.concat(morceaux).toString('utf8') || '{}'));
      reponse.writeHead(200, entetes);
      reponse.end(JSON.stringify({ url: 'http://localhost:8321/app.html?faux-stripe=1' }));
    });
    return;
  }

  if (adresse.pathname === '/portail') {
    const morceaux = [];
    requete.on('data', (m) => morceaux.push(m));
    requete.on('end', () => {
      recu.portails = (recu.portails || []).concat(JSON.parse(Buffer.concat(morceaux).toString('utf8') || '{}'));
      reponse.writeHead(200, entetes);
      reponse.end(JSON.stringify({ url: 'http://localhost:8321/app.html?faux-portail=1' }));
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
      ? { actif: true, cle: 'cus_bon', offre: offreRendue,
          expire: expireRendu || Date.now() + 30 * 86400000 }
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
    window.MATHEMATIQUE_PAIEMENT = ${paiement ? JSON.stringify(paiement) : '{ api: "" }'};
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
    await page.goto('http://localhost:8321/app.html'); await page.waitForTimeout(500);

    /* L'accueil ouvre la photo directement : plus de feuille de choix. */
    await page.click('#ouvrir-creation'); await page.waitForTimeout(300);
    verifier('sans serveur de paiement, la création reste libre',
      (await page.isVisible('#vue-scan')) && !(await page.isVisible('#vue-abonnement')),
      'un mur est apparu alors qu\'on ne peut pas payer');
    await page.click('#vue-scan .retour'); await page.waitForTimeout(200);

    /* Le compteur reste visible, mais ne promet pas de solde : inventer
       300 crédits qui ne descendent jamais serait un faux compteur, et le
       masquer laissait l'élève sans repère sur ce que coûte une fiche. */
    verifier('le compteur reste visible sans paiement branché',
      await page.isVisible('#credits-solde'), 'compteur masqué');
    verifier('et affiche l\'absence de limite, pas un faux solde',
      (await page.innerText('#credits-nombre')).trim() === '∞'
      && /Aucune limite/.test(await page.getAttribute('#credits-solde', 'title')),
      `${await page.innerText('#credits-nombre')} · ${await page.getAttribute('#credits-solde', 'title')}`);

    await page.click('.barre-bas [data-onglet="profil"]'); await page.waitForTimeout(250);
    const plan = await page.innerText('#profil-abonnement');
    verifier('le profil dit que rien n\'est limité',
      /rien n'est limité/.test(plan), plan.replace(/\n+/g, ' / '));

    // L'offre reste visible, mais ne promet rien de faux.
    await page.click('[data-offre="payer"]'); await page.waitForTimeout(400);
    verifier('la page de tarif reste consultable',
      await page.isVisible('#vue-abonnement'), 'page de tarif inatteignable');
    verifier('les trois offres sont affichées',
      (await page.locator('.offre-carte').count()) === 3,
      await page.locator('.offre-carte').count());
    verifier('leurs trois tarifs y sont',
      /4,90 €/.test(await page.innerText('#illimite-offres'))
      && /9,90 €/.test(await page.innerText('#illimite-offres'))
      && /14,90 €/.test(await page.innerText('#illimite-offres')),
      await page.innerText('#illimite-offres'));
    verifier('elle annonce l\'offre comme à venir',
      /Offre en préparation/.test(await page.innerText('#illimite-raison')),
      await page.innerText('#illimite-raison'));
    verifier('et aucune ne peut être souscrite',
      (await page.locator('[data-payer]:not([disabled])').count()) === 0
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
    await ctx.addInitScript(semence([fiche(1)], { api }));
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.goto('http://localhost:8321/app.html'); await page.waitForTimeout(500);

    await page.click('#ouvrir-creation'); await page.waitForTimeout(300);
    /* Le compteur de l'en-tête : c'est lui que l'élève regarde avant de
       photographier, donc il doit être juste à la fiche près. */
    verifier('le compteur de crédits est visible et chiffré',
      (await page.isVisible('#credits-solde'))
      && (await page.innerText('#credits-nombre')).replace(/\s/g, '') === '100',
      await page.innerText('#credits-nombre'));
    verifier('il dit à quoi correspond le solde',
      /100 crédits par fiche/.test(await page.getAttribute('#credits-solde', 'title')),
      await page.getAttribute('#credits-solde', 'title'));
    verifier('il prévient avant le mur, pas pendant',
      (await page.getAttribute('#credits-solde', 'class')).includes('credits--bas'),
      await page.getAttribute('#credits-solde', 'class'));

    verifier('sous le quota, la création s\'ouvre normalement',
      await page.isVisible('#vue-scan'), 'la photo ne s\'est pas ouverte');
    await page.click('#vue-scan .retour'); await page.waitForTimeout(200);

    await page.click('.barre-bas [data-onglet="profil"]'); await page.waitForTimeout(250);
    verifier('le profil dit où en est le quota',
      /100 crédits sur 200, soit 1 fiche/.test(await page.innerText('#profil-abonnement')),
      await page.innerText('#profil-abonnement'));
    verifier('aucune erreur console', erreurs.length === 0, erreurs.join(' || '));
    await ctx.close();
  }

  /* — 2. Au bout du quota, le mur s'ouvre avant la photo — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(semence([fiche(1), fiche(2)], { api }));
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/app.html'); await page.waitForTimeout(500);

    await page.click('#ouvrir-creation'); await page.waitForTimeout(300);
    verifier('la page de tarif s\'ouvre au lieu de la création',
      (await page.isVisible('#vue-abonnement')) && !(await page.isVisible('#vue-scan')),
      'vue inattendue');
    verifier('elle annonce les trois tarifs et leurs volumes',
      /4,90 €/.test(await page.innerText('#illimite-offres'))
      && /1\s000 crédits par mois/.test(await page.innerText('#illimite-offres'))
      && /soit 10 fiches/.test(await page.innerText('#illimite-offres'))
      && /par mois/.test(await page.innerText('#illimite-offres')),
      await page.innerText('#illimite-offres'));
    /* Éteint par défaut : une carte ne montre que le prix du jour. */
    verifier('aucune mention de lancement tant qu\'il n\'y a pas d\'opération',
      !/Lancement/.test(await page.innerText('#illimite-offres')),
      await page.innerText('#illimite-offres').then((t) => t.slice(0, 120)));

    verifier('chaque offre dit ce que coûte vraiment une fiche',
      /0,49 € la fiche/.test(await page.innerText('#illimite-offres'))
      && /0,33 € la fiche/.test(await page.innerText('#illimite-offres'))
      && /0,25 € la fiche/.test(await page.innerText('#illimite-offres')),
      await page.innerText('#illimite-offres'));
    verifier('et de combien le palier fait baisser ce prix',
      /− 33 %/.test(await page.innerText('#illimite-offres'))
      && /− 49 %/.test(await page.innerText('#illimite-offres')),
      await page.innerText('#illimite-offres'));
    /* Un prix barré est, en droit français, un prix réellement pratiqué :
       on n'en invente pas un pour faire joli. */
    verifier('aucun prix barré inventé',
      !/<s>|<del>|line-through/.test(await page.innerHTML('#illimite-offres')),
      'un prix barré traîne dans les cartes');
    verifier('elle dit ce que l\'abonnement débloque',
      /Lecture de tes photos/.test(await page.innerText('.offre')),
      await page.innerText('.offre').then((t) => t.slice(0, 80)));
    verifier('le comparatif oppose l\'essai aux trois offres',
      /200/.test(await page.innerText('#illimite-comparatif'))
      && /en tout/.test(await page.innerText('#illimite-comparatif'))
      && /1\s000/.test(await page.innerText('#illimite-comparatif'))
      && /6\s000/.test(await page.innerText('#illimite-comparatif')),
      await page.innerText('#illimite-comparatif'));
    /* Cinq colonnes sur 390 px : si le tableau déborde, deux offres
       deviennent invisibles sans que l'élève sache qu'il faut faire
       glisser — autant ne pas les proposer. */
    const tableau = await page.evaluate(() => {
      const t = document.querySelector('#illimite-comparatif');
      const titres = [...t.querySelectorAll('thead th')].map((e) => e.textContent.trim()).filter(Boolean);
      return {
        deborde: t.scrollWidth > t.clientWidth + 2,
        page: document.documentElement.scrollWidth > window.innerWidth,
        titres,
      };
    });
    verifier('le comparatif tient dans l\'écran, sans défilement latéral',
      !tableau.deborde && !tableau.page, JSON.stringify(tableau));
    verifier('les quatre colonnes sont nommées en entier',
      tableau.titres.join('|') === 'Gratuit|Essentiel|Régulier|Intensif', tableau.titres.join(' | '));

    verifier('le mur dit pourquoi',
      /200 crédits d'essai sont dépensés/.test(await page.innerText('#illimite-raison')),
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
    verifier('la bibliothèque reste à deux fiches', restantes === 2, restantes);
    await ctx.close();
  }

  /* — 3. Payer : la page passe par le serveur, jamais par une clé secrète — */
  {
    recu.paiements.length = 0;
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(semence([fiche(1), fiche(2), fiche(3)], { api }));
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/app.html'); await page.waitForTimeout(500);
    await page.click('#ouvrir-creation'); await page.waitForTimeout(300);

    verifier('avec un serveur, les trois offres sont souscriptibles',
      (await page.locator('[data-payer]:not([disabled])').count()) === 3,
      await page.locator('[data-payer]:not([disabled])').count());
    verifier('celle du milieu est mise en avant',
      (await page.locator('.offre-carte--conseillee [data-payer]').getAttribute('data-payer')) === 'regulier',
      await page.locator('.offre-carte--conseillee [data-payer]').getAttribute('data-payer'));

    await page.click('[data-payer="essentiel"]'); await page.waitForTimeout(900);
    verifier('la page demande la session au serveur', recu.paiements.length === 1,
      JSON.stringify(recu.paiements));
    verifier('elle transmet l\'offre choisie, pas une autre',
      recu.paiements[0] && recu.paiements[0].offre === 'essentiel',
      JSON.stringify(recu.paiements[0]));
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
    await page.goto('http://localhost:8321/app.html?paiement=ok&session=cs_payee');
    await page.waitForTimeout(1200);

    verifier('la session est vérifiée auprès du serveur',
      recu.licences.some((l) => l.session === 'cs_payee'), JSON.stringify(recu.licences));
    verifier('l\'adresse est nettoyée',
      !/paiement=ok/.test(page.url()), page.url());

    await page.click('.barre-bas [data-onglet="profil"]'); await page.waitForTimeout(300);
    const profil = await page.innerText('#profil-abonnement');
    verifier('le profil nomme l\'offre souscrite, pas une autre',
      /Essentiel/i.test(profil), profil.replace(/\n+/g, ' / '));
    verifier('et donne le compteur du mois, pas le total de la bibliothèque',
      /1\s000 crédits sur 1\s000 ce mois-ci/.test(profil), profil.replace(/\n+/g, ' / '));
    verifier('la clé est donnée pour un autre appareil',
      (await page.inputValue('#profil-licence')) === 'cus_bon', await page.inputValue('#profil-licence'));

    await page.click('.barre-bas [data-onglet="accueil"]'); await page.waitForTimeout(200);
    await page.click('#ouvrir-creation'); await page.waitForTimeout(300);
    verifier('la création n\'est plus bloquée',
      await page.isVisible('#vue-scan'), 'mur encore là');
    await ctx.close();
  }

  /* — 5. Une session non payée ne déverrouille rien — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(semence([fiche(1), fiche(2), fiche(3)], { api }));
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/app.html?paiement=ok&session=cs_abandonnee');
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
    await page.goto('http://localhost:8321/app.html'); await page.waitForTimeout(500);
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
    verifier('le profil le confirme, avec le nom de l\'offre',
      /Essentiel/i.test(await page.innerText('#profil-abonnement')),
      await page.innerText('#profil-abonnement'));
    await ctx.close();
  }

  /* — L'essai ne se recharge pas, et ne se rembourse pas —————————
     Deux pièges qu'un élève trouve tout seul : attendre le 1er du mois,
     ou supprimer ses fiches pour repartir à zéro. */
  {
    const moisPasse = (() => {
      const d = new Date(); d.setMonth(d.getMonth() - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    })();

    /* a) Le mois a changé : l'abonné serait rechargé, pas l'essai. */
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(semence([fiche(1), fiche(2)], { api }));
    await ctx.addInitScript(`localStorage.setItem('mathematique.consommation',
      ${JSON.stringify(JSON.stringify({ mois: moisPasse, fiches: 2, total: 2 }))});`);
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/app.html'); await page.waitForTimeout(500);
    await page.click('#ouvrir-creation'); await page.waitForTimeout(300);
    verifier('un mois de plus ne recharge pas l\'essai',
      await page.isVisible('#vue-abonnement'), 'la création s\'est ouverte');
    await ctx.close();

    /* b) Bibliothèque vidée, compteur gardé : supprimer ne rend pas de crédit. */
    const ctx2 = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx2.addInitScript(semence([], { api }));
    await ctx2.addInitScript(`localStorage.setItem('mathematique.consommation',
      ${JSON.stringify(JSON.stringify({ mois: moisPasse, fiches: 2, total: 2 }))});`);
    const page2 = await ctx2.newPage();
    await page2.goto('http://localhost:8321/app.html'); await page2.waitForTimeout(500);
    await page2.click('#ouvrir-creation'); await page2.waitForTimeout(300);
    verifier('supprimer ses fiches ne rend pas les crédits dépensés',
      await page2.isVisible('#vue-abonnement'), 'la création s\'est ouverte');
    verifier('et le mur le dit avec le bon chiffre',
      /200 crédits d'essai sont dépensés/.test(await page2.innerText('#illimite-raison')),
      await page2.innerText('#illimite-raison'));
    await ctx2.close();

    /* c) Un enregistrement d'avant, sans « total » : on ne rend rien non plus. */
    const ctx3 = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx3.addInitScript(semence([], { api }));
    await ctx3.addInitScript(`localStorage.setItem('mathematique.consommation',
      ${JSON.stringify(JSON.stringify({ mois: moisPasse, fiches: 3 }))});`);
    const page3 = await ctx3.newPage();
    await page3.goto('http://localhost:8321/app.html'); await page3.waitForTimeout(500);
    await page3.click('#ouvrir-creation'); await page3.waitForTimeout(300);
    verifier('un compteur d\'avant la mise à jour compte quand même',
      await page3.isVisible('#vue-abonnement'), 'la création s\'est ouverte');
    await ctx3.close();
  }

  /* — S'abonner donne le quota entier, pas ce qui reste du mois ————
     L'essai a été dépensé ce mois-ci : ces fiches-là ne doivent pas être
     retirées du premier mois payé. */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(semence([fiche(1), fiche(2)], { api }));
    /* Semé seulement s'il n'y a rien : un script d'amorce repasse à chaque
       navigation, et il effacerait ce que la page a consommé entre-temps. */
    await ctx.addInitScript(`if (!localStorage.getItem('mathematique.consommation')) {
      localStorage.setItem('mathematique.consommation',
        ${JSON.stringify(JSON.stringify({ mois: new Date().toISOString().slice(0, 7), fiches: 2, total: 2 }))});
    }`);
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/app.html?paiement=ok&session=cs_payee');
    await page.waitForTimeout(900);
    await page.click('.barre-bas [data-onglet="profil"]'); await page.waitForTimeout(300);
    const dit = await page.innerText('#profil-abonnement');
    verifier('le premier mois payé est entier, l\'essai n\'en est pas retiré',
      /1\s000 crédits sur 1\s000/.test(dit), dit.replace(/\n+/g, ' · '));

    /* Et la revérification du lendemain ne doit pas effacer ce qui a été
       consommé depuis : seule une nouvelle période payée remet à zéro.
       On écrit donc trois fiches dans la fenêtre en cours — celle que
       Stripe vient de donner, au jour près. */
    const fenetre = await page.evaluate(() => {
      const abo = JSON.parse(localStorage.getItem('mathematique.abonnement'));
      const f = `p${Math.floor(abo.expire / 86400000)}`;
      localStorage.setItem('mathematique.consommation',
        JSON.stringify({ mois: f, fiches: 3, total: 5 }));
      localStorage.setItem('mathematique.abonnement',
        JSON.stringify({ ...abo, verifieLe: Date.now() - 2 * 86400000 }));
      return f;
    });
    await page.reload(); await page.waitForTimeout(900);
    await page.click('.barre-bas [data-onglet="profil"]'); await page.waitForTimeout(300);
    const apres = await page.innerText('#profil-abonnement');
    verifier('une revérification ne recharge pas le compteur',
      /700 crédits sur 1\s000/.test(apres), `${fenetre} · ${apres.replace(/\n+/g, ' · ')}`);

    /* ————— Le mois suivant est payé : le quota repart ————————————
       Le compteur suit la période payée, pas le 1er du mois : c'est le
       prélèvement suivant qui le recharge, et lui seul. */
    expireRendu = Date.now() + 60 * 86400000;        // Stripe a avancé la période
    await page.evaluate(() => {
      const abo = JSON.parse(localStorage.getItem('mathematique.abonnement'));
      localStorage.setItem('mathematique.abonnement',
        JSON.stringify({ ...abo, verifieLe: Date.now() - 2 * 86400000 }));
    });
    await page.reload(); await page.waitForTimeout(900);
    await page.click('.barre-bas [data-onglet="profil"]'); await page.waitForTimeout(300);
    const renouvele = await page.innerText('#profil-abonnement');
    verifier('une nouvelle période payée recharge le quota entier',
      /1\s000 crédits sur 1\s000/.test(renouvele), renouvele.replace(/\n+/g, ' · '));
    expireRendu = null;
    await ctx.close();
  }

  /* — Résilier : le profil mène au portail de Stripe ————————————————
     Un abonnement pris en trois taps doit pouvoir être quitté de même. */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(semence([fiche(1)], { api }));
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/app.html?paiement=ok&session=cs_payee');
    await page.waitForTimeout(900);
    await page.click('.barre-bas [data-onglet="profil"]'); await page.waitForTimeout(300);

    const bouton = await page.$('#profil-abonnement [data-offre="gerer"]');
    verifier('le profil propose de gérer ou résilier l\'abonnement',
      Boolean(bouton), 'aucun bouton de résiliation');
    await bouton.click(); await page.waitForTimeout(600);
    const demande = (recu.portails || [])[0] || {};
    verifier('et il demande le portail au serveur, avec la licence',
      demande.cle === 'cus_bon', JSON.stringify(demande));
    verifier('en disant où revenir ensuite',
      /app\.html$/.test(demande.retour || ''), demande.retour);
    verifier('l\'élève est bien conduit au portail',
      /faux-portail=1/.test(page.url()), page.url());
    await ctx.close();
  }

  /* — Changer d'offre quand on est déjà abonné ————————————————————
     Repasser en caisse ouvrirait un SECOND abonnement : l'élève serait
     prélevé deux fois sans l'avoir demandé. On passe par le portail. */
  {
    recu.paiements.length = 0;
    recu.portails = [];
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(semence([fiche(1)], { api }));
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/app.html?paiement=ok&session=cs_payee');
    await page.waitForTimeout(900);
    await page.click('.barre-bas [data-onglet="profil"]'); await page.waitForTimeout(300);
    await page.click('#profil-abonnement [data-offre="payer"]'); await page.waitForTimeout(700);

    verifier('« changer d\'offre » montre d\'abord les offres, dans l\'app',
      await page.isVisible('#vue-abonnement'), 'page de tarif non ouverte');
    verifier('et prévient que le changement passe par Stripe',
      /prorata/.test(await page.innerText('#illimite-note-changement')),
      await page.innerText('#illimite-note-changement').catch(() => '—'));
    verifier('les cartes disent qu\'on change, pas qu\'on choisit',
      /Passer à cette offre/.test(await page.innerText('#illimite-offres')),
      await page.innerText('#illimite-offres').then((t) => t.slice(0, 120)));

    await page.click('#illimite-offres [data-payer="regulier"]'); await page.waitForTimeout(700);
    verifier('choisir une autre offre ne repasse pas en caisse',
      recu.paiements.length === 0, JSON.stringify(recu.paiements));
    verifier('elle mène au portail, qui sait modifier un abonnement',
      (recu.portails || []).length === 1 && /faux-portail=1/.test(page.url()),
      `${(recu.portails || []).length} · ${page.url()}`);
    await ctx.close();
  }

  /* — Au retour du portail, l'offre changée se voit tout de suite ————
     La licence n'est revérifiée qu'une fois par jour : sans ce rattrapage,
     l'élève qui vient de passer au Régulier verrait l'Essentiel jusqu'au
     lendemain, et croirait son paiement perdu. */
  {
    offreRendue = 'regulier';
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(semence([fiche(1)], { api }));
    await ctx.addInitScript(`localStorage.setItem('mathematique.abonnement', JSON.stringify({
      actif: true, cle: 'cus_bon', offre: 'essentiel',
      expire: ${Date.now() + 20 * 86400000}, depuis: ${Date.now() - 86400000},
      verifieLe: ${Date.now()} }));`);           // vérifiée à l'instant : rien ne la relirait
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/app.html?vue=profil&portail=ok');
    await page.waitForTimeout(900);
    const dit = await page.innerText('#profil-abonnement');
    verifier('au retour du portail, la nouvelle offre est lue sans attendre',
      /RÉGULIER|Régulier/.test(dit), dit.replace(/\n+/g, ' · '));
    verifier('et l\'adresse est nettoyée du marqueur',
      !/portail=ok/.test(page.url()), page.url());
    offreRendue = 'essentiel';
    await ctx.close();
  }

  /* — L'opération de lancement, quand on l'allume ————————————————
     Licite parce que vraie : on annonce une hausse à venir, on ne barre
     pas un prix jamais pratiqué. */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(semence([fiche(1)], { api, lancement: { jusquau: '2099-12-31' } }));
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/app.html?vue=abonnement'); await page.waitForTimeout(900);
    verifier('allumée, elle annonce le prix d\'après sur chaque carte',
      /Lancement — ensuite 6,90 €/.test(await page.innerText('#illimite-offres'))
      && /Lancement — ensuite 12,90 €/.test(await page.innerText('#illimite-offres')),
      await page.innerText('#illimite-offres'));
    verifier('et la promesse ne se dit qu\'une fois, sous les cartes',
      /gardes ton prix/.test(await page.innerText('#illimite-note-lancement')),
      await page.innerText('#illimite-note-lancement').catch(() => '—'));
    await ctx.close();
  }

  /* — Une opération de lancement périmée s'efface d'elle-même ————————
     Une promesse datée qui traîne après sa date est pire que pas de
     promesse : elle dit que l'annonce n'était pas sérieuse. */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(semence([fiche(1)], { api, lancement: { jusquau: '2020-01-31' } }));
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/app.html?vue=abonnement'); await page.waitForTimeout(900);
    verifier('passée la date, plus un mot de lancement sur les cartes',
      !/Lancement/.test(await page.innerText('#illimite-offres')),
      await page.innerText('#illimite-offres').then((t) => t.slice(0, 120)));
    verifier('ni sous les cartes',
      !(await page.isVisible('#illimite-note-lancement')), 'la promesse périmée est restée');
    await ctx.close();
  }

  /* — Un seul tarif créé chez Stripe : une seule offre proposée ————
     Pendant la configuration, on commence par un tarif. Proposer les deux
     autres mènerait l'élève sur une erreur « offre inconnue ». */
  {
    recu.offresEnVente = ['essentiel'];
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(semence([fiche(1), fiche(2)], { api }));
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/app.html'); await page.waitForTimeout(500);
    await page.click('#ouvrir-creation'); await page.waitForTimeout(900);

    const cartes = await page.$$eval('#illimite-offres .offre-carte h3',
      (titres) => titres.map((t) => t.textContent.trim()));
    verifier('seule l\'offre réellement créée est proposée',
      cartes.length === 1 && cartes[0] === 'Essentiel', cartes.join(' | '));

    const colonnes = await page.$$eval('#illimite-comparatif thead th',
      (ths) => ths.map((e) => e.textContent.trim()).filter(Boolean));
    verifier('et le comparatif ne compare que ce qui existe',
      colonnes.join('|') === 'Gratuit|Essentiel', colonnes.join(' | '));
    await ctx.close();
    recu.offresEnVente = ['essentiel', 'regulier', 'intensif'];
  }

  await nav.close();
  faux.close();
  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nTout est vert.');
  process.exit(echecs ? 1 : 0);
})();
