/* Vérifie que le rapprochement d'un sujet libre avec une banque de questions
   ne produit pas de correspondance absurde. Lancer : node tests/recherche-sujet.js */
const fs = require('fs');
const path = require('path');
const racine = path.join(__dirname, '..');
const data = fs.readFileSync(path.join(racine, 'data.js'), 'utf8');
const app = fs.readFileSync(path.join(racine, 'app.js'), 'utf8');
const bloc = app.slice(app.indexOf('  /** Minuscules sans accents'), app.indexOf('  function panneauSujetIndisponible('));
(0, eval)(data + bloc + ';globalThis.T = { chercherBanque, CATALOGUE, NIVEAU_VERS_PROGRAMME, MATIERES, BANQUES, QUIZ };');
const { chercherBanque, CATALOGUE, MATIERES, QUIZ } = globalThis.T;

console.log('— Cas attendus —');
const attendus = [
  ['Classer les êtres vivants', null],
  ['le mur de Berlin', 'guerrefroide'],
  ['La guerre froide (1947-1991)', 'guerrefroide'],
  ['Probabilités conditionnelles', 'probas'],
  ['dérivées', 'derivees'],
  ['la guerre froide', 'guerrefroide'],
  ['effet Doppler', 'ondes'],
  ['Dérivation', 'derivees'],
  ['la méiose', 'genetique'],
  ['Ondes et interférences', 'ondes'],
  ['la cuisine italienne', null],
  ['Les saisons et le climat local', null],
  ['La conscience', 'conscience'],
  ['Suites numériques', 'suites'],
  ['Circuits en série et en dérivation', null],
  ['La Première Guerre mondiale', null],
  ['Limites et continuité', null],
  ['Analyse de données', null],
  ['Premières probabilités', null],
  ['Aires urbaines et espaces productifs français', null],
  ['Le monstre, aux limites de l\'humain', null],
  ['Géométrie dans l\'espace', 'vecteurs'],
  ['Le cycle de vie des végétaux', null],
  ['Lire un graphique', null],
  ['Les quatre opérations', null],
];
let ko = 0;
attendus.forEach(([sujet, attendu]) => {
  const trouve = chercherBanque(sujet);
  const obtenu = trouve ? trouve.id : null;
  const bon = obtenu === attendu;
  if (!bon) ko++;
  console.log(`${bon ? 'ok  ' : 'KO  '}${sujet.padEnd(34)} → ${obtenu || '(aucune banque)'}${bon ? '' : '   attendu: ' + (attendu || 'aucune')}`);
});

console.log('\n— Tous les thèmes du catalogue qui tombent sur une banque locale —');
let total = 0, apparies = 0;
for (const [prog, mats] of Object.entries(CATALOGUE)) {
  for (const [m, themes] of Object.entries(mats)) {
    themes.forEach((theme) => {
      total++;
      const t = chercherBanque(theme, m);   // matière imposée, comme depuis le carrousel
      if (t) {
        apparies++;
        const coherent = t.matiere === m;
        console.log(`${coherent ? 'ok  ' : 'SUSPECT '}${prog}/${m}: "${theme}" → ${t.titre} (${MATIERES[t.matiere].nom})`);
      }
    });
  }
}
console.log(`\n${apparies} thèmes appariés sur ${total} · ${ko} cas attendus en échec`);
process.exit(ko ? 1 : 0);
