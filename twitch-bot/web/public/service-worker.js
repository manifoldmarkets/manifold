/**
 * COPYRIGHT 2022 Phil Bladen www.philbladen.co.uk
 * Minimal service worker to force a never-cache fetch approach.
 */

self.addEventListener('install', (e) => {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith(self.location.origin)) {
    event.respondWith(fetch(event.request));
  }
});
