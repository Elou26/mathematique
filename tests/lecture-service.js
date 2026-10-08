/* Éprouve la lecture payante de bout en bout, sans réseau ni clé :
   - le serveur (serveur/index.js) avec un faux Claude à la place du SDK ;
   - la mise en fiche de ce qu'il rend (OCR.structurerFiche), qui doit
     garder les titres et les phrases du document sans rien réécrire.
   Aucun navigateur. Lancer : node tests/lecture-service.js */
const http = require('http');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

/* Ce qu'un vrai appel rendrait : la fiche déjà écrite. */
const FICHE = {
  illisible: false,
  titre: 'Les contraintes naturelles',
  matiere: 'Histoire-Géo',
  notions: [
    {
      titre: '1. Qu\'est-ce qu\'une contrainte naturelle ?',
      resume: 'Une contrainte naturelle est un élément du milieu qui gêne l\'installation des hommes. '
        + 'Le relief, le froid et l\'aridité en sont les formes les plus courantes.',
      points: ['Seuls 10 % des terres émergées concentrent l\'essentiel de la population.'],
      reperes: ['Toundra · 1 hab./km²'],
      lexique: [{ terme: 'Densité', definition: 'Le nombre d\'habitants rapporté à la superficie du territoire.' }],
      cartes: [{ question: 'Qu\'est-ce que la densité de population ?',
                 reponse: 'Le nombre d\'habitants rapporté à la superficie du territoire.' }],
    },
    {
      titre: 'Les milieux froids',
      resume: 'Le pergélisol empêche toute construction durable, car le sol gelé se déforme au dégel.',
      points: [],
      reperes: [],
      lexique: [{ terme: 'Pergélisol', definition: 'Un sol gelé en permanence.' }],
      cartes: [{ question: 'Pourquoi le pergélisol empêche-t-il de construire ?',
                 reponse: 'Parce que le sol gelé se déforme au dégel et déstabilise les fondations.' }],
    },
  ],
};

/* ————— Faux Claude : on note ce qu'on lui envoie ————————————————— */
const recu = { appels: [] };
let mode = 'ok';

const Module = require('module');
const chargerOriginal = Module._load;
Module._load = function (demande) {
  if (demande === 'stripe') return function Stripe() { return {}; };
  if (demande === '@anthropic-ai/sdk') {
    return function Anthropic(options) {
      return {
        messages: {
          create: async (params) => {
            recu.appels.push({ cle: options.apiKey, params });
            if (mode === 'cle') { const e = new Error('unauthorized'); e.status = 401; throw e; }
            if (mode === 'quota') { const e = new Error('rate limited'); e.status = 429; throw e; }
            if (mode === 'panne') { const e = new Error('boom'); e.status = 500; throw e; }
            if (mode === 'refus') return { stop_reason: 'refusal', content: [] };
            if (mode === 'tronquee') return { stop_reason: 'max_tokens', content: [] };
            if (mode === 'bavard') return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'voilà' }] };
            if (mode === 'illisible') {
              return { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'rendre_fiche',
                input: { illisible: true, titre: '', matiere: '', notions: [] } }] };
            }
            return { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'rendre_fiche', input: FICHE }] };
          },
        },
      };
    };
  }
  return chargerOriginal.apply(this, arguments);
};

process.env.CLAUDE_CLE = 'cle_de_test';
process.env.STRIPE_CLE_SECRETE = '';
process.env.ORIGINES_AUTORISEES = 'http://localhost:8321';

const routeur = require(path.join(__dirname, '..', 'serveur', 'index.js'));
const serveur = http.createServer((requete, reponse) => { routeur(requete, reponse); });

const PHOTO = `data:image/jpeg;base64,${Buffer.from('x'.repeat(400)).toString('base64')}`;

