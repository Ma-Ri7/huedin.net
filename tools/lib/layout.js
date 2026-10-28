/**
 * tools/lib/layout.js — șablonul comun al paginilor generate.
 * Design dark-premium, semantic, accesibil; fără dependențe externe de fonturi.
 */
import { escapeHtml, escapeAttr } from '../../assets/js/search-core.js';

export const SITE = {
  url: 'https://huedin.net',
  name: 'Huedin.net',
  subtitle: 'Arhivă fotografică istorică',
  defaultDescription: 'Colecție de fotografii istorice, colorizate, ale orașului Huedin și zonelor adiacente.'
};

export function icon(name, size) {
  const s = size || 18;
  const paths = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    archive: '<path d="M3 7h18v13H3z"/><path d="M3 3h18v4H3z"/><path d="M9 12h6"/>',
    map: '<path d="M9 4l6 2 6-2v16l-6 2-6-2-6 2V6z"/><path d="M9 4v16M15 6v16"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    arrowLeft: '<path d="M15 5l-7 7 7 7"/>',
    arrowRight: '<path d="M9 5l7 7-7 7"/>',
    home: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>',
    mail: '<path d="M3 6h18v12H3z"/><path d="M3 7l9 6 9-6"/>',
    phone: '<path d="M5 4h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>',
    pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
  };
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" `
    + `stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
}

const SOCIAL_ICONS = {
  twitter: '<path d="M4.5 4.5l15 15M19.5 4.5l-15 15"/>',
  facebook: '<path d="M15 4h-1.6A3.4 3.4 0 0 0 10 7.4V10H8v3h2v7h3v-7h2.2l.4-3H13V7.6c0-.4.3-.6.6-.6H15z"/>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.8"/><path d="M17.2 6.9h.01"/>'
};

export function socialLinks(socials) {
  return (socials || []).map((s) => {
    const svg = SOCIAL_ICONS[s.network] ? SOCIAL_ICONS[s.network] : icon('external', 17);
    return `<a class="icon-btn" href="${escapeAttr(s.url)}" rel="noopener" target="_blank" `
      + `aria-label="${escapeAttr(s.network)}" title="${escapeAttr(s.network)}">`
      + `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" `
      + `stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${svg}</svg></a>`;
  }).join('');
}

const NAV = [
  { key: 'acasa', label: 'Acasă', href: 'index.html' },
  { key: 'arhiva', label: 'Arhivă foto', href: 'arhiva.html' },
  { key: 'harta', label: 'Hartă', href: 'harta.html' },
  { key: 'despre', label: 'Despre', href: 'despre.html' },
  { key: 'contact', label: 'Contact', href: 'index.html#contact' }
];

function navHtml(root, active) {
  return NAV.map((item) => {
    const current = item.key === active ? ' aria-current="page"' : '';
    return `<li><a href="${root}${item.href}"${current}>${item.label}</a></li>`;
  }).join('');
}

function headerHtml(root, active, content) {
  return [
    `<a class="skip-link" href="#main">Sari la conținutul principal</a>`,
    `<header class="site-header">`,
    `  <div class="wrap site-header__inner">`,
    `    <a class="brand" href="${root}index.html">`,
    `      <span class="brand__mark" aria-hidden="true">H</span>`,
    `      <span>${SITE.name}<span class="brand__sub">${SITE.subtitle}</span></span>`,
    `    </a>`,
    `    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Deschide meniul">`,
    `      <span></span><span></span><span></span>`,
    `    </button>`,
    `    <nav class="site-nav" id="site-nav" aria-label="Navigare principală">`,
    `      <ul class="site-nav__list">${navHtml(root, active)}</ul>`,
    `    </nav>`,
    `    <div class="header-actions">`,
    `      <a class="icon-btn" href="${root}arhiva.html" aria-label="Caută în arhivă" title="Caută în arhivă">${icon('search')}</a>`,
    `    </div>`,
    `  </div>`,
    `</header>`
  ].join('\n');
}

