/**
 * COPYRIGHT 2022 Phil Bladen www.philbladen.co.uk
 */

declare let self: ServiceWorkerGlobalScope; // NOTE: The default context is just Worker and we need to be the more specific ServiceWorker

const RUNTIME = "runtime";
const MINUTE = 60 * 1000;
const CACHE_TIMEOUT = 30 * MINUTE;

/**
 * Check if cached API data is still valid
 * @param  {Object}  response The response object
 * @return {Boolean}          If true, cached data is valid
 */
const isValid = function (response: any): boolean {
    if (!response) return false;
    var fetched = response.headers.get("sw-fetched-on");
    if (fetched && parseFloat(fetched) + CACHE_TIMEOUT > new Date().getTime())
        return true;
    return false;
};

self.addEventListener("install", (e) => {
    e.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
    const currentCaches = [RUNTIME];
    event.waitUntil(
        caches
            .keys()
            .then((cacheNames) => {
                return cacheNames.filter(
                    (cacheName) => !currentCaches.includes(cacheName)
                );
            })
            .then((cachesToDelete) => {
                return Promise.all(
                    cachesToDelete.map((cacheToDelete) => {
                        return caches.delete(cacheToDelete);
                    })
                );
            })
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    if (!event.request.url.startsWith(self.location.origin)) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return caches.open(RUNTIME).then((cache) => {
                    return fetch(event.request).then((response) => {
                        // Put a copy of the response in the runtime cache.
                        return cache
                            .put(event.request, response.clone())
                            .then(() => {
                                return response;
                            });
                    });
                });
            })
        );
    }
});

export default null; // We need an export to force this file to act like a module, so TS will let us re-type `self`
