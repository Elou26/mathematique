/* Vercel donne une adresse à chaque fichier de ce dossier : celui-ci sert
   /api/lecture. Tout le travail est dans serveur/index.js — ici, on ne fait
   que le présenter sous la forme que Vercel attend. */
module.exports = require("../serveur/index.js");
