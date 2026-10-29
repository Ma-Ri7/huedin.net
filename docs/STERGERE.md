# Tutorial: cum ștergi o fotografie din arhivă

**Ștergerea este reversibilă.** Fotografia nu este distrusă: este mutată în coșul de
reciclare (`backup/deleted/`) și poate fi readusă oricând cu un click. Aceasta este
singura metodă de ștergere expusă în unelte, tocmai ca să nu existe pierderi de conținut.

| Metodă | Când o folosești |
|---|---|
| **A. Pagina de ștergere** (`tools/delete-photo.html`) | întotdeauna — vezi poza, apeși un buton, confirmi |
| **B. Coșul de reciclare** (aceeași pagină) | dacă te răzgândești — readuci fotografia |

---

## Metoda A — Pagina de ștergere (recomandat)

### A1. Pornește serverul

```bash
npm run serve
```

### A2. Deschide pagina

**<http://localhost:8000/tools/delete-photo.html>**

Sus, în dreapta, trebuie să scrie **„258 fotografii în arhivă"**.
Dacă scrie „server indisponibil", serverul nu rulează — pornește-l cu `npm run serve`.

### A3. Găsește fotografia

- scrie în căsuța de căutare: titlu, an, localitate sau identificator (`p123`)
- folosește filtrele:
  - **Toate** — întreaga arhivă
  - **Din arhiva originală** — doar fotografiile moștenite (cele 257)
  - **Adăugate de mine** — doar fotografiile adăugate de tine
  - **Fără coordonate** — cele care nu au pin pe hartă
- **apasă pe fotografie** ca s-o selectezi (apare bifă aurie)

### A4. Apasă „Șterge fotografia"

Butonul roșu din dreapta, sub detaliile fotografiei.

Se deschide un dialog de confirmare care îți arată:
- miniatura și titlul fotografiei;
- **exact ce fișiere se mută în coș**;
- un avertisment suplimentar dacă fotografia face parte din **arhiva originală**.

> ⚠️ **Atenție la fotografiile din arhiva originală.** Regula proiectului este păstrarea
> integrală a arhivei. Dacă ștergi una, raportul `npm run reconcile` va semnala diferența
> (fotografia nu se pierde — poate fi restaurată). Șterge din arhiva originală doar dacă
> ai un motiv clar (ex. o poză duplicată sau greșită).

### A5. Confirmă

Apasă **„Da, șterge fotografia"**. Se întâmplă automat, într-un singur pas:

1. fotografia este scoasă din `data/photos.json`;
2. este scoasă din localitate (`data/locations.json`) și din `data/media.json`;
3. imaginea, miniatura, preview-ul și pagina `foto/<slug>.html` sunt **mutate** în
   `backup/deleted/` (nu șterse);
4. **site-ul este regenerat** — dispare din arhivă, din căutare, de pe hartă și din sitemap.

---

## Metoda B — Restaurarea (dacă te răzgândești)

În partea dreaptă-jos a aceleiași pagini este **Coșul de reciclare**, cu toate
fotografiile șterse, în ordine inversă, cu data la care au fost șterse.

1. apasă **„Restaurează"** în dreptul fotografiei dorite;
2. fișierele sunt puse **exact la locurile lor** (verificat bit-cu-bit);
3. fotografia revine în catalog, în localitate, în media, pe hartă și în căutare;
4. site-ul este regenerat automat.

### Golirea coșului (ștergere definitivă)

Butonul **„Golește coșul definitiv"** șterge ireversibil toate fișierele din coș.
Este singura operație din proiect care distruge date — se cere o confirmare separată
în browser, iar serverul refuză cererea dacă nu primește confirmarea explicită.


---

## Ce se întâmplă în spate (pentru curioși)

| Endpoint | Efect |
|---|---|
| `GET /api/photos/list` | lista fotografiilor + conținutul coșului |
| `POST /api/photos/delete` `{ id }` | mută fotografia în coș + regenerează site-ul |
| `POST /api/photos/restore` `{ id }` | readuce fotografia din coș + regenerează site-ul |
| `POST /api/photos/purge` `{ confirm: true }` | golește coșul (definitiv) |

**Fișiere implicate la o ștergere:**

```
assets/img/portfolio/<imagine>     -> backup/deleted/<imagine>
assets/img/portfolio/<original>    -> backup/deleted/<original>      (dacă există)
assets/img/thumbs/<id>.webp        -> backup/deleted/<id>.webp
assets/img/previews/<id>.webp      -> backup/deleted/<id>.webp
foto/<slug>.html                   -> backup/deleted/<slug>.html
```

Metadatele complete (inclusiv coordonatele, descrierea și varianta din `media.json`)
sunt păstrate în `data/deleted-photos.json`, exact ca să poată fi restaurate identic.

### Protecții

- **`npm run extract` nu readuce fotografiile șterse.** Fără această regulă, o fotografie
  legacy ștearsă ar reapărea la următoarea rulare a pipeline-ului. Verificat automat
  în `npm run test-trash` (test de integrare pe o copie reală a proiectului).
- **Coșul nu se publică.** `backup/` este exclus în `_config.yml`, iar
  `backup/deleted/` + `data/deleted-photos.json` sunt în `.gitignore`.
- **Pagina nu se publică.** `tools/` este exclus, iar pagina este marcată `noindex`
  și blocată de `tools/local-guard.js` pe domeniul public.
- **Nimic nu se suprascrie.** Dacă în coș există deja un fișier cu același nume,
  cel nou primește un sufix (`-2`, `-3`, …).

### Verificare automată

```bash
npm run test-trash     # 12 teste, într-un sandbox (nu atinge datele reale)
npm run browser        # include ciclul complet ștergere -> restaurare, prin interfață
```

## Legături

- [`ADD-PHOTO.md`](ADD-PHOTO.md) — cum adaugi o fotografie
- [`COORDONATE.md`](COORDONATE.md) — cum pui coordonate pe hartă
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — cum e construit site-ul
- [`MIGRATION.md`](MIGRATION.md) — cum revii la versiunea originală

