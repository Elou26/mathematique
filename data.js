/* Données de démonstration — remplaçables par un appel API plus tard.
   Le site couvre toutes les matières : chaque cours porte une `matiere`. */

const MATIERES = {
  maths:    { nom: "Mathématiques",   court: "Maths",    emoji: "📐" },
  physique: { nom: "Physique-Chimie", court: "Physique", emoji: "🧪" },
  svt:      { nom: "SVT",             court: "SVT",      emoji: "🧬" },
  histoire: { nom: "Histoire-Géo",    court: "Histoire", emoji: "🗺️" },
  philo:    { nom: "Philosophie",     court: "Philo",    emoji: "💭" },
  francais: { nom: "Français",        court: "Français", emoji: "📖" },
  info:     { nom: "Informatique",    court: "Info",     emoji: "💻" },
  economie: { nom: "Économie-Gestion",court: "Éco",      emoji: "📊" },
  methodo:  { nom: "Méthodologie",    court: "Méthodo",  emoji: "🎓" },
};

/* Chaque classe renvoie vers un programme du catalogue (voir CATALOGUE). */
const NIVEAU_VERS_PROGRAMME = {
  "6ᵉ": "6e", "5ᵉ": "5e", "4ᵉ": "4e", "3ᵉ": "3e",
  "Seconde": "2de", "Première": "1re", "Terminale": "Tle",
  "Prépa": "prepa", "BTS / BUT": "bts",
  "Licence 1": "licence", "Licence 2": "licence", "Licence 3": "licence",
  "Master": "master", "Doctorat": "master",
  "Reprise d'études": "reprise",
};

/* Quatre profils seulement : inutile de demander la classe exacte. */
const NIVEAUX = [
  { id: "collegien", nom: "Collégien",  detail: "De la 6ᵉ à la 3ᵉ",                    emoji: "🎒" },
  { id: "lyceen",    nom: "Lycéen",     detail: "De la Seconde à la Terminale",        emoji: "📗" },
  { id: "etudiant",  nom: "Étudiant",   detail: "Prépa, BTS, licence, master",         emoji: "🎓" },
  { id: "autre",     nom: "Autre",      detail: "Reprise d'études, remise à niveau",   emoji: "🧭" },
];

/* Chaque profil regroupe plusieurs programmes du catalogue (voir CATALOGUE). */
const PROGRAMMES_PAR_NIVEAU = {
  collegien: ["6e", "5e", "4e", "3e"],
  lyceen: ["2de", "1re", "Tle"],
  etudiant: ["prepa", "licence", "master", "bts"],
  autre: ["reprise"],
};

/* Les classes précises enregistrées par les versions précédentes restent valables. */
const ANCIENS_NIVEAUX = {
  "6ᵉ": "collegien", "5ᵉ": "collegien", "4ᵉ": "collegien", "3ᵉ": "collegien",
  "Seconde": "lyceen", "Première": "lyceen", "Terminale": "lyceen",
  "Prépa": "etudiant", "BTS / BUT": "etudiant", "Licence 1": "etudiant",
  "Licence 2": "etudiant", "Licence 3": "etudiant", "Master": "etudiant", "Doctorat": "etudiant",
  "Reprise d'études": "autre",
};

const COURS = [
  { id: "derivees",  matiere: "maths",    titre: "Dérivées et taux de variation",   chapitre: "Analyse",              niveau: "Terminale", premierJour: "2026-08-19", derniereRevision: "2026-09-19", progression: 72, motsCles: ["derivee", "derivees", "derivation", "nombre derive", "tangente", "taux de variation"] },
  { id: "probas",    matiere: "maths",    titre: "Probabilités conditionnelles",    chapitre: "Probabilités",         niveau: "Terminale", premierJour: "2026-09-02", derniereRevision: "2026-09-17", progression: 45, motsCles: ["probabilite conditionnelle", "probabilites conditionnelles", "conditionnelle", "arbre pondere", "independance", "probabilites totales", "bayes"] },
  { id: "suites",    matiere: "maths",    titre: "Suites arithmético-géométriques", chapitre: "Suites",               niveau: "Terminale", premierJour: "2026-09-08", derniereRevision: "2026-09-20", progression: 28, motsCles: ["suite arithmetico geometrique", "suites arithmetico geometriques", "point fixe", "suite geometrique", "suite arithmetique", "raison de la suite", "suite numerique", "suites numeriques"] },
  { id: "vecteurs",  matiere: "maths",    titre: "Géométrie dans l'espace",         chapitre: "Géométrie",            niveau: "Terminale", premierJour: "2026-07-30", derniereRevision: "2026-09-12", progression: 91, motsCles: ["produit scalaire", "vecteur normal", "geometrie dans l espace", "representation parametrique", "equation de plan"] },
  { id: "ondes",     matiere: "physique", titre: "Ondes et interférences",          chapitre: "Ondes",                niveau: "Terminale", premierJour: "2026-08-25", derniereRevision: "2026-09-18", progression: 54, motsCles: ["interference", "interferences", "diffraction", "effet doppler", "longueur d onde", "onde mecanique", "difference de marche"] },
  { id: "genetique", matiere: "svt",      titre: "Brassage génétique et méiose",    chapitre: "Génétique",            niveau: "Terminale", premierJour: "2026-09-05", derniereRevision: "2026-09-16", progression: 38, motsCles: ["meiose", "mitose", "brassage genetique", "brassage interchromosomique", "crossing over", "gamete", "code genetique"] },
  { id: "guerrefroide", matiere: "histoire", titre: "La guerre froide (1947-1991)", chapitre: "Le monde bipolaire",   niveau: "Terminale", premierJour: "2026-08-12", derniereRevision: "2026-09-14", progression: 66, motsCles: ["guerre froide", "urss", "berlin", "crise de cuba", "doctrine truman", "plan marshall", "pacte de varsovie", "monde bipolaire", "rideau de fer"] },
  { id: "conscience", matiere: "philo",   titre: "La conscience",                   chapitre: "Le sujet",             niveau: "Terminale", premierJour: "2026-09-01", derniereRevision: "2026-09-13", progression: 41, motsCles: ["conscience", "cogito", "inconscient", "descartes", "freud", "sartre", "mauvaise foi"] },
];

