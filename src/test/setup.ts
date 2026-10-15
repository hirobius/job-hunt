import { beforeEach } from 'vitest';
import { resetPipelineView } from '../pipelineView';
import '@testing-library/jest-dom/vitest';

// jsdom has no scrolling; JobPage scrolls to the top on open (#127).
window.scrollTo = () => {};

// The Pipeline's filter/sort/search is shared in-memory state (#130): every test starts on Active.
beforeEach(resetPipelineView);
