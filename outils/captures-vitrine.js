/* ==========================================================================
   Les images de la vitrine, prises dans la vraie app
   --------------------------------------------------------------------------
   Une page de vente se juge sur ce qu'elle montre. Des maquettes dessinées
   seraient plus jolies et mentiraient : elles promettraient une app qui
   n'existe pas. Ce script ouvre donc app.html dans un vrai navigateur, à la
   taille d'un téléphone, avec des fiches d'exemple, et photographie l'écran.

   Ce qui est montré est donc, au pixel près, ce que l'élève verra. Le jour
   où l'interface change, on relance ce script et les images suivent.

   Les fiches d'exemple ci-dessous sont du contenu de démonstration écrit à
   la main — pas des fiches d'un élève réel, et pas une sortie d'IA qu'on
   ferait passer pour telle. Elles valent ce que vaut un cours de 1re.

   Prérequis : un serveur local sur le port 8321 à la racine du dépôt.
     python3 -m http.server 8321
   Lancer :
     node outils/captures-vitrine.js
   ========================================================================== */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');

const IMAGES = path.join(__dirname, '..', 'images');
const QUALITE = 72;                       // des captures d'interface plate : 72 suffit
const ECRAN = { width: 390, height: 844 };

const ilYA = (jours) => new Date(Date.now() - jours * 86400000).toISOString();

/* ————— Les fiches de démonstration ——————————————————————————————— */

