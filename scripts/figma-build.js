// Figma-side builder for scripts/figma-extract.mjs output (runs inside use_figma).
// scripts/figma-pack.mjs prepends: const D = {...screen}, S = [...run styles], META = {...}.
// Draws one screen as a frame: HDS library instances for buttons, badges, tabs, inputs and icons,
// HDS text styles for type, HDS variables for every colour. Positions are absolute, 1:1 with code.
const K = {
  set: {
    Button: '8f3ee9aac8d063dd52c45cc73cbdab6bd14af782',
    Badge: '2423066266b23d69add499d79b15e5db47660c19',
    Tab: '11ab11cf094cc4043480a7f7526ac52fb1462be5',
    Input: '14e4240b2ffacf065fa4b7c7e1723a9710258ff4',
    Textarea: '5937cc84bef903ac2375c9f13c601dc3997ff201',
  },
  ty: {
    body: 'e9a1ab5bc267352eb0a2c98b719647dd35552d63',
    ui: 'd0d958d10e42931dc895aff494d4223b234b1514',
    caption: '13cc7b1dc5bb6d2099f8761089de4182291525de',
    title: '99bef052035a9b41fd89f515a7caf26e5543b184',
    display: 'b58ab8d66881d8332fb5c8cc929381d532dca46e',
    mono: '3152dfb215c24e851e1a06cc92bb552a9c58b7e5',
  },
  v: {
    'color/content/primary': 'be7a1735a9f26aac51bdbeb11aa9dbba975eec6b',
    'color/content/secondary': 'cfd7c407dca3017db207210fdda0ec5f1f1fb074',
    'color/content/tertiary': '5c7ad1065869201e60c40d0f0ecba79d82eb25ca',
    'color/content/disabled': 'fc59eb6f19e3918eb8c7efc8f0086d52a1ef14b4',
    'color/content/inverse': '9b0cfed4d478fad2f43de6403793ba43f9636f02',
    'color/content/accent': 'be6f2e6f44fefb884a9ff5b3b02c00b0eb788dae',
    'color/content/onAccent': '7b821797a3bb672764dad1c38b70af5885d83242',
    'color/content/success': '191e22a064ff9700770a3c91cb33bae1d8621930',
    'color/content/warning': '81863d69cb280ebff45fec3ffaeb7e7a87292529',
    'color/content/danger': 'f52d145d286f3dd418a272b7c0b9240489ec72c9',
    'color/surface/page': 'dffeb1b62ededb88d89b729344f5a9d5651fe456',
    'color/surface/raised': '666123f89b794aa99e4aba00b49c10dea880279f',
    'color/surface/overlay': 'b6dfe6c09b304d18ba79747553c05813c0b3f19e',
    'color/surface/scrim': '964f9e04ac3373a7e2a410b45a84bae2b9ddbcbe',
    'color/surface/inverse': 'e05de0043e6b1bc424a308b2cd22660f289f11ad',
    'color/surface/accent': '29dbc6da4debf8deef0be81a3b4e3d1530e62231',
    'color/surface/accentSubtle': '1691e90289d67f06e6d1e3afd67efd8ce5f8a6e0',
    'color/surface/hover': '62bf59972d418e7db0b8c9242a8cf70e869753e7',
    'color/surface/pressed': '28293de7f96a4feef801af25dd8d31e97269c8b3',
    'color/surface/selected': '8981d900acc1897817fa61d773c60c6033478f47',
    'color/surface/muted': 'c2fe153fd62d18c639dcf2d23e058fc1fe88ec2f',
    'color/surface/sunken': '0ddd03e8010ec8cf2b42635292c2c58e0c741d61',
    'color/border/default': '010aeca437ac2a6eb0d4e3d58f8afb8a675d7708',
    'color/border/interactive': 'f4d0119fc3486c88e93237ccd351aee2e6e57edd',
    'color/border/subtle': '9d9c75a845931d97614e1b7747c0c4ce2b61460e',
    'color/border/strong': '70ac046dcabcf14fa4272e1a5214e3a929456690',
    'color/border/accent': '0bb0abf37cc6b0043f882a96358c93d8db3dd5d6',
    'color/border/success': '6582c5b1aff1fcae2322af109b8d1e006a779fd6',
    'color/border/warning': '8bbbfaee451f55c0d013e5e2a349d26bb0a47d6f',
    'color/feedback/error': '3c78aa38d3f07c7cc5532d64ed96bbc6a31eb97e',
    'color/feedback/success': '092b45554a9ef9ba351812fecaae58bc22ec0f8c',
    'color/feedback/warning': '8765632afd9c40015a0b0f689139ae0a24b235b2',
    'color/feedback/info': 'cc5caf595be7c3b280ecd98ce2a182c04b64ada2',
    'color/feedback/inProgress': '861287d6561b88ab57333ebc1f4d2e20cb5f8db5',
    'color/feedback/bg/error': '1062320599098d42f7a20399629e44cafbac06c2',
    'color/feedback/bg/success': 'db2dffb9c6ce483a0c768b8bbfae70fd7e40fad5',
    'color/feedback/bg/warning': 'd9705beac0ef09deeec785e24da0a33eea6253f2',
    'color/feedback/bg/info': '8298a78d804112290fbf05ee6714f0b674582762',
    'color/feedback/bg/inProgress': 'c35a20e2713a605cdeecf494b3cf0bf10910dc21',
  },
  ic: {
    archive: '2023b67c58a17878f78e83c3537e77071ea9246f',
    'arrow-left': '3ebd4da2d8c15316da178eac8d36892ba6338495',
    'chevron-down': 'fb0ee8362b86a14d3db6627dc2ac429a7fb83557',
    'chevron-left': '2c2c2f289acd60b1aca8afbf0752b16cffe04ba3',
    'chevron-up': '2bc77d53100bbe9be89637f916e5bae94ad10d5a',
    cloud: '6d497df52dda5b971ddfb7b0be661be8eeabe812',
    copy: '42c00142360e8182fe2c388893675d0c95427662',
    'ellipsis-vertical': '68f0d7ef8608a41ee3a9095f8a70c1d4ed690500',
    'more-vertical': '68f0d7ef8608a41ee3a9095f8a70c1d4ed690500',
    'map-pin': 'c6f7c8217bb09f9cbfe267e055bb9fa4d9717c91',
    menu: 'df0513243a81ab9f63c2df88ec337e118aef0ec0',
    pencil: '4d7c54c9e9973f43cbc1eef96e1804536ff198e2',
    plus: '16dc8677b6cb37dc51a616a00fe0ba2b9eb9c684',
    search: 'a3a354adea777ca841f3550559f36f6a0ed7a2fe',
    star: '57b0373c5f3e02a54d623628d0310635213b71a7',
    x: '38dd3b56604c53ff5bd4a6822629caf7b3cf2615',
    check: 'ec632484506015bf986c6578b389a0c82a6de4b2',
    'triangle-alert': '4fe12bacedc0e9b754937964516d6c684123f6f5',
    calendar: '8e64c631b0727756ffccc203beac75fe78d717a3',
    'external-link': 'f14ff81f8b31712dd4dcb5f679ba9ceeb5b3ce70',
  },
};
const WEIGHT = {
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'ExtraBold',
};
const memo = new Map();
const once = (k, f) => {
  if (!memo.has(k)) memo.set(k, f());
  return memo.get(k);
};
const variable = (t) =>
  K.v[t] ? once('v' + t, () => figma.variables.importVariableByKeyAsync(K.v[t])) : null;
