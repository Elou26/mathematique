/* Éprouve la sécurité du site telle qu'elle sera servie en ligne.
   --------------------------------------------------------------------------
   Une politique de sécurité du contenu (CSP) écrite sans être essayée est
   un piège : elle ne se voit pas à l'œil nu, et elle casse en silence le
   jour où un élève ouvre la page. Ce test sert donc les vraies pages avec
   les vrais en-têtes de `vercel.json`, les charge dans un navigateur, et
   n'accepte aucune violation.

   Nécessite Playwright. Lancer : node tests/securite.js */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

/* ————— Les en-têtes de production, tels quels ——————————————————— */
const config = JSON.parse(fs.readFileSync(path.join(RACINE, 'vercel.json'), 'utf8'));
const regle = (config.headers || []).find((r) => r.source === '/(.*)');
const ENTETES = {};
for (const entete of (regle ? regle.headers : [])) ENTETES[entete.key] = entete.value;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm',
};

const serveur = http.createServer((requete, reponse) => {
  const demande = decodeURIComponent(requete.url.split('?')[0]);
  const fichier = path.join(RACINE, demande === '/' ? 'index.html' : demande);
  if (!fichier.startsWith(RACINE) || !fs.existsSync(fichier) || fs.statSync(fichier).isDirectory()) {
    reponse.writeHead(404, ENTETES); reponse.end('non'); return;
  }
  reponse.writeHead(200, { ...ENTETES, 'Content-Type': TYPES[path.extname(fichier)] || 'application/octet-stream' });
  reponse.end(fs.readFileSync(fichier));
});

/* ————— Ce que la CSP doit interdire ————————————————————————————
   Les deux portes dérobées classiques : « unsafe-inline » sur les scripts
   rend inoffensive toute la politique (un script glissé dans la page
   s'exécuterait), et « unsafe-eval » rouvre eval(). */
function analyserCsp(valeur) {
  const regles = {};
  for (const morceau of String(valeur || '').split(';')) {
    const mots = morceau.trim().split(/\s+/);
    if (mots[0]) regles[mots[0]] = mots.slice(1);
  }
  return regles;
}

