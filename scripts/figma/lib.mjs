// Shared helpers for the Figma sync (figma/README.md): stable JSON, FNV-1a checksums, and the
// "Figma projection" of a spec tree (what a read-back of the Figma frame can see).
export const SPEC_SCHEMA = 1;

/** JSON with sorted object keys, so equal specs serialize to equal text. */
export function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .sort()
      .filter((k) => v[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}

/** FNV-1a 32-bit as 8 hex digits (the same hash hds's figma/snapshot.json uses). */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** The tree without measured boxes (`sz`): layout data for the runtime, not part of a checksum. */
export const unsized = (nodes) =>
  nodes.map(({ sz, ...n }) => (n.k ? { ...n, k: unsized(n.k) } : n));

/** The checksum of one frame's spec: its tree (without `sz`), size and theme. */
export const frameChecksum = (f) =>
  fnv1a(
    stable({
      tree: unsized(f.tree),
      width: f.width,
      height: f.height,
      theme: f.theme,
      gap: f.gap ?? [],
    }),
  );

/** HDS components drawn as one library instance: the spec keeps their text, not their insides. */
export const LEAF = [
  'Alert',
  'Avatar',
  'Badge',
  'Button',
  'Checkbox',
  'Divider',
  'Icon',
  'IconButton',
  'InlineLink',
  'Input',
  'Kbd',
  'Pagination',
  'Progress',
  'Radio',
  'SegmentedControl',
  'Select',
  'Skeleton',
  'Spinner',
  'Switch',
  'Tag',
  'Text',
  'Textarea',
  'Toggle',
  'Timestamp',
  'MenuItem',
  'Toast',
];
const LEAFS = new Set(LEAF);
export const isLeaf = (n) => LEAFS.has(n.c) || n.c.startsWith('#') || n.c === 'svg';

/**
 * The projection of a spec tree that the Figma frame carries in its own nodes: each node's name
 * (the HDS component or element), a leaf's text, and a container's auto-layout direction (row,
 * else column). figma-runtime.js builds nodes so that its read-back gives exactly this; the drift
 * check compares the two.
 */
export function project(nodes) {
  return nodes.map((n) => {
    if (isLeaf(n)) return n.t ? { c: n.c, t: n.t } : { c: n.c };
    const o = { c: n.c, d: n.l && n.l.dir === 'row' ? 'row' : 'column' };
    if (n.k && n.k.length) o.k = project(n.k);
    return o;
  });
}
export const projectionChecksum = (f) => fnv1a(stable(project(f.tree)));
