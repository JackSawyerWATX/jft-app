import { JSDOM } from 'jsdom';

/** Client hook tests run separately from the server-only Node test process. */
export const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://doorknob.test/'
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  IS_REACT_ACT_ENVIRONMENT: true
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: dom.window.navigator
});
