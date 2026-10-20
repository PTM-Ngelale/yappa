// Yappa's service worker. It's only here so every Android browser offers "Install app":
// it caches nothing (a game needs the network anyway) and has no fetch handler, so every
// request goes to the network exactly as it would without it.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
