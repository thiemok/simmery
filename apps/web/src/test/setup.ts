import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());

// jsdom has no layout; the router's scroll restoration calls this.
window.scrollTo = () => {};
