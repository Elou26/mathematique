# Mathématique — app de révision (version mobile)

Site statique mobile-first dédié à la révision des mathématiques, construit en HTML/CSS/JS
vanille (aucune dépendance, aucun build).

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
| `app.js` | Navigation par onglets, barres de progression, bascule Défis/Communauté |
| `data.js` | Données de démonstration (cours, communautés, file de révision espacée) |

## Écran d'accueil

- **Header** bleu pastel : logo + nom du site (16 px), cloche à droite → onglet *Révision espacée*.
- **Mes révisions** (14 px, gras) : cartes blanches avec titre + jours de révision (12 px gras),
  date de dernière révision (12 px), barre de progression bleu marine, bouton
  « Réviser maintenant » (fond bleu marine, texte blanc 14 px, angles arrondis).
- **Outils IA** (14 px, gras) : 3 tuiles cliquables — Créer résumé, Créer quiz, FlashCards.
- **Communauté et Défis** (16 px, gras) : sélecteur arrondi scindé en deux ; *Communauté*
  affiche les communautés les plus rejointes, *Défis* affiche le bouton « Affronter un ami ».
- **Barre du bas** bleu marine : accueil, cours, communauté, profil ; icône bleu gris pastel,
  blanche + trait blanc sous l'onglet actif.
