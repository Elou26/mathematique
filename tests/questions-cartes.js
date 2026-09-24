/* Vérifie que les questions des flashcards se lisent comme une vraie question :
   pas de numéro de partie recopié (« 2.1 Les milieux froids »), pas de titre
   qui crie en capitales, le bon tour pour un pluriel.
   Aucun navigateur : OCR.structurer() ne manipule que du texte.
   Lancer : node tests/questions-cartes.js */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const OCR = vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'ocr.js'), 'utf8') + '\n;OCR',
  vm.createContext({ console }));

/* Une leçon de géo telle que l'OCR la rend : des parties numérotées. */
const GEO = [
  'CONTRAINTES',
  '1 > Les contraintes naturelles',
  "1.1 Qu'est-ce qu'une contrainte naturelle ?",
  "Une contrainte naturelle est un élément du milieu qui gêne l'installation des hommes.",
  '2.1 Les milieux froids : des espaces où le gel dure plus de six mois par an.',
  'Définition : une oasis est un espace cultivé au milieu du désert, alimenté par un point d\'eau.',
  'densité : le nombre d\'habitants rapporté à la superficie du territoire.',
  "3 > S'adapter",
  'Les sociétés transforment le milieu pour y vivre malgré tout.',
  'Propriété : les fortes densités se concentrent sur les littoraux et les plaines.',
].join('\n');

let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

const fiche = OCR.structurer(GEO, 88);
const questions = fiche.cartes.map((c) => c.recto);
console.log(questions.map((q) => `   · ${q}`).join('\n'));

verifier('des cartes sont tirées du cours', fiche.cartes.length >= 3, fiche.cartes.length);

verifier('aucun numéro de partie dans une question',
  questions.every((q) => !/(?:«\s*|\b)\d+(?:\.\d+)?\s*[).]?\s+[A-Za-zÀ-ÿ]/.test(q.replace(/en \d{4}/, ''))),
  questions.filter((q) => /\d+(?:\.\d+)?\s+[A-Za-zÀ-ÿ]/.test(q)).join(' | '));

verifier('aucun titre en capitales dans une question',
  questions.every((q) => !/[A-ZÀ-Ý]{4,}/.test(q)),
  questions.filter((q) => /[A-ZÀ-Ý]{4,}/.test(q)).join(' | '));

verifier('toute question est une question',
  questions.every((q) => /\?$/.test(q) && q.split(' ').length >= 3),
  questions.filter((q) => !/\?$/.test(q)).join(' | '));

verifier('un pluriel se demande avec « Que sont »',
  questions.some((q) => /^Que sont les milieux froids \?$/.test(q)),
  questions.join(' | '));

verifier('un terme défini garde son article',
  questions.some((q) => /^Qu'est-ce qu'une oasis \?$/.test(q)),
  questions.join(' | '));

verifier('un terme nu est cité, sans article inventé',
  questions.some((q) => /^Que signifie « densité » dans ce cours \?$/.test(q)),
  questions.join(' | '));

verifier('le chapitre est nommé en français',
  questions.every((q) => !/ (?:sur|pour) [A-ZÀ-Ý]/.test(q))
    && questions.some((q) => /sur le chapitre « Contraintes »/.test(q)),
  questions.join(' | '));

verifier('les réponses sont des phrases finies',
  fiche.cartes.every((c) => /^[A-ZÀ-Ý0-9]/.test(c.verso) && /[.!?)]$/.test(c.verso)),
  fiche.cartes.filter((c) => !/[.!?)]$/.test(c.verso)).map((c) => c.verso).join(' | '));

console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nTout est vert.');
process.exit(echecs ? 1 : 0);
