# Mettre Brainoko en ligne

Cinq étapes, chacune avec une **porte** : si la porte ne s'ouvre pas, on
s'arrête là et on corrige — on ne paie rien avant.

L'ordre compte. Il est fait pour que tu découvres les mauvaises nouvelles
quand elles sont encore gratuites.

---

## Étape 1 — Le site en ligne (gratuit, 10 min)

L'app publiée dans l'artifact ne peut pas appeler ton serveur. Il faut la
sortir de là. Vercel sert le site **et** le serveur à la même adresse.

1. [vercel.com](https://vercel.com) → **Add New → Project** → importe
   `Elou26/mathematique`
2. Ne touche à rien dans « Build and Output Settings » : le `vercel.json`
   du dépôt fige déjà tout
3. Vérifie que **Root Directory** est vide ou `./` (jamais `serveur`)
4. **Deploy**

**Porte :** `https://ton-adresse.vercel.app` affiche le site.
→ Page blanche ou 404 ? Regarde les logs de déploiement avant d'avancer.

---

## Étape 2 — La lecture des photos (~20 min, quelques centimes)

C'est l'étape qui décide de tout le projet. Si la lecture ne rend pas de
bonnes fiches, rien de ce qui suit ne sert.

Un seul appel fait tout : les photos partent, la fiche revient — notions,
résumé, lexique et cartes. Il n'y a plus d'étape de synthèse séparée.

1. [console.anthropic.com](https://console.anthropic.com) → compte →
   **API Keys** → nouvelle clé. Mets quelques euros de crédit : tu paies à
   l'usage, il n'y a pas d'abonnement.
2. Vercel → ton projet → **Settings → Environment Variables** :

   | Nom | Valeur |
   | --- | --- |
   | `CLAUDE_CLE` | ta clé |
   | `LECTURE_OCTETS_MAX` | `4000000` |

3. **Redeploy**
4. Ouvre `https://ton-adresse.vercel.app/api/sante`

**Porte :** tu lis `{"pret":false,"lecture":true}`.
`lecture: true` = le serveur a sa clé. `pret: false` est normal, Stripe
n'est pas encore là.

5. Dans `app.html`, décommente le bloc de branchement et garde cette
   ligne seule :

   ```html
   window.MATHEMATIQUE_LECTURE = { api: "/api" };
   ```

6. Pousse. Vercel redéploie tout seul.

**Porte (la vraie) :** photographie **trois vrais cours** — un imprimé, un
manuscrit, un avec un tableau. Le bandeau du scanner doit dire « ✳︎ Ta page
est lue par un service spécialisé ».

→ Si le texte revient juste : continue.
→ Si c'est mauvais : arrête-toi. Tu n'as rien dépensé, rien engagé.

---

## Étape 3 — Juger les fiches

Il n'y a plus d'étape de synthèse à brancher : le même appel qui lit la
photo écrit déjà le résumé et les cartes.

Ce qu'il te reste à faire, c'est **juger**. Prends trois cours que tu
connais bien et relis les fiches obtenues ligne à ligne :

- les notions sont-elles celles de ton prof, dans son ordre ?
- les résumés se terminent-ils sur des phrases entières ?
- les questions des cartes sonnent-elles comme à l'oral ?
- **y a-t-il quelque chose que ton cours ne dit pas ?** C'est le seul
  défaut grave : une fiche inventée fait réviser une erreur sans que
  l'élève puisse le savoir. Si tu en trouves un, dis-le-moi avec la photo
  et la fiche — c'est la consigne qu'il faut corriger, pas le code.

Le modèle par défaut est `claude-sonnet-5-5` : ~4 centimes la fiche. Si une
fiche est juste mais trop plate, essaie `CLAUDE_EFFORT=high` d'abord — c'est
le réglage le moins cher. Si ça ne suffit pas, `CLAUDE_MODELE=claude-opus-5-5`
donne plus de finesse pour environ le double.

## Étape 4 — Les comptes (~30 min, gratuit)

Sans compte, les fiches vivent dans le navigateur de l'élève : il change de
téléphone, il perd tout. Cette étape ajoute une copie sur une base, et la
même bibliothèque sur tous ses appareils. L'app marche sans — tant que ces
réglages manquent, elle se comporte exactement comme avant.

**Tu gardes désormais le travail scolaire d'autres personnes, souvent
mineures.** C'est ce qui rend l'étape 7 ci-dessous non négociable.

1. **La base.** [supabase.com](https://supabase.com) → **New project**.
   Choisis la région **Frankfurt (eu-central-1)** : les données d'élèves
   français restent en Europe. Note le mot de passe qu'il te demande (tu ne
   t'en serviras pas ici, mais il ne se revoit pas).
2. Dans le projet → **SQL Editor** → **New query** → colle tout le contenu de
   `serveur/base.sql` → **Run**. Deux tables apparaissent dans « Table
   Editor ».
3. **Project Settings → API** : relève **Project URL** et la clé
   **`service_role`**.
   ⚠️ Cette clé contourne toutes les protections. Elle va dans les variables
   d'environnement du serveur, jamais dans une page, jamais dans le dépôt,
   jamais dans une conversation.
4. **L'envoi des courriels.** Deux chemins :

   | | Sans nom de domaine | Avec un nom de domaine (~10 €/an) |
   | --- | --- | --- |
   | Service | [Brevo](https://www.brevo.com) | [Resend](https://resend.com) |
   | À faire | vérifier une adresse d'expéditeur (ton Gmail) | vérifier le domaine (3 lignes DNS) |
   | Gratuit | 300 courriels/jour | 3 000/mois |
   | Risque | une partie des liens tombe en indésirables | délivrabilité propre |

   Prends Brevo pour commencer, Resend quand tu auras un domaine. Le code
   gère les deux : il prend celui dont la clé est renseignée.
5. **Les variables**, chez Vercel (Settings → Environment Variables) :

   | Nom | Valeur |
   | --- | --- |
   | `BASE_URL` | `https://xxxx.supabase.co` |
   | `BASE_CLE` | la clé `service_role` |
   | `SECRET_COMPTES` | 32 caractères au hasard (voir ci-dessous) |
   | `BREVO_CLE` *ou* `RESEND_CLE` | la clé du service choisi |
   | `COURRIEL_EXPEDITEUR` | `Brainoko <ton-adresse-verifiee>` |
   | `SITE_URL` | `https://brainoko.com` |

   Pour le secret :

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

   En changer déconnecte tout le monde — ce qui est parfois le but.

**Porte :** `/api/sante` répond `{"pret":…,"lecture":true,"comptes":true}`.

6. **C'est fait depuis le 12 octobre 2026** : la ligne est allumée dans
   `app.html` (le bloc « Mes fiches sur tous mes appareils » du profil) et
   dans `index.html` (la porte d'entrée devant les boutons de la vitrine).

   ```html
   window.MATHEMATIQUE_COMPTE = window.MATHEMATIQUE_COMPTE || { api: "/api" };
   ```

   Si tu repars un jour d'une base vide, remets ces deux lignes en commentaire
   avant que `/api/sante` réponde `"comptes":true` : une porte qui ne peut
   envoyer aucun lien rendrait le site inutilisable.

7. **Facultatif, mais recommandé : le bouton « continuer avec Google ».**
   La plupart des élèves ont un compte Google, et un bouton évite d'attendre
   un courriel qui peut tomber dans les indésirables.

   [console.cloud.google.com](https://console.cloud.google.com) → nouveau
   projet → **APIs et services → Écran de consentement OAuth** (externe, nom
   de l'app, ton adresse d'assistance) → **Identifiants → Créer → ID client
   OAuth → Application Web**. Dans **Origines JavaScript autorisées**, mets
   `https://brainoko.com` (et `http://localhost:8321` si tu
   essaies en local). Copie l'**ID client** dans la variable
   `GOOGLE_CLIENT_ID` chez Vercel.

   Il n'y a pas de « client secret » à poser : le serveur ne fait que
   vérifier la signature du jeton que Google rend au navigateur. Sans cette
   variable, le bouton n'existe pas et personne n'est présenté à Google.

   Trois pièges, dans l'ordre où on tombe dedans :

   - **L'écran de consentement réclame deux liens** — politique de
     confidentialité et conditions d'utilisation. Ce sont
     `https://brainoko.com/confidentialite.html` et
     `https://brainoko.com/cgv.html`.
   - **Publie l'application.** Laissée en *Test*, elle n'accepte que les
     comptes listés à la main. Comme tu ne demandes que le nom et l'adresse
     — des informations non sensibles — la publication est immédiate et ne
     passe par aucune vérification de Google.
   - **Les origines doivent être exactes** : `https`, pas de barre oblique
     finale, pas de chemin. C'est la cause de presque tous les boutons qui
     refusent d'entrer, et Google met parfois quelques minutes à les
     prendre en compte.

   Enfin, **Google Cloud demande d'avoir 18 ans** dans la plupart des pays.
   Depuis un compte d'adolescent, la création de projet est refusée : il
   faut passer par le compte d'un parent, qui devient alors propriétaire de
   l'identifiant.

   Témoin : `/api/sante` passe de `"google":""` à ton identifiant, et le
   bouton apparaît tout seul sur la vitrine et dans le profil.

8. **C'est fait** : `confidentialite.html` nomme l'éditeur et son adresse de
   contact, et les deux autres pages obligatoires existent
   (`mentions-legales.html`, `cgv.html`). Ce qui reste à ta main — le statut
   et l'adresse postale — est au point 10 de l'étape 5.

9. **Essaie pour de vrai** : profil → ton adresse → tu reçois le lien
   (regarde les indésirables) → tu cliques → le profil affiche ton adresse.
   Crée une fiche sur un appareil, ouvre le site sur un autre, demande un
   lien : la fiche doit être là.

→ Rien ne part ? Regarde les logs de la fonction chez Vercel : `[compte-demander]`
y écrit la raison exacte donnée par Brevo ou Resend.

---

## Étape 5 — Le paiement (en dernier, jamais avant)

Ne viens ici que quand les fiches te satisfont. On ne vend pas 9,90 € un
résumé qu'on trouve soi-même pas clair.

1. Vercel Hobby **interdit l'usage commercial**. Vendre un abonnement
   demande Pro (~20 $/mois), ou un déplacement vers Render (~7 $/mois).
   Choisis à ce moment-là.
2. [stripe.com](https://stripe.com) → **Produits → Ajouter un produit**,
   **trois fois**, chacun avec un tarif **récurrent mensuel** :

   | Produit | Prix | Ce qu'il donne |
   | --- | --- | --- |
   | Brainoko Essentiel | 4,90 € | 1 000 crédits (10 fiches) |
   | Brainoko Régulier | 9,90 € | 3 000 crédits (30 fiches) |
   | Brainoko Intensif | 14,90 € | 6 000 crédits (60 fiches) |

   Une fiche coûte 100 crédits. Le site affiche des crédits ; tu règles des
   fiches dans `abonnement.js`.

   **Pour vendre aussi à l'année**, ajoute trois produits de plus — ou
   trois tarifs annuels sur les mêmes produits : 44 €, 89 € et 134 €,
   **récurrents, annuels**. Leurs identifiants vont dans
   `STRIPE_PRIX_ESSENTIEL_AN`, `STRIPE_PRIX_REGULIER_AN` et
   `STRIPE_PRIX_INTENSIF_AN`. Sans eux, l'app ne propose que le mois —
   elle ne promet jamais un tarif qui n'existe pas.

   Note les trois identifiants `price_…`. Pour changer un prix affiché ou un
   quota, c'est `abonnement.js` (`CONFIG.offres`) — Stripe ne connaît que
   les montants.
3. **Développeurs → Clés API** → la **clé secrète**. Prends `sk_test_…`
   d'abord.
4. Variables d'environnement :

   | Nom | Valeur |
   | --- | --- |
   | `STRIPE_CLE_SECRETE` | `sk_test_…` |
   | `STRIPE_PRIX_ESSENTIEL` | `price_…` |
   | `STRIPE_PRIX_REGULIER` | `price_…` |
   | `STRIPE_PRIX_INTENSIF` | `price_…` |

   Laisse `STRIPE_WEBHOOK_SECRET` vide : sur Vercel la signature n'est pas
   vérifiable, et le webhook est facultatif.

**Porte :** `/api/sante` répond `{"pret":true,"lecture":true}`.

5. **Alors seulement**, ajoute la seconde ligne dans `app.html` :

   ```html
   window.MATHEMATIQUE_PAIEMENT = { api: "/api" };
   ```

   ⚠️ Cette ligne allume **aussi** l'essai limité : une fiche, soit
   100 crédits donnés une fois à l'ouverture du compte, qui ne se
   rechargent jamais. Mise avant que Stripe réponde `pret: true`, tes
   élèves butent sur un mur sans porte.

6. Teste avec `4242 4242 4242 4242`, n'importe quelle date future,
   n'importe quel CVC. Ton profil doit passer à « Illimité ».
**Porte :** `/api/sante` répond `"mode":"test"` et liste tes offres dans
`offres`. Une offre absente de cette liste veut dire que Stripe ne connaît
pas son `price_…` — c'est lui qu'il faut corriger, pas l'app.

### 7. Passer en mode réel

Le mode test et le mode réel sont **deux Stripe séparés** : rien ne traverse.
Les produits, les tarifs et les clés du mode test n'existent pas de l'autre
côté. Tout se refait une fois, dans cet ordre.

1. **Activer le compte** : Stripe → *Activer le compte*. Il demande ton
   identité, ton adresse, ton activité et un **IBAN** pour les virements.
   Le titulaire doit être **majeur** : si tu ne l'es pas, le compte se fait
   au nom d'un parent (ou d'une société), pas au tien.
2. Bascule le tableau de bord en **mode réel** (l'interrupteur en haut à
   droite ; il n'y est qu'une fois le compte activé).
3. **Recrée le produit et son tarif** en mode réel : *Catalogue de produits
   → Ajouter un produit*, « Brainoko Essentiel », **4,90 €**, récurrent
   mensuel. Note le nouveau `price_…` : il est différent de celui du test.
4. **Développeurs → Clés API** → la clé secrète `sk_live_…`.
5. Chez ton hébergeur, remplace **les deux** variables, pas seulement la
   clé :

   | Nom | Nouvelle valeur |
   | --- | --- |
   | `STRIPE_CLE_SECRETE` | `sk_live_…` |
   | `STRIPE_PRIX_ESSENTIEL` | le `price_…` du mode réel |

   Garder l'ancien `price_…` est l'erreur classique : Stripe le refuse, et
   l'élève ne l'apprend qu'au moment de payer. Le serveur demande donc à
   Stripe, toutes les dix minutes, lesquels de ces tarifs il connaît, et
   `/sante` ne propose que ceux-là : une offre qui disparaît de la liste
   après la bascule, c'est un `price_…` resté en mode test.
6. Redéploie, puis **vérifie `/api/sante`** : `"mode":"reel"` et
   `"offres":["essentiel"]`. Si `mode` dit encore `test`, la variable n'a
   pas été reprise — un redéploiement est nécessaire après l'avoir changée.

   `/api/sante` vérifie aussi **le montant**, pas seulement l'existence du
   tarif. Un produit recopié d'une autre application suffit à faire
   débiter 4,99 € là où la page annonce 4,90 € : le serveur retire alors
   l'offre de la vente et ajoute un champ `ecarts` qui nomme les deux
   montants. Une offre absente de `offres` sans être dans `ecarts` est un
   `price_…` que ce Stripe-ci ne connaît pas ; une offre présente dans
   `ecarts` est un prix à corriger — chez Stripe, ou dans `abonnement.js`.
7. **Active le portail client** (c'est lui qui permet de résilier) :
   *Paramètres → Facturation → Portail client* → enregistre une
   configuration, en autorisant au minimum l'annulation de l'abonnement et
   la mise à jour du moyen de paiement. Si ta clé est une clé limitée,
   ajoute-lui la permission **Billing Portal Sessions → écriture**. Sans
   ça, le bouton « Gérer ou résilier mon abonnement » répond que la gestion
   n'est pas encore ouverte.
8. Fais **un vrai paiement sur ta propre carte** : 4,90 € réellement
   débités, ton profil doit passer à Essentiel avec 1 000 crédits. Puis
   rembourse-toi depuis Stripe (*Paiements → le paiement → Rembourser*) et
   résilie l'abonnement (*Clients → ton client → Abonnements*), sinon il se
   reconduit le mois prochain.
9. **Vérifie `ORIGINES_AUTORISEES`** dans les variables Vercel : elle doit
   contenir l'adresse du site (`https://brainoko.com,https://www.brainoko.com`).
   Vide, le serveur accepte d'être appelé depuis n'importe quelle page — il
   l'écrit dans ses journaux au démarrage. Les en-têtes de sécurité du site
   (CSP, HSTS, Referrer-Policy…) sont dans `vercel.json` et n'ont rien à
   régler : `node tests/securite.js` les éprouve dans un vrai navigateur.
10. **Les mentions légales et les CGV sont écrites** (`mentions-legales.html`
   et `cgv.html`), liées depuis la vitrine, le profil et l'écran de tarif.
   Deux choses restent à ta main avant d'ouvrir à d'autres élèves :
   - **le statut.** Vendre un abonnement de façon habituelle est une activité
     commerciale : « particulier » tient le temps que tu es seul utilisateur,
     pas au-delà. Une micro-entreprise se crée en ligne, gratuitement, et te
     donne un SIREN à ajouter dans les deux pages.
   - **l'adresse postale.** Un éditeur non professionnel peut s'en dispenser
     (article 6-III-2 de la LCEN) ; un vendeur, non. La ligne est prête,
     commentée, dans `mentions-legales.html`.

---

## Les règles qui ne changent pas

- **Aucune clé ne passe par la conversation.** Clés Claude, Stripe, Brevo
  ou Resend, et surtout la clé `service_role` de la base — qui ouvre à elle
  seule toutes les bibliothèques des élèves — ne
  vivent que dans les variables d'environnement de l'hébergeur. Ni dans la
  page, ni dans un fichier du dépôt, ni dans un message. Une clé collée
  par erreur se révoque et se recrée en dix secondes — fais-le.
- **Ce que tu me transmets**, c'est la réponse de `/api/sante` ou le
  message d'erreur exact, jamais le secret.
- **Les coûts réels** : ~4 centimes par fiche sur Sonnet 5.5 (~8 sur
  Opus 5.5), plus ~1,5 % + 0,25 € par encaissement Stripe. Un élève qui
  fait 20 fiches par mois te coûte ~80 centimes sur ses 9,90 €.

Les détails techniques sont dans `serveur/LISEZMOI.md`.
