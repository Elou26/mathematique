# Mettre Mathématique en ligne

Quatre étapes, chacune avec une **porte** : si la porte ne s'ouvre pas, on
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

5. Dans `index.html`, décommente le bloc de branchement et garde cette
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

## Étape 4 — Le paiement (en dernier, jamais avant)

Ne viens ici que quand les fiches te satisfont. On ne vend pas 9,90 € un
résumé qu'on trouve soi-même pas clair.

1. Vercel Hobby **interdit l'usage commercial**. Vendre un abonnement
   demande Pro (~20 $/mois), ou un déplacement vers Render (~7 $/mois).
   Choisis à ce moment-là.
2. [stripe.com](https://stripe.com) → **Produits → Ajouter un produit**,
   **trois fois**, chacun avec un tarif **récurrent mensuel** :

   | Produit | Prix | Ce qu'il donne |
   | --- | --- | --- |
   | Mathématique Essentiel | 4,90 € | 1 000 crédits (10 fiches) |
   | Mathématique Régulier | 9,90 € | 3 000 crédits (30 fiches) |
   | Mathématique Intensif | 14,90 € | 7 000 crédits (70 fiches) |

   Une fiche coûte 100 crédits. Le site affiche des crédits ; tu règles des
   fiches dans `abonnement.js`.

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

5. **Alors seulement**, ajoute la seconde ligne dans `index.html` :

   ```html
   window.MATHEMATIQUE_PAIEMENT = { api: "/api" };
   ```

   ⚠️ Cette ligne allume **aussi** la limite de 3 fiches gratuites. Mise
   avant que Stripe réponde `pret: true`, tes élèves butent sur un mur
   sans porte.

6. Teste avec `4242 4242 4242 4242`, n'importe quelle date future,
   n'importe quel CVC. Ton profil doit passer à « Illimité ».
7. Remplace par `sk_live_…` et fais un vrai paiement sur ta propre carte
   pour valider. Tu te rembourseras depuis Stripe.

---

## Les règles qui ne changent pas

- **Aucune clé ne passe par la conversation.** Clés Claude et Stripe ne
  vivent que dans les variables d'environnement de l'hébergeur. Ni dans la
  page, ni dans un fichier du dépôt, ni dans un message. Une clé collée
  par erreur se révoque et se recrée en dix secondes — fais-le.
- **Ce que tu me transmets**, c'est la réponse de `/api/sante` ou le
  message d'erreur exact, jamais le secret.
- **Les coûts réels** : ~4 centimes par fiche sur Sonnet 5.5 (~8 sur
  Opus 5.5), plus ~1,5 % + 0,25 € par encaissement Stripe. Un élève qui
  fait 20 fiches par mois te coûte ~80 centimes sur ses 9,90 €.

Les détails techniques sont dans `serveur/LISEZMOI.md`.
