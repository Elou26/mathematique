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
| `GET /sante` | dit si les clés sont bien en place |

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

`ORIGINES_AUTORISEES` fait deux choses : elle limite qui peut appeler le serveur (CORS) et elle
**impose l'adresse de retour** après paiement. Sans elle, le serveur accepte n'importe quel
retour — commode pour essayer sur ta machine, à ne pas laisser en ligne.

## Essayer en local

```sh
cd serveur
npm install
STRIPE_CLE_SECRETE=sk_test_… STRIPE_PRIX=price_… npm start
# → Paiement en écoute sur http://localhost:8787
```

Puis, dans `abonnement.js`, mets `api: "http://localhost:8787"` et sers l'app
(`python3 -m http.server 8321`). Les cartes d'essai de Stripe : `4242 4242 4242 4242`, n'importe
quelle date future, n'importe quel CVC.

## Mettre en ligne

N'importe quel hébergeur Node fait l'affaire ; le fichier exporte aussi son routeur, ce qui le rend
utilisable tel quel en fonction serverless.

**Render / Railway / Fly** — dépôt, dossier `serveur/`, commande `npm start`, et les variables
d'environnement ci-dessus.

**Vercel** — place `index.js` dans `api/` (ou ajoute un `vercel.json` qui route tout vers lui) ;
le module exporte `(requete, reponse)`, la signature attendue.

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
