/* Éprouve ce qui part réellement au service quand l'élève photographie :
   une photo de téléphone pèse plusieurs mégaoctets, le plafond de
   l'hébergeur est à 4 Mo, et le service redimensionne de toute façon
   au-delà de 1568 px. L'envoyer brute, c'est faire échouer la lecture dès
   la première page pour aucun détail gagné.
   Lancer : node tests/photo-envoi.js (serveur local sur 8321) */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

(async () => {
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(`window.MATHEMATIQUE_LECTURE = { api: "" };`);
  const p = await ctx.newPage();
  await p.goto('http://localhost:8321/index.html', { waitUntil: 'load' });

  const m = await p.evaluate(async () => {
    const pageDeCours = (l, h) => {
      const toile = document.createElement('canvas');
      toile.width = l; toile.height = h;
      const ctx = toile.getContext('2d');
      ctx.fillStyle = '#f6f3ea'; ctx.fillRect(0, 0, l, h);
      ctx.fillStyle = '#1a1a2e'; ctx.font = `${Math.round(h / 60)}px serif`;
      for (let y = h / 25; y < h; y += h / 33) {
        ctx.fillText('Soit f continue sur [a ; b]. On pose F(x) = ∫ f(t) dt.', l / 40, y);
      }
      return new Promise((r) => toile.toBlob(r, 'image/jpeg', 0.92));
    };

    const grande = await pageDeCours(4032, 3024);     // photo de téléphone
    const reduite = await OCR.__photoPourService(grande);
    const bm = await createImageBitmap(reduite);
    const uri = await new Promise((r) => {
      const l = new FileReader(); l.onload = () => r(String(l.result)); l.readAsDataURL(reduite);
    });

    const petite = await pageDeCours(1200, 900);      // déjà sous la limite
    const laissee = await OCR.__photoPourService(petite);

    return {
      avant: grande.size, apres: reduite.size, base64: uri.length,
      cote: Math.max(bm.width, bm.height), couleur: uri.startsWith('data:image/jpeg'),
      petiteIntacte: laissee === petite || laissee.size <= petite.size,
    };
  });

  verifier('une photo de téléphone est réduite avant l\'envoi',
    m.apres < m.avant / 2, `${(m.avant / 1024).toFixed(0)} Ko → ${(m.apres / 1024).toFixed(0)} Ko`);
  verifier('le plus grand côté tombe à 1568 px, pas en dessous',
    m.cote === 1568, `${m.cote} px`);
  verifier('quatre pages tiennent sous le plafond de 4 Mo',
    m.base64 * 4 < 4000000, `${((m.base64 * 4) / 1024 / 1024).toFixed(2)} Mo`);
  verifier('l\'image reste en JPEG, donc en couleur',
    m.couleur, 'format inattendu — un PNG noir et blanc perdrait le crayon');
  verifier('une image déjà petite n\'est pas réencodée pour rien',
    m.petiteIntacte, 'elle a grossi au passage');

  await ctx.close();
  await nav.close();
  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nTout est vert.');
  process.exit(echecs ? 1 : 0);
})();
