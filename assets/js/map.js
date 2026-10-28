/**
 * assets/js/map.js — harta interactivă (Leaflet, vendorizat local) + filtre.
 *
 * Trei tipuri de puncte:
 *  1. coordonate proprii fotografiei  -> pin la poziția exactă/aproximativă a fotografiei
 *  2. fără coordonate proprii, dar cu localitate verificată -> un singur pin gri / localitate
 *  3. fără nicio coordonată -> fără pin, listat explicit sub hartă
 *
 * Filtrare: aceleași filtre ca în arhivă (perioadă, an exact, interval de ani),
 * aplicate client-side peste catalog. Starea filtrelor se păstrează în URL.
 *
 * Coordonatele nu sunt niciodată generate automat de site: provin din catalog.
 */
import { loadCatalog, thumbOf, thumbSize, photoHref } from './data.js';
import { matchesFilters, parseQuery, buildQuery, hasActiveFilters } from './search-core.js';
import { initNav, initLazyImages } from './site.js';

initNav();

const HUE_DEFAULT = { lat: 46.86326641627756, lng: 23.016986552462303, zoom: 13 };
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const panel = document.getElementById('map-panel');
const fallback = document.getElementById('map-fallback');

function escape(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const hasOwnCoords = (p) => typeof p.latitude === 'number' && typeof p.longitude === 'number';

/** Miniaturi sub formă de grilă, cu titlul fotografiei suprapus discret. */
function thumbsHtml(photos, limit) {
  const list = photos.slice(0, limit || 60);
  return '<ul class="map-panel__thumbs">' + list.map((p) => {
    const size = thumbSize(p);
    return `<li><a href="${photoHref(p)}" title="${escape(p.title)} (${escape(p.yearLabel)})">`
      + `<img src="${thumbOf(p)}" width="${size.width}" height="${size.height}" `
      + `alt="${escape(p.alt || p.title)}" loading="lazy" data-lazy>`
      + `<figcaption>${escape(p.title)} · ${escape(p.yearLabel)}</figcaption>`
      + '</a></li>';
  }).join('') + '</ul>';
}

function showPanel(title, subtitle, photos, note) {
  if (!panel) return;
  panel.innerHTML = [
    '<div class="map-panel__head">',
    `  <h3>${escape(title)}</h3>`,
    `  <span class="map-panel__count">${photos.length} ${photos.length === 1 ? 'fotografie' : 'fotografii'}</span>`,
    '</div>',
    subtitle ? `<p class="muted">${escape(subtitle)}</p>` : '',
    note ? `<p class="photo__note">${escape(note)}</p>` : '',
    thumbsHtml(photos)
  ].join('');
  initLazyImages(panel);
}

/** Construiește lista de puncte de pe hartă din catalogul (eventual filtrat). */
function buildPoints(photos, locations) {
  const locationsById = new Map(locations.map((l) => [l.id, l]));
  const points = [];
  const noPin = [];
  const localityByLocation = new Map();

  for (const p of photos) {
    if (hasOwnCoords(p)) {
      points.push({
        lat: p.latitude,
        lng: p.longitude,
        kind: p.coordinateCertainty === 'exact' ? 'photo-exact' : 'photo-approx',
        source: p.coordinateSource,
        certainty: p.coordinateCertainty,
        photos: [p]
      });
      continue;
    }

    const loc = p.locationId ? locationsById.get(p.locationId) : null;
    if (loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
      if (!localityByLocation.has(loc.id)) {
        const pt = {
          lat: loc.latitude,
          lng: loc.longitude,
          kind: 'locality',
          location: loc,
          source: loc.coordinateSource,
          photos: []
        };
        localityByLocation.set(loc.id, pt);
        points.push(pt);
      }
      localityByLocation.get(loc.id).photos.push(p);
      continue;
    }

    noPin.push(p);
  }

  return {
    points,
    noPin,
    photoPoints: points.filter((pt) => pt.kind !== 'locality'),
    localityPoints: points.filter((pt) => pt.kind === 'locality')
  };
}

/** Grupare pe grilă de pixeli la zoom-ul curent: la zoom mare pin-urile se separă. */
function clusterizeByPixels(points, map, gridPx) {
  if (!gridPx) return points.map((pt) => [pt]);
  const zoom = map.getZoom();
  const buckets = new Map();
  for (const pt of points) {
    const p = map.project([pt.lat, pt.lng], zoom);
    const key = Math.round(p.x / gridPx) + ':' + Math.round(p.y / gridPx);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(pt);
  }
  return [...buckets.values()];
}

/**
 * Dimensiunea grilei de grupare în funcție de zoom.
 * De la zoom 15 în sus (nivel de oraș) nu se mai grupează nimic: fiecare fotografie
 * are pin propriu.
 */
function clusterGridFor(zoom, isLocality) {
  if (isLocality) return 0;
  if (zoom >= 15) return 0;
  if (zoom >= 13) return 36;
  return 56;
}

function renderFallback(groups) {
  if (!fallback) return;
  fallback.innerHTML = groups.map((g) => {
    const items = g.items.map((it) => `<li>${escape(it.label)} — ${it.count}</li>`).join('');
    return `<h3 class="map-fallback__title">${escape(g.title)}</h3>`
      + (g.note ? `<p class="muted">${escape(g.note)}</p>` : '')
      + `<ul>${items}</ul>`;
  }).join('');
  fallback.hidden = false;
}

/* ------------------------------------------------------------------ *
 * Iconițe
 * ------------------------------------------------------------------ */
function makeIcons() {
  return {
    exact: window.L.divIcon({
      className: 'pin pin--exact',
      html: '<span style="display:block;width:16px;height:16px;border-radius:50%;'
        + 'background:#c9a227;border:2px solid #14140f;box-shadow:0 0 0 5px rgba(201,162,39,.30)"></span>',
      iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -12]
    }),
    approx: window.L.divIcon({
      className: 'pin pin--approx',
      html: '<span style="display:block;width:16px;height:16px;border-radius:50%;'
        + 'background:rgba(10,10,12,.85);border:3px solid #c9a227;box-shadow:0 0 0 5px rgba(201,162,39,.18)"></span>',
      iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -12]
    }),
    locality: window.L.divIcon({
      className: 'pin pin--locality',
      html: '<span style="display:block;width:12px;height:12px;border-radius:50%;'
        + 'background:#9c9a94;border:2px solid #14140f;box-shadow:0 0 0 4px rgba(156,154,148,.18)"></span>',
      iconSize: [12, 12], iconAnchor: [6, 6], popupAnchor: [0, -10]
    }),
    cluster: (count) => window.L.divIcon({
      className: 'pin pin--cluster',
      html: '<span style="display:grid;place-items:center;width:36px;height:36px;border-radius:50%;'
        + 'background:#c9a227;color:#14140f;font-weight:700;font-size:.8rem;border:2px solid #14140f">'
        + count + '</span>',
      iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -18]
    })
  };
}

