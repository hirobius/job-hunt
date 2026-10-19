import '@testing-library/jest-dom/vitest';

// jsdom has no scrolling; JobPage scrolls to the top on open (#127).
window.scrollTo = () => {};
