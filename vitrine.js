/* ==========================================================================
   La vitrine — ce qui bouge sur la page d'accueil publique
   --------------------------------------------------------------------------
   Trois choses, pas une de plus :

   1. Les formules sont écrites depuis abonnement.js, jamais recopiées dans
      la page. Un prix qui vit à deux endroits finit par différer de
      lui-même, et c'est l'élève qui le découvre au moment de payer.
   2. Celui qui a déjà des fiches n'est pas un prospect : on lui propose de
      reprendre, au lieu de lui vendre ce qu'il utilise déjà.
   3. Le rappel du bas apparaît une fois l'accroche passée, et disparaît
      quand elle revient — deux boutons identiques à l'écran ne font pas
      deux chances, ils font du bruit.

   Rien n'est écrit sur l'appareil depuis cette page : elle lit, elle ne
   touche pas à la bibliothèque de l'élève.
   ========================================================================== */

(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  /* ————— Les formules ———————————————————————————————————————— */

  function ecrireOffres() {
    const hote = $("#offres");
    if (!hote || typeof ABONNEMENT === "undefined") return;

    const offres = ABONNEMENT.offres();
    const parFiche = ABONNEMENT.creditsParFiche();
    /* Le paiement est branché, ou il ne l'est pas. Dans le second cas la
       page le dit et n'envoie personne sur un mur : le bouton ramène à
       l'app, qui est gratuite et sans limite tant que Stripe dort. */
    const ouvert = ABONNEMENT.estConfigure();

    const chiffre = $("#credits-par-fiche");
    if (chiffre) chiffre.textContent = String(parFiche);

    const encart = $("#encart-gratuit");
    if (encart) encart.hidden = ouvert;

    hote.textContent = "";
    offres.forEach((offre) => {
      const credits = (offre.fiches * parFiche).toLocaleString("fr-FR");
      const carte = document.createElement("article");
      carte.className = "offre" + (offre.conseille ? " offre--conseille" : "");
      carte.innerHTML = `
        ${offre.conseille ? '<span class="offre-ruban">Conseillé</span>' : ""}
        <p class="offre-nom">${offre.nom}</p>
        <p class="offre-prix">${offre.prix}<span> ${offre.periode}</span></p>
        <p class="offre-volume">${offre.fiches} fiches par mois</p>
        <p class="offre-credits">soit ${credits} crédits</p>
        <p class="offre-argument">${offre.argument}</p>
        <a class="bouton ${offre.conseille ? "bouton--principal" : "bouton--creux"}"
           href="${ouvert ? "app.html?vue=abonnement" : "app.html?vue=scan"}">
          ${ouvert ? `Choisir ${offre.nom}` : "Commencer gratuitement"}
        </a>`;
      hote.appendChild(carte);
    });
  }

  /* ————— Celui qui revient ——————————————————————————————————— */

  function compterLesFiches() {
    try {
      const brut = localStorage.getItem("mathematique.fiches");
      const lues = brut ? JSON.parse(brut) : [];
      return Array.isArray(lues) ? lues.length : 0;
    } catch (erreur) { return 0; }
  }

  function saluerLeRetour() {
    const bande = $("#retour-band");
    const texte = $("#retour-texte");
    if (!bande || !texte) return;

    const combien = compterLesFiches();
    if (!combien) return;                   // premier passage : rien à dire

    texte.textContent = combien === 1
      ? "Tu as déjà une fiche qui t'attend."
      : `Tu as déjà ${combien} fiches qui t'attendent.`;
    bande.hidden = false;
  }

  /* ————— Le rappel du bas ————————————————————————————————————— */

  function suivreLAccroche() {
    const rappel = $("#rappel");
    const accroche = $(".hero-actions");
    if (!rappel || !accroche) return;

    if (!("IntersectionObserver" in window)) return;   // vieux navigateur : pas de rappel
    const oeil = new IntersectionObserver((entrees) => {
      entrees.forEach((entree) => { rappel.hidden = entree.isIntersecting; });
    }, { rootMargin: "-10px 0px 0px 0px" });
    oeil.observe(accroche);
  }

  /* ————— La porte d'entrée ——————————————————————————————————————
     Les boutons de la page mènent à l'app. Quand les comptes sont ouverts,
     ils passent d'abord par ici : on demande une adresse, on envoie un lien.

     Deux cas la font s'effacer, et c'est volontaire : l'élève déjà entré
     (on ne redemande pas son nom à quelqu'un qu'on connaît) et le serveur
     qui n'a pas de quoi ouvrir un compte (on n'arrête personne devant une
     porte qu'on ne peut pas lui ouvrir — sans ça, le site entier serait
     inutilisable tant que la base n'est pas branchée).
     ———————————————————————————————————————————————————————————— */

  let destination = "app.html";
  let rendreLeFocus = null;

  function ouvrirPorte(ou) {
    const entree = $("#entree");
    if (!entree) return;
    destination = ou || "app.html";
    rendreLeFocus = document.activeElement;
    entree.hidden = false;
    document.body.classList.add("corps-bloque");
    const champ = $("#entree-courriel");
    if (champ) setTimeout(() => champ.focus(), 50);
  }

  function fermerPorte() {
    const entree = $("#entree");
    if (!entree || entree.hidden) return;
    entree.hidden = true;
    document.body.classList.remove("corps-bloque");
    if (rendreLeFocus && rendreLeFocus.focus) rendreLeFocus.focus();
  }

  function direPorte(texte) {
    const el = $("#entree-message");
    if (!el) return;
    el.textContent = texte;
    el.hidden = !texte;
  }

  function brancherLaPorte() {
    const entree = $("#entree");
    if (!entree || typeof COMPTE === "undefined") return;

    entree.querySelectorAll("[data-entree-fermer]").forEach((bouton) => {
      bouton.addEventListener("click", fermerPorte);
    });
    document.addEventListener("keydown", (evenement) => {
      if (evenement.key === "Escape") fermerPorte();
    });

    const formulaire = $("#entree-form");
    if (formulaire) {
      formulaire.addEventListener("submit", async (evenement) => {
        evenement.preventDefault();
        const champ = $("#entree-courriel");
        const bouton = $("#entree-valider");
        const adresse = (champ.value || "").trim();
        if (!adresse) { champ.focus(); return; }
        bouton.disabled = true;
        bouton.textContent = "Envoi…";
        direPorte("");
        try {
          await COMPTE.demander(adresse);
          $("#entree-adresse").textContent = adresse;
          $("#entree-formulaire").hidden = true;
          $("#entree-boite").hidden = false;
          /* « Entre ton adresse » au-dessus de « regarde ta boîte », ce sont
             deux consignes contradictoires sur le même écran. */
          $("#entree-sous").hidden = true;
        } catch (erreur) {
          const quoi = String(erreur.message || erreur);
          direPorte(quoi === "adresse_invalide"
            ? "Cette adresse ne ressemble pas à une adresse e-mail."
            : "L'envoi a échoué. Réessaie dans un instant.");
        } finally {
          bouton.disabled = false;
          bouton.textContent = "Recevoir mon lien";
        }
      });
    }

    const retour = $("#entree-retour");
    if (retour) {
      retour.addEventListener("click", () => {
        $("#entree-boite").hidden = true;
        $("#entree-formulaire").hidden = false;
        $("#entree-sous").hidden = false;
        const champ = $("#entree-courriel");
        if (champ) { champ.value = ""; champ.focus(); }
      });
    }

    /* Google entre en un geste : plus d'attente, et pas de courriel qui
       risque de tomber dans les indésirables. */
    COMPTE.boutonGoogle($("#entree-google"), (erreur) => {
      if (erreur) { direPorte("Google n'a pas pu te faire entrer. Essaie avec ton adresse."); return; }
      window.location.href = destination;
    }).then((pose) => {
      const separateur = $("#entree-ou");
      if (separateur) separateur.hidden = !pose;
    });

    COMPTE.disponible().then((pret) => {
      if (!pret) return;                 // rien à garder : les liens passent
      document.querySelectorAll('a[href^="app.html"]').forEach((lien) => {
        lien.addEventListener("click", (evenement) => {
          if (COMPTE.connecte()) return;             // déjà entré
          evenement.preventDefault();
          ouvrirPorte(lien.getAttribute("href"));
        });
      });
    });
  }

  function demarrer() {
    ecrireOffres();
    saluerLeRetour();
    suivreLAccroche();
    brancherLaPorte();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", demarrer);
  } else {
    demarrer();
  }
})();
