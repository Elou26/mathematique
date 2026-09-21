/* Passe chaque générateur de questions au banc d'essai : forme des QCM,
   unicité des propositions, variété des énoncés. Lancer : node tests/generateurs.js */
const fs = require('fs');
const path = require('path');
const racine = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(racine, 'generateurs.js'), 'utf8');
(0, eval)(code + ';globalThis.G = GENERATEURS;');
const GENERATEURS = globalThis.G;

const TIRAGES = 500;
let echecs = [];

for (const [chapitre, modeles] of Object.entries(GENERATEURS)) {
  const signatures = new Set();
  for (let i = 0; i < TIRAGES; i++) {
    const modele = modeles[i % modeles.length];
    let question;
    try { question = modele(); } catch (e) { echecs.push(`${chapitre}: exception ${e.message}`); break; }

    if (!question.q || typeof question.q !== 'string') echecs.push(`${chapitre}: énoncé vide`);
    if (question.choix.length !== 4) echecs.push(`${chapitre}: ${question.choix.length} propositions — "${question.q}"`);
    if (new Set(question.choix).size !== 4) echecs.push(`${chapitre}: propositions en double — "${question.q}" ${JSON.stringify(question.choix)}`);
    if (question.choix.some((c) => c === '' || c === 'undefined' || c === 'NaN' || /undefined|NaN/.test(c)))
      echecs.push(`${chapitre}: proposition invalide — ${JSON.stringify(question.choix)}`);
    if (/undefined|NaN/.test(question.q + question.explication)) echecs.push(`${chapitre}: énoncé invalide — "${question.q}"`);
    if (question.bonne !== 0) echecs.push(`${chapitre}: la bonne réponse doit être en tête`);

    const tout = [question.q, question.explication, ...question.choix].join(' ');
    if (/-\d/.test(tout)) echecs.push(`${chapitre}: tiret ASCII devant un nombre — "${tout.match(/\S*-\d\S*/)[0]}"`);
    if (/\+ −/.test(tout)) echecs.push(`${chapitre}: « + − » mal écrit — "${question.q}"`);
    signatures.add(question.q);
  }
  const variete = signatures.size;
  console.log(`${chapitre.padEnd(14)} ${modeles.length} modèles · ${variete} énoncés différents sur ${TIRAGES} tirages`);
  if (variete < modeles.length * 2) echecs.push(`${chapitre}: trop peu de variété (${variete})`);
}

console.log('\n— Échantillon —');
for (const [chapitre, modeles] of Object.entries(GENERATEURS)) {
  const q = modeles[Math.floor(Math.random() * modeles.length)]();
  console.log(`\n[${chapitre}] ${q.q}`);
  q.choix.forEach((c, i) => console.log(`   ${i === q.bonne ? '✔' : ' '} ${c}`));
  console.log(`   → ${q.explication}`);
}

console.log(echecs.length ? `\n${echecs.length} PROBLÈMES :\n` + [...new Set(echecs)].slice(0, 20).join('\n') : '\nAucun problème détecté.');
process.exit(echecs.length ? 1 : 0);