const COMMUNAUTES = [
  { id: "bac-2027", nom: "Objectif Bac 2027", membres: 12480, emoji: "🎓" },
  { id: "prepa-mpsi", nom: "Prépa MPSI — entraide", membres: 8340, emoji: "📐" },
  { id: "annales", nom: "Annales corrigées", membres: 6120, emoji: "📝" },
  { id: "matin", nom: "Révision du matin", membres: 3970, emoji: "☀️" },
];

const DEFIS = [
  { id: "duel-derivees", nom: "Duel express — Dérivées", detail: "10 questions · 5 min", xp: 150 },
  { id: "marathon", nom: "Marathon de calcul mental", detail: "30 questions · 10 min", xp: 300 },
  { id: "survie", nom: "Mode survie — Guerre froide", detail: "Jusqu'à 3 erreurs", xp: 220 },
];

/* File de révision espacée : intervalles 1 / 3 / 7 / 15 / 30 jours, toutes matières. */
const REVISION_ESPACEE = [
  { id: "derivees", titre: "Dérivées et taux de variation", matiere: "maths", palier: "J+7", echeance: "2026-09-21", etat: "aujourdhui" },
  { id: "genetique", titre: "Brassage génétique et méiose", matiere: "svt", palier: "J+3", echeance: "2026-09-21", etat: "aujourdhui" },
  { id: "conscience", titre: "La conscience", matiere: "philo", palier: "J+1", echeance: "2026-09-22", etat: "demain" },
  { id: "guerrefroide", titre: "La guerre froide (1947-1991)", matiere: "histoire", palier: "J+15", echeance: "2026-09-27", etat: "a-venir" },
  { id: "ondes", titre: "Ondes et interférences", matiere: "physique", palier: "J+30", echeance: "2026-10-12", etat: "a-venir" },
];

/* ————————————————————————————————————————————————————————————————
   Fiches de résumé (outil « Créer résumé »)
   `libelleFormules` adapte l'intitulé de la section aux matières
   non scientifiques (repères, notions…).
   ———————————————————————————————————————————————————————————————— */
const RESUMES = {
  derivees: {
    accroche: "La dérivée mesure la vitesse de variation d'une fonction en un point : c'est le coefficient directeur de la tangente.",
    points: [
      "Le taux de variation entre a et a+h tend vers f'(a) quand h tend vers 0.",
      "Une fonction dérivable en a est continue en a — la réciproque est fausse (|x| en 0).",
      "Le signe de f' donne les variations de f : f' > 0 sur un intervalle ⇒ f croissante.",
      "f'(a) = 0 avec changement de signe ⇒ extremum local en a.",
    ],
    formules: ["(uv)' = u'v + uv'", "(u/v)' = (u'v − uv') / v²", "(u∘v)' = v' × (u'∘v)", "(xⁿ)' = n·xⁿ⁻¹ · (eˣ)' = eˣ · (ln x)' = 1/x"],
    exemples: ["f(x) = x²·eˣ ⇒ f'(x) = x(x+2)eˣ, donc f décroît sur [−2 ; 0].", "Tangente en 1 à f(x) = ln x : y = x − 1."],
    pieges: ["Ne pas confondre f'(a) (un nombre) et f' (une fonction).", "Dériver un quotient sans vérifier que le dénominateur ne s'annule pas."],
  },
  probas: {
    accroche: "Une probabilité conditionnelle réévalue une probabilité une fois qu'une information est connue.",
    points: [
      "P<sub>B</sub>(A) se lit « probabilité de A sachant B » et n'a de sens que si P(B) ≠ 0.",
      "Un arbre pondéré : la somme des branches partant d'un même nœud vaut 1.",
      "A et B sont indépendants si P(A∩B) = P(A)×P(B), donc si P<sub>B</sub>(A) = P(A).",
    ],
    formules: ["P<sub>B</sub>(A) = P(A∩B) / P(B)", "P(A∩B) = P(B) × P<sub>B</sub>(A)", "Total : P(A) = P(A∩B) + P(A∩B̄)"],
    exemples: ["Test à 99 % de fiabilité sur une maladie touchant 0,1 % : P(malade | test +) ≈ 9 %.", "Urne 3 rouges / 2 noires, sans remise : P(2 rouges) = 3/5 × 2/4 = 3/10."],
    pieges: ["P<sub>B</sub>(A) et P<sub>A</sub>(B) ne sont pas égales — c'est l'erreur la plus fréquente.", "Incompatible (A∩B = ∅) n'est pas indépendant."],
  },
  suites: {
    accroche: "Une suite arithmético-géométrique s'étudie en la ramenant à une suite géométrique auxiliaire.",
    points: [
      "Forme uₙ₊₁ = a·uₙ + b avec a ≠ 1.",
      "On cherche le point fixe ℓ tel que ℓ = a·ℓ + b, soit ℓ = b/(1−a).",
      "vₙ = uₙ − ℓ est géométrique de raison a, d'où uₙ = (u₀ − ℓ)·aⁿ + ℓ.",
      "Si |a| < 1, la suite converge vers ℓ.",
    ],
    formules: ["ℓ = b / (1 − a)", "uₙ = (u₀ − ℓ)·aⁿ + ℓ", "1 + q + … + qⁿ = (1 − qⁿ⁺¹)/(1 − q), q ≠ 1"],
    exemples: ["uₙ₊₁ = 0,5uₙ + 3, u₀ = 1 : ℓ = 6, uₙ = −5×0,5ⁿ + 6 → converge vers 6."],
    pieges: ["Oublier de justifier a ≠ 1 avant de calculer le point fixe.", "Confondre la raison de vₙ avec celle de uₙ (uₙ n'est pas géométrique)."],
  },
  vecteurs: {
    accroche: "Dans l'espace, tout se ramène à un repère et à trois coordonnées : positions, directions et orthogonalité.",
    points: [
      "Trois points non alignés définissent un plan ; un plan se décrit par un point et deux vecteurs directeurs.",
      "Représentation paramétrique d'une droite : M = A + t·u⃗.",
      "Deux vecteurs sont orthogonaux si leur produit scalaire est nul.",
    ],
    formules: ["u⃗·v⃗ = xx' + yy' + zz'", "‖u⃗‖ = √(x² + y² + z²)", "Plan : ax + by + cz + d = 0, de normale n⃗(a ; b ; c)"],
    exemples: ["Distance de A(1;2;3) au plan x + y + z − 6 = 0 : |1+2+3−6| / √3 = 0, donc A appartient au plan."],
    pieges: ["Un vecteur normal n'est pas un vecteur directeur du plan.", "Deux droites sans point commun peuvent être non coplanaires."],
  },
  ondes: {
    accroche: "Une onde transporte de l'énergie sans transport de matière ; sa signature est le couple longueur d'onde / fréquence.",
    points: [
      "Une onde mécanique a besoin d'un milieu matériel, contrairement à une onde électromagnétique.",
      "La diffraction apparaît quand l'ouverture est de l'ordre de la longueur d'onde.",
      "Deux sources cohérentes interfèrent : constructif si la différence de marche vaut kλ.",
    ],
    formules: ["λ = v / f = v × T", "Interférences : δ = kλ (constructif), δ = (k + ½)λ (destructif)", "Diffraction : θ ≈ λ / a"],
    exemples: ["Un son à 340 m/s et 680 Hz a une longueur d'onde de 0,5 m."],
    pieges: ["La célérité dépend du milieu, pas de la fréquence de la source.", "Confondre période (en s) et longueur d'onde (en m)."],
  },
  genetique: {
    accroche: "La méiose et la fécondation produisent, à chaque génération, des combinaisons d'allèles uniques.",
    points: [
      "La méiose transforme une cellule diploïde en quatre cellules haploïdes.",
      "Le brassage intrachromosomique (crossing-over) a lieu en prophase I.",
      "Le brassage interchromosomique vient de la répartition aléatoire des homologues en anaphase I.",
      "La fécondation ajoute un troisième niveau de brassage, aléatoire lui aussi.",
    ],
    libelleFormules: "Repères clés",
    formules: ["Diploïde 2n → 4 cellules à n chromosomes", "2²³ combinaisons possibles par gamète humain (hors crossing-over)"],
    exemples: ["Un croisement test (F1 × double récessif) révèle si deux gènes sont liés ou indépendants."],
    pieges: ["Confondre mitose (2 cellules identiques) et méiose (4 cellules haploïdes différentes).", "Situer le crossing-over en anaphase au lieu de la prophase I."],
  },
  guerrefroide: {
    accroche: "De 1947 à 1991, deux blocs s'affrontent sans guerre directe : idéologie, dissuasion nucléaire et conflits périphériques.",
    points: [
      "1947 : doctrine Truman (endiguement) contre doctrine Jdanov — la rupture est consommée.",
      "Berlin est le symbole du conflit : blocus (1948-49), mur (1961), chute (1989).",
      "La crise de Cuba (1962) marque le point de bascule vers la Détente.",
      "1991 : disparition de l'URSS et fin du monde bipolaire.",
    ],
    libelleFormules: "Dates à retenir",
    formules: ["1947 — doctrines Truman et Jdanov", "1949 — OTAN, RFA/RDA", "1961 — mur de Berlin", "1962 — crise de Cuba", "1989 — chute du mur", "1991 — fin de l'URSS"],
    exemples: ["Le plan Marshall (1947) : aide économique américaine refusée par l'URSS, qui fonde le COMECON en réponse."],
    pieges: ["Dater la guerre froide de 1945 : la rupture est de 1947.", "Confondre pacte de Varsovie (1955) et COMECON (1949)."],
  },
  conscience: {
    accroche: "La conscience est à la fois ce qui me rend présent au monde et ce qui me rend problématique à moi-même.",
    points: [
      "Descartes fonde la certitude sur le cogito : je peux douter de tout, sauf que je pense.",
      "Freud conteste la transparence du sujet : l'essentiel du psychisme est inconscient.",
      "Hegel montre que la conscience de soi passe par la reconnaissance d'autrui.",
      "Sartre : l'homme est conscience et liberté, la mauvaise foi est ce mensonge à soi-même.",
    ],
    libelleFormules: "Notions et citations",
    formules: ["« Je pense, donc je suis » — Descartes", "« Le moi n'est pas maître dans sa propre maison » — Freud", "« L'existence précède l'essence » — Sartre"],
    exemples: ["Dissertation type : « La conscience de soi est-elle une connaissance de soi ? » — thèse cartésienne, objection freudienne, dépassement."],
    pieges: ["Réduire la conscience morale à la conscience psychologique.", "Prendre l'inconscient freudien pour une simple inattention."],
  },
};

