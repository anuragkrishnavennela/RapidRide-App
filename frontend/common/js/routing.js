// common/js/routing.js
// Shared routing logic for RapidRide
// Implements: Client-Side OSRM -> Backend Proxy -> Fallback

(function () {
    if (window.RapidRideRouting) return;

    const Routing = {
        /**
         * Calculate route between two points
         * @param {Object} start - {lat, lng} or {lat, lon}
         * @param {Object} end - {lat, lng} or {lat, lon}
         * @returns {Promise<Object>} OSRM route object (geometry, distance, duration)
         */
        getRoute: async function (start, end) {
            const startLat = start.lat;
            const startLng = start.lng || start.lon;
            const endLat = end.lat;
            const endLng = end.lng || end.lon;

            if (!startLat || !startLng || !endLat || !endLng) {
                console.error('Routing: Invalid coordinates', { start, end });
                return null;
            }

            // 1. OSRM Public Servers (Mirrors for robustness)
            // Prioritize openstreetmap.de (More stable) over project-osrm.org
            const mirrors = [
                'https://routing.openstreetmap.de/routed-car/route/v1/driving',
                'https://router.project-osrm.org/route/v1/driving'
            ];

            for (const baseUrl of mirrors) {
                const url = `${baseUrl}/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 3000); // Increased to 3s

                    const response = await fetch(url, { signal: controller.signal });
                    clearTimeout(timeoutId);

                    if (response.ok) {
                        const data = await response.json();
                        if (data.routes && data.routes.length > 0) {
                            return data.routes[0];
                        }
                    }
                } catch (err) {
                    console.warn(`⚠️ Routing failed on ${baseUrl}:`, err.name === 'AbortError' ? 'Timeout' : err.message);
                }
            }

            console.warn('⚠️ All client-side OSRM mirrors failed/timed out. Falling back to Backend Proxy...');
            return null; // Will trigger fallback in book_ride.html
        }
    };

    window.RapidRideRouting = Routing;
})();
