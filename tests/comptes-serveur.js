/* Les comptes, éprouvés sans base ni courriel réels.
   Un faux PostgREST tient les deux tables en mémoire, un faux service de
   courriel capte ce qui part : aucun appel ne sort, aucune clé n'est
   nécessaire. On vérifie ce qui compte — le lien ne sert qu'une fois, le
   jeton n'est jamais gardé en clair, deux appareils ne s'écrasent pas, une
   session révoquée ne vaut plus rien, et l'effacement efface vraiment.
   Lancer : node tests/comptes-serveur.js */
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');

let echecs = 0;
function verifier(nom, condition, vu) {
  if (condition) console.log(`[ok] ${nom}`);
  else { echecs++; console.log(`[ÉCHEC] ${nom}\n        vu : ${vu}`); }
}

/* ————— Faux Google : une paire de clés, et le trousseau public ————— */

const KID = 'cle-de-test-1';
const paire = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwkPublique = { ...paire.publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };

function jetonGoogle(charge, { kid = KID, cle = paire.privateKey } = {}) {
  const b64 = (valeur) => Buffer.from(JSON.stringify(valeur), 'utf8').toString('base64url');
  const tete = b64({ alg: 'RS256', kid, typ: 'JWT' });
  const corps = b64(charge);
  const sceau = crypto.sign('RSA-SHA256', Buffer.from(`${tete}.${corps}`, 'utf8'), cle)
    .toString('base64url');
  return `${tete}.${corps}.${sceau}`;
}

const CLIENT_GOOGLE = '123456789-test.apps.googleusercontent.com';
const chargeGoogle = (extra = {}) => ({
  iss: 'https://accounts.google.com',
  aud: CLIENT_GOOGLE,
  email: 'Theo@Exemple.fr',
  email_verified: true,
  exp: Math.floor(Date.now() / 1000) + 3600,
  ...extra,
});

/* ————— Faux PostgREST : deux tables, en mémoire ———————————————— */

const tables = { comptes: [], connexions: [] };
const courriels = [];

function filtrer(lignes, parametres) {
  let restantes = lignes;
  for (const [colonne, brut] of parametres) {
    if (colonne === 'select') continue;
    const [operateur, ...reste] = String(brut).split('.');
    const valeur = reste.join('.');
    restantes = restantes.filter((ligne) => {
      if (operateur === 'eq') return String(ligne[colonne]) === valeur;
      if (operateur === 'is') return String(ligne[colonne]) === valeur || (valeur === 'false' && !ligne[colonne]);
      return true;
    });
  }
  return restantes;
}

const fausseBase = http.createServer((requete, reponse) => {
  const adresse = new URL(requete.url, 'http://localhost');
  const morceaux = [];
  requete.on('data', (m) => morceaux.push(m));
  requete.on('end', () => {
    const corps = morceaux.length ? JSON.parse(Buffer.concat(morceaux).toString('utf8')) : null;
    const rendre = (code, valeur) => {
      reponse.writeHead(code, { 'Content-Type': 'application/json' });
      reponse.end(JSON.stringify(valeur));
    };

    if (adresse.pathname === '/faux-courriel') { courriels.push(corps); rendre(201, { id: 'c1' }); return; }
    if (adresse.pathname === '/faux-jwks') { rendre(200, { keys: [jwkPublique] }); return; }
    if (adresse.pathname === '/courriel-en-panne') { rendre(500, { message: 'boîte pleine' }); return; }

    const table = adresse.pathname.replace('/rest/v1/', '');
    if (!tables[table]) { rendre(404, { message: 'table inconnue' }); return; }
    const vises = filtrer(tables[table], adresse.searchParams);

    if (requete.method === 'GET') { rendre(200, vises); return; }
    if (requete.method === 'POST') {
      const ligne = {
        id: crypto.randomUUID(), version: 0, jetons_version: 1, utilise: false,
        cree_le: new Date().toISOString(), vu_le: new Date().toISOString(), ...corps,
      };
      tables[table].push(ligne);
      rendre(201, [ligne]);
      return;
    }
    if (requete.method === 'PATCH') {
      vises.forEach((ligne) => Object.assign(ligne, corps));
      rendre(200, vises);
      return;
    }
    if (requete.method === 'DELETE') {
      tables[table] = tables[table].filter((ligne) => !vises.includes(ligne));
      rendre(200, vises);
      return;
    }
    rendre(405, {});
  });
});

