/* La vitrine : la page que lit quelqu'un qui ne connaît pas encore l'app.
   Elle a deux devoirs contradictoires — convaincre, et ne rien inventer.
   Ce banc d'essai tient les deux : les prix viennent du module d'abonnement
   (jamais recopiés), les boutons mènent vraiment à l'app, les images
   existent et se décrivent, et aucune preuve sociale fabriquée ne s'y
   glisse — ni faux abonnés, ni témoignages, ni compteur d'élèves.
   Nécessite un serveur local sur le port 8321. Lancer : node tests/vitrine.js */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const racine = path.join(__dirname, '..');
let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

/* Une fiche déjà créée : de quoi reconnaître quelqu'un qui revient. */
const FICHE = {
  id: 'v1', matiere: 'maths', titre: 'Les suites', source: 'scan', banqueId: null,
  contenu: { lu: true, moteur: 'claude', accroche: '', sections: [], points: [], formules: [], exemples: [], pieges: [], texte: '' },
  cartes: [], maitrise: {}, creee: new Date().toISOString(),
  derniereRevision: new Date().toISOString(), palier: 0, progression: 0,
};

/** Les variables de couleur déclarées dans un fichier de style. */
function jetons(fichier) {
  const css = fs.readFileSync(path.join(racine, fichier), 'utf8');
  const bloc = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')));
  const trouves = {};
  bloc.replace(/(--[a-z-]+)\s*:\s*([^;]+);/g, (tout, cle, valeur) => {
    trouves[cle] = valeur.trim().split('/*')[0].trim();
    return tout;
  });
  return trouves;
}

