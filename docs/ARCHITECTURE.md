# Arhitectură

## 1. Principii

- **Static-first**: HTML/CSS/JS pre-generat. Nu există backend, bază de date,
  API propriu, autentificare sau serviciu plătit necesar funcționării.
- **Migrare reproductibilă**: conținutul legacy este transformat de un script,
  nu reconstruit manual.
- **Onestitate istorică**: nicio dată, locație sau atribuire nu este inventată.
- **Zero dependențe runtime externe** în afara tile-urilor de hartă.

## 2. Fluxul de date

```
backup/legacy-index.html
        │  tools/extract.js
        ▼
data/photos.json · locations.json · site-content.json · legacy-inventory.json
        │  tools/thumbs.js  (ImageMagick, non-distructiv)
        ▼
assets/img/thumbs/*.webp · assets/img/previews/*.webp · data/media.json
        │  tools/build.js
        ▼
index.html · arhiva.html · harta.html · despre.html · 404.html
foto/<slug>.html × N · sitemap.xml · robots.txt · data/site-stats.json
        │  tools/validate.js · tools/reconcile.js · tools/test.js · tools/browser-check.js
        ▼
docs/RECONCILIATION.md · docs/BROWSER-REPORT.md · docs/screenshots/
```

## 3. Structura paginilor

| Pagină | Strategie de randare |
|---|---|
| `index.html` | pre-generată (hero, perioade, statistici, despre, contact) |
| `arhiva.html` | shell static + randare client-side din `data/photos.json` (căutare, filtre, paginare, lightbox) |
| `harta.html` | shell static + Leaflet client-side din `data/locations.json` |
| `despre.html` | pre-generată (text original + statistici reale) |
| `foto/<slug>.html` | pre-generată integral (metadate, Open Graph, asociate, navigare) |
| `404.html` | pre-generată, cu **căi absolute** (funcționează la orice adâncime de URL) |

Randarea client-side este folosită doar acolo unde este necesară interactivitate
(căutare/filtrare/hartă). Fiecare fotografie are pagină proprie pre-generată,
deci este indexabilă și partajabilă fără JavaScript.

**Comportamente partajate** (`assets/js/site.js`): meniul mobil (`initNav`) și
micro-animațiile de revelare (`initReveal`) se **auto-inițializează la import** și sunt
idempotente. Astfel funcționează identic pe toate paginile, indiferent dacă modulul este
încărcat direct (`index.html`, `despre.html`) sau prin `archive.js` / `photo.js` / `map.js`.

## 4. Modelul de date

### 4.1 Fotografie (`data/photos.json`)

| Câmp | Semnificație |
|---|---|
| `id` | identificator stabil (`p001`…`p257`), în ordinea arhivei legacy |
| `legacyIndex` | poziția în arhiva originală (pentru reconciliere) |
| `slug` | slug unic, folosit în URL |
| `title` | titlul original, verbatim |
| `alt` | descrierea originală (`alt`), verbatim |
| `image` | imaginea colorizată folosită de site |
| `originalImage` | originalul alb-negru, dacă există pe disc |
| `lightboxImage`, `lightboxBroken` | referința legacy și starea ei |
| `year` | an **exact**, doar când sursa îl afirmă; altfel `null` |
| `yearStart` / `yearEnd` | interval sau deceniu afirmat de sursă |
| `yearApprox` | `true` pentru „aprox.” |
| `yearLabel` | eticheta de afișare („1908”, „aprox. 1900”, „anii ’80”, „1965–1972”) |
| `yearText` | textul original integral („Anul: 1908”) |
| `precision` | `year` / `range` / `decade` / `approx` / `era` / `text` / `unknown` |
| `eraId`, `eraLabel` | perioade denumite („interbelic”) |
| `periodId`, `periodLabel` | perioada din filtrele legacy |
| `legacyFilter` | clasa de filtru originală (`filter-1990`) |
| `locationId`, `locationName`, `locationNote` | locația documentată (opțională) |
| `latitude`, `longitude` | **coordonate proprii fotografiei** (opționale) — pin propriu pe hartă |
| `coordinateCertainty` | `exact` sau `approximate` (obligatoriu dacă există coordonate) |
| `coordinateSource` | sursa coordonatelor (obligatorie dacă există coordonate) |
| `origin` | `legacy` (din arhiva originală) sau `manual` (adăugată ulterior) |
| `description`, `source`, `credits`, `tags` | rezervate pentru completări manuale |

