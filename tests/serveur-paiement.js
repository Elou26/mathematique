/* Éprouve le serveur de paiement (serveur/index.js) sans toucher à Stripe :
   le module `stripe` est remplacé par un faux avant le chargement.
   Aucun réseau, aucun navigateur. Lancer : node tests/serveur-paiement.js */
const http = require('http');
const path = require('path');
const Module = require('module');

let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

/* ————— Faux Stripe —————————————————————————————————————————————
   On note ce qui lui est demandé, et on répond comme le vrai le ferait. */
const journal = { sessions: [] };
const MOIS_PROCHAIN = Math.floor(Date.now() / 1000) + 30 * 86400;

function fauxStripe() {
  return {
    checkout: {
      sessions: {
        create: async (options) => {
          journal.sessions.push(options);
          return { url: 'https://checkout.stripe.com/c/pay/cs_test_123', id: 'cs_test_123' };
        },
        retrieve: async (id) => {
          if (id === 'cs_inconnue') { const e = new Error('No such session'); e.type = 'StripeInvalidRequestError'; throw e; }
          if (id === 'cs_impayee') return { subscription: null, customer: 'cus_abc' };
          return {
            customer: 'cus_abc',
            subscription: {
              status: 'active', current_period_end: MOIS_PROCHAIN,
              items: { data: [{ price: { id: 'price_intensif' } }] },
            },
          };
        },
      },
    },
    subscriptions: {
      list: async ({ customer }) => {
        if (customer === 'cus_resilie') return { data: [{ status: 'canceled', current_period_end: MOIS_PROCHAIN }] };
        if (customer === 'cus_inconnu') return { data: [] };
        return { data: [{
          status: 'active', current_period_end: MOIS_PROCHAIN,
          items: { data: [{ price: { id: 'price_essentiel' } }] },
        }] };
      },
    },
    webhooks: { constructEvent: () => ({ type: 'checkout.session.completed' }) },
  };
}

// On force `require('stripe')` à rendre notre faux.
const chargerOriginal = Module._load;
Module._load = function (demande, parent, isMain) {
  if (demande === 'stripe') return function Stripe() { return fauxStripe(); };
  return chargerOriginal.apply(this, arguments);
};

process.env.STRIPE_CLE_SECRETE = 'sk_test_faux';
process.env.STRIPE_PRIX_ESSENTIEL = 'price_essentiel';
process.env.STRIPE_PRIX_REGULIER = 'price_regulier';
process.env.STRIPE_PRIX_INTENSIF = 'price_intensif';
process.env.ORIGINES_AUTORISEES = 'http://localhost:8321';

const routeur = require(path.join(__dirname, '..', 'serveur', 'index.js'));

/* ————— Un serveur d'essai, sur un port libre ————————————————————— */
const serveur = http.createServer((requete, reponse) => { routeur(requete, reponse); });

function appeler(chemin, options = {}) {
  return new Promise((resoudre, rejeter) => {
    const port = serveur.address().port;
    const requete = http.request(
      { host: '127.0.0.1', port, path: chemin, method: options.method || 'GET',
        headers: { 'Content-Type': 'application/json', Origin: options.origine || 'http://localhost:8321' } },
      (reponse) => {
        const morceaux = [];
        reponse.on('data', (m) => morceaux.push(m));
        reponse.on('end', () => {
          const texte = Buffer.concat(morceaux).toString('utf8');
          let corps = null;
          try { corps = JSON.parse(texte); } catch (e) { corps = texte; }
          resoudre({ code: reponse.statusCode, corps, entetes: reponse.headers });
        });
      });
    requete.on('error', rejeter);
    if (options.corps) requete.write(JSON.stringify(options.corps));
    requete.end();
  });
}

