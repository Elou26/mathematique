/* ==========================================================================
   Le relais entre Vercel et le serveur
   --------------------------------------------------------------------------
   Vercel n'attend pas la promesse que rend le routeur : une erreur non
   rattrapée devient un « FUNCTION_INVOCATION_FAILED », qui ne dit rien de
   ce qui a cassé. Pire, une panne au chargement du module — une dépendance
   absente du paquet, par exemple — se présente de la même façon.

   Ce relais rattrape les deux et les dit en clair. Une panne qu'on peut
   lire se corrige ; un 500 anonyme se devine.

   Les deux dépendances sont demandées ici, et pas seulement depuis
   serveur/index.js : elles sont ainsi tracées depuis un fichier que Vercel
   embarque à coup sûr, au lieu de l'être à travers serveur/package.json,
   qu'il prend pour un paquet séparé.
   ========================================================================== */

"use strict";

let routeur = null;
let panneDeChargement = null;
try {
  /* Dans le try, sans quoi ce relais planterait à l'endroit même qu'il est
     censé rendre lisible — c'est tout l'intérêt de l'exercice. */
  require("@anthropic-ai/sdk");
  require("stripe");
  routeur = require("../serveur/index.js");
} catch (erreur) {
  panneDeChargement = erreur;
}

module.exports = async function relais(requete, reponse) {
  try {
    if (panneDeChargement) throw panneDeChargement;
    await routeur(requete, reponse);
  } catch (erreur) {
    const message = String((erreur && erreur.message) || erreur || "inconnue");
    console.error("[relais]", message, (erreur && erreur.stack) || "");
    if (reponse.headersSent) { reponse.end(); return; }
    reponse.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    reponse.end(JSON.stringify({
      erreur: panneDeChargement ? "chargement_impossible" : "panne_serveur",
      message: message.slice(0, 300),
    }));
  }
};
