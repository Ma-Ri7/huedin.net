# Tutorial: cum pui fiecare fotografie pe hartă (latitudine + longitudine)

Fiecare fotografie poate avea **coordonate proprii**. Dacă le completezi, fotografia
primește un **pin propriu pe hartă**, la poziția ei, iar pagina fotografiei afișează
coordonatele și linkul „Vezi pe hartă”.

Sunt trei metode. Pentru sute de fotografii, **metoda A (editorul vizual) este de departe
cea mai rapidă**.

| Metodă | Când o folosești |
|---|---|
| **A. Editor vizual** (`tools/coords-editor.html`) | ai pozele și știi locurile pe hartă — click și gata |
| **B. Fișier CSV/JSON** | ai deja coordonate din altă sursă (hărți vechi, GPS, arhivă) |
| **C. Linia de comandă** | o singură fotografie, punctual |

---

## ⚠️ Două lucruri esențiale

**1. Editorul scrie în `data/photos.json`, iar harta citește din el.** Cu serverul de
dezvoltare (`npm run serve`) totul se face dintr-un click: **„Salvează în catalog"**.

**2. Coordonatele nu se inventează.** Fiecare punct are o **sursă** și o **precizie**
declarată (`exact` / `approximate`), vizibile public.

### Fluxul recomandat (un singur click)

```
npm run serve   →   http://localhost:8000/tools/coords-editor.html
                    click pe fotografie  →  click pe hartă  →  „Salvează în catalog"
                    →  deschide harta.html (pin-urile sunt acolo)
```

Editorul afișează permanent unde se află coordonatele:

```
În catalog (data/photos.json): 12 · noi, doar în acest browser: 0
```

Dacă „doar în acest browser" nu e `0`, ai coordonate pe care nu le-ai salvat încă —
apasă „Salvează în catalog". Editorul păstrează progresul în browser (localStorage),
deci nu pierzi nimic dacă închizi pagina.

### Dacă folosești alt server (ex. `python3 -m http.server`)

Serverul acela nu poate scrie fișiere, deci editorul îți arată fluxul manual
(Exportă JSON → import → build) și un îndemn să treci pe `npm run serve`.
Ambele variante sunt explicate mai jos.

---

## Cum arată datele

Pe fiecare fotografie din `data/photos.json`:

```json
{
  "id": "p001",
  "title": "Biserica Reformată",
  "latitude": 46.86327,
  "longitude": 23.01700,
  "coordinateCertainty": "approximate",
  "coordinateSource": "Poziționare manuală pe harta OpenStreetMap"
}
```

| Câmp | Obligatoriu | Semnificație |
|---|---|---|
| `latitude` | da (împreună cu `longitude`) | latitudinea, în grade zecimale (ex. `46.86327`) |
| `longitude` | da (împreună cu `latitude`) | longitudinea, în grade zecimale (ex. `23.01700`) |
| `coordinateCertainty` | da | `exact` sau `approximate` |
| `coordinateSource` | **da** | de unde provin coordonatele |

> Regula proiectului: **nicio coordonată fără sursă**. Validarea refuză coordonatele
> fără `coordinateSource`, ca să se știe mereu de unde vine informația.

Cele două precizii se afișează diferit pe hartă:

- **exact** → pin auriu plin
- **approximate** → pin auriu gol (cerc)
- fără coordonate proprii, dar cu localitate → pin gri (doar localitatea)
- fără nimic → fără pin, listat sub hartă

---

## Metoda A — Editorul vizual (recomandat)

### A1. Pornește serverul local

```bash
npm run serve
```

### A2. Deschide editorul

În browser: **<http://localhost:8080/tools/coords-editor.html>**

### A3. Lucrează

1. În stânga ai lista tuturor fotografiilor. Apasă filtrul **„Fără coordonate"** ca să
   vezi doar ce mai ai de făcut.
2. **Click pe o fotografie** din listă (se evidențiază).
3. **Click pe hartă** în locul potrivit → coordonatele se salvează imediat, apare pinul
   auriu și un mesaj de confirmare.
