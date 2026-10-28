/**
 * assets/js/archive.js — arhiva fotografică: căutare, filtre, paginare, lightbox.
 * Toată logica de filtrare este în search-core.js (funcții pure, testate).
 */
import { loadCatalog, thumbOf, thumbSize, previewOf, photoHref } from './data.js';
import { parseQuery, buildQuery, filterPhotos, sortPhotos, hasActiveFilters } from './search-core.js';
import { initLazyImages, createLightbox } from './site.js';

const PAGE_SIZE = 48;

const dom = {
  form: document.getElementById('filters'),
  grid: document.getElementById('grid'),
  empty: document.getElementById('empty'),
  pager: document.getElementById('pager'),
  count: document.getElementById('count'),
  active: document.getElementById('active'),
  reset: document.getElementById('reset'),
  q: document.getElementById('f-q'),
  period: document.getElementById('f-period'),
  location: document.getElementById('f-location'),
  year: document.getElementById('f-year'),
  yearFrom: document.getElementById('f-from'),
  yearTo: document.getElementById('f-to'),
  sort: document.getElementById('f-sort')
};

const state = {
  all: [],
  locations: [],
  periods: [],
  eras: [],
  filters: parseQuery(window.location.search),
  lightbox: null
};

/* ------------------------------------------------------------------ *
 * Selecturi (perioade, localități)
 * ------------------------------------------------------------------ */
function fillSelects() {
  if (dom.period) {
    const used = state.periods.filter((p) => state.all.some((ph) => ph.periodId === p.id));
    dom.period.innerHTML = '<option value="">Toate perioadele</option>'
      + used.map((p) => `<option value="${p.id}">${p.label}</option>`).join('')
      + (state.eras.length
        ? `<optgroup label="Perioade denumite">`
          + state.eras.map((e) => `<option value="era:${e.id}">${e.label}</option>`).join('')
          + `</optgroup>`
        : '');
  }

  if (dom.location) {
    const withPhotos = state.locations.filter((l) => state.all.some((p) => p.locationId === l.id));
    const unknownCount = state.all.filter((p) => !p.locationId).length;
    dom.location.innerHTML = '<option value="">Toate localitățile</option>'
      + withPhotos.map((l) => `<option value="${l.id}">${l.name}</option>`).join('')
      + (unknownCount ? `<option value="__unknown__">Locație nedocumentată (${unknownCount})</option>` : '');
  }
}

/* ------------------------------------------------------------------ *
 * Starea filtrelor <-> URL (URL-uri partajabile)
 * ------------------------------------------------------------------ */
function filtersToQuery(f) {
  const out = Object.assign({}, f);
  if (f.period && f.period.startsWith('era:')) {
    out.period = '';
    out.era = f.period.slice(4);
  } else {
    out.era = '';
  }
  return out;
}

function writeUrl(f, replace) {
  const qs = buildQuery(filtersToQuery(f));
  const url = window.location.pathname + qs;
  if (replace) window.history.replaceState({}, '', url);
  else window.history.pushState({}, '', url);
}

function applyFiltersToForm(f) {
  if (dom.q) dom.q.value = f.q || '';
  if (dom.period) dom.period.value = f.era ? 'era:' + f.era : (f.period || '');
  if (dom.location) dom.location.value = f.location || '';
  if (dom.year) dom.year.value = f.year || '';
  if (dom.yearFrom) dom.yearFrom.value = f.yearFrom || '';
  if (dom.yearTo) dom.yearTo.value = f.yearTo || '';
  if (dom.sort) dom.sort.value = f.sort || 'archive';
}

function readForm() {
  const periodValue = dom.period ? dom.period.value : '';
  return {
    q: dom.q ? dom.q.value.trim() : '',
    period: periodValue.startsWith('era:') ? '' : periodValue,
    era: periodValue.startsWith('era:') ? periodValue.slice(4) : '',
    location: dom.location ? dom.location.value : '',
    year: dom.year ? dom.year.value : '',
    yearFrom: dom.yearFrom ? dom.yearFrom.value : '',
    yearTo: dom.yearTo ? dom.yearTo.value : '',
    sort: dom.sort ? dom.sort.value : 'archive',
    page: 1
  };
}

