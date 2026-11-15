// The app's stylesheets, loaded beside the first paint (Adrian 2026-11-15: a white page for ~1 s on
// a cold load while they blocked it). The late-css plugin (vite.config.ts) turns each entry
// stylesheet link into a preload marked `data-rjb-css`; here each becomes a stylesheet, and the app
// mounts once all are in, so it never paints unstyled. A failed one does not hold the app.
export function lateStyles(doc: Document = document): Promise<void> {
  const links = [...doc.querySelectorAll<HTMLLinkElement>('link[data-rjb-css]')];
  return Promise.all(
    links.map(
      (pre) =>
        new Promise<void>((done) => {
          const sheet = doc.createElement('link');
          sheet.rel = 'stylesheet';
          sheet.href = pre.href;
          if (pre.crossOrigin != null) sheet.crossOrigin = pre.crossOrigin;
          sheet.addEventListener('load', () => done(), { once: true });
          sheet.addEventListener('error', () => done(), { once: true });
          pre.after(sheet);
        }),
    ),
  ).then(() => undefined);
}

/** The build's index.html with each entry stylesheet as a preload the app turns on (lateStyles). */
export function lateCssHtml(html: string): string {
  return html.replace(
    /<link rel="stylesheet"( crossorigin)? href="(\/assets\/[^"]+\.css)">/g,
    (_m, cors: string | undefined, href: string) =>
      `<link rel="preload" as="style"${cors ?? ''} href="${href}" data-rjb-css>`,
  );
}
