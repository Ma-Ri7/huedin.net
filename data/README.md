# Catalogul static de date

Toate fișierele de aici sunt **generate** sau **editate manual** și stau la baza site-ului.
Nu există bază de date: site-ul citește aceste fișiere JSON direct în browser.

| Fișier | Generat de | Editare manuală |
|---|---|---|
| `photos.json` | `tools/extract.js` (din `backup/legacy-index.html`) | posibilă, cu grijă; **preferabil** `npm run add-photo` și `tools/set-coords.js` |
| `locations.json` | `tools/extract.js` | **da** — pentru coordonate verificate |
| `periods.json` | static | **da** |
| `site-content.json` | `tools/extract.js` | nu (provine din arhiva originală) |
| `media.json` | `tools/thumbs.js` | nu |
| `site-stats.json` | `tools/build.js` | nu |
| `legacy-inventory.json` | `tools/extract.js` | nu (folosit la reconciliere) |
| `deleted-photos.json` | `tools/delete-photo.html` (prin server) | nu (coșul de reciclare; exclus de la publicare) |

## Reguli

1. **Nu inventați** ani, locații, coordonate, titluri sau descrieri.
2. Anii exacți se completează doar dacă sunt documentați; altfel lăsați
   `year: null` și păstrați textul original în `yearText`.
3. Coordonatele se completează doar împreună cu `coordinateSource`.
4. Nu ștergeți intrări pentru a „curăța” duplicatele — seriile de fotografii sunt
   conținut autentic.
5. După orice modificare rulați: `npm run validate && npm run reconcile && npm run test`.
6. Pentru adăugarea unei fotografii folosiți `npm run add-photo` (vezi
   [`docs/ADD-PHOTO.md`](../docs/ADD-PHOTO.md)). Intrările marcate cu
   `"origin": "manual"` sunt păstrate automat de `npm run extract`.
7. Pentru coordonate (pin pe hartă) folosiți `tools/set-coords.js` sau editorul vizual
   `tools/coords-editor.html` (vezi [`docs/COORDONATE.md`](../docs/COORDONATE.md)).
   Coordonatele **nu se completează niciodată fără `coordinateSource`** și sunt păstrate
   automat la re-extracție.
8. Pentru ștergerea unei fotografii folosiți `tools/delete-photo.html`
   (vezi [`docs/STERGERE.md`](../docs/STERGERE.md)). Ștergerea este **reversibilă**:
   fișierele se mută în `backup/deleted/`, iar evidența rămâne în `deleted-photos.json`.
   `npm run extract` **nu** readuce în catalog fotografiile aflate în coș.

## Scheme

- Fotografie: vezi `docs/ARCHITECTURE.md`, secțiunea 4.1
- Locație: vezi `docs/ARCHITECTURE.md`, secțiunea 4.2
- Perioade: vezi `docs/ARCHITECTURE.md`, secțiunea 4.3
