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
| `POST /lecture` | **lit une photo de cours** : elle part chez Mistral, le markdown revient |
| `GET /sante` | dit si les clés sont bien en place (`pret` pour le paiement, `lecture` pour l'OCR) |

La « licence » rendue à l'app est l'identifiant client Stripe (`cus_…`). Le connaître ne donne rien
d'autre que la réponse « actif » ou « non » : aucune donnée personnelle, aucun moyen de paiement ne
passe par ici. Stripe encaisse, Stripe garde.

Le webhook n'est **pas nécessaire** au fonctionnement : l'app revérifie la licence une fois par
jour, donc une résiliation se répercute au plus tard le lendemain. Il est là si tu veux réagir tout
de suite (envoyer un mail, journaliser).

## Ce qu'il faut créer chez Stripe

1. Un compte sur [stripe.com](https://stripe.com), puis **Produits → + Ajouter un produit**.
2. Un tarif **récurrent** (mensuel, par exemple 3,99 €). Note son identifiant : `price_…`.
3. Dans **Développeurs → Clés API**, prends la **clé secrète** : `sk_test_…` pour essayer,
   `sk_live_…` une fois prêt.
4. (Facultatif) **Développeurs → Webhooks → + Ajouter**, adresse `https://…/webhook`,
   événements `checkout.session.completed` et `customer.subscription.*`. Note le secret `whsec_…`.

## Les variables d'environnement

| Variable | À quoi elle sert |
| --- | --- |
| `STRIPE_CLE_SECRETE` | la clé secrète (`sk_test_…` ou `sk_live_…`) |
| `STRIPE_PRIX` | l'identifiant du tarif récurrent (`price_…`) |
| `ORIGINES_AUTORISEES` | les adresses de l'app, séparées par des virgules — **à remplir en production** |
| `STRIPE_WEBHOOK_SECRET` | facultatif, pour le webhook (`whsec_…`) |
| `MISTRAL_CLE` | la clé Mistral, pour la lecture des photos |
| `MISTRAL_MODELE` | facultatif, `mistral-ocr-latest` par défaut |
| `LECTURE_PAGES_PAR_HEURE` | facultatif, 40 par défaut — le garde-fou de facture |

`ORIGINES_AUTORISEES` fait deux choses : elle limite qui peut appeler le serveur (CORS) et elle
**impose l'adresse de retour** après paiement. Sans elle, le serveur accepte n'importe quel
retour — commode pour essayer sur ta machine, à ne pas laisser en ligne.

## La lecture des photos (Mistral Document AI)

Tesseract tourne gratuitement sur le téléphone de l'élève, mais il rend du **texte à plat** : il
faut ensuite deviner où sont les titres, et le manuscrit lui échappe. Mistral Document AI rend du
**markdown déjà structuré** — `##` pour les parties, `-` pour les listes, les tableaux en tableaux —
et lit l'écriture manuscrite. Du coup la fiche garde les titres **du document** au lieu de les
inventer, et le lexique sort des termes en gras.

| | |
| --- | --- |
| Modèle | `mistral-ocr-latest` |
| Adresse | `https://api.mistral.ai/v1/ocr` |
| Prix | ≈ 3,50 € les 1 000 pages, soit **0,35 centime la page** |

Il te faut une clé sur [console.mistral.ai](https://console.mistral.ai), à mettre dans
`MISTRAL_CLE`. Rien d'autre : la route est déjà là.

**Ce que fait la route**

1. Elle refuse ce qui n'est pas une image (`data:image/…;base64,…`), au-delà de 4 pages ou de 14 Mo.
2. Elle freine un appareil qui demande plus de 40 pages par heure — un garde-fou pour la facture,
   gardé en mémoire du processus, donc remis à zéro à chaque redéploiement. Ce n'est pas une
   sécurité : si tu ouvres l'app au public, mets une vraie limite devant (passerelle, WAF).
3. Elle envoie la photo comme `image_url` ; si l'API refuse cette forme, elle retente en
   `document_url`. C'est le seul endroit à corriger si leur schéma change.
4. **La photo n'est ni stockée ni journalisée** : seul le texte repart.

Elle répond `{ markdown, pages, moteur }`, ou `{ illisible: true }` quand la page n'a presque rien
donné. En cas de panne, l'app repasse toute seule sur Tesseract et le dit à l'élève.

## Essayer en local

```sh
cd serveur
npm install
STRIPE_CLE_SECRETE=sk_test_… STRIPE_PRIX=price_… MISTRAL_CLE=… npm start
# → Paiement en écoute sur http://localhost:8787
```

Les deux moitiés sont indépendantes : le paiement marche sans `MISTRAL_CLE`, la lecture marche sans
les clés Stripe. Chacune annonce ce qui lui manque au démarrage, et `/sante` le dit aussi.

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
régler, et dans `index.html` l'adresse du service s'écrit `"/api"`.

Le `vercel.json` de la racine fige les réglages de construction (aucun cadriciel, aucune
compilation : le site est déjà du HTML prêt à servir), donc le formulaire d'import n'a rien à
deviner. Un seul réglage reste à sa main : **Root Directory**, qu'il faut laisser à la racine du
dépôt — pointé sur `serveur/`, Vercel ne verrait plus ni `index.html` ni `api/`.

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
