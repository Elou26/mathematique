/* ==========================================================================
   Réglages de la page
   --------------------------------------------------------------------------
   Ces trois lignes vivaient dans des <script> au milieu des pages. Elles en
   sortent pour une raison de sécurité : tant qu'un seul script est écrit
   dans le HTML, la politique de sécurité du contenu (CSP) doit autoriser
   « unsafe-inline » — c'est-à-dire autoriser n'importe quel script écrit
   dans la page, y compris celui qu'un contenu malveillant y glisserait.
   Un fichier à part, et la CSP peut n'accepter que nos propres fichiers.

   « ||= » et non « = » : un réglage déjà posé avant cette page — un test,
   un autre hébergeur — doit gagner. La page donne le défaut, pas la loi.

   Chaque page ne se sert que de ce qui la concerne : la vitrine ignore la
   lecture, l'app se sert des trois.
   ========================================================================== */

/* La lecture des photos de cours, par le serveur. */
window.MATHEMATIQUE_LECTURE = window.MATHEMATIQUE_LECTURE || { api: "/api" };

/* Le paiement : l'essai limité, le mur et la page de tarif. Seules les
   offres dont le tarif existe chez Stripe sont proposées — /api/sante dit
   lesquelles, et dit aussi celles dont le prix ne correspond plus. */
window.MATHEMATIQUE_PAIEMENT = window.MATHEMATIQUE_PAIEMENT || { api: "/api" };

/* Les comptes : retrouver ses fiches sur un autre appareil. */
window.MATHEMATIQUE_COMPTE = window.MATHEMATIQUE_COMPTE || { api: "/api" };
