// API Configuration - Dynamic IP Detection
// Automatically detects environment and backend IP

if (!window.API_CONFIG) {
    window.API_CONFIG = {
        // Check if running locally
        isLocal: ['localhost', '127.0.0.1'].includes(window.location.hostname) ||
            window.location.hostname.startsWith('192.168.') ||
            window.location.hostname.startsWith('10.'),

        // Backend IP (will be fetched dynamically for production)
        backendIP: null,

        // Initialize backend IP
        async init() {
            if (!this.isLocal && !this.backendIP) {
                try {
                    // Try fetching from root (relative path)
                    // This works if backend-config.json is deployed with the frontend
                    const response = await fetch('/backend-config.json');
                    if (response.ok) {
                        const config = await response.json();
                        this.backendIP = config.ip;
                        console.log('✅ Backend IP loaded from config:', this.backendIP);
                    } else {
                        throw new Error('Config file not found');
                    }
                } catch (error) {
                    // Fallback to Railway URL
                    this.backendIP = 'rapidride-app-production-82e4.up.railway.app';
                    console.warn('⚠️ Using fallback Railway URL:', this.backendIP);
                }
            }
        },

        // API Base URLs
        get BASE_URL() {
            if (this.isLocal) {
                // Local development - Express backend
                const host = window.location.hostname;
                const protocol = window.location.protocol;

                if (host.includes('192.168') || host.includes('10.')) {
                    // Use HTTPS on port 3001, HTTP on port 3000
                    const port = protocol === 'https:' ? 3001 : 3000;
                    return `${protocol}//${host}:${port}/api`;
                }
                return 'http://localhost:3000/api';
            } else {
                // Production - Railway URL (no port needed)
                const backend = this.backendIP || 'rapidride-app-production.up.railway.app';
                return `https://${backend}/api`;
            }
        },

        get WS_URL() {
            if (this.isLocal) {
                // Auto-detect if accessing via network IP and use correct port
                const host = window.location.hostname;
                const protocol = window.location.protocol;

                if (host.includes('192.168') || host.includes('10.')) {
                    // Use HTTPS on port 3001, HTTP on port 3000
                    const port = protocol === 'https:' ? 3001 : 3000;
                    return `${protocol}//${host}:${port}`;
                }
                return 'http://localhost:3000';
            } else {
                // Production - Railway URL (no port needed)
                const backend = this.backendIP || 'rapidride-app-production.up.railway.app';
                return `https://${backend}`;
            }
        },

        // FastAPI ML Service
        get ML_URL() {
            if (this.isLocal) {
                return 'http://localhost:8001';
            } else {
                const backend = this.backendIP || 'rapidride-app-production.up.railway.app';
                return `https://${backend}`;
            }
        }
    };

    // Initialize and log config
    window.API_CONFIG.init().then(() => {
        console.log('🔧 API Config loaded:', {
            environment: window.API_CONFIG.isLocal ? 'LOCAL' : 'PRODUCTION',
            backendIP: window.API_CONFIG.backendIP,
            apiUrl: window.API_CONFIG.BASE_URL,
            wsUrl: window.API_CONFIG.WS_URL
        });
    });
}
