# Migrare și întreținere

## 1. Regenerare completă (de la zero)

```bash
npm install          # doar puppeteer-core, pentru testarea în browser
npm run pipeline     # extract + thumbs + build + validate + reconcile + test
npm run browser      # testare în Chrome headless (375 / 768 / 1440 px)
```

`npm run verify` execută totul într-o singură comandă.

## 2. Ce face fiecare script

| Script | Intrare | Ieșire |
|---|---|---|
| `tools/extract.js` | `backup/legacy-index.html` | `data/photos.json`, `data/locations.json`, `data/site-content.json`, `data/legacy-inventory.json` |
| `tools/add-photo.js` | argumente CLI | adaugă o fotografie nouă în `data/photos.json` |
| `tools/add-photo.html` | formular + upload imagine | salvează imaginea, catalogul, miniaturile și regenerează site-ul (un singur click) |
| `tools/lib/photos.js` | — | logica de creare a unei fotografii (folosită de CLI și de server) |
| `tools/lib/thumbs.js` | fotografii | miniaturi + preview-uri (folosit de `thumbs.js` și de server) |
| `tools/lib/coords.js` | — | logica de coordonate (folosită de `set-coords.js` și de server) |
| `tools/set-coords.js` | argumente CLI / CSV / JSON | completează coordonatele fotografiilor |
| `tools/coords-editor.html` | catalogul + click pe hartă | salvează coordonatele în catalog (prin API) sau exportă `coordinates.json` |
| `tools/serve.js` | — | server local de dezvoltare + `POST /api/coords` (scriere în `data/photos.json`), fără cache |
| `tools/thumbs.js` | `data/photos.json` + imaginile | `assets/img/thumbs/*.webp`, `assets/img/previews/*.webp`, `data/media.json` |
| `tools/build.js` | tot `data/*.json` | toate paginile HTML, `sitemap.xml`, `robots.txt`, `data/site-stats.json` |
| `tools/validate.js` | `data/*.json` + paginile | raport în consolă (cod de ieșire 1 la erori) |
| `tools/reconcile.js` | inventarul legacy + catalogul nou | `docs/RECONCILIATION.md` |
| `tools/test.js` | catalog + pagini | raport de teste (40 de teste) |
| `tools/browser-check.js` | site-ul generat | `docs/BROWSER-REPORT.md` + `docs/screenshots/` |

## 3. Adăugarea unei fotografii noi

**Ghid complet: [`docs/ADD-PHOTO.md`](ADD-PHOTO.md).**

Varianta recomandată — pagină de upload, fără comenzi:

```bash
npm run serve
#   -> http://localhost:8000/tools/add-photo.html
#   încarci imaginea, completezi datele, apeși „Adaugă fotografia”
#   (salvează imaginea, actualizează catalogul, generează miniaturile și regenerează site-ul)
```

Varianta din terminal:

```bash
cp ~/Downloads/poza-mea.webp assets/img/portfolio/
node tools/add-photo.js --image "poza-mea.webp" --title "Strada Horea" \
  --year "Anul: 1942" --period 1930-1960 --location huedin
npm run thumbs && npm run build && npm run validate && npm run test
```

Fotografiile adăugate astfel sunt marcate cu `"origin": "manual"` și sunt
**păstrate automat** de `tools/extract.js` la fiecare rulare a pipeline-ului.

> Regulă: **nu inventați** ani, locații sau titluri. Dacă informația lipsește,
> lăsați textul original ori marcați datarea ca necunoscută.

## 4. Adăugarea de coordonate (hartă)

**Ghid complet: [`docs/COORDONATE.md`](COORDONATE.md).**

Fiecare fotografie poate avea coordonate proprii (`latitude`, `longitude`,
`coordinateCertainty`, `coordinateSource`) → pin propriu pe hartă.

```bash
# Varianta vizuală, cu salvare într-un singur click (recomandat)
npm run serve
#   -> http://localhost:8000/tools/coords-editor.html
#   click pe fotografie, click pe hartă, apoi „Salvează în catalog”

# Varianta CSV
npm run coords:export                      # scrie data/coordinates.csv
#   completați latitude/longitude/certainty/source
node tools/set-coords.js --import data/coordinates.csv

# O singură fotografie
node tools/set-coords.js --set --id p012 --lat 46.8625 --lng 23.018 \
  --certainty exact --source "Harta topografică militară 1970"

npm run build && npm run validate && npm run test
```

`tools/serve.js` este serverul de dezvoltare din proiect: servește fișierele fără cache
și expune `POST /api/coords`, folosit de editor pentru scrierea directă în
`data/photos.json`.