const CERTAINTY_LABEL = {
  exact: 'poziționare exactă',
  approximate: 'poziționare aproximativă'
};

function pointPopup(point, key) {
  if (point.kind === 'locality') {
    return `<strong>${escape(point.location.name)}</strong><br>`
      + 'localitate (punctul exact nu este documentat)<br>'
      + `<a href="#" data-point="${escape(key)}">Vezi fotografiile</a>`;
  }
  const p = point.photos[0];
  return `<strong>${escape(p.title)}</strong><br>${escape(p.yearLabel)}<br>`
    + `<span class="muted">${escape(CERTAINTY_LABEL[p.coordinateCertainty] || 'coordonate proprii')}</span><br>`
    + `<a href="${photoHref(p)}">Vezi fotografia</a>`;
}

/* ------------------------------------------------------------------ *
 * Filtre (perioadă, an exact, interval de ani)
 * ------------------------------------------------------------------ */
const filterEl = {
  form: document.getElementById('map-filters'),
  period: document.getElementById('m-period'),
  year: document.getElementById('m-year'),
  yearFrom: document.getElementById('m-from'),
  yearTo: document.getElementById('m-to'),
  count: document.getElementById('m-count'),
  active: document.getElementById('m-active'),
  reset: document.getElementById('m-reset')
};