/* ------------------------------------------------------------------ *
 * Randare
 * ------------------------------------------------------------------ */
function cardHtml(photo, index) {
  const size = thumbSize(photo);
  const yearText = photo.yearLabel || 'Necunoscut';
  const place = photo.locationName
    ? `<span>${escape(photo.locationName)}</span>`
    : (photo.locationId ? '' : '<span>Locație nedocumentată</span>');
  const title = escape(photo.title || 'Fotografie fără titlu');
  const alt = escape(photo.alt || photo.title || 'Fotografie istorică din Huedin');

  return [
    '<article class="card">',
    '  <div class="card__media">',
    `    <img src="${thumbOf(photo)}" width="${size.width}" height="${size.height}" alt="${alt}" loading="lazy" decoding="async" data-lazy data-index="${index}" tabindex="0" role="button" aria-label="Deschide previzualizarea: ${escape(photo.title || 'fotografie')}">`,
    '  </div>',
    '  <div class="card__body">',
    `    <h3 class="card__title"><a href="${photoHref(photo)}">${title}</a></h3>`,
    '    <div class="card__meta">',
    `      <span class="badge">${escape(yearText)}</span>`,
    place ? `      ${place}` : '',
    '    </div>',
    '  </div>',
    '</article>'
  ].join('\n');
}

function escape(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderActiveChips(f) {
  if (!dom.active) return;
  const chips = [];
  const periodLabel = (id) => {
    const p = state.periods.find((x) => x.id === id);
    return p ? p.label : id;
  };
  const eraLabel = (id) => {
    const e = state.eras.find((x) => x.id === id);
    return e ? e.label : id;
  };
  const locLabel = (id) => {
    if (id === '__unknown__') return 'Locație nedocumentată';
    const l = state.locations.find((x) => x.id === id);
    return l ? l.name : id;
  };

  if (f.q) chips.push(['q', 'Text: „' + f.q + '”']);
  if (f.period) chips.push(['period', 'Perioadă: ' + periodLabel(f.period)]);
  if (f.era) chips.push(['era', 'Perioadă: ' + eraLabel(f.era)]);
  if (f.location) chips.push(['location', 'Localitate: ' + locLabel(f.location)]);
  if (f.year) chips.push(['year', 'Anul: ' + f.year]);
  if (f.yearFrom) chips.push(['yearFrom', 'Din: ' + f.yearFrom]);
  if (f.yearTo) chips.push(['yearTo', 'Până în: ' + f.yearTo]);

  dom.active.innerHTML = chips.length
    ? chips.map(([key, label]) =>
      `<span class="tag">${escape(label)}<button type="button" data-clear="${key}" aria-label="Elimină filtrul ${escape(label)}">×</button></span>`
    ).join('')
    : '';
}

function render() {
  const f = state.filters;
  const filtered = sortPhotos(filterPhotos(state.all, f), f.sort);
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, f.page || 1), pages);
  const slice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  dom.grid.innerHTML = slice.map((p, i) => cardHtml(p, (page - 1) * PAGE_SIZE + i)).join('\n');
  initLazyImages(dom.grid);

  if (dom.count) {
    dom.count.innerHTML = total === 1
      ? '<strong>1</strong> fotografie găsită'
      : `<strong>${total}</strong> fotografii găsite`;
    if (hasActiveFilters(f)) dom.count.innerHTML += ' (filtre active)';
  }

  if (dom.empty) dom.empty.hidden = total !== 0;

  if (dom.pager) {
    const show = pages > 1;
    dom.pager.hidden = !show;
    dom.pager.innerHTML = show
      ? [
        `<button class="btn btn--sm btn--ghost" type="button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>← Anterioare</button>`,
        `<span class="pager__status">Pagina ${page} din ${pages}</span>`,
        `<button class="btn btn--sm btn--ghost" type="button" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Următoare →</button>`
      ].join('')
      : '';
  }

  renderActiveChips(f);

  const items = slice.map((p) => ({
    src: previewOf(p),
    title: p.title,
    caption: [p.yearLabel, p.locationName].filter(Boolean).join(' · '),
    href: photoHref(p)
  }));
  state.lightbox = createLightbox(items);
  return { total, page, pages };
}