4. Pinul selectat poate fi **tras cu mouse-ul** pentru ajustare fină.
5. Butonul **„următoarea fără coordonate"** te duce rapid la următoarea.
6. Sus poți seta:
   - **„Sursă implicită"** — textul care se salvează ca sursă pentru fiecare punct
     (implicit: „Poziționare manuală pe harta OpenStreetMap"). Schimbă-l dacă folosești
     o altă sursă.
   - **precizia** implicită: `aproximativă` sau `exactă`.

Progresul se salvează automat în browser (`localStorage`), deci poți închide pagina și
reveni mai târziu. Poți naviga harta (zoom, deplasare) fără să plasezi puncte — doar
click-ul simplu plasează punctul.

### A4. Salvează (un singur click)

Apasă **„Salvează în catalog"** (sus, butonul auriu). Coordonatele sunt scrise direct în
`data/photos.json`, iar editorul confirmă:

```
✓ 12 coordonate salvate în data/photos.json
În catalog (data/photos.json): 12 · noi, doar în acest browser: 0
```

Deschide apoi **[harta.html](http://localhost:8000/harta.html)** — pin-urile sunt acolo.
Nu e nevoie de export, import sau de nicio comandă.

> Butonul este activ doar dacă serverul suportă scrierea (adică rulezi `npm run serve`).
> Dacă e dezactivat, editorul îți arată fluxul manual de la metoda A′.

### A5. Verifică (opțional, recomandat periodic)

```bash
npm run build && npm run validate && npm run test
```

## Metoda A′ — Salvare manuală (dacă folosești alt server)

Dacă serverul tău nu poate scrie fișiere (ex. `python3 -m http.server`):

1. Apasă **„Exportă JSON"** → se descarcă `coordinates.json`.
2. Rulează:

```bash
node tools/set-coords.js --import ~/Downloads/coordinates.json
npm run build
```

3. Reîncarcă `harta.html` (cu `Cmd + Shift + R` dacă folosești un server cu cache).

Editorul are și un buton **„copiază comanda"** care pune comanda de import în clipboard.

> **Sfaturi de precizie:** mărește harta (zoom 17–19) înainte de a plasa punctul.
> Dacă nu știi locul exact, pune punctul în centrul localității și lasă precizia
> `aproximativă` — este onest și rămâne util.

---

## Metoda B — Fișier CSV sau JSON

### B1. Generează șablonul

```bash
npm run coords:export          # scrie data/coordinates.csv
```

Șablonul are coloanele: `id, titlu, an, latitude, longitude, certainty, source`.

### B2. Completează coordonatele

Deschide `data/coordinates.csv` în Excel / Numbers / LibreOffice și completează
`latitude`, `longitude`, `certainty` și `source`. Liniile lăsate goale sunt ignorate.

Exemplu:

```csv
id,titlu,an,latitude,longitude,certainty,source
p001,Biserica Reformată,1908,46.86327,23.01700,approximate,Poziționare manuală pe harta OpenStreetMap
p012,Nuntă,1895,46.86250,23.01800,exact,Harta topografică militară 1970
p035,Piața centrală,Necunoscut,,,,
```

> **Atenție:** folosește punctul ca separator zecimal (`46.86327`). Scriptul acceptă și
> virgula (`46,86327`), dar nu amesteca separatoarele de coloană.

### B3. Aplică

```bash
node tools/set-coords.js --import data/coordinates.csv
npm run build
npm run validate && npm run test
```

### Format JSON (alternativ)

```json
[
  { "id": "p001", "latitude": 46.86327, "longitude": 23.017, "certainty": "approximate", "source": "..." },
  { "slug": "biserica-reformată", "latitude": 46.8633, "longitude": 23.0171, "certainty": "exact", "source": "..." }
]
```

Se acceptă fie `id` (`p001`), fie `slug`.

---

## Metoda C — O singură fotografie, din linia de comandă

```bash
node tools/set-coords.js --set --id p012 --lat 46.8625 --lng 23.0180 \
  --certainty exact --source "Harta topografică militară, ediția 1970"

npm run build
```

Ștergerea coordonatelor unei fotografii:

```bash
node tools/set-coords.js --clear --id p012
```

---

## Comenzi utile

```bash
npm run coords                 # sumar: câte fotografii au coordonate, cu ce precizie
node tools/set-coords.js --list-missing    # lista fotografiilor fără coordonate
npm run coords:export          # șablon CSV
npm run coords:import -- data/coordinates.csv
```

Exemplu de sumar:

```
COORDONATE — Huedinul Istoric
------------------------------------------------------------
Total fotografii:                 257
Cu coordonate proprii:            169
Fără coordonate proprii:          88
  din care cu localitate (pin de localitate): 88
  din care fără nicio locație:    0
Precizie: approximate=140, exact=29
------------------------------------------------------------
```

---

## Ce se întâmplă după ce completezi coordonatele

1. **Pagina hărții** (`harta.html`):
   - fiecare fotografie cu coordonate proprii are **pin propriu** (auriu plin = exact,
     cerc auriu gol = aproximativ);
   - **de la zoom 15 în sus (nivel de oraș) nu se mai grupează nimic** — toate pin-urile
     sunt vizibile individual, chiar dacă fotografiile sunt la câțiva metri una de alta;
   - când ești departe (zoom mic), pin-urile apropiate se grupează într-un cerc cu număr;
     **click pe cerc** mărește harta și le separă;
   - localitățile cu coordonate dar fără pin de fotografie apar ca **un singur pin gri**
     per localitate (grupează toate fotografiile ei);
   - harta pornește centrată pe pin-urile fotografiilor, la un zoom care le arată separat;
   - **filtre pe hartă**: perioadă istorică, an exact sau interval de ani — harta afișează
     doar pin-urile fotografiilor care corespund; filtrele se păstrează în URL
     (`harta.html?period=1960-1990`), deci poți trimite linkul exact;
   - panoul din dreapta afișează miniaturile într-o **grilă de carduri 4:3**, cu titlul
     și anul fiecărei fotografii.
2. **Pagina fotografiei** (`foto/<slug>.html`): apare rândul „Coordonate”, sursa
   coordonatelor și butonul „Vezi pe hartă” care deschide harta centrată pe acea poză
   (`harta.html?foto=<slug>`). Paginile sunt **regenerate automat** la salvare.
3. **Legenda hărții** și textul de introducere se actualizează automat cu numerele reale.
4. `data/site-stats.json` primește `withOwnCoordinates`, `withExactCoordinates`,
   `withoutAnyCoordinates`.

---

## Reguli de onestitate (importante)

- **Sursa este obligatorie.** Fără `coordinateSource`, validarea dă eroare.
- **Declară precizia.** Dacă ai plasat punctul „din ochi” pe o hartă modernă, folosește
  `approximate`. Folosește `exact` doar dacă ai o sursă care confirmă punctul.
- **Nu muta fotografiile în locuri „probabile”.** Un pin aproximativ este util; un pin
  greșit prezentat ca exact este dăunător.
- Coordonatele plasate manual pe OpenStreetMap arată **locația de astăzi** a locului, care
  poate diferi de situația istorică (clădiri dispărute, străzi modificate). De aceea
  precizia și sursa sunt vizibile public.

---

## Depanare

| Problemă | Cauză | Soluție |
|---|---|---|
| **Pin-urile nu apar pe hartă după ce am setat coordonate în editor** | coordonatele nu sunt încă în catalog | Cu `npm run serve`: apasă **„Salvează în catalog”** (verifică rândul „În catalog”). Cu alt server: **Exportă JSON** → `node tools/set-coords.js --import ~/Downloads/coordinates.json` → `npm run build`. |
| Butonul „Salvează în catalog” e dezactivat | serverul nu suportă scrierea | oprește serverul curent și pornește `npm run serve` (serverul din proiect), apoi reîncarcă pagina |
| Văd versiuni vechi ale paginilor (răspunsuri `304`) | serverul trimite cache | folosește `npm run serve` — servește HTML/JSON fără cache (`no-store`) |
| Editorul afișează „Nu am putut încărca datele” | pagina e deschisă prin `file://` | `npm run serve` și deschide `http://localhost:8080/tools/coords-editor.html` |
| `fișierul „…” nu există` la import | cale greșită | folosiți calea completă (`~/Downloads/coordinates.json`). Sunt acceptate căi relative, absolute și `~`. |
| `lipsește sursa coordonatelor` | coloana `source` e goală | completează sursa sau setează „Sursă implicită” în editor |
| `latitudine invalidă` | virgulă vs. punct sau coloane inversate | verifică ordinea: `latitude` = 46.x, `longitude` = 23.x |
| Pin-urile sunt grupate într-un cerc cu număr | ești la zoom mic (sub 15) | **mărește harta** — de la zoom 15 fiecare fotografie are pin propriu. Click pe cerc mărește automat. |
| Pinurile se suprapun parțial | fotografiile sunt la câțiva metri una de alta | normal; mărește harta (zoom 18–19) sau deschide grupul din panou |
| Pinul nu se separă nici la zoom maxim | coordonatele sunt identice | sunt mai multe fotografii în același punct — normal; click pe pin/panou le listează pe toate |
| Am pierdut coordonatele | s-a editat manual `photos.json` | `npm run extract` păstrează coordonatele existente; altfel restaurează din `coordinates.json` |
| Vreau doar lista celor fără coordonate | — | `node tools/set-coords.js --list-missing` sau filtrul „Fără coordonate” din editor |

> Coordonatele completate în catalog **nu se pierd** la `npm run extract` sau
> `npm run pipeline` — sunt păstrate automat (ca și fotografiile adăugate manual).

---

## Referință rapidă

```bash
npm run serve                                   # serverul din proiect (cu salvare în 1 click)
# http://localhost:8000/tools/coords-editor.html
#   click pe fotografie → click pe hartă → „Salvează în catalog”
npm run coords                                  # câte fotografii au coordonate
node tools/set-coords.js --list-missing         # ce mai lipsește
node tools/set-coords.js --import <fișier>      # alternativ: import CSV/JSON
npm run build                                   # regenerează site-ul + harta
npm run validate && npm run test                # verifică
```

> `PORT=8080 npm run serve` dacă vrei alt port. Dacă preferi un server simplu,
> `npm run serve:static` (fără salvare în 1 click).

