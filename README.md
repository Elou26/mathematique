# Mathématique — app de révision (version mobile)

Site statique mobile-first de révision **toutes matières confondues** (maths, physique-chimie,
SVT, histoire-géo, philosophie), construit en HTML/CSS/JS vanille (aucune dépendance, aucun build).

**Aucun cours n'est livré avec l'application.** La bibliothèque démarre vide : chaque matière
est une catégorie (voir `MATIERES` dans `data.js`) qui, une fois ouverte, propose de créer une
fiche de révision avec les outils déjà en place — photo, cours, IA ou texte écrit à la main.
Les fiches créées sont enregistrées sur l'appareil (`localStorage`, clé `mathematique.fiches`)
et alimentent ensuite les trois outils, la file de révision espacée et le profil.

## Lancer

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000 (mode mobile dans les devtools)
```

## Structure

| Fichier | Rôle |
| --- | --- |
| `styles.css` | Charte graphique : bleu marine `#1B2A6B`, bleu pastel `#CFE0F7`, fond gris clair `#F4F5F7` |
| `app.js` | Navigation, bibliothèque de fiches, sélecteur partagé, moteurs résumé / quiz / flashcards |
| `data.js` | Données : matières, catalogue des thèmes, paliers de révision, défis, banques de secours (questions rédigées et cartes) |
| `generateurs.js` | Générateurs de questions : la banque des quiz ne s'épuise pas |
| `ocr.js` | Lecture de secours sur l'appareil (Tesseract.js) + mise en fiche par règles |
| `moteur/` | Tesseract.js, son cœur WebAssembly et le modèle français, servis depuis le site |

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
- **Barre du bas** bleu marine : accueil, fiches, profil ; icône bleu gris pastel,
  blanche + trait blanc sous l'onglet actif.

## Onglet « Mes fiches » — une catégorie par matière

Chaque matière du programme du profil est un dossier replié : nom, nombre de fiches et
progression moyenne. L'ouvrir déplie soit les fiches déjà créées (titre, ancienneté, dernière
révision, barre de progression, « Réviser maintenant », « Supprimer »), soit — tant qu'elle est
vide — la phrase « Aucune fiche en *matière* pour l'instant » ; dans les deux cas, un bouton
**« Créer une fiche de révision »** ouvre la feuille de création **pré-réglée sur cette
matière** (son titre devient « Créer une fiche · Histoire-Géo », la demande IA est amorcée,
le scan pré-sélectionne les thèmes de la matière).

Le carrousel de l'accueil suit la même règle : la matière dépliée propose, sous ses thèmes, un
bouton « Créer une fiche en *matière* ».

Une fiche entre dans la bibliothèque par trois chemins : un document photographié envoyé vers un
outil, un résumé « Enregistré dans mes fiches », ou le bilan d'un quiz sur sujet libre
(« Garder ce sujet dans mes fiches »). Les quiz lancés depuis une fiche mettent à jour sa date
de révision et son meilleur score.

### Nommer la fiche avant de la ranger

Les trois chemins passent par la même feuille **« Nommer ta fiche »** (`ouvrirFeuilleNom()`),
avant tout enregistrement :

- le titre est proposé en forme de chapitre (`enChapitre()` : majuscule initiale, espaces
  resserrés, pas de ponctuation finale) et reste entièrement modifiable ;
- quatre chapitres du programme de la matière sont proposés en un geste ;
- la matière devinée est pré-sélectionnée et se change d'une touche, « Autre » compris ;
- « Annuler » (ou Échap, ou le fond) n'enregistre rien.

Depuis le scan, le bouton devient « Enregistrer et continuer » : la fiche est rangée, puis
l'outil demandé s'ouvre. Une fiche déjà présente dans la bibliothèque n'est pas renommée : elle
est simplement marquée comme révisée.

## La boucle d'apprentissage

L'app est construite autour de ce qui fait réellement mémoriser : se tester plutôt que relire,
espacer les reprises, revenir sur ses erreurs, et tenir la régularité.

