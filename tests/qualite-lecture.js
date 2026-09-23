/* Banc d'essai de la lecture : on imprime des pages dont on connaît le texte,
   on les dégrade comme une vraie photo (rotation, ombre, bruit, compression),
   et on mesure ce que la lecture en retrouve — et ce qu'elle invente.
   Nécessite un serveur local sur le port 8321. Lancer : node tests/qualite-lecture.js */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const PLANCHER_MOTS = 90;     // % des mots du cours qu'il faut retrouver
const PLAFOND_BRUIT = 10;     // % de mots lus qui n'existent pas dans la page

const PAGES = {
  maths: [
    "1ère STMG              Chap. 6 - Suites arithmétiques",
    "Chapitre 6",
    "Suites arithmétiques et géométriques",
    "I. Suites arithmétiques",
    "1) Définition",
    "Une suite arithmétique est une suite dont la différence entre",
    "un terme et son précédent reste constante.",
    "Exemple : la différence vaut 5 et le premier terme est 3.",
    "U0 = 3, U1 = 8, U2 = 13, U3 = 18.",
    "Propriété : pour tout entier n, Un = U0 + n x r.",
    "Raison : la différence constante entre deux termes consécutifs.",
  ],
  histoire: [
    "Terminale                    Chapitre 4",
    "La guerre froide (1947-1991)",
    "I. Un monde bipolaire",
    "1) Définition",
    "La guerre froide est un affrontement indirect entre les",
    "États-Unis et l'URSS, sans conflit armé direct.",
    "1947 : doctrine Truman et plan Marshall.",
    "1961 : construction du mur de Berlin.",
    "1962 : crise des missiles de Cuba.",
    "Propriété : chaque crise renforce les deux blocs.",
  ],
};

const normaliser = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();

function motsRetrouves(attendu, lu) {
  const mots = normaliser(attendu).split(' ').filter((m) => m.length > 1);
  const plat = ` ${normaliser(lu)} `;
  return Math.round((mots.filter((m) => plat.includes(` ${m} `)).length / mots.length) * 100);
}

function motsInventes(attendu, lu) {
  const attendus = new Set(normaliser(attendu).split(' '));
  const lus = normaliser(lu).split(' ').filter(Boolean);
  if (!lus.length) return 100;
  return Math.round((lus.filter((m) => !attendus.has(m)).length / lus.length) * 100);
}

let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

(async () => {
  const nav = await chromium.launch();

  /** Imprime une page de cours, et la dégrade comme une photo prise de travers. */
  async function image(lignes, degrade) {
    const p = await nav.newPage({ viewport: { width: 1240, height: 1600 } });
    await p.setContent(`<body style="margin:0;background:#fff">
      <div style="padding:60px;font:32px/1.7 Georgia,'DejaVu Serif',serif;color:#111">
        ${lignes.map((l) => `<div>${l || '&nbsp;'}</div>`).join('')}
      </div></body>`);
    const brut = await p.screenshot();
    await p.close();
    if (!degrade) return brut;

    const q = await nav.newPage({ viewport: { width: 1240, height: 1600 } });
    await q.setContent('<body style="margin:0"><canvas id="c" width="1240" height="1600"></canvas></body>');
    const sortie = await q.evaluate(async (src) => {
      const img = new Image();
      await new Promise((r) => { img.onload = r; img.src = src; });
      const c = document.getElementById('c');
      const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      x.save();
      x.translate(c.width / 2, c.height / 2);
      x.rotate(-1.6 * Math.PI / 180);
      x.scale(0.94, 0.94);
      x.drawImage(img, -c.width / 2, -c.height / 2);
      x.restore();
      const ombre = x.createLinearGradient(0, 0, c.width, c.height);
      ombre.addColorStop(0, 'rgba(0,0,0,0)');
      ombre.addColorStop(1, 'rgba(0,0,0,0.38)');
      x.fillStyle = ombre; x.fillRect(0, 0, c.width, c.height);
      const d = x.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < d.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 34;
        d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n;
      }
      x.putImageData(d, 0, 0);
      return c.toDataURL('image/jpeg', 0.55);
    }, `data:image/png;base64,${brut.toString('base64')}`);
    await q.close();
    return Buffer.from(sortie.split(',')[1], 'base64');
  }

  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript('window.claude = { use: async () => null };');
  const page = await ctx.newPage();
  await page.goto('http://localhost:8321/index.html');
  await page.waitForTimeout(400);

  let sommeMots = 0;
  let sommeBruit = 0;
  let cas = 0;

  for (const [nom, lignes] of Object.entries(PAGES)) {
    for (const degrade of [false, true]) {
      const buf = await image(lignes, degrade);
      const lu = await page.evaluate(async (src) => {
        const blob = await (await fetch(src)).blob();
        try { return (await OCR.lire([blob])).texte; }
        catch (e) { return `ÉCHEC ${e && e.code ? e.code : e}`; }
      }, `data:image/jpeg;base64,${buf.toString('base64')}`);

      const attendu = lignes.join(' ');
      const retrouves = motsRetrouves(attendu, lu);
      const inventes = motsInventes(attendu, lu);
      sommeMots += retrouves; sommeBruit += inventes; cas++;

      const etiquette = `${nom} ${degrade ? 'photo dégradée' : 'page nette'}`;
      verifier(`${etiquette} : ${retrouves} % des mots retrouvés`, retrouves >= PLANCHER_MOTS,
        `${retrouves} %, plancher ${PLANCHER_MOTS} % — ${lu.replace(/\s+/g, ' ').slice(0, 120)}`);
      verifier(`${etiquette} : ${inventes} % de bruit`, inventes <= PLAFOND_BRUIT,
        `${inventes} %, plafond ${PLAFOND_BRUIT} % — ${lu.replace(/\s+/g, ' ').slice(0, 120)}`);
    }
  }

  console.log(`\nmoyenne : ${Math.round(sommeMots / cas)} % des mots retrouvés · ${Math.round(sommeBruit / cas)} % de bruit`);
  await nav.close();
  if (echecs) { console.log(`\n${echecs} vérification(s) en échec.`); process.exit(1); }
  console.log('Qualité de lecture : au-dessus des seuils.');
})();
