/* global document, getComputedStyle, Node, NodeFilter */
// Figma frame extractor. Renders each screen in headless Chromium with the sample data and
// writes a compact layer tree per screen (boxes, text, icons and HDS components with their
// variant props, colours resolved to HDS token names) for building 1:1 Figma frames from the
// HDS library. Pure read: it changes nothing in the app.
//
//   node scripts/figma-extract.mjs --url=http://localhost:4180 --out=<dir> [--only=pipeline]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const i = a.indexOf('=');
      return i < 0 ? [a.slice(2), 'true'] : [a.slice(2, i), a.slice(i + 1)];
    }),
);
const BASE = args.url || 'http://localhost:4180';
const OUT = args.out || 'figma-frames';
const WIDTHS = (args.widths || '1440,390').split(',').map(Number);
const THEME = args.theme || 'light';
const CHROMIUM =
  process.env.PW_CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const wait = (p, ms = 350) => p.waitForTimeout(ms);
const click = async (p, role, name) => {
  const el =
    role === 'first-job'
      ? p.locator('[role="table"] a[href^="#/queue/"], article a[href^="#/queue/"]').first()
      : p.getByRole(role, { name }).first();
  if (!(await el.isVisible().catch(() => false))) return false;
  await el.click();
  await wait(p);
  return true;
};
const go = async (p, hash) => {
  await p.evaluate((h) => (location.hash = h), hash);
  await wait(p, 600);
};

// Each screen: [name, setup, overlay?]. Overlays are captured at viewport height.
const SCREENS = [
  ['Companies', (p) => go(p, '#/discover')],
  ['Companies – Apply now', (p) => go(p, '#/discover/apply')],
  ['Companies – Titles', (p) => go(p, '#/discover/titles')],
  ['Companies – Live postings', (p) => go(p, '#/discover/live')],
  ['Companies – Find boards', (p) => go(p, '#/discover/boards')],
  ['Pipeline', (p) => go(p, '#/queue')],
  [
    'Job – Overview',
    async (p) => {
      await go(p, '#/queue');
      await click(p, 'first-job');
    },
  ],
  [
    'Job – Screening',
    async (p) => {
      await go(p, '#/queue');
      await click(p, 'first-job');
      await click(p, 'tab', /^Screening/);
    },
  ],
  [
    'Job – Interviews',
    async (p) => {
      await go(p, '#/queue');
      await click(p, 'first-job');
      await click(p, 'tab', /^Interviews/);
    },
  ],
  [
    'Job – To-dos',
    async (p) => {
      await go(p, '#/queue');
      await click(p, 'first-job');
      await click(p, 'tab', /^To-dos/);
    },
  ],
  [
    'Apply mode',
    async (p) => {
      await go(p, '#/queue');
      await click(p, 'button', /^Start applying$/);
    },
  ],
  ['Templates', (p) => go(p, '#/copy-deck')],
  [
    'Template detail',
    async (p) => {
      await go(p, '#/copy-deck');
      await click(p, 'link', /^Cover letter/);
    },
  ],
  [
    'Menu',
    async (p) => {
      await go(p, '#/queue');
      await click(p, 'button', /^Menu$/);
    },
    true,
  ],
  [
    'Add job dialog',
    async (p) => {
      await go(p, '#/queue');
      await click(p, 'button', /^Add job$/);
    },
    true,
  ],
  [
    'Sign in dialog',
    async (p) => {
      await go(p, '#/queue');
      await click(p, 'button', /^Menu$/);
      await click(p, 'menuitem', /^Sign in/);
    },
    true,
  ],
  [
    'Manage track dialog',
    async (p) => {
      await go(p, '#/discover/apply');
      await click(p, 'button', /^Manage track$/);
    },
    true,
  ],
];
const FIRST_RUN = [
  ['First run – Track', async () => {}],
  [
    'First run – Location',
    async (p) => {
      await packBox(p).click();
      await click(p, 'button', /^Continue$/);
    },
  ],
  [
    'First run – First job',
    async (p) => {
      await packBox(p).click();
      await click(p, 'button', /^Continue$/);
      await click(p, 'button', /^Continue$/);
    },
  ],
];
const packBox = (p) =>
  p.getByRole('group', { name: 'Starter tracks' }).getByRole('checkbox').first();

