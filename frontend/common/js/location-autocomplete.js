// Location Autocomplete - Robust Version
console.log('🚀 Autocomplete loading...');

const PHOTON_API = 'https://photon.komoot.io/api/';
const NOMINATIM_API = 'https://nominatim.openstreetmap.org/search';
let userLocation = null;
let locationCache = new Map();
let requestQueue = [];
let isProcessing = false;

// Get user location with retry
async function getUserLocation(retries = 3) {
  if (userLocation) return userLocation;

  return new Promise((resolve) => {
    let attempts = 0;

    const tryGetLocation = () => {
      if (!navigator.geolocation) {
        console.warn('⚠️ Geolocation not supported');
        userLocation = { lat: 28.6139, lon: 77.2090 };
        resolve(userLocation);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          userLocation = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          };
          console.log('📍 Location obtained:', userLocation);
          // Cache location
          localStorage.setItem('rr_last_location', JSON.stringify({
            ...userLocation,
            timestamp: Date.now()
          }));
          resolve(userLocation);
        },
        (error) => {
          attempts++;
          console.warn(`⚠️ Location attempt ${attempts} failed:`, error.message);

          if (attempts < retries) {
            setTimeout(tryGetLocation, 1000);
          } else {
            // Try to use cached location
            try {
              const cached = localStorage.getItem('rr_last_location');
              if (cached) {
                const data = JSON.parse(cached);
                // Use if less than 1 hour old
                if (Date.now() - data.timestamp < 3600000) {
                  userLocation = { lat: data.lat, lon: data.lon };
                  console.log('📍 Using cached location');
                  resolve(userLocation);
                  return;
                }
              }
            } catch (e) { }

            // Fallback to Delhi
            userLocation = { lat: 28.6139, lon: 77.2090 };
            console.log('📍 Using default location (Delhi)');
            resolve(userLocation);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000
        }
      );
    };

    tryGetLocation();
  });
}

// Distance calculation
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(km) {
  if (km < 1) return Math.round(km * 1000) + 'm';
  return km.toFixed(1) + 'km';
}

// Popular places - will be loaded from user's saved places
const POPULAR = [];

// Fetch with retry and fallback
async function fetchWithRetry(url, options = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      console.warn(`Fetch attempt ${i + 1} failed:`, err.message);
      if (i === retries) throw err;
      await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
    }
  }
}

