// The Figma screen map (#197) stays true to the code: every frame names real source files whose
// default export is the named component, a real route and a shot that exists in the repo.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FIGMA_FILE_URL, FIGMA_SCREENS, figmaFileKey, frameUrl } from './figmaScreens';
import { parseHash } from './route';

const ROOT = resolve(__dirname, '..');

describe('Figma screen map (#197)', () => {
  // Today was retired (#236); its Figma frame is history.
  it('covers the four main screens once each', () => {
    expect(FIGMA_SCREENS.map((s) => s.id)).toEqual([
      'pipeline',
      'job-page',
      'discover',
      'templates',
    ]);
  });

  it.each(FIGMA_SCREENS)('$id: each source file default-exports its component', (screen) => {
    expect(screen.sources.length).toBeGreaterThan(0);
    for (const { file, component } of screen.sources) {
      const path = resolve(ROOT, file);
      expect(existsSync(path), file).toBe(true);
      expect(readFileSync(path, 'utf8'), file).toMatch(
        new RegExp(`export default function ${component}\\b`),
      );
    }
  });

  it.each(FIGMA_SCREENS)('$id: the route opens that screen', (screen) => {
    expect(parseHash(screen.route).tab).toBe(screen.tab);
  });

  it.each(FIGMA_SCREENS)('$id: both shots are in the repo', (screen) => {
    for (const w of [1440, 390]) {
      expect(
        existsSync(resolve(ROOT, `docs/figma/${screen.shot}-${w}.png`)),
        `${screen.shot}-${w}`,
      ).toBe(true);
    }
  });

  it('every frame link points into the one Figma file', () => {
    const key = figmaFileKey(FIGMA_FILE_URL);
    expect(key).toMatch(/^[0-9a-zA-Z]{22,128}$/);
    for (const screen of FIGMA_SCREENS) {
      expect(screen.nodeId, screen.id).toMatch(/^\d+:\d+$/);
      const url = frameUrl(screen);
      expect(figmaFileKey(url)).toBe(key);
      expect(url).toContain(`node-id=${screen.nodeId.replace(':', '-')}`);
    }
  });

  it('docs/figma/README.md lists every frame link and source file', () => {
    const doc = readFileSync(resolve(ROOT, 'docs/figma/README.md'), 'utf8');
    expect(doc).toContain(FIGMA_FILE_URL);
    for (const screen of FIGMA_SCREENS) {
      expect(doc).toContain(frameUrl(screen));
      for (const { file } of screen.sources) expect(doc).toContain(file);
    }
  });
});
