/* Vérifie qu'un thème du carrousel sans banque locale part bien à Claude,
   et retombe sur le panneau « non couvert » quand la capacité est absente.
   Nécessite un serveur local sur le port 8321. Lancer : node tests/generation-carrousel.js */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const SD = process.env.SD || '/tmp';
const FAUX = (mode) => `
window.claude = { use: async (n) => {
  if (n !== 'sample' || '${mode}' === 'absent') return null;
  const f = async () => ({ text: '', truncated: false });
  f.json = async (invite, opts) => {
    window.__invite = invite;
    await new Promise(r => setTimeout(r, 150));
    if (opts && opts.onText) opts.onText({ text: '{"titre"', delta: '{' });
    return { titre: 'Second degré sur mesure', questions: [
      { enonce: 'Discriminant de x² − 5x + 6 ?', choix: ['1','−1','25','13'], bonne: 0, explication: 'b² − 4ac = 25 − 24 = 1.' },
      { enonce: 'Ses racines ?', choix: ['2 et 3','−2 et −3','1 et 6','aucune'], bonne: 0, explication: '(5 ± 1)/2.' }] };
  };
  return f;
} };`;
(async () => {
  const b = await chromium.launch();
  for (const mode of ['ok', 'absent']) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(FAUX(mode));
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:8321/', { waitUntil: 'networkidle' });
    await p.waitForTimeout(300);
    await p.click('text=Lycéen'); await p.waitForTimeout(400);

    // ——— chemin du carrousel : « Second degré », sans banque locale
    await p.click('.matiere-carte[data-matiere="maths"]'); await p.waitForTimeout(300);
    const themes = await p.$$eval('.theme-nom', e => e.map(x => x.textContent));
    const rang = themes.indexOf('Second degré');
    await p.click(`.theme[data-theme="${rang}"]`); await p.waitForTimeout(400);
    await p.click('#bouton-quiz'); await p.waitForTimeout(1500);
    const enJeu = await p.evaluate(() => !document.querySelector('#jeu-quiz').hidden);
    console.log(`[${mode}] carrousel « Second degré » →`,
      enJeu ? 'quiz : ' + await p.$eval('#quiz-question', e => e.textContent) : 'panneau « non couvert »');
    if (enJeu) console.log('        contexte :', await p.$eval('#quiz-contexte', e => e.textContent));
    else {
      const actions = await p.$$eval('#indispo-quiz [data-indispo]', e => e.map(x => x.textContent));
      console.log('        actions :', actions.join(' | '));
    }
    if (mode === 'ok') await p.screenshot({ path: SD + '/carrousel-claude.png' });
    if (errs.length) console.log('        ERREURS :', errs);
    await ctx.close();
  }
  await b.close();
})();
