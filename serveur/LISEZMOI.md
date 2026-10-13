# Le serveur de paiement

L'app est une page statique : elle ne peut pas encaisser un paiement toute seule, parce que la
**clé secrète Stripe ne doit jamais s'y trouver** — n'importe qui pourrait alors créer des
remboursements ou lire les clients. Ce dossier est la seule pièce qui la connaît.

Il tient en un fichier, et **n'a pas de base de données** : c'est Stripe qui garde l'état de
l'abonnement, on ne fait que le lui demander.

## Les routes

| Route | Ce qu'elle fait |
| --- | --- |
| `POST /paiement` | crée la session Stripe (`mode: subscription`) et renvoie son adresse |
| `GET /licence?session=cs_…` | au retour de Stripe : cet achat donne-t-il un abonnement actif ? |
| `GET /licence?cle=cus_…` | plus tard : cet abonnement est-il **toujours** actif ? |
| `POST /webhook` | facultatif — vérifie la signature Stripe et journalise l'événement |
| `POST /lecture` | **lit les photos d'un cours** : elles partent chez Claude, la fiche revient |
| `POST /compte-demander` | envoie le lien d'entrée à une adresse e-mail |
| `GET /compte-entrer?jeton=…` | brûle le lien et redirige vers l'app, session dans l'adresse |
| `POST /compte-google` | vérifie le jeton rendu par Google et ouvre la session |
| `GET /compte-moi` | qui est au bout de cette session |
| `GET /bibliotheque` | rend la bibliothèque gardée, et sa version |
| `PUT /bibliotheque` | l'écrit, **si** la version annoncée est encore la bonne (sinon 409) |
| `POST /compte-sortir` | invalide toutes les sessions de ce compte |
| `GET /compte-export` | tout ce qui est gardé, en un fichier (RGPD) |
| `DELETE /compte-effacer` | efface le compte et ses liens en attente (RGPD) |
| `GET /sante` | dit si les clés sont bien en place (`pret` pour le paiement, `lecture` pour la lecture, `comptes` pour les comptes), dans quel `mode` Stripe tourne (`test` ou `reel`) et quelles `offres` sont réellement vendables |

La licence dit aussi **quelle offre** a été payée : le tarif de l'abonnement Stripe le révèle, donc
il n'y a toujours rien à stocker ici. Une licence d'avant les paliers, ou dont le tarif n'est plus
au catalogue, retombe sur l'offre conseillée plutôt que de bloquer quelqu'un qui paie.

La « licence » rendue à l'app est l'identifiant client Stripe (`cus_…`). Le connaître ne donne rien
d'autre que la réponse « actif » ou « non » : aucune donnée personnelle, aucun moyen de paiement ne
passe par ici. Stripe encaisse, Stripe garde.

Le webhook n'est **pas nécessaire** au fonctionnement : l'app revérifie la licence une fois par
jour, donc une résiliation se répercute au plus tard le lendemain. Il est là si tu veux réagir tout
de suite (envoyer un mail, journaliser).

## Ce qu'il faut créer chez Stripe

