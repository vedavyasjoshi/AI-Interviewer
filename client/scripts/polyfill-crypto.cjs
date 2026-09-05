// Build-time preload: Node 18 doesn't expose a global `crypto` that the
// workbox-build service-worker generator relies on. Injecting it here (via
// NODE_OPTIONS --require, before any module loads) makes it visible in every
// module scope, unlike assigning it inside vite.config.js. No-op on Node 20+.
const { webcrypto } = require('node:crypto');
if (!global.crypto || typeof global.crypto.getRandomValues !== 'function') {
  Object.defineProperty(global, 'crypto', {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
}
