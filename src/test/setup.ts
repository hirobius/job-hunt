import { beforeEach } from 'vitest';
import { resetPipelineView } from '../pipelineView';
import { closeFollowUp } from '../followUpFlow';
import '@testing-library/jest-dom/vitest';

// jsdom has no scrolling; JobPage scrolls to the top on open (#127).
window.scrollTo = () => {};

// The Pipeline's filter/sort/search is shared in-memory state (#130): every test starts on Active.
beforeEach(resetPipelineView);

// The follow-up dialog's open job is in-memory too: no test starts with it open.
beforeEach(closeFollowUp);

// HDS Toast (Radix) captures the pointer for swipe-to-dismiss when its actions are clicked; jsdom
// has no pointer capture.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
// HDS Select (Radix) scrolls the picked option into view when it opens; jsdom has no layout.
Element.prototype.scrollIntoView ??= () => {};
