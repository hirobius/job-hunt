// Placeholder mark left of the wordmark (Adrian 2026-10-22): a plain, quiet rounded square until a
// logo exists. Decorative: the wordmark beside it carries the name. Styled by `.rjb-brand-mark` in
// base.css (HDS tokens only, no motion). The icons draw the same square (scripts/make-icons.mjs).
export function BrandMark() {
  return <span className="rjb-brand-mark" aria-hidden="true" />;
}