const set = (n) => once('s' + n, () => figma.importComponentSetByKeyAsync(K.set[n]));
const icon = (n) =>
  K.ic[n] ? once('i' + n, () => figma.importComponentByKeyAsync(K.ic[n])) : null;
const tstyle = (n) => (K.ty[n] ? once('t' + n, () => figma.importStyleByKeyAsync(K.ty[n])) : null);
const hex = (h) => ({
  r: parseInt(h.slice(1, 3), 16) / 255,
  g: parseInt(h.slice(3, 5), 16) / 255,
  b: parseInt(h.slice(5, 7), 16) / 255,
});
async function paint(c) {
  if (!c) return null;
  const base = {
    type: 'SOLID',
    color: c.c.startsWith('#') ? hex(c.c) : { r: 0, g: 0, b: 0 },
    opacity: c.a ?? 1,
  };
  const v = c.c.startsWith('#') ? null : await variable(c.c);
  return v ? figma.variables.setBoundVariableForPaint(base, 'color', v) : base;
}
const fontFor = (s) => ({
  family: s.f && !/sans-serif|system/.test(s.f) ? s.f : 'Plus Jakarta Sans',
  style: (WEIGHT[s.w] || 'Regular') + (s.i ? ' Italic' : '').replace('Regular Italic', 'Italic'),
});
const loaded = new Set();
async function load(fn) {
  const k = fn.family + '|' + fn.style;
  if (loaded.has(k)) return fn;
  try {
    await figma.loadFontAsync(fn);
  } catch (e) {
    fn = { family: fn.family, style: fn.style.replace('SemiBold', 'Semi Bold') };
    await figma.loadFontAsync(fn);
  }
  loaded.add(k);
  return fn;
}
const place = (n, d, parent) => {
  parent.appendChild(n);
  n.x = d.x;
  n.y = d.y;
};
const pick = (cs, want) =>
  cs.children.find((c) => Object.entries(want).every(([k, v]) => c.name.includes(`${k}=${v}`))) ||
  cs.defaultVariant;