**L'accueil ouvre sur ce qui est dû** (`rendreAujourdhui()`) : les fiches à revoir aujourd'hui,
la plus en retard en tête, avec un bouton « Réviser » qui lance le quiz sans détour. Au-dessus,
le compte des révisions du jour et la série de jours consécutifs (🔥 à partir de deux). Quand
tout est à jour, le bloc dit quand tombe la prochaine et propose **une fiche au hasard** —
mélanger les sujets ancre mieux que réviser en bloc.

**Le palier suit le résultat, pas le calendrier.** `echeancesFiches()` calcule l'échéance depuis
le **palier de la fiche** (`PALIERS_REVISION` : J+1, J+3, J+7, J+15, J+30), pas depuis le temps
écoulé : une fiche oubliée reste due et affiche son retard, au lieu de glisser toute seule d'un
palier au suivant. `marquerRevisee()` fait monter le palier au-dessus de 60 % de réussite, le
remet à zéro en dessous de 40 %, et le laisse tel quel entre les deux.

**Le quiz rend l'erreur utile** : le bilan propose « Revoir mes N erreurs », qui rejoue
uniquement les questions ratées, choix remélangés.

**Les flashcards s'auto-évaluent en trois niveaux** — *À revoir* (la carte revient 2 cartes plus
loin), *Presque* (5 cartes plus loin), *Je savais* (elle sort) : un Leitner ramené à l'échelle de
la séance, au lieu d'un simple « raté / su ». Le recto invite d'abord à répondre de tête.

**Après une fiche, on se teste** : « Me tester sur cette fiche » est l'action principale de la
fiche de résumé, devant l'enregistrement.

Le journal (`mathematique.journal`, une ligne par jour) alimente la série et le compte du jour ;
la pastille de la cloche compte les fiches dues ; le profil affiche fiches créées, jours
d'affilée et progression moyenne.

## Feuille « Option de création de fiche »

La carte d'accueil ouvre une feuille qui monte depuis le bas (poignée, fond assombri, fermeture
au clic sur le fond, sur « Annuler » ou avec Échap) avec ses tuiles, chacune sa teinte :

| Tuile | Icône | Destination |
| --- | --- | --- |
| Avec ta fiche | scan, violet | La photo du cours, lue par Claude, puis Quiz / Fiche / FlashCards |
| Rédiger | crayon, orange | Fiche de résumé, source « Coller un texte », zone au focus |

Deux façons de créer, pas plus : la photo d'une fiche, ou son propre texte. L'atelier
« Générer par l'IA » n'est plus une option de création ; il reste accessible depuis le panneau
« Sujet libre » de la page Quiz (« Aide-moi à formuler ma demande »), qui sert aussi à lancer
un quiz sur n'importe quel sujet.

## Page « Générer par l'IA »

Une zone de texte pour décrire ce qu'on veut réviser, et une jauge qui note la précision de la
demande sur quatre critères (`analyserDemande()` dans `app.js`) :

| Critère | Comment il est détecté |
| --- | --- |
| Le chapitre ou la notion | un thème du catalogue ou une de tes fiches est nommé, ou au moins trois mots significatifs |
| Ton niveau | un mot de niveau (collège, terminale, licence…) apparaît |
| Le nombre de questions | un nombre accompagné de « question », « QCM » ou « quiz » |
| Ce que tu veux travailler | un mot d'angle (surtout, uniquement, en évitant, calcul, dates…) ou une demande de 140 caractères |

La jauge passe de l'orange au bleu marine puis au vert, et le bouton **Générer le quiz** reste
désactivé sous deux critères : une demande vague donnerait un quiz à côté de la plaque. Des
puces ajoutent un bout de phrase en un geste (« + niveau lycéen », « + 10 questions »…), et un
exemple de demande précise se recopie d'un bouton.

### Les questions écrites par Claude

Publiée comme Artifact, la page déclare la capacité `sample` et peut demander le quiz à Claude,
**sur le compte du lecteur** : `await claude.use("sample")` puis `sample.json(invite, …)`.
L'invite (`CONSIGNE_QUIZ` dans `app.js`) impose la forme attendue — titre, questions, quatre
propositions, indice de la bonne réponse, explication — et `validerQuizIA()` vérifie chaque
question avant d'en faire une partie : quatre propositions distinctes, indice entre 0 et 3,
énoncé non vide. Une réponse mal formée est refusée plutôt qu'affichée.