async function seed(p) {
  await go(p, '#/queue');
  await click(p, 'button', /Try with sample data/);
  await go(p, '#/discover');
  await click(p, 'button', /^Choose a track$/);
  if (
    await packBox(p)
      .isVisible()
      .catch(() => false)
  ) {
    await packBox(p).click();
    await click(p, 'button', /^Continue$/);
    await click(p, 'button', /^Continue$/);
    await click(p, 'button', /^Finish$/);
  }
}

// ---- in-page extraction ----------------------------------------------------------------
function extract(overlay) {
  const TOKENS = [
    [
      'content',
      [
        'primary',
        'secondary',
        'tertiary',
        'disabled',
        'inverse',
        'accent',
        'onAccent',
        'success',
        'warning',
        'danger',
      ],
    ],
    [
      'surface',
      [
        'page',
        'raised',
        'overlay',
        'scrim',
        'inverse',
        'accent',
        'accentSubtle',
        'hover',
        'pressed',
        'selected',
        'muted',
        'sunken',
      ],
    ],
    ['border', ['default', 'interactive', 'subtle', 'strong', 'accent', 'success', 'warning']],
    [
      'feedback',
      [
        'error',
        'success',
        'warning',
        'info',
        'inProgress',
        'bg/error',
        'bg/success',
        'bg/warning',
        'bg/info',
        'bg/inProgress',
      ],
    ],
  ];
  const probe = document.createElement('div');
  document.body.appendChild(probe);
  const tokenRgb = {};
  for (const [grp, names] of TOKENS)
    for (const n of names) {
      probe.style.color = '';
      probe.style.color = `var(--semantic-color-${grp}-${n.replace('/', '-')})`;
      const c = getComputedStyle(probe).color;
      if (c && probe.style.color) (tokenRgb[c] ||= []).push(`color/${grp}/${n}`);
    }
  probe.remove();
  const PREF = {
    text: ['content', 'feedback', 'border', 'surface'],
    fill: ['surface', 'feedback', 'content', 'border'],
    stroke: ['border', 'feedback', 'content', 'surface'],
  };
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = '1'] = m[1].split(/[ ,/]+/).filter(Boolean);
    return { r: +r, g: +g, b: +b, a: +a };
  };
  const col = (c, use) => {
    const v = parse(c);
    if (!v || v.a === 0) return null;
    const opaque = `rgb(${v.r}, ${v.g}, ${v.b})`;
    const names = tokenRgb[opaque];
    let tok = null;
    if (names) {
      for (const g of PREF[use]) {
        const hit = names.find((n) => n.startsWith(`color/${g}/`));
        if (hit) {
          tok = hit;
          break;
        }
      }
      tok ||= names[0];
    }
    const hex = '#' + [v.r, v.g, v.b].map((x) => x.toString(16).padStart(2, '0')).join('');
    const o = { c: tok || hex };
    if (v.a < 1) o.a = +v.a.toFixed(3);
    return o;
  };

  const root = document.documentElement;
  const W = root.clientWidth;
  const H = overlay
    ? window.innerHeight
    : Math.max(document.scrollingElement.scrollHeight, window.innerHeight);
  const rnd = (n) => Math.round(n * 10) / 10;
  const visible = (el, cs) =>
    cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.01;
  const typeOf = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const m = (e.getAttribute('class') || '').match(/hds-type-([a-zA-Z]+)/);
      if (m) return m[1];
    }
    return null;
  };
  const lucide = (svg) => {
    const m = (svg.getAttribute('class') || '').match(/lucide-([a-z0-9-]+)/g);
    return m
      ? m
          .filter((x) => x !== 'lucide-icon')
          .map((x) => x.slice(7))
          .pop()
      : null;
  };
  const textOf = (el) => el.innerText.replace(/\s+/g, ' ').trim();
  const labelName = (el) =>
    el.getAttribute('aria-label') ||
    el.getAttribute('data-hds-component') ||
    el.getAttribute('role') ||
    el.tagName.toLowerCase();

  const fontOf = (cs) => ({
    s: parseFloat(cs.fontSize),
    w: +cs.fontWeight,
    lh: cs.lineHeight === 'normal' ? null : parseFloat(cs.lineHeight),
    f: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
    ...(cs.fontStyle === 'italic' ? { i: 1 } : {}),
    ...(cs.textTransform === 'uppercase' ? { u: 1 } : {}),
    ...(parseFloat(cs.letterSpacing) ? { ls: parseFloat(cs.letterSpacing) } : {}),
  });
  const runStyle = (el) => {
    const cs = getComputedStyle(el);
    const o = { ...fontOf(cs), col: col(cs.color, 'text') };
    if (cs.textDecorationLine.includes('underline')) o.ul = 1;
    if (cs.textDecorationLine.includes('line-through')) o.st = 1;
    return o;
  };

  // A block that holds only text and inline text elements becomes one text layer with runs.
  const INLINE_OK = new Set([
    'A',
    'B',
    'STRONG',
    'EM',
    'I',
    'SPAN',
    'CODE',
    'KBD',
    'SMALL',
    'MARK',
    'ABBR',
    'TIME',
    'LABEL',
    'BR',
  ]);
  const isInlineText = (el) => {
    for (const c of el.childNodes) {
      if (c.nodeType === Node.TEXT_NODE) continue;
      if (c.nodeType !== Node.ELEMENT_NODE) continue;
      const cs = getComputedStyle(c);
      if (
        !INLINE_OK.has(c.tagName) ||
        !cs.display.startsWith('inline') ||
        cs.display === 'inline-flex' ||
        cs.display === 'inline-block'
      )
        return false;
      if (
        col(cs.backgroundColor, 'fill') ||
        parseFloat(cs.borderTopWidth) ||
        parseFloat(cs.borderBottomWidth)
      )
        return false;
      if (!isInlineText(c)) return false;
    }
    return true;
  };
  const runs = (el, out = []) => {
    for (const c of el.childNodes) {
      if (c.nodeType === Node.TEXT_NODE) {
        const t = c.textContent.replace(/\s+/g, ' ');
        if (t) out.push([t, runStyle(el)]);
      } else if (c.tagName === 'BR') out.push(['\n', runStyle(el)]);
      else if (c.nodeType === Node.ELEMENT_NODE && getComputedStyle(c).display !== 'none')
        runs(c, out);
    }
    return out;
  };

  const textNode = (el, box) => {
    let rs = runs(el);
    if (!rs.length) return null;
    // trim outer whitespace, merge equal neighbours
    rs[0][0] = rs[0][0].replace(/^\s+/, '');
    rs[rs.length - 1][0] = rs[rs.length - 1][0].replace(/\s+$/, '');
    rs = rs.filter((r) => r[0]);
    const merged = [];
    for (const r of rs) {
      const last = merged[merged.length - 1];
      if (last && JSON.stringify(last[1]) === JSON.stringify(r[1])) last[0] += r[0];
      else merged.push([r[0], r[1]]);
    }
    if (
      !merged.length ||
      !merged
        .map((r) => r[0])
        .join('')
        .trim()
    )
      return null;
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    const rr = range.getBoundingClientRect();
    if (!rr.width || !rr.height) return null;
    const lines = new Set(rects.map((r) => Math.round(r.top))).size;
    const cs = getComputedStyle(el);
    const n = {
      k: 'text',
      x: rnd(rr.left - box.x),
      y: rnd(rr.top - box.y),
      w: rnd(rr.width),
      h: rnd(rr.height),
      ty: typeOf(el),
      r: merged,
    };
    if (lines > 1) {
      n.wrap = 1;
      const er = el.getBoundingClientRect();
      const pl = parseFloat(cs.paddingLeft),
        pr = parseFloat(cs.paddingRight);
      n.x = rnd(er.left + pl - box.x);
      n.w = rnd(er.width - pl - pr);
    }
    if (cs.textAlign === 'center') n.al = 'C';
    else if (cs.textAlign === 'right' || cs.textAlign === 'end') n.al = 'R';
    if (cs.textOverflow === 'ellipsis' && cs.overflow === 'hidden') n.ell = 1;
    return n;
  };

  const strokes = (cs) => {
    const sides = ['Top', 'Right', 'Bottom', 'Left'].map((s) => ({
      w: parseFloat(cs[`border${s}Width`]) || 0,
      c: cs[`border${s}Style`] === 'none' ? null : col(cs[`border${s}Color`], 'stroke'),
    }));
    const on = sides.filter((s) => s.w && s.c);
    if (!on.length) return null;
    const c = on[0].c;
    const ws = sides.map((s) => (s.w && s.c ? s.w : 0));
    return { c, ws: ws.every((w) => w === ws[0]) ? ws[0] : ws };
  };

  const shadow = (cs) => {
    if (!cs.boxShadow || cs.boxShadow === 'none') return null;
    const out = [];
    // split on commas outside parens
    const parts = cs.boxShadow.split(/,(?![^(]*\))/);
    for (const p of parts) {
      const c = p.match(/rgba?\([^)]+\)/);
      const nums = p
        .replace(/rgba?\([^)]+\)/, '')
        .trim()
        .split(/\s+/)
        .filter((t) => /px$/.test(t))
        .map(parseFloat);
      if (!c || nums.length < 2) continue;
      const cv = parse(c[0]);
      if (!cv || cv.a === 0) continue;
      const [x, y, b = 0, s = 0] = nums;
      if (!x && !y && !b && !s) continue;
      out.push({ x, y, b, s, c: [cv.r, cv.g, cv.b, cv.a], in: p.includes('inset') ? 1 : 0 });
    }
    return out.length ? out : null;
  };

  const BTN_VARIANT = {
    primary: 'Primary',
    secondary: 'Secondary',
    tertiary: 'Tertiary',
    ghost: 'Tertiary',
    link: 'Tertiary',
  };
  const svgOf = (el) => {
    const cs = getComputedStyle(el);
    const clone = el.cloneNode(true);
    const color = cs.color;
    let s = clone.outerHTML.replace(/currentColor/g, color);
    const r = el.getBoundingClientRect();
    if (!/\swidth=/.test(s.slice(0, s.indexOf('>'))))
      s = s.replace('<svg', `<svg width="${r.width}" height="${r.height}"`);
    return s;
  };

  const walk = (el, box, out) => {
    const cs = getComputedStyle(el);
    if (!visible(el, cs)) return;
    if (cs.display === 'contents') {
      for (const c of el.children) walk(c, box, out);
      return;
    }
    const r = el.getBoundingClientRect();
    if ((r.width < 0.5 || r.height < 0.5) && cs.overflow !== 'visible') return;
    // skip visually hidden (sr-only)
    if (r.width <= 1 && r.height <= 1) return;
    if (cs.clip === 'rect(0px, 0px, 0px, 0px)' || cs.clipPath === 'inset(50%)') return;
    const geo = {
      x: rnd(r.left - box.x),
      y: rnd(r.top - box.y),
      w: rnd(r.width),
      h: rnd(r.height),
    };
    const tag = el.tagName;

    if (tag === 'svg' || tag === 'SVG') {
      out.push({
        k: 'icon',
        ...geo,
        ic: lucide(el),
        col: col(cs.color, 'text') || col(cs.stroke, 'text'),
        svg: svgOf(el),
      });
      return;
    }
    if (tag === 'IMG') {
      out.push({ k: 'img', ...geo, n: el.alt || 'image' });
      return;
    }
    const variant = el.getAttribute('data-variant');
    if ((tag === 'BUTTON' || tag === 'A') && variant && BTN_VARIANT[variant]) {
      const svgs = [...el.querySelectorAll('svg')];
      const label = textOf(el);
      const first = el.firstElementChild;
      const lead =
        svgs.length && first && (first.tagName === 'svg' || first.contains(svgs[0])) && label
          ? lucide(svgs[0])
          : null;
      const last = el.lastElementChild;
      const trail =
        svgs.length && last && last.tagName === 'svg' && label && svgs[svgs.length - 1] !== svgs[0]
          ? lucide(svgs[svgs.length - 1])
          : label && svgs.length && !lead
            ? lucide(svgs[svgs.length - 1])
            : null;
      const h = r.height;
      out.push({
        k: 'button',
        ...geo,
        n: el.getAttribute('aria-label') || label,
        v: BTN_VARIANT[variant],
        tone:
          el.getAttribute('data-tone') ||
          (/(bg|text)-(destructive|danger|feedback-error)/.test(el.className)
            ? 'danger'
            : 'neutral'),
        sz: el.getAttribute('data-size') || (h <= 34 ? 'sm' : h <= 44 ? 'md' : 'lg'),
        lb: label,
        io: label ? 0 : 1,
        li: lead,
        ti: trail,
        ic: !label && svgs.length ? lucide(svgs[0]) : undefined,
        dis: el.disabled ? 1 : 0,
        svgs: svgs.map(svgOf),
      });
      return;
    }
    if (tag === 'SPAN' && el.hasAttribute('data-tone') && /component-badge/.test(el.className)) {
      out.push({
        k: 'badge',
        ...geo,
        tone: el.getAttribute('data-tone') || 'neutral',
        lb: textOf(el),
      });
      return;
    }
    if (el.getAttribute('role') === 'tab' && !el.closest('[role=radiogroup]')) {
      out.push({
        k: 'tab',
        ...geo,
        lb: textOf(el),
        on: el.getAttribute('aria-selected') === 'true' ? 1 : 0,
      });
      return;
    }
    if (
      (tag === 'INPUT' &&
        /^(text|search|email|url|tel|number|password|date|time)$/.test(el.type)) ||
      tag === 'TEXTAREA'
    ) {
      const val = el.value || el.placeholder || '';
      out.push({
        k: tag === 'TEXTAREA' ? 'textarea' : 'input',
        ...geo,
        n: el.getAttribute('aria-label') || el.name || 'field',
        sz: el.getAttribute('data-size') || (r.height <= 34 ? 'sm' : r.height <= 44 ? 'md' : 'lg'),
        val,
        ph: el.value ? 0 : 1,
        pl: parseFloat(cs.paddingLeft),
        fill: col(cs.backgroundColor, 'fill'),
        st: strokes(cs),
        rad: parseFloat(cs.borderTopLeftRadius) || 0,
        font: runStyle(el),
        ty: typeOf(el),
      });
      return;
    }

    const fill = col(cs.backgroundColor, 'fill');
    const st = strokes(cs);
    const sh = shadow(cs);
    const rad = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map(
      (c) => parseFloat(cs[`border${c}Radius`]) || 0,
    );
    const isFrame =
      fill ||
      st ||
      sh ||
      el.hasAttribute('data-hds-component') ||
      /^(HEADER|NAV|MAIN|SECTION|ARTICLE|FORM|TABLE|THEAD|TBODY|TR|UL|OL|LI|ASIDE|FOOTER|DIALOG)$/.test(
        tag,
      ) ||
      /^(dialog|alertdialog|menu|listbox|tablist|tabpanel|table|row|group|radiogroup|region|navigation|status)$/.test(
        el.getAttribute('role') || '',
      );
    const clip =
      cs.overflow === 'hidden' ||
      cs.overflowX === 'hidden' ||
      cs.overflowX === 'auto' ||
      cs.overflowX === 'scroll';

    let node = null,
      kids = out,
      inner = box;
    if (isFrame && el !== document.body) {
      node = { k: 'frame', n: labelName(el), ...geo, c: [] };
      if (fill) node.fill = fill;
      if (st) node.st = st;
      if (sh) node.sh = sh;
      if (rad.some(Boolean)) node.rad = rad.every((x) => x === rad[0]) ? rad[0] : rad;
      if (clip && el.scrollWidth > el.clientWidth + 2) node.clip = 1;
      if (+cs.opacity < 1) node.op = +cs.opacity;
      out.push(node);
      kids = node.c;
      inner = { x: r.left, y: r.top };
    }
    if (isInlineText(el) && el.childNodes.length) {
      const t = textNode(el, inner);
      if (t) kids.push(t);
      if (node && !node.c.length && !node.fill && !node.st && !node.sh) {
        // a bare semantic wrapper around one text: keep the text, drop the frame
        out.pop();
        if (t) out.push({ ...t, x: rnd(t.x + node.x), y: rnd(t.y + node.y) });
      }
      return;
    }
    // mixed content: wrap loose text nodes
    for (const c of el.childNodes) {
      if (c.nodeType === Node.TEXT_NODE && c.textContent.trim()) {
        const range = document.createRange();
        range.selectNodeContents(c);
        const rr = range.getBoundingClientRect();
        if (rr.width && rr.height)
          kids.push({
            k: 'text',
            x: rnd(rr.left - inner.x),
            y: rnd(rr.top - inner.y),
            w: rnd(rr.width),
            h: rnd(rr.height),
            ty: typeOf(el),
            r: [[c.textContent.replace(/\s+/g, ' ').trim(), runStyle(el)]],
          });
      } else if (c.nodeType === Node.ELEMENT_NODE) walk(c, inner, kids);
    }
    if (node && !node.c.length && !node.fill && !node.st && !node.sh) out.pop();
  };

  const tree = [];
  const bodyCs = getComputedStyle(document.body);
  walk(document.body, { x: 0, y: 0 }, tree);
  return {
    w: W,
    h: H,
    bg: col(bodyCs.backgroundColor, 'fill') || col(getComputedStyle(root).backgroundColor, 'fill'),
    c: tree,
  };
}

