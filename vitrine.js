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

    /* Seules les offres que le serveur sait vendre : pendant la mise en
       place des tarifs, il n'y en a qu'une, et annoncer les deux autres
       serait promettre un bouton qui rend « offre inconnue ». */
    const offres = ABONNEMENT.offresEnVente();
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
        ${ABONNEMENT.prixApres(offre)
          ? `<p class="offre-lancement">Lancement — ensuite ${ABONNEMENT.prixApres(offre)}</p>`
          : ""}
        <p class="offre-volume">${offre.fiches} fiches par mois</p>
        <p class="offre-credits">soit ${credits} crédits</p>
        <p class="offre-unitaire">${ABONNEMENT.prixParFiche(offre)}${
          ABONNEMENT.economieParFiche(offre)
            ? ` <span class="offre-gain">− ${ABONNEMENT.economieParFiche(offre)} %</span>`
            : ""}</p>
        <p class="offre-argument">${offre.argument}</p>
        <a class="bouton ${offre.conseille ? "bouton--principal" : "bouton--creux"}"
           href="${ouvert ? "app.html?vue=abonnement" : "app.html?vue=scan"}">
          ${ouvert ? `Choisir ${offre.nom}` : "Commencer gratuitement"}
        </a>`;
      hote.appendChild(carte);
    });

    /* Une seule fois sous les cartes : la promesse, pas le matraquage. */
    const note = document.querySelector("#tarifs-lancement");
    if (note) {
      const actif = ABONNEMENT.lancementActif();
      note.hidden = !actif;
      note.textContent = actif
        ? `Tarifs de lancement jusqu'au ${ABONNEMENT.finDuLancement()}. En t'abonnant avant, tu gardes ton prix tant que tu restes abonné.`
        : "";
    }
  }

  /* Safari ignore « user-scalable=no » : les gestes, eux, s'arrêtent. Le
     zoom par les réglages du téléphone reste possible. */
  ["gesturestart", "gesturechange", "gestureend"].forEach((nom) => {
    document.addEventListener(nom, (evenement) => evenement.preventDefault(), { passive: false });
  });


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

  /** Applique un changement à un élément s'il existe. Rien d'autre. */
  function montrer(selecteur, quoi) {
    const el = $(selecteur);
    if (el) quoi(el);
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

        /* Le réseau d'abord, l'affichage ensuite, et jamais dans le même
           try : un élément manquant dans la page se ferait sinon passer pour
           une panne d'envoi, et l'élève lirait « l'envoi a échoué » avec le
           lien déjà dans sa boîte. C'est arrivé. */
        let parti = false;
        try {
          await COMPTE.demander(adresse);
          parti = true;
        } catch (erreur) {
          const quoi = String(erreur.message || erreur);
          direPorte(quoi === "adresse_invalide"
            ? "Cette adresse ne ressemble pas à une adresse e-mail."
            : "L'envoi a échoué. Réessaie dans un instant.");
        }
        bouton.disabled = false;
        bouton.textContent = "Recevoir mon lien";
        if (!parti) return;

        montrer("#entree-adresse", (el) => { el.textContent = adresse; });
        montrer("#entree-formulaire", (el) => { el.hidden = true; });
        montrer("#entree-boite", (el) => { el.hidden = false; });
        /* « Entre ton adresse » au-dessus de « regarde ta boîte », ce sont
           deux consignes contradictoires sur le même écran. */
        montrer("#entree-sous", (el) => { el.hidden = true; });
      });
    }

    const retour = $("#entree-retour");
    if (retour) {
      retour.addEventListener("click", () => {
        montrer("#entree-boite", (el) => { el.hidden = true; });
        montrer("#entree-formulaire", (el) => { el.hidden = false; });
        montrer("#entree-sous", (el) => { el.hidden = false; });
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
    /* La liste des tarifs réellement créés arrive du serveur : on redessine
       dès qu'on la connaît. */
    if (ABONNEMENT.estConfigure()) ABONNEMENT.sante().then(ecrireOffres);
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
