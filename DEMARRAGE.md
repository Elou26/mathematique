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

## Étape 2 — La lecture des photos (gratuit, 20 min)

C'est l'étape qui décide de tout le projet. Si Mistral ne lit pas bien tes
cours, rien de ce qui suit ne sert.

1. [console.mistral.ai](https://console.mistral.ai) → compte → numéro de
   téléphone vérifié → **API Keys** → nouvelle clé.
   **Pas de carte bancaire** : le palier « Experiment » est gratuit.
2. Vercel → ton projet → **Settings → Environment Variables** :

   | Nom | Valeur |
   | --- | --- |
   | `MISTRAL_CLE` | ta clé |
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

## Étape 3 — La synthèse (pas encore faite)

À ce stade, les fiches sont **fidèles mais brutes** : les notions sont les
titres de ton cours, les flashcards les termes en gras avec la définition
telle qu'écrite. Rien n'est reformulé, rien n'est résumé.

Parce que tout ce qui raisonnait dans l'app passait par l'artifact, qui
n'existe plus une fois le site hébergé ailleurs.

La même clé Mistral ouvre la porte qui manque :
`/v1/chat/completions`. Un seul serveur, une seule facture.

**Ce n'est pas branché.** Demande-le quand l'étape 2 est validée.

---

## Étape 4 — Le paiement (en dernier, jamais avant)

Ne viens ici que quand les fiches te satisfont. On ne vend pas 9,90 € un
résumé qu'on trouve soi-même pas clair.

1. Vercel Hobby **interdit l'usage commercial**. Vendre un abonnement
   demande Pro (~20 $/mois), ou un déplacement vers Render (~7 $/mois).
   Choisis à ce moment-là.
2. [stripe.com](https://stripe.com) → **Produits → Ajouter un produit** :
   « Mathématique illimité », tarif **récurrent**, **9,90 €/mois**.
   Note l'identifiant `price_…`
3. **Développeurs → Clés API** → la **clé secrète**. Prends `sk_test_…`
   d'abord.
4. Variables d'environnement :

   | Nom | Valeur |
   | --- | --- |
   | `STRIPE_CLE_SECRETE` | `sk_test_…` |
   | `STRIPE_PRIX` | `price_…` |

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

- **Aucune clé ne passe par la conversation.** Clés Mistral et Stripe ne
  vivent que dans les variables d'environnement de l'hébergeur. Ni dans la
  page, ni dans un fichier du dépôt, ni dans un message. Une clé collée
  par erreur se révoque et se recrée en dix secondes — fais-le.
- **Ce que tu me transmets**, c'est la réponse de `/api/sante` ou le
  message d'erreur exact, jamais le secret.
- **Les coûts réels** : 0,35 centime la page lue, ~1,5 % + 0,25 € par
  encaissement Stripe. Un élève à 40 pages/mois te coûte 14 centimes sur
  ses 9,90 €.

Les détails techniques sont dans `serveur/LISEZMOI.md`.
