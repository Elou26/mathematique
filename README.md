# Mathématique — app de révision (version mobile)

Site statique mobile-first de révision **toutes matières confondues** (maths, physique-chimie,
SVT, histoire-géo, philosophie), construit en HTML/CSS/JS vanille (aucune dépendance, aucun build).

Chaque cours porte une `matiere` (voir `MATIERES` dans `data.js`) : les trois outils IA
proposent d'abord un filtre par matière, puis la liste des chapitres correspondants.

## Lancer

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000 (mode mobile dans les devtools)
```

## Structure

| Fichier | Rôle |
| --- | --- |
| `index.html` | Structure des 5 vues (accueil, cours, communauté, profil, révision espacée) |
| `styles.css` | Charte graphique : bleu marine `#1B2A6B`, bleu pastel `#CFE0F7`, fond gris clair `#F4F5F7` |
| `app.js` | Navigation, sélecteur de cours partagé, moteurs résumé / quiz / flashcards |
| `data.js` | Données de démonstration : matières, cours, communautés, révision espacée, banques de questions et de cartes |

## Écran de bienvenue (choix du niveau)

À la première visite, un écran plein écran demande la classe avant d'ouvrir l'application :
collège (6ᵉ → 3ᵉ), lycée (Seconde, Première, Terminale) et études supérieures (Prépa, BTS/BUT,
Licence 1 à 3, Master, Doctorat, Reprise d'études). La liste vit dans `NIVEAUX` (`data.js`).

Le choix est mémorisé dans `localStorage` sous la clé `mathematique.niveau` : l'écran ne
réapparaît plus ensuite. Les lectures et écritures sont protégées par `try/catch` — si le
stockage est bloqué (navigation privée, iframe restreinte), le niveau reste valable pour la
session et l'écran revient à la visite suivante. Le niveau s'affiche dans l'onglet *Profil*,
se change avec le bouton « Changer de niveau », et accompagne la demande d'un quiz sur sujet
libre.

## Carrousel dépliant des thèmes

La page d'accueil s'ouvre sur « Thèmes · <classe> » : un carrousel horizontal des matières du
programme, chaque carte se dépliant sur la liste de ses thèmes. Un thème ouvre directement
« Créer quiz » en mode *sujet libre*, pré-rempli avec le thème et la classe.

Le contenu vit dans `CATALOGUE` (`data.js`) : **12 programmes, 440 thèmes**, au moins 8 par
matière, calés sur le programme officiel de chaque classe. `NIVEAU_VERS_PROGRAMME` relie les
15 classes proposées à leur programme (Licence 1/2/3 partagent `licence`, Master et Doctorat
partagent `master`).

| Programme | Matières |
| --- | --- |
| 6e, 5e, 4e, 3e | Maths, Physique-Chimie, SVT, Histoire-Géo, Français |
| 2de, 1re | Maths, Physique-Chimie, SVT, Histoire-Géo, Français |
| Tle | Maths, Physique-Chimie, SVT, Histoire-Géo, Philosophie |
| prepa | Maths, Physique, Informatique, Français-Culture générale |
| bts | Maths, Économie-Gestion, Informatique, Français |
| licence | Maths, Physique, Informatique, Économie |
| master | Maths, Informatique, Économie, Méthodologie |
| reprise | Maths, Français, Histoire-Géo, Informatique |

Sans niveau renseigné, le bloc affiche un bouton « Choisir ma classe » qui rouvre l'écran de
bienvenue ; changer de niveau reconstruit le carrousel.

## Écran d'accueil

- **Header** bleu pastel : logo + nom du site (16 px), cloche à droite → onglet *Révision espacée*.
- **Outils IA** (14 px, gras) : 3 tuiles cliquables — Créer résumé, Créer quiz, FlashCards.
- **Communauté et Défis** (16 px, gras) : sélecteur arrondi scindé en deux ; *Communauté*
  affiche les communautés les plus rejointes, *Défis* affiche le bouton « Affronter un ami ».
- **Barre du bas** bleu marine : accueil, cours, communauté, profil ; icône bleu gris pastel,
  blanche + trait blanc sous l'onglet actif.

## Page « Créer résumé »

Ouverte depuis la tuile *Créer résumé* des Outils IA (`#vue-resume`).

1. **Source** : un cours suivi, un texte collé (200 caractères minimum) ou un fichier importé
   (PDF / photo — seul le nom du fichier est lu, rien n'est envoyé).
2. **Longueur** : court / standard / détaillé — pilote le nombre de points retenus.
3. **À inclure** : formules clés, exemples corrigés, pièges fréquents.

La génération est aujourd'hui **simulée côté client** (`genererResume()` dans `app.js`, un
`setTimeout` de 1,2 s puis une fiche construite depuis `RESUMES` dans `data.js`). Brancher un
vrai service revient à remplacer ce `setTimeout` par l'appel réseau et à passer la réponse à
`rendreFiche()`. Les actions de la fiche (*Enregistrer*, *Générer des flashcards*) affichent
pour l'instant une confirmation.

## Page « Créer quiz »

Deux origines au choix :

- **Mes cours** — filtre par matière puis chapitre.
- **Sujet libre** — un champ *Sujet du quiz* (obligatoire, 80 caractères) et une zone
  *Complément d'information* facultative (600 caractères) pour préciser le niveau, les notions à
  cibler ou les consignes. `chercherBanque()` rapproche le sujet saisi des banques locales via
  les `motsCles` de chaque cours ; sans correspondance, un panneau récapitule la demande
  (sujet, complément, format) telle qu'elle partira au service de génération, et propose des
  chapitres disponibles.

Ensuite : nombre de questions (3, 5 ou tout le chapitre) → correction
immédiate ou à la fin. Les questions **et** l'ordre des réponses sont mélangés à chaque partie
(`preparerQuestions()`), avec explication pour chaque item. Le bilan affiche le score, le
pourcentage et la liste des questions ratées avec la bonne réponse et son corrigé.

Les banques de questions sont dans `QUIZ` (`data.js`), indexées par identifiant de cours.

## Page « FlashCards »

Filtre par matière → chapitre → ordre (mélangé ou ordre du cours). La carte se retourne au
toucher (rotation 3D CSS), puis deux verdicts : *À revoir* (la carte repasse une fois en fin de
paquet) ou *Je savais*. Le bilan compte les cartes sues du premier coup et propose de rejouer
uniquement celles qui ont été ratées.

Les paquets sont dans `FLASHCARDS` (`data.js`).

## Rapprochement d'un sujet libre

`chercherBanque()` (dans `app.js`) relie un sujet saisi à une banque de questions locale. La
règle est volontairement stricte : titre identique, ou expression-clé du cours entièrement
retrouvée dans le sujet **et** pesant au moins la moitié de ses mots significatifs. Les
fragments de mots ne comptent pas, les mots outils sont ignorés, et la matière est imposée
quand le sujet vient du carrousel. Sans correspondance franche, l'application le dit au lieu
de servir un QCM hors sujet.

`node tests/recherche-sujet.js` vérifie une série de cas attendus puis passe les 440 thèmes du
catalogue : il sort en erreur si un cas échoue, et liste les thèmes appariés pour relecture.

## Ce qui reste simulé

Les trois outils IA utilisent un `setTimeout` en guise d'appel réseau et piochent dans les
données locales. Pour brancher un vrai service, remplacer ce délai dans `genererResume()`,
`lancerQuiz()` et `lancerCartes()` par l'appel API correspondant. Aucune donnée n'est
persistée entre deux visites (pas de stockage local pour l'instant).
