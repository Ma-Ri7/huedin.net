/**
 * assets/js/site.js — comportamente partajate (module ES, fără dependențe).
 *  - navigare mobilă;
 *  - fade-in pentru imagini încărcate lazy;
 *  - reveal discret la derulare;
 *  - lightbox accesibil (tastatură: ← → Esc, focus, ARIA).
 *
 * `initNav()` și `initReveal()` se pornesc automat la import, ca să funcționeze
 * pe orice pagină care încarcă acest modul (direct sau prin archive.js/photo.js/map.js).
 */

let navInitialized = false;

/** Comută meniul de navigare pe ecrane mici. Idempotent. */
export function initNav() {
  if (navInitialized) return;
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');
  if (!toggle || !nav) return;
  navInitialized = true;

  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Închide meniul' : 'Deschide meniul');
  };

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!nav.classList.contains('is-open'));
  });

  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });

  // închidere la click în afara meniului (dar nu și pe butonul de comutare)
  document.addEventListener('click', (e) => {
    if (!nav.classList.contains('is-open')) return;
    if (e.target.closest('#site-nav') || e.target.closest('.nav-toggle')) return;
    setOpen(false);
  });

  // închidere la redimensionare spre desktop
  window.addEventListener('resize', () => {
    if (window.innerWidth > 860) setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) {
      setOpen(false);
      toggle.focus();
    }
  });

  setOpen(false);
}

/** Marchează imaginile lazy ca încărcate (pentru tranziție discretă). */
export function initLazyImages(root = document) {
  root.querySelectorAll('img[data-lazy]').forEach((img) => {
    const done = () => { img.dataset.loaded = 'true'; };
    if (img.complete && img.naturalWidth > 0) {
      done();
    } else {
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    }
  });
}

/**
 * Reveal discret la derulare pentru elementele marcate cu `data-reveal`.
 * Fără JS (sau cu „reduce motion") elementele rămân pur și simplu vizibile.
 */
export function initReveal(root = document) {
  const items = root.querySelectorAll('[data-reveal]');
  if (!items.length) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;

  document.documentElement.classList.add('has-reveal');

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });

  items.forEach((el) => io.observe(el));

  // plasă de siguranță: dacă ceva nu se intersectează, devine vizibil după 4s
  window.setTimeout(() => {
    items.forEach((el) => el.classList.add('is-in'));
  }, 4000);
}

/**
 * Lightbox accesibil, reutilizat de arhivă și de pagina fotografiei.
 * @param {Array<{src:string,title:string,caption:string,href?:string}>} items
 */
export function createLightbox(items) {
  const list = Array.isArray(items) ? items : [];
  let index = 0;
  let lastFocus = null;

  const el = document.createElement('div');
  el.className = 'lightbox';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Vizualizare fotografie');
  el.innerHTML = [
    '<div class="lightbox__bar">',
    '  <p class="lightbox__title" id="lb-title"></p>',
    '  <a class="btn btn--sm btn--ghost" id="lb-detail" href="#">Detalii</a>',
    '  <button class="icon-btn" type="button" id="lb-close" aria-label="Închide (Esc)">',
    '    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    '  </button>',
    '</div>',
    '<div class="lightbox__stage">',
    '  <button class="icon-btn lightbox__nav lightbox__nav--prev" type="button" id="lb-prev" aria-label="Fotografia anterioară">',
    '    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    '  </button>',
    '  <img id="lb-img" alt="">',
    '  <button class="icon-btn lightbox__nav lightbox__nav--next" type="button" id="lb-next" aria-label="Fotografia următoare">',
    '    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    '  </button>',
    '</div>',
    '<p class="lightbox__foot" id="lb-caption"></p>'
  ].join('');
  document.body.appendChild(el);

  const img = el.querySelector('#lb-img');
  const title = el.querySelector('#lb-title');
  const caption = el.querySelector('#lb-caption');
  const detail = el.querySelector('#lb-detail');

  function render() {
    const item = list[index];
    if (!item) return;
    img.src = item.src;
    img.alt = item.title || '';
    title.textContent = item.title || '';
    caption.textContent = item.caption || '';
    if (item.href) {
      detail.href = item.href;
      detail.hidden = false;
    } else {
      detail.hidden = true;
    }
    el.querySelector('#lb-prev').hidden = list.length < 2;
    el.querySelector('#lb-next').hidden = list.length < 2;
  }

  function open(i) {
    index = Math.max(0, Math.min(i, list.length - 1));
    lastFocus = document.activeElement;
    render();
    el.classList.add('is-open');
    document.body.classList.add('no-scroll');
    el.querySelector('#lb-close').focus();
  }

  function close() {
    el.classList.remove('is-open');
    document.body.classList.remove('no-scroll');
    img.removeAttribute('src');
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  function step(delta) {
    if (list.length < 2) return;
    index = (index + delta + list.length) % list.length;
    render();
  }

  el.querySelector('#lb-close').addEventListener('click', close);
  el.querySelector('#lb-prev').addEventListener('click', () => step(-1));
  el.querySelector('#lb-next').addEventListener('click', () => step(1));
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.classList.contains('lightbox__stage')) close();
  });

  document.addEventListener('keydown', (e) => {
    if (!el.classList.contains('is-open')) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  });

  return { open, close, element: el };
}

/* Pornire automată: navigarea mobilă și micro-animațiile se activează pe orice
   pagină care importă acest modul (modulele sunt „deferred", deci DOM-ul e gata). */
if (typeof document !== 'undefined') {
  initNav();
  initReveal();
}