const MATHS = {
  id: 'demo-maths', matiere: 'maths', source: 'scan', banqueId: null,
  titre: 'Suites arithmétiques et géométriques',
  contenu: {
    lu: true, moteur: 'claude',
    accroche: 'Trois notions, lues sur les deux pages photographiées.',
    sections: [
      {
        numero: 'I', titre: 'Les suites arithmétiques',
        texte: "Une suite est arithmétique lorsque l'on passe d'un terme au suivant en ajoutant toujours le même nombre. Ce nombre s'appelle la raison de la suite.",
        points: [
          "On reconnaît une suite arithmétique en calculant la différence entre deux termes consécutifs : si elle est constante, c'est elle.",
          "La suite des multiples de 5 est arithmétique de raison 5.",
        ],
        formules: [
          { nom: 'Relation de récurrence', latex: '$$u_{n+1} = u_n + r$$', conditions: 'pour tout entier naturel $n$' },
          { nom: 'Terme général', latex: '$$u_n = u_0 + n \\times r$$', conditions: 'si le premier terme est $u_0$' },
        ],
        lexique: [
          { terme: 'Raison', definition: "la différence constante entre un terme et son précédent" },
          { terme: 'Terme général', definition: "l'écriture de u_n en fonction de n seul, sans passer par le terme d'avant" },
        ],
        reperes: ["Raison positive : la suite monte. Raison négative : elle descend."],
      },
      {
        numero: 'II', titre: 'Les suites géométriques',
        texte: "Une suite est géométrique lorsque l'on passe d'un terme au suivant en multipliant toujours par le même nombre, appelé la raison q.",
        points: [
          "Un placement à 2 % par an donne une suite géométrique de raison 1,02.",
          "Une suite géométrique de raison strictement supérieure à 1 croît de plus en plus vite.",
        ],
        formules: [
          { nom: 'Relation de récurrence', latex: '$$u_{n+1} = q \\times u_n$$', conditions: 'pour tout entier naturel $n$' },
          { nom: 'Terme général', latex: '$$u_n = u_0 \\times q^{\\,n}$$', conditions: 'avec $q \\neq 0$' },
        ],
        lexique: [
          { terme: 'Raison q', definition: "le nombre par lequel on multiplie pour passer au terme suivant" },
          { terme: 'Taux d’évolution', definition: "le pourcentage d'augmentation, qui vaut q - 1" },
        ],
        reperes: ["q > 1 : croissance. 0 < q < 1 : décroissance vers 0."],
      },
      {
        numero: 'III', titre: 'Sens de variation',
        texte: "Le sens de variation se lit sur la raison, sans calculer les termes un par un.",
        points: ["Comparer u_{n+1} et u_n suffit à conclure pour toute la suite."],
        formules: [],
        lexique: [
          { terme: 'Suite croissante', definition: "une suite dont chaque terme est supérieur au précédent" },
          { terme: 'Suite monotone', definition: "une suite qui va toujours dans le même sens" },
        ],
        reperes: [],
      },
    ],
    points: [], formules: [], exemples: [], pieges: [], texte: '',
  },
  cartes: [
    { recto: "Qu'est-ce que la raison d'une suite arithmétique ?", verso: "La différence constante entre un terme et son précédent.", partie: 0, terme: 'Raison' },
    { recto: 'Terme général d’une suite arithmétique ?', verso: 'u_n = u_0 + n × r.', partie: 0, terme: 'Terme général' },
    { recto: 'Comment reconnaît-on une suite arithmétique ?', verso: 'La différence entre deux termes consécutifs est constante.', partie: 0, terme: 'Reconnaissance' },
    { recto: 'Qu’est-ce que la raison q d’une suite géométrique ?', verso: 'Le nombre par lequel on multiplie pour passer au terme suivant.', partie: 1, terme: 'Raison q' },
    { recto: 'Terme général d’une suite géométrique ?', verso: 'u_n = u_0 × q puissance n.', partie: 1, terme: 'Terme général' },
    { recto: 'Que vaut le taux d’évolution ?', verso: 'q - 1, exprimé en pourcentage.', partie: 1, terme: 'Taux d’évolution' },
    { recto: 'Une suite géométrique de raison 0,5 : croissante ou décroissante ?', verso: 'Décroissante : elle tend vers 0.', partie: 1, terme: 'Sens' },
    { recto: 'Qu’est-ce qu’une suite croissante ?', verso: 'Une suite dont chaque terme est supérieur au précédent.', partie: 2, terme: 'Suite croissante' },
    { recto: 'Qu’est-ce qu’une suite monotone ?', verso: 'Une suite qui va toujours dans le même sens.', partie: 2, terme: 'Suite monotone' },
    { recto: 'Comment trouve-t-on le sens de variation ?', verso: 'En comparant u_{n+1} et u_n, donc en lisant la raison.', partie: 2, terme: 'Variation' },
    { recto: 'Raison négative : que fait la suite arithmétique ?', verso: 'Elle décroît.', partie: 0, terme: 'Sens' },
    { recto: 'Placement à 2 % par an : quelle raison ?', verso: 'Une suite géométrique de raison 1,02.', partie: 1, terme: 'Application' },
  ],
  maitrise: { 0: 72, 1: 55, 2: 20 },
  creee: ilYA(11), derniereRevision: ilYA(9), palier: 1, progression: 64,
};

