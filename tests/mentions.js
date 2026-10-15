/* Éprouve les pages obligatoires d'un site qui vend : mentions légales,
   conditions de vente, vie privée.
   --------------------------------------------------------------------------
   Deux risques, et aucun ne se voit à l'œil nu. Le premier : un lien mort
   vers une page que la loi impose d'afficher. Le second, plus grave : des
   prix qui ne disent plus la même chose que ceux de l'app — le contrat
   annoncerait alors autre chose que ce qui est débité.

   Lancer : node tests/mentions.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..');
let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const PAGES = ['index.html', 'app.html', 'confidentialite.html', 'mentions-legales.html', 'cgv.html'];

/* — 1. Les pages existent — */
for (const page of ['mentions-legales.html', 'cgv.html', 'confidentialite.html']) {
  verifier(`${page} existe`, fs.existsSync(path.join(RACINE, page)), 'absente');
}

/* — 2. On y arrive depuis la vitrine ET depuis l'app ———————————
   Une page légale qu'aucun lien n'atteint ne compte pas comme affichée. */
for (const [depuis, vers] of [
  ['index.html', 'cgv.html'], ['index.html', 'mentions-legales.html'],
  ['app.html', 'cgv.html'], ['app.html', 'mentions-legales.html'],
  ['app.html', 'confidentialite.html'],
]) {
  verifier(`${depuis} mène à ${vers}`, lire(depuis).includes(`href="${vers}"`), 'aucun lien');
}

/* L'acheteur doit pouvoir lire les conditions avant de payer, pas après :
   le lien doit être sur l'écran où l'on choisit sa formule. */
const app = lire('app.html');
const ecranTarif = app.slice(app.indexOf('id="illimite-offres"'), app.indexOf('id="illimite-comparatif"'));
verifier('les conditions sont lisibles depuis l\'écran de tarif',
  ecranTarif.includes('cgv.html'), 'lien absent de l\'écran de tarif');

/* — 3. Aucun lien mort dans les pages ————————————————————————— */
const morts = [];
for (const page of PAGES) {
  for (const lien of lire(page).match(/href="([^"#:]+\.html[^"]*)"/g) || []) {
    const cible = lien.slice(6, -1).split('?')[0].split('#')[0];
    if (!fs.existsSync(path.join(RACINE, cible))) morts.push(`${page} → ${cible}`);
  }
}
verifier('aucun lien ne mène nulle part', morts.length === 0, morts.join(' | '));

/* — 4. Les prix des CGV sont ceux de l'app ————————————————————
   C'est le cœur : le contrat ne doit pas annoncer un prix que Stripe ne
   débite pas. Les prix sont lus dans abonnement.js, pas recopiés ici. */
const bac = { console, document: {}, localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
bac.window = { location: { href: 'http://localhost/', search: '', pathname: '/' }, localStorage: bac.localStorage };
const OFFRE = vm.runInNewContext(`${lire('abonnement.js')};ABONNEMENT`, bac);
const cgv = lire('cgv.html');

const manquants = [];
for (const offre of OFFRE.offres()) {
  if (!cgv.includes(offre.nom)) manquants.push(`${offre.cle} : nom absent`);
  if (!cgv.includes(offre.prix)) manquants.push(`${offre.cle} : ${offre.prix} absent`);
  if (offre.annuel && !cgv.includes(offre.annuel.prix)) manquants.push(`${offre.cle} : ${offre.annuel.prix} absent`);
  if (!cgv.includes(`<td>${offre.fiches}</td>`)) manquants.push(`${offre.cle} : ${offre.fiches} fiches absent`);
}
verifier('les CGV affichent exactement les prix et quotas de l\'app',
  manquants.length === 0, manquants.join(' | '));

/* Et l'essai annoncé est celui qui est réellement donné. */
verifier('l\'essai annoncé dans les CGV est celui qui est donné',
  cgv.includes(`${OFFRE.creditsDe(OFFRE.config().gratuit.fiches)} crédits`),
  `${OFFRE.creditsDe(OFFRE.config().gratuit.fiches)} crédits introuvable`);

/* — 5. Ce qu'un contrat d'abonnement doit dire ————————————————— */
const OBLIGATIONS = [
  [/reconduit tacitement|reconduction tacite/i, 'la reconduction tacite'],
  [/L\.\s?215-1/, 'l\'avis Chatel (article L. 215-1)'],
  [/quatorze jours|14 jours/i, 'le droit de rétractation'],
  [/L\.\s?221-18/, 'l\'article du droit de rétractation'],
  [/résilier|résiliation/i, 'la résiliation'],
  [/médiateur de la consommation/i, 'la médiation'],
  [/droit français/i, 'le droit applicable'],
  [/TVA non applicable/i, 'la mention de TVA'],
  [/mineur/i, 'le cas des mineurs'],
];
for (const [motif, quoi] of OBLIGATIONS) {
  verifier(`les CGV disent ${quoi}`, motif.test(cgv), 'absent');
}

const mentions = lire('mentions-legales.html');
for (const [motif, quoi] of [
  [/Éditeur/i, 'l\'éditeur'],
  [/Directeur de la publication/i, 'le directeur de publication'],
  [/mailto:/, 'une adresse de contact'],
  [/Vercel/i, 'l\'hébergeur'],
]) {
  verifier(`les mentions légales disent ${quoi}`, motif.test(mentions), 'absent');
}

/* — 6. Les trois pages se ressemblent ————————————————————————— */
for (const page of ['mentions-legales.html', 'cgv.html', 'confidentialite.html']) {
  const html = lire(page);
  verifier(`${page} porte la feuille de style de la vitrine`,
    html.includes('vitrine.css') && html.includes('<html lang="fr">'), 'mise en page différente');
}

console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nTout est vert.');
process.exit(echecs ? 1 : 0);
