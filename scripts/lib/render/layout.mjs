// The page shell: strict CSP, no inline script or style, relative links so the site works
// under any base path.
import { html, localHref } from '../html.mjs';
import { SITE_TITLE, SITE_TITLE_MS, LICENCE, REPO_URL } from '../config.mjs';
import { TOPICS } from '../topics.mjs';

export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "manifest-src 'none'",
  "object-src 'none'",
].join('; ');

const MARK = html`<svg class="mark" viewBox="0 0 28 28" aria-hidden="true" focusable="false"><rect class="mark-bg" x="0" y="0" width="28" height="28" rx="6"/><path class="mark-bar" d="M6 7h16M6 11h12M6 15h14M6 19h8M6 23h11"/></svg>`;

// Build time in Malaysia (UTC+8, no daylight saving), for the "Updated" stamps.
export function myt(date) {
  const d = new Date(date.getTime() + 8 * 3_600_000);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const pad = (n) => String(n).padStart(2, '0');
  return {
    iso: d.toISOString().slice(0, 10),
    long: `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
    short: `${d.getUTCDate()} ${months[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  };
}

export function page({ title, description, base, active, body, canonical, builtAt }) {
  const b = (p) => localHref(`${base}${p}`);
  const nav = [
    ['home', 'index.html', 'Indicators'],
    ['method', 'method/index.html', 'Method'],
    ['limits', 'limits/index.html', 'Limits'],
    ['log', 'log/index.html', 'Release log'],
  ];
  const built = myt(builtAt);
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="color-scheme" content="light dark">
<title>${title}</title>
<meta name="description" content="${description}">
${canonical ? html`<link rel="canonical" href="${canonical}">` : ''}
<link rel="icon" href="${b('assets/mark.svg')}" type="image/svg+xml">
<link rel="preload" href="${b('assets/fonts/bricolage-grotesque-latin-opsz-normal.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${b('assets/style.css')}">
<link rel="alternate" type="application/feed+json" title="${SITE_TITLE}: latest figures (JSON Feed)" href="${b('feed.json')}">
<script src="${b('assets/js/theme.js')}"></script>
<script type="module" src="${b('assets/js/app.js')}"></script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="masthead">
  <a class="wordmark" href="${b('index.html')}">
    ${MARK}
    <span class="wm-text"><span class="wm-en">Malaysia in Numbers</span><span class="wm-ms" lang="ms">${SITE_TITLE_MS}</span></span>
  </a>
  <nav aria-label="Main">
    <ul>
      ${nav.map(([id, p, label]) => html`<li><a href="${b(p)}"${id === active ? html` aria-current="page"` : ''}>${label}</a></li>`)}
    </ul>
  </nav>
  <button class="theme-toggle" type="button" data-theme-toggle aria-label="Switch to dark theme" hidden>
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8"/><path d="M12 4 A8 8 0 0 0 12 20 Z" class="half"/></svg>
  </button>
</header>
<nav class="topic-strip" aria-label="Indicators">
  <ul>
    ${TOPICS.map((t) => html`<li><a href="${b(`${t.slug}/index.html`)}"${active === t.slug ? html` aria-current="page"` : ''}>${t.title}</a></li>`)}
  </ul>
</nav>
<main id="main" tabindex="-1">
${body}
</main>
<footer class="colophon">
  <div class="colophon-grid">
    <p class="colophon-lead">An independent, automatically updated view of Malaysia’s official open data. It is not a government website and is not affiliated with any of the agencies whose data it shows.</p>
    <p>Data: the public API of <a href="https://data.gov.my/">data.gov.my</a> and <a href="https://open.dosm.gov.my/">OpenDOSM</a>, from the Ministry of Finance, the Department of Statistics Malaysia, Bank Negara Malaysia, TNB, SESB, Sarawak Energy and the Energy Commission, used under <a href="${LICENCE.url}">${LICENCE.name}</a>. Figures are shown as published; charts and wording are this site’s.</p>
    <p>Page built ${built.short}, ${built.time} Malaysia time. <a href="${REPO_URL}">Source code</a>, MIT licence. Fonts: Bricolage Grotesque and IBM Plex Mono, SIL Open Font License 1.1 (<a href="${b('assets/fonts/LICENSE-Bricolage-Grotesque.txt')}">text</a>, <a href="${b('assets/fonts/LICENSE-IBM-Plex-Mono.txt')}">text</a>). Latest figures as a <a href="${b('feed.json')}">JSON Feed</a> or <a href="${b('latest.json')}">plain JSON</a>.</p>
  </div>
</footer>
</body>
</html>
`;
}
