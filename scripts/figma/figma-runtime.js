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
  const o = { c, d: node.layoutMode === 'HORIZONTAL' ? 'row' : 'column' };
  const kids =
    'children' in node
      ? node.children.filter((k) => k.getSharedPluginData(NS, 'chrome') !== '1').map(readNode)
      : [];
  if (kids.length) o.k = kids;
  return o;
}
// Overlay holders ("layer: …") are drawing scaffolds, not spec nodes: read through them.
const readFrame = (f) =>
  f.children
    .filter((k) => k.getSharedPluginData(NS, 'chrome') !== '1')
    .flatMap((k) => (k.name.startsWith('layer: ') ? k.children.map(readNode) : [readNode(k)]));
const owned = () =>
  page.children.filter(
    (n) => n.type === 'FRAME' && n.getSharedPluginData(NS, 'owner') === DATA.owner,
  );

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
const icons = {};
async function iconFor(name) {
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
  try {
    if (parentDir === 'VERTICAL') node.layoutSizingHorizontal = 'FILL';
    else if (node.name === '#text' || node.name === 'Text') node.layoutGrow = 1;
  } catch {
    /* fixed-size instance */
  }
  if (node.type === 'INSTANCE' && (node.name === '#text' || node.name === 'Text')) {
    const t = node.findOne((x) => x.type === 'TEXT');
    try {
      if (t) t.textAutoResize = 'HEIGHT';
    } catch {
      /* locked by the component */
    }
  }
}

// Payload arrays (push.mjs slim() and encode()) back to nodes: [c, t, p] leaf and
// [c, row, gap, pad, kids] container, strings and objects as indexes into DATA.s.
const S = DATA.s || [];
function node(a) {
  if (a.length === 5 && Array.isArray(a[4]))
    return {
      c: S[a[0]],
      l: {
        dir: a[1] ? 'row' : 'column',
        wrap: a[1] === 2,
        gapPx: a[2],
        padPx: a[3] ? S[a[3]] : null,
      },
      k: a[4].map(node),
    };
  return { c: S[a[0]], t: a.length > 1 ? S[a[1]] : '', p: a.length > 2 ? S[a[2]] : {} };
}
async function build(n, parent) {
  const parentDir = parent.layoutMode;
  if (n.c === '#text') {
    const t = await plainText(n.t, '#text');
    parent.appendChild(t);
    fill(t, parentDir);
    return;
  }
  if (!n.k) {
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
        try {
          inst.setProperties(variantProps(set, n.p));
        } catch {
          /* keep the default variant */
        }
        await setText(inst, n.t);
        fill(inst, parentDir);
        return;
      }
    }
    if (comp) {
      const inst = comp.createInstance();
      parent.appendChild(inst);
      inst.name = name;
      await setText(inst, n.t);
      return;
    }
    // No HDS part for it (an element, or a GAP): a local frame named after it, holding its text.
    const f = figma.createAutoLayout('HORIZONTAL', { name });
    f.fills = [];
    f.setSharedPluginData(NS, 'leaf', '1');
    parent.appendChild(f);
    if (n.t) f.appendChild(await plainText(n.t, 'text'));
    fill(f, parentDir);
    return;
  }
  const dir = n.l && n.l.dir === 'row' ? 'HORIZONTAL' : 'VERTICAL';
  const f = figma.createAutoLayout(dir, { name: n.c });
  f.fills = [];
  parent.appendChild(f);
  if (n.l) {
    if (n.l.gapPx) f.itemSpacing = n.l.gapPx;
    if (n.l.wrap && dir === 'HORIZONTAL') f.layoutWrap = 'WRAP';
    if (n.l.padPx) [f.paddingTop, f.paddingRight, f.paddingBottom, f.paddingLeft] = n.l.padPx;
  }
  fill(f, parentDir);
  for (const k of n.k || []) await build(k, f);
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
    r.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0.6 }];
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
  const w = isToast ? Math.min(W - 32, 420) : isMenu ? 280 : phone ? W : Math.min(W - 64, 640);
  holder.resize(w, Math.max(1, holder.height));
  holder.counterAxisSizingMode = 'FIXED';
  holder.primaryAxisSizingMode = 'AUTO';
  const body = holder.children[0];
  if (body && !isToast) {
    body.fills = [
      {
        type: 'SOLID',
        color: spec.theme === 'dark' ? { r: 0.09, g: 0.1, b: 0.12 } : { r: 1, g: 1, b: 1 },
      },
    ];
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
  if (phone && !isMenu && !isToast) holder.resize(w, H);
}
for (const spec of DATA.frames) {
  let frame = owned().find((f) => f.getSharedPluginData(NS, 'key') === spec.key);
  if (frame) {
    for (const c of [...frame.children]) c.remove();
    receipt.updated.push(spec.key);
  } else {
    frame = figma.createFrame();
    page.appendChild(frame);
    frame.x = spec.width === 390 ? 0 : 600;
    frame.y = bottom;
    bottom += spec.height + 200;
    receipt.created.push(spec.key);
  }
  frame.name = `${spec.width} / ${spec.name}`;
  // The viewport, fixed: 390x844 or 1440x900. The page scrolls under it, as in the app.
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'FIXED';
  frame.counterAxisSizingMode = 'FIXED';
  frame.resize(spec.width, spec.height);
  frame.clipsContent = true;
  frame.fills = [
    {
      type: 'SOLID',
      color: spec.theme === 'dark' ? { r: 0.05, g: 0.06, b: 0.08 } : { r: 1, g: 1, b: 1 },
    },
  ];
  await themeFrame(frame, spec.theme, null);
  const tree = spec.tree || DATA.frames.find((x) => x.key === spec.same).tree;
  const [main, ...rest] = tree;
  if (main) await build(node(main), frame);
  for (const n of rest) await overlay(node(n), frame, spec);
  frame.setSharedPluginData(NS, 'owner', DATA.owner);
  frame.setSharedPluginData(NS, 'key', spec.key);
  frame.setSharedPluginData(NS, 'checksum', spec.checksum);
  frame.setSharedPluginData(NS, 'gap', (spec.gap || []).join('\n'));
  const projection = fnv1a(stable(readFrame(frame)));
  receipt.frames[spec.key] = {
    id: frame.id,
    checksum: spec.checksum,
    projection,
    ok: projection === spec.projection,
  };
}
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