### 4.2 Locație (`data/locations.json`)

| Câmp | Semnificație |
|---|---|
| `id`, `name` | identificator stabil și nume |
| `latitude`, `longitude` | **opționale**; completate doar dacă sunt verificate |
| `coordinateSource` | sursa coordonatelor (obligatorie dacă există coordonate) |
| `certainty` | `locality` (nivel localitate, nu punct exact) |
| `description` | text explicativ |
| `photoIds` | fotografii documentate în acea localitate |

### 4.3 Perioade (`data/periods.json`)
Cele 4 perioade ale filtrelor legacy + perioadele denumite (`eras`). Descrierile sunt
neutre; nu conțin afirmații istorice noi.

### 4.4 Configurație editorială (`data/site-config.json`)
Fișier de configurare (nu generat) cu imaginea de header a paginii principale:
`hero.image`, `hero.photoSlug`, `hero.title`, `hero.yearLabel`, `hero.alt`.
Nu este suprascris de build, deci modificările persistă. Vezi
[`docs/MIGRATION.md`](MIGRATION.md), secțiunea 6.

### 4.5 Coșul de reciclare (`data/deleted-photos.json`)
Evidența fotografiilor șterse, scrisă de unealta de ștergere. Fiecare intrare păstrează
obiectul complet al fotografiei, lista fișierelor mutate (`from` → `to`) și varianta din
`media.json`, exact ca restaurarea să fie identică (verificat bit-cu-bit în
`npm run test-trash`). Fișierul nu este generat de build, nu este publicat
(exclus în `_config.yml`) și nu blochează `npm run extract`: fotografiile din coș
**nu sunt readuse** în catalog la re-extracție. Vezi [`docs/STERGERE.md`](STERGERE.md).

## 5. Căutare și filtre (fără backend)

`assets/js/search-core.js` conține funcții **pure**, folosite atât de browser cât și de
teste (sursă unică de adevăr):

- `normalizeText` — elimină diacriticele (inclusiv variantele greșite cu cedilla),
  normalizează majusculele și spațiile;
- `parseYear` — clasifică textul de datare fără a inventa precizie;
- `matchesFilters` — combină filtrele cu `AND` (text, perioadă, eră, localitate,
  an exact, interval);
- `sortPhotos`, `buildQuery`, `parseQuery` — sortare și starea filtrelor în URL.

Filtrele sunt reflectate în query string (`?q=…&period=…&location=…&year=…&page=…`),
deci rezultatele sunt partajabile prin URL și se păstrează la navigare/refresh.

## 6. Identitate vizuală (temă „dark premium")

Design editorial, cu fotografiile istorice în centrul experienței. Toate valorile sunt
variabile CSS în `:root` (`assets/css/site.css`), ușor de ajustat.

| Element | Valoare |
|---|---|
| Fundal | antracit cald `#0c0b0e`, cu 4 niveluri de suprafață (`--surface` … `--surface-4`) |
| Accent | auriu `#c9a227`, ton deschis `#e3c05c`, ton luminos `#f0dc9e` (hairline-uri, străluciri) |
| Text | alb cald `#f6f3ed` / `#d5d1c8` / `#9e9a91` (contrast AA pe toate suprafețele) |
| Tipografie | serif editorial pentru titluri (stivă de sistem: Iowan Old Style / Palatino / Georgia), sans-serif pentru text |
| Hairline-uri | 1 px la 5–8% alb, cu estompare în gradient (aspect tipărit) |
| Radii / umbre | `--radius: 12px`, umbre în două niveluri (`--shadow`, `--shadow-soft`) |

Detalii care dau senzația de „premium":

- **grăunte fin de film** peste toată pagina (SVG `feTurbulence`, `mix-blend-mode: soft-light`,
  5% opacitate) — fără fișier suplimentar, fără cost de rețea;
- **hairline-uri cu estompare** sub header, sub titlurile de secțiune și în footer;
- **navigare cu subliniere aurie** care crește la hover (în loc de pastilă de fundal);
- **carduri cu mat** (gradient fin + highlight interior) și linie aurie care crește pe
  marginea imaginii la hover;
