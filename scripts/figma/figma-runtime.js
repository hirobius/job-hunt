// Figma-side runtime for the Roleflame sync (figma/README.md). push.mjs inlines this file into
// each use_figma script, after a `const DATA = …` line. It runs in the Figma plugin sandbox, in
// "roleflame — app states" (9VCvYGN0pz9faveIhSn6Kn) only, and never writes the HDS library.
//
// DATA = { mode: 'push' | 'read', page, owner, frames: [{ key, name, width, height, theme,
//          checksum, projection, gap, tree (push.mjs slim()), same }], keep: [frame keys that stay
//          on this page], components, icons }
// push: creates or rebuilds each owned frame from its tree (instances of HDS library
// components), removes owned frames on this page whose key is not in `keep`, and returns a
// receipt. read: returns the projection of every owned frame on the page.
// Ownership: shared plugin data `roleflame/owner` = DATA.owner, `roleflame/key` = frame key.

const NS = 'roleflame';
const NONE = '<none>'; // plugin data t: the instance shows default text the spec does not have
const ROLEFLAME_FILE = '9VCvYGN0pz9faveIhSn6Kn';
const isFile = figma.fileKey === undefined || figma.fileKey === ROLEFLAME_FILE;
if (!isFile)
  throw new Error(`refusing to run outside roleflame — app states (file ${figma.fileKey})`);
// The sync writes only its own page. The hand-checked pages (Phone 390, Desktop 1440, Archive)
// are never written: the sync output must match them first (figma/README.md, fidelity gate).
if (DATA.page !== 'Sync preview') throw new Error(`refusing to write page ${DATA.page}`);
let page = figma.root.children.find((p) => p.name === DATA.page);
if (!page && DATA.mode === 'read') return { page: DATA.page, frames: {} };
if (!page) {
  page = figma.createPage();
  page.name = DATA.page;
}
await figma.setCurrentPageAsync(page);

