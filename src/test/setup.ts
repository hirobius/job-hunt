import { beforeAll, beforeEach } from 'vitest';
import { preloadViews } from '../routeViews';
import { resetPipelineView } from '../pipelineView';
import { closeExportLinks } from '../exportLinks';
import { closeFollowUp } from '../followUpFlow';
import { closeAddInterview, closeRecentlyRemoved } from '../jobDialogs';
import { configure } from '@testing-library/react';
import { resetTabMemory } from '../tabMemory';
import { resetViewMemory } from '../viewMemory';
import { resetHistoryRecord } from '../route';
import { resetTabAccount } from '../tabAccount';
import { resetAnswerGuard } from '../answerGuard';
import { resetGoogleSignIn } from '../account/googleSignInFlag';
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
// beforeAll, not at import: the test file's vi.mock calls must be registered first. The sign-in and
// Export links dialogs load on their first open (#371): fetched here too.
beforeAll(() =>
  Promise.all([preloadViews(), import('../lazyDialogs').then((m) => m.preloadDialogs())]),
);

// The follow-up dialog's open job is in-memory too: no test starts with it open.
beforeEach(closeFollowUp);
// …and so is the Export links dialog's scope.
beforeEach(closeExportLinks);
// …and the Add interview and Recently removed dialogs' open state (#416).
beforeEach(closeAddInterview);
beforeEach(closeRecentlyRemoved);

// A document's unsaved draft is kept for the tab (docDrafts.ts): no test inherits another's.
beforeEach(() => sessionStorage.clear());

// Where each top tab was left, and which rows were open (return paths): no test inherits them.
beforeEach(resetTabMemory);
beforeEach(resetViewMemory);
// No test starts on a sheet's history entry left open by the one before (useBackCloses).
beforeEach(resetHistoryRecord);
// Every test is a fresh tab: no account, not frozen, shared storage writable (#288).
beforeEach(resetTabAccount);
// Mark applied / Not a fit ignore a second answer within 700 ms (a double tap): start each test fresh.
beforeEach(resetAnswerGuard);
// The Google button ships hidden (googleSignInFlag.ts); its suites turn it on.
beforeEach(resetGoogleSignIn);

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
// The Apply view's Templates (Adrian 2026-11-08) is closed by default, kept per device; most suites
// test what is inside it, so they start with it open (rapidApply.test.tsx pins the default).
