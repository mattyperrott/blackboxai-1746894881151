const CACHE_NAME = 'epher-cache-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/css/main.css',
    '/css/vendor-fixes.css',
    '/vendor/mdl/mdl.min.css',
    '/vendor/tailwind/tailwind.min.css',
    '/vendor/fonts/roboto.css',
    '/vendor/fontawesome/css/icons.css',
    '/js/main.js',
    '/js/utils.js',
    '/js/cryptoBridge.js',
    '/js/cryptoWorker.js',
    '/js/services/logger.js',
    '/js/services/session.js',
    '/js/services/message-store.js',
    '/js/message-handlers.js',
    '/js/file-handlers.js'
];

// Install event - cache assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Caching app assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
    );
});

// Activate event - cleanup old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => {
                        console.log('Removing old cache:', name);
                        return caches.delete(name);
                    })
            );
        })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
    // Skip for API calls or non-GET requests
    if (!event.request.url.startsWith(self.location.origin) || 
        event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response; // Return cached version
                }

                // Clone the request because it's a one-time use stream
                const fetchRequest = event.request.clone();

                return fetch(fetchRequest).then(response => {
                    // Check if valid response
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }

                    // Clone the response because it's a one-time use stream
                    const responseToCache = response.clone();

                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });

                    return response;
                });
            })
    );
});

// Handle offline message queue
const messageQueue = [];

// Listen for messages from the main thread
self.addEventListener('message', event => {
    if (event.data.type === 'QUEUE_MESSAGE') {
        messageQueue.push(event.data.message);
        event.ports[0].postMessage({ success: true });
    }
});

// Attempt to send queued messages when online
self.addEventListener('sync', event => {
    if (event.tag === 'sync-messages') {
        event.waitUntil(
            Promise.all(
                messageQueue.map(message =>
                    fetch('/api/messages', {
                        method: 'POST',
                        body: JSON.stringify(message),
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    }).then(response => {
                        if (response.ok) {
                            // Remove from queue if sent successfully
                            const index = messageQueue.indexOf(message);
                            if (index > -1) {
                                messageQueue.splice(index, 1);
                            }
                        }
                    })
                )
            )
        );
    }
});

// Periodic sync for keeping the app up to date
self.addEventListener('periodicsync', event => {
    if (event.tag === 'update-cache') {
        event.waitUntil(
            caches.open(CACHE_NAME).then(cache => {
                return cache.addAll(ASSETS_TO_CACHE);
            })
        );
    }
});
