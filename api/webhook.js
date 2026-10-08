/* Vercel donne une adresse à chaque fichier de ce dossier : celui-ci sert
   /api/webhook. Tout le travail est dans serveur/index.js ; le relais s'assure
   qu'une panne se lise au lieu de se deviner. */
module.exports = require("./_relais.js");
