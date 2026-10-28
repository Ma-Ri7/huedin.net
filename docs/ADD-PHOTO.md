# Tutorial: cum adaugi o fotografie nouă

Sunt două metode. **Metoda A (pagina de upload) este recomandată** — un singur formular,
fără comenzi în terminal.

| Metodă | Când o folosești |
|---|---|
| **A. Pagina de upload** (`tools/add-photo.html`) | întotdeauna — încarci poza, completezi datele, apeși un buton |
| **B. Linia de comandă** (`tools/add-photo.js`) | dacă ai deja fișierele pe disc și vrei automatizare |

---

## Metoda A — Pagina de upload (recomandat)

### A1. Pornește serverul

```bash
npm run serve
```

### A2. Deschide pagina

**<http://localhost:8000/tools/add-photo.html>**

Sus, în dreapta, trebuie să scrie **„server OK · salvare directă"**.
Dacă scrie „server fără API", înseamnă că folosești un alt server — pornește `npm run serve`
sau folosește metoda B.

### A3. Completează formularul

**1. Imaginea**
- trage imaginea în zona marcată (sau apasă „alege fișierul")
- opțional, adaugă și **originalul alb-negru** — va fi legat în pagina fotografiei

**2. Datele fotografii**
- **Titlu** (obligatoriu)
- **An / perioadă** — scrie exact cum e documentat: `Anul: 1942`, `aprox. 1900`,
  `anii '40`, `1965-1972`, `Perioada: interbelică`. Lasă gol dacă nu știi.
- **Perioada din filtre** — folosită de filtrul „Perioadă" din arhivă și de pe hartă
- **Localitate** — pentru pinul de localitate
- **Descriere scurtă** (textul alternativ) — ajută la căutare și accesibilitate
- **Descriere / context istoric**, **Sursa imaginii**, **Credite**, **Etichete** — opționale

**3. Poziția pe hartă** (opțional)
- bifează „Adaug coordonate proprii"
- **click pe hartă** în locul potrivit (poți trage pinul pentru ajustare fină)
- alege precizia (`aproximativă` / `exactă`) și lasă sursa

### A4. Apasă „Adaugă fotografia"

Se întâmplă automat, într-un singur pas:
1. imaginea este copiată în `assets/img/portfolio/` (cu nume sigur, unic);
2. fotografia este adăugată în `data/photos.json`;
3. se generează **miniatura** și **preview-ul**;
4. **site-ul este regenerat** (pagina fotografiei, sitemap, statistici).

Rezultatul apare în dreapta, cu linkuri directe:
- **Vezi pagina fotografiei** → `foto/<slug>.html`
- **Vezi pe hartă** → harta centrată pe poza ta
- **Arhivă**

Gata. Nu mai e nevoie de nicio comandă.

### A5. Verificare periodică (opțional, dar recomandat)

```bash
npm run validate && npm run test
```

---

## Metoda B — Linia de comandă

Dacă preferi terminalul sau ai un server static simplu:

```bash
# 1. copiază imaginea în arhivă
cp ~/Downloads/poza-mea.webp assets/img/portfolio/

# 2. adaugă în catalog
node tools/add-photo.js \
  --image "poza-mea.webp" \
  --title "Strada Horea" \
  --year "Anul: 1942" \
  --period 1930-1960 \
  --location huedin

# 3. generează miniaturile, paginile și verifică
npm run thumbs && npm run build && npm run validate && npm run test
```

Argumente acceptate:

| Argument | Obligatoriu | Ce înseamnă |
|---|---|---|
| `--image` | **da** | numele fișierului (sau calea) către imaginea colorizată |
| `--title` | **da** | titlul original |
| `--year` | recomandat | textul anului/perioadei, exact cum e documentat |
| `--alt` | recomandat | descrierea; implicit = titlul |
| `--period` | recomandat | `1800-1900` · `1900-1930` · `1930-1960` · `1960-1990` |
| `--location` | opțional | `huedin`, `calata`, `morlaca`, `bratca`, `stana`, `bicalatu`, `izvorul-crisului`, `margau`, `rachitele` |
| `--lat` / `--lng` | opțional | coordonatele proprii ale fotografiei |
| `--certainty` | opțional | `exact` sau `approximate` (implicit) |
| `--coordinate-source` | opțional | sursa coordonatelor |
| `--original` | opțional | calea originalului alb-negru (altfel se detectează automat) |
| `--description` / `--source` / `--credits` / `--tags` | opțional | metadate suplimentare |
| `--dry-run` | opțional | afișează ce s-ar întâmpla, fără să scrie nimic |

---

## Cum scrii anul (important, în ambele metode)

Scrie **exact formularea documentată**. Sistemul o interpretează, dar păstrează textul original.

| Ce știi despre fotografie | Ce scrii | Cum apare în site |
|---|---|---|
| an exact | `Anul: 1942` sau `1942` | „1942” |
| aproximativ | `aprox. 1900` | „aprox. 1900” (nu devine 1900 exact) |
| deceniu | `anii '40` | „anii '40” |
| interval | `1965-1972` | „1965–1972” |
| perioadă denumită | `Perioada: interbelică` | „perioada interbelică” |
| nu știi | lasă gol | „Necunoscut” |

> **Nu inventa un an** doar ca să completezi câmpul. „Necunoscut” este corect; o dată greșită nu.

---

## Situații speciale

### Mai multe fotografii deodată

Cu metoda A: completează formularul, apasă „Adaugă fotografia", apoi formularul se golește
automat — ești gata pentru următoarea. Cu metoda B: rulează pașii pentru fiecare, apoi o
singură dată `npm run thumbs && npm run build && npm run validate && npm run test`.

### Localitate nouă (pentru hartă)

Adaugă localitatea în `data/locations.json` (cu `latitude`, `longitude` și **obligatoriu**
`coordinateSource`), apoi `npm run build`.

### Am greșit ceva — cum revin?

- **Cu metoda A:** șterge intrarea din `data/photos.json` (după `id`), apoi șterge fișierele
  `assets/img/portfolio/<nume>`, `foto/<slug>.html`, `assets/img/thumbs/<id>.webp`,
  `assets/img/previews/<id>.webp` și rulează `npm run build`.
- **Nimic nu se pierde la `npm run extract`:** fotografiile adăugate sunt marcate cu
  `"origin": "manual"` și sunt păstrate automat.
- **Vreau versiunea originală a site-ului:** vezi `docs/MIGRATION.md`, secțiunea 9.

### De ce nu apare în filtrul „Perioadă”?

Nu ai ales perioada în formular (sau nu ai dat `--period`). Editează fotografia sau
completează `periodId` în `data/photos.json`.

### De ce nu apare pe hartă?

Fotografia are nevoie de coordonate proprii (bifează „Adaug coordonate proprii" în formular)
sau de o localitate cu coordonate verificate. Coordonatele pot fi adăugate ulterior și în
**Editorul de coordonate** (`tools/coords-editor.html`).

---

## Ce NU trebuie făcut niciodată

| Nu faceți | De ce |
|---|---|
| Să editați `Original/` | este versiunea veche, folosită pentru revenire |
| Să mutați sau să redimensionați imaginile existente | URL-urile și referințele s-ar rupe |
| Să inventați ani sau coordonate | regulă de integritate istorică a proiectului |
| Să publicați fără `npm run verify` | verificările pot dezvălui referințe rupte |

---

## Referință rapidă

```bash
npm run serve                    # serverul din proiect (cu salvare directă)
# http://localhost:8000/tools/add-photo.html      -> adaugă o fotografie (1 formular)
# http://localhost:8000/tools/coords-editor.html  -> pune coordonate pe hartă
npm run validate && npm run test # verifică
npm run verify                   # tot + testare în browser
```