function appeler(chemin, corps) {
  return new Promise((resoudre, rejeter) => {
    const requete = http.request(
      { host: '127.0.0.1', port: serveur.address().port, path: chemin, method: corps ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8321' } },
      (reponse) => {
        const morceaux = [];
        reponse.on('data', (m) => morceaux.push(m));
        reponse.on('end', () => {
          const texte = Buffer.concat(morceaux).toString('utf8');
          let lu = null;
          try { lu = JSON.parse(texte); } catch (e) { lu = texte; }
          resoudre({ code: reponse.statusCode, corps: lu });
        });
      });
    requete.on('error', rejeter);
    if (corps) requete.write(JSON.stringify(corps));
    requete.end();
  });
}

serveur.listen(0, async () => {
  /* — 1. Une photo lue — */
  const lue = await appeler('/lecture', { pages: [PHOTO], appareil: 'a1' });
  verifier('la fiche revient', lue.code === 200 && lue.corps.fiche
    && lue.corps.fiche.titre === 'Les contraintes naturelles', JSON.stringify(lue.corps).slice(0, 120));
  verifier('le moteur est annoncé', lue.corps.moteur === 'claude', lue.corps.moteur);

  const appel = recu.appels[recu.appels.length - 1];
  verifier('la clé reste au serveur, jamais dans la page', appel.cle === 'cle_de_test', appel.cle);
  verifier('le modèle demandé est celui réglé', appel.params.model === 'claude-opus-5-5', appel.params.model);
  verifier('la photo part comme image en base64',
    appel.params.messages[0].content[0].type === 'image'
    && appel.params.messages[0].content[0].source.media_type === 'image/jpeg'
    && !/^data:/.test(appel.params.messages[0].content[0].source.data),
    JSON.stringify(appel.params.messages[0].content[0].source).slice(0, 90));
  verifier('l\'outil impose la forme de la fiche',
    appel.params.tools[0].name === 'rendre_fiche' && appel.params.tools[0].strict === true
    && appel.params.tools[0].input_schema.additionalProperties === false,
    JSON.stringify(appel.params.tools[0]).slice(0, 110));
  verifier('la consigne interdit d\'inventer',
    /N'invente jamais rien/.test(appel.params.system), (appel.params.system || '').slice(0, 60));

  /* — 2. Plusieurs pages partent dans le même appel — */
  recu.appels.length = 0;
  await appeler('/lecture', { pages: [PHOTO, PHOTO], appareil: 'a2' });
  const groupe = recu.appels[0];
  verifier('deux pages font un seul appel, pas deux',
    recu.appels.length === 1 && groupe.params.messages[0].content.filter((b) => b.type === 'image').length === 2,
    `${recu.appels.length} appel(s)`);
  verifier('le texte dit combien de pages suivent',
    /2 pages du même cours/.test(groupe.params.messages[0].content.slice(-1)[0].text),
    groupe.params.messages[0].content.slice(-1)[0].text);

  /* — 3. Les refus sont dits, jamais inventés — */
  const cas = [
    ['cle', 502, 'cle_refusee', 'une clé refusée est signalée'],
    ['quota', 429, 'ocr_surcharge', 'une surcharge est signalée'],
    ['panne', 502, 'ocr_injoignable', 'une panne est signalée'],
    ['tronquee', 502, 'lecture_tronquee', 'une réponse coupée n\'est pas servie comme une fiche'],
  ];
  for (const [m, code, erreur, nom] of cas) {
    mode = m;
    const vu = await appeler('/lecture', { pages: [PHOTO], appareil: `e-${m}` });
    verifier(nom, vu.code === code && vu.corps.erreur === erreur, JSON.stringify(vu.corps));
  }

  for (const [m, nom] of [['illisible', 'une page illisible est annoncée telle quelle'],
                          ['refus', 'un refus de sécurité ne devient pas une fiche vide'],
                          ['bavard', 'une réponse sans appel d\'outil n\'est pas inventée']]) {
    mode = m;
    const vu = await appeler('/lecture', { pages: [PHOTO], appareil: `i-${m}` });
    verifier(nom, vu.code === 200 && vu.corps.illisible === true && !vu.corps.fiche, JSON.stringify(vu.corps));
  }
  mode = 'ok';

  /* — 4. Ce qu'on refuse d'envoyer — */
  const sansPage = await appeler('/lecture', { pages: [] });
  verifier('sans page, rien n\'est envoyé', sansPage.code === 400, JSON.stringify(sansPage.corps));

  const pasUneImage = await appeler('/lecture', { pages: ['pas-une-image'] });
  verifier('une donnée qui n\'est pas une image est refusée',
    pasUneImage.code === 400 && pasUneImage.corps.erreur === 'image_invalide', JSON.stringify(pasUneImage.corps));

  const trop = await appeler('/lecture', { pages: [PHOTO, PHOTO, PHOTO, PHOTO, PHOTO] });
  verifier('au-delà de quatre pages, on refuse',
    trop.code === 400 && trop.corps.erreur === 'trop_de_pages', JSON.stringify(trop.corps));

  /* — 5. Le garde-fou de facture — */
  let derniere = null;
  for (let i = 0; i < 45; i++) derniere = await appeler('/lecture', { pages: [PHOTO], appareil: 'glouton' });
  verifier('un appareil trop gourmand est freiné',
    derniere.code === 429 && derniere.corps.erreur === 'trop_de_lectures', JSON.stringify(derniere.corps));
  const autre = await appeler('/lecture', { pages: [PHOTO], appareil: 'sage' });
  verifier('mais les autres passent toujours', autre.code === 200, JSON.stringify(autre.corps).slice(0, 60));

  /* — 6. La santé dit si la lecture est prête — */
  const sante = await appeler('/sante');
  verifier('la santé annonce la lecture', sante.corps.lecture === true, JSON.stringify(sante.corps));

  /* — 7. La fiche rendue devient une fiche de l'app, sans être réécrite — */
  const OCR = vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'ocr.js'), 'utf8') + '\n;OCR',
    vm.createContext({ console }));
  const f = OCR.structurerFiche(FICHE, { moteur: 'claude' });

  verifier('le titre du document est repris tel quel', f.titre === 'Les contraintes naturelles', f.titre);
  verifier('la matière annoncée est gardée', f.matiere === 'Histoire-Géo', f.matiere);
  verifier('les notions sont celles du document',
    f.contenu.sections.length === 2 && f.contenu.sections[1].titre === 'Les milieux froids',
    f.contenu.sections.map((s) => s.titre).join(' | '));
  verifier('le résumé est repris mot pour mot, sans être recoupé',
    f.contenu.sections[1].texte === FICHE.notions[1].resume, f.contenu.sections[1].texte);
  verifier('le résumé se termine sur une phrase entière',
    f.contenu.sections.every((s) => /[.!?]$/.test(s.texte)),
    f.contenu.sections.map((s) => s.texte.slice(-25)).join(' | '));
  verifier('les cartes sont celles écrites, rattachées à leur notion',
    f.cartes.length === 2 && f.cartes[0].partie === 0 && f.cartes[1].partie === 1
    && f.cartes[0].recto === FICHE.notions[0].cartes[0].question,
    f.cartes.map((c) => `[${c.partie}] ${c.recto}`).join(' | '));
  verifier('aucune question ne cite un numéro de partie',
    f.cartes.every((c) => !/\b\d+\.\d+\b/.test(c.recto)), f.cartes.map((c) => c.recto).join(' | '));
  verifier('une carte garde son terme quand le lexique le porte',
    f.cartes[0].terme === 'Densité', f.cartes[0].terme);
  verifier('le lexique est celui de la notion',
    f.contenu.sections[1].lexique[0].terme === 'Pergélisol',
    JSON.stringify(f.contenu.sections.map((s) => s.lexique.map((e) => e.terme))));
  verifier('les repères remontent dans les formules', f.contenu.formules.some((r) => /Toundra/.test(r)),
    JSON.stringify(f.contenu.formules));
  verifier('les notions ne portent plus les cartes en double',
    f.contenu.sections.every((s) => s.cartes === undefined),
    JSON.stringify(f.contenu.sections.map((s) => Object.keys(s))));
  verifier('une fiche vide ne produit rien',
    OCR.structurerFiche({ illisible: true, notions: [] }).contenu.sections.length === 0, 'sections');

  serveur.close();
  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nTout est vert.');
  process.exit(echecs ? 1 : 0);
});