const HISTOIRE = {
  id: 'demo-histoire', matiere: 'histoire', source: 'scan', banqueId: null,
  titre: 'La Première Guerre mondiale',
  contenu: {
    lu: true, moteur: 'claude', accroche: 'Deux notions, lues sur ta photo.',
    sections: [
      {
        numero: 'I', titre: 'Une guerre totale',
        texte: "À partir de 1915, les États mobilisent toute la société : les hommes au front, les femmes dans les usines, l'économie tournée vers l'armement.",
        points: ["L'arrière produit pour le front : c'est ce qu'on appelle l'économie de guerre."],
        formules: [],
        lexique: [
          { terme: 'Guerre totale', definition: "une guerre où l'État mobilise toutes les ressources du pays" },
          { terme: 'Économie de guerre', definition: "une production entièrement tournée vers l'effort militaire" },
        ],
        reperes: ['1914 : entrée en guerre.', '1916 : Verdun et la Somme.'],
      },
      {
        numero: 'II', titre: 'Une violence de masse',
        texte: "Les combats de tranchées font des millions de morts et marquent durablement les survivants.",
        points: [],
        formules: [],
        lexique: [
          { terme: 'Tranchée', definition: "un fossé creusé où les soldats vivent et combattent" },
          { terme: 'Génocide', definition: "l'extermination programmée d'un peuple" },
        ],
        reperes: ['1915 : génocide des Arméniens.', '11 novembre 1918 : armistice.'],
      },
    ],
    points: [], formules: [], exemples: [], pieges: [], texte: '',
  },
  cartes: [
    { recto: "Qu'est-ce qu'une guerre totale ?", verso: "Une guerre où l'État mobilise toutes les ressources du pays.", partie: 0, terme: 'Guerre totale' },
    { recto: "Qu'est-ce que l'économie de guerre ?", verso: "Une production entièrement tournée vers l'effort militaire.", partie: 0, terme: 'Économie de guerre' },
    { recto: 'Que se passe-t-il en 1916 ?', verso: 'Les batailles de Verdun et de la Somme.', partie: 0, terme: '1916' },
    { recto: "Qu'est-ce qu'une tranchée ?", verso: 'Un fossé creusé où les soldats vivent et combattent.', partie: 1, terme: 'Tranchée' },
    { recto: 'Date de l’armistice ?', verso: 'Le 11 novembre 1918.', partie: 1, terme: 'Armistice' },
    { recto: "Qu'est-ce qu'un génocide ?", verso: "L'extermination programmée d'un peuple.", partie: 1, terme: 'Génocide' },
  ],
  maitrise: { 0: 40, 1: 25 },
  creee: ilYA(7), derniereRevision: ilYA(6), palier: 0, progression: 32,
};

const SVT = {
  id: 'demo-svt', matiere: 'svt', source: 'scan', banqueId: null,
  titre: 'La respiration cellulaire',
  contenu: {
    lu: true, moteur: 'claude', accroche: 'Une notion, lue sur ta photo.',
    sections: [
      {
        numero: 'I', titre: 'Produire de l’énergie',
        texte: "La cellule dégrade le glucose en présence de dioxygène et en tire l'énergie dont elle a besoin.",
        points: ["La mitochondrie est le lieu de la respiration cellulaire."],
        formules: [{ nom: 'Bilan', latex: '$$C_6H_{12}O_6 + 6\\,O_2 \\rightarrow 6\\,CO_2 + 6\\,H_2O$$', conditions: 'en présence de dioxygène' }],
        lexique: [
          { terme: 'Mitochondrie', definition: "l'organite où se déroule la respiration cellulaire" },
          { terme: 'ATP', definition: "la molécule qui transporte l'énergie dans la cellule" },
        ],
        reperes: [],
      },
    ],
    points: [], formules: [], exemples: [], pieges: [], texte: '',
  },
  cartes: [
    { recto: "Où se déroule la respiration cellulaire ?", verso: 'Dans la mitochondrie.', partie: 0, terme: 'Mitochondrie' },
    { recto: "À quoi sert l'ATP ?", verso: "À transporter l'énergie dans la cellule.", partie: 0, terme: 'ATP' },
    { recto: 'Que consomme la respiration cellulaire ?', verso: 'Du glucose et du dioxygène.', partie: 0, terme: 'Réactifs' },
    { recto: 'Que produit-elle ?', verso: "Du dioxyde de carbone, de l'eau et de l'énergie.", partie: 0, terme: 'Produits' },
  ],
  maitrise: { 0: 15 },
  creee: ilYA(2), derniereRevision: ilYA(1), palier: 0, progression: 18,
};

/* Cinq jours d'affilée : de quoi montrer la série, sans l'inventer dans
   l'interface — c'est bien le journal de l'appareil qui la calcule. */