/* ————— Le serveur, chargé avec de faux voisins ————————————————— */

const chargerOriginal = Module._load;
Module._load = function (demande) {
  if (demande === 'stripe') return function Stripe() { return {}; };
  if (demande === '@anthropic-ai/sdk') return function Anthropic() { return { messages: {}, beta: { messages: {} } }; };
  return chargerOriginal.apply(this, arguments);
};

function appeler(routeur, url, { methode = 'GET', corps, jeton } = {}) {
  const requete = {
    url, method: methode,
    headers: { host: 'mon-site.vercel.app', 'content-type': 'application/json' },
    on() {}, destroy() {},
  };
  if (jeton) requete.headers.authorization = `Bearer ${jeton}`;
  if (corps !== undefined) requete.body = corps;

  const vue = { code: 0, corps: null, entetes: null };
  const reponse = {
    writeHead(code, entetes) { vue.code = code; vue.entetes = entetes; },
    end(texte) { try { vue.corps = texte ? JSON.parse(texte) : null; } catch (e) { vue.corps = texte; } },
  };
  return Promise.resolve(routeur(requete, reponse)).then(() => vue);
}

(async () => {
  await new Promise((suite) => fausseBase.listen(0, suite));
  const port = fausseBase.address().port;

  process.env.BASE_URL = `http://localhost:${port}`;
  process.env.BASE_CLE = 'cle_de_service_de_test';
  process.env.SECRET_COMPTES = 'un-secret-de-test-assez-long-pour-faire-illusion';
  process.env.BREVO_CLE = 'cle_brevo_de_test';
  process.env.BREVO_URL = `http://localhost:${port}/faux-courriel`;
  process.env.COURRIEL_EXPEDITEUR = 'Mathématique <bonjour@exemple.fr>';
  process.env.SITE_URL = 'https://mon-site.vercel.app';
  process.env.GOOGLE_CLIENT_ID = CLIENT_GOOGLE;
  process.env.GOOGLE_JWKS_URL = `http://localhost:${port}/faux-jwks`;
  process.env.STRIPE_CLE_SECRETE = '';
  process.env.CLAUDE_CLE = '';

  const routeur = require(path.join(__dirname, '..', 'serveur', 'index.js'));

  /* — 1. Les comptes s'annoncent allumés — */
  {
    const vue = await appeler(routeur, '/api/sante');
    verifier('la santé annonce des comptes allumés', vue.corps.comptes === true, JSON.stringify(vue.corps));
  }

  /* — 2. Une adresse qui n'en est pas une est refusée — */
  {
    const vue = await appeler(routeur, '/api/compte-demander', { methode: 'POST', corps: { courriel: 'pasuneadresse' } });
    verifier('une adresse invalide est refusée', vue.code === 400, `${vue.code} ${JSON.stringify(vue.corps)}`);
  }

  /* — 3. Une vraie demande part par courriel — */
  let lien = '';
  {
    const vue = await appeler(routeur, '/api/compte-demander', { methode: 'POST', corps: { courriel: 'Lea@Exemple.fr' } });
    verifier('la demande est acceptée', vue.code === 200 && vue.corps.envoye === true, JSON.stringify(vue.corps));
    verifier('un courriel est parti', courriels.length === 1, `${courriels.length} courriels`);
    const envoi = courriels[0] || {};
    verifier('il part à l\'adresse demandée, en minuscules',
      envoi.to && envoi.to[0] && envoi.to[0].email === 'lea@exemple.fr', JSON.stringify(envoi.to));
    lien = ((envoi.textContent || '').match(/https?:\/\/\S+/) || [''])[0];
    verifier('il contient un lien d\'entrée', /compte-entrer\?jeton=/.test(lien), lien);

    const jeton = decodeURIComponent((lien.match(/jeton=([^&\s]+)/) || [, ''])[1]);
    const rangee = tables.connexions[0] || {};
    verifier('la base ne garde que l\'empreinte du jeton, jamais le jeton',
      rangee.empreinte === crypto.createHash('sha256').update(jeton).digest('hex')
      && !JSON.stringify(tables.connexions).includes(jeton),
      JSON.stringify(rangee).slice(0, 120));
  }

  /* — 4. Le lien ouvre l'app, une seule fois — */
  let session = '';
  {
    const chemin = lien.replace('https://mon-site.vercel.app', '');
    const vue = await appeler(routeur, chemin);
    verifier('le lien redirige vers l\'app', vue.code === 302, `${vue.code}`);
    const suite = (vue.entetes || {}).Location || '';
    session = decodeURIComponent((suite.match(/acces=([^&]+)/) || [, ''])[1]);
    verifier('avec une session dans l\'adresse', session.length > 20, suite);
    verifier('un compte a été créé', tables.comptes.length === 1
      && tables.comptes[0].courriel === 'lea@exemple.fr', JSON.stringify(tables.comptes));

    const encore = await appeler(routeur, chemin);
    verifier('le même lien ne resservira pas',
      /entree=lien/.test(((encore.entetes || {}).Location) || ''), (encore.entetes || {}).Location);
  }

  /* — 5. Qui porte la session est reconnu, les autres non — */
  {
    const moi = await appeler(routeur, '/api/compte-moi', { jeton: session });
    verifier('la session ouvre le compte', moi.code === 200 && moi.corps.courriel === 'lea@exemple.fr',
      `${moi.code} ${JSON.stringify(moi.corps)}`);

    const sans = await appeler(routeur, '/api/compte-moi');
    verifier('sans session, la porte reste fermée', sans.code === 401, `${sans.code}`);

    const trafique = session.split('.')[0] + '.' + Buffer.from('faux').toString('base64url');
    const faux = await appeler(routeur, '/api/compte-moi', { jeton: trafique });
    verifier('une signature trafiquée ne passe pas', faux.code === 401, `${faux.code}`);
  }

  /* — 6. La bibliothèque : lecture, écriture, et pas d'écrasement — */
  {
    const vide = await appeler(routeur, '/api/bibliotheque', { jeton: session });
    verifier('la bibliothèque part vide, en version 0',
      vide.code === 200 && vide.corps.version === 0, JSON.stringify(vide.corps));

    const ecrit = await appeler(routeur, '/api/bibliotheque', {
      methode: 'PUT', jeton: session,
      corps: { version: 0, donnees: { fiches: [{ id: 'f1', titre: 'Les suites' }] } },
    });
    verifier('la première écriture passe et avance la version',
      ecrit.code === 200 && ecrit.corps.version === 1, JSON.stringify(ecrit.corps));

    const relu = await appeler(routeur, '/api/bibliotheque', { jeton: session });
    verifier('ce qui est écrit se relit',
      relu.corps.donnees.fiches[0].titre === 'Les suites', JSON.stringify(relu.corps.donnees));

    /* Le deuxième appareil a lu la version 0 et écrit trop tard. */
    const retard = await appeler(routeur, '/api/bibliotheque', {
      methode: 'PUT', jeton: session,
      corps: { version: 0, donnees: { fiches: [] } },
    });
    verifier('une écriture en retard est refusée, pas appliquée',
      retard.code === 409 && retard.corps.version === 1, JSON.stringify(retard.corps));
    verifier('et le refus rend ce qu\'il faut pour fusionner',
      retard.corps.donnees.fiches.length === 1, JSON.stringify(retard.corps.donnees));

    const toujours = await appeler(routeur, '/api/bibliotheque', { jeton: session });
    verifier('la fiche de l\'autre appareil n\'a pas été écrasée',
      toujours.corps.donnees.fiches.length === 1, JSON.stringify(toujours.corps.donnees));

    const enorme = await appeler(routeur, '/api/bibliotheque', {
      methode: 'PUT', jeton: session,
      corps: { version: 1, donnees: { gros: 'x'.repeat(5 * 1024 * 1024) } },
    });
    verifier('une bibliothèque démesurée est refusée', enorme.code === 413, `${enorme.code}`);
  }

  /* — 7. Sortir de partout invalide les sessions déjà données — */
  {
    const sorti = await appeler(routeur, '/api/compte-sortir', { methode: 'POST', jeton: session });
    verifier('on peut se déconnecter de tous ses appareils', sorti.code === 200, `${sorti.code}`);
    const apres = await appeler(routeur, '/api/compte-moi', { jeton: session });
    verifier('l\'ancienne session ne vaut plus rien', apres.code === 401, `${apres.code}`);
  }

  /* — 8. Export et effacement : les deux droits qu'on doit rendre — */
  {
    courriels.length = 0;
    await appeler(routeur, '/api/compte-demander', { methode: 'POST', corps: { courriel: 'lea@exemple.fr' } });
    const lien2 = ((courriels[0].textContent || '').match(/https?:\/\/\S+/) || [''])[0];
    const vue = await appeler(routeur, lien2.replace('https://mon-site.vercel.app', ''));
    const session2 = decodeURIComponent((((vue.entetes || {}).Location) || '').match(/acces=([^&]+)/)[1]);

    const exporte = await appeler(routeur, '/api/compte-export', { jeton: session2 });
    verifier('l\'élève peut tout récupérer',
      exporte.code === 200 && exporte.corps.courriel === 'lea@exemple.fr'
      && exporte.corps.donnees.fiches.length === 1, JSON.stringify(exporte.corps).slice(0, 120));

    const efface = await appeler(routeur, '/api/compte-effacer', { methode: 'DELETE', jeton: session2 });
    verifier('l\'élève peut tout effacer', efface.code === 200, `${efface.code}`);
    verifier('et il ne reste rien en base',
      tables.comptes.length === 0 && tables.connexions.length === 0,
      `${tables.comptes.length} comptes, ${tables.connexions.length} connexions`);
    const apres = await appeler(routeur, '/api/compte-moi', { jeton: session2 });
    verifier('la session d\'un compte effacé ne vaut plus rien', apres.code === 401, `${apres.code}`);
  }

  /* — 9. On ne peut pas noyer une boîte mail — */
  {
    courriels.length = 0;
    for (let i = 0; i < 6; i++) {
      await appeler(routeur, '/api/compte-demander', { methode: 'POST', corps: { courriel: 'spam@exemple.fr' } });
    }
    verifier('les demandes en rafale sont freinées',
      courriels.length <= 3, `${courriels.length} courriels partis`);
    /* La réponse doit être la même pour une adresse connue et une inconnue :
       sinon la page devient un outil pour savoir qui est inscrit ici. */
    const connue = await appeler(routeur, '/api/compte-demander',
      { methode: 'POST', corps: { courriel: 'lea@exemple.fr' } });
    const inconnue = await appeler(routeur, '/api/compte-demander',
      { methode: 'POST', corps: { courriel: 'jamais-vue@exemple.fr' } });
    verifier('la réponse ne dit pas si l\'adresse est connue',
      connue.code === inconnue.code && JSON.stringify(connue.corps) === JSON.stringify(inconnue.corps),
      `${connue.code} ${JSON.stringify(connue.corps)} / ${inconnue.code} ${JSON.stringify(inconnue.corps)}`);
  }

  /* — 10. Une panne d'envoi se dit, elle ne se tait pas — */
  {
    const vrai = process.env.BREVO_URL;
    process.env.BREVO_URL = `http://localhost:${port}/courriel-en-panne`;
    delete require.cache[require.resolve(path.join(__dirname, '..', 'serveur', 'comptes.js'))];
    delete require.cache[require.resolve(path.join(__dirname, '..', 'serveur', 'index.js'))];
    const autre = require(path.join(__dirname, '..', 'serveur', 'index.js'));
    const vue = await appeler(autre, '/api/compte-demander', { methode: 'POST', corps: { courriel: 'panne@exemple.fr' } });
    verifier('un envoi qui échoue rend une erreur lisible',
      vue.code === 502 && vue.corps.erreur === 'envoi_impossible', `${vue.code} ${JSON.stringify(vue.corps)}`);
    process.env.BREVO_URL = vrai;
  }

  /* — 11. Entrer avec Google : on ne croit aucun jeton sur parole — */
  {
    const sante = await appeler(routeur, '/api/sante');
    verifier('la santé annonce l\'identifiant Google, qui est public',
      sante.corps.google === CLIENT_GOOGLE, JSON.stringify(sante.corps.google));

    const bon = await appeler(routeur, '/api/compte-google',
      { methode: 'POST', corps: { jeton: jetonGoogle(chargeGoogle()) } });
    verifier('un jeton Google valide ouvre le compte',
      bon.code === 200 && bon.corps.courriel === 'theo@exemple.fr',
      `${bon.code} ${JSON.stringify(bon.corps.courriel)}`);

    const moi = await appeler(routeur, '/api/compte-moi', { jeton: bon.corps.session });
    verifier('et la session qui en sort vaut comme les autres',
      moi.code === 200 && moi.corps.courriel === 'theo@exemple.fr', `${moi.code}`);

    /* Les quatre façons de tricher, une par une. */
    const refus = [
      ['une signature fabriquée ailleurs', jetonGoogle(chargeGoogle(), {
        cle: crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey })],
      ['un jeton destiné à un autre site', jetonGoogle(chargeGoogle({ aud: 'un-autre-client.apps.googleusercontent.com' }))],
      ['un jeton périmé', jetonGoogle(chargeGoogle({ exp: Math.floor(Date.now() / 1000) - 10 }))],
      ['une adresse non vérifiée chez Google', jetonGoogle(chargeGoogle({ email_verified: false }))],
      ['un émetteur inconnu', jetonGoogle(chargeGoogle({ iss: 'https://pas-google.example' }))],
      ['une clé inconnue du trousseau', jetonGoogle(chargeGoogle(), { kid: 'cle-inventee' })],
      ['un jeton qui n\'en est pas un', 'bonjour'],
    ];
    for (const [quoi, jeton] of refus) {
      const vue = await appeler(routeur, '/api/compte-google', { methode: 'POST', corps: { jeton } });
      verifier(`refusé : ${quoi}`, vue.code === 401, `${vue.code} ${JSON.stringify(vue.corps)}`);
    }

    verifier('et aucun compte n\'a été créé par ces tentatives',
      tables.comptes.filter((c) => c.courriel === 'theo@exemple.fr').length === 1,
      tables.comptes.map((c) => c.courriel).join(', '));
  }

  fausseBase.close();

  /* — 12. Sans réglages, l'app marche comme avant : les comptes se taisent — */
  {
    const script = `
      const Module = require('module');
      const charger = Module._load;
      Module._load = function (d) {
        if (d === 'stripe') return function () { return {}; };
        if (d === '@anthropic-ai/sdk') return function () { return { messages: {}, beta: { messages: {} } }; };
        return charger.apply(this, arguments);
      };
      const routeur = require(${JSON.stringify(path.join(__dirname, '..', 'serveur', 'index.js'))});
      const vue = { code: 0, corps: null };
      const reponse = { writeHead: (c) => { vue.code = c; }, end: (t) => { vue.corps = t; } };
      routeur({ url: '/api/bibliotheque', method: 'GET', headers: {}, on() {}, destroy() {} }, reponse)
        .then(() => console.log(JSON.stringify(vue)));`;
    const { execFileSync } = require('child_process');
    const sortie = execFileSync(process.execPath, ['-e', script], {
      env: { PATH: process.env.PATH, HOME: process.env.HOME }, encoding: 'utf8',
    });
    const vue = JSON.parse(sortie.trim());
    verifier('sans base ni courriel, les comptes répondent « éteints »',
      vue.code === 503 && /comptes_eteints/.test(vue.corps), sortie.trim());
  }

  console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est vert.');
  process.exit(echecs ? 1 : 0);
})();
