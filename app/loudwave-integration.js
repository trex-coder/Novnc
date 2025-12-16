/**
 * LoudWave VNC Viewer Integration Module
 * This module bridges the LoudWave UI with noVNC RFB connection
 */

class LoudWaveIntegration {
    constructor() {
        this.rfb = null;
        this.connectionQuality = 'unknown';
        this.lastLatency = 0;
        this.canvasWidth = 1920;
        this.canvasHeight = 1080;
        this.init();
    }

    /**
     * Initialize the integration after page load
     */
    init() {
        // Wait for both LoudWave and noVNC to be initialized
        document.addEventListener('DOMContentLoaded', () => {
            this.setupRFBListener();
            this.setupUIListeners();
            this.setupCanvasSync();
            this.hideLoudWaveByDefault();
        }, { once: true });

        // Also try immediately in case DOMContentLoaded already fired
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.setupAll();
            }, { once: true });
        } else {
            this.setupAll();
        }
    }

    /**
     * Setup all components
     */
    setupAll() {
        this.setupRFBListener();
        this.setupUIListeners();
        this.setupCanvasSync();
        this.hideLoudWaveByDefault();
    }

    /**
     * Hide LoudWave container by default (show noVNC instead)
     */
    hideLoudWaveByDefault() {
        const vncContainer = document.getElementById('vncContainer');
        if (vncContainer) {
            vncContainer.style.display = 'none';
        }
    }

    /**
     * Monitor RFB object for connection events
     */
    setupRFBListener() {
        // This will be called when RFB is created in UI
        window.addEventListener('rfbCreated', (e) => {
            this.rfb = e.detail;
            console.log('LoudWave: RFB connected');
            this.updateConnectionStatus('Connected');
        });

        // Monitor for disconnection
        window.addEventListener('rfbDisconnected', () => {
            this.rfb = null;
            console.log('LoudWave: RFB disconnected');
            this.updateConnectionStatus('Disconnected');
        });

        // Periodically check if rfb exists (fallback)
        setInterval(() => {
            if (!this.rfb && window.rfb) {
                this.rfb = window.rfb;
                console.log('LoudWave: Detected RFB object');
            }
        }, 1000);
    }

    /**
     * Setup listeners for UI events
     */
    setupUIListeners() {
        // Monitor keyboard visibility
        const keyboard = document.getElementById('virtualKeyboard');
        if (keyboard) {
            const observer = new MutationObserver(() => {
                if (keyboard.classList.contains('active')) {
                    this.onKeyboardOpen();
                } else {
                    this.onKeyboardClose();
                }
            });
            observer.observe(keyboard, { attributes: true, attributeFilter: ['class'] });
        }

        // Monitor menu visibility
        const menu = document.getElementById('sideMenu');
        if (menu) {
            const observer = new MutationObserver(() => {
                if (menu.classList.contains('active')) {
                    this.onMenuOpen();
                } else {
                    this.onMenuClose();
                }
            });
            observer.observe(menu, { attributes: true, attributeFilter: ['class'] });
        }
    }

    /**
     * Sync canvas display with noVNC
     */
    setupCanvasSync() {
        // Monitor noVNC container
        const noVNCContainer = document.getElementById('noVNC_container');
        if (noVNCContainer) {
            const observer = new MutationObserver(() => {
                // Detect when display changes
                const noVNCDisplay = noVNCContainer.style.display;
                const canvas = document.getElementById('vncCanvas');
                
                if (canvas) {
                    if (noVNCDisplay === 'none') {
                        canvas.style.display = 'block';
                    } else {
                        canvas.style.display = 'none';
                    }
                }
            });
            observer.observe(noVNCContainer, { 
                attributes: true, 
                attributeFilter: ['style'] 
            });
        }
    }

    /**
     * Update connection status in UI
     */
    updateConnectionStatus(status) {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            statusElement.textContent = status;
            if (status === 'Connected') {
                statusElement.style.color = '#66ea9b';
            } else {
                statusElement.style.color = '#ff6b6b';
            }
        }
    }

    /**
     * Update connection quality based on RFB stats
     */
    updateQuality() {
        if (!this.rfb) return;

        // Determine quality based on connection metrics
        // This is a simplified version - can be expanded with actual metrics
        const quality = this.getConnectionQuality();
        const qualityElement = document.getElementById('menuQuality');
        
        if (qualityElement) {
            const qualityTexts = {
                'excellent': 'Excellent',
                'good': 'Good',
                'fair': 'Fair',
                'poor': 'Poor'
            };
            qualityElement.textContent = qualityTexts[quality] || 'Unknown';
            
            // Update color based on quality
            qualityElement.className = 'menu-value quality-' + quality;
        }
    }

    /**
     * Determine connection quality
     */
    getConnectionQuality() {
        // Simple heuristic based on latency and RFB state
        if (!this.rfb || this.rfb.connected !== true) {
            return 'poor';
        }

        if (this.lastLatency < 50) {
            return 'excellent';
        } else if (this.lastLatency < 100) {
            return 'good';
        } else if (this.lastLatency < 200) {
            return 'fair';
        } else {
            return 'poor';
        }
    }

    /**
     * Send Ctrl+Alt+Del via RFB
     */
    sendCtrlAltDel() {
        if (this.rfb && this.rfb.sendCtrlAltDel) {
            this.rfb.sendCtrlAltDel();
            console.log('Ctrl+Alt+Del sent');
            return true;
        }
        console.warn('RFB not ready for Ctrl+Alt+Del');
        return false;
    }

    /**
     * Send key to RFB
     */
    sendKey(keySym) {
        if (this.rfb && this.rfb.sendKey) {
            this.rfb.sendKey(keySym, true);
            this.rfb.sendKey(keySym, false);
            return true;
        }
        return false;
    }

    /**
     * Send mouse movement to RFB
     */
    sendMouseMove(x, y) {
        if (this.rfb && this.rfb.sendPointerEvent) {
            this.rfb.sendPointerEvent(x, y, 0);
            return true;
        }
        return false;
    }

    /**
     * Handle keyboard open
     */
    onKeyboardOpen() {
        console.log('Keyboard opened');
    }

    /**
     * Handle keyboard close
     */
    onKeyboardClose() {
        console.log('Keyboard closed');
    }

    /**
     * Handle menu open
     */
    onMenuOpen() {
        console.log('Info menu opened');
        this.updateQuality();
    }

    /**
     * Handle menu close
     */
    onMenuClose() {
        console.log('Info menu closed');
    }

    /**
     * Update resolution info
     */
    setResolution(width, height) {
        this.canvasWidth = width;
        this.canvasHeight = height;

        const resElement = document.getElementById('menuResolution');
        if (resElement) {
            resElement.textContent = `${width} x ${height}`;
        }
    }

    /**
     * Set server name
     */
    setServerName(name) {
        const nameElement = document.getElementById('menuServer');
        if (nameElement) {
            nameElement.textContent = name;
        }

        const pillNameElement = document.querySelector('.pill-server-name');
        if (pillNameElement) {
            pillNameElement.textContent = name;
        }
    }

    /**
     * Update latency display
     */
    setLatency(ms) {
        this.lastLatency = ms;
        const latencyElement = document.getElementById('menuLatency');
        if (latencyElement) {
            latencyElement.textContent = `${ms}ms`;
        }
    }
}

// Initialize the integration
window.loudwaveIntegration = new LoudWaveIntegration();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LoudWaveIntegration;
}