/* Fiche générée quand la source est un texte collé ou un fichier importé. */
const RESUME_GENERIQUE = {
  accroche: "Fiche construite à partir de la source que tu as fournie, structurée en notions, méthodes et points de vigilance.",
  points: [
    "Notions identifiées dans le document et remises dans l'ordre du programme.",
    "Méthode de résolution pas à pas, reformulée en une phrase par étape.",
    "Vocabulaire et notations à connaître pour l'épreuve.",
  ],
  formules: ["Les formules et repères trouvés dans la source sont regroupés ici."],
  exemples: ["Un exemple du document est repris et corrigé intégralement."],
  pieges: ["Les erreurs les plus fréquentes sur ce type d'exercice sont signalées."],
};

/* ————————————————————————————————————————————————————————————————
   Banques de questions (outil « Créer quiz »)
   bonne = index de la bonne réponse dans `choix`.
   ———————————————————————————————————————————————————————————————— */
const QUIZ = {
  derivees: [
    { q: "Quelle est la dérivée de f(x) = x³ − 4x ?", choix: ["3x² − 4", "x² − 4", "3x² − 4x", "3x³ − 4"], bonne: 0, explication: "On dérive terme à terme : (x³)' = 3x² et (−4x)' = −4." },
    { q: "Que représente f'(a) ?", choix: ["L'ordonnée de f en a", "Le coefficient directeur de la tangente en a", "L'aire sous la courbe", "La limite de f en a"], bonne: 1, explication: "f'(a) est la pente de la tangente à la courbe au point d'abscisse a." },
    { q: "La dérivée d'un produit (uv)' vaut :", choix: ["u'v'", "u'v + uv'", "u'v − uv'", "(u'v + uv')/v²"], bonne: 1, explication: "Formule du produit : (uv)' = u'v + uv'. Attention, ce n'est jamais u'v'." },
    { q: "Si f'(x) < 0 sur ]0 ; 3[, alors sur cet intervalle f est :", choix: ["Croissante", "Décroissante", "Constante", "Nulle"], bonne: 1, explication: "Le signe de la dérivée donne le sens de variation : f' < 0 ⇒ f décroissante." },
    { q: "Quelle est la dérivée de g(x) = e^(2x) ?", choix: ["e^(2x)", "2e^(2x)", "2x·e^(2x)", "e²"], bonne: 1, explication: "(e^u)' = u'·e^u avec u = 2x, donc u' = 2." },
    { q: "Une fonction dérivable en a est nécessairement :", choix: ["Continue en a", "Croissante en a", "Positive en a", "Nulle en a"], bonne: 0, explication: "Dérivable ⇒ continue. La réciproque est fausse : |x| est continue mais non dérivable en 0." },
  ],
  probas: [
    { q: "Comment se calcule P<sub>B</sub>(A) ?", choix: ["P(A∩B) / P(B)", "P(A) / P(B)", "P(A∩B) / P(A)", "P(A) × P(B)"], bonne: 0, explication: "Par définition, P<sub>B</sub>(A) = P(A∩B)/P(B), avec P(B) ≠ 0." },
    { q: "A et B sont indépendants si :", choix: ["P(A∩B) = P(A) + P(B)", "P(A∩B) = P(A) × P(B)", "A ∩ B = ∅", "P<sub>B</sub>(A) = 0"], bonne: 1, explication: "L'indépendance se traduit par P(A∩B) = P(A)×P(B), c'est-à-dire P<sub>B</sub>(A) = P(A)." },
    { q: "Dans un arbre pondéré, la somme des branches issues d'un même nœud vaut :", choix: ["0", "0,5", "1", "Le nombre de branches"], bonne: 2, explication: "Les branches issues d'un nœud forment une partition : leur somme vaut toujours 1." },
    { q: "Urne de 3 boules rouges et 2 noires, deux tirages sans remise. P(2 rouges) = ?", choix: ["3/10", "9/25", "2/5", "1/2"], bonne: 0, explication: "3/5 × 2/4 = 6/20 = 3/10. Sans remise, la deuxième probabilité change." },
    { q: "Deux événements incompatibles de probabilité non nulle sont :", choix: ["Toujours indépendants", "Jamais indépendants", "Équiprobables", "Complémentaires"], bonne: 1, explication: "Si A∩B = ∅ alors P(A∩B) = 0 ≠ P(A)×P(B) > 0 : ils ne peuvent pas être indépendants." },
    { q: "Formule des probabilités totales : P(A) = ?", choix: ["P(A∩B) + P(A∩B̄)", "P(A) × P(B)", "P<sub>B</sub>(A) + P<sub>B̄</sub>(A)", "1 − P(B)"], bonne: 0, explication: "B et B̄ forment une partition : P(A) = P(A∩B) + P(A∩B̄)." },
  ],
  suites: [
    { q: "Pour uₙ₊₁ = 3uₙ + 2, le point fixe ℓ vaut :", choix: ["−1", "1", "2", "−2"], bonne: 0, explication: "ℓ = b/(1−a) = 2/(1−3) = −1." },
    { q: "Avec ce point fixe, la suite vₙ = uₙ − ℓ est :", choix: ["Arithmétique", "Géométrique de raison 3", "Constante", "Divergente par définition"], bonne: 1, explication: "vₙ est géométrique de raison a, ici 3." },
    { q: "Une suite géométrique de raison q converge si :", choix: ["|q| < 1", "q > 1", "q = 1", "q < 0"], bonne: 0, explication: "qⁿ tend vers 0 quand |q| < 1 ; la suite converge alors." },
    { q: "Vers quoi tend uₙ = 5 × 0,8ⁿ + 2 ?", choix: ["0", "2", "5", "+∞"], bonne: 1, explication: "0,8ⁿ → 0, il ne reste que la constante 2." },
    { q: "Quelle est la somme 1 + q + … + qⁿ (q ≠ 1) ?", choix: ["(1 − qⁿ⁺¹)/(1 − q)", "(1 − qⁿ)/(1 − q)", "n(n+1)/2", "qⁿ⁺¹ − 1"], bonne: 0, explication: "Il y a n+1 termes, d'où l'exposant n+1 au numérateur." },
    { q: "Pourquoi exige-t-on a ≠ 1 dans uₙ₊₁ = a·uₙ + b ?", choix: ["Sinon la suite est arithmétique et ℓ n'existe pas", "Sinon la suite est négative", "Sinon q = 0", "Sinon la suite est constante"], bonne: 0, explication: "Si a = 1 la suite est arithmétique de raison b, et b/(1−a) n'est pas défini." },
  ],
  vecteurs: [
    { q: "Que vaut u⃗(1 ; 2 ; −1) · v⃗(3 ; 0 ; 3) ?", choix: ["0", "6", "3", "−3"], bonne: 0, explication: "1×3 + 2×0 + (−1)×3 = 0 : les vecteurs sont orthogonaux." },
    { q: "Un vecteur normal au plan x + 2y − z + 4 = 0 est :", choix: ["(1 ; 2 ; −1)", "(1 ; 2 ; 1)", "(1 ; −2 ; −1)", "(4 ; 0 ; 0)"], bonne: 0, explication: "Les coefficients de x, y et z donnent directement la normale." },
    { q: "Que vaut ‖u⃗(2 ; 3 ; 6)‖ ?", choix: ["7", "11", "√11", "41"], bonne: 0, explication: "√(4 + 9 + 36) = √49 = 7." },
    { q: "Une représentation paramétrique de droite nécessite :", choix: ["Un point et un vecteur directeur", "Deux plans parallèles", "Trois points alignés", "Un vecteur normal"], bonne: 0, explication: "M appartient à la droite si M = A + t·u⃗, avec A un point et u⃗ un directeur." },
    { q: "Deux droites de l'espace sans point commun et non parallèles sont :", choix: ["Sécantes", "Confondues", "Non coplanaires", "Orthogonales"], bonne: 2, explication: "Dans l'espace, deux droites peuvent n'être ni sécantes ni parallèles : elles sont non coplanaires." },
  ],
  ondes: [
    { q: "Quelle relation lie longueur d'onde, célérité et fréquence ?", choix: ["λ = v / f", "λ = v × f", "λ = f / v", "λ = v / T²"], bonne: 0, explication: "λ = v/f = v×T : la longueur d'onde est la distance parcourue en une période." },
    { q: "Deux sources cohérentes interfèrent de façon constructive si la différence de marche vaut :", choix: ["kλ", "(k + ½)λ", "λ/4", "0 uniquement"], bonne: 0, explication: "δ = kλ met les ondes en phase ; δ = (k+½)λ donne des interférences destructives." },
    { q: "L'effet Doppler se traduit par une variation de :", choix: ["La fréquence perçue", "L'amplitude uniquement", "La célérité de la lumière", "La taille de la source"], bonne: 0, explication: "Le mouvement relatif source/récepteur modifie la fréquence reçue, pas la célérité." },
    { q: "Une onde mécanique se propage :", choix: ["Dans le vide", "Seulement dans un milieu matériel", "Uniquement dans l'air", "À la vitesse de la lumière"], bonne: 1, explication: "Elle a besoin d'un support matériel, contrairement aux ondes électromagnétiques." },
    { q: "La diffraction est d'autant plus marquée que :", choix: ["L'ouverture est petite devant λ", "L'ouverture est grande", "λ est petite", "L'amplitude est grande"], bonne: 0, explication: "L'écart angulaire θ ≈ λ/a augmente quand l'ouverture a diminue." },
  ],
  genetique: [
    { q: "La méiose produit :", choix: ["4 cellules haploïdes", "2 cellules diploïdes", "1 cellule haploïde", "2 cellules haploïdes"], bonne: 0, explication: "Deux divisions successives donnent 4 cellules à n chromosomes." },
    { q: "Le crossing-over correspond au brassage :", choix: ["Intrachromosomique", "Interchromosomique", "Génique", "Mitotique"], bonne: 0, explication: "Il échange des portions entre chromosomes homologues, en prophase I." },
    { q: "Le brassage interchromosomique a lieu :", choix: ["En anaphase I", "En prophase I", "En télophase II", "Pendant la fécondation"], bonne: 0, explication: "Les paires d'homologues se séparent aléatoirement vers chaque pôle en anaphase I." },
    { q: "Une mutation ponctuelle dite silencieuse :", choix: ["Ne change pas l'acide aminé codé", "Supprime le gène", "Décale le cadre de lecture", "Duplique un chromosome"], bonne: 0, explication: "Grâce à la redondance du code génétique, le codon muté code le même acide aminé." },
    { q: "Le code génétique est dit redondant car :", choix: ["Plusieurs codons codent un même acide aminé", "Un codon code plusieurs acides aminés", "Il est universel", "Il comporte des introns"], bonne: 0, explication: "64 codons pour 20 acides aminés : plusieurs codons sont synonymes." },
  ],
  guerrefroide: [
    { q: "En quelle année la doctrine Truman est-elle énoncée ?", choix: ["1947", "1945", "1950", "1961"], bonne: 0, explication: "Mars 1947 : doctrine de l'endiguement, à laquelle répond la doctrine Jdanov." },
    { q: "Le mur de Berlin est construit en :", choix: ["1961", "1949", "1953", "1989"], bonne: 0, explication: "Août 1961, pour stopper l'exode des Allemands de l'Est ; il tombe en novembre 1989." },
    { q: "La crise des missiles de Cuba a lieu en :", choix: ["1962", "1956", "1968", "1975"], bonne: 0, explication: "Octobre 1962 : point culminant de la tension, suivi d'une phase de Détente." },
    { q: "Le pacte de Varsovie (1955) répond à la création :", choix: ["De l'OTAN", "De l'ONU", "Du plan Marshall", "Du COMECON"], bonne: 0, explication: "Il répond à l'OTAN (1949) et à l'entrée de la RFA dans l'Alliance atlantique." },
    { q: "La disparition de l'URSS est actée en :", choix: ["1991", "1989", "1993", "1985"], bonne: 0, explication: "Décembre 1991 : démission de Gorbatchev et dissolution de l'URSS." },
  ],
  conscience: [
    { q: "« Je pense, donc je suis » est une formule de :", choix: ["Descartes", "Kant", "Freud", "Sartre"], bonne: 0, explication: "Le cogito cartésien : le doute lui-même prouve l'existence du sujet pensant." },
    { q: "Pour Freud, le psychisme ne se réduit pas à la conscience car il existe :", choix: ["L'inconscient", "La raison pure", "L'impératif catégorique", "Le cogito"], bonne: 0, explication: "L'hypothèse de l'inconscient remet en cause la transparence du sujet à lui-même." },
    { q: "Selon Hegel, la conscience de soi suppose :", choix: ["La reconnaissance par autrui", "L'isolement", "L'instinct", "La seule mémoire sensible"], bonne: 0, explication: "La dialectique du maître et de l'esclave : je me sais moi-même par le regard d'autrui." },
    { q: "Sartre appelle « mauvaise foi » :", choix: ["Le mensonge à soi-même", "Une erreur de raisonnement", "L'ignorance", "La croyance religieuse"], bonne: 0, explication: "C'est se masquer sa propre liberté en se prenant pour une chose déterminée." },
    { q: "La conscience morale désigne :", choix: ["La capacité à juger le bien et le mal", "La perception sensorielle", "La mémoire", "L'attention"], bonne: 0, explication: "À distinguer de la conscience psychologique, qui est présence à soi et au monde." },
  ],
};

