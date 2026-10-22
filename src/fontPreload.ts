// The body font's preload tag for the built index.html (the `preload-font` plugin in
// vite.config.ts). Pure, so the test can check it without a build.
const BODY_FONT = /(^|\/)plus-jakarta-sans-variable-[\w-]+\.woff2$/;

/** A preload <link> for the hashed body font among the bundle's file names, or null. */
export function fontPreloadTag(files: string[]): string | null {
  const file = files.find((f) => BODY_FONT.test(f));
  return file
    ? `<link rel="preload" href="/${file}" as="font" type="font/woff2" crossorigin>`
    : null;
}