function journal() {
  const jours = {};
  for (let i = 0; i < 5; i++) {
    const d = new Date(Date.now() - i * 86400000);
    const cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    jours[cle] = i === 0 ? 2 : 1 + (i % 2);
  }
  return jours;
}

const SEMENCE = `
localStorage.setItem('mathematique.niveau', 'lyceen');
localStorage.setItem('mathematique.prenom', 'Léa');
localStorage.setItem('mathematique.fiches', ${JSON.stringify(JSON.stringify([MATHS, HISTOIRE, SVT]))});
localStorage.setItem('mathematique.journal', ${JSON.stringify(JSON.stringify(journal()))});
localStorage.setItem('mathematique.record', '14');
/* Pas d'IA d'artifact ici : l'app doit se montrer telle qu'elle tourne en ligne. */
window.claude = { use: async () => null };`;

async function nouvellePage(nav) {
  const ctx = await nav.newContext({
    viewport: ECRAN, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'fr-FR', timezoneId: 'Europe/Paris',
  });
  await ctx.addInitScript(SEMENCE);
  const page = await ctx.newPage();
  await page.goto('http://localhost:8321/app.html', { waitUntil: 'load' });
  await page.waitForTimeout(700);
  // Les bulles d'activité passent devant l'interface : pas sur une capture.
  await page.evaluate(() => { try { BULLES.arreter(); } catch (e) {} });
  return { ctx, page };
}

async function prendre(page, nom, hauteur = ECRAN.height) {
  const fichier = path.join(IMAGES, `${nom}.jpg`);
  await page.screenshot({
    path: fichier, type: 'jpeg', quality: QUALITE,
    clip: { x: 0, y: 0, width: ECRAN.width, height: hauteur },
  });
  console.log(`  → images/${nom}.jpg`);
}

/** Ouvre une des trois portes (résumé, cartes, quiz) sur la n-ième fiche due. */
async function ouvrirReprise(page, rang, porte) {
  const boutons = await page.$$('#bloc-aujourdhui [data-revoir]');
  await boutons[rang].click();
  await page.waitForTimeout(400);
  await page.click(`#reprise-choix [data-reprise="${porte}"]`);
}

