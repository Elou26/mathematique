/* Données de démonstration — remplaçables par un appel API plus tard. */

const COURS = [
  {
    id: "derivees",
    titre: "Dérivées et taux de variation",
    chapitre: "Analyse · Terminale",
    premierJour: "2026-08-19",
    derniereRevision: "2026-09-19",
    progression: 72,
  },
  {
    id: "probas",
    titre: "Probabilités conditionnelles",
    chapitre: "Probabilités · Terminale",
    premierJour: "2026-09-02",
    derniereRevision: "2026-09-17",
    progression: 45,
  },
  {
    id: "suites",
    titre: "Suites arithmético-géométriques",
    chapitre: "Suites · Terminale",
    premierJour: "2026-09-08",
    derniereRevision: "2026-09-20",
    progression: 28,
  },
  {
    id: "vecteurs",
    titre: "Géométrie dans l'espace",
    chapitre: "Géométrie · Terminale",
    premierJour: "2026-07-30",
    derniereRevision: "2026-09-12",
    progression: 91,
  },
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
  { id: "survie", nom: "Mode survie — Probabilités", detail: "Jusqu'à 3 erreurs", xp: 220 },
];

/* File de révision espacée : intervalles 1 / 3 / 7 / 15 / 30 jours. */
const REVISION_ESPACEE = [
  { id: "derivees", titre: "Dérivées et taux de variation", palier: "J+7", echeance: "2026-09-21", etat: "aujourdhui" },
  { id: "probas", titre: "Probabilités conditionnelles", palier: "J+3", echeance: "2026-09-21", etat: "aujourdhui" },
  { id: "suites", titre: "Suites arithmético-géométriques", palier: "J+1", echeance: "2026-09-22", etat: "demain" },
  { id: "vecteurs", titre: "Géométrie dans l'espace", palier: "J+15", echeance: "2026-09-27", etat: "a-venir" },
  { id: "trigo", titre: "Trigonométrie — cercle unité", palier: "J+30", echeance: "2026-10-12", etat: "a-venir" },
];

/* Fiches de résumé servies par l'outil IA (contenu de démonstration).
   `points`, `formules`, `exemples` et `pieges` sont filtrés selon les options
   choisies dans le formulaire « Créer résumé ». */
const RESUMES = {
  derivees: {
    accroche: "La dérivée mesure la vitesse de variation d'une fonction en un point : c'est le coefficient directeur de la tangente.",
    points: [
      "Le taux de variation entre a et a+h tend vers f'(a) quand h tend vers 0.",
      "Une fonction dérivable en a est continue en a — la réciproque est fausse (|x| en 0).",
      "Le signe de f' donne les variations de f : f' > 0 sur un intervalle ⇒ f croissante.",
      "f'(a) = 0 avec changement de signe ⇒ extremum local en a.",
    ],
    formules: [
      "(uv)' = u'v + uv'",
      "(u/v)' = (u'v − uv') / v²",
      "(u∘v)' = v' × (u'∘v)",
      "(xⁿ)' = n·xⁿ⁻¹  ·  (eˣ)' = eˣ  ·  (ln x)' = 1/x",
    ],
    exemples: [
      "f(x) = x²·eˣ ⇒ f'(x) = (2x + x²)eˣ = x(x+2)eˣ, donc f décroît sur [−2 ; 0].",
      "Tangente en 1 à f(x) = ln x : y = f'(1)(x−1) + f(1) = x − 1.",
    ],
    pieges: [
      "Ne pas confondre f'(a) (un nombre) et f' (une fonction).",
      "Dériver un quotient sans vérifier que le dénominateur ne s'annule pas.",
    ],
  },
  probas: {
    accroche: "Une probabilité conditionnelle réévalue une probabilité une fois qu'une information est connue.",
    points: [
      "P<sub>B</sub>(A) se lit « probabilité de A sachant B » et n'a de sens que si P(B) ≠ 0.",
      "Un arbre pondéré : la somme des branches partant d'un même nœud vaut 1.",
      "A et B sont indépendants si P(A∩B) = P(A)×P(B), donc si P<sub>B</sub>(A) = P(A).",
    ],
    formules: [
      "P<sub>B</sub>(A) = P(A∩B) / P(B)",
      "P(A∩B) = P(B) × P<sub>B</sub>(A)",
      "Total : P(A) = P(B)×P<sub>B</sub>(A) + P(B̄)×P<sub>B̄</sub>(A)",
    ],
    exemples: [
      "Test à 99 % de fiabilité sur une maladie touchant 0,1 % : P(malade | test +) ≈ 9 %.",
      "Deux tirages sans remise dans une urne 3 rouges / 2 noires : P(2 rouges) = 3/5 × 2/4 = 3/10.",
    ],
    pieges: [
      "P<sub>B</sub>(A) et P<sub>A</sub>(B) ne sont pas égales — c'est l'erreur la plus fréquente.",
      "Incompatible (A∩B = ∅) n'est pas indépendant.",
    ],
  },
  suites: {
    accroche: "Une suite arithmético-géométrique s'étudie en la ramenant à une suite géométrique auxiliaire.",
    points: [
      "Forme uₙ₊₁ = a·uₙ + b avec a ≠ 1.",
      "On cherche le point fixe ℓ tel que ℓ = a·ℓ + b, soit ℓ = b/(1−a).",
      "vₙ = uₙ − ℓ est géométrique de raison a, d'où uₙ = (u₀ − ℓ)·aⁿ + ℓ.",
      "Si |a| < 1, la suite converge vers ℓ.",
    ],
    formules: [
      "ℓ = b / (1 − a)",
      "uₙ = (u₀ − ℓ)·aⁿ + ℓ",
      "Somme géométrique : 1 + q + … + qⁿ = (1 − qⁿ⁺¹)/(1 − q), q ≠ 1",
    ],
    exemples: [
      "uₙ₊₁ = 0,5uₙ + 3, u₀ = 1 : ℓ = 6, uₙ = −5×0,5ⁿ + 6 → converge vers 6.",
    ],
    pieges: [
      "Oublier de justifier a ≠ 1 avant de calculer le point fixe.",
      "Confondre la raison a de vₙ avec celle de uₙ (uₙ n'est pas géométrique).",
    ],
  },
  vecteurs: {
    accroche: "Dans l'espace, tout se ramène à un repère et à trois coordonnées : positions, directions et orthogonalité.",
    points: [
      "Trois points non alignés définissent un plan ; un plan se décrit par un point et deux vecteurs directeurs.",
      "Représentation paramétrique d'une droite : M = A + t·u⃗.",
      "Deux vecteurs sont orthogonaux si leur produit scalaire est nul.",
    ],
    formules: [
      "u⃗·v⃗ = xx' + yy' + zz'",
      "‖u⃗‖ = √(x² + y² + z²)",
      "Équation cartésienne d'un plan : ax + by + cz + d = 0, de normale n⃗(a ; b ; c)",
    ],
    exemples: [
      "Distance de A(1;2;3) au plan x + y + z − 6 = 0 : |1+2+3−6| / √3 = 0, donc A appartient au plan.",
    ],
    pieges: [
      "Un vecteur normal n'est pas un vecteur directeur du plan.",
      "Deux droites sans point commun peuvent être non coplanaires (ni parallèles ni sécantes).",
    ],
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
  formules: ["Les formules repérées dans la source sont regroupées ici, prêtes à être révisées."],
  exemples: ["Un exemple du document est repris et corrigé intégralement."],
  pieges: ["Les erreurs les plus fréquentes sur ce type d'exercice sont signalées."],
};