**Tous les chemins y passent.** Un thème du carrousel, une fiche scannée ou une demande écrite
dans l'atelier partent à Claude dès que la capacité répond — `lancerQuiz()` n'appelle
`lancerQuizLocal()` qu'en repli. Le panneau « sujet non couvert » propose d'ailleurs un bouton
« Demander à Claude » quand il est joignable. Tant que le runtime n'a pas répondu, la page
attend (« Connexion à Claude… ») au lieu de basculer trop tôt sur le local.

Un bandeau dit d'où viennent les questions, et chaque issue a son traitement :

| Situation | Ce que fait la page |
| --- | --- |
| Claude répond | Le quiz démarre, bandeau « … · écrit par Claude » |
| Quota atteint, session expirée, refus, réponse illisible | Message sur la page, la demande reste modifiable |
| Capacité absente ou refusée | Repli sur les chapitres connus, bandeau mis à jour |
| Bouton « Arrêter » | La génération est interrompue (`AbortController`) |

Hors Artifact — le site servi tel quel — `window.claude` n'existe pas : la page bascule
d'elle-même sur le repli local.

**Le repli local.** La demande part vers le moteur de quiz interne. Comme le chapitre y est
noyé dans une phrase, `chercherBanque()` est appelée avec une couverture minimale de 0 :
l'expression-clé doit figurer en entier dans la demande, mais elle n'a plus à en représenter la
moitié des mots.

`node tests/generation-claude.js` éprouve les quatre issues avec un faux runtime d'artefact,
`node tests/generation-carrousel.js` vérifie qu'un thème du carrousel part bien à Claude, et
`node tests/bibliotheque.js` vérifie qu'aucun cours n'est livré d'avance, que chaque catégorie
propose la création d'une fiche, et que la fiche créée irrigue les outils, la file et le profil.

## Page « Photographier mon cours »

C'est le point d'entrée des trois outils : on photographie d'abord, on choisit ensuite quoi en
faire. **C'est Claude qui lit les pages** — il n'y a pas d'OCR embarqué.

1. **Type de document** — leçon, devoir ou contrôle (`TYPES_DOCUMENT` dans `app.js`). Le choix
   change la consigne envoyée avec les images : une leçon garde la structure du cours, un devoir
   retient les méthodes et les erreurs à éviter, un contrôle cible ce qui est tombé.
2. **Cadrage** — un viseur à quatre coins, puis « Prendre une photo » (`<input type="file"
   accept="image/*" capture="environment">`, qui ouvre l'appareil photo sur mobile) ou
   « Choisir une image ». Plusieurs pages : elles s'ajoutent en vignettes (un clic retire la
   page), dans la limite de `limits().images.maxCount`.
