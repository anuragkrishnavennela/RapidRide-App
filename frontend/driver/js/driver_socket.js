// Driver Socket.IO client for real-time ride requests
(function () {
  let socket = null;
  let isOnline = false;
  let currentUserId = null;
  let currentVehicleType = null;
  let pendingRequests = [];
  let lastActivityTime = Date.now();
  let inactivityCheckInterval = null;

  const INACTIVITY_TIMEOUT = 60 * 60 * 1000; // 1 hour in milliseconds
  const STORAGE_KEY_ONLINE_STATE = 'driver_online_state';
  const STORAGE_KEY_LAST_ACTIVITY = 'driver_last_activity';

  const API_BASE = window.API_CONFIG ? API_CONFIG.WS_URL : 'http://localhost:3000';

  // Initialize socket connection
  async function initSocket() {
    if (socket) return;

    // Get Firebase token for socket authentication
    let token = null;
    try {
      if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
        token = await firebase.auth().currentUser.getIdToken();
        console.log('🔑 Got Firebase token for socket connection');
      }
    } catch (err) {
      console.error('Failed to get Firebase token for socket:', err);
    }

    socket = io(API_BASE, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socket.on('connect', () => {
      console.log('✅ Driver socket connected:', socket.id);

      // Try to restore previous online state from localStorage
      const wasRestored = restoreOnlineState();

      // If not restored but was online before disconnect, go online again
      if (!wasRestored && isOnline && currentUserId && currentVehicleType) {
        goOnline(currentUserId, currentVehicleType);
      }
    });

    socket.on('disconnect', () => {
      console.log('❌ Driver socket disconnected');
    });

    socket.on('reconnect', () => {
      console.log('🔄 Driver socket reconnected');
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error.message);
    });

    socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
    });

    // Listen for new ride requests
    socket.on('ride:new-request', (rideData) => {
      console.log('🚗 New ride request received:', rideData);
      handleNewRideRequest(rideData);
    });

    // Listen for ride status updates
    socket.on('ride:status-update', (data) => {
      console.log('📢 Ride status update:', data);
      handleRideStatusUpdate(data);
    });
  }

  // Handle new ride request
  function handleNewRideRequest(rideData) {
    // Only accept requests if driver is online
    if (!isOnline) {
      console.log('⚠️ Received request while offline - ignoring');
      return;
    }

    // Update activity on receiving request
    updateActivity();

    // Add to pending requests if not already there
    if (!pendingRequests.find(r => r.rideId === rideData.rideId)) {
      pendingRequests.push(rideData);

      // Play notification sound (optional)
      playNotificationSound();

      // Show browser notification if permitted
      showNotification(rideData);

      // Update UI
      // Show Modal
      if (window.showRequestModal) {
        window.showRequestModal(rideData);
      }
    }
  }

  // Handle ride status update
  function handleRideStatusUpdate(data) {
    const { rideId, status } = data;

    // Remove from pending if accepted by another driver or cancelled
    if (status === 'accepted' || status === 'cancelled') {
      pendingRequests = pendingRequests.filter(r => r.rideId !== rideId);

      // Close Modal if it matches
      if (window.rejectRide) {
        window.rejectRide();
      }
    }
  }

  // Go online
  function goOnline(userId, vehicleType, location = null) {
    if (!socket) initSocket();

    currentUserId = userId;
    currentVehicleType = vehicleType;
    isOnline = true;
    lastActivityTime = Date.now();

    // Save online state to localStorage for persistence
    localStorage.setItem(STORAGE_KEY_ONLINE_STATE, JSON.stringify({
      userId,
      vehicleType,
      timestamp: Date.now()
    }));
    localStorage.setItem(STORAGE_KEY_LAST_ACTIVITY, Date.now().toString());

    socket.emit('driver:online', {
      userId,
      vehicleType,
      location
    });

    // Start inactivity monitoring
    startInactivityMonitoring();

    console.log(`✅ Driver ${userId} went ONLINE with ${vehicleType} - ready to receive ride requests`);
    console.log(`⏰ Will auto-offline after 1 hour of inactivity`);
  }

  // Go offline
  function goOffline(userId) {
    if (!socket) return;

    isOnline = false;
    currentUserId = null;
    currentVehicleType = null;

    // Clear persistent state
    localStorage.removeItem(STORAGE_KEY_ONLINE_STATE);
    localStorage.removeItem(STORAGE_KEY_LAST_ACTIVITY);

    // Stop inactivity monitoring
    stopInactivityMonitoring();

    socket.emit('driver:offline', { userId });

    // Clear pending requests immediately
    pendingRequests = [];
    if (window.updateRideRequests) {
      window.updateRideRequests([]);
    }

    console.log(`❌ Driver ${userId} went offline - will not receive new requests`);
  }

  // Update driver location
  function updateLocation(userId, location) {
    if (!socket || !isOnline) return;

    socket.emit('driver:location', {
      userId,
      location
    });
  }

  // Accept ride request
  async function acceptRide(rideId) {
    try {
      const user = firebase.auth().currentUser;
      if (!user) throw new Error('Not authenticated');

      const response = await apiFetch('/rides/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ rideId })
      });

      const data = response.data;

      if (response.ok) {
        // Remove from pending requests
        pendingRequests = pendingRequests.filter(r => r.rideId !== rideId);

        if (window.updateRideRequests) {
          window.updateRideRequests(pendingRequests);
        }

        console.log('✅ Ride accepted:', data);
        return data;
      } else {
        throw new Error(data.message || 'Failed to accept ride');
      }
    } catch (error) {
      console.error('❌ Accept ride error:', error);
      throw error;
    }
  }

  // Reject ride request
  function rejectRide(rideId) {
    pendingRequests = pendingRequests.filter(r => r.rideId !== rideId);

    if (window.updateRideRequests) {
      window.updateRideRequests(pendingRequests);
    }

    console.log('❌ Ride rejected:', rideId);
  }

  // Play notification sound
  function playNotificationSound() {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGGS57OihUhQOTKXh8bVkHQU2jdXyy3krBSh+zPDcjjwKElyx6OyrWBQJR53e8r5uIQUrgc7y2Yk2CBhkuezooVIUDkyl4fG1ZB0FNo3V8st5KwUofsz');
      audio.volume = 0.3;
      audio.play().catch(e => console.log('Could not play notification sound'));
    } catch (e) {
      console.log('Notification sound error:', e);
    }
  }

  // Show browser notification
  function showNotification(rideData) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('New Ride Request! 🚗', {
        body: `Pickup: ${rideData.pickup.address}\nFare: ₹${rideData.fare}`,
        icon: '/assets/logo.png',
        tag: rideData.rideId,
        requireInteraction: true
      });
    }
  }

  // Request notification permission
  function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        console.log('Notification permission:', permission);
      });
    }
  }

  // Get pending requests
  function getPendingRequests() {
    return [...pendingRequests];
  }

  // Start inactivity monitoring
  function startInactivityMonitoring() {
    // Clear any existing interval
    stopInactivityMonitoring();

    // Check every minute for inactivity
    inactivityCheckInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceActivity = now - lastActivityTime;

      if (timeSinceActivity >= INACTIVITY_TIMEOUT) {
        console.log('⏰ 1 hour of inactivity detected - going offline automatically');
        if (currentUserId) {
          goOffline(currentUserId);

          // Notify user
          if (window.updateDriverStatus) {
            window.updateDriverStatus('offline', 'Auto-offline due to 1 hour inactivity');
          }
        }
      }
    }, 60000); // Check every minute
  }

  // Stop inactivity monitoring
  function stopInactivityMonitoring() {
    if (inactivityCheckInterval) {
      clearInterval(inactivityCheckInterval);
      inactivityCheckInterval = null;
    }
  }

  // Update activity timestamp
  function updateActivity() {
    lastActivityTime = Date.now();
    if (isOnline) {
      localStorage.setItem(STORAGE_KEY_LAST_ACTIVITY, lastActivityTime.toString());
    }
  }

  // Restore online state from localStorage on page load
  function restoreOnlineState() {
    try {
      const savedState = localStorage.getItem(STORAGE_KEY_ONLINE_STATE);
      const lastActivity = localStorage.getItem(STORAGE_KEY_LAST_ACTIVITY);

      if (savedState && lastActivity) {
        const state = JSON.parse(savedState);
        const timeSinceActivity = Date.now() - parseInt(lastActivity);

        // Only restore if less than 1 hour has passed
        if (timeSinceActivity < INACTIVITY_TIMEOUT) {
          console.log('🔄 Restoring previous online state...');
          currentUserId = state.userId;
          currentVehicleType = state.vehicleType;
          isOnline = true;
          lastActivityTime = parseInt(lastActivity);

          // Reconnect
          if (socket && socket.connected) {
            goOnline(state.userId, state.vehicleType);
          }

          return true;
        } else {
          console.log('⏰ Previous session expired (>1 hour) - starting fresh');
          localStorage.removeItem(STORAGE_KEY_ONLINE_STATE);
          localStorage.removeItem(STORAGE_KEY_LAST_ACTIVITY);
        }
      }
    } catch (error) {
      console.error('Error restoring online state:', error);
    }
    return false;
  }

  // Track activity on various events
  if (typeof document !== 'undefined') {
    ['click', 'keypress', 'scroll', 'touchstart'].forEach(eventType => {
      document.addEventListener(eventType, updateActivity, { passive: true });
    });
  }

  // Public API
  window.DriverSocket = {
    init: initSocket,
    goOnline,
    goOffline,
    updateLocation,
    acceptRide,
    rejectRide,
    getPendingRequests,
    requestNotificationPermission,
    updateActivity,
    isOnline: () => isOnline,
    getLastActivityTime: () => lastActivityTime
  };

  // Don't auto-initialize - wait for Firebase auth to be ready
  // Driver home page will call DriverSocket.init() after Firebase auth completes
})();