// ---- driver -------------------------------------------------------------------------------
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROMIUM });
const only = args.only ? new RegExp(args.only, 'i') : null;
const manifest = [];
for (const width of WIDTHS) {
  const mk = async () => {
    const ctx = await browser.newContext({
      viewport: { width, height: width > 600 ? 900 : 844 },
      colorScheme: THEME,
      reducedMotion: 'reduce',
    });
    await ctx.addInitScript(() => {
      const kill = () => {
        const st = document.createElement('style');
        st.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
        document.head.appendChild(st);
      };
      if (document.head) kill();
      else document.addEventListener('DOMContentLoaded', kill);
    });
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem('rjb_color_mode', t);
      } catch {
        /* */
      }
    }, THEME);
    const p = await ctx.newPage();
    await p.goto(BASE + '/#/discover');
    await p.evaluate(() => document.fonts.ready);
    await wait(p, 600);
    return { ctx, p };
  };
  // first run, fresh each
  for (const [name, setup] of FIRST_RUN) {
    if (only && !only.test(name)) continue;
    const { ctx, p } = await mk();
    await setup(p);
    await wait(p, 400);
    const data = await p.evaluate(extract, false);
    const file = `${width}-${slug(name)}.json`;
    writeFileSync(join(OUT, file), JSON.stringify(data));
    manifest.push({ name, width, file, h: data.h });
    await ctx.close();
  }
  const { ctx, p } = await mk();
  await seed(p);
  for (const [name, setup, overlay] of SCREENS) {
    if (only && !only.test(name)) continue;
    await p.keyboard.press('Escape').catch(() => {});
    await p.keyboard.press('Escape').catch(() => {});
    await p.evaluate(() => window.scrollTo(0, 0));
    await setup(p);
    await p.evaluate(() => window.scrollTo(0, 0));
    await wait(p, 500);
    const data = await p.evaluate(extract, !!overlay);
    const file = `${width}-${slug(name)}.json`;
    writeFileSync(join(OUT, file), JSON.stringify(data));
    await p.screenshot({ path: join(OUT, `${width}-${slug(name)}.png`), fullPage: !overlay });
    manifest.push({ name, width, file, h: data.h });
    console.log(width, name, data.h, JSON.stringify(data).length);
  }
  await ctx.close();
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
await browser.close();