3. **Lecture** — `lirePages()` envoie les pages à `sample.json(invite, { images })`. La consigne
   (`CONSIGNE_LECTURE`) demande **une fiche complète et soignée**, pas un survol : des phrases
   entières qui se tiennent seules, tout le document partie par partie, **chaque exemple repris
   avec son énoncé et sa résolution**, les notations du document conservées — et rien d'inventé.
   Les flashcards sont tenues d'être de **vraies questions** : la consigne donne des exemples à
   suivre (« Comment calcule-t-on la raison d'une suite arithmétique ? ») et à proscrire
   (« Propriété ? », « Que dit le cours ? », un mot suivi d'un point d'interrogation).
   `validerLecture()` vérifie la forme, échappe tout le texte (`nettoyer()`) et refuse une
   réponse incomplète ; `{"lisible": false}` affiche la raison au lieu d'inventer une fiche.
   Une fiche lue s'affiche **entière** : ni le réglage de longueur ni les options à inclure ne
   la rabotent.
4. **Exploitation** — la fiche lue s'affiche (titre, matière, premiers points, nombre de cartes),
   le titre remplit le champ du thème, puis **FlashCards**, **Fiche** ou **Quiz**. Après le
   nommage en chapitre, la fiche est rangée avec son `contenu` et ses `cartes` : les flashcards
   sortent du document photographié, le résumé affiche ce qui a été lu (sans regénérer), et un
   quiz lancé sur cette fiche part de ses points essentiels.

### Sans compte Claude : la lecture se fait sur l'appareil (`ocr.js`)

`raisonLecture()` distingue deux empêchements et le dit en toutes lettres, dans le bandeau du
haut **et** juste au-dessus du bouton :

- `claude.use("sample")` répond `null` — le plus souvent un lecteur **non connecté** à claude.ai,
  puisque la lecture de Claude tourne sur son compte ;
- `sample.limits()` n'annonce pas `images` — Claude répond, mais cette vue ne peut pas lui envoyer
  de photos.

Dans les deux cas, le bouton devient **« Lire ma page sur mon appareil »** : `ocr.js` lance
Tesseract.js **servi depuis le site lui-même** (dossier `moteur/`, 8,4 Mo une fois pour toutes —
voir `moteur/LISEZMOI.md`) et lit les pages **dans la page, sans compte, sans serveur et sans
rien à payer**. Le lecteur télécharge le cœur WebAssembly (~3,9 Mo) et le modèle français
(600 Ko) à sa première lecture, puis son navigateur les garde en cache.
`« Continuer sans lecture »` reste offert juste en dessous.

Tout est servi depuis la même origine — `workerBlobURL: false` compris — parce que la page
publiée n'a pas le droit d'aller chercher des fichiers sur un domaine tiers : c'est ce qui
faisait tourner le chargement à l'infini quand le moteur venait d'un CDN. Les CDN restent
déclarés en second dans `OCR.SOURCES`, pour une app servie sans le dossier `moteur/`.

**Aucune attente n'est infinie** : le chargement du script, chaque sonde de modèle et le moteur
lui-même sont bornés (`DELAI_SCRIPT`, `DELAI_SONDE`, `DELAI_SILENCE`) ; une lecture qui progresse
repousse sa propre limite, une lecture muette rend la main avec un message qui dit quoi faire.

Tesseract ne rend que du **texte brut** : la mise en fiche est faite par des règles
(`OCR.structurer()`), pas par une IA —

| Règle | Ce qu'elle produit |
| --- | --- |
| Mots de l'application ou du navigateur (`BRUIT_APP`) | rien : une capture d'écran de l'app ne pollue pas la fiche |
| Ligne reprise deux fois en tête de page | le titre du chapitre |
| Comptage de mots par matière (`MOTS_MATIERES`) | la matière, si elle se détache (≥ 3 occurrences) |
| `Définition : une suite arithmétique est …` | « Qu'est-ce qu'une suite arithmétique ? » — le sujet est extrait de la définition |
| `Propriété/Théorème/Règle/Formule/Méthode` | « Quelle propriété le cours énonce-t-il sur <chapitre> ? » |
| `raison : la différence constante…` | « Que signifie « raison » dans ce cours ? » — aucun article inventé, donc aucun faux genre |
| `Exemple : …` et les lignes qui suivent | l'exemple entier, énoncé **et** résolution |
| `X = …`, même plusieurs sur une ligne, égalités en chaîne comprises | « Dans l'exemple du cours, que vaut X ? » pour une valeur, « Quelle expression donne X ? » pour une formule |
| `1789 : …` | une carte « Que se passe-t-il en 1789 ? » |
| `Exemple :` | la section *Exemples* de la fiche, jamais une carte |
| 4 phrases de 30 à 180 caractères, sans redite, sans fragment, sans ligne de calcul | *L'essentiel* |

Les lignes courtes (titres, numéros, navigation) sont exclues de la prose : mêlées au texte, elles
fabriquaient des phrases qui n'existent pas. Les égalités sont posées à plat, en pastilles.

**Toute carte est une vraie question** : `ajouter()` refuse un recto de moins de trois mots ou qui
ne se termine pas par un point d'interrogation, et le verso est remis en phrase (majuscule, point
final). Les intitulés accentués sont enfin reconnus — `\b` ne considère pas « é » comme une lettre,
d'où un `(?![a-zà-ÿ])` à la place, sans quoi « Propriété » passait au travers.

