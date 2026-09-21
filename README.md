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
| `styles.css` | Charte graphique : bleu marine `#1B2A6B`, bleu pastel `#CFE0F7`, fond gris clair `#F4F5F7` |
| `app.js` | Navigation, sélecteur de cours partagé, moteurs résumé / quiz / flashcards |
| `data.js` | Données : matières, cours, catalogue des thèmes, révision espacée, défis, questions rédigées et cartes |
| `generateurs.js` | Générateurs de questions : la banque des quiz ne s'épuise pas |

## Écran de bienvenue (choix du profil)

À la première visite, un écran plein écran propose **quatre profils** — Collégien, Lycéen,
Étudiant, Autre (`NIVEAUX` dans `data.js`). Un seul geste : toucher une carte enregistre le
profil et ferme l'écran, il n'y a pas de bouton « Continuer ».

`PROGRAMMES_PAR_NIVEAU` relie chaque profil aux programmes du catalogue (collégien = 6ᵉ+5ᵉ+4ᵉ+3ᵉ,
lycéen = 2de+1re+Tle, étudiant = prépa+licence+master+BTS, autre = reprise).
`programmeDuNiveau()` les fusionne en piochant à tour de rôle dans chacun, pour que le carrousel
mélange les années, et s'arrête à 12 thèmes par matière.

Le choix est mémorisé dans `localStorage` sous la clé `mathematique.niveau`, protégé par
`try/catch` — si le stockage est bloqué, le profil vaut pour la session. `ANCIENS_NIVEAUX`
convertit les classes précises enregistrées par les versions précédentes (« Master » →
`etudiant`), sans redemander à l'utilisateur. Le profil s'affiche dans l'onglet *Profil* et se
change avec « Changer de niveau ».

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
- **Créer une fiche** : une carte bleu marine ouvre la feuille d'options (voir ci-dessous).
- ~~Outils IA~~ (14 px, gras) : 3 tuiles cliquables — Créer résumé, Créer quiz, FlashCards.
- **Défis** (16 px, gras) : les défis de la semaine et le bouton « Affronter un ami ».
- **Barre du bas** bleu marine : accueil, cours, profil ; icône bleu gris pastel,
  blanche + trait blanc sous l'onglet actif.

## Feuille « Option de création de fiche »

La carte d'accueil ouvre une feuille qui monte depuis le bas (poignée, fond assombri, fermeture
au clic sur le fond, sur « Annuler » ou avec Échap) avec quatre tuiles en 2×2, chacune sa teinte :

| Tuile | Icône | Destination |
| --- | --- | --- |
| Avec ta fiche | scan, violet | La page de scan (photo) |
| Avec tes cours | livre, vert | Fiche de résumé, source « Mes cours » |
| Générer par l'IA | baguette, bleu | Quiz, mode « Sujet libre », champ au focus |
| Rédiger | crayon, orange | Fiche de résumé, source « Coller un texte », zone au focus |

## Page « Scanner ma fiche »

C'est le point d'entrée des trois outils : on scanne d'abord, on choisit ensuite quoi en faire.

1. **Cadrage** — un viseur à quatre coins, puis « Prendre une photo » (`<input type="file"
   accept="image/*" capture="environment">`, qui ouvre l'appareil photo sur mobile) ou
   « Choisir une image ». Pas de `getUserMedia` : le champ natif fonctionne partout, y compris
   dans une iframe sans permission caméra.
2. **Lecture** — l'aperçu se réduit, une ligne de balayage passe sur la fiche et trois étapes
   se cochent.
3. **Exploitation** — on confirme le thème de la fiche (champ libre, plus des raccourcis à deux
   niveaux : matière du programme puis ses huit thèmes), puis on choisit **Résumé**, **Quiz** ou
   **FlashCards**. Le thème est rapproché d'un chapitre connu : le quiz démarre aussitôt, la
   fiche de résumé se génère, le paquet de cartes se lance.

**L'OCR n'est pas branchée.** `lireLaFiche()` dans `app.js` est le point d'accroche unique : il
renvoie aujourd'hui `{ texte: "", titre: "" }`, d'où l'étape de confirmation du thème. Aucun
faux texte n'est fabriqué à partir de la photo, et l'image ne quitte pas l'appareil.

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

Ensuite : nombre de questions (5, 10, 20 ou **sans fin**) → correction immédiate ou à la fin.

### Une banque qui ne s'épuise pas

`generateurs.js` expose `GENERATEURS[idDuCours]`, une liste de modèles de questions tirés au
sort et paramétrés au hasard. `ouvrirTirage()` (dans `app.js`) panache les questions rédigées
à la main et les questions fabriquées, en mémorisant les énoncés déjà posés : une partie ne
repose jamais deux fois la même question.

- **Chapitres calculatoires** (dérivées, probabilités, suites, géométrie, ondes) : les valeurs
  sont tirées au hasard à chaque question, et les mauvaises réponses reproduisent les erreurs
  classiques (coefficient oublié, exposant non abaissé, tirage avec remise…). Le nombre
  d'énoncés possibles n'est pas borné.
- **Chapitres factuels** (guerre froide, génétique, conscience) : les questions naissent d'une
  table de faits avec plusieurs tournures (date → événement, événement → date, notion →
  définition, auteur → thèse). Le réservoir est large mais fini ; c'est la limite honnête de
  ce qui se génère sans modèle de langue.

Le mode **sans fin** enchaîne les questions jusqu'à « Terminer et voir mon score ».

`node tests/generateurs.js` tire 500 questions par chapitre et vérifie la forme des QCM
(quatre propositions distinctes, bonne réponse présente, pas de `NaN`, signes moins corrects)
ainsi que la variété des énoncés. Les questions **et** l'ordre des réponses sont mélangés à chaque partie
(`preparerQuestions()`), avec explication pour chaque item. Le bilan affiche le score, le
pourcentage et la liste des questions ratées avec la bonne réponse et son corrigé.

Les banques de questions sont dans `QUIZ` (`data.js`), indexées par identifiant de cours.

## Page « FlashCards »

Filtre par matière → chapitre → ordre (mélangé ou ordre du cours). La carte se retourne au
toucher (rotation 3D CSS), puis deux verdicts : *À revoir* (la carte repasse une fois en fin de
paquet) ou *Je savais*. Le bilan compte les cartes sues du premier coup et propose de rejouer
uniquement celles qui ont été ratées.

Les paquets sont dans `FLASHCARDS` (`data.js`).

## Ergonomie des formulaires

Les trois outils n'affichent que l'essentiel : la source et le chapitre. Tout le reste —
longueur du résumé, contenu à inclure, nombre de questions, moment de la correction, ordre des
cartes — vit dans un repli `<details class="reglages">` dont le résumé affiche l'état courant
(« 5 questions · correction immédiate »). Aucune étape n'est numérotée.

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