serveur.listen(0, async () => {
  /* — 1. Santé — */
  const sante = await appeler('/sante');
  verifier('le serveur se dit prêt quand les clés sont là',
    sante.code === 200 && sante.corps.pret === true, JSON.stringify(sante.corps));

  /* — 2. Créer un paiement — */
  const paiement = await appeler('/paiement', {
    method: 'POST', corps: { appareil: 'a1234', offre: 'intensif', retour: 'http://localhost:8321/index.html' },
  });
  verifier('le paiement renvoie une adresse Stripe',
    paiement.code === 200 && /checkout\.stripe\.com/.test(paiement.corps.url), JSON.stringify(paiement.corps));

  const demande = journal.sessions[journal.sessions.length - 1];
  verifier('la session est un abonnement, au tarif de l\'offre demandée',
    demande.mode === 'subscription' && demande.line_items[0].price === 'price_intensif',
    JSON.stringify({ mode: demande.mode, prix: demande.line_items[0].price }));

  /* Chaque offre a son tarif : une erreur de correspondance ferait payer
     le mauvais prix sans que rien ne le signale. */
  for (const [offre, prix] of [['essentiel', 'price_essentiel'], ['regulier', 'price_regulier']]) {
    await appeler('/paiement', {
      method: 'POST', corps: { appareil: 'a1234', offre, retour: 'http://localhost:8321/index.html' },
    });
    const vu = journal.sessions[journal.sessions.length - 1].line_items[0].price;
    verifier(`l'offre « ${offre} » part sur son propre tarif`, vu === prix, vu);
  }

  /* L'offre vient de la page : une clé inconnue ne doit pas tomber sur un
     tarif par défaut, sinon on vend ce qu'on n'a pas annoncé. */
  const inventee = await appeler('/paiement', {
    method: 'POST', corps: { appareil: 'a1234', offre: 'gratuite_a_vie', retour: 'http://localhost:8321/index.html' },
  });
  verifier('une offre inconnue est refusée, pas servie au hasard',
    inventee.code === 400 && inventee.corps.erreur === 'offre_inconnue', JSON.stringify(inventee.corps));
  const sansOffre = await appeler('/paiement', {
    method: 'POST', corps: { appareil: 'a1234', retour: 'http://localhost:8321/index.html' },
  });
  verifier('et une demande sans offre aussi',
    sansOffre.code === 400 && sansOffre.corps.erreur === 'offre_inconnue', JSON.stringify(sansOffre.corps));
  verifier("l'appareil est rattaché au paiement",
    demande.client_reference_id === 'a1234', demande.client_reference_id);
  verifier('le retour porte la session, pour la vérifier ensuite',
    /paiement=ok&session=\{CHECKOUT_SESSION_ID\}/.test(demande.success_url), demande.success_url);

  /* — 3. Le retour n'accepte pas n'importe quelle adresse — */
  const detourne = await appeler('/paiement', {
    method: 'POST', corps: { appareil: 'a1234', offre: 'regulier', retour: 'https://site-pirate.example/vol' },
  });
  const sessionDetournee = journal.sessions[journal.sessions.length - 1];
  verifier('un retour non déclaré est ramené à une origine autorisée',
    detourne.code === 200 && sessionDetournee.success_url.startsWith('http://localhost:8321'),
    sessionDetournee.success_url);

  /* — 4. La licence, depuis la session — */
  const licence = await appeler('/licence?session=cs_test_123');
  /* L'offre n'est stockée nulle part : c'est le tarif de l'abonnement
     Stripe qui la dit. Sans ça, l'app ne saurait pas quel quota appliquer. */
  verifier('une session payée donne une licence active',
    licence.corps.actif === true && licence.corps.cle === 'cus_abc' && licence.corps.expire > Date.now(),
    JSON.stringify(licence.corps));
  verifier('la licence dit quelle offre a été payée',
    licence.corps.offre === 'intensif', JSON.stringify(licence.corps));

  const impayee = await appeler('/licence?session=cs_impayee');
  verifier('une session sans abonnement ne donne rien',
    impayee.code === 200 && impayee.corps.actif === false, JSON.stringify(impayee.corps));

  const inconnue = await appeler('/licence?session=cs_inconnue');
  verifier('une session inconnue répond « non », pas une panne',
    inconnue.code === 200 && inconnue.corps.actif === false, JSON.stringify(inconnue.corps));

  /* — 5. La licence, plus tard — */
  const toujours = await appeler('/licence?cle=cus_abc');
  verifier('et pour une clé, l\'offre vient aussi du tarif de l\'abonnement',
    (await appeler('/licence?cle=cus_abc')).corps.offre === 'essentiel',
    JSON.stringify((await appeler('/licence?cle=cus_abc')).corps));
  verifier('un abonnement en cours reste actif',
    toujours.corps.actif === true, JSON.stringify(toujours.corps));

  const resilie = await appeler('/licence?cle=cus_resilie');
  verifier('un abonnement résilié n\'est plus actif',
    resilie.corps.actif === false, JSON.stringify(resilie.corps));

  const malforme = await appeler('/licence?cle=oups');
  verifier('une clé malformée est refusée',
    malforme.code === 400, JSON.stringify(malforme.corps));

  /* — 6. Aucune donnée sensible ne sort — */
  const fuite = JSON.stringify(licence.corps);
  verifier('la réponse ne contient ni clé secrète ni donnée de carte',
    !/sk_|price_|card|email/i.test(fuite), fuite);

  /* — 7. CORS limité aux origines déclarées — */
  const ailleurs = await appeler('/sante', { origine: 'https://ailleurs.example' });
  verifier('une origine inconnue ne reçoit pas le feu vert',
    ailleurs.entetes['access-control-allow-origin'] === 'http://localhost:8321',
    ailleurs.entetes['access-control-allow-origin']);

  serveur.close();
  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nTout est vert.');
  process.exit(echecs ? 1 : 0);
});
