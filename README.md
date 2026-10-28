# Huedin.net — Huedinul Istoric

Arhivă fotografică istorică pentru orașul **Huedin** și zonele adiacente.
Site **static** (HTML + CSS + JavaScript), fără bază de date, fără backend și fără
servicii cu abonament obligatoriu. Publicare pe GitHub Pages (fișierul `CNAME`).

- **257 de fotografii** păstrate integral din versiunea originală
- căutare și filtrare client-side (text, an, interval, perioadă, localitate)
- pagină individuală pentru fiecare fotografie (URL stabil, partajabil)
- **hartă interactivă** (Leaflet + OpenStreetMap): pin pentru fiecare fotografie cu
  coordonate proprii, filtrare pe perioadă istorică / an / interval de ani, grupare
  automată doar la zoom mic, legendă și sursa afișată pentru fiecare punct
- **tema dark premium**: antracit cald + accente aurii, tipografie editorială (serif pentru
  titluri), hairline-uri, grăunte fin de film și micro-animații discrete — vezi
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), secțiunea 6

## Structura proiectului

```
index.html            pagina principală
arhiva.html           arhiva completă (căutare + filtre, încărcare client-side)
harta.html            harta interactivă a locurilor documentate
despre.html           despre proiect (text original + structura arhivei)
404.html              pagină de eroare (căi absolute, funcționează la orice adâncime)
foto/<slug>.html      257 pagini individuale generate
sitemap.xml           harta site-ului
robots.txt            reguli pentru crawlere
data/                 catalog static (JSON)
assets/css/site.css   tema dark premium
assets/js/            search-core.js · data.js · site.js · archive.js · photo.js · map.js
assets/img/           imaginile (copie fidelă a originalelor) + thumbs/ + previews/
assets/vendor/leaflet biblioteca hărții, vendorizată local
tools/                scripturi de build, validare, reconciliere și testare
docs/                 documentație + rapoarte generate
Original/             site-ul legacy, păstrat neatins (referință de revenire)
backup/               snapshot-ul `index.html` original + CNAME + README
```

## Comenzi

Necesită Node.js ≥ 18. ImageMagick (`magick`) este folosit **doar la build**,
pentru miniaturi. Chrome este folosit **doar pentru testarea în browser**.

```bash
npm run extract     # backup/legacy-index.html -> data/*.json (migrare)
npm run add-photo   # adaugă o fotografie (CLI); varianta vizuală: npm run serve -> tools/add-photo.html
npm run hero        # arată imaginea de header; schimbare: npm run serve -> tools/set-hero.html
npm run coords      # sumar coordonate (vezi docs/COORDONATE.md)
npm run coords:export   # șablon CSV pentru coordonate
npm run thumbs      # generează miniaturi și preview-uri (non-distructiv)
npm run build       # generează toate paginile HTML, sitemap, robots
npm run validate    # validează catalogul și site-ul generat
npm run reconcile   # compară inventarul legacy cu cel nou -> docs/RECONCILIATION.md
npm run test        # teste automate (funcții pure, integritate, linkuri)
npm run browser     # testare în Chrome headless la 375/768/1440 px
npm run pipeline    # extract + thumbs + build + validate + reconcile + test
npm run verify      # pipeline + testare în browser
npm run serve       # server local (http://localhost:8000) cu salvare coordonate în 1 click
npm run serve:static # server static simplu, fără salvare directă
```

## Documentație

- [`docs/AUDIT.md`](docs/AUDIT.md) — auditul și inventarul inițial (FAZA A)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — arhitectură, model de date, decizii
- [`docs/ADD-PHOTO.md`](docs/ADD-PHOTO.md) — **tutorial: cum adaugi o fotografie nouă**
- [`docs/COORDONATE.md`](docs/COORDONATE.md) — **tutorial: cum pui fiecare fotografie pe hartă (lat/lng)**
- [`docs/MIGRATION.md`](docs/MIGRATION.md) — procesul de migrare, cum se adaugă fotografii
- [`docs/RECONCILIATION.md`](docs/RECONCILIATION.md) — raport generat: legacy vs. arhivă nouă
- [`docs/BROWSER-REPORT.md`](docs/BROWSER-REPORT.md) — raport generat de testarea în browser
- [`docs/screenshots/`](docs/screenshots/) — capturi la 375 / 768 / 1440 px

## Reguli de integritate a datelor

- Nicio informație istorică nu este inventată: anii, locațiile și titlurile provin
  verbatim din arhiva originală.
- „aprox. 1900”, „anii ’40”, „perioada interbelică”, „1965–1972” rămân aproximative;
  nu sunt transformate în ani exacți.
- Coordonatele geografice nu sunt geocodate automat. Harta afișează doar localitățile
  confirmate; restul sunt listate explicit, fără pin.
- Imaginile originale nu sunt modificate; miniaturile sunt fișiere noi, generate non-distructiv.
- Nicio fotografie, descriere sau legătură originală nu a fost ștearsă.

## Ce se publică și ce rămâne local

Site-ul publicat este **doar arhiva statică**. Uneltele de administrare rămân pe calculatorul
autorului, în trei straturi de protecție:

| Strat | Mecanism |
|---|---|
| 1. Excludere la publicare | `_config.yml` (GitHub Pages / Jekyll) exclude `tools/`, `docs/`, `backup/`, `node_modules/` și fișierele de dezvoltare |
| 2. Reguli pentru crawlere | `robots.txt` blochează `/tools/`, `/docs/`, `/backup/`, `/node_modules/` |
| 3. Gardă în pagină | `tools/local-guard.js` blochează interfața uneltelor dacă sunt accesate de pe un domeniu public (permite doar localhost / rețea locală) |

> ⚠️ **Nu adăugați fișierul `.nojekyll`** în rădăcină: acesta ar dezactiva procesarea Jekyll
> și, implicit, lista de excluderi din `_config.yml` — totul ar fi publicat.

Chiar dacă uneltele ar ajunge cumva online, ele **nu pot modifica nimic**: scrierea se face
exclusiv prin endpoint-urile serverului local de dezvoltare (`npm run serve`), care nu există
pe găzduirea statică. Butonul „Salvează în catalog" se dezactivează automat când API-ul lipsește.

Pagini publicate: `index.html`, `arhiva.html`, `harta.html`, `despre.html`, `404.html`,
`foto/*.html`, `data/*.json` (catalogul), `assets/**`, `sitemap.xml`, `robots.txt`, `CNAME`.

## Publicare

Publicarea **nu** este automată. Pași:

1. `npm run verify` — toate verificările trebuie să treacă.
2. Verificați `docs/RECONCILIATION.md` (fără pierderi de conținut).
3. Copiați conținutul proiectului în repository-ul publicat de GitHub Pages
   (păstrând `CNAME` = `huedin.net` **și** `_config.yml`).
4. Publicați din rădăcină, cu „Deploy from a branch” — `_config.yml` se ocupă de excluderi.
5. Verificați după publicare că `https://huedin.net/tools/coords-editor.html` **nu** există.