1. Un compte sur [stripe.com](https://stripe.com), puis **Produits → + Ajouter un produit**.
2. **Trois** tarifs **récurrents** mensuels, un par offre. Note chaque identifiant `price_…` :

   | Offre | Prix suggéré | Ce qu'elle donne |
   | --- | --- | --- |
   | Essentiel | 4,90 € | 1 000 crédits (10 fiches) |
   | Régulier | 9,90 € | 3 000 crédits (30 fiches) |
   | Intensif | 14,90 € | 7 000 crédits (70 fiches) |

   L'élève voit des crédits, le réglage se fait en fiches : `CONFIG.offres`
   donne le nombre de fiches, `CONFIG.creditsParFiche` (100) fait le reste.
   Une seule vérité, et l'autre s'en déduit.

   Les prix et les quotas affichés vivent dans `abonnement.js` (`CONFIG.offres`) :
   change-les là, pas dans la page. Chez Stripe, seuls les montants comptent.
3. Dans **Développeurs → Clés API**, prends la **clé secrète** : `sk_test_…` pour essayer,
   `sk_live_…` une fois prêt.
4. (Facultatif) **Développeurs → Webhooks → + Ajouter**, adresse `https://…/webhook`,
   événements `checkout.session.completed` et `customer.subscription.*`. Note le secret `whsec_…`.

## Les variables d'environnement

| Variable | À quoi elle sert |
| --- | --- |
| `STRIPE_CLE_SECRETE` | la clé secrète (`sk_test_…` ou `sk_live_…`) |
| `STRIPE_PRIX_ESSENTIEL` | le tarif de l'offre à 10 fiches/mois (`price_…`) |
| `STRIPE_PRIX_REGULIER` | le tarif de l'offre à 30 fiches/mois |
| `STRIPE_PRIX_INTENSIF` | le tarif de l'offre à 70 fiches/mois |
| `ORIGINES_AUTORISEES` | les adresses de l'app, séparées par des virgules — **à remplir en production** |
| `STRIPE_WEBHOOK_SECRET` | facultatif, pour le webhook (`whsec_…`) |
| `CLAUDE_CLE` | la clé Claude, pour la lecture des photos |
| `CLAUDE_MODELE` | facultatif, `claude-sonnet-5-5` par défaut ; `claude-opus-5-5` pour plus de finesse, à ~2× le prix |
| `CLAUDE_EFFORT` | facultatif, `medium` par défaut — `high` aide sur un manuscrit ingrat |
| `LECTURE_PAGES_PAR_HEURE` | facultatif, 40 par défaut — le garde-fou de facture |
| `BASE_URL` | l'adresse de la base (Supabase : *Project URL*) — vide = comptes éteints. `SUPABASE_URL` fait aussi l'affaire |
| `BASE_CLE` | la clé **`service_role`** : elle ouvre toutes les bibliothèques, elle ne sort jamais du serveur. `SUPABASE_SERVICE_ROLE_KEY` (posée par l'intégration Vercel) fait aussi l'affaire |
| `SECRET_COMPTES` | ce qui signe les sessions (32 caractères au hasard) ; en changer déconnecte tout le monde |
| `RESEND_CLE` | l'envoi des liens, si tu as un nom de domaine |
| `BREVO_CLE` | l'envoi des liens sans domaine, avec une adresse d'expéditeur vérifiée |
| `COURRIEL_EXPEDITEUR` | `Brainoko <bonjour@exemple.fr>` |
| `SITE_URL` | l'adresse publique du site : c'est elle qui part dans le courriel |
| `GOOGLE_CLIENT_ID` | facultatif — l'identifiant client OAuth, public, qui fait apparaître le bouton Google |

`ORIGINES_AUTORISEES` fait deux choses : elle limite qui peut appeler le serveur (CORS) et elle
**impose l'adresse de retour** après paiement. Sans elle, le serveur accepte n'importe quel
retour — commode pour essayer sur ta machine, à ne pas laisser en ligne.

## La lecture des photos (Claude)

Tesseract tourne gratuitement sur le téléphone de l'élève, mais il rend du **texte à plat** : il
faut ensuite deviner où sont les titres, et le manuscrit lui échappe. Un OCR classique ne fait pas
mieux sur ce point — il rend du texte, et tout le travail de mise en fiche reste à faire après.

Ici, **un seul appel fait tout** : les photos partent chez Claude, qui lit l'écriture, garde le plan
du professeur, écrit le résumé de chaque notion en phrases entières et rédige les cartes. La page
n'a plus rien à deviner — `OCR.structurerFiche()` ne fait que vérifier et ranger.

| | |
| --- | --- |
| Modèle | `claude-sonnet-5-5` (réglable par `CLAUDE_MODELE`) |
| Clé | [console.anthropic.com](https://console.anthropic.com) → `CLAUDE_CLE` |
| Coût | ≈ 4 centimes par fiche sur Sonnet 5.5, ≈ 8 sur Opus 5.5 |

**Les pages partent ensemble**, dans la même requête : un cours étalé sur deux photos garde son
fil, et une notion commencée en bas d'une page se termine en haut de la suivante. C'est la raison
principale de ne pas boucler page par page.

**La forme est garantie, pas le fond.** L'outil `rendre_fiche` est déclaré `strict`, donc la
réponse valide forcément le schéma : la page n'a jamais à se défendre contre un JSON mal bâti. Ce
que le schéma ne garantit pas, c'est la justesse — d'où la consigne, rangée par ordre d'importance,
dont la première règle est de ne rien inventer et de répondre `illisible` plutôt que de combler un
vide de mémoire.

**Ce que fait la route**

1. Elle refuse ce qui n'est pas une image (`data:image/…;base64,…`), au-delà de 4 pages ou de 14 Mo.
2. Elle freine un appareil qui demande plus de 40 pages par heure — un garde-fou pour la facture,
   gardé en mémoire du processus, donc remis à zéro à chaque redéploiement. Ce n'est pas une
   sécurité : si tu ouvres l'app au public, mets une vraie limite devant (passerelle, WAF).
3. Un refus de sécurité ne devient pas un échec : la requête porte
   `fallbacks: "default"`, donc elle repart sur un autre modèle dans le même
   appel. Un cours d'histoire sur la guerre ou de chimie sur les explosifs ne
   doit pas revenir « illisible » alors que la photo est nette.
4. Elle distingue les cinq façons d'échouer, au lieu de dire « panne » : clé refusée, surcharge,
   réponse coupée (`lecture_tronquee`), refus de sécurité et page illisible. Un refus ou une
   réponse sans fiche deviennent `illisible` — jamais une fiche vide servie comme si de rien n'était.
5. **La photo n'est ni stockée ni journalisée** : seule la fiche repart.

Elle répond `{ fiche, pages, moteur }`, ou `{ illisible: true }`. En cas de panne, l'app repasse
toute seule sur Tesseract et le dit à l'élève.

## Les comptes

Deux tables (`serveur/base.sql`), aucune dépendance : la base se parle en
HTTPS par PostgREST, le courriel aussi. Sur une fonction serverless, du HTTP
vaut mieux qu'un pool de connexions TCP rouvert à chaque réveil.

Les trois choses à ne pas perdre de vue :

- la clé `BASE_CLE` est une clé de **service** : elle contourne toutes les
  protections de la base. Elle vit dans les variables d'environnement, jamais
  dans une page, jamais dans le dépôt ;
- la base ne garde que l'**empreinte** des liens d'entrée, jamais le jeton ;
- `PUT /bibliotheque` n'écrase jamais : il écrit sous condition de version et
  rend 409 avec l'état frais, charge au client de refusionner ;
- un jeton Google n'est jamais cru sur parole : signature vérifiée contre les
  clés publiques de Google, puis émetteur, destinataire (c'est bien *notre*
  bouton qui l'a obtenu), date, et adresse vérifiée chez eux. Sans ces quatre
  contrôles, n'importe qui fabriquerait un jeton disant « je suis untel ».

Sans `BASE_URL`, `BASE_CLE`, `SECRET_COMPTES` et une clé d'envoi, toutes ces
routes répondent `503 comptes_eteints` — et l'app, qui le demande avant
d'afficher quoi que ce soit, continue comme avant.

## Essayer en local

```sh
cd serveur
npm install
STRIPE_CLE_SECRETE=sk_test_… STRIPE_PRIX_REGULIER=price_… CLAUDE_CLE=sk-ant-… npm start
# → Paiement en écoute sur http://localhost:8787
```

Les deux moitiés sont indépendantes : le paiement marche sans `CLAUDE_CLE`, la lecture marche sans
les clés Stripe. Chacune annonce ce qui lui manque au démarrage, et `/sante` le dit aussi.

**Les tarifs sont vérifiés auprès de Stripe.** Un `price_…` du mode test
laissé en place après le passage en `sk_live_…` ne serait découvert qu'au
moment de payer. Le serveur demande donc à Stripe, au plus une fois toutes
les dix minutes, lesquels de ces tarifs il connaît, et `/sante` ne propose
que ceux-là. Si Stripe est injoignable, il ne conclut rien et garde la liste
posée : mieux vaut un paiement qui échoue qu'une page de tarif vide.

Puis, dans `abonnement.js`, mets `api: "http://localhost:8787"` et sers l'app
(`python3 -m http.server 8321`). Les cartes d'essai de Stripe : `4242 4242 4242 4242`, n'importe
quelle date future, n'importe quel CVC.

## Mettre en ligne

N'importe quel hébergeur Node fait l'affaire ; le fichier exporte aussi son routeur, ce qui le rend
utilisable tel quel en fonction serverless.

**Render / Railway / Fly** — dépôt, dossier `serveur/`, commande `npm start`, et les variables
d'environnement ci-dessus.

**Vercel** — rien à préparer : le dossier `api/` à la racine du dépôt est déjà là, un fichier
par route (`api/lecture.js`, `api/sante.js`…), chacun renvoyant vers ce serveur. Le site statique et
le serveur partent alors **en un seul déploiement, sur une seule adresse** — donc plus de CORS à
régler, et dans `app.html` l’adresse du service s’écrit `"/api"`.

Le `vercel.json` de la racine fige les réglages de construction (aucun cadriciel, aucune
compilation : le site est déjà du HTML prêt à servir), donc le formulaire d'import n'a rien à
deviner. Un seul réglage reste à sa main : **Root Directory**, qu'il faut laisser à la racine du
dépôt — pointé sur `serveur/`, Vercel ne verrait plus ni `index.html` ni `app.html` ni `api/`.

Trois choses à savoir avant de choisir Vercel :

| | |
| --- | --- |
| Usage commercial | le palier **Hobby l'interdit** : vendre un abonnement demande le palier Pro (~20 $/mois) |
| Corps de requête | **4,5 Mo maximum**, et rien ne change ce chiffre. Mets `LECTURE_OCTETS_MAX=4000000` pour que l'élève reçoive une erreur claire au lieu de celle de Vercel |
| Garde-fou de facture | `LECTURE_PAGES_PAR_HEURE` compte en mémoire du processus : en fonction, chaque instance repart de zéro. Le garde-fou devient poreux (il l'était déjà, mais là plus encore) |

N'active pas le webhook sur Vercel : l'hébergeur lit le corps avant nous, donc la signature Stripe
ne peut plus être vérifiée octet par octet. Laisse `STRIPE_WEBHOOK_SECRET` vide — le webhook est de
toute façon facultatif, l'app revérifie la licence chaque jour.

En échange, une fonction ne **dort jamais** : pas de première lecture à 50 secondes comme sur un
palier gratuit qui se met en veille.

Une fois en ligne :

1. vérifie `https://ton-serveur/sante` → `{"pret":true}` ;
2. dans `abonnement.js`, renseigne `api: "https://ton-serveur"` ;
3. dans les variables du serveur, mets l'adresse publique de l'app dans `ORIGINES_AUTORISEES`.

## Ce que ça ne fait pas

- **Pas de comptes.** L'abonnement est rattaché au navigateur qui a payé. Pour le retrouver sur un
  autre téléphone, l'élève colle sa clé (`cus_…`), affichée dans son profil. De vrais comptes
  demanderaient une base de données et un mot de passe — c'est un autre chantier.
- **Pas de gestion de résiliation dans l'app.** Le portail client Stripe fait ça très bien : tu
  peux l'activer dans le tableau de bord et en donner le lien.
- **Pas de TVA calculée.** Stripe Tax s'active côté tableau de bord si tu vends en Europe.
