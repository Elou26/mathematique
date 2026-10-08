/* Éprouve le rendu des formules :
   - KaTeX est bien embarqué et servi depuis le site, sans CDN ;
   - une fiche qui arrive en LaTeX s'affiche comme des mathématiques ;
   - une formule garde ses conditions, et une fiche sans maths ne change pas.
   Lancer : node tests/maths.js (serveur local sur 8321) */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

(async () => {
  /* — 1. Ce qui est embarqué l'est vraiment — */
  const racine = path.join(__dirname, '..');
  for (const fichier of ['maths/katex.min.js', 'maths/auto-render.min.js', 'maths/katex.min.css']) {
    verifier(`${fichier} est dans le dépôt`, fs.existsSync(path.join(racine, fichier)), 'absent');
  }
  const css = fs.readFileSync(path.join(racine, 'maths/katex.min.css'), 'utf8');
  const polices = (css.match(/url\(([^)]+)\)/g) || []).map((u) => u.slice(4, -1));
  verifier('la feuille ne réclame que des woff2 embarqués',
    polices.every((u) => u.endsWith('.woff2')
      && fs.existsSync(path.join(racine, 'maths', u.replace(/^fonts\//, 'fonts/')))),
    polices.filter((u) => !u.endsWith('.woff2')).join(', ') || 'chemin manquant');

  const page = fs.readFileSync(path.join(racine, 'index.html'), 'utf8');
  verifier('rien n\'est chargé depuis un CDN',
    !/<(script|link)[^>]+(cdn|unpkg|jsdelivr|googleapis)/i.test(page),
    (page.match(/<(script|link)[^>]+(cdn|unpkg|jsdelivr|googleapis)[^>]*>/i) || [])[0]);

  /* — 2. Dans un vrai navigateur — */
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(`window.MATHEMATIQUE_LECTURE = { api: "" };`);
  const p = await ctx.newPage();
  const erreurs = [];
  p.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
  p.on('requestfailed', (r) => erreurs.push(`requête échouée : ${r.url()}`));
  await p.goto('http://localhost:8321/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof MATHS !== 'undefined' && MATHS.pret(), null, { timeout: 15000 })
    .catch(() => {});

  verifier('KaTeX est prêt dans la page', await p.evaluate(() => MATHS.pret()), 'MATHS.pret() faux');

  /* Un bloc de fiche comme en produirait une lecture de cours de maths. */
  await p.evaluate(() => {
    const bloc = document.createElement('div');
    bloc.id = 'essai-maths';
    bloc.innerHTML = '<p>Intégrale : $\\int_a^b f(x)\\,dx = F(b) - F(a)$ — f continue sur [a ; b]</p>'
      + '<p>Bloc : $$\\mathcal{D} = \\{x \\in \\mathbb{R}\\}$$</p>';
    document.body.appendChild(bloc);
  });
  await p.waitForTimeout(600);

  const rendu = await p.evaluate(() => {
    const bloc = document.getElementById('essai-maths');
    return {
      formules: bloc.querySelectorAll('.katex').length,
      bloc: bloc.querySelectorAll('.katex-display').length,
      dollars: (bloc.textContent.match(/\$/g) || []).length,
      conditions: /f continue sur \[a ; b\]/.test(bloc.textContent),
      rouge: bloc.innerHTML.indexOf('B4232C') !== -1,
    };
  });

  verifier('les formules sont rendues, pas affichées en LaTeX',
    rendu.formules >= 2, `${rendu.formules} formule(s)`);
  verifier('une formule isolée est rendue en bloc', rendu.bloc >= 1, `${rendu.bloc}`);
  verifier('plus aucun $ ne subsiste dans le texte', rendu.dollars === 0, `${rendu.dollars} restant(s)`);
  verifier('les conditions restent lisibles à côté de la formule', rendu.conditions, 'perdues');
  verifier('aucune formule n\'est tombée en erreur', !rendu.rouge, 'du rouge d\'erreur dans le rendu');

  /* — 3. Une page sans maths n'est pas touchée, et rien ne boucle — */
  const sansMaths = await p.evaluate(async () => {
    const bloc = document.createElement('div');
    bloc.id = 'essai-texte';
    bloc.textContent = 'La guerre froide oppose deux blocs de 1947 à 1991.';
    document.body.appendChild(bloc);
    await new Promise((r) => setTimeout(r, 400));
    return { html: bloc.innerHTML, katex: bloc.querySelectorAll('.katex').length };
  });
  verifier('un texte sans formule reste intact',
    sansMaths.katex === 0 && /guerre froide/.test(sansMaths.html), sansMaths.html.slice(0, 60));

  const stable = await p.evaluate(async () => {
    const avant = document.getElementById('essai-maths').innerHTML;
    await new Promise((r) => setTimeout(r, 700));
    return avant === document.getElementById('essai-maths').innerHTML;
  });
  verifier('le rendu ne se relit pas lui-même en boucle', stable, 'le contenu change tout seul');

  verifier('aucune erreur console ni requête échouée', erreurs.length === 0, erreurs.join(' || '));

  await ctx.close();
  await nav.close();
  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nTout est vert.');
  process.exit(echecs ? 1 : 0);
})();