La fiche produite **dit d'où elle vient** (« leçon lue sur ton appareil »), son accroche invite à
la relire, et un repli « Voir le texte lu » montre le texte brut pour vérifier. La photo ne quitte
jamais l'appareil dans ce mode, et elle n'est jamais enregistrée.

Les chemins de CDN et de modèle sont regroupés dans `OCR.SOURCES` : si un CDN change de structure,
c'est le seul endroit à corriger. Quand rien ne se charge (blocage réseau, CSP), le message le dit
et renvoie au chemin manuel.

`node tests/lecture-photo.js` couvre les quatre cas avec un faux runtime : lecture réussie
(images transmises, fiche et cartes rangées), document illisible (aucune fiche inventée),
capacité sans images (repli sur l'appareil) et absence de Claude.
`node tests/lecture-appareil.js` couvre la lecture sur l'appareil avec un faux Tesseract : fiche et
cartes tirées d'un vrai texte de cours, photo muette annoncée sans rien inventer, moteur muet ou
injoignable annoncé franchement plutôt que de tourner sans fin.
`node tests/apprentissage.js` parcourt la boucle entière : l'accueil qui ouvre sur les fiches
dues et annonce le retard, la révision lancée depuis l'accueil, le palier qui suit le score, les
erreurs rejouées seules, le compte du jour et la série qui avancent, et une carte ratée qui
revient dans la séance.
`node tests/lecture-reelle.js` fait la **vraie** lecture : il imprime une page de cours avec le
navigateur, la fait lire par le moteur embarqué (≈ 1 s), et vérifie le titre retenu, la matière
devinée, les cartes tirées du texte — et qu'aucune requête ne sort du site.

## Page « Créer résumé »

Ouverte depuis la tuile *Créer résumé* des Outils IA (`#vue-resume`).

1. **Source** : une de tes fiches, un texte collé (200 caractères minimum) ou un fichier importé
   (PDF / photo — seul le nom du fichier est lu, rien n'est envoyé).
2. **Longueur** : court / standard / détaillé — pilote le nombre de points retenus.
3. **À inclure** : formules clés, exemples corrigés, pièges fréquents.

La génération est aujourd'hui **simulée côté client** (`genererResume()` dans `app.js`, un
`setTimeout` de 1,2 s puis une fiche construite depuis `RESUMES` dans `data.js`). Brancher un
vrai service revient à remplacer ce `setTimeout` par l'appel réseau et à passer la réponse à
`rendreFiche()`. *Enregistrer dans mes fiches* range vraiment la fiche dans la bibliothèque, à
la matière reconnue ; *Générer des flashcards* lance le paquet quand une banque de cartes
correspond au sujet, et le dit franchement sinon.

## Page « Créer quiz »

Deux origines au choix :

- **Mes fiches** — filtre par matière puis fiche ; bibliothèque vide, le sélecteur propose d'en créer une.
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

Les banques de questions sont dans `QUIZ` (`data.js`), indexées par identifiant de chapitre de
secours (`BANQUES`). Ces chapitres ne sont jamais présentés comme des cours de l'utilisateur :
ils servent de repli hors ligne quand Claude n'est pas joignable.

## Page « FlashCards »

Filtre par matière → fiche → ordre (mélangé ou ordre du cours). La carte se retourne au
toucher (rotation 3D CSS), puis deux verdicts : *À revoir* (la carte repasse une fois en fin de
paquet) ou *Je savais*. Le bilan compte les cartes sues du premier coup et propose de rejouer
uniquement celles qui ont été ratées.

`cartesDeLaFiche()` sert d'abord les cartes lues sur le document photographié (`fiche.cartes`),
et retombe sur les paquets de secours de `FLASHCARDS` (`data.js`) quand la fiche n'en a pas.

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