- **pagina fotografiei tratată ca „placă de muzeu"**: mat întunecat, hairline, umbră fină,
  legendă în small caps, metadate cu cifre tabulare;
- **micro-animații de revelare** la derulare (`IntersectionObserver`, dezactivate la
  `prefers-reduced-motion`), cu plasă de siguranță: dacă JS nu rulează, totul e vizibil;
- indicator discret de derulare în hero; selecție text și bară de derulare personalizate;
- `scroll-padding-top` pentru ca ancorele să nu intre sub header-ul lipicios.

Toate animațiile sunt pe `transform`/`opacity` (compozitor), iar efectele decorative
(grăunte, vignetă) folosesc `pointer-events: none`.

## 7. Hartă

- **Leaflet 1.9.4 vendorizat local** (`assets/vendor/leaflet/`) — fără dependență de CDN.
- Tile-uri de la **OpenStreetMap** (`tile.openstreetmap.org`), fără cheie API.
- **Trei tipuri de puncte**, în această ordine de prioritate:
  1. fotografia are `latitude`/`longitude` proprii → **pin propriu** (auriu plin = `exact`,
     cerc auriu gol = `approximate`);
  2. nu are coordonate proprii, dar are o localitate cu coordonate → **pin gri**, la
     nivel de localitate (nu pretinde punctul exact);
  3. nu are niciuna → **fără pin**, listată explicit sub hartă.
- Pin-urile foarte apropiate se grupează pe o grilă de pixeli dependentă de zoom;
  **de la zoom 15 în sus nu se mai grupează nimic** (fiecare fotografie are pin propriu),
  iar harta pornește centrată pe pin-urile fotografiilor la un zoom care le arată separat.
- **Filtre pe hartă**: perioadă istorică, an exact și interval de ani — aceleași semantici
  ca în arhivă (`matchesFilters` din `search-core.js`). Filtrarea se face client-side peste
  catalog, iar starea filtrelor este păstrată în URL (`harta.html?period=1960-1990`),
  deci rezultatele sunt partajabile. Numărul de fotografii care corespund filtrelor este
  afișat sub formular, iar filtrele active apar ca etichete eliminabile.
- Panoul lateral afișează miniaturile într-o **grilă de carduri 4:3** (fără deformare),
  cu titlul și anul suprapuse discret; click pe miniatură → pagina fotografiei.
- Click pe pin → popup + panou lateral; click pe un grup → mărește harta și separă pinurile.
- Linkuri directe: `harta.html?foto=<slug>` (centrat pe o fotografie) și
  `harta.html?loc=<id>` (centrat pe o localitate).
- Fiecare punct afișează **sursa coordonatelor**; textul de introducere și legenda se
  generează din numerele reale ale catalogului.
- Coordonatele **nu sunt niciodată geocodate automat** de site; provin exclusiv din
  catalog, completate de editor (vezi [`docs/COORDONATE.md`](COORDONATE.md)).
- **Comportament la indisponibilitate**: dacă Leaflet nu se încarcă, se afișează un sumar
  numeric (coordonate proprii / la nivel de localitate / fără coordonate); dacă tile-urile
  nu se încarcă, harta rămâne funcțională (doar fundalul lipsește).

## 8. Dependențe externe și comportamentul lor

| Dependență | Rol | Comportament dacă nu e disponibilă |
|---|---|---|
| `tile.openstreetmap.org` | fundalul hărții | pin-urile și panoul rămân funcționale; doar fundalul lipsește |
| `formcarry.com` | procesarea formularului de contact | formularul nu se trimite (comportament preexistent, păstrat) |
| Fonturi | **niciunul extern** | se folosește o stivă de fonturi de sistem (serif editorial pentru titluri) |
| Iconițe | **niciun CDN** | SVG inline |

Nu există scripturi de analiză, tracking, cookie-uri sau fonturi terțe.

### Unelte locale (nu fac parte din site-ul publicat)

`tools/serve.js` este un server de dezvoltare folosit **doar local**:

- servește fișierele statice cu `Cache-Control: no-store` pentru HTML/JSON/JS/CSS
  (evită răspunsurile `304` cu versiuni vechi);
