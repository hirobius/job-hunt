// Runs in the page (extract.mjs injects it). Walks the visible DOM into the spec tree, reading
// each element's React fiber chain for the HDS components that rendered it.
// HDS components are found by identity: the exports of the very @hirobius/design-system module
// the app runs (the Vite dev server's prebundled dep), so the app needs no markers of its own.
// No pixel positions: a node is its HDS component, variant and props, its text, its auto-layout
// (direction, gap and padding tokens) and its token classes.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- called by extract.mjs through page.evaluate
async function __rfWalk(opts) {
  const LEAF = new Set(opts.leaf);
  const SKIP_PROPS =
    /^(children|className|style|id|key|ref|on[A-Z].*|aria-.*|data-.*|role|tabIndex|htmlFor|href|src|srcSet|name|form|autoComplete|autoFocus|asChild|forceMount|container|sideOffset|collisionPadding|portal)$/;
  const names = new Map();
  // The prebundled HDS module the app imports, read from the app's own transformed entry
  // (Playwright's fixed clock replaces the performance timeline, so it cannot be used).
  const entry = await (await fetch('/src/main.tsx')).text();
  const urls = [
    ...new Set(
      [
        ...entry.matchAll(/["'](\/node_modules\/\.vite\/deps\/@hirobius_design-system[^"']*)["']/g),
      ].map((m) => m[1]),
    ),
  ];
  for (const u of urls) {
    const mod = await import(u);
    for (const [k, v] of Object.entries(mod))
      if (
        v &&
        (typeof v === 'function' || typeof v === 'object') &&
        /^[A-Z]/.test(k) &&
        !names.has(v)
      )
        names.set(v, k);
  }
  const typeName = (t) => {
    if (!t) return null;
    if (names.has(t)) return names.get(t);
    if (t.type && names.has(t.type)) return names.get(t.type); // memo
    if (t.render && names.has(t.render)) return names.get(t.render);
    return null;
  };
  const icon = (v) => {
    const t = v && v.$$typeof ? v.type : v;
    const n = t && (t.displayName || (t.render && t.render.displayName));
    return n ? `icon:${n}` : undefined;
  };
  const props = (p) => {
    const out = {};
    for (const k of Object.keys(p || {}).sort()) {
      if (SKIP_PROPS.test(k)) continue;
      const v = p[k];
      if (v == null || (typeof v === 'function' && !icon(v))) continue;
      if (['string', 'number', 'boolean'].includes(typeof v))
        out[k] = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v;
      else {
        const i = icon(v);
        if (i) out[k] = i;
      }
    }
    return out;
  };
  const W = window.innerWidth;
  const bp = { sm: 640, md: 768, lg: 1024, xl: 1280 };
  const TOKEN =
    /^(gap|gap-x|gap-y|p|px|py|pt|pb|pl|pr|bg|text|border|rounded|shadow)-(?!\[)([a-z][a-z0-9-]*)$/;
  const SIZE_TEXT =
    /^text-(xs|sm|base|lg|xl|\dxl|left|right|center|start|end|wrap|nowrap|balance|pretty|ellipsis|clip)$/;
  const tokens = (el) => {
    const out = [];
    for (const raw of (el.getAttribute('class') || '').split(/\s+/)) {
      const parts = raw.split(':');
      const cls = parts.pop();
      if (parts.some((q) => !(q in bp) || bp[q] > W)) continue; // state variants and inactive breakpoints
      const m = TOKEN.exec(cls);
      if (m && !SIZE_TEXT.test(cls)) out.push(cls);
    }
    return [...new Set(out)].sort();
  };
  const layout = (el) => {
    const cs = getComputedStyle(el);
    if (!/flex|grid/.test(cs.display)) return null;
    const dir = cs.display.includes('grid')
      ? 'grid'
      : cs.flexDirection.startsWith('column')
        ? 'column'
        : 'row';
    const l = { dir };
    if (cs.flexWrap === 'wrap') l.wrap = true;
    const g = (cs.rowGap !== 'normal' && parseFloat(cs.rowGap)) || parseFloat(cs.columnGap) || 0;
    if (g) l.gapPx = Math.round(g);
    const pad = ['Top', 'Right', 'Bottom', 'Left'].map((s) =>
      Math.round(parseFloat(cs['padding' + s]) || 0),
    );
    if (pad.some(Boolean)) l.padPx = pad;
    return l;
  };
  const visible = (el) =>
    el.checkVisibility
      ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      : true;
  const text = (s) => s.replace(/\s+/g, ' ').trim();

  const fk = (el) => Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
  const pk = (el) => Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  // React keeps two fibers per node (current and alternate), and an element's own fiber pointer
  // and `.return` links can be the stale one. The current host fiber is the one whose props are
  // the element's committed props; each parent is the version whose child list holds the child.
  const hostFiber = (el) => {
    const f = el[fk(el)];
    if (!f) return null;
    const props = el[pk(el)];
    return f.alternate && f.alternate.memoizedProps === props && f.memoizedProps !== props
      ? f.alternate
      : f;
  };
  const holds = (parent, child) => {
    for (let c = parent && parent.child; c; c = c.sibling) if (c === child) return true;
    return false;
  };
  const parentOf = (x) => {
    const p = x.return;
    if (!p || holds(p, x) || !p.alternate) return p;
    return holds(p.alternate, x) ? p.alternate : p;
  };
  // The HDS components between an element and the element above it, outermost first.
  const chainOf = (el) => {
    const h = hostFiber(el);
    const out = [];
    for (let f = h ? parentOf(h) : null; f && ![3, 4, 5].includes(f.tag); f = parentOf(f)) {
      const nm = typeName(f.elementType);
      if (nm) out.unshift({ nm, f });
    }
    return out;
  };
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'LINK', 'META']);
  function kidsOf(el) {
    const out = [];
    for (const c of el.childNodes) {
      if (c.nodeType === 3) {
        const t = c.nodeValue.replace(/\s+/g, ' ');
        if (t.trim()) out.push({ c: '#text', t });
        else if (t) out.push({ c: '#text', t: ' ' });
      } else if (c.nodeType === 1) {
        // Block-level children are separate runs of text: keep a space between them.
        const block = !/^inline/.test(getComputedStyle(c).display);
        if (block) out.push({ c: '#text', t: ' ' });
        out.push(...visit(c));
        if (block) out.push({ c: '#text', t: ' ' });
      }
    }
    // One text node per run: letters split over spans read as one word, words keep their spaces.
    const merged = [];
    for (const n of out) {
      const prev = merged[merged.length - 1];
      if (n.c === '#text' && prev && prev.c === '#text') prev.t += n.t;
      else merged.push(n.c === '#text' ? { ...n } : n);
    }
    return merged
      .map((n) => (n.c === '#text' ? { c: '#text', t: text(n.t) } : n))
      .filter((n) => n.c !== '#text' || n.t);
  }
  function visit(el) {
    if (SKIP_TAGS.has(el.tagName)) return [];
    if (el.tagName.toLowerCase() === 'svg') {
      if (!visible(el)) return [];
      const m = /(?:^|\s)lucide-([a-z0-9-]+)/.exec(el.getAttribute('class') || '');
      return [{ c: 'svg', ...(m ? { p: { icon: m[1] } } : {}) }];
    }
    if (!visible(el)) return [];
    // Screen-reader-only text is not drawn.
    if (/(?:^|\s)sr-only(?:\s|$)/.test(el.getAttribute('class') || '')) return [];
    const chain = chainOf(el);
    if (chain.some((x) => x.nm === 'VisuallyHidden')) return [];
    const li = chain.findIndex((x) => LEAF.has(x.nm));
    let inner;
    let outer = chain;
    if (li >= 0) {
      const { nm, f } = chain[li];
      inner = { c: nm };
      const p = props(f.memoizedProps);
      if (Object.keys(p).length) inner.p = p;
      // A field shows its value, else its placeholder (innerText does not include either).
      const TEXT_FIELD =
        'input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea';
      const field = el.matches(TEXT_FIELD) ? el : el.querySelector(TEXT_FIELD);
      const t = field
        ? text(field.value || field.placeholder || '')
        : text(el.innerText || el.getAttribute('aria-label') || '');
      if (t) inner.t = t;
      outer = chain.slice(0, li);
      inner = [inner];
    } else if (['INPUT', 'TEXTAREA'].includes(el.tagName)) {
      inner = [{ c: '#' + el.tagName.toLowerCase(), t: text(el.value || el.placeholder || '') }];
    } else {
      const kids = kidsOf(el);
      const l = layout(el);
      const tk = tokens(el);
      const last = outer[outer.length - 1];
      if (last) {
        // The innermost HDS container is this element: it takes its layout, tokens and children.
        const n = { c: last.nm };
        const p = props(last.f.memoizedProps);
        if (Object.keys(p).length) n.p = p;
        if (l) n.l = l;
        if (tk.length) n.tk = tk;
        if (kids.length) n.k = kids;
        outer = outer.slice(0, -1);
        inner = [n];
      } else if (!l && !tk.some((t) => /^(bg|border|rounded|shadow)-/.test(t))) inner = kids;
      else if (kids.length === 1 && !tk.length && kids[0].c !== '#text') inner = kids;
      else if (!kids.length && !tk.length) inner = [];
      else {
        const n = { c: el.tagName.toLowerCase() };
        if (l) n.l = l;
        if (tk.length) n.tk = tk;
        if (kids.length) n.k = kids;
        inner = [n];
      }
    }
    for (let i = outer.length - 1; i >= 0; i--) {
      const n = { c: outer[i].nm };
      const p = props(outer[i].f.memoizedProps);
      if (Object.keys(p).length) n.p = p;
      if (inner.length) n.k = inner;
      inner = [n];
    }
    return inner;
  }
  // HDS layout primitives that only pass one child through (no own tokens) add nothing to draw.
  const PASS = new Set(['Box', 'Stack', 'Container', 'Grid', 'Pin', 'Reveal', 'ToastProvider']);
  const collapse = (nodes) =>
    nodes.flatMap((n) => {
      if (n.k) n.k = collapse(n.k);
      if (PASS.has(n.c) && !n.tk && (!n.k || n.k.length <= 1)) return n.k || [];
      return [n];
    });
  // React internals: the walk depends on the `__reactFiber$` and `__reactProps$` keys React puts
  // on DOM nodes (figma/README.md, "Risk"). Fail loudly when a React upgrade removes them.
  const first =
    document.getElementById('root') && document.getElementById('root').firstElementChild;
  if (!first || !fk(first) || !pk(first))
    throw new Error(
      'React fiber keys (__reactFiber$ / __reactProps$) not found: the Figma spec walker needs updating',
    );
  const tree = [];
  for (const el of document.body.children) tree.push(...visit(el));
  return { found: names.size, tree: collapse(tree) };
}
