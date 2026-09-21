/* Éprouve les quatre issues de la génération par Claude (réponse valable, quota,
   réponse inexploitable, capacité absente) avec un faux runtime d'artefact.
   Nécessite un serveur local sur le port 8321. Lancer : node tests/generation-claude.js */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const SD = process.env.SD || '/tmp';

// Faux runtime d'artefact, pour éprouver le chemin « Claude répond »
const FAUX_CLAUDE = (mode) => `
window.claude = {
  use: async (nom) => {
    if (nom !== 'sample') return null;
    if ('${mode}' === 'absent') return null;
    const f = async () => ({ text: '', truncated: false });
    f.json = async (invite, opts) => {
      window.__invite = invite;
      if (opts && opts.onText) opts.onText({ text: '{"titre":"…', delta: '{' });
      await new Promise(r => setTimeout(r, 120));
      if ('${mode}' === 'erreur') throw { code: 'rate_limited', message: 'trop' };
      if ('${mode}' === 'cassé') return { questions: [{ enonce: 'x', choix: ['a','a','a','a'], bonne: 9 }] };
      return { titre: 'Dérivées sur mesure', questions: [
        { enonce: 'Dérivée de f(x) = 5x³ ?', choix: ['15x²','5x²','3x²','15x³'], bonne: 0, explication: 'On multiplie par l exposant puis on l abaisse.' },
        { enonce: 'f'+String.fromCharCode(39)+'(a) représente ?', choix: ['la pente de la tangente','l aire','la limite','l ordonnée'], bonne: 0, explication: 'C est le coefficient directeur de la tangente.' },
      ] };
    };
    f.limits = async () => ({ maxPromptBytes: 65536 });
    return f;
  }
};`;

(async () => {
  const b = await chromium.launch();
  for (const mode of ['ok', 'erreur', 'cassé', 'absent']) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(FAUX_CLAUDE(mode));
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:8321/', { waitUntil: 'networkidle' });
    await p.waitForTimeout(300);
    await p.click('text=Lycéen'); await p.waitForTimeout(300);
    await p.click('#ouvrir-creation'); await p.waitForTimeout(250);
    await p.click('[data-creation="ia"]'); await p.waitForTimeout(400);
    const moteur = await p.$eval('#ia-moteur', e => e.hidden ? '(masqué)' : e.textContent.trim());
    await p.fill('#ia-demande', '6 questions sur les dérivées, niveau terminale, surtout le calcul');
    await p.waitForTimeout(150);
    await p.click('#bouton-ia'); await p.waitForTimeout(1500);

    const enJeu = await p.evaluate(() => !document.querySelector('#jeu-quiz').hidden);
    const question = enJeu ? await p.$eval('#quiz-question', e => e.textContent) : '—';
    const contexte = enJeu ? await p.$eval('#quiz-contexte', e => e.textContent) : '—';
    const message = await p.$eval('#ia-message', e => e.hidden ? '' : e.textContent);
    const indispo = await p.evaluate(() => !document.querySelector('#indispo-quiz').hidden);
    console.log(`[${mode}] moteur: ${moteur.slice(0, 48)}`);
    console.log(`        → ${enJeu ? 'quiz lancé : ' + question : (indispo ? 'panneau « non couvert »' : 'reste sur la page')} ${message ? '| message: ' + message : ''}`);
    if (enJeu) console.log(`        contexte : ${contexte}`);
    if (mode === 'ok') {
      console.log('        invite envoyée :', (await p.evaluate(() => window.__invite)).split('\\n')[0]);
      await p.screenshot({ path: SD + '/ia-claude.png' });
    }
    if (errs.length) console.log('        ERREURS :', errs);
    await ctx.close();
  }
  await b.close();
})();
