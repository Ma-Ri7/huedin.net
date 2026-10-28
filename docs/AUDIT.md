# FAZA A — Audit și inventar

Auditul inițial al proiectului `huedin.net`, efectuat **înainte** de orice modificare.
Toate cifrele sunt verificabile prin `data/legacy-inventory.json` și
`data/site-content.json` (generate de `tools/extract.js`).

## 1. Identificarea proiectului

| Element | Constatare |
|---|---|
| Workspace | `/Users/a/Desktop/huedin.net` |
| Domeniu | `huedin.net` (fișier `CNAME`) |
| Găzduire | GitHub Pages (pagină statică, fără configurare de server) |
| Tehnologie | HTML + CSS + JavaScript vanilla; template „Personal v4.8.1” (BootstrapMade) |
| Framework / generator | Niciunul — fără Node.js, fără build, fără bază de date |
| Repository Git | **Inexistent** (`fatal: not a git repository`) |
| Librării vendorizate | Bootstrap, Isotope, Swiper, GLightbox, Waypoints, PureCounter, Bootstrap Icons, Boxicons, Remixicon |
| Dependențe externe runtime | Google Fonts, `iconify-icon` (CDN), Google Maps iframe, formcarry.com (formular de contact) |
| Sitemap / robots / 404 | **Lipsesc** |
| Pagini | **Doar `index.html`** (3.729 linii, 198 KB), structură single-page cu ancore |

## 2. Inventar de conținut

### 2.1 Fotografii
- **257 de fotografii** (`div.portfolio-item`), fiecare cu: imagine (`img src`), text
  alternativ (`alt`), titlu (`h4`), an/perioadă (`p`) și legătură lightbox.
- **107 titluri distincte**; **43 de titluri se repetă** — serii de fotografii
  (ex. „Biserica Reformată” ×12, „Huedin - 1985” ×12, „Piața centrală” ×11).
  Conform regulilor de siguranță, **nu au fost eliminate** ca duplicate.
- Fișiere pe disc: **542** în `assets/img/portfolio` (264 `.jpg` alb-negru,
  273 `.webp` colorizate, 3 `.png`, 1 `.jpeg`), **175 MB**.
- **285 de fișiere nu erau referențiate** de versiunea legacy (264 originale `.jpg`,
  18 variante `.webp`, 2 `.png`) — păstrate, nu șterse.

### 2.2 Filtrele existente (perioade istorice)
| Filtru legacy | Etichetă | Fotografii |
|---|---|---|
| `filter-1900` | 1800-1900 | 12 |
| `filter-1930` | 1900-1930 | 63 |
| `filter-1960` | 1930-1960 | 55 |
| `filter-1990` | 1960-1990 | 127 |

### 2.3 Formulările de datare (67 distincte)
Exacte („Anul: 1908”), aproximative („Anul: aprox.1900”, „aprox.1936”), decenii
(„anii ’20/’40/’50/’60/’80”), intervale („1965-1972”, „1982-1983”,
„Anul: între 1965-1972”), perioade denumite („Perioada: interbelică”, cu variante
inclusiv typo „Perioadal: interbelică”), text liber („Perioada: înaintea Primului
Război Mondial”) și necunoscute („Anul: -”, 4 cazuri).

### 2.4 Secțiunile site-ului original
- `#header` — titlu „Huedin.net”, motto, 3 conturi sociale (Twitter, Facebook, Instagram)
- `#about` — „Huedinul istoric”: 5 paragrafe + 4 puncte de disclaimer
- `#services` — „Utile”: 4 statistici publice + 4 legături utile (Primăria Huedin,
  Liceul Octavian Goga, Liceul Vlădeasa, Spitalul Orășenesc)
- `#portfolio` — „Poze”: cele 257 de fotografii
- `#contact` — adresă „Piața Republicii”, `admin@huedin.net`, telefon `07XXXXXXXX`,
  formular formcarry.com, hartă Google embed

### 2.5 Ancorele legacy folosite
`#header`, `#about`, `#portfolio`, `#services`, `#contact` — **păstrate identic** pe
noua pagină principală, pentru ca legăturile existente să funcționeze în continuare.

## 3. Riscuri identificate și modul de tratare

| # | Risc | Detaliu | Tratare |
|---|---|---|---|
| R1 | Referință imagine ruptă | `277532475_..._nn.webp` (typo, fotografia p143 „Strada Poștei”) | Păstrată în catalog ca informație; noul site folosește fișierul corect existent |
| R2 | Fără Git | imposibil rollback prin VCS | Snapshot `backup/legacy-index.html` (SHA-256 identic cu originalul) + folderul `Original/` intact |
| R3 | Fără coordonate geografice | nicio informație lat/lon în date | Hartă cu **1 singură locație verificată** (Huedin, coordonate preluate din embed-ul Google Maps al site-ului original); celelalte 8 localități listate fără pin |
| R4 | Metadate de an neuniforme | 67 de formate | Model de date care separă an exact / interval / deceniu / perioadă denumită / text liber; `yearText` păstrat verbatim |
| R5 | URL-uri indexate | doar `/` + 5 ancore | Ancore păstrate identic pe pagina nouă; sitemap + canonical adăugate |
| R6 | Fișiere nefolosite | 285 de fișiere | Nu au fost șterse; originale alb-negru legate în paginile fotografiilor |
| R7 | Dependențe externe | Google Fonts, iconify, Google Maps, formcarry | Leaflet vendorizat local; iconify eliminat (SVG inline); fără serviciu de fonturi; harta Google înlocuită cu link către harta Leaflet |

## 4. Metoda de revenire la versiunea inițială

1. `backup/legacy-index.html` — copie bit-cu-bit a `index.html` original
   (SHA-256 `8c36bbe3eb247b28601b18708ed067a821b95d7f`).
2. `Original/` — site-ul legacy complet (HTML + CSS + JS + imagini + CNAME), neatins.
3. Revenire completă: copierea `Original/index.html` + `Original/assets` peste
   rădăcină. Nimic din conținutul original nu a fost șters sau mutat distructiv.

## 5. Riscuri de migrare rămase

- **Coordonate geografice**: fiecare fotografie poate primi coordonate proprii
  (`latitude`, `longitude`, `coordinateSource`, `coordinateCertainty`) → pin propriu pe
  hartă. Vezi [`docs/COORDONATE.md`](COORDONATE.md). Localitățile fără coordonate
  (Călata, Morlaca, Bratca, Stana, Bicălatu, Izvorul Crișului, Mărgău, Răchițele) pot
  primi coordonate în `data/locations.json` pentru pin la nivel de localitate.
- **74 de fotografii** nu au nicio localitate identificabilă în descriere.
- **5 fotografii** nu au datare interpretabilă (textul original este păstrat).
- **O referință legacy ruptă** (vezi R1) — păstrată ca informație, fără efect asupra site-ului.