function fillPeriodSelect(periods, eras, photos) {
  if (!filterEl.period) return;
  const used = periods.filter((p) => photos.some((ph) => ph.periodId === p.id));
  filterEl.period.innerHTML = '<option value="">Toate perioadele</option>'
    + used.map((p) => `<option value="${p.id}">${escape(p.label)}</option>`).join('')
    + (eras.length
      ? '<optgroup label="Perioade denumite">'
        + eras.map((e) => `<option value="era:${e.id}">${escape(e.label)}</option>`).join('')
        + '</optgroup>'
      : '');
}

function readFilters() {
  const periodValue = filterEl.period ? filterEl.period.value : '';
  return {
    period: periodValue.startsWith('era:') ? '' : periodValue,
    era: periodValue.startsWith('era:') ? periodValue.slice(4) : '',
    year: filterEl.year ? filterEl.year.value : '',
    yearFrom: filterEl.yearFrom ? filterEl.yearFrom.value : '',
    yearTo: filterEl.yearTo ? filterEl.yearTo.value : ''
  };
}

function applyFiltersToForm(f) {
  if (filterEl.period) filterEl.period.value = f.era ? 'era:' + f.era : (f.period || '');
  if (filterEl.year) filterEl.year.value = f.year || '';
  if (filterEl.yearFrom) filterEl.yearFrom.value = f.yearFrom || '';
  if (filterEl.yearTo) filterEl.yearTo.value = f.yearTo || '';
}

function writeUrl(f, extra) {
  const params = Object.assign({}, f, extra || {});
  const qs = buildQuery(params);
  window.history.replaceState({}, '', window.location.pathname + qs);
}


/* ------------------------------------------------------------------ *
 * Inițializare
 * ------------------------------------------------------------------ */