(async () => {
  const nav = await chromium.launch();

  /* — 1. La page tient dans un téléphone, sans erreur ni débordement — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const soucis = [];
    page.on('console', (m) => { if (m.type() === 'error') soucis.push(m.text()); });
    page.on('pageerror', (e) => soucis.push('PAGE: ' + e));
    const reponses = [];
    page.on('response', (r) => { if (r.status() >= 400) reponses.push(`${r.status()} ${r.url()}`); });

    await page.goto('http://localhost:8321/index.html', { waitUntil: 'load' });
    await page.waitForTimeout(600);

    verifier('la vitrine se charge sans erreur', soucis.length === 0, soucis.join(' | '));
    verifier('aucun fichier manquant', reponses.length === 0, reponses.join(' | '));

    const debord = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    verifier('rien ne déborde à 390 px', debord <= 0, `${debord} px de trop`);

    /* — 2. Les prix viennent du module, pas d'une recopie — */
    const attendu = await page.evaluate(() => ABONNEMENT.offres().map((o) => ({
      nom: o.nom, prix: o.prix, fiches: o.fiches,
      credits: (o.fiches * ABONNEMENT.creditsParFiche()).toLocaleString('fr-FR'),
    })));
    const texte = await page.innerText('#tarifs');
    const manquants = attendu.filter((o) =>
      !texte.includes(o.prix) || !texte.includes(`${o.fiches} fiches`) || !texte.includes(o.credits));
    verifier('les trois formules affichent le prix, le volume et les crédits du module',
      attendu.length === 3 && manquants.length === 0,
      manquants.map((o) => o.nom).join(', ') || `${attendu.length} offres`);

    const parFiche = await page.evaluate(() => ABONNEMENT.creditsParFiche());
    verifier('le coût d\'une fiche est celui du module',
      (await page.innerText('#credits-par-fiche')) === String(parFiche), parFiche);

    /* Sans paiement branché, on ne vend pas : on le dit. */
    const ouvert = await page.evaluate(() => ABONNEMENT.estConfigure());
    const encartVisible = await page.isVisible('#encart-gratuit');
    verifier('le paiement non branché est annoncé, pas caché', encartVisible === !ouvert,
      `branché : ${ouvert}, encart : ${encartVisible}`);

    /* — 3. Tous les chemins mènent à l'app — */
    const liens = await page.$$eval('a[href]', (tous) => tous.map((a) => a.getAttribute('href')));
    const versApp = liens.filter((h) => h.startsWith('app.html'));
    verifier('plusieurs boutons mènent à l\'app', versApp.length >= 4, versApp.join(' '));
    verifier('au moins un mène droit à l\'appareil photo',
      versApp.some((h) => h.includes('vue=scan')), versApp.join(' '));
    const dehors = liens.filter((h) => /^https?:/.test(h));
    verifier('aucun lien ne sort du site', dehors.length === 0, dehors.join(' '));

    /* — 4. Les images : présentes, décrites, mesurées.
           Elles sont chargées paresseusement : on descend toute la page
           avant de les compter, sinon on reproche à la page d'économiser
           exactement ce qu'on lui a demandé d'économiser. */
    await page.evaluate(async () => {
      const pas = 700;
      for (let y = 0; y < document.body.scrollHeight; y += pas) {
        window.scrollTo({ top: y, behavior: 'instant' });
        await new Promise((suite) => setTimeout(suite, 60));
      }
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    await page.waitForTimeout(900);

    const images = await page.$$eval('img', (tous) => tous.map((i) => ({
      src: i.getAttribute('src'), alt: i.getAttribute('alt') || '',
      l: i.getAttribute('width'), h: i.getAttribute('height'),
      charge: i.naturalWidth > 0,
    })));
    verifier('la page montre le produit en images', images.length >= 6, `${images.length} images`);
    const muettes = images.filter((i) => i.alt.trim().length < 20);
    verifier('chaque image se décrit pour qui ne la voit pas',
      muettes.length === 0, muettes.map((i) => i.src).join(', '));
    const flottantes = images.filter((i) => !i.l || !i.h);
    verifier('chaque image réserve sa place (pas de saut de page)',
      flottantes.length === 0, flottantes.map((i) => i.src).join(', '));
    const absentes = images.filter((i) => !i.charge);
    verifier('toutes les images s\'affichent', absentes.length === 0,
      absentes.map((i) => i.src).join(', '));

    /* — 5. Aucune preuve sociale fabriquée.
           On lit la page moins la section « Jouons franc jeu » : celle-ci
           nomme les procédés qu'elle refuse (« Lucas vient de s'abonner »),
           et se ferait condamner pour les avoir cités. */
    const corps = await page.evaluate(() => {
      const franchise = document.querySelector('.franchise');
      const dit = franchise ? franchise.innerText : '';
      return document.body.innerText.replace(dit, '');
    });
    const inventions = [
      [/\d[\d\s.,]*\s*(élèves|étudiants|utilisateurs|lycéens|inscrits)/i, 'un compteur d\'utilisateurs'],
      [/(vient de s'abonner|viennent de s'abonner)/i, 'un faux abonné'],
      [/★|⭐|\d[.,]\d\s*\/\s*5|note moyenne/i, 'une note inventée'],
      [/«[^»]{10,}»\s*[—–-]\s*[A-ZÉ][a-zé]+,?\s*(\d{1,2}(e|ème|re)|terminale|seconde)/i, 'un témoignage'],
      [/\b(n°\s*1|numéro 1|meilleure app)\b/i, 'un superlatif invérifiable'],
    ];
    const prises = inventions.filter(([motif]) => motif.test(corps)).map(([, quoi]) => quoi);
    verifier('aucune preuve sociale inventée', prises.length === 0, prises.join(', '));

    /* Et ce qui est promis en creux est bien écrit noir sur blanc. */
    const tout = await page.innerText('body');
    verifier('la page assume de ne pas inventer de témoignages',
      /témoignage/i.test(tout) && /à vérifier/i.test(tout), tout.slice(0, 80));

    /* — 6. Le rappel du bas : absent sur l'accroche, présent ensuite — */
    verifier('le rappel se tait tant que l\'accroche est à l\'écran',
      !(await page.isVisible('#rappel')), 'visible dès le haut');
    await page.evaluate(() => window.scrollTo({ top: 2400, behavior: 'instant' }));
    await page.waitForTimeout(400);
    verifier('le rappel suit quand l\'accroche est passée',
      await page.isVisible('#rappel'), 'toujours caché');

    /* — 7. Personne n'est encore revenu : pas de bandeau de retour — */
    verifier('aucun bandeau « reprendre » au premier passage',
      !(await page.isVisible('#retour-band')), 'bandeau affiché sans fiche');
    await ctx.close();
  }

  /* — 8. Celui qui a déjà des fiches est reconnu — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(`localStorage.setItem('mathematique.fiches',
      ${JSON.stringify(JSON.stringify([FICHE]))});`);
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/index.html', { waitUntil: 'load' });
    await page.waitForTimeout(400);
    verifier('celui qui revient se voit proposer de reprendre',
      await page.isVisible('#retour-band'), 'bandeau absent');
    verifier('et on lui dit combien de fiches l\'attendent',
      /une fiche/i.test(await page.innerText('#retour-texte')),
      await page.innerText('#retour-band'));
    await ctx.close();
  }

  /* — 9. Le lien profond ouvre vraiment l'appareil photo — */
  {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript("localStorage.setItem('mathematique.niveau','lyceen');");
    const page = await ctx.newPage();
    await page.goto('http://localhost:8321/app.html?vue=scan', { waitUntil: 'load' });
    await page.waitForTimeout(700);
    verifier('app.html?vue=scan ouvre la prise de vue',
      await page.isVisible('#vue-scan'), await page.evaluate(() =>
        [...document.querySelectorAll('.vue')].filter((v) => !v.hidden).map((v) => v.id).join(',')));

    await page.goto('http://localhost:8321/app.html?vue=abonnement', { waitUntil: 'load' });
    await page.waitForTimeout(700);
    verifier('app.html?vue=abonnement ouvre les formules',
      await page.isVisible('#vue-abonnement'), 'page de tarif non ouverte');

    /* Une adresse publique ne doit pas pouvoir ouvrir n'importe quel écran. */
    await page.goto('http://localhost:8321/app.html?vue=quiz', { waitUntil: 'load' });
    await page.waitForTimeout(700);
    verifier('une vue hors liste est ignorée',
      await page.isVisible('#vue-accueil'), 'une vue interne s\'est ouverte');
    await ctx.close();
  }

  await nav.close();

  /* — 10. Hors navigateur : la vitrine et l'app parlent la même langue — */
  {
    const app = jetons('styles.css');
    const vitrine = jetons('vitrine.css');
    const partages = ['--marine', '--marine-fonce', '--bleu-pastel', '--gris-fond',
      '--blanc', '--gris-texte', '--bordure'];
    const divergents = partages.filter((cle) => app[cle] !== vitrine[cle]);
    verifier('les couleurs de la vitrine sont celles de l\'app',
      divergents.length === 0,
      divergents.map((c) => `${c} : ${app[c]} ≠ ${vitrine[c]}`).join(' | '));

    const html = fs.readFileSync(path.join(racine, 'index.html'), 'utf8');
    verifier('la vitrine annonce une image de partage',
      /og:image[^>]+partage\.jpg/.test(html) && fs.existsSync(path.join(racine, 'images/partage.jpg')),
      'image de partage absente');
    verifier('l\'app reste servie par app.html',
      fs.existsSync(path.join(racine, 'app.html')) && /id="vue-accueil"/.test(
        fs.readFileSync(path.join(racine, 'app.html'), 'utf8')), 'app.html introuvable');
  }

  console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est vert.');
  process.exit(echecs ? 1 : 0);
})();