// Main autocomplete function
function initLocationAutocomplete(inputId, callback) {
  const input = document.getElementById(inputId);
  if (!input) {
    console.error('❌ Input not found:', inputId);
    return null;
  }

  console.log('✅ Initializing autocomplete for:', inputId);

  // Create dropdown
  const dropdown = document.createElement('div');
  dropdown.id = inputId + '-dropdown';
  dropdown.style.cssText = `
    position: absolute;
    background: #1e293b;
    border: 2px solid #6366f1;
    border-radius: 12px;
    max-height: 350px;
    overflow-y: auto;
    display: none;
    z-index: 99999;
    box-shadow: 0 20px 60px rgba(0,0,0,0.7);
    width: 100%;
    margin-top: 4px;
  `;

  // Find parent and append dropdown
  const parent = input.closest('.input-with-icon') || input.parentElement;
  parent.style.position = 'relative';
  parent.appendChild(dropdown);

  let results = [];
  let selectedIdx = -1;
  let timer;

  // Check if a place is saved
  function checkIfSaved(item) {
    try {
      const saved = JSON.parse(localStorage.getItem('rr_saved_places') || '[]');
      return saved.some(p => Math.abs(p.lat - item.lat) < 0.0001 && Math.abs(p.lon - item.lon) < 0.0001);
    } catch (e) {
      return false;
    }
  }

  // Save a place to user's saved places
  async function savePlace(item) {
    try {
      const placeData = {
        name: item.name,
        address: item.address || item.city || '',
        lat: item.lat,
        lon: item.lon
      };

      // Save to backend database
      const API_BASE = document.querySelector('meta[name="api-base"]')?.content || 'https://us-central1-rapidrideonline.cloudfunctions.net/api';
      const token = localStorage.getItem('token') || localStorage.getItem('rr_token');

      if (token) {
        const response = await fetch(`${API_BASE}/auth/places`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(placeData)
        });

        if (response.ok) {
          const data = await response.json();
          // Update localStorage with server data
          localStorage.setItem('rr_saved_places', JSON.stringify(data.savedPlaces));
          console.log('✅ Place saved successfully');
          return true;
        } else {
          const errorData = await response.json().catch(() => ({}));
          console.warn('Backend save failed:', response.status, errorData);
          // Fallback to localStorage if backend fails
          const saved = JSON.parse(localStorage.getItem('rr_saved_places') || '[]');
          // Check if already exists locally
          const exists = saved.some(p =>
            Math.abs(p.lat - placeData.lat) < 0.0001 && Math.abs(p.lon - placeData.lon) < 0.0001
          );
          if (!exists) {
            saved.unshift(placeData);
            localStorage.setItem('rr_saved_places', JSON.stringify(saved.slice(0, 20)));
          }
          return true;
        }
      } else {
        // Fallback to localStorage if no token
        const saved = JSON.parse(localStorage.getItem('rr_saved_places') || '[]');
        saved.unshift(placeData);
        localStorage.setItem('rr_saved_places', JSON.stringify(saved.slice(0, 20)));
        return true;
      }
    } catch (e) {
      console.warn('Could not save place:', e);
      // Fallback to localStorage
      const saved = JSON.parse(localStorage.getItem('rr_saved_places') || '[]');
      saved.unshift(placeData);
      localStorage.setItem('rr_saved_places', JSON.stringify(saved.slice(0, 20)));
      return true;
    }
  }

  // Unsave a place
  async function unsavePlace(item) {
    try {
      // Remove from backend database
      const API_BASE = document.querySelector('meta[name="api-base"]')?.content || 'https://us-central1-rapidrideonline.cloudfunctions.net/api';
      const token = localStorage.getItem('token') || localStorage.getItem('rr_token');

      if (token) {
        const response = await fetch(`${API_BASE}/auth/places`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ lat: item.lat, lon: item.lon })
        });

        if (response.ok) {
          const data = await response.json();
          // Update localStorage with server data
          localStorage.setItem('rr_saved_places', JSON.stringify(data.savedPlaces));
          console.log('✅ Place unsaved successfully');
          return true;
        } else {
          throw new Error('Failed to unsave place');
        }
      } else {
        // Fallback to localStorage
        const saved = JSON.parse(localStorage.getItem('rr_saved_places') || '[]');
        const filtered = saved.filter(p => !(Math.abs(p.lat - item.lat) < 0.0001 && Math.abs(p.lon - item.lon) < 0.0001));
        localStorage.setItem('rr_saved_places', JSON.stringify(filtered));
        return true;
      }
    } catch (e) {
      console.warn('Could not unsave place:', e);
      // Fallback to localStorage
      const saved = JSON.parse(localStorage.getItem('rr_saved_places') || '[]');
      const filtered = saved.filter(p => !(Math.abs(p.lat - item.lat) < 0.0001 && Math.abs(p.lon - item.lon) < 0.0001));
      localStorage.setItem('rr_saved_places', JSON.stringify(filtered));
      return true;
    }
  }

  // Show results
  function showResults(items) {
    results = items;
    selectedIdx = -1;
    dropdown.innerHTML = '';

    if (items.length === 0) {
      dropdown.style.display = 'none';
      return;
    }

    items.forEach((item, i) => {
      const div = document.createElement('div');
      div.style.cssText = `
        padding: 14px 18px;
        cursor: pointer;
        border-bottom: 1px solid #334155;
        transition: background 0.15s;
      `;

      let icon = '📍';
      let badge = '';
      let actionBtn = '';

      // Check if this place is already saved
      const isSaved = checkIfSaved(item);

      if (item.saved || isSaved) {
        icon = item.icon || '⭐';
        // Show filled star for saved places
        actionBtn = `<button class="save-place-btn" data-save="true" data-saved="true" style="background:transparent;border:none;color:#fbbf24;width:32px;height:32px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1.4rem;transition:all 0.2s;flex-shrink:0;">★</button>`;
      } else if (item.recent) {
        icon = '🕒';
        // Show both star and remove button for recent searches
        actionBtn = `
          <button class="save-place-btn" data-save="true" style="background:transparent;border:none;color:#94a3b8;width:32px;height:32px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1.4rem;transition:all 0.2s;flex-shrink:0;">☆</button>
          <button class="remove-recent-btn" data-remove="true" style="background:rgba(239,68,68,0.2);border:none;color:#ef4444;width:28px;height:28px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:bold;transition:all 0.2s;flex-shrink:0;">×</button>
        `;
      } else if (item.popular) {
        icon = '⭐';
        actionBtn = `<button class="save-place-btn" data-save="true" style="background:transparent;border:none;color:#94a3b8;width:32px;height:32px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1.4rem;transition:all 0.2s;flex-shrink:0;">☆</button>`;
      } else if (item.distance !== undefined && item.distance < 10) {
        icon = '📌';
        badge = `<span style="background:#10b98133;color:#10b981;padding:3px 10px;border-radius:12px;font-size:0.75rem;margin-left:8px;font-weight:600;">${formatDistance(item.distance)}</span>`;
        actionBtn = `<button class="save-place-btn" data-save="true" style="background:transparent;border:none;color:#94a3b8;width:32px;height:32px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1.4rem;transition:all 0.2s;flex-shrink:0;">☆</button>`;
      } else {
        // Default search result
        actionBtn = `<button class="save-place-btn" data-save="true" style="background:transparent;border:none;color:#94a3b8;width:32px;height:32px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1.4rem;transition:all 0.2s;flex-shrink:0;">☆</button>`;
      }

      // Show source badge for debugging (optional)
      if (item.source && window.location.hostname === 'localhost') {
        badge += `<span style="background:#6366f133;color:#6366f1;padding:2px 6px;border-radius:8px;font-size:0.65rem;margin-left:4px;">${item.source}</span>`;
      }

      div.innerHTML = `
        <div style="display:flex;gap:12px;align-items:start;">
          <span style="font-size:1.3rem;">${icon}</span>
          <div style="flex:1;">
            <div style="font-weight:600;color:#f1f5f9;margin-bottom:4px;">
              ${item.name}${badge}
            </div>
            <div style="font-size:0.85rem;color:#94a3b8;">${item.address || item.city || ''}</div>
          </div>
          ${actionBtn}
        </div>
      `;

      div.onmouseenter = () => {
        selectedIdx = i;
        updateHighlight();
      };

      // Add click listener to the action buttons separately
      setTimeout(() => {
        const saveButtons = div.querySelectorAll('.save-place-btn');
        saveButtons.forEach(btn => {
          btn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            const isSaved = btn.dataset.saved === 'true';

            if (isSaved) {
              console.log('⭐ Unsaving place:', item.name);
              await unsavePlace(item);
              // Update UI immediately
              btn.textContent = '☆';
              btn.style.color = '#94a3b8';
              btn.dataset.saved = 'false';
            } else {
              console.log('⭐ Saving place:', item.name);
              const success = await savePlace(item);
              if (success) {
                // Update UI immediately
                btn.textContent = '★';
                btn.style.color = '#fbbf24';
                btn.dataset.saved = 'true';
              }
            }
          };
        });

        const removeButtons = div.querySelectorAll('.remove-recent-btn');
        removeButtons.forEach(btn => {
          btn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            console.log('🗑️ Removing recent search:', item.name);
            removeRecentSearch(item);
          };
        });
      }, 0);

      div.onclick = (e) => {
        // Only select item if clicking on the main div, not buttons
        if (!e.target.classList.contains('save-place-btn') &&
          !e.target.classList.contains('remove-recent-btn') &&
          !e.target.closest('.save-place-btn') &&
          !e.target.closest('.remove-recent-btn')) {
          e.preventDefault();
          e.stopPropagation();
          selectItem(item);
        }
      };

      dropdown.appendChild(div);
    });

    dropdown.style.display = 'block';
    updateHighlight();
  }

  function updateHighlight() {
    Array.from(dropdown.children).forEach((el, i) => {
      el.style.background = i === selectedIdx ? '#6366f140' : '';
    });
  }

  function removeRecentSearch(item) {
    try {
      const recent = JSON.parse(localStorage.getItem('rr_recent_searches') || '[]');
      const filtered = recent.filter(r => r.name !== item.name);
      localStorage.setItem('rr_recent_searches', JSON.stringify(filtered));

      // Refresh the dropdown with current search
      const currentQuery = input.value;
      search(currentQuery);
    } catch (e) {
      console.warn('Could not remove recent search:', e);
    }
  }

  function selectItem(item) {
    input.value = item.name;
    input.dataset.lat = item.lat;
    input.dataset.lon = item.lon;
    dropdown.style.display = 'none';

    // Save to recent searches
    try {
      const recent = JSON.parse(localStorage.getItem('rr_recent_searches') || '[]');
      const newRecent = [
        { name: item.name, address: item.address || item.city, lat: item.lat, lon: item.lon },
        ...recent.filter(r => r.name !== item.name)
      ].slice(0, 10);
      localStorage.setItem('rr_recent_searches', JSON.stringify(newRecent));
    } catch (e) {
      console.warn('Could not save to recent:', e);
    }

    if (callback) callback({ name: item.name, lat: item.lat, lon: item.lon });
  }

  // Search function with caching and fallback
  async function search(query) {
    console.log('🔍 Searching:', query);

    await getUserLocation();

    if (!query || query.length < 3) {
      // Show nearby + popular (need at least 3 characters)
      const items = [];

      // Saved places from new storage
      try {
        const savedPlaces = JSON.parse(localStorage.getItem('rr_saved_places') || '[]');
        savedPlaces.slice(0, 5).forEach(p => {
          items.push({ ...p, saved: true, icon: '⭐' });
        });
      } catch (e) {
        console.warn('Could not load saved places:', e);
      }

      // Legacy saved places (Home/Work)
      try {
        const home = localStorage.getItem('rr_home_address');
        if (home) {
          const homeData = JSON.parse(home);
          items.push({ ...homeData, saved: true, icon: '🏠', name: homeData.name || 'Home' });
        }
        const work = localStorage.getItem('rr_work_address');
        if (work) {
          const workData = JSON.parse(work);
          items.push({ ...workData, saved: true, icon: '💼', name: workData.name || 'Work' });
        }
      } catch (e) {
        console.warn('Could not load legacy saved places:', e);
      }

      // Recent searches
      try {
        const recent = JSON.parse(localStorage.getItem('rr_recent_searches') || '[]');
        recent.slice(0, 3).forEach(r => {
          items.push({ ...r, recent: true, icon: '🕒' });
        });
      } catch (e) { }

      // Popular with distance
      const pop = POPULAR.map(p => ({
        ...p,
        popular: true,
        address: p.city,
        distance: userLocation ? getDistance(userLocation.lat, userLocation.lon, p.lat, p.lon) : 999
      })).sort((a, b) => a.distance - b.distance).slice(0, 6);

      items.push(...pop);
      const resultItems = items.slice(0, 10);
      if (resultItems.length > 0) {
        showResults(resultItems);
      }
      return;
    }

    // Check cache first
    const cacheKey = `search_${query.toLowerCase()}`;
    if (locationCache.has(cacheKey)) {
      console.log('📦 Using cached results');
      showResults(locationCache.get(cacheKey));
      return;
    }

    // Filter popular places for instant feedback
    const popularMatches = POPULAR.filter(p =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.city.toLowerCase().includes(query.toLowerCase())
    ).map(p => ({
      ...p,
      popular: true,
      address: p.city,
      distance: userLocation ? getDistance(userLocation.lat, userLocation.lon, p.lat, p.lon) : 0
    })).sort((a, b) => a.distance - b.distance);

    if (popularMatches.length > 0) {
      showResults(popularMatches);
    }

    // Search both APIs with fallback
    try {
      let searchResults = [];

      // Try Photon first (faster)
      try {
        let url = `${PHOTON_API}?q=${encodeURIComponent(query)}&limit=8&lang=en`;
        if (userLocation) {
          // Add location bias with tighter radius for better local results
          url += `&lat=${userLocation.lat}&lon=${userLocation.lon}&location_bias_scale=0.5`;
        }

        const photonData = await fetchWithRetry(url);

        searchResults = photonData.features.map(f => {
          const p = f.properties;
          const coords = f.geometry.coordinates;
          const dist = userLocation ? getDistance(userLocation.lat, userLocation.lon, coords[1], coords[0]) : 0;

          // Better name selection - prioritize actual place names
          let name = p.name;
          if (!name || name.length < 2) {
            // Fallback hierarchy: street > district > city > state
            name = p.street || p.district || p.suburb || p.city || p.state || 'Place';
          }

          // Better address formatting - remove redundant info
          const addressParts = [];
          if (p.street && p.street !== name) addressParts.push(p.street);
          if (p.district && p.district !== name) addressParts.push(p.district);
          if (p.city && p.city !== name) addressParts.push(p.city);
          if (p.state) addressParts.push(p.state);

          return {
            name: name,
            address: addressParts.slice(0, 3).join(', '), // Max 3 parts
            lat: coords[1],
            lon: coords[0],
            distance: dist,
            source: 'photon'
          };
        });
      } catch (photonErr) {
        console.warn('Photon API failed, trying Nominatim:', photonErr.message);

        // Fallback to Nominatim
        try {
          const nominatimUrl = `${NOMINATIM_API}?q=${encodeURIComponent(query)}&format=json&limit=10&addressdetails=1`;
          const nominatimData = await fetchWithRetry(nominatimUrl, {
            headers: { 'User-Agent': 'RapidRide/1.0' }
          });

          searchResults = nominatimData.map(item => {
            const dist = userLocation ? getDistance(userLocation.lat, userLocation.lon, parseFloat(item.lat), parseFloat(item.lon)) : 0;
            return {
              name: item.name || item.display_name.split(',')[0],
              address: item.display_name,
              lat: parseFloat(item.lat),
              lon: parseFloat(item.lon),
              distance: dist,
              source: 'nominatim'
            };
          });
        } catch (nominatimErr) {
          console.error('Both APIs failed:', nominatimErr);
          // Return popular matches if available
          if (popularMatches.length > 0) {
            return;
          }
          showResults([]);
          return;
        }
      }

      // Combine and deduplicate
      let combined = [...popularMatches, ...searchResults]
        .filter((item, index, self) =>
          index === self.findIndex(t =>
            Math.abs(t.lat - item.lat) < 0.001 &&
            Math.abs(t.lon - item.lon) < 0.001
          )
        );

      // FILTER: Only show results within 30km of current location
      if (userLocation) {
        combined = combined.filter(item => {
          const distance = getDistance(userLocation.lat, userLocation.lon, item.lat, item.lon);
          item.distance = distance; // Update distance
          return distance <= 30; // Within 30km
        });
      }

      // QUALITY FILTER: Remove gibberish and low-quality results
      combined = combined.filter(item => {
        const name = item.name.toLowerCase();

        // Remove results with only numbers or very short names
        if (name.length < 3) return false;
        if (/^[\d\s]+$/.test(name)) return false; // Only digits

        // Remove results with too many special characters
        const specialCharRatio = (name.match(/[^\w\s]/g) || []).length / name.length;
        if (specialCharRatio > 0.3) return false;

        // Keep if it has proper words
        return true;
      });

      // Sort by distance and quality
      combined = combined
        .sort((a, b) => {
          // Prioritize popular places
          if (a.popular && !b.popular) return -1;
          if (!a.popular && b.popular) return 1;
          // Then by distance
          return a.distance - b.distance;
        })
        .slice(0, 10);

      // Cache results
      locationCache.set(cacheKey, combined);

      // Limit cache size
      if (locationCache.size > 50) {
        const firstKey = locationCache.keys().next().value;
        locationCache.delete(firstKey);
      }

      showResults(combined);
    } catch (err) {
      console.error('❌ Search error:', err);
      if (popularMatches.length === 0) {
        showResults([]);
      }
    }
  }

  // Event listeners
  input.addEventListener('focus', async () => {
    console.log('👆 Input focused');
    // Don't show loading state, just search and let showResults handle display
    await search('');
  });

  input.addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => search(e.target.value.trim()), 300);
  });

  input.addEventListener('click', () => {
    if (results.length > 0) {
      dropdown.style.display = 'block';
    }
  });

  input.addEventListener('keydown', (e) => {
    if (dropdown.style.display === 'none') return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIdx = Math.min(selectedIdx + 1, results.length - 1);
      updateHighlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIdx = Math.max(selectedIdx - 1, 0);
      updateHighlight();
    } else if (e.key === 'Enter' && selectedIdx >= 0) {
      e.preventDefault();
      selectItem(results[selectedIdx]);
    } else if (e.key === 'Escape') {
      dropdown.style.display = 'none';
    }
  });

  document.addEventListener('click', (e) => {
    if (!parent.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });

  console.log('✅ Autocomplete ready!');
  return { dropdown, search };
}

// Export globally
// Encapsulated Location Autocomplete
(function (window) {
  'use strict';

  const LocationAutocomplete = {
    init: initLocationAutocomplete
  };

  window.LocationAutocomplete = LocationAutocomplete;

})(window);
console.log('✅ Autocomplete module loaded!');
