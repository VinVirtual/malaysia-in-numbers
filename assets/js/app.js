// Page behaviour: theme toggle, charts redrawn at their real width, a crosshair with a
// tooltip under the pointer, and keyboard reading of every value. The page is complete
// without this file; it only adds to it.
import { renderChart, layoutChart, nearestIndex } from './chart-core.js';
import { FORMATS, periodLabel } from './format.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function themeToggle() {
  const btn = document.querySelector('[data-theme-toggle]');
  if (!btn) return;
  const root = document.documentElement;
  const current = () => root.dataset.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const label = () => {
    const dark = current() === 'dark';
    btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    btn.setAttribute('aria-pressed', String(dark));
  };
  btn.hidden = false;
  label();
  btn.addEventListener('click', () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try {
      window.localStorage.setItem('mnum-theme', next);
    } catch (e) {
      /* storage blocked: the choice lasts for this page only */
    }
    label();
  });
}

function el(name, attrs = {}, ns = SVG_NS) {
  const e = document.createElementNS(ns, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function valuesAt(spec, i) {
  const f = FORMATS[spec.fmt];
  return spec.series.map((s) => ({ label: s.label, c: s.c, text: Number.isFinite(s.v[i]) ? f.value(s.v[i]) : 'no value' }));
}

class Chart {
  constructor(fig) {
    this.fig = fig;
    this.spec = JSON.parse(fig.dataset.chart);
    this.id = fig.dataset.chartId;
    this.plot = fig.querySelector('.plot');
    this.tip = fig.querySelector('.tip');
    this.readout = fig.querySelector('[data-readout]');
    this.interactive = this.spec.type !== 'hbar';
    this.index = null;
    this.width = 0;
    if (this.interactive) this.bind();
    new ResizeObserver(() => this.draw()).observe(this.plot);
    this.draw();
  }

  draw() {
    const width = Math.round(this.plot.clientWidth);
    const height = this.spec.type === 'hbar' ? 0 : Math.round(this.plot.clientHeight);
    if (!width || width === this.width) return;
    this.width = width;
    const tmp = document.createElement('template');
    // renderChart escapes every label it writes; the markup is this site's own.
    tmp.innerHTML = renderChart(this.spec, { width, height: height || 300, id: this.id });
    const svg = tmp.content.firstElementChild;
    const old = this.plot.querySelector('svg');
    if (old) old.replaceWith(svg);
    this.svg = svg;
    this.L = layoutChart(this.spec, width, height || 300);
    if (!this.fig.classList.contains('is-live')) {
      this.fig.classList.add('is-live');
      // Lines draw in once; later redraws (on resize) appear at once.
      window.setTimeout(() => this.fig.classList.add('is-settled'), 1400);
    }
    if (this.index !== null) this.show(this.index, false);
  }

  bind() {
    const n = this.spec.x.length;
    this.plot.addEventListener('pointermove', (ev) => {
      const box = this.svg.getBoundingClientRect();
      const px = ((ev.clientX - box.left) / box.width) * this.L.width;
      this.show(nearestIndex(this.L, n, px), false, ev.pointerType !== 'mouse');
    });
    this.plot.addEventListener('pointerleave', () => this.hide());
    this.plot.addEventListener('focus', () => {
      if (this.index === null) this.show(n - 1, true);
      else this.show(this.index, true);
    });
    this.plot.addEventListener('blur', () => this.hide());
    this.plot.addEventListener('keydown', (ev) => {
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: -1, ArrowUp: 1, PageDown: -12, PageUp: 12 }[ev.key];
      let i = this.index ?? n - 1;
      if (step) i = Math.max(0, Math.min(n - 1, i + step));
      else if (ev.key === 'Home') i = 0;
      else if (ev.key === 'End') i = n - 1;
      else if (ev.key === 'Escape') {
        this.hide();
        return;
      } else return;
      ev.preventDefault();
      this.show(i, true);
    });
  }

  show(i, announce, touch = false) {
    this.index = i;
    const L = this.L;
    const g = this.svg.querySelector('.cursor');
    if (!g) return;
    g.replaceChildren();
    const x = L.xs(i);
    if (L.kind === 'bar') {
      g.append(el('rect', { class: 'band', x: x - L.band / 2, y: L.pad.t, width: L.band, height: L.plotH }));
    } else {
      g.append(el('line', { class: 'rule', x1: x, x2: x, y1: L.pad.t, y2: L.pad.t + L.plotH }));
    }
    this.spec.series.forEach((s) => {
      const v = s.v[i];
      if (Number.isFinite(v) && L.kind !== 'bar') g.append(el('circle', { class: `dot s${s.c ?? 1}`, cx: x, cy: L.ys(v), r: 5 }));
    });
    const when = periodLabel(this.spec.x[i], this.spec.period, true);
    const vals = valuesAt(this.spec, i);
    if (this.tip) {
      const head = document.createElement('p');
      head.className = 'tip-when';
      head.textContent = this.spec.period === 'week' ? `Week from ${when}` : when;
      const list = document.createElement('ul');
      for (const v of vals) {
        const li = document.createElement('li');
        const key = document.createElement('span');
        key.className = `key s${v.c ?? 1}`;
        const name = document.createElement('span');
        name.className = 'tip-name';
        name.textContent = v.label;
        const val = document.createElement('span');
        val.className = 'tip-val';
        val.textContent = v.text;
        li.append(key, name, val);
        list.append(li);
      }
      this.tip.replaceChildren(head, list);
      this.tip.hidden = false;
      const scale = this.svg.getBoundingClientRect().width / L.width || 1;
      const tw = this.tip.offsetWidth;
      const left = Math.max(0, Math.min(this.plot.clientWidth - tw, x * scale + (x * scale > this.plot.clientWidth / 2 ? -tw - 14 : 14)));
      this.tip.style.transform = `translate(${Math.round(left)}px, ${touch ? -8 : 8}px)`;
    }
    if (announce && this.readout) this.readout.textContent = `${this.spec.period === 'week' ? `Week from ${when}` : when}: ${vals.map((v) => `${v.label} ${v.text}`).join('; ')}`;
  }

  hide() {
    this.svg?.querySelector('.cursor')?.replaceChildren();
    if (this.tip) this.tip.hidden = true;
  }
}

function charts() {
  for (const fig of document.querySelectorAll('figure[data-chart]')) {
    try {
      new Chart(fig);
    } catch (err) {
      // The chart drawn at build time stays; nothing else depends on this one.
      fig.classList.add('is-static', 'is-settled');
      fig.dataset.chartError = String(err && err.message ? err.message : err).slice(0, 200);
    }
  }
}

themeToggle();
charts();
document.documentElement.classList.add('js');