function footerHtml(root, content) {
  const socials = socialLinks(content.socials);
  const contact = content.infoBoxes || [];
  const email = content.email || '';
  const phone = content.phoneDisplay || content.phone || '';
  const address = (contact.find((i) => /adres/i.test(i.label)) || {}).value || '';

  return [
    `<footer class="site-footer">`,
    `  <div class="wrap">`,
    `    <div class="footer-grid">`,
    `      <div>`,
    `        <a class="brand" href="${root}index.html">`,
    `          <span class="brand__mark" aria-hidden="true">H</span>`,
    `          <span>${SITE.name}<span class="brand__sub">${SITE.subtitle}</span></span>`,
    `        </a>`,
    `        <p class="muted" style="margin-top:.8rem">${escapeHtml(content.tagline || '')}</p>`,
    socials ? `        <div class="social-row">${socials}</div>` : '',
    `      </div>`,
    `      <div>`,
    `        <h3>Navigare</h3>`,
    `        <ul class="footer-list">`,
    `          <li><a href="${root}arhiva.html">Arhivă foto</a></li>`,
    `          <li><a href="${root}harta.html">Hartă</a></li>`,
    `          <li><a href="${root}despre.html">Despre proiect</a></li>`,
    `          <li><a href="${root}index.html#contact">Contact</a></li>`,
    `        </ul>`,
    `      </div>`,
    `      <div>`,
    `        <h3>Contact</h3>`,
    `        <ul class="footer-list">`,
    address ? `          <li>${escapeHtml(address)}</li>` : '',
    email ? `          <li><a href="mailto:${escapeAttr(email)}">${escapeHtml(email)}</a></li>` : '',
    phone ? `          <li><a href="tel:${escapeAttr(phone.replace(/\s/g, ''))}">${escapeHtml(phone)}</a></li>` : '',
    `        </ul>`,
    `      </div>`,
    `    </div>`,
    `    <div class="footer-note">`,
    `      <p>${escapeHtml(content.creditsText || '')}</p>`,
    `      <p>Arhivă statică, fără baze de date și fără urmărire. Hărți: OpenStreetMap.</p>`,
    `    </div>`,
    `    <div class="footer-colophon">`,
    `      <span>${SITE.name} — arhivă fotografică</span>`,
    `      <span>Hărți: OpenStreetMap</span>`,
    `      <span>Fără baze de date · fără urmărire</span>`,
    `    </div>`,
    `  </div>`,
    `</footer>`
  ].filter(Boolean).join('\n');
}

/**
 * Construiește o pagină completă.
 * @param {object} o
 * @param {string} o.title      titlul documentului (fără sufixul site-ului)
 * @param {string} o.description meta description
 * @param {string} o.canonical   cale relativă ('arhiva.html' sau 'foto/x.html')
 * @param {string} o.content     HTML-ul din <main>
 * @param {string} o.active      cheia navigării active
 * @param {string} o.root        prefix relativ către rădăcină ('', '../')
 * @param {string} [o.image]     URL absolut pentru Open Graph
 * @param {string} [o.head]      HTML suplimentar în <head>
 * @param {string} [o.scripts]   HTML suplimentar de scripturi
 * @param {string} [o.bodyClass]
 */
export function page(o) {
  const root = o.root || '';
  const title = o.title ? o.title + ' · ' + SITE.name : SITE.name + ' · ' + SITE.subtitle;
  const description = o.description || SITE.defaultDescription;
  const canonical = SITE.url + '/' + (o.canonical || 'index.html').replace(/^\/+/, '');
  const ogImage = o.image ? SITE.url + '/' + o.image.replace(/^\/+/, '') : SITE.url + '/assets/img/Logo-banner.png';
  const ogType = o.ogType || 'website';

  return `<!DOCTYPE html>
<html lang="ro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeAttr(description)}">
<link rel="canonical" href="${escapeAttr(canonical)}">
<meta name="theme-color" content="#0a0a0c">
<meta property="og:type" content="${escapeAttr(ogType)}">
<meta property="og:site_name" content="${escapeAttr(SITE.name)}">
<meta property="og:title" content="${escapeAttr(title)}">
<meta property="og:description" content="${escapeAttr(description)}">
<meta property="og:url" content="${escapeAttr(canonical)}">
<meta property="og:image" content="${escapeAttr(ogImage)}">
<meta property="og:locale" content="ro_RO">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${root}assets/img/favicon.png">
<link rel="apple-touch-icon" href="${root}assets/img/apple-touch-icon.png">
<link rel="stylesheet" href="${root}assets/css/site.css">
${o.head || ''}
</head>
<body${o.bodyClass ? ` class="${escapeAttr(o.bodyClass)}"` : ''}>
${headerHtml(root, o.active, o.site)}
<main id="main">
${o.content || ''}
</main>
${footerHtml(root, o.site)}
${o.scripts || ''}
</body>
</html>
`;
}