serveur.listen(0, async () => {
  const base = `http://127.0.0.1:${serveur.address().port}`;
  const csp = analyserCsp(ENTETES['Content-Security-Policy']);

  verifier('une politique de sécurité du contenu est servie',
    Boolean(ENTETES['Content-Security-Policy']), JSON.stringify(Object.keys(ENTETES)));
  verifier('les scripts en ligne ne sont pas autorisés',
    Array.isArray(csp['script-src']) && !csp['script-src'].includes("'unsafe-inline'"),
    JSON.stringify(csp['script-src']));
  verifier('eval() reste fermé',
    !/'unsafe-eval'/.test(ENTETES['Content-Security-Policy'] || ''),
    ENTETES['Content-Security-Policy']);
  verifier('le site ne peut pas être mis dans le cadre d\'un autre',
    (csp['frame-ancestors'] || []).includes("'none'") && ENTETES['X-Frame-Options'] === 'DENY',
    JSON.stringify(csp['frame-ancestors']));
  verifier('rien ne peut être chargé par défaut hors du site',
    (csp['default-src'] || []).join() === "'self'", JSON.stringify(csp['default-src']));
  verifier('les greffons et objets sont interdits',
    (csp['object-src'] || []).includes("'none'"), JSON.stringify(csp['object-src']));
  verifier('une balise <base> injectée ne peut pas détourner les liens',
    (csp['base-uri'] || []).includes("'self'"), JSON.stringify(csp['base-uri']));
  verifier('un formulaire ne peut pas être envoyé ailleurs',
    (csp['form-action'] || []).includes("'self'"), JSON.stringify(csp['form-action']));

  verifier('le navigateur est tenu de rester en HTTPS (HSTS)',
    /max-age=\d{7,}/.test(ENTETES['Strict-Transport-Security'] || ''),
    ENTETES['Strict-Transport-Security']);
  verifier('les types de fichiers ne sont pas devinés',
    ENTETES['X-Content-Type-Options'] === 'nosniff', ENTETES['X-Content-Type-Options']);
  verifier('l\'adresse visitée ne fuit pas vers les autres sites',
    /strict-origin/.test(ENTETES['Referrer-Policy'] || ''), ENTETES['Referrer-Policy']);
  verifier('le micro et la position sont refusés à la page',
    /microphone=\(\)/.test(ENTETES['Permissions-Policy'] || '')
      && /geolocation=\(\)/.test(ENTETES['Permissions-Policy'] || ''),
    ENTETES['Permissions-Policy']);
  /* L'appareil photo, lui, reste permis : c'est le scan d'un cours. */
  verifier('l\'appareil photo reste permis au site lui-même',
    /camera=\(self\)/.test(ENTETES['Permissions-Policy'] || ''), ENTETES['Permissions-Policy']);
  verifier('la fenêtre d\'entrée Google reste ouvrable (COOP)',
    ENTETES['Cross-Origin-Opener-Policy'] === 'same-origin-allow-popups',
    ENTETES['Cross-Origin-Opener-Policy']);

  /* ————— Aucun script écrit dans le HTML ————————————————————————
     Un seul suffirait à obliger la CSP à autoriser « unsafe-inline ». */
  for (const page of ['index.html', 'app.html', 'confidentialite.html']) {
    const html = fs.readFileSync(path.join(RACINE, page), 'utf8');
    const enLigne = (html.match(/<script(?![^>]*\ssrc=)[^>]*>/gi) || []);
    verifier(`${page} n'écrit aucun script dans la page`, enLigne.length === 0, enLigne.join(' '));
    const gestionnaires = (html.match(/\son(click|load|error|submit|change|input)=/gi) || []);
    verifier(`${page} n'attache aucun gestionnaire dans le HTML`,
      gestionnaires.length === 0, gestionnaires.join(' '));
  }

  /* ————— Aucune clé ne doit dormir dans le dépôt ————————————————
     Une clé commise est publiée : l'historique garde ce que le dernier
     commit efface, et il faut la révoquer, pas la retirer. Ce test est
     là pour que cela n'arrive jamais une première fois.

     Les motifs exigent une vraie longueur : « sk_live_… » écrit dans la
     documentation ne doit pas déclencher l'alarme, sans quoi on finirait
     par ne plus la croire. */
  const MOTIFS = [
    [/sk_live_[A-Za-z0-9]{16,}/, 'clé Stripe réelle'],
    [/sk_test_[A-Za-z0-9]{16,}/, 'clé Stripe de test'],
    [/rk_live_[A-Za-z0-9]{16,}/, 'clé Stripe limitée'],
    [/whsec_[A-Za-z0-9]{16,}/, 'secret de webhook Stripe'],
    [/sk-ant-[A-Za-z0-9_-]{20,}/, 'clé Claude'],
    [/\bre_[A-Za-z0-9_-]{24,}/, 'clé Resend'],
    [/xkeysib-[A-Za-z0-9-]{24,}/, 'clé Brevo'],
    [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./, 'jeton JWT (clé Supabase ?)'],
  ];
  const IGNORES = new Set(['node_modules', '.git', 'moteur', 'maths', 'images', 'captures']);
  const trouvees = [];
  (function parcourir(dossier) {
    for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
      if (IGNORES.has(entree.name)) continue;
      const complet = path.join(dossier, entree.name);
      if (entree.isDirectory()) { parcourir(complet); continue; }
      if (!/\.(js|json|html|css|md|sql|txt|yml|yaml|exemple)$/.test(entree.name)) continue;
      const texte = fs.readFileSync(complet, 'utf8');
      for (const [motif, quoi] of MOTIFS) {
        if (motif.test(texte)) trouvees.push(`${path.relative(RACINE, complet)} : ${quoi}`);
      }
    }
  })(RACINE);
  verifier('aucune clé n\'est écrite dans le dépôt', trouvees.length === 0, trouvees.join(' | '));

  /* Et rien de secret ne doit vivre dans ce que le navigateur télécharge :
     tout ce qui est servi à la page est lisible par qui l'ouvre. */
  const cotePage = ['app.js', 'abonnement.js', 'compte.js', 'ocr.js', 'vitrine.js', 'reglages.js', 'data.js']
    .map((f) => fs.readFileSync(path.join(RACINE, f), 'utf8')).join('\n');
  verifier('aucune clé secrète n\'est nommée côté page',
    !/STRIPE_CLE_SECRETE|service_role|CLAUDE_CLE|SECRET_COMPTES|BREVO_CLE|RESEND_CLE/.test(cotePage),
    (cotePage.match(/STRIPE_CLE_SECRETE|service_role|CLAUDE_CLE|SECRET_COMPTES/g) || []).join(' '));

  /* ————— Et maintenant, le navigateur ———————————————————————————
     Le seul juge qui compte : une politique qui casse la page est pire
     qu'une politique absente, parce qu'elle casse en silence. */
  const navigateur = await chromium.launch();
  for (const page of ['index.html', 'app.html', 'confidentialite.html']) {
    const contexte = await navigateur.newContext();
    const onglet = await contexte.newPage();
    const violations = [];
    const erreurs = [];
    await onglet.exposeFunction('noterViolation', (d) => violations.push(d));
    await onglet.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        window.noterViolation(`${e.violatedDirective} ← ${e.blockedURI}`);
      });
    });
    onglet.on('pageerror', (e) => erreurs.push(String(e && e.message)));
    await onglet.goto(`${base}/${page}`);
    await onglet.waitForTimeout(1500);

    verifier(`${page} se charge sans violer la politique`,
      violations.length === 0, violations.join(' | '));
    verifier(`${page} se charge sans erreur de script`,
      erreurs.length === 0, erreurs.join(' | '));
    await contexte.close();
  }

  /* Les réglages sont bien arrivés, malgré leur déménagement hors du HTML :
     sans eux, l'app tournerait sans serveur et personne ne le verrait. */
  const contexte = await navigateur.newContext();
  const onglet = await contexte.newPage();
  await onglet.goto(`${base}/app.html`);
  const regles = await onglet.evaluate(() => [
    window.MATHEMATIQUE_LECTURE && window.MATHEMATIQUE_LECTURE.api,
    window.MATHEMATIQUE_PAIEMENT && window.MATHEMATIQUE_PAIEMENT.api,
    window.MATHEMATIQUE_COMPTE && window.MATHEMATIQUE_COMPTE.api,
  ]);
  /* ————— Les deux mécanismes qui cassent en silence ——————————————
     Le moteur de lecture embarqué tourne dans un worker créé à partir
     d'un blob, et compile du WebAssembly. Une CSP qui oublie « blob: »
     ou « wasm-unsafe-eval » laisse la page s'afficher parfaitement et ne
     fait tomber que le scan — c'est-à-dire la raison d'être de l'app. */
  const worker = await onglet.evaluate(async () => {
    try {
      const url = URL.createObjectURL(new Blob(['self.postMessage("là")'], { type: 'text/javascript' }));
      const w = new Worker(url);
      return await new Promise((resoudre) => {
        w.onmessage = (e) => { w.terminate(); resoudre(e.data); };
        w.onerror = () => { w.terminate(); resoudre('refusé'); };
        setTimeout(() => resoudre('silence'), 2000);
      });
    } catch (erreur) { return `refusé : ${erreur.message}`; }
  });
  verifier('le moteur de lecture peut lancer son worker', worker === 'là', String(worker));

  const wasm = await onglet.evaluate(async () => {
    /* Le plus petit module WebAssembly valide : un en-tête, rien dedans. */
    const octets = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
    try { await WebAssembly.instantiate(octets); return 'compilé'; }
    catch (erreur) { return `refusé : ${erreur.message}`; }
  });
  verifier('et compiler son WebAssembly', wasm === 'compilé', String(wasm));

  verifier('les réglages sortis du HTML arrivent quand même à l\'app',
    regles.join() === '/api,/api,/api', JSON.stringify(regles));
  await contexte.close();

  /* ————— Un cours piégé reste du texte ————————————————————————
     Le scénario : un camarade écrit une balise sur une feuille, l'élève
     la photographie, et le texte revient de la lecture tel quel. S'il
     était inséré en HTML, le script tournerait dans sa session — avec
     accès à son jeton de connexion. Il doit s'afficher, pas s'exécuter.
     ———————————————————————————————————————————————————————————— */
  const PIEGE = '<img src=x onerror="window.__piege = true">';
  const hier = new Date(Date.now() - 86400000).toISOString();
  const fichePiegee = {
    id: 'f1', matiere: 'autre', titre: 'Chapitre piégé', source: 'scan', banqueId: null,
    contenu: {
      lu: true, moteur: 'claude', accroche: `Accroche ${PIEGE}`,
      sections: [{ titre: 'Partie', texte: 'Du texte.', points: [], reperes: [], formules: [], lexique: [] }],
      points: [], formules: [], exemples: [], pieges: [], texte: '',
    },
    cartes: [
      { recto: `Question ? ${PIEGE}`, verso: `Réponse. ${PIEGE}`, partie: 0, terme: 'Terme' },
      { recto: 'Deuxième question ?', verso: 'Deuxième réponse.', partie: 0, terme: 'Autre' },
    ],
    creee: hier, derniereRevision: hier, palier: 0, progression: 30,
  };

  for (const [mode, cible] of [['cartes', '#carte-recto'], ['quiz', '#quiz-question']]) {
    const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(`
      window.MATHEMATIQUE_COMPTE = { api: "" };
      window.claude = { use: async () => null };
      localStorage.setItem('mathematique.niveau', 'lyceen');
      localStorage.setItem('mathematique.fiches', ${JSON.stringify(JSON.stringify([fichePiegee]))});`);
    const vue = await ctx.newPage();
    await vue.goto(`${base}/app.html`);
    await vue.waitForTimeout(700);
    await vue.click('#bloc-aujourdhui [data-revoir]');
    await vue.waitForTimeout(350);
    await vue.click(`#reprise-choix [data-reprise="${mode}"]`);
    await vue.waitForTimeout(1800);

    const bilan = await vue.evaluate((selecteur) => ({
      piege: Boolean(window.__piege),
      images: document.querySelectorAll(`${selecteur} img`).length,
      texte: (document.querySelector(selecteur) || {}).textContent || '',
      corps: document.body.innerHTML,
    }), cible);

    verifier(`${mode} : la balise cachée dans le cours ne s'exécute pas`,
      bilan.piege === false, 'le piège a tourné');
    verifier(`${mode} : elle n'a même pas créé de balise`,
      bilan.images === 0 && !/<img src=x onerror/.test(bilan.corps),
      `${bilan.images} image(s) dans ${cible}`);
    await ctx.close();
  }

  await navigateur.close();
  serveur.close();
  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nTout est vert.');
  process.exit(echecs ? 1 : 0);
});