async function init() {
  let catalog;
  try {
    catalog = await loadCatalog();
  } catch (err) {
    if (panel) panel.innerHTML = '<p class="muted">Catalogul nu a putut fi încărcat.</p>';
    console.error(err);
    return;
  }

  if (typeof window.L === 'undefined') {
    renderFallback([{
      title: 'Harta nu a putut fi încărcată',
      note: 'Biblioteca Leaflet nu este disponibilă. Situația din catalog rămâne valabilă:',
      items: [
        { label: 'Fotografii cu coordonate proprii', count: catalog.photos.filter(hasOwnCoords).length },
        { label: 'Fotografii fără coordonate proprii', count: catalog.photos.filter((p) => !hasOwnCoords(p)).length }
      ]
    }]);
    return;
  }

  const map = window.L.map('map', {
    center: [HUE_DEFAULT.lat, HUE_DEFAULT.lng],
    zoom: HUE_DEFAULT.zoom,
    scrollWheelZoom: false,
    zoomControl: true
  });
  window.L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIB }).addTo(map);

  const icons = makeIcons();
  const markerLayer = window.L.layerGroup().addTo(map);
  const markerByKey = new Map();

  const state = {
    photoPoints: [],
    localityPoints: [],
    noPin: [],
    shownPhotos: [],
    filters: parseQuery(window.location.search)
  };

  fillPeriodSelect(catalog.periods, catalog.eras, catalog.photos);
  applyFiltersToForm(state.filters);

  function selectPoint(pt) {
    if (pt.kind === 'locality') {
      showPanel(pt.location.name, 'localitate (punct exact nedocumentat)', pt.photos, pt.location.description);
      return;
    }
    const p = pt.photos[0];
    showPanel(p.title, p.yearLabel + ' · ' + (CERTAINTY_LABEL[p.coordinateCertainty] || ''),
      pt.photos, 'Sursa coordonatelor: ' + (p.coordinateSource || 'nespecificată'));
  }

  /** (Re)desenează un strat de pin-uri, grupat pe grilă de pixeli la zoom-ul curent. */
  function renderLayer(layerPoints, gridPx, zIndexOffset) {
    for (const group of clusterizeByPixels(layerPoints, map, gridPx)) {
      const allPhotos = group.flatMap((pt) => pt.photos);

      if (group.length === 1) {
        const pt = group[0];
        const key = pt.photos[0].id;
        const icon = pt.kind === 'locality' ? icons.locality
          : (pt.kind === 'photo-exact' ? icons.exact : icons.approx);
        const marker = window.L.marker([pt.lat, pt.lng], { icon, title: pt.photos[0].title, zIndexOffset });
        marker.bindPopup(pointPopup(pt, key));
        marker.on('click', () => selectPoint(pt));
        markerLayer.addLayer(marker);
        markerByKey.set(key, { marker, point: pt });
        continue;
      }

      const lat = group.reduce((s, pt) => s + pt.lat, 0) / group.length;
      const lng = group.reduce((s, pt) => s + pt.lng, 0) / group.length;
      const key = 'cluster:' + group.map((pt) => pt.photos[0].id).join('|');
      const marker = window.L.marker([lat, lng], { icon: icons.cluster(allPhotos.length), zIndexOffset });
      marker.bindPopup(`<strong>${allPhotos.length} fotografii</strong><br>în această zonă<br>`
        + `<a href="#" data-point="${escape(key)}">Vezi fotografiile</a>`);
      marker.on('click', () => {
        map.fitBounds(window.L.latLngBounds(group.map((pt) => [pt.lat, pt.lng])).pad(0.35), { maxZoom: 19 });
        showPanel(allPhotos.length + ' fotografii',
          'grupate în aceeași zonă — măriți harta pentru a le separa', allPhotos, null);
      });
      markerLayer.addLayer(marker);
      markerByKey.set(key, { marker, point: { lat, lng, photos: allPhotos } });
    }
  }

  function renderMarkers() {
    markerLayer.clearLayers();
    markerByKey.clear();
    const zoom = map.getZoom();
    renderLayer(state.localityPoints, clusterGridFor(zoom, true), 0);
    renderLayer(state.photoPoints, clusterGridFor(zoom, false), 2000);
  }

  /** Centrează harta pe pin-urile fotografiilor (sau pe toate, dacă nu există). */
  function fitToPins() {
    const focus = state.photoPoints.length ? state.photoPoints : state.localityPoints;
    if (!focus.length) return;
    if (focus.length === 1) {
      map.setView([focus[0].lat, focus[0].lng], 16);
      return;
    }
    map.fitBounds(window.L.latLngBounds(focus.map((pt) => [pt.lat, pt.lng])).pad(0.25), { maxZoom: 19 });
    if (state.photoPoints.length && map.getZoom() < 15) map.setZoom(15);
  }


  /** Recalculează punctele din catalogul filtrat și redesenează tot. */
  function refresh(options) {
    const opts = options || {};
    const filtered = catalog.photos.filter((p) => matchesFilters(p, state.filters));

    const built = buildPoints(filtered, catalog.locations);
    state.photoPoints = built.photoPoints;
    state.localityPoints = built.localityPoints;
    state.noPin = built.noPin;
    state.shownPhotos = filtered;

    renderMarkers();
    if (opts.fit !== false) fitToPins();
    updateFilterUi(filtered.length);
    renderFallbackLists();
    if (opts.writeUrl !== false) writeUrl(state.filters);
  }

  function updateFilterUi(shown) {
    if (filterEl.count) {
      const total = catalog.photos.length;
      filterEl.count.innerHTML = hasActiveFilters(state.filters)
        ? `<strong>${shown}</strong> din ${total} fotografii corespund filtrelor`
        : `<strong>${total}</strong> fotografii în arhivă`;
    }
    if (filterEl.active) {
      const chips = [];
      const periodLabel = (id) => {
        const p = catalog.periods.find((x) => x.id === id);
        return p ? p.label : id;
      };
      const eraLabel = (id) => {
        const e = catalog.eras.find((x) => x.id === id);
        return e ? e.label : id;
      };
      if (state.filters.period) chips.push(['period', 'Perioadă: ' + periodLabel(state.filters.period)]);
      if (state.filters.era) chips.push(['era', 'Perioadă: ' + eraLabel(state.filters.era)]);
      if (state.filters.year) chips.push(['year', 'Anul: ' + state.filters.year]);
      if (state.filters.yearFrom) chips.push(['yearFrom', 'Din: ' + state.filters.yearFrom]);
      if (state.filters.yearTo) chips.push(['yearTo', 'Până în: ' + state.filters.yearTo]);
      filterEl.active.innerHTML = chips.length
        ? chips.map(([key, label]) =>
          `<span class="tag">${escape(label)}<button type="button" data-clear="${key}" `
          + `aria-label="Elimină filtrul ${escape(label)}">×</button></span>`
        ).join('')
        : '';
    }
  }

  function renderFallbackLists() {
    const groups = [];
    if (state.noPin.length) {
      groups.push({
        title: 'Fotografii fără coordonate (' + state.noPin.length + ')',
        note: hasActiveFilters(state.filters)
          ? 'Dintre fotografiile care corespund filtrelor, acestea nu au nicio coordonată documentată.'
          : 'Pentru aceste fotografii nu este documentată o locație precisă, deci nu au fost '
            + 'plasate pin-uri aproximative.',
        items: [{ label: 'Fotografii fără pin', count: state.noPin.length }]
      });
    }
    const unmapped = catalog.locations.filter(
      (l) => l.photoIds.length > 0 && typeof l.latitude !== 'number'
    );
    if (unmapped.length) {
      groups.push({
        title: 'Localități menționate, fără coordonate verificate',
        note: 'Apar în descrierile originale, dar nu au coordonate confirmate.',
        items: unmapped.map((l) => ({ label: l.name, count: l.photoIds.length }))
      });
    }
    if (groups.length) renderFallback(groups);
    else if (fallback) { fallback.hidden = true; fallback.innerHTML = ''; }
  }

  function focusPhoto(slug) {
    const p = catalog.photos.find((x) => x.slug === slug);
    if (!p) return;
    const pt = state.photoPoints.find((x) => x.photos[0].id === p.id);
    if (!pt) {
      showPanel(p.title, p.yearLabel, [p], 'Această fotografie nu are coordonate proprii pe hartă.');
      return;
    }
    map.setView([pt.lat, pt.lng], 17);
    showPanel(p.title, p.yearLabel, [p], 'Sursa coordonatelor: ' + (p.coordinateSource || 'nespecificată'));
    const entry = markerByKey.get(p.id);
    if (entry && entry.marker) entry.marker.openPopup();
  }

  function focusLocation(id) {
    const loc = catalog.locations.find((l) => l.id === id);
    if (!loc) return;
    if (typeof loc.latitude === 'number') map.setView([loc.latitude, loc.longitude], 14);
    showPanel(loc.name, null, catalog.photos.filter((p) => p.locationId === id), loc.description);
  }


  /* ------------------------------ evenimente ------------------------------ */
  map.on('zoomend', renderMarkers);

  function onFilterChange() {
    state.filters = readFilters();
    refresh({ fit: true });
  }

  if (filterEl.form) {
    filterEl.form.addEventListener('input', onFilterChange);
    filterEl.form.addEventListener('change', onFilterChange);
    filterEl.form.addEventListener('submit', (e) => e.preventDefault());
  }

  if (filterEl.reset) {
    filterEl.reset.addEventListener('click', () => {
      state.filters = {
        q: '', period: '', era: '', location: '', year: '',
        yearFrom: '', yearTo: '', sort: 'archive', page: 1
      };
      applyFiltersToForm(state.filters);
      refresh({ fit: true });
    });
  }

  if (filterEl.active) {
    filterEl.active.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-clear]');
      if (!btn) return;
      state.filters[btn.dataset.clear] = '';
      applyFiltersToForm(state.filters);
      refresh({ fit: true });
    });
  }

  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-point]');
    if (!link) return;
    e.preventDefault();
    const entry = markerByKey.get(link.dataset.point);
    if (!entry) return;
    const isCluster = entry.point.photos.length > 1;
    map.setView([entry.point.lat, entry.point.lng],
      isCluster ? Math.min(map.getZoom() + 2, 19) : 17);
    showPanel(entry.point.photos.length + ' fotografii', 'în această zonă a hărții',
      entry.point.photos, null);
  });

  /* ------------------------------ pornire ------------------------------ */
  refresh({ fit: true, writeUrl: false });

  const params = new URLSearchParams(window.location.search);
  if (params.get('foto')) focusPhoto(params.get('foto'));
  else if (params.get('loc')) focusLocation(params.get('loc'));
  else if (state.photoPoints.length === 1) selectPoint(state.photoPoints[0]);
}

init();

