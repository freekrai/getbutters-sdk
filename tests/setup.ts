import { GlobalRegistrator } from '@happy-dom/global-registrator'

// A browser-like global scope for every test: window, document, history,
// localStorage. Tests replace `fetch` themselves.
GlobalRegistrator.register({ url: 'https://example.com/' })
