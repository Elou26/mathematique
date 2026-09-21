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
