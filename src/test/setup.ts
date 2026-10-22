import { beforeEach } from 'vitest';
import { resetPipelineView } from '../pipelineView';
import { closeFollowUp } from '../followUpFlow';
import { resetTabMemory } from '../tabMemory';
import { resetViewMemory } from '../viewMemory';
import { resetHistoryRecord } from '../route';
import '@testing-library/jest-dom/vitest';

// jsdom has no scrolling; JobPage scrolls to the top on open (#127).
window.scrollTo = () => {};

// The Pipeline's filter/sort/search is shared in-memory state (#130): every test starts on Active.
beforeEach(resetPipelineView);

// The follow-up dialog's open job is in-memory too: no test starts with it open.
beforeEach(closeFollowUp);

// Where each top tab was left, and which rows were open (return paths): no test inherits them.
beforeEach(resetTabMemory);
beforeEach(resetViewMemory);
// No test starts on a sheet's history entry left open by the one before (useBackCloses).
beforeEach(resetHistoryRecord);

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