/* ————————————————————————————————————————————————————————————————
   Paquets de flashcards (outil « FlashCards »)
   ———————————————————————————————————————————————————————————————— */
const FLASHCARDS = {
  derivees: [
    { recto: "Dérivée de xⁿ ?", verso: "n·xⁿ⁻¹" },
    { recto: "Dérivée d'un produit (uv)' ?", verso: "u'v + uv'" },
    { recto: "Dérivée d'un quotient (u/v)' ?", verso: "(u'v − uv') / v²" },
    { recto: "Que signifie f'(a) = 0 avec changement de signe ?", verso: "Extremum local de f en a" },
    { recto: "Équation de la tangente en a ?", verso: "y = f'(a)(x − a) + f(a)" },
  ],
  probas: [
    { recto: "Définition de P<sub>B</sub>(A) ?", verso: "P(A∩B) / P(B), avec P(B) ≠ 0" },
    { recto: "Condition d'indépendance de A et B ?", verso: "P(A∩B) = P(A) × P(B)" },
    { recto: "Formule des probabilités totales ?", verso: "P(A) = P(A∩B) + P(A∩B̄)" },
    { recto: "Somme des branches issues d'un nœud d'un arbre ?", verso: "1" },
    { recto: "Incompatibles ⇒ indépendants ?", verso: "Non : P(A∩B) = 0 ≠ P(A)×P(B)" },
  ],
  suites: [
    { recto: "Point fixe de uₙ₊₁ = a·uₙ + b ?", verso: "ℓ = b / (1 − a), pour a ≠ 1" },
    { recto: "Nature de vₙ = uₙ − ℓ ?", verso: "Géométrique de raison a" },
    { recto: "Forme explicite de uₙ ?", verso: "uₙ = (u₀ − ℓ)·aⁿ + ℓ" },
    { recto: "Condition de convergence d'une géométrique ?", verso: "|q| < 1" },
    { recto: "Somme 1 + q + … + qⁿ ?", verso: "(1 − qⁿ⁺¹) / (1 − q)" },
  ],
  vecteurs: [
    { recto: "Produit scalaire en coordonnées ?", verso: "xx' + yy' + zz'" },
    { recto: "Norme de u⃗(x ; y ; z) ?", verso: "√(x² + y² + z²)" },
    { recto: "Équation cartésienne d'un plan ?", verso: "ax + by + cz + d = 0, normale n⃗(a ; b ; c)" },
    { recto: "Condition d'orthogonalité de deux vecteurs ?", verso: "u⃗ · v⃗ = 0" },
    { recto: "Représentation paramétrique d'une droite ?", verso: "M = A + t·u⃗, t ∈ ℝ" },
  ],
  ondes: [
    { recto: "Relation entre λ, v et f ?", verso: "λ = v / f = v × T" },
    { recto: "Interférences constructives : δ = ?", verso: "δ = k·λ (k entier)" },
    { recto: "Interférences destructives : δ = ?", verso: "δ = (k + ½)·λ" },
    { recto: "Écart angulaire de diffraction ?", verso: "θ ≈ λ / a" },
    { recto: "Onde mécanique : propagation dans le vide ?", verso: "Non, un milieu matériel est nécessaire" },
  ],
  genetique: [
    { recto: "Produit de la méiose ?", verso: "4 cellules haploïdes génétiquement différentes" },
    { recto: "Où a lieu le crossing-over ?", verso: "En prophase I (brassage intrachromosomique)" },
    { recto: "Brassage interchromosomique : quand ?", verso: "Anaphase I, séparation aléatoire des homologues" },
    { recto: "Mitose vs méiose ?", verso: "Mitose : 2 cellules identiques ; méiose : 4 cellules haploïdes" },
    { recto: "Pourquoi le code génétique est-il redondant ?", verso: "64 codons pour 20 acides aminés" },
  ],
  guerrefroide: [
    { recto: "1947", verso: "Doctrines Truman (endiguement) et Jdanov" },
    { recto: "1948-1949", verso: "Blocus de Berlin et pont aérien" },
    { recto: "1949", verso: "Création de l'OTAN, RFA et RDA, COMECON" },
    { recto: "1961", verso: "Construction du mur de Berlin" },
    { recto: "1962", verso: "Crise des missiles de Cuba" },
    { recto: "1991", verso: "Dissolution de l'URSS, fin de la guerre froide" },
  ],
  conscience: [
    { recto: "Le cogito, c'est ?", verso: "« Je pense, donc je suis » — Descartes" },
    { recto: "Apport de Freud sur la conscience ?", verso: "L'inconscient : le moi n'est pas maître chez lui" },
    { recto: "Thèse de Hegel sur la conscience de soi ?", verso: "Elle exige la reconnaissance par autrui" },
    { recto: "La mauvaise foi selon Sartre ?", verso: "Se mentir à soi-même pour fuir sa liberté" },
    { recto: "Conscience psychologique vs morale ?", verso: "Présence à soi vs jugement du bien et du mal" },
  ],
};