function update(replace) {
  state.filters = Object.assign({}, state.filters, readForm());
  writeUrl(state.filters, replace !== false);
  applyFiltersToForm(state.filters);
  render();
  const top = dom.form ? dom.form.getBoundingClientRect().top + window.scrollY - 80 : 0;
  if (replace === false) window.scrollTo({ top, behavior: 'smooth' });
}


/* ------------------------------------------------------------------ *
 * Evenimente
 * ------------------------------------------------------------------ */
let debounceTimer = null;
function debouncedUpdate() {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => update(true), 220);
}

function bindEvents() {
  if (dom.form) {
    dom.form.addEventListener('submit', (e) => {
      e.preventDefault();
      update(false);
    });
    dom.form.addEventListener('input', (e) => {
      if (e.target === dom.sort) return;
      debouncedUpdate();
    });
    dom.form.addEventListener('change', (e) => {
      if (e.target === dom.sort) { update(false); return; }
      debouncedUpdate();
    });
  }

  const resetAll = () => {
    state.filters = { q: '', period: '', era: '', location: '', year: '', yearFrom: '', yearTo: '', sort: 'archive', page: 1 };
    applyFiltersToForm(state.filters);
    writeUrl(state.filters, false);
    render();
    if (dom.q) dom.q.focus();
  };

  const toggle = document.getElementById('filters-toggle');
  const toggleFields = document.getElementById('filters-fields');
  if (toggle && toggleFields) {
    toggle.addEventListener('click', () => {
      const open = toggleFields.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Ascunde filtrele după an' : 'Filtre după an';
    });
  }

  if (dom.reset) dom.reset.addEventListener('click', resetAll);
  const resetEmpty = document.getElementById('reset-empty');
  if (resetEmpty) resetEmpty.addEventListener('click', resetAll);

  if (dom.active) {
    dom.active.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-clear]');
      if (!btn) return;
      state.filters[btn.dataset.clear] = '';
      state.filters.page = 1;
      applyFiltersToForm(state.filters);
      writeUrl(state.filters, false);
      render();
    });
  }

  if (dom.pager) {
    dom.pager.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-page]');
      if (!btn || btn.disabled) return;
      state.filters.page = parseInt(btn.dataset.page, 10);
      writeUrl(state.filters, false);
      render();
      const top = dom.form.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  }

  if (dom.grid) {
    dom.grid.addEventListener('click', (e) => {
      const img = e.target.closest('.card__media img');
      if (!img || !state.lightbox) return;
      e.preventDefault();
      state.lightbox.open(parseInt(img.dataset.index, 10) || 0);
    });
    dom.grid.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const img = e.target.closest('.card__media img');
      if (!img || !state.lightbox) return;
      e.preventDefault();
      state.lightbox.open(parseInt(img.dataset.index, 10) || 0);
    });
  }

  window.addEventListener('popstate', () => {
    state.filters = parseQuery(window.location.search);
    applyFiltersToForm(state.filters);
    render();
  });
}

/* ------------------------------------------------------------------ *
 * Inițializare
 * ------------------------------------------------------------------ */
async function init() {
  try {
    const catalog = await loadCatalog();
    state.all = catalog.photos;
    state.locations = catalog.locations;
    state.periods = catalog.periods;
    state.eras = catalog.eras;
  } catch (err) {
    if (dom.grid) {
      const isFile = window.location.protocol === 'file:';
      dom.grid.innerHTML = '<p class="empty">Catalogul nu a putut fi încărcat.'
        + (isFile
          ? ' Fișierul este deschis direct de pe disc, iar browserele blochează încărcarea '
            + 'datelor JSON prin <code>file://</code>. Deschideți site-ul printr-un server local.'
          : ' Reîncărcați pagina; dacă problema persistă, reveniți mai târziu.')
        + '</p>';
    }
    console.error(err);
    return;
  }

  fillSelects();
  applyFiltersToForm(state.filters);
  bindEvents();

  // Dacă filtrele de an vin din URL, secțiunea pliabilă se deschide automat (mobil).
  if (state.filters.year || state.filters.yearFrom || state.filters.yearTo) {
    const fields = document.getElementById('filters-fields');
    const toggle = document.getElementById('filters-toggle');
    if (fields && toggle) {
      fields.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.textContent = 'Ascunde filtrele după an';
    }
  }

  render();
}

init();

