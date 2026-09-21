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