const prop = (inst, prefix) =>
  Object.keys(inst.componentProperties).find((k) => k.startsWith(prefix));
async function recolor(node, c) {
  const p = await paint(c);
  if (!p) return;
  for (const v of node.findAll((n) => 'strokes' in n)) {
    if (v.strokes && v.strokes.length) v.strokes = [p];
    if (v.fills && v.fills.length && v.type !== 'FRAME' && v.type !== 'INSTANCE') v.fills = [p];
  }
}
async function svgNode(svg, d, c) {
  const n = figma.createNodeFromSvg(svg);
  n.resize(Math.max(1, d.w), Math.max(1, d.h));
  if (c) await recolor(n, c);
  return n;
}

let count = 0;
async function build(d, parent) {
  count++;
  if (d.k === 'frame') {
    const f = figma.createFrame();
    f.name = d.n || 'frame';
    f.resize(Math.max(1, d.w), Math.max(1, d.h));
    f.fills = d.fill ? [await paint(d.fill)] : [];
    f.clipsContent = !!d.clip;
    if (d.st) {
      f.strokes = [await paint(d.st.c)];
      f.strokeAlign = 'INSIDE';
      if (Array.isArray(d.st.ws))
        [f.strokeTopWeight, f.strokeRightWeight, f.strokeBottomWeight, f.strokeLeftWeight] =
          d.st.ws;
      else f.strokeWeight = d.st.ws;
    }
    if (d.rad != null) {
      if (Array.isArray(d.rad))
        [f.topLeftRadius, f.topRightRadius, f.bottomRightRadius, f.bottomLeftRadius] = d.rad;
      else f.cornerRadius = d.rad;
    }
    if (d.sh)
      f.effects = d.sh.map((s) => ({
        type: s.in ? 'INNER_SHADOW' : 'DROP_SHADOW',
        color: { r: s.c[0] / 255, g: s.c[1] / 255, b: s.c[2] / 255, a: s.c[3] },
        offset: { x: s.x, y: s.y },
        radius: s.b,
        spread: s.s,
        visible: true,
        blendMode: 'NORMAL',
      }));
    if (d.op != null) f.opacity = d.op;
    place(f, d, parent);
    for (const c of d.c || []) await build(c, f);
    return;
  }
  if (d.k === 'text') {
    const t = figma.createText();
    const runs = d.r.map(([s, si]) => [s, S[si]]);
    const fonts = [];
    for (const [, s] of runs) fonts.push(await load(fontFor(s)));
    const st = d.ty ? await tstyle(d.ty) : null;
    if (st) await load(st.fontName);
    t.characters = runs.map((r) => r[0]).join('');
    const s0 = runs[0][1];
    if (st && st.fontSize === s0.s) await t.setTextStyleIdAsync(st.id);
    let i = 0;
    for (const [k, [str, s]] of runs.entries()) {
      const a = i,
        b = i + str.length;
      i = b;
      if (a === b) continue;
      if (!(
        st &&
        st.fontSize === s.s &&
        st.fontName.family === fonts[k].family &&
        st.fontName.style === fonts[k].style
      )) {
        t.setRangeFontName(a, b, fonts[k]);
        t.setRangeFontSize(a, b, s.s);
        if (s.lh) t.setRangeLineHeight(a, b, { unit: 'PIXELS', value: s.lh });
        if (s.ls) t.setRangeLetterSpacing(a, b, { unit: 'PIXELS', value: s.ls });
      }
      t.setRangeFills(a, b, [await paint(s.col)]);
      if (s.ul) t.setRangeTextDecoration(a, b, 'UNDERLINE');
      if (s.st) t.setRangeTextDecoration(a, b, 'STRIKETHROUGH');
      if (s.u) t.setRangeTextCase(a, b, 'UPPER');
    }
    t.name = t.characters.slice(0, 40);
    if (d.al) t.textAlignHorizontal = d.al === 'C' ? 'CENTER' : 'RIGHT';
    if (d.ell) {
      t.textAutoResize = 'NONE';
      t.resize(Math.max(1, d.w + 2), Math.max(1, d.h));
      t.maxLines = 1;
      t.textTruncation = 'ENDING';
    } else if (d.wrap) {
      t.resize(Math.max(1, d.w + 1), Math.max(1, d.h));
      t.textAutoResize = 'HEIGHT';
    } else t.textAutoResize = 'WIDTH_AND_HEIGHT';
    // one-line text keeps hugging; centred or right-aligned text is placed by its box in code
    const dx = !d.wrap && !d.ell && d.al ? (d.al === 'C' ? (d.w - t.width) / 2 : d.w - t.width) : 0;
    d = { ...d, x: d.x + dx };
    place(t, d, parent);
    return;
  }
  if (d.k === 'icon') {
    const comp = d.ic ? await icon(d.ic) : null;
    const n = comp ? comp.createInstance() : await svgNode(d.svg, d, null);
    n.name = d.ic ? 'Icon/' + d.ic : 'icon';
    // rescale, not resize: lucide strokes thin out with the glyph in code (2px at 24 → 1.33px at 16)
    if (comp) n.rescale(d.w / n.width);
    await recolor(n, d.col);
    if (d.fl) {
      const f = await paint(d.fl);
      for (const v of n.findAll((v) => 'fills' in v && !/FRAME|INSTANCE|GROUP/.test(v.type)))
        v.fills = [f];
    }
    place(n, d, parent);
    return;
  }
  if (d.k === 'button') {
    const cs = await set('Button');
    const inst = pick(cs, {
      Variant: d.v,
      Tone: d.tone,
      Size: d.sz,
      State: d.dis ? 'Disabled' : 'Default',
      'Icon only': d.io ? 'true' : 'false',
    }).createInstance();
    const props = {};
    const lb = prop(inst, 'Label#');
    if (lb && d.lb) props[lb] = d.lb;
    const lead = d.io ? d.ic : d.li;
    const showI = prop(inst, 'Show icon#'),
      iconP = prop(inst, 'Icon#');
    const showT = prop(inst, 'Show trail icon#'),
      trailP = prop(inst, 'Trail Icon#');
    if (showI && !d.io) props[showI] = !!lead;
    const li = lead ? await icon(lead) : null;
    if (li && iconP) props[iconP] = li.id;
    if (showT) props[showT] = !!d.ti;
    const ti = d.ti ? await icon(d.ti) : null;
    if (ti && trailP) props[trailP] = ti.id;
    inst.setProperties(props);
    // the library's icon-only variants do not wire the Icon property to their glyph yet: swap it directly
    if (d.io && li) {
      const glyph = inst.findOne(
        (n) =>
          n.type === 'INSTANCE' &&
          n.visible &&
          n.mainComponent &&
          n.mainComponent.name.startsWith('Icon/'),
      );
      if (glyph && glyph.mainComponent.id !== li.id) glyph.swapComponent(li);
    }
    inst.name = 'Button – ' + (d.n || d.lb);
    inst.resize(Math.max(1, d.w), inst.height);
    place(inst, d, parent);
    // an icon the library does not have yet: hide the default glyph, draw the code's SVG over it
    const missing = [lead && !li ? 0 : -1, d.ti && !ti ? (d.svgs || []).length - 1 : -1].filter(
      (x) => x >= 0,
    );
    for (const idx of missing) {
      const svg = (d.svgs || [])[idx];
      const slot = inst.findOne(
        (n) =>
          n.type === 'INSTANCE' &&
          n.visible &&
          n.name.includes('Icon') &&
          (idx === 0 ? !n.name.includes('Trail') : n.name.includes('Trail')),
      );
      if (slot) slot.opacity = 0;
      if (svg && slot) {
        const g = await svgNode(svg, { w: slot.width, h: slot.height }, null);
        g.name = 'Icon/' + (idx === 0 ? lead : d.ti) + ' (code SVG)';
        parent.appendChild(g);
        g.x = d.x + slot.absoluteTransform[0][2] - inst.absoluteTransform[0][2];
        g.y = d.y + slot.absoluteTransform[1][2] - inst.absoluteTransform[1][2];
      }
    }
    return;
  }
  if (d.k === 'badge') {
    const inst = pick(await set('Badge'), { Tone: d.tone }).createInstance();
    inst.setProperties({ [prop(inst, 'Label#')]: d.lb });
    inst.name = 'Badge – ' + d.lb;
    place(inst, d, parent);
    return;
  }
  if (d.k === 'tab') {
    const inst = pick(await set('Tab'), { State: d.on ? 'Active' : 'Default' }).createInstance();
    inst.setProperties({ [prop(inst, 'Label#')]: d.lb });
    inst.name = 'Tab – ' + d.lb;
    inst.resize(Math.max(1, d.w), inst.height);
    place(inst, d, parent);
    return;
  }
  if (d.k === 'input' || d.k === 'textarea') {
    const cs = await set(d.k === 'input' ? 'Input' : 'Textarea');
    const inst = pick(cs, { State: 'Default', Size: d.sz }).createInstance();
    const p = {};
    const show = prop(inst, 'Show label#'),
      val = prop(inst, 'Value#') || prop(inst, 'Placeholder#');
    if (show) p[show] = false;
    if (val) p[val] = d.val || ' ';
    inst.setProperties(p);
    // the library does not wire Show label / Value to its text layers yet: set them directly
    for (const t of inst.findAll((n) => n.type === 'TEXT')) {
      if (/label/i.test(t.name)) t.visible = false;
      else if (t.name === 'Value' || /placeholder|value/i.test(t.characters)) {
        await figma.loadFontAsync(t.fontName);
        t.characters = d.val || ' ';
      }
    }
    // a long value scrolls inside the field in code: clip it rather than spill over what follows
    if (d.k === 'textarea') {
      inst.clipsContent = true;
      for (const f of inst.findAll((n) => n.type === 'FRAME')) f.clipsContent = true;
    }
    inst.name = (d.k === 'input' ? 'Input – ' : 'Textarea – ') + d.n;
    inst.resize(Math.max(1, d.w), d.k === 'textarea' ? Math.max(1, d.h) : inst.height);
    place(inst, d, parent);
    // a leading icon drawn before the field (search) sits inside it: bring it back on top
    for (const c of [...parent.children])
      if (
        c !== inst &&
        c.name.startsWith('Icon') &&
        c.x >= inst.x &&
        c.y >= inst.y &&
        c.x + c.width <= inst.x + inst.width &&
        c.y + c.height <= inst.y + inst.height
      )
        parent.appendChild(c);
    // match the code's inner padding (e.g. room for a leading search icon)
    const field = inst.findOne(
      (n) => n.type === 'FRAME' && 'paddingLeft' in n && n.strokes && n.strokes.length,
    );
    if (field && d.pl)
      try {
        field.paddingLeft = d.pl;
      } catch (e) {
        /* bound padding */
      }
    return;
  }
  if (d.k === 'img') {
    const r = figma.createRectangle();
    r.resize(Math.max(1, d.w), Math.max(1, d.h));
    r.name = d.n;
    r.fills = [await paint({ c: 'color/surface/muted' })];
    place(r, d, parent);
  }
}

const page = figma.root.children.find((p) => p.name === META.page) || figma.createPage();
page.name = META.page;
await figma.setCurrentPageAsync(page);
let root = page.children.find((n) => n.name === META.name);
if (META.first) {
  // rebuild in place so the frame keeps its node id (Code Connect and docs link to it)
  if (root) for (const c of [...root.children]) c.remove();
  else root = figma.createFrame();
  root.name = META.name;
  root.resize(D.w, D.h);
  root.fills = [await paint(D.bg)];
  root.clipsContent = true;
  root.x = META.x;
  root.y = META.y;
}
if (!root) throw new Error('Screen frame not found: ' + META.name);
const filled = [];
for (const [ref, nodes] of P) {
  const target = ref ? root.findOne((n) => n.name.endsWith(' #' + ref)) : root;
  if (!target) throw new Error('Ref frame not found: ' + ref);
  for (const c of nodes) await build(c, target);
  filled.push([ref, target]);
}
// a ref frame keeps its marker until every part for it has run; the packer sends each ref's
// overflow in order, so the last part to touch a ref clears it
for (const [ref, t] of filled)
  if (ref && !META.more?.includes(ref)) t.name = t.name.replace(' #' + ref, '');
return { rootId: root.id, nodes: count, page: page.id };