- expune endpoint-urile `POST /api/coords`, `POST /api/photos`, `GET /api/photos/list`,
  `POST /api/photos/delete`, `POST /api/photos/restore`, `POST /api/photos/purge`,
  `POST /api/hero` și `GET /api/hero/options`, care permit uneltelor din `tools/` să scrie
  **direct** în `data/*.json` — fără export/import manual.

Cele trei unelte de administrare a arhivei:

| Unealtă | Rol |
|---|---|
| `tools/add-photo.html` | adaugă o fotografie (upload + metadate + poziție pe hartă) |
| `tools/coords-editor.html` | pune/ajustează coordonatele fiecărei fotografii |
| `tools/delete-photo.html` | șterge o fotografie — **reversibil**, prin coșul de reciclare |

Ștergerea este **singura operație care modifică structura arhivei**, de aceea este
implementată ca mutare de fișiere în `backup/deleted/`, cu metadate complete păstrate în
`data/deleted-photos.json`. Nu există ștergere definitivă decât prin acțiune explicită
(„Golește coșul"), iar `npm run extract` ignoră fotografiile din coș. Detalii:
[`docs/STERGERE.md`](STERGERE.md).

Site-ul publicat pe GitHub Pages **nu depinde** de acest server: este 100% static, iar
endpoint-urile de scriere nu există în producție.

**Granularitatea public/publicare este garantată de trei straturi:**

1. `_config.yml` (Jekyll, folosit implicit de GitHub Pages la „Deploy from a branch”)
   exclude `tools/`, `docs/`, `backup/`, `node_modules/` și fișierele de dezvoltare;
   **nu adăugați `.nojekyll`** — ar anula aceste excluderi;
2. `robots.txt` blochează directoarele interne pentru crawlere;
3. `tools/local-guard.js` blochează interfața uneltelor dacă sunt accesate de pe un
   domeniu public (permite `localhost`, `*.local` și intervalele private de rețea).

Paginile publice nu conțin **nicio** referință către unelte sau comenzi de dezvoltare —
verificat automat în `tools/test.js` („paginile publice nu conțin referințe către unelte interne”).

## 9. Performanță și accesibilitate

- imagini `loading="lazy"` + `decoding="async"` în afara zonei inițiale;
- `width`/`height` explicite pentru toate imaginile (fără layout shift);
- miniaturi 600 px (grile) și preview-uri 1400 px (pagina fotografiei); originalul
  rămâne accesibil printr-un link, la rezoluție maximă;
- fără scroll orizontal la 375 / 768 / 1440 px (verificat automat);
- navigare completă cu tastatura (meniu, filtre, grilă, lightbox cu ← → Esc);
- contrast ridicat pe fundal antracit; `:focus-visible` vizibil; `skip-link`;
- imagini cu `alt` derivat din informațiile originale (niciodată inventat);
- `prefers-reduced-motion` respectat.

## 10. SEO

- `<title>`, `<meta name="description">` și `canonical` pe fiecare pagină;
- Open Graph + Twitter Card, cu imaginea fotografiei pe paginile de fotografii;
- `sitemap.xml` (inclusiv extensia `image:image`) și `robots.txt`;
- titluri descriptive pentru fiecare fotografie (`Titlu (an) · Huedin.net`).

## 11. Limite cunoscute

- Randarea client-side a arhivei necesită JavaScript (paginile individuale nu).
- Harta afișează pin-uri proprii doar pentru fotografiile cu coordonate completate în
  catalog; restul apar la nivel de localitate sau în lista explicativă de sub hartă.
  Coordonatele nu sunt generate automat (vezi [`COORDONATE.md`](COORDONATE.md)).
- Formularul de contact depinde de serviciul extern preexistent (formcarry.com).
- Uneltele din `tools/` sunt locale și **nu se publică** (vezi secțiunea 8). Dacă publicați
  prin altă metodă decât „Deploy from a branch" (deci fără Jekyll/`_config.yml`), verificați
  manual că `/tools/` nu ajunge online; garda din pagină și `robots.txt` rămân active.
- **Ștergerea unei fotografii din arhiva originală** reduce numărul de intrări față de
  snapshot-ul legacy, deci `npm run reconcile` va semnala diferența. Este un comportament
  intenționat (ștergerea e o decizie editorială, luată explicit de proprietar), nu o
  pierdere de date: fotografia rămâne în coșul `backup/deleted/` și poate fi restaurată.