(async () => {
  const nav = await chromium.launch();

  /* — 1. L'accueil : la file du jour, la série, le bouton qui crée — */
  {
    const { ctx, page } = await nouvellePage(nav);
    await prendre(page, 'app-accueil');
    await ctx.close();
  }

  /* — 2. La fiche relue : sommaire, notions numérotées, maîtrise — */
  {
    const { ctx, page } = await nouvellePage(nav);
    await ouvrirReprise(page, 0, 'resume'); await page.waitForTimeout(900);
    await prendre(page, 'app-fiche');

    /* — 3. La même fiche, à hauteur d'une notion : le texte, les points
           et la formule composée par KaTeX. C'est là que se joue la
           différence avec un simple copier-coller de la photo. — */
    await page.evaluate(() => {
      const notion = document.querySelector('#partie-1');
      if (notion) window.scrollTo({ top: notion.getBoundingClientRect().top + window.scrollY - 66, behavior: 'instant' });
    });
    await page.waitForTimeout(700);
    await prendre(page, 'app-notion');
    await ctx.close();
  }

  /* — 4. Les cartes — */
  {
    const { ctx, page } = await nouvellePage(nav);
    await ouvrirReprise(page, 0, 'cartes'); await page.waitForTimeout(900);
    await prendre(page, 'app-cartes', 640);
    await ctx.close();
  }

  /* — 5. Le quiz. Sur la fiche d'histoire : ses questions sortent de la
         fiche elle-même, ce que la vitrine promet. — */
  {
    const { ctx, page } = await nouvellePage(nav);
    await ouvrirReprise(page, 1, 'quiz'); await page.waitForTimeout(2600);
    console.log('    contexte du quiz :', await page.innerText('#quiz-contexte').catch(() => '—'));
    await page.evaluate(() => window.scrollTo({ top: 170, behavior: 'instant' }));
    await page.waitForTimeout(300);
    await prendre(page, 'app-quiz', 700);
    await ctx.close();
  }

  /* — 6. L'appareil photo : le premier geste — */
  {
    const { ctx, page } = await nouvellePage(nav);
    await page.click('#ouvrir-creation'); await page.waitForTimeout(500);
    await page.click('[data-creation="scan"]'); await page.waitForTimeout(700);
    await prendre(page, 'app-scan');
    await ctx.close();
  }

  /* — 7. L'image de partage (Open Graph) : ce que voient WhatsApp,
         Instagram ou iMessage quand on colle le lien. Sans elle, un lien
         partagé n'est qu'une adresse grise que personne n'ouvre. — */
  {
    const ctx = await nav.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setContent(`<!doctype html><html lang="fr"><head><meta charset="utf-8">
      <style>
        * { box-sizing: border-box; margin: 0; }
        body { width: 1200px; height: 630px; overflow: hidden; display: flex;
               font-family: "Inter", system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
               background: radial-gradient(120% 140% at 8% 0%, #2E3F8F 0%, #1B2A6B 52%, #142051 100%);
               color: #fff; }
        .texte { flex: 1; padding: 64px 0 56px 72px; display: flex; flex-direction: column; }
        .marque { display: flex; align-items: center; gap: 14px; font-size: 26px; font-weight: 800;
                  letter-spacing: -.4px; }
        .marque svg { width: 46px; height: 46px; }
        h1 { margin-top: auto; font-size: 62px; line-height: 1.06; letter-spacing: -1.6px;
             font-weight: 800; max-width: 620px; }
        h1 em { font-style: normal; color: #9FC0F2; }
        p { margin-top: 20px; font-size: 25px; line-height: 1.4; color: #CFE0F7; max-width: 580px; }
        .puces { margin-top: auto; padding-top: 32px; display: flex; gap: 10px; }
        .puce { border: 1.5px solid rgba(207,224,247,.42); border-radius: 999px;
                padding: 9px 18px; font-size: 17px; color: #E6EEFB; white-space: nowrap; }
        .ecran { width: 452px; position: relative; }
        .cadre { position: absolute; top: 46px; left: 26px; width: 340px; height: 736px;
                 border-radius: 46px; background: #0D1430; padding: 11px;
                 box-shadow: 0 40px 90px rgba(5,10,30,.55); transform: rotate(-7deg); }
        .cadre img { width: 100%; height: 100%; object-fit: cover; object-position: top;
                     border-radius: 36px; display: block; }
      </style></head><body>
      <div class="texte">
        <div class="marque">
          <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="12" fill="#fff"/>
            <path d="M8 27c4.5 0 5.5-14 10-14s5.5 14 10 14" fill="none" stroke="#1B2A6B"
                  stroke-width="2.8" stroke-linecap="round"/>
            <circle cx="30.5" cy="12.5" r="2.7" fill="#4F5BD5"/>
          </svg>
          Brainoko
        </div>
        <h1>Photographie ton cours.<br><em>Révise-le ce soir.</em></h1>
        <p>Une photo devient une fiche claire, des flashcards et un quiz.
           Toutes les matières, sur ton téléphone.</p>
        <div class="puces">
          <span class="puce">Fiche en 30 s</span>
          <span class="puce">Révision espacée</span>
          <span class="puce">Sans publicité</span>
        </div>
      </div>
      <div class="ecran"><div class="cadre">
        <img src="http://localhost:8321/images/app-accueil.jpg" alt="">
      </div></div>
    </body></html>`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(IMAGES, 'partage.jpg'), type: 'jpeg', quality: 86 });
    console.log('  → images/partage.jpg');
    await ctx.close();
  }

  await nav.close();
  console.log('\nCaptures terminées.');
})().catch((erreur) => { console.error(erreur); process.exit(1); });
