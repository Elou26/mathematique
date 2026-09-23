# Moteur de lecture embarqué

Ces fichiers font tourner l'OCR **dans la page**, sans CDN et sans serveur :
la politique de sécurité de la page publiée bloque les téléchargements vers
un domaine tiers, donc le moteur est servi depuis la même origine que l'app.

| Fichier | Origine | Licence |
| --- | --- | --- |
| `tesseract.min.js`, `worker.min.js` | npm `tesseract.js@5.1.1` | Apache-2.0 (`LICENSE-tesseract.js.txt`) |
| `tesseract-core-lstm.wasm.js`, `tesseract-core-simd-lstm.wasm.js` | npm `tesseract.js-core@5.1.1` | Apache-2.0 (`LICENSE-tesseract-core.txt`) |
| `fra.traineddata.gz` (renommé `modele-fra.txt`) | `tesseract-ocr/tessdata_fast` (modèle français rapide), recompressé | Apache-2.0 |

Seules les variantes **LSTM** du cœur sont embarquées : `ocr.js` demande
`createWorker("fra", 1, …)`, c'est-à-dire le mode LSTM, le seul utilisé ici.
Pour mettre à jour : `npm pack tesseract.js@<version> tesseract.js-core@<version>`,
puis recopier les mêmes fichiers.

## Une modification assumée dans `worker.min.js`

Le worker de Tesseract réclame son modèle sous le nom `fra.traineddata.gz`.
L'hébergement des pages publiées ne sert pas les fichiers `.gz`, donc une
seule ligne a été adaptée dans `worker.min.js` :

```
_="".concat(y,"/").concat(i,".traineddata").concat(w?".gz":"")   → avant
_="".concat(y,"/modele-").concat(i,".txt")                        → après
```

Et comme un `.txt` doit être du texte réel, le modèle gzippé est **encodé en
base64** ; une deuxième ligne du worker le décode au vol :

```
,t.next=35,O.arrayBuffer()                                          → avant
,t.next=35,O.text().then(function(s){return Uint8Array.from(         → après
  atob(s.trim()),function(c){return c.charCodeAt(0)}).buffer})
```

Une fois décodé, le gzip est reconnu aux premiers octets, pas à l'extension.
À chaque mise à jour du paquet, refaire ces deux remplacements et réencoder
le modèle :

```bash
curl -L -o fra.traineddata \
  https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/fra.traineddata
gzip -9 -c fra.traineddata | base64 -w0 > modele-fra.txt
```