// The FNV-1a and stable JSON of scripts/figma/lib.mjs, so receipts carry the same checksums.
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .sort()
      .filter((k) => v[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// Read a Figma frame back into the projection (lib.mjs project()).
function firstText(node) {
  if (node.type === 'TEXT') return node.characters;
  if ('findOne' in node) {
    const t = node.findOne((x) => x.type === 'TEXT' && x.visible);
    if (t) return t.characters;
  }
  return '';
}
function readNode(node) {
  const c = node.name;
  const leaf =
    node.type === 'INSTANCE' ||
    node.type === 'TEXT' ||
    node.getSharedPluginData(NS, 'leaf') === '1';
  if (leaf) {
    const stored = node.getSharedPluginData(NS, 't');
    const t = (
      node.type === 'TEXT' ? node.characters : stored === NONE ? '' : stored || firstText(node)
    )
      .replace(/\s+/g, ' ')
      .trim();
    return t ? { c, t } : { c };
  }
  // A grid is drawn as a wrap row but is a column in the spec.
  const row = node.layoutMode === 'HORIZONTAL' && node.getSharedPluginData(NS, 'grid') !== '1';
  const o = { c, d: row ? 'row' : 'column' };
  const kids =
    'children' in node
      ? node.children.filter((k) => k.getSharedPluginData(NS, 'chrome') !== '1').map(readNode)
      : [];
  if (node.getSharedPluginData(NS, 'rv') === '1') kids.reverse();
  if (kids.length) o.k = kids;
  return o;
}
// Overlay holders ("layer: …") are drawing scaffolds, not spec nodes: read through them.
const readFrame = (f) =>
  f.children
    .filter((k) => k.getSharedPluginData(NS, 'chrome') !== '1')
    .flatMap((k) => (k.name.startsWith('layer: ') ? k.children.map(readNode) : [readNode(k)]));
// Owned frames sit on the page, or in a batch section on it.
const owned = () =>
  page.children
    .flatMap((n) => (n.type === 'SECTION' ? n.children : [n]))
    .filter((n) => n.type === 'FRAME' && n.getSharedPluginData(NS, 'owner') === DATA.owner);

if (DATA.mode === 'read') {
  const out = {};
  for (const f of owned()) {
    const key = f.getSharedPluginData(NS, 'key');
    out[key] = {
      id: f.id,
      name: f.name,
      checksum: f.getSharedPluginData(NS, 'checksum'),
      projection: fnv1a(stable(readFrame(f))),
    };
  }
  return { page: DATA.page, frames: out };
}

// ---- push ----
const sets = {};
async function setFor(name) {
  if (name in sets) return sets[name];
  const ref = DATA.components[name];
  let node = null;
  try {
    if (ref && ref.set) node = await figma.importComponentSetByKeyAsync(ref.set);
    else if (ref && ref.component) node = await figma.importComponentByKeyAsync(ref.component);
  } catch {
    node = null;
  }
  sets[name] = node;
  return node;
}
// Lucide names the app draws that HDS ships under another name (figma/hds-components.json).
const ICON_ALIAS = {
  ellipsis: 'more-horizontal',
  'list-filter': 'filter',
  copy: 'file',
  'square-arrow-out-up-right': 'external-link',
  'triangle-alert': 'info',
  'chevrons-up-down': 'chevron-down',
  list: 'menu',
};
const icons = {};
async function iconFor(raw) {
  const name = ICON_ALIAS[raw] || raw;
  if (name in icons) return icons[name];
  let node = null;
  if (DATA.icons[name])
    try {
      node = await figma.importComponentByKeyAsync(DATA.icons[name]);
    } catch {
      node = null;
    }
  icons[name] = node;
  return node;
}
const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

// Variant properties of a set, matched to code props by name (iconOnly ↔ "Icon only").
function variantProps(set, props) {
  const defs = set.componentPropertyDefinitions;
  const out = {};
  for (const [name, def] of Object.entries(defs)) {
    if (def.type !== 'VARIANT') continue;
    const code = Object.keys(props || {}).find((k) => norm(k) === norm(name));
    if (code === undefined) continue;
    const want = norm(props[code]);
    const opt = def.variantOptions.find((o) => norm(o) === want);
    if (opt) out[name] = opt;
  }
  return out;
}
const loaded = new Set();
async function loadFonts(node) {
  const texts = node.type === 'TEXT' ? [node] : node.findAll((x) => x.type === 'TEXT');
  for (const t of texts) {
    for (const seg of t.getStyledTextSegments(['fontName'])) {
      const k = `${seg.fontName.family}/${seg.fontName.style}`;
      if (!loaded.has(k)) {
        await figma.loadFontAsync(seg.fontName);
        loaded.add(k);
      }
    }
  }
}
async function setText(inst, t) {
  if (!t) {
    if (firstText(inst).trim()) inst.setSharedPluginData(NS, 't', NONE);
    return;
  }
  const defs = inst.componentProperties || {};
  const textProp = Object.keys(defs).find((k) => defs[k].type === 'TEXT');
  const node = inst.findOne((x) => x.type === 'TEXT' && x.visible);
  if (textProp) {
    await loadFonts(inst);
    inst.setProperties({ [textProp]: t });
  } else if (node) {
    await loadFonts(node);
    node.characters = t;
  }
  // Read back what the instance shows; when it cannot show the text, keep it as plugin data.
  // A variant whose visible text is not bound to the property: write that text node too.
  const shown = inst.findOne((x) => x.type === 'TEXT' && x.visible);
  if (shown && shown.characters !== t) {
    try {
      await loadFonts(shown);
      shown.characters = t;
    } catch {
      /* locked by the component */
    }
  }
  if (firstText(inst).replace(/\s+/g, ' ').trim() !== t) inst.setSharedPluginData(NS, 't', t);
}
// Plain text is an HDS Text instance (body), so it takes the library's type style and font.
async function plainText(t, name) {
  const set = await setFor('Text');
  if (!set) throw new Error('HDS Text component did not import');
  const inst = (set.type === 'COMPONENT_SET' ? set.defaultVariant : set).createInstance();
  try {
    inst.setProperties(variantProps(set, { variant: 'body' }));
  } catch {
    /* default variant */
  }
  inst.name = name;
  await setText(inst, t);
  return inst;
}
// Text never sits in a fixed narrow column: in a column it fills the width, in a row it takes the
// space left, and its text wraps (textAutoResize HEIGHT) instead of clipping.
function fill(node, parentDir) {
  if (!node.parent || !('layoutMode' in node.parent) || node.parent.layoutMode === 'NONE') return;
  // A wrap row keeps each child at its own width, so items flow to the next line, not off the row.
  // A Badge, Tag, Avatar or icon-only button hugs its content (an HDS default may be FILL).
  const hug = node.getSharedPluginData(NS, 'hug') === '1';
  if (node.parent.layoutWrap === 'WRAP' || hug) {
    if (node.type === 'INSTANCE')
      try {
        node.layoutGrow = 0;
        node.layoutSizingHorizontal = 'HUG';
      } catch {
        /* fixed-size instance */
      }
    return;
  }
  const isText = node.name === '#text' || node.name === 'Text' || node.name === 'text';
  const box = node.type === 'FRAME' && node.getSharedPluginData(NS, 'leaf') !== '1';
  try {
    if (parentDir === 'VERTICAL') node.layoutSizingHorizontal = 'FILL';
    else if (isText || box) node.layoutGrow = 1;
  } catch {
    /* fixed-size instance */
  }
  if (node.type === 'INSTANCE' && isText) {
    const t = node.findOne((x) => x.type === 'TEXT');
    if (!t) return;
    try {
      t.layoutSizingHorizontal = 'FILL';
      t.textAutoResize = 'HEIGHT';
    } catch {
      try {
        t.textAutoResize = 'WIDTH_AND_HEIGHT';
      } catch {
        /* locked by the component */
      }
    }
  }
}

// Look of the app that the spec tree does not carry: brand logo, nav segment, cards, button icons.
const GREY = { r: 0.914, g: 0.918, b: 0.925 };
const INK = { r: 0.067, g: 0.094, b: 0.153 };
const solid = (color) => [{ type: 'SOLID', color }];
// HDS Semantic colour variables (library 2VgBbVpKiDnu0aftJEVyBQ), so a frame's variable mode
// gives light or dark. The literal colour is only the fallback when the library is not reachable.
const SEM = { vars: null, col: null };
async function semVar(name) {
  if (SEM.vars === null) {
    SEM.vars = {};
    try {
      const cols = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
      const c = cols.find((x) => /(^|\/)Semantic$/.test(x.name));
      if (c)
        for (const v of await figma.teamLibrary.getVariablesInLibraryCollectionAsync(c.key))
          if (v.resolvedType === 'COLOR') SEM.vars[v.name] = v.key;
    } catch {
      /* no library access: literal colours */
    }
  }
  const k = SEM.vars[name];
  if (!k) return null;
  if (typeof k !== 'string') return k;
  try {
    const v = await figma.variables.importVariableByKeyAsync(k);
    SEM.vars[name] = v;
    if (!SEM.col)
      SEM.col = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
    return v;
  } catch {
    SEM.vars[name] = null;
    return null;
  }
}
async function paint(name, color, opacity) {
  const p = { type: 'SOLID', color };
  if (opacity !== undefined) p.opacity = opacity;
  const v = await semVar(name);
  return [v ? figma.variables.setBoundVariableForPaint(p, 'color', v) : p];
}
const LABEL_ICON = {
  Account: 'user',
  Starred: 'star',
  'More actions': 'more-horizontal',
  Copy: 'file',
  'Open posting': 'external-link',
  Close: 'x',
};
function iconName(p) {
  const raw = p.iconLeft || p.iconRight || p.icon || '';
  if (raw)
    return String(raw)
      .replace(/^icon:/, '')
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase();
  if (p._ic) return String(p._ic);
  const label = String(p.label || '');
  const hit = Object.keys(LABEL_ICON).find((k) => label.startsWith(k));
  return hit ? LABEL_ICON[hit] : '';
}
async function setIcon(inst, p) {
  const name = iconName(p || {});
  const comp = name ? await iconFor(name) : null;
  const props = inst.componentProperties || {};
  const want = {};
  // The app draws one icon: leading unless the code asks for iconRight.
  const lead = !!comp && !(p && p.iconRight);
  const trail = !!comp && !!(p && p.iconRight);
  let unnamed = 0;
  for (const [k, d] of Object.entries(props)) {
    if (d.type === 'INSTANCE_SWAP' && comp) want[k] = comp.id;
    if (d.type === 'BOOLEAN' && /icon/i.test(k)) {
      let side = /left|leading|start/i.test(k) ? 'L' : /right|trailing|end/i.test(k) ? 'R' : '';
      // The first unnamed icon boolean on the HDS Button is the trailing one, the second the leading.
      if (!side && !(p && p.iconOnly)) side = unnamed++ === 0 ? 'R' : 'L';
      want[k] = side === 'L' ? lead : side === 'R' ? trail : !!comp;
    }
  }
  try {
    if (Object.keys(want).length) inst.setProperties(want);
  } catch {
    /* keep the default icon */
  }
}
// An icon-only button is square at the app's control size (sm 36, md 44). A secondary one has the
// muted surface and a border; a tertiary one stays clear. The icon sits in the centre.
async function iconButton(inst, p) {
  const px = p.size === 'sm' ? 36 : p.size === 'lg' ? 48 : 44;
  const dark = DARK;
  try {
    inst.resize(px, px);
  } catch {
    /* fixed by the component */
  }
  try {
    inst.primaryAxisAlignItems = 'CENTER';
    inst.counterAxisAlignItems = 'CENTER';
    inst.cornerRadius = 8;
    if (p.variant !== 'tertiary' && p.variant !== 'ghost') {
      inst.fills = await paint('color/surface/muted', dark ? { r: 0.13, g: 0.14, b: 0.17 } : GREY);
      inst.strokes = await paint(
        'color/border/default',
        dark ? { r: 0.2, g: 0.22, b: 0.26 } : { r: 0.894, g: 0.902, b: 0.914 },
      );
      inst.strokeWeight = 1;
    }
  } catch {
    /* locked by the component */
  }
}
// On a phone the app's type is smaller than the desktop style: use the measured size (spec `ty`).
let PHONE = false;
let DARK = false;
async function retype(node, ty) {
  if (!PHONE || !Array.isArray(ty) || !ty[0]) return;
  const texts = node.type === 'TEXT' ? [node] : node.findAll((x) => x.type === 'TEXT' && x.visible);
  for (const t of texts)
    try {
      await loadFonts(t);
      t.fontSize = ty[0];
      if (ty[1]) t.lineHeight = { value: ty[1], unit: 'PIXELS' };
    } catch {
      /* locked by the component */
    }
}
// An Input or Select shows its label, helper and value text, not the component's sample text.
async function fieldText(inst, t, p) {
  const defs = inst.componentProperties || {};
  const want = {};
  for (const [k, d] of Object.entries(defs)) {
    if (d.type !== 'TEXT') continue;
    if (/label/i.test(k)) want[k] = String(p.label || t || '');
    else if (/helper|hint|description/i.test(k)) want[k] = String(p.helperText || '');
    else want[k] = String(t || p.placeholder || '');
  }
  try {
    await loadFonts(inst);
    if (Object.keys(want).length) inst.setProperties(want);
  } catch {
    /* keep */
  }
  for (const x of inst.findAll(
    (y) => y.type === 'TEXT' && /^(Placeholder|Label|Value)$/i.test(y.characters),
  ))
    try {
      await loadFonts(x);
      x.characters = /^label$/i.test(x.characters) ? String(p.label || t || '') : String(t || '');
    } catch {
      /* locked */
    }
}
function logo(row) {
  const n = figma.createNodeFromSvg(DATA.logo);
  n.name = 'svg';
  n.setSharedPluginData(NS, 'leaf', '1');
  n.resize(row ? 18 : 54, row ? 24 : 72);
  return n;
}
async function dress(f, sel) {
  if (f.name === 'Box' && f.children.length && f.children.every((k) => k.name === 'a')) {
    f.fills = await paint('color/surface/muted', GREY);
    f.cornerRadius = 10;
    for (const a of f.children) {
      a.layoutGrow = 1;
      a.primaryAxisAlignItems = 'CENTER';
      a.counterAxisAlignItems = 'CENTER';
      a.paddingTop = a.paddingBottom = 10;
      a.cornerRadius = 8;
      const on = firstText(a).trim() === sel;
      if (on) a.fills = await paint('color/surface/inverse', INK);
      const tf = on
        ? await paint('color/content/inverse', { r: 1, g: 1, b: 1 })
        : await paint('color/content/secondary', { r: 0.42, g: 0.45, b: 0.5 });
      for (const t of a.findAll((x) => x.type === 'TEXT'))
        try {
          t.textAlignHorizontal = 'CENTER';
          t.fills = tf;
        } catch {
          /* locked */
        }
    }
  }
  // Disclosure > Surface (the Templates disclosure) is a card: muted surface, 12 px radius.
  if (f.name === 'Surface' && f.parent && f.parent.name === 'Disclosure') {
    f.fills = await paint('color/surface/muted', GREY);
    f.cornerRadius = 12;
    f.paddingLeft = f.paddingRight = 16;
  }
  if (f.name === 'Card') {
    f.fills = await paint('color/surface/muted', GREY);
    f.cornerRadius = 12;
    f.paddingTop = f.paddingBottom = f.paddingLeft = f.paddingRight = 16;
  }
  if (f.name === 'EmptyState' || (f.name === 'Stack' && f.parent && f.parent.name === 'Card')) {
    f.counterAxisAlignItems = 'CENTER';
    if (f.layoutMode === 'HORIZONTAL') f.primaryAxisAlignItems = 'CENTER';
    for (const t of f.findAll((x) => x.type === 'TEXT'))
      try {
        t.textAlignHorizontal = 'CENTER';
      } catch {
        /* locked */
      }
  }
  if (f.layoutMode === 'HORIZONTAL') {
    f.counterAxisAlignItems = 'CENTER';
    const last = f.children[f.children.length - 1];
    if (last && last.name === 'Menu') f.primaryAxisAlignItems = 'SPACE_BETWEEN';
  }
}
// Payload arrays (push.mjs slim() and encode()) back to nodes: [c, t, p] leaf and
// [c, row, gap, pad, kids] container, strings and objects as indexes into DATA.s.
const S = DATA.s || [];
function node(a) {
  if (a.length >= 5 && Array.isArray(a[4]))
    return {
      c: S[a[0]],
      l: {
        dir: a[1] ? 'row' : 'column',
        wrap: a[1] === 2,
        gapPx: a[2],
        padPx: a[3] ? S[a[3]] : null,
      },
      k: a[4].map(node),
      sz: a[5] ? S[a[5]] : null,
      rv: (a[6] || 0) % 2 === 1,
      gc: Math.floor((a[6] || 0) / 2),
    };
  return { c: S[a[0]], t: a.length > 1 ? S[a[1]] : '', p: a.length > 2 ? S[a[2]] : {} };
}
async function build(n, parent, psz = null) {
  const parentDir = parent.layoutMode;
  if (n.c === '#text') {
    const t = await plainText(n.t, '#text');
    parent.appendChild(t);
    fill(t, parentDir);
    await retype(t, n.p && n.p._ty);
    return;
  }
  if (!n.k) {
    if (n.c === 'svg' && !(n.p && n.p.icon) && DATA.logo && parent.name === 'span') {
      const l = logo(parentDir === 'HORIZONTAL');
      parent.appendChild(l);
      return;
    }
    let comp = null;
    const name = n.c;
    if (n.c === 'svg' || n.c === 'Icon')
      comp =
        n.p && n.p.icon
          ? await iconFor(
              String(n.p.icon)
                .replace(/^icon:/, '')
                .replace(/([a-z])([A-Z])/g, '$1-$2')
                .toLowerCase(),
            )
          : null;
    else {
      const setName = n.c === 'Button' && n.p && n.p.iconOnly ? 'IconButton' : n.c;
      const set = await setFor(setName);
      if (set) comp = set.type === 'COMPONENT_SET' ? set.defaultVariant || set.children[0] : set;
      if (set && set.type === 'COMPONENT_SET') {
        const inst = comp.createInstance();
        parent.appendChild(inst);
        inst.name = name;
        if (/^(Badge|Tag|Avatar|IconButton)$/.test(setName))
          inst.setSharedPluginData(NS, 'hug', '1');
        try {
          // The app's default control size is md; HDS defaults to sm.
          const props = /^(Button|Input)$/.test(setName) ? { size: 'md', ...n.p } : n.p;
          inst.setProperties(variantProps(set, props));
        } catch {
          /* keep the default variant */
        }
        await setText(inst, n.t);
        if (/^(Input|Select|Textarea)$/.test(setName)) await fieldText(inst, n.t, n.p || {});
        if (/Button/.test(setName)) await setIcon(inst, n.p);
        if (setName === 'IconButton') await iconButton(inst, n.p || {});
        fill(inst, parentDir);
        await retype(inst, n.p && n.p._ty);
        // The animation toggle floats in the top-right corner of the sign-in surface.
        if (n.p && n.p.label === 'Play animations') {
          inst.layoutPositioning = 'ABSOLUTE';
          inst.constraints = { horizontal: 'MAX', vertical: 'MIN' };
          inst.x = parent.width - inst.width - 8;
          inst.y = 16;
        }
        return;
      }
    }
    if (comp) {
      const inst = comp.createInstance();
      parent.appendChild(inst);
      inst.name = name;
      await setText(inst, n.t);
      await retype(inst, n.p && n.p._ty);
      return;
    }
    // No HDS part for it (an element, or a GAP): a local frame named after it, holding its text.
    const f = figma.createAutoLayout('HORIZONTAL', { name });
    f.fills = [];
    f.setSharedPluginData(NS, 'leaf', '1');
    parent.appendChild(f);
    if (n.t) f.appendChild(await plainText(n.t, 'text'));
    // A Disclosure (no HDS part) is a card: its label and a chevron on the muted surface.
    if (name === 'Disclosure' && n.p && n.p.variant !== 'row') {
      f.fills = await paint('color/surface/muted', GREY);
      f.cornerRadius = 12;
      f.paddingTop = f.paddingBottom = 14;
      f.paddingLeft = f.paddingRight = 16;
      f.counterAxisAlignItems = 'CENTER';
      f.primaryAxisAlignItems = 'SPACE_BETWEEN';
      if (n.p.label && !n.t) {
        f.appendChild(await plainText(String(n.p.label), 'text'));
        f.setSharedPluginData(NS, 't', NONE); // the spec leaf has no text: read back as none
      }
      const chev = await iconFor('chevron-down');
      if (chev) f.appendChild(chev.createInstance());
    }
    fill(f, parentDir);
    return;
  }
  const grid = n.gc > 1;
  const dir = (n.l && n.l.dir === 'row') || grid ? 'HORIZONTAL' : 'VERTICAL';
  const f = figma.createAutoLayout(dir, { name: n.c });
  f.fills = [];
  parent.appendChild(f);
  if (n.l) {
    if (n.l.gapPx) f.itemSpacing = n.l.gapPx;
    if ((n.l.wrap || grid) && dir === 'HORIZONTAL') f.layoutWrap = 'WRAP';
    if (grid) {
      f.setSharedPluginData(NS, 'grid', '1');
      f.counterAxisSpacing = n.l.gapPx || 0;
    }
    if (n.l.padPx) [f.paddingTop, f.paddingRight, f.paddingBottom, f.paddingLeft] = n.l.padPx;
  }
  fill(f, parentDir);
  for (const k of n.k || []) await build(k, f, n.sz);
  size(f, n.sz, parentDir, psz);
  // A box that holds only hugging parts (a Menu around an icon button) hugs too.
  if (f.children.length && f.children.every((k) => k.getSharedPluginData(NS, 'hug') === '1')) {
    f.setSharedPluginData(NS, 'hug', '1');
    try {
      f.layoutGrow = 0;
      f.layoutSizingHorizontal = 'HUG';
    } catch {
      /* fixed */
    }
  }
  // flex-1 in a button row (Star, Open application, More): the one labelled Button grows.
  if (dir === 'HORIZONTAL' && f.layoutWrap !== 'WRAP') {
    const btn = f.children.filter(
      (k) =>
        k.type === 'INSTANCE' && k.name === 'Button' && k.getSharedPluginData(NS, 'hug') !== '1',
    );
    const rest = f.children.filter((k) => !btn.includes(k));
    if (
      btn.length === 1 &&
      rest.length &&
      rest.every((k) => k.getSharedPluginData(NS, 'hug') === '1')
    )
      try {
        btn[0].layoutGrow = 1;
      } catch {
        /* fixed */
      }
  }
  // Grid cells share the measured width equally.
  if (grid && n.sz) {
    const cell = (n.sz[0] - (n.l.gapPx || 0) * (n.gc - 1)) / n.gc;
    for (const k of f.children)
      try {
        k.layoutGrow = 0;
        k.resize(Math.max(1, cell), k.height);
      } catch {
        /* fixed */
      }
  }
  // flex-col-reverse (a phone dialog footer: primary first): draw reversed, read back in DOM order.
  if (n.rv) {
    for (const k of [...f.children]) f.insertChild(0, k);
    f.setSharedPluginData(NS, 'rv', '1');
  }
  if (f.name === 'span' && f.children[0] && f.children[0].name === 'svg') {
    const t = f.children[1] && f.children[1].findOne((x) => x.type === 'TEXT');
    if (t)
      try {
        await figma.loadFontAsync({ family: t.fontName.family, style: 'Bold' });
        t.fontName = { family: t.fontName.family, style: 'Bold' };
        t.fontSize = f.layoutMode === 'HORIZONTAL' ? 20 : 44;
        t.textAutoResize = 'WIDTH_AND_HEIGHT';
        f.children[1].layoutGrow = 0;
        f.children[1].resize(Math.max(f.children[1].width, t.width), Math.ceil(t.height));
        if (f.layoutMode === 'VERTICAL') f.paddingBottom = 24;
        f.counterAxisAlignItems = 'CENTER';
        if (f.layoutMode === 'VERTICAL') f.parent.counterAxisAlignItems = 'CENTER';
      } catch {
        /* font */
      }
  }
  await dress(f, SEL);
}
let SEL = '';
// The app's measured box (spec `sz`). In a row a container takes its measured width, not a share of
// the row (a sidebar beside a detail pane); in a column it fills unless the app made it narrower.
// Its height is the app's height, so row density matches; the text inside may wrap but not grow it.
function size(f, sz, parentDir, psz) {
  if (!sz || !f.parent || !('layoutMode' in f.parent) || f.parent.layoutMode === 'NONE') return;
  const [w, h] = sz;
  try {
    if (parentDir === 'HORIZONTAL') {
      f.layoutGrow = 0;
      f.layoutSizingHorizontal = 'FIXED';
      f.resize(Math.max(1, w), f.height);
    } else if (psz) {
      const p = f.parent;
      const inner = psz[0] - (p.paddingLeft || 0) - (p.paddingRight || 0);
      if (w < inner - 4) {
        f.layoutSizingHorizontal = 'FIXED';
        f.resize(Math.max(1, w), f.height);
      }
    }
    if (h > 0) {
      f.layoutSizingVertical = 'FIXED';
      f.resize(f.width, h);
    }
  } catch {
    /* hug */
  }
}

let darkMode = null;
async function themeFrame(frame, theme, existingModes) {
  if (existingModes && Object.keys(existingModes).length) {
    for (const [cid, mid] of Object.entries(existingModes)) {
      const col = await figma.variables.getVariableCollectionByIdAsync(cid);
      if (col) frame.setExplicitVariableModeForCollection(col, mid);
    }
    return;
  }
  if (theme !== 'dark') return;
  if (darkMode === null) {
    darkMode = false;
    const frames = [];
    for (const p of figma.root.children) {
      await p.loadAsync();
      frames.push(...p.children);
    }
    for (const other of frames) {
      const modes =
        other.type === 'FRAME' && other.name.endsWith('— dark')
          ? other.explicitVariableModes
          : null;
      if (modes && Object.keys(modes).length) {
        darkMode = modes;
        break;
      }
    }
  }
  if (darkMode)
    for (const [cid, mid] of Object.entries(darkMode)) {
      const col = await figma.variables.getVariableCollectionByIdAsync(cid);
      if (col) frame.setExplicitVariableModeForCollection(col, mid);
    }
}

const receipt = { page: DATA.page, created: [], updated: [], removed: [], frames: {} };
if (DATA.keep) {
  const keep = new Set(DATA.keep);
  for (const f of owned()) {
    const key = f.getSharedPluginData(NS, 'key');
    if (!keep.has(key)) {
      receipt.removed.push({ key, id: f.id });
      f.remove();
    }
  }
}
let bottom = Math.max(0, ...page.children.map((n) => n.y + n.height)) + 200;
// The first top-level node is the page; the rest (dialogs, menus, toasts) are overlays, drawn as an
// absolute layer over it: a DialogOverlay is a full-size scrim, a dialog is centred (full width on a
// phone), a menu sits under the header on the right, a toast region sits at the bottom.
async function overlay(n, frame, spec) {
  const W = spec.width;
  const H = spec.height;
  if (n.c === 'DialogOverlay') {
    const r = figma.createRectangle();
    r.name = 'DialogOverlay';
    r.resize(W, H);
    // Literal on purpose: a bound scrim variable comes out opaque and hides the page in light mode.
    r.fills = [{ type: 'SOLID', color: { r: 0.067, g: 0.094, b: 0.153 }, opacity: 0.6 }];
    frame.appendChild(r);
    r.layoutPositioning = 'ABSOLUTE';
    r.x = 0;
    r.y = 0;
    return;
  }
  const holder = figma.createAutoLayout('VERTICAL', { name: `layer: ${n.c}` });
  holder.fills = [];
  frame.appendChild(holder);
  holder.layoutPositioning = 'ABSOLUTE';
  await build(n, holder);
  const phone = W < 1024;
  const isToast = n.c === 'ol';
  const isMenu = n.c === 'Box' || n.c === 'Menu' || n.c === 'Stack';
  // The measured dialog box from the app (spec `sz`), else the old defaults.
  const m = !isToast && n.sz && n.sz[0] > 0 ? n.sz : null;
  const w = m
    ? m[0]
    : isToast
      ? Math.min(W - 32, 420)
      : isMenu
        ? 280
        : phone
          ? W
          : Math.min(W - 64, 512);
  holder.resize(w, Math.max(1, holder.height));
  holder.counterAxisSizingMode = 'FIXED';
  holder.primaryAxisSizingMode = 'AUTO';
  const body = holder.children[0];
  // A toast is a raised card with a border inside the toast region (ol > li).
  if (body && isToast)
    for (const li of 'children' in body ? body.children : []) {
      if (li.type !== 'FRAME') continue;
      li.fills = await paint(
        'color/surface/floating',
        spec.theme === 'dark' ? { r: 0.09, g: 0.1, b: 0.12 } : { r: 1, g: 1, b: 1 },
      );
      li.strokes = await paint(
        'color/border/default',
        spec.theme === 'dark' ? { r: 0.2, g: 0.22, b: 0.26 } : { r: 0.894, g: 0.902, b: 0.914 },
      );
      li.strokeWeight = 1;
      li.cornerRadius = 8;
      if (!li.paddingTop) li.paddingTop = li.paddingBottom = 12;
      if (!li.paddingLeft) li.paddingLeft = li.paddingRight = 16;
    }
  if (body && !isToast) {
    body.fills = await paint(
      'color/surface/floating', // bg-popover = --semantic-color-surface-floating (white in light)
      spec.theme === 'dark' ? { r: 0.09, g: 0.1, b: 0.12 } : { r: 1, g: 1, b: 1 },
    );
    body.cornerRadius = phone && !isMenu ? 0 : 12;
  }
  holder.x = isMenu ? W - w - 16 : Math.round((W - w) / 2);
  holder.y = isToast
    ? Math.max(0, H - holder.height - 16)
    : isMenu
      ? 64
      : phone
        ? 0
        : Math.max(16, Math.round((H - holder.height) / 2));
  if (m) {
    holder.resize(w, Math.max(1, m[1]));
    holder.primaryAxisSizingMode = 'FIXED';
    try {
      if (body) {
        body.layoutSizingHorizontal = 'FILL';
        body.layoutSizingVertical = 'FILL';
      }
    } catch {
      /* hug */
    }
    holder.x = m[2];
    holder.y = m[3];
    if (body) body.cornerRadius = phone && m[0] >= W ? 0 : 12;
  } else if (phone && !isMenu && !isToast) {
    holder.resize(w, H);
    holder.primaryAxisSizingMode = 'FIXED';
    try {
      if (body) body.layoutSizingVertical = 'FILL';
    } catch {
      /* hug */
    }
  }
}
// New frames go into a section per batch, 6 to a row, so one screenshot of the section scores
// the whole batch (scripts/figma/fidelity.mjs --crop).
let section = null;
if (DATA.section) {
  section = page.children.find((n) => n.type === 'SECTION' && n.name === DATA.section);
  if (!section) {
    section = figma.createSection();
    section.name = DATA.section;
    page.appendChild(section);
    section.x = 0;
    section.y = bottom;
  }
  receipt.section = section.id;
}
let slot = section ? section.children.length : 0;
for (const spec of DATA.frames) {
  let frame = owned().find((f) => f.getSharedPluginData(NS, 'key') === spec.key);
  if (frame) {
    for (const c of [...frame.children]) c.remove();
    receipt.updated.push(spec.key);
  } else {
    frame = figma.createFrame();
    if (section) {
      section.appendChild(frame);
      frame.x = 100 + (slot % 6) * 1540;
      frame.y = 100 + Math.floor(slot / 6) * 1000;
      slot++;
    } else {
      page.appendChild(frame);
      frame.x = spec.width === 390 ? 0 : 600;
      frame.y = bottom;
      bottom += spec.height + 200;
    }
    receipt.created.push(spec.key);
  }
  frame.name = `${spec.width} / ${spec.name}`;
  PHONE = spec.width < 1024;
  DARK = spec.theme === 'dark';
  // The viewport, fixed: 390x844 or 1440x900. The page scrolls under it, as in the app.
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'FIXED';
  frame.counterAxisSizingMode = 'FIXED';
  frame.resize(spec.width, spec.height);
  frame.clipsContent = true;
  frame.fills = await paint(
    'color/surface/page',
    spec.theme === 'dark' ? { r: 0.05, g: 0.06, b: 0.08 } : { r: 1, g: 1, b: 1 },
  );
  // Light or dark from the Semantic collection's mode; else the mode another dark frame uses.
  const semMode =
    SEM.col && SEM.col.modes.find((m) => (spec.theme === 'dark' ? /dark/i : /light/i).test(m.name));
  if (semMode) frame.setExplicitVariableModeForCollection(SEM.col, semMode.modeId);
  else await themeFrame(frame, spec.theme, null);
  // App shell padding: 20 px on phone; on desktop the content column is 920 px, centred.
  const side = spec.width < 1024 ? 20 : Math.round((spec.width - 920) / 2);
  [frame.paddingTop, frame.paddingRight, frame.paddingBottom, frame.paddingLeft] = [
    16,
    side,
    16,
    side,
  ];
  SEL = spec.name.split(' / ')[0];
  const tree = spec.tree || DATA.frames.find((x) => x.key === spec.same).tree;
  const [main, ...rest] = tree;
  const mn = main ? node(main) : null;
  // The page column where the app measured it (else the 920 px column above).
  if (mn && mn.sz && mn.sz[0] > 0 && mn.sz[0] <= spec.width) {
    frame.paddingLeft = Math.max(0, mn.sz[2]);
    frame.paddingRight = Math.max(0, spec.width - mn.sz[2] - mn.sz[0]);
    frame.paddingTop = Math.max(0, mn.sz[3]);
  }
  if (mn) await build(mn, frame);
  // A centred dialog with no DialogOverlay in the tree (an alert dialog) still dims the page in the
  // app: add a scrim, marked as chrome so the read-back does not see it.
  const ov = rest.map(node);
  // A menu or popover (a plain div of rows, no HDS component inside) has no scrim in the app.
  const hasComp = (n) => /^[A-Z]/.test(n.c || '') || (n.k || []).some(hasComp);
  const dialog = ov.some(
    (n) => n.c !== 'ol' && !/^(Box|Menu|Stack)$/.test(n.c) && n.k && n.k.some(hasComp),
  );
  if (dialog && !ov.some((n) => n.c === 'DialogOverlay')) {
    await overlay({ c: 'DialogOverlay' }, frame, spec);
    frame.children[frame.children.length - 1].setSharedPluginData(NS, 'chrome', '1');
  }
  for (const n of ov) await overlay(n, frame, spec);
  frame.setSharedPluginData(NS, 'owner', DATA.owner);
  frame.setSharedPluginData(NS, 'key', spec.key);
  frame.setSharedPluginData(NS, 'checksum', spec.checksum);
  frame.setSharedPluginData(NS, 'gap', (spec.gap || []).join('\n'));
  const projection = fnv1a(stable(readFrame(frame)));
  receipt.frames[spec.key] = {
    id: frame.id,
    box: [frame.x, frame.y, spec.width, spec.height],
    checksum: spec.checksum,
    projection,
    ok: projection === spec.projection,
  };
}
if (section)
  section.resizeWithoutConstraints(
    100 + Math.max(...section.children.map((n) => n.x + n.width)),
    100 + Math.max(...section.children.map((n) => n.y + n.height)),
  );
// The first frame that reads back differently, as Figma has it, to compare with the spec's projection.
const bad = Object.entries(receipt.frames)
  .filter(([, v]) => !v.ok)
  .map(([k]) => k);
if (bad.length)
  receipt.firstBad = {
    key: bad[0],
    tree: readFrame(await figma.getNodeByIdAsync(receipt.frames[bad[0]].id)),
  };
return receipt;
