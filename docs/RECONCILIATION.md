# Raport de reconciliere — legacy vs. arhivă nouă

Generat: 2026-10-29 · sursă legacy: `backup/legacy-index.html` (198462 octeți)

## Rezumat

| Indicator | Legacy | Arhivă nouă |
|---|---|---|
| Fotografii | 257 | 258 (257 legacy + 1 adăugate) |
| Pagini de fotografii | 0 (fără URL propriu) | 258 |
| Pagini principale | 1 (single-page cu ancore) | 5 |
| Fișiere imagine existente | 257 | 258 |
| An exact documentat | — | 178 |
| Perioadă/interval aproximativ | — | 60 |
| Doar „perioada interbelică” | — | 15 |
| Fără datare documentată | — | 5 |
| Locații documentate | 0 (fără metadate geografice) | 9 (1 cu coordonate) |
| Fotografii fără localitate | 257 | 74 |
| Originale alb-negru legate | — | 249 |

## Informații

- 1 fotografii adăugate ulterior (nu fac parte din arhiva legacy): p258 „Decembrie 89”

## Verificări

| Verificare | Rezultat | Detaliu |
|---|---|---|
| Toate fotografiile din arhiva legacy sunt prezente | OK | legacy=257, prezente=257 |
| Fotografiile legacy păstrează ordinea originală | OK | indexul legacy nu mai corespunde poziției în catalog |
| Ordinea și indexul fotografiilor sunt identice | OK | 0 nepotriviri |
| Toate titlurile sunt păstrate verbatim | OK | 0 nepotriviri |
| Toate textele de an/perioadă sunt păstrate verbatim | OK | 0 nepotriviri |
| Toate referințele către imagini sunt păstrate | OK | 0 nepotriviri |
| Toate fișierele foto referențiate există pe disc | OK |  |
| Există o pagină pentru fiecare fotografie | OK |  |
| Paragrafele secțiunii „Despre” sunt păstrate | OK | 5 paragrafe |
| Punctele din disclaimer sunt păstrate | OK | 4 puncte |
| Statisticile publice sunt păstrate | OK | 4 valori |
| Legăturile utile sunt păstrate | OK | 4 legături |
| Conturile sociale sunt păstrate | OK | 3 conturi |
| Informațiile de contact sunt păstrate | OK | admin@huedin.net / 07XXXXXXXX |
| Ancora legacy id="header" există în index.html | OK |  |
| Ancora legacy id="about" există în index.html | OK |  |
| Ancora legacy id="portfolio" există în index.html | OK |  |
| Ancora legacy id="services" există în index.html | OK |  |
| Ancora legacy id="contact" există în index.html | OK |  |
| Sitemap-ul include toate paginile de fotografii | OK |  |

## Concluzie

Toate verificările au trecut. Nu au fost identificate pierderi de conținut. Inventarul legacy și catalogul nou corespund 1:1 (index, titlu, text de an, referință imagine).

## Note

- Seriile de fotografii cu titlu și an identice au fost **păstrate integral** (nu s-au eliminat duplicate aparente).
- O referință ruptă din versiunea legacy (typo `_nn.webp`, fotografia p143 „Strada Poștei”) este păstrată în catalog ca informație; noul site folosește fișierul corect existent.
- Fișierele nefolosite de versiunea legacy (264 originale `.jpg` și variante `.webp`) **nu au fost șterse**; originalele alb-negru sunt legate în pagina fiecărei fotografii.
- Imaginile originale nu au fost modificate; miniaturile și preview-urile sunt fișiere noi, generate non-distructiv.
