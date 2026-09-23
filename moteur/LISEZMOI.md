# Moteur de lecture embarqué

Ces fichiers font tourner l'OCR **dans la page**, sans CDN et sans serveur :
la politique de sécurité de la page publiée bloque les téléchargements vers
un domaine tiers, donc le moteur est servi depuis la même origine que l'app.

| Fichier | Origine | Licence |
| --- | --- | --- |
| `tesseract.min.js`, `worker.min.js` | npm `tesseract.js@5.1.1` | Apache-2.0 (`LICENSE-tesseract.js.txt`) |
| `tesseract-core-lstm.wasm.js`, `tesseract-core-simd-lstm.wasm.js` | npm `tesseract.js-core@5.1.1` | Apache-2.0 (`LICENSE-tesseract-core.txt`) |
| `fra.traineddata.gz` | `tesseract-ocr/tessdata_fast` (modèle français rapide), recompressé | Apache-2.0 |

Seules les variantes **LSTM** du cœur sont embarquées : `ocr.js` demande
`createWorker("fra", 1, …)`, c'est-à-dire le mode LSTM, le seul utilisé ici.
Pour mettre à jour : `npm pack tesseract.js@<version> tesseract.js-core@<version>`,
puis recopier les mêmes fichiers.