Sursa coordonatelor este **obligatorie** — validarea dă eroare dacă lipsește.
`coordinateCertainty` acceptă `exact` sau `approximate`.

## 5. Adăugarea de coordonate pentru o localitate (pin de localitate)

Pentru fotografiile fără coordonate proprii, se folosește coordonata localității:

```json
{
  "id": "calata",
  "name": "Călata",
  "latitude": 46.8123,
  "longitude": 23.0456,
  "coordinateSource": "Harta topografică militară, ediția 1970",
  "certainty": "locality",
  "description": "Localitatea Călata. Coordonatele indică localitatea, nu punctul exact.",
  "photoIds": []
}
```

Rulați `npm run build`. Pentru o localitate nouă, adăugați-o în `PLACES` din
`tools/extract.js` (astfel încât atribuirea din descrieri să o recunoască) sau completați
manual `locationId` în `data/photos.json`.

## 6. Schimbarea imaginii de header (pagina principală)

Imaginea din hero-ul paginii principale este **configurabilă** în `data/site-config.json`.
Acesta este un fișier de configurare, deci **nu este suprascris de build** (spre deosebire de
`index.html`, care este generat).

```json
{
  "hero": {
    "image": "assets/img/previews/HUEDIN-1907.webp",
    "photoSlug": null,
    "title": "",
    "yearLabel": "",
    "alt": ""
  }
}
```

Varianta vizuală (recomandat):

```bash
npm run serve
#   -> http://localhost:8000/tools/set-hero.html
#   alegi imaginea din grilă (sau scrii calea) și apeși „Setează ca imagine de header”
```

Varianta din terminal:

```bash
npm run hero                                    # arată imaginea curentă
node tools/set-hero.js --list                   # ce imagini sunt disponibile
node tools/set-hero.js --image assets/img/previews/HUEDIN-1907.webp --year 1907
node tools/set-hero.js --photo p028             # folosește o fotografie din arhivă
node tools/set-hero.js --reset                  # revine la imaginea implicită
npm run build
```

Dacă imaginea aleasă nu este deja în `assets/img/previews/`, se generează automat un preview
(max 1800px) pentru încărcare rapidă. `title` și `yearLabel` apar în legenda din colțul
imaginii; dacă lipsesc, legenda rămâne generică (fără informație inventată).

## 7. Optimizarea imaginilor

`tools/thumbs.js` folosește ImageMagick și scrie **fișiere noi**:

- `assets/img/thumbs/<id>.webp` — max 600 px (grile);
- `assets/img/previews/<id>.webp` — max 1400 px (pagina fotografiei).

Imaginile originale din `assets/img/portfolio/` **nu sunt modificate niciodată**.
Scriptul este idempotent; folosiți `node tools/thumbs.js --force` pentru regenerare.

## 8. Verificări înainte de publicare

1. `npm run verify` — pipeline complet + testare în browser (0 erori).
2. `docs/RECONCILIATION.md` — toate verificările trebuie să fie `OK`.
3. `docs/BROWSER-REPORT.md` — fără erori de consolă și fără overflow orizontal.
4. `data/site-stats.json` — confirmă numărul de fotografii (257) și pagini (257).

## 9. Revenire la versiunea originală

```bash
# Varianta 1: doar pagina principală
cp backup/legacy-index.html index.html

# Varianta 2: site-ul legacy complet (HTML + CSS + JS + imagini + CNAME)
cp Original/index.html .
cp -R Original/assets .
cp Original/CNAME .
```

`Original/` este o copie fidelă, nemodificată, a site-ului inițial.

## 10. Publicare (neautomată)

Publicarea nu este executată de niciun script. Pașii sunt descriși în
[`README.md`](../README.md), secțiunea „Publicare”. Păstrați `CNAME` = `huedin.net`
și nu modificați DNS-ul sau configurarea GitHub Pages fără aprobare.

## 11. Rezolvarea problemelor frecvente

| Simptom | Cauză probabilă | Soluție |
|---|---|---|
| Arhiva nu afișează fotografii | fișierul e deschis direct (`file://`) | `npm run serve` și accesați `http://localhost:8080` |
| Harta e goală, fără pin | locația nu are coordonate | completați coordonatele în `data/locations.json` |
| „Nu pot încărca data/photos.json” | JSON lipsă sau build incomplet | `npm run extract && npm run build` |
| Validarea raportează „miniatură lipsă” | nu s-a rulat pasul de miniaturi | `npm run thumbs` |
| Testul de browser e sărit | Chrome nu e instalat la calea așteptată | instalați Chrome sau ajustați `CHROME` din `tools/browser-check.js` |