/* ————————————————————————————————————————————————————————————————
   Catalogue des thèmes, programme par programme.
   Au moins 8 thèmes par matière, calés sur le programme de la classe.
   ———————————————————————————————————————————————————————————————— */
const CATALOGUE = {
  "6e": {
    maths: ["Nombres entiers et décimaux", "Fractions simples", "Proportionnalité", "Figures planes et constructions", "Périmètres et aires", "Symétrie axiale", "Solides et volumes", "Tableaux et graphiques"],
    physique: ["États et changements d'état de la matière", "Mélanges et solutions", "Le mouvement et la vitesse", "Sources et formes d'énergie", "Circuits électriques simples", "Les objets techniques", "Signaux et information", "La Terre dans le système solaire"],
    svt: ["Le vivant de mon environnement", "Classer les êtres vivants", "Le régime alimentaire des animaux", "Le cycle de vie des végétaux", "Les saisons et le climat local", "Le sol et la biodiversité", "Les besoins des plantes vertes", "Respirer dans différents milieux"],
    histoire: ["La longue histoire de l'humanité", "Premiers États, première écriture", "Le monde des cités grecques", "Rome, du mythe à l'histoire", "Naissance du judaïsme et du christianisme", "L'empire chinois des Han", "Habiter une métropole", "Habiter les littoraux"],
    francais: ["Le monstre, aux limites de l'humain", "Récits de création et déluge", "Récits d'aventure", "Le conte et le merveilleux", "Initiation à la poésie", "La phrase simple", "Les classes grammaticales", "Présent, imparfait et passé simple"],
  },
  "5e": {
    maths: ["Nombres relatifs", "Calcul avec les fractions", "Proportionnalité et pourcentages", "Calcul littéral et distributivité", "Triangles et parallélogrammes", "Symétrie centrale", "Aires, prismes et cylindres", "Statistiques : moyenne et effectifs"],
    physique: ["Mélanges homogènes et hétérogènes", "Masse, volume et masse volumique", "Les changements d'état de l'eau", "Circuits en série et en dérivation", "La lumière : sources et propagation", "Trajectoire et vitesse", "Formes et conversions d'énergie", "Les signaux sonores"],
    svt: ["La nutrition des organismes", "Respiration et milieux de vie", "Reproduction sexuée et asexuée", "Paysages et érosion", "Les risques naturels", "Alimentation et digestion", "Les climats de la Terre", "Biodiversité et peuplement des milieux"],
    histoire: ["Chrétientés et islam (VIᵉ-XIIIᵉ)", "Société féodale et seigneuries", "L'essor des villes et du commerce", "L'affirmation de l'État monarchique", "Humanisme, Renaissance et Réformes", "Le monde au temps de Charles Quint", "Richesse et pauvreté dans le monde", "L'eau et l'énergie : des ressources à ménager"],
    francais: ["Le voyage et l'aventure", "Avec autrui : familles, amis, réseaux", "Héros, héroïnes et héroïsmes", "Imaginer des univers nouveaux", "La comédie de Molière", "Les expansions du nom", "Les temps du récit", "L'accord du participe passé"],
  },
  "4e": {
    maths: ["Puissances", "Nombres premiers et fractions irréductibles", "Calcul littéral et équations", "Théorème de Pythagore", "Théorème de Thalès", "Translations et transformations", "Vitesse, débit et proportionnalité", "Premières probabilités"],
    physique: ["Atomes et molécules", "Les transformations chimiques", "Les combustions", "Lumière et couleurs", "Tension et intensité électriques", "La loi d'Ohm", "Poids et masse", "Fréquence et signal sonore"],
    svt: ["La tectonique des plaques", "Séismes et volcanisme", "Reproduction humaine et puberté", "Transmission de la vie", "Les risques géologiques", "Respiration et circulation sanguine", "Le système nerveux et les réflexes", "Les climats du passé"],
    histoire: ["Bourgeoisies, commerce et traite au XVIIIᵉ", "L'Europe des Lumières", "La Révolution française et l'Empire", "L'Europe de la révolution industrielle", "Conquêtes et sociétés coloniales", "L'urbanisation du monde", "Les mobilités humaines transnationales", "Mers et océans : un monde maritimisé"],
    francais: ["Dire l'amour : la poésie lyrique", "Individu et société : romans du XIXᵉ", "La fiction pour interroger le réel", "Informer, s'informer, déformer", "Le théâtre du XVIIᵉ au XIXᵉ", "Les propositions subordonnées", "Discours direct et indirect", "Les figures de style"],
  },
  "3e": {
    maths: ["PGCD et nombres premiers", "Identités remarquables", "Équations et inéquations", "Notion de fonction", "Fonctions linéaires et affines", "Thalès et agrandissement-réduction", "Trigonométrie du triangle rectangle", "Statistiques et probabilités"],
    physique: ["Atomes, ions et organisation de la matière", "Équations de réaction chimique", "Acides, bases et pH", "Énergie, puissance et consommation", "Gravitation et poids", "Mouvements et vitesse", "Signaux et communication", "Circuits électriques et sécurité"],
    svt: ["Gènes, ADN et chromosomes", "Divisions cellulaires", "Reproduction et diversité génétique", "Évolution et sélection naturelle", "Immunité et vaccination", "Microbiote et santé", "Risques et ressources géologiques", "Climat et activités humaines"],
    histoire: ["La Première Guerre mondiale", "Démocraties fragilisées et régimes totalitaires", "La Seconde Guerre mondiale", "La France défaite, occupée et résistante", "Indépendances et décolonisation", "La guerre froide", "La Vᵉ République", "Aires urbaines et espaces productifs français"],
    francais: ["Se raconter, se représenter", "Dénoncer les travers de la société", "Agir dans la cité : individu et pouvoir", "Progrès et rêves scientifiques", "Poésie et engagement", "La subordination complexe", "Les registres littéraires", "Thèse, arguments et exemples"],
  },
  "2de": {
    maths: ["Ensembles de nombres et intervalles", "Calcul littéral et équations", "Fonctions de référence", "Fonctions affines", "Géométrie repérée et vecteurs", "Trigonométrie et cercle", "Statistiques descriptives", "Probabilités et échantillonnage"],
    physique: ["Constitution de la matière", "Mole et quantité de matière", "Solutions et concentrations", "Transformations chimiques", "Mouvements et vitesse", "Forces et principe d'inertie", "Ondes et signaux", "Lentilles et formation des images"],
    svt: ["La Terre dans l'Univers", "Cellule, ADN et information génétique", "Biodiversité et évolution", "Écosystèmes et services rendus", "Agrosystèmes et alimentation", "Le corps humain à l'effort", "Microorganismes et santé", "Érosion et sédimentation"],
    histoire: ["Le monde méditerranéen médiéval", "L'ouverture atlantique (XVᵉ-XVIᵉ)", "Renaissance, Humanisme et Réformes", "L'Amérique et l'Europe en révolution", "La Révolution française", "Sociétés et environnements", "Territoires, populations et développement", "Mobilités, tourisme et loisirs"],
    francais: ["La poésie du XIXᵉ au XXIᵉ", "Le roman et le récit du XVIIIᵉ au XXIᵉ", "Le théâtre du XVIIᵉ au XXIᵉ", "La littérature d'idées et la presse", "La méthode du commentaire", "La dissertation littéraire", "La contraction de texte", "L'oral et la lecture linéaire"],
  },
  "1re": {
    maths: ["Second degré", "Suites numériques", "Dérivation", "Fonction exponentielle", "Trigonométrie et fonctions circulaires", "Produit scalaire", "Probabilités conditionnelles", "Variables aléatoires"],
    physique: ["Réactions acide-base", "Oxydoréduction et piles", "Suivi d'une transformation chimique", "Forces et énergie mécanique", "Ondes mécaniques", "Lumière : modèles et spectres", "Circuits électriques et bilans d'énergie", "Champs de gravitation et électrostatique"],
    svt: ["Transmission et expression du patrimoine génétique", "Mutations et variabilité", "L'histoire humaine lue dans son génome", "Structure et dynamique de la Terre", "Écosystèmes et durabilité", "Le système immunitaire", "Variation génétique et santé", "Climats passés et actuels"],
    histoire: ["L'Europe face aux révolutions", "La France de 1848 à 1870", "La Troisième République", "Industrialisation et société", "La Première Guerre mondiale", "Les totalitarismes de l'entre-deux-guerres", "La métropolisation", "Espaces ruraux et systèmes productifs"],
    francais: ["La poésie : œuvre au programme", "Le roman et le récit : œuvre au programme", "Le théâtre : œuvre au programme", "La littérature d'idées du XVIᵉ au XVIIIᵉ", "La dissertation sur œuvre", "Le commentaire composé", "La contraction de texte et l'essai", "L'explication linéaire à l'oral"],
  },
  "Tle": {
    maths: ["Limites et continuité", "Dérivation et convexité", "Fonction logarithme népérien", "Fonction exponentielle", "Suites et raisonnement par récurrence", "Calcul intégral", "Géométrie dans l'espace", "Probabilités conditionnelles et loi binomiale"],
    physique: ["Cinétique chimique et catalyse", "Équilibres, acides et bases", "Piles et oxydoréduction", "Deuxième loi de Newton", "Mouvements dans un champ uniforme", "Ondes et interférences", "Effet Doppler et spectres", "Bilans d'énergie et transferts thermiques"],
    svt: ["Génétique et brassage à la méiose", "Diversification du vivant", "Évolution et sélection naturelle", "Climat : passé, présent, futur", "Les enveloppes fluides de la Terre", "Le système immunitaire", "Cerveau, plasticité et comportement", "Glycémie, diabète et alimentation"],
    histoire: ["Fragilités des démocraties et totalitarismes", "La Seconde Guerre mondiale", "La guerre froide (1947-1991)", "Décolonisations et nouveaux États", "La construction européenne", "La France sous la Vᵉ République", "Mers et océans au cœur de la mondialisation", "La France et l'UE dans le monde"],
    philo: ["La conscience", "L'inconscient", "La liberté", "Le devoir", "La justice", "La vérité", "L'art", "La technique"],
  },
  "prepa": {
    maths: ["Suites et séries numériques", "Fonctions d'une variable réelle", "Intégration", "Algèbre linéaire et matrices", "Espaces euclidiens", "Séries entières et séries de Fourier", "Équations différentielles", "Probabilités et variables aléatoires"],
    physique: ["Mécanique du point et du solide", "Thermodynamique", "Électrocinétique et filtres", "Électromagnétisme", "Optique ondulatoire", "Ondes et propagation", "Introduction à la mécanique quantique", "Chimie des solutions"],
    info: ["Algorithmique et complexité", "Structures de données", "Programmation en Python", "Récursivité", "Bases de données et SQL", "Graphes et parcours", "Tris et recherche", "Logique et automates"],
    francais: ["Le thème de l'année et ses œuvres", "La dissertation de culture générale", "Le résumé de texte", "L'explication de texte philosophique", "Problématiser un sujet", "Les grands courants d'idées", "L'exposé et l'entretien à l'oral", "Citations et références clés"],
  },
  "bts": {
    maths: ["Statistiques descriptives", "Probabilités appliquées", "Fonctions et dérivées appliquées", "Suites et calcul financier", "Calcul matriciel", "Régression et corrélation", "Calcul intégral appliqué", "Algorithmique et tableur"],
    economie: ["Marchés, prix et concurrence", "Politiques économiques", "Management des organisations", "Relation client et négociation", "Comptabilité et analyse financière", "Droit des contrats", "Droit du travail", "Marketing et communication"],
    info: ["Tableur avancé", "Bases de données", "Développement web", "Réseaux et sécurité", "Gestion de projet", "Outils collaboratifs", "Analyse de données", "Cybersécurité au quotidien"],
    francais: ["Communication professionnelle écrite", "La note de synthèse", "Le rapport de stage", "La prise de parole en public", "Argumenter et négocier", "Culture générale : premier thème", "Culture générale : second thème", "Mails et comptes rendus"],
  },
  "licence": {
    maths: ["Analyse réelle et suites", "Algèbre linéaire", "Topologie et espaces métriques", "Calcul différentiel", "Intégrale de Lebesgue", "Probabilités et statistiques", "Équations différentielles", "Groupes, anneaux et corps"],
    physique: ["Mécanique classique", "Thermodynamique et physique statistique", "Électromagnétisme", "Optique", "Mécanique quantique", "Physique des ondes", "Relativité restreinte", "Travaux pratiques et incertitudes"],
    info: ["Programmation orientée objet", "Algorithmique avancée", "Systèmes d'exploitation", "Réseaux", "Bases de données relationnelles", "Théorie des langages", "Génie logiciel", "Introduction à l'intelligence artificielle"],
    economie: ["Microéconomie", "Macroéconomie", "Statistiques et économétrie", "Économie monétaire", "Comptabilité nationale", "Économie internationale", "Histoire de la pensée économique", "Économie du développement"],
  },
  "master": {
    maths: ["Analyse fonctionnelle", "Probabilités avancées et processus", "Optimisation", "Analyse numérique", "Modélisation stochastique", "Statistique inférentielle", "Théorie des graphes", "Séminaire de recherche"],
    info: ["Apprentissage automatique", "Apprentissage profond", "Big data et calcul distribué", "Sécurité des systèmes", "Architecture logicielle", "Traitement automatique du langage", "Vision par ordinateur", "Éthique et IA"],
    economie: ["Économétrie appliquée", "Finance quantitative", "Économie industrielle", "Évaluation des politiques publiques", "Théorie des jeux", "Économie comportementale", "Données et modélisation", "Mémoire de recherche"],
    methodo: ["Méthodologie de la recherche", "Revue de littérature", "Rédaction scientifique", "Citations et bibliographie", "Présenter en conférence", "Éthique de la recherche", "Rédiger son mémoire", "Préparer sa soutenance"],
  },
  "reprise": {
    maths: ["Les quatre opérations", "Fractions et pourcentages", "La proportionnalité au quotidien", "Unités et conversions", "Lire un graphique", "Calcul mental", "Géométrie pratique", "Statistiques de base"],
    francais: ["Les accords de base", "La conjugaison essentielle", "La construction de la phrase", "Enrichir son vocabulaire", "Rédiger un courrier", "Comprendre un texte", "Prendre des notes", "S'exprimer à l'oral"],
    histoire: ["Les repères chronologiques", "Les institutions françaises", "L'Union européenne", "Citoyenneté et vie civique", "Les grandes dates du XXᵉ siècle", "La géographie de la France", "Lire une carte", "Actualité et médias"],
    info: ["Prendre en main un ordinateur", "Naviguer sur internet", "Messagerie et pièces jointes", "Traitement de texte", "Tableur : les bases", "Mots de passe et sécurité", "Faire ses démarches en ligne", "Smartphone et applications"],
  },
};
