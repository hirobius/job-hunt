import { beforeAll, beforeEach } from 'vitest';
import { preloadViews } from '../routeViews';
import { resetPipelineView } from '../pipelineView';
import { closeExportLinks } from '../exportLinks';
import { closeFollowUp } from '../followUpFlow';
import { configure } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// findBy*/waitFor give up after 1 s by default; a busy Vercel builder (verify runs in the deploy)
// can take longer to render, failing the production build on a slow machine, not a bug.
configure({ asyncUtilTimeout: 5000 });

// jsdom has no scrolling; JobPage scrolls to the top on open (#127).
window.scrollTo = () => {};

// The Pipeline's filter/sort/search is shared in-memory state (#130): every test starts on Active.
beforeEach(resetPipelineView);

// The shell's route views load on demand (routeViews.ts); load them up front so a test sees the
// Pipeline, job page, Apply mode and Company page on the first render, as before the split.
// beforeAll, not at import: the test file's vi.mock calls must be registered first.
beforeAll(() => preloadViews());

// The follow-up dialog's open job is in-memory too: no test starts with it open.
beforeEach(closeFollowUp);
// …and so is the Export links dialog's scope.
beforeEach(closeExportLinks);

// HDS Toast (Radix) captures the pointer for swipe-to-dismiss when its actions are clicked; jsdom
// has no pointer capture.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
// HDS Select (Radix) scrolls the picked option into view when it opens; jsdom has no layout.
Element.prototype.scrollIntoView ??= () => {};
// HDS Tooltip (Radix) measures its arrow with a ResizeObserver; jsdom has none. Every saved job's
// row now carries the Open posting tooltip (PostingLink), so any test that focuses one needs it.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
