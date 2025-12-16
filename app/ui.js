/*
 * noVNC: HTML5 VNC client
 * Copyright (C) 2019 The noVNC authors
 * Licensed under MPL 2.0 (see LICENSE.txt)
 *
 * See README.md for usage and integration instructions.
 */

import * as Log from '../core/util/logging.js';
import _, { l10n } from './localization.js';
import { isTouchDevice, isMac, isIOS, isAndroid, isChromeOS, isSafari,
         hasScrollbarGutter, dragThreshold }
    from '../core/util/browser.js';
import { setCapture, getPointerEvent } from '../core/util/events.js';
import KeyTable from "../core/input/keysym.js";
import keysyms from "../core/input/keysymdef.js";
import RFB from "../core/rfb.js";
import * as WebUtil from "./webutil.js";

const PAGE_TITLE = "noVNC";

const LINGUAS = ["cs", "de", "el", "es", "fr", "it", "ja", "ko", "nl", "pl", "pt_BR", "ru", "sv", "tr", "zh_CN", "zh_TW"];

// Utility: detect if running in a WebView (Android/iOS/Sketchware Pro)
function isWebView() {
    var standalone = window.navigator.standalone;
    var userAgent = window.navigator.userAgent || '';
    var isAndroidWebView = /; wv\)/.test(userAgent) || /Sketchware/i.test(userAgent);
    var isIOSWebView = (
        /(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i.test(userAgent)
    );
    return (standalone === false || isAndroidWebView || isIOSWebView);
}

const UI = {

    customSettings: {},

    connected: false,
    desktopName: "",

    statusTimeout: null,
    hideKeyboardTimeout: null,
    idleControlbarTimeout: null,
    closeControlbarTimeout: null,

    controlbarGrabbed: false,
    controlbarDrag: false,
    controlbarMouseDownClientY: 0,
    controlbarMouseDownOffsetY: 0,

    lastKeyboardinput: null,
    defaultKeyboardinputLen: 100,

    inhibitReconnect: true,
    reconnectCallback: null,
    reconnectPassword: null,
    
    pingMeterInterval: null,
    lastPingTime: 0,

    async start(options={}) {
        UI.customSettings = options.settings || {};
        if (UI.customSettings.defaults === undefined) {
            UI.customSettings.defaults = {};
        }
        if (UI.customSettings.mandatory === undefined) {
            UI.customSettings.mandatory = {};
        }

        try {
            await l10n.setup(LINGUAS, "app/locale/");
        } catch (err) {
            Log.Error("Failed to load translations: " + err);
        }

        await WebUtil.initSettings();

        // Ensure DOM is fully loaded
        if (document.readyState === "loading") {
            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
        }

        UI.initSettings();

        // Add event listeners
        UI.addControlbarHandlers();
        UI.addExtraKeysHandlers();
        UI.addMachineHandlers();
        UI.addConnectionControlHandlers();
        UI.addClipboardHandlers();
        UI.addSettingsHandlers();
        
        document.getElementById("noVNC_status").addEventListener('click', UI.hideStatus);

        UI.openControlbar();
        UI.updateVisualState('init');

        document.documentElement.classList.remove("noVNC_loading");

        // If autoconnect is enabled, connect now
        if (UI.getSetting('autoconnect', true)) {
            UI.connect();
        }

        // Setup scaling dropdown with proper null checks
        if (typeof UI.setupScalingDropdown === 'function') {
            UI.setupScalingDropdown();
        }
        // Add event listener to settings button for scaling dropdown
        const quickSettingsBtn = document.getElementById('noVNC_quick_settings');
        if (quickSettingsBtn) {
            quickSettingsBtn.addEventListener('click', function() {
                if (typeof UI.setupScalingDropdown === 'function') {
                    UI.setupScalingDropdown();
                }
            });
        }
    },

    // Helper to add options to dropdown.
    addOption(selectbox, text, value) {
        const optn = document.createElement("OPTION");
        optn.text = text;
        optn.value = value;
        selectbox.options.add(optn);
    },

    initSettings() {
        // Logging selection dropdown
        const llevels = ['error', 'warn', 'info', 'debug'];
        for (let i = 0; i < llevels.length; i += 1) {
            UI.addOption(document.getElementById('noVNC_setting_logging'), llevels[i], llevels[i]);
        }

        // Settings with immediate effects
        UI.initSetting('logging', 'warn');
        UI.updateLogging();

        UI.setupSettingLabels();

        /* Populate the controls if defaults are provided in the URL */
        UI.initSetting('host', '');
        UI.initSetting('port', 0);
        UI.initSetting('encrypt', (window.location.protocol === "https:"));
        UI.initSetting('password');
        UI.initSetting('autoconnect', false);
        UI.initSetting('view_clip', false);
        UI.initSetting('resize', 'off');
        UI.initSetting('quality', 6);
        UI.initSetting('compression', 2);
        UI.initSetting('shared', true);
        UI.initSetting('bell', 'off');
        UI.initSetting('view_only', false);
        UI.initSetting('show_dot', false);
        UI.initSetting('path', 'websockify');
        UI.initSetting('repeaterID', '');
        UI.initSetting('reconnect', false);
        UI.initSetting('reconnect_delay', 5000);

        // If autoconnect is enabled, inhibit reconnect until first connection
        if (UI.getSetting('autoconnect', false)) {
            UI.inhibitReconnect = false;
            UI.connect();
        }
    },

    connect(event, password) {
        // Ignore when rfb already exists
        if (typeof UI.rfb !== 'undefined') {
            return;
        }

        const host = UI.getSetting('host');
        const port = UI.getSetting('port');
        const path = UI.getSetting('path');

        if (typeof password === 'undefined') {
            password = UI.getSetting('password');
            UI.reconnectPassword = password;
        }

        if (password === null) {
            password = undefined;
        }

        UI.hideStatus();
        UI.closeConnectPanel();
        UI.updateVisualState('connecting');

        let url;

        if (host) {
            url = new URL("https://" + host);
            url.protocol = UI.getSetting('encrypt') ? 'wss:' : 'ws:';
            if (port) {
                url.port = port;
            }
            // './' is needed to force URL() to interpret the path as a path, not a host
            url = new URL("./" + path, url);
        } else {
            // Fallback for browsers and configs without host
            url = new URL(path, location.href);
            url.protocol = (window.location.protocol === "https:") ? 'wss:' : 'ws:';
        }

        try {
            UI.rfb = new RFB(document.getElementById('noVNC_container'),
                             url.href,
                             { shared: UI.getSetting('shared'),
                               repeaterID: UI.getSetting('repeaterID'),
                               credentials: { password: password } });
        } catch (exc) {
            Log.Error("Failed to connect to server: " + exc);
            UI.updateVisualState('disconnected');
            UI.showStatus(_("Failed to connect to server: ") + exc, 'error');
            return;
        }

        UI.rfb.addEventListener("connect", UI.connectFinished);
        UI.rfb.addEventListener("disconnect", UI.disconnectFinished);
        UI.rfb.addEventListener("serververification", UI.serverVerify);
        UI.rfb.addEventListener("credentialsrequired", UI.credentials);
        UI.rfb.addEventListener("securityfailure", UI.securityFailed);
        UI.rfb.addEventListener("clippingviewport", UI.updateViewDrag);
        UI.rfb.addEventListener("capabilities", UI.updatePowerButton);
        UI.rfb.addEventListener("clipboard", UI.clipboardReceive);
        UI.rfb.addEventListener("bell", UI.bell);
        UI.rfb.addEventListener("desktopname", UI.updateDesktopName);
        if (UI.rfb) {
            UI.rfb.clipViewport = UI.getSetting('view_clip');
            const resizeMode = UI.getSetting('resize');
            UI.rfb.scaleViewport = resizeMode === 'scale';
            UI.rfb.resizeSession = UI.getSetting('resize') === 'remote';
        }
        if (UI.rfb) {
            UI.rfb.qualityLevel = parseInt(UI.getSetting('quality'));
            UI.rfb.compressionLevel = parseInt(UI.getSetting('compression'));
            UI.rfb.showDotCursor = UI.getSetting('show_dot');
        }

        UI.updateViewOnly(); // requires UI.rfb
    },

    disconnect() {
        UI.rfb.disconnect();

        UI.connected = false;

        // Disable automatic reconnecting
        UI.inhibitReconnect = true;

        UI.updateVisualState('disconnecting');

        // Don't display the connection settings until we're actually disconnected
    },

    reconnect() {
        UI.reconnectCallback = null;

        // if reconnect has been disabled in the meantime, do nothing.
        if (UI.inhibitReconnect) {
            return;
        }

        UI.connect(null, UI.reconnectPassword);
    },

    cancelReconnect() {
        if (UI.reconnectCallback !== null) {
            clearTimeout(UI.reconnectCallback);
            UI.reconnectCallback = null;
        }

        UI.updateVisualState('disconnected');

        UI.openControlbar();
        UI.openConnectPanel();
    },

    connectFinished(e) {
        console.log('[UI] connectFinished called');
        UI.connected = true;
        UI.inhibitReconnect = false;

        let msg;
        if (UI.getSetting('encrypt')) {
            msg = _("Connected (encrypted) to ") + UI.desktopName;
        } else {
            msg = _("Connected (unencrypted) to ") + UI.desktopName;
        }
        UI.showStatus(msg);
        UI.updateVisualState('connected');
        console.log('[UI] updateVisualState called with connected');

        // Prevent fullscreen logic in WebView
        if (!isWebView()) {
            // Auto-enter fullscreen mode if supported (do not throw if not supported)
            const docEl = document.documentElement;
            const body = document.body;
            const canFullscreen = (
                docEl.requestFullscreen ||
                docEl.mozRequestFullScreen ||
                docEl.webkitRequestFullscreen ||
                body.msRequestFullscreen
            );
            try {
                if (canFullscreen) {
                    if (!document.fullscreenElement && docEl.requestFullscreen) {
                        docEl.requestFullscreen();
                    } else if (!document.mozFullScreenElement && docEl.mozRequestFullScreen) {
                        docEl.mozRequestFullScreen();
                    } else if (!document.webkitFullscreenElement && docEl.webkitRequestFullscreen) {
                        docEl.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
                    } else if (!document.msFullscreenElement && body.msRequestFullscreen) {
                        body.msRequestFullscreen();
                    }
                }
            } catch (err) {
                UI.showStatus('Fullscreen is not supported on this device/browser.', 'error');
            }
        }
        // Do this last because it can only be used on rendered elements
        UI.rfb.focus();
        // Update scaling dropdown to match current setting
        const scalingSelect = document.getElementById('noVNC_setting_scaling');
        if (scalingSelect) {
            const resizeValue = UI.getSetting('resize');
            scalingSelect.value = resizeValue || 'off';
        }

        // Start ping meter monitoring for the new pill navigation
        console.log('[UI] Starting ping meter monitoring');
        UI.startPingMeterMonitoring();

        // Wait for the actual session screen to be rendered before showing the pill
        // This happens when the loading class is removed
        console.log('[UI] Scheduling pill display');
        const showPillAfterLoad = setInterval(() => {
            const htmlEl = document.documentElement;
            // Check if the loading class has been removed
            if (!htmlEl.classList.contains('noVNC_loading') && !htmlEl.classList.contains('noVNC_connecting')) {
                console.log('[UI] Session screen ready, scheduling pill and welcome dialog');
                clearInterval(showPillAfterLoad);
                
                // Show both pill and welcome dialog after 500ms with same timing
                setTimeout(() => {
                    // Show the nav pill
                    if (typeof window.showPillLW === 'function') {
                        console.log('[UI] Calling showPillLW');
                        window.showPillLW();
                    } else {
                        console.warn('[UI] showPillLW function not available');
                    }

                    // Show welcome dialog at the same time
                    if (typeof window.showWelcomeDialogOnConnect === 'function') {
                        console.log('[UI] Calling showWelcomeDialogOnConnect');
                        window.showWelcomeDialogOnConnect();
                    } else {
                        console.warn('[UI] showWelcomeDialogOnConnect function not available');
                    }
                }, 500);
            }
        }, 100);

        // Timeout after 5 seconds if screen never shows
        setTimeout(() => {
            clearInterval(showPillAfterLoad);
            console.warn('[UI] Timeout waiting for session screen, showing pill anyway');
            if (typeof window.showPillLW === 'function') {
                window.showPillLW();
            }
        }, 5000);
    },

    startPingMeterMonitoring() {
        // Clear any existing interval
        if (UI.pingMeterInterval) {
            clearInterval(UI.pingMeterInterval);
        }

        console.log('[Ping] Starting ping meter monitoring');

        // Function to update the ping indicator
        const updatePing = () => {
            if (!UI.rfb || !UI.rfb.connected) {
                console.debug('[Ping] RFB not connected, skipping ping update');
                return;
            }

            const url = window.location.origin + window.location.pathname;
            const start = performance.now();

            fetch(url, { method: 'HEAD', cache: 'no-store', mode: 'no-cors' })
                .then(() => {
                    const latency = Math.round(performance.now() - start);
                    console.log('[Ping] Latency measured:', latency + 'ms');
                    
                    // Update the pill navigation ping indicator if the function exists
                    if (typeof window.updatePingIndicator === 'function') {
                        console.log('[Ping] Calling updatePingIndicator with', latency);
                        window.updatePingIndicator(latency);
                    } else {
                        console.warn('[Ping] updatePingIndicator function not found');
                    }
                    
                    // Also update the loudwave integration if available
                    if (window.loudwaveIntegration) {
                        window.loudwaveIntegration.setLatency(latency);
                    }
                })
                .catch((err) => {
                    console.error('[Ping] Fetch error:', err);
                    // On error, update with -- ms
                    if (typeof window.updatePingIndicator === 'function') {
                        window.updatePingIndicator(999);
                    }
                });
        };

        // Initial update
        updatePing();

        // Update every 2 seconds
        UI.pingMeterInterval = setInterval(updatePing, 2000);
    },

    stopPingMeterMonitoring() {
        if (UI.pingMeterInterval) {
            clearInterval(UI.pingMeterInterval);
            UI.pingMeterInterval = null;
        }
    },

    disconnectFinished(e) {
        const wasConnected = UI.connected;

        // Stop ping meter monitoring
        UI.stopPingMeterMonitoring();

        // This variable is ideally set when disconnection starts, but
        // when the disconnection isn't clean or if it is initiated by
        // the server, we need to do it here as well since
        // UI.disconnect() won't be used in those cases.
        UI.connected = false;

        UI.rfb = undefined;

        // Suppress permission errors
        const errorText = (e && e.detail && e.detail.clean === false && e.detail.reason) ? e.detail.reason : '';
        if (errorText && (errorText.includes('Permission error') || errorText.includes('Permissions check failed'))) {
            UI.updateVisualState('disconnected');
            return;
        }

        if (!e.detail.clean) {
            UI.updateVisualState('disconnected');
            if (wasConnected) {
                UI.showStatus(_("Something went wrong, connection is closed"),
                              'error');
            } else {
                UI.showStatus(_("Failed to connect to server"), 'error');
            }
        }
        // If reconnecting is allowed process it now
        if (UI.getSetting('reconnect', false) === true && !UI.inhibitReconnect) {
            UI.updateVisualState('reconnecting');

            const delay = parseInt(UI.getSetting('reconnect_delay'));
            UI.reconnectCallback = setTimeout(UI.reconnect, delay);
            return;
        } else {
            UI.updateVisualState('disconnected');
            UI.showStatus(_("Disconnected"), 'normal');
        }

        document.title = PAGE_TITLE;

        UI.openControlbar();
        UI.openConnectPanel();
    },

    securityFailed(e) {
        // Always show security messages since they are important,
        // regardless of fullscreen state
        let msg = "";
        // On security failures we might get a string with a reason
        // directly from the server. Note that we can't control if
        // this string is translated or not.
        if ('reason' in e.detail) {
            msg = _("New connection has been rejected with reason: ") +
                e.detail.reason;
        } else {
            msg = _("New connection has been rejected");
        }
        
        // Suppress permission errors
        if (msg.includes('Permission error') || msg.includes('Permissions check failed')) {
            document.getElementById('noVNC_status').classList.remove("noVNC_open");
            return;
        }

        // Force the status to be visible even in fullscreen
        const statusElem = document.getElementById('noVNC_status');
        statusElem.style.zIndex = "10000"; // Ensure it's above fullscreen elements
        UI.showStatus(msg, 'error');

        // Keep the status visible longer for security messages
        clearTimeout(UI.statusTimeout);
        UI.statusTimeout = window.setTimeout(UI.hideStatus, 5000);
    },

    async serverVerify(e) {
        const type = e.detail.type;
        if (type === 'RSA') {
            const publickey = e.detail.publickey;
            let fingerprint = await window.crypto.subtle.digest("SHA-1", publickey);
            // The same fingerprint format as RealVNC
            fingerprint = Array.from(new Uint8Array(fingerprint).slice(0, 8)).map(
                x => x.toString(16).padStart(2, '0')).join('-');
            
            const dlg = document.getElementById('noVNC_verify_server_dlg');
            const fingerprintElem = document.getElementById('noVNC_fingerprint');
            
            // Add null checks for required elements
            if (!dlg || !fingerprintElem) {
                Log.Error("Unable to find server verification dialog elements");
                UI.disconnect();
                return;
            }
            
            dlg.classList.add('noVNC_open');
            fingerprintElem.innerHTML = fingerprint;
        }
    },

    approveServer(e) {
        e.preventDefault();
        const dlg = document.getElementById('noVNC_verify_server_dlg');
        if (dlg) {
            dlg.classList.remove('noVNC_open');
        }
        if (UI.rfb) {
            UI.rfb.approveServer();
        }
    },

    rejectServer(e) {
        e.preventDefault();
        const dlg = document.getElementById('noVNC_verify_server_dlg');
        if (dlg) {
            dlg.classList.remove('noVNC_open');
        }
        UI.disconnect();
    },

    credentials(e) {
        // FIXME: handle more types

        document.getElementById("noVNC_username_block").classList.remove("noVNC_hidden");
        document.getElementById("noVNC_password_block").classList.remove("noVNC_hidden");

        let inputFocus = "none";
        if (e.detail.types.indexOf("username") === -1) {
            document.getElementById("noVNC_username_block").classList.add("noVNC_hidden");
        } else {
            inputFocus = inputFocus === "none" ? "noVNC_username_input" : inputFocus;
        }
        if (e.detail.types.indexOf("password") === -1) {
            document.getElementById("noVNC_password_block").classList.add("noVNC_hidden");
        } else {
            inputFocus = inputFocus === "none" ? "noVNC_password_input" : inputFocus;
        }
        document.getElementById('noVNC_credentials_dlg')
            .classList.add('noVNC_open');

        setTimeout(() => document
            .getElementById(inputFocus).focus(), 100);

        Log.Warn("Server asked for credentials");
        UI.showStatus(_("Credentials are required"), "warning");
    },

    setCredentials(e) {
        // Prevent actually submitting the form
        e.preventDefault();

        let inputElemUsername = document.getElementById('noVNC_username_input');
        const username = inputElemUsername.value;

        let inputElemPassword = document.getElementById('noVNC_password_input');
        const password = inputElemPassword.value;
        // Clear the input after reading the password
        inputElemPassword.value = "";

        UI.rfb.sendCredentials({ username: username, password: password });
        UI.reconnectPassword = password;
        document.getElementById('noVNC_credentials_dlg')
            .classList.remove('noVNC_open');
    },

    updateLogging() {
        WebUtil.initLogging(UI.getSetting('logging'));
    },

    updateDesktopName(e) {
        UI.desktopName = e.detail.name;
        // Display the desktop name in the document title
        document.title = e.detail.name + " - " + PAGE_TITLE;
    },

    // Force a hard refresh by appending a cache-busting query string to all JS imports
    forceHardRefresh() {
        // This will reload the page with a cache-busting query parameter
        const url = new URL(window.location.href);
        url.searchParams.set('v', Date.now());
        window.location.replace(url.toString());
    },

    // Initial page load read/initialization of settings
    initSetting(name, defVal) {
        // Has the user overridden the default value?
        if (name in UI.customSettings && UI.customSettings.defaults) {
            defVal = UI.customSettings.defaults[name];
        }
        // Check Query string followed by cookie
        let val = WebUtil.getConfigVar ? WebUtil.getConfigVar(name) : null;
        if (val === null && WebUtil.readSetting) {
            val = WebUtil.readSetting(name, defVal);
        }
        if (WebUtil.setSetting) WebUtil.setSetting(name, val);
        if (UI.updateSetting) UI.updateSetting(name);
        // Has the user forced a value?
        if (name in UI.customSettings && UI.customSettings.mandatory) {
            val = UI.customSettings.mandatory[name];
            if (UI.forceSetting) UI.forceSetting(name, val);
        }
        return val;
    },

    forceSetting(name, val) {
        if (WebUtil.setSetting) WebUtil.setSetting(name, val);
        if (UI.updateSetting) UI.updateSetting(name);
        if (UI.disableSetting) UI.disableSetting(name);
    },

    updateSetting(name) {
        let value = UI.getSetting ? UI.getSetting(name) : undefined;
        const ctrl = document.getElementById('noVNC_setting_' + name);
        if (ctrl === null) {
            return;
        }
        if (ctrl.type === 'checkbox') {
            ctrl.checked = value;
        } else if (typeof ctrl.options !== 'undefined') {
            for (let i = 0; i < ctrl.options.length; i += 1) {
                if (ctrl.options[i].value === value) {
                    ctrl.selectedIndex = i;
                    break;
                }
            }
        } else {
            ctrl.value = value;
        }
    },

    saveSetting(name) {
        const ctrl = document.getElementById('noVNC_setting_' + name);
        let val;
        if (ctrl === null) {
            // Element not found, use default or existing value
            val = WebUtil.readSetting ? WebUtil.readSetting(name) : undefined;
        } else if (ctrl.type === 'checkbox') {
            val = ctrl.checked;
        } else if (typeof ctrl.options !== 'undefined' && ctrl.selectedIndex !== undefined) {
            val = ctrl.options[ctrl.selectedIndex].value;
        } else if (ctrl.value !== undefined) {
            val = ctrl.value;
        } else {
            // If we can't determine a value, use the existing setting
            val = WebUtil.readSetting ? WebUtil.readSetting(name) : undefined;
        }
        if (WebUtil.writeSetting) WebUtil.writeSetting(name, val);
        return val;
    },

    getSetting(name) {
        const ctrl = document.getElementById('noVNC_setting_' + name);
        let val = WebUtil.readSetting ? WebUtil.readSetting(name) : undefined;
        if (typeof val !== 'undefined' && val !== null &&
            ctrl !== null && ctrl.type === 'checkbox') {
            if (val.toString().toLowerCase() in {'0': 1, 'no': 1, 'false': 1}) {
                val = false;
            } else {
                val = true;
            }
        }
        return val;
    },

    disableSetting(name) {
        const ctrl = document.getElementById('noVNC_setting_' + name);
        if (ctrl !== null) {
            ctrl.disabled = true;
            if (ctrl.label !== undefined) {
                ctrl.label.classList.add('noVNC_disabled');
            }
        }
    },

    enableSetting(name) {
        const ctrl = document.getElementById('noVNC_setting_' + name);
        if (ctrl !== null) {
            ctrl.disabled = false;
            if (ctrl.label !== undefined) {
                ctrl.label.classList.remove('noVNC_disabled');
            }
        }
    },

    setupSettingLabels() {
        const labels = document.getElementsByTagName('LABEL');
        for (let i = 0; i < labels.length; i++) {
            const htmlFor = labels[i].htmlFor;
            if (htmlFor != '') {
                const elem = document.getElementById(htmlFor);
                if (elem) elem.label = labels[i];
            } else {
                // If 'for' isn't set, use the first input element child
                const children = labels[i].children;
                for (let j = 0; j < children.length; j++) {
                    if (children[j].form !== undefined) {
                        children[j].label = labels[i];
                        break;
                    }
                }
            }
        }
    },

    showStatus(text, statusType, time) {
        // Hide the status dialog for non-serious permission errors
        if (typeof text === 'string' && (text.toLowerCase().includes('permission error') || text.toLowerCase().includes('permissions check failed'))) {
            const statusElem = document.getElementById('noVNC_status');
            statusElem.classList.remove("noVNC_open");
            statusElem.textContent = '';
            // Also hide fallback error overlay if present
            const fallback = document.getElementById('noVNC_fallback_error');
            if (fallback) fallback.classList.remove('noVNC_open');
            const fallbackMsg = document.getElementById('noVNC_fallback_errormsg');
            if (fallbackMsg) fallbackMsg.innerHTML = '';
            return;
        }

        const statusElem = document.getElementById('noVNC_status');
        if (typeof statusType === 'undefined') {
            statusType = 'normal';
        }
        if (statusElem.classList.contains("noVNC_open")) {
            if (statusElem.classList.contains("noVNC_status_error")) {
                return;
            }
            if (statusElem.classList.contains("noVNC_status_warn") && statusType === 'normal') {
                return;
            }
        }
        clearTimeout(UI.statusTimeout);
        switch (statusType) {
            case 'error':
                statusElem.classList.remove("noVNC_status_warn");
                statusElem.classList.remove("noVNC_status_normal");
                statusElem.classList.add("noVNC_status_error");
                break;
            case 'warning':
            case 'warn':
                statusElem.classList.remove("noVNC_status_error");
                statusElem.classList.remove("noVNC_status_normal");
                statusElem.classList.add("noVNC_status_warn");
                break;
            case 'normal':
            case 'info':
            default:
                statusElem.classList.remove("noVNC_status_error");
                statusElem.classList.remove("noVNC_status_warn");
                statusElem.classList.add("noVNC_status_normal");
                break;
        }
        statusElem.textContent = text;
        statusElem.classList.add("noVNC_open");
        if (typeof time === 'undefined') {
            time = 1500;
        }
        if (statusType !== 'error') {
            UI.statusTimeout = window.setTimeout(UI.hideStatus, time);
        }
    },
    hideStatus() {
        clearTimeout(UI.statusTimeout);
        document.getElementById('noVNC_status').classList.remove("noVNC_open");
    },
    activateControlbar(event) {
        clearTimeout(UI.idleControlbarTimeout);
        document.getElementById('noVNC_control_bar_anchor').classList.remove("noVNC_idle");
        UI.idleControlbarTimeout = window.setTimeout(UI.idleControlbar, 2000);
    },
    idleControlbar() {
        if (document.getElementById('noVNC_control_bar').contains(document.activeElement) && document.hasFocus()) {
            UI.activateControlbar();
            return;
        }
        document.getElementById('noVNC_control_bar_anchor').classList.add("noVNC_idle");
    },
    keepControlbar() {
        clearTimeout(UI.closeControlbarTimeout);
    },
    openControlbar() {
        document.getElementById('noVNC_control_bar').classList.add("noVNC_open");
    },
    closeControlbar() {
        // Check if closeAllPanels exists before calling it
        if (typeof UI.closeAllPanels === 'function') {
            UI.closeAllPanels();
        }
        document.getElementById('noVNC_control_bar').classList.remove("noVNC_open");
        if (UI.rfb && UI.rfb.focus) UI.rfb.focus();
    },
    toggleControlbar() {
        if (document.getElementById('noVNC_control_bar').classList.contains("noVNC_open")) {
            UI.closeControlbar();
        } else {
            UI.openControlbar();
        }
    },
    toggleControlbarSide() {
        const bar = document.getElementById('noVNC_control_bar');
        const barDisplayStyle = window.getComputedStyle(bar).display;
        if (barDisplayStyle !== 'none') {
            bar.style.transition = '0s';
            bar.addEventListener('transitionend', () => bar.style.transitionDuration = '');
        }
        const anchor = document.getElementById('noVNC_control_bar_anchor');
        if (anchor.classList.contains("noVNC_right")) {
            WebUtil.writeSetting('controlbar_pos', 'left');
            anchor.classList.remove("noVNC_right");
        } else {
            WebUtil.writeSetting('controlbar_pos', 'right');
            anchor.classList.add("noVNC_right");
        }
        UI.controlbarDrag = true;
        UI.showControlbarHint(false, false);
    },
    showControlbarHint(show, animate=true) {
        const hint = document.getElementById('noVNC_control_bar_hint');
        if (animate) {
            hint.classList.remove("noVNC_notransition");
        } else {
            hint.classList.add("noVNC_notransition");
        }
        if (show) {
            hint.classList.add("noVNC_active");
        } else {
            hint.classList.remove("noVNC_active");
        }
    },
    dragControlbarHandle(e) {
        if (!UI.controlbarGrabbed) return;
        const ptr = getPointerEvent(e);
        const anchor = document.getElementById('noVNC_control_bar_anchor');
        if (ptr.clientX < (window.innerWidth * 0.1)) {
            if (anchor.classList.contains("noVNC_right")) {
                UI.toggleControlbarSide();
            }
        } else if (ptr.clientX > (window.innerWidth * 0.9)) {
            if (!anchor.classList.contains("noVNC_right")) {
                UI.toggleControlbarSide();
            }
        }
        if (!UI.controlbarDrag) {
            const dragDistance = Math.abs(ptr.clientY - UI.controlbarMouseDownClientY);
            if (dragDistance < dragThreshold) return;
            UI.controlbarDrag = true;
        }
        const eventY = ptr.clientY - UI.controlbarMouseDownOffsetY;
        UI.moveControlbarHandle(eventY);
        e.preventDefault();
        e.stopPropagation();
        UI.keepControlbar();
        UI.activateControlbar();
    },
    moveControlbarHandle(viewportRelativeY) {
        const handle = document.getElementById("noVNC_control_bar_handle");
        const handleHeight = handle.getBoundingClientRect().height;
        const controlbarBounds = document.getElementById("noVNC_control_bar").getBoundingClientRect();
        const margin = 10;
        if (handleHeight === 0 || controlbarBounds.height === 0) {
            return;
        }
        let newY = viewportRelativeY;
        if (newY < controlbarBounds.top + margin) {
            newY = controlbarBounds.top + margin;
        } else if (newY > controlbarBounds.top + controlbarBounds.height - handleHeight - margin) {
            newY = controlbarBounds.top + controlbarBounds.height - handleHeight - margin;
        }
        if (controlbarBounds.height < (handleHeight + margin * 2)) {
            newY = controlbarBounds.top + (controlbarBounds.height - handleHeight) / 2;
        }
        const parentRelativeY = newY - controlbarBounds.top;
        handle.style.transform = "translateY(" + parentRelativeY + "px)";
    },
    updateControlbarHandle() {
        const handle = document.getElementById("noVNC_control_bar_handle");
        const handleBounds = handle.getBoundingClientRect();
        UI.moveControlbarHandle(handleBounds.top);
    },
    controlbarHandleMouseUp(e) {
        if ((e.type == "mouseup") && (e.button != 0)) return;
        if (UI.controlbarGrabbed && !UI.controlbarDrag) {
            UI.toggleControlbar();
            e.preventDefault();
            e.stopPropagation();
            UI.keepControlbar();
            UI.activateControlbar();
        }
        UI.controlbarGrabbed = false;
        UI.showControlbarHint(false);
    },
    controlbarHandleMouseDown(e) {
        if ((e.type == "mousedown") && (e.button != 0)) return;
        const ptr = getPointerEvent(e);
        const handle = document.getElementById("noVNC_control_bar_handle");
        const bounds = handle.getBoundingClientRect();
        if (e.type === "mousedown") {
            setCapture(handle);
        }
        UI.controlbarGrabbed = true;
        UI.controlbarDrag = false;
        UI.showControlbarHint(true);
        UI.controlbarMouseDownClientY = ptr.clientY;
        UI.controlbarMouseDownOffsetY = ptr.clientY - bounds.top;
        e.preventDefault();
        e.stopPropagation();
        UI.keepControlbar();
        UI.activateControlbar();
    },
    toggleExpander(e) {
        if (this.classList.contains("noVNC_open")) {
            this.classList.remove("noVNC_open");
        } else {
            this.classList.add("noVNC_open");
        }
    },
    closeConnectPanel() {
        document.getElementById('noVNC_connect_dlg')
            .classList.remove("noVNC_open");
    },
    openConnectPanel() {
        document.getElementById('noVNC_connect_dlg')
            .classList.add("noVNC_open");
    },
    initFullscreen() {
        if (!isSafari() &&
            (document.documentElement.requestFullscreen ||
             document.documentElement.mozRequestFullScreen ||
             document.documentElement.webkitRequestFullscreen ||
             document.body.msRequestFullscreen)) {
            document.getElementById('noVNC_fullscreen_button')
                .classList.remove("noVNC_hidden");
            UI.addFullscreenHandlers();
        }
    },
    closeAllPanels() {
        if (typeof UI.closeSettingsPanel === 'function') UI.closeSettingsPanel();
        if (typeof UI.closePowerPanel === 'function') UI.closePowerPanel();
        if (typeof UI.closeClipboardPanel === 'function') UI.closeClipboardPanel();
        if (typeof UI.closeExtraKeys === 'function') UI.closeExtraKeys();
        if (typeof closeQuickMenuPanel === 'function') closeQuickMenuPanel();
    },
    openSettingsPanel() {
        if (typeof UI.closeAllPanels === 'function') {
            UI.closeAllPanels();
        }
        if (typeof UI.openControlbar === 'function') {
            UI.openControlbar();
        }
        if (typeof UI.updateSetting === 'function') {
            UI.updateSetting('encrypt');
            UI.updateSetting('view_clip');
            UI.updateSetting('resize');
            UI.updateSetting('quality');
            UI.updateSetting('compression');
            UI.updateSetting('shared');
            UI.updateSetting('view_only');
            UI.updateSetting('path');
            UI.updateSetting('repeaterID');
            UI.updateSetting('logging');
            UI.updateSetting('reconnect');
            UI.updateSetting('reconnect_delay');
        }
        document.getElementById('noVNC_settings')
            ?.classList.add("noVNC_open");
        document.getElementById('noVNC_settings_button')
            ?.classList.add("noVNC_selected");
    },
    closeSettingsPanel() {
        const settings = document.getElementById('noVNC_settings');
        if (settings) settings.classList.remove("noVNC_open");
        const btn = document.getElementById('noVNC_settings_button');
        if (btn) btn.classList.remove("noVNC_selected");
    },
    toggleSettingsPanel() {
        if (document.getElementById('noVNC_settings')
            ?.classList.contains("noVNC_open")) {
            UI.closeSettingsPanel();
        } else {
            UI.openSettingsPanel();
        }
    },
    openPowerPanel() {
        if (typeof UI.closeAllPanels === 'function') UI.closeAllPanels();
        if (typeof UI.openControlbar === 'function') UI.openControlbar();
        document.getElementById('noVNC_power')
            ?.classList.add("noVNC_open");
        document.getElementById('noVNC_power_button')
            ?.classList.add("noVNC_selected");
    },
    closePowerPanel() {
        const power = document.getElementById('noVNC_power');
        if (power) power.classList.remove("noVNC_open");
        const btn = document.getElementById('noVNC_power_button');
        if (btn) btn.classList.remove("noVNC_selected");
    },
    togglePowerPanel() {
        if (document.getElementById('noVNC_power')
            ?.classList.contains("noVNC_open")) {
            UI.closePowerPanel();
        } else {
            UI.openPowerPanel();
        }
    },
    openClipboardPanel() {
        if (typeof UI.closeAllPanels === 'function') UI.closeAllPanels();
        if (typeof UI.openControlbar === 'function') UI.openControlbar();
        document.getElementById('noVNC_clipboard')
            ?.classList.add("noVNC_open");
        document.getElementById('noVNC_clipboard_button')
            ?.classList.add("noVNC_selected");
    },
    closeClipboardPanel() {
        const clipboard = document.getElementById('noVNC_clipboard');
        if (clipboard) clipboard.classList.remove("noVNC_open");
        const btn = document.getElementById('noVNC_clipboard_button');
        if (btn) btn.classList.remove("noVNC_selected");
    },
    toggleClipboardPanel() {
        if (document.getElementById('noVNC_clipboard')
            ?.classList.contains("noVNC_open")) {
            UI.closeClipboardPanel();
        } else {
            UI.openClipboardPanel();
        }
    },
    clipboardReceive(e) {
        Log.Debug("UI.clipboardReceive: " + (e.detail.text ? e.detail.text.substr(0, 40) : "") + "...");
        const clipboardElem = document.getElementById('noVNC_clipboard_text');
        if (clipboardElem) clipboardElem.value = e.detail.text;
        Log.Debug("<< UI.clipboardReceive");
    },
    clipboardSend() {
        const text = document.getElementById('noVNC_clipboard_text').value;
        Log.Debug("UI.clipboardSend: " + (text ? text.substr(0, 40) : "") + "...");
        if (UI.rfb && UI.rfb.clipboardPasteFrom) UI.rfb.clipboardPasteFrom(text);
        Log.Debug("<< UI.clipboardSend");
    },
    updateVisualState(state) {
        document.documentElement.classList.remove("noVNC_connecting");
        document.documentElement.classList.remove("noVNC_connected");
        document.documentElement.classList.remove("noVNC_disconnecting");
        document.documentElement.classList.remove("noVNC_reconnecting");
        const transitionElem = document.getElementById("noVNC_transition_text");
        // Progress bar animation fix
        const loadingBar = document.querySelector('.loading-bar');
        if (loadingBar) {
            loadingBar.classList.remove('initializing', 'connecting', 'connected');
        }
        switch (state) {
            case 'init':
                if (loadingBar) loadingBar.classList.add('initializing');
                break;
            case 'connecting':
                if (transitionElem) transitionElem.textContent = _("Connecting...");
                document.documentElement.classList.add("noVNC_connecting");
                if (loadingBar) loadingBar.classList.add('connecting');
                break;
            case 'connected':
                document.documentElement.classList.add("noVNC_connected");
                if (loadingBar) loadingBar.classList.add('connected');
                break;
            case 'disconnecting':
                if (transitionElem) transitionElem.textContent = _("Disconnecting...");
                document.documentElement.classList.add("noVNC_disconnecting");
                break;
            case 'disconnected':
                break;
            case 'reconnecting':
                if (transitionElem) transitionElem.textContent = _("Reconnecting...");
                document.documentElement.classList.add("noVNC_reconnecting");
                if (loadingBar) loadingBar.classList.add('connecting');
                break;
            default:
                Log.Error("Invalid visual state: " + state);
                UI.showStatus && UI.showStatus(_("Internal error"), 'error');
                return;
        }
        if (UI.connected) {
            UI.updateViewClip && UI.updateViewClip();
            UI.disableSetting && UI.disableSetting('encrypt');
            UI.disableSetting && UI.disableSetting('shared');
            UI.disableSetting && UI.disableSetting('host');
            UI.disableSetting && UI.disableSetting('port');
            UI.disableSetting && UI.disableSetting('path');
            UI.disableSetting && UI.disableSetting('repeaterID');
            UI.closeControlbarTimeout = setTimeout(UI.closeControlbar, 2000);
        } else {
            UI.enableSetting && UI.enableSetting('encrypt');
            UI.enableSetting && UI.enableSetting('shared');
            UI.enableSetting && UI.enableSetting('host');
            UI.enableSetting && UI.enableSetting('port');
            UI.enableSetting && UI.enableSetting('path');
            UI.enableSetting && UI.enableSetting('repeaterID');
            UI.updatePowerButton && UI.updatePowerButton();
            UI.keepControlbar && UI.keepControlbar();
        }
        UI.closeAllPanels && UI.closeAllPanels();
        const verifyDlg = document.getElementById('noVNC_verify_server_dlg');
        if (verifyDlg) verifyDlg.classList.remove('noVNC_open');
        const credDlg = document.getElementById('noVNC_credentials_dlg');
        if (credDlg) credDlg.classList.remove('noVNC_open');
    },

    updateViewOnly() {
        if (!UI.rfb) return;
        UI.rfb.viewOnly = UI.getSetting('view_only');
        // Hide input related buttons in view only mode
        if (UI.rfb.viewOnly) {
            document.getElementById('noVNC_keyboard_button')?.classList.add('noVNC_hidden');
            document.getElementById('noVNC_toggle_extra_keys_button')?.classList.add('noVNC_hidden');
            document.getElementById('noVNC_clipboard_button')?.classList.add('noVNC_hidden');
        } else {
            document.getElementById('noVNC_keyboard_button')?.classList.remove('noVNC_hidden');
            document.getElementById('noVNC_toggle_extra_keys_button')?.classList.remove('noVNC_hidden');
            document.getElementById('noVNC_clipboard_button')?.classList.remove('noVNC_hidden');
        }
    },
    updateShowDotCursor() {
        if (!UI.rfb) return;
        UI.rfb.showDotCursor = UI.getSetting('show_dot');
    },    updateViewClip() {
        if (!UI.rfb) return;
        const mode = UI.getSetting('resize');
        const scaling = mode === 'scale';
        const remote = mode === 'remote';
        let brokenScrollbars = false;
        if (!hasScrollbarGutter) {
            if (isIOS() || isAndroid() || isMac() || isChromeOS()) {
                brokenScrollbars = true;
            }
        }

        if (scaling || remote) {
            // When scaling or using remote resize, disable clipping
            UI.forceSetting('view_clip', false);
            UI.rfb.clipViewport = false;
        } else if (brokenScrollbars) {
            // Force clipping for devices with broken scrollbar handling
            UI.forceSetting('view_clip', true);
            UI.rfb.clipViewport = true;
        } else {
            // Otherwise use the user's preference
            UI.enableSetting('view_clip');
            UI.rfb.clipViewport = UI.getSetting('view_clip');
        }
        UI.updateViewDrag();
    },
    toggleViewDrag() {
        if (!UI.rfb) return;
        UI.rfb.dragViewport = !UI.rfb.dragViewport;
        UI.updateViewDrag();
    },
    updateViewDrag() {
        if (!UI.connected) return;
        const viewDragButton = document.getElementById('noVNC_view_drag_button');
        if ((!UI.rfb.clipViewport || !UI.rfb.clippingViewport) && UI.rfb.dragViewport) {
            UI.rfb.dragViewport = false;
        }
        if (UI.rfb.dragViewport) {
            viewDragButton?.classList.add("noVNC_selected");
        } else {
            viewDragButton?.classList.remove("noVNC_selected");
        }
        if (UI.rfb.clipViewport) {
            viewDragButton?.classList.remove("noVNC_hidden");
        } else {
            viewDragButton?.classList.add("noVNC_hidden");
        }
        if (viewDragButton) viewDragButton.disabled = !UI.rfb.clippingViewport;
    },
    updateQuality() {
        if (!UI.rfb) return;
        UI.rfb.qualityLevel = parseInt(UI.getSetting('quality'));
    },
    updateCompression() {
        if (!UI.rfb) return;
        UI.rfb.compressionLevel = parseInt(UI.getSetting('compression'));
    },
    openExtraKeys() {
        UI.closeAllPanels && UI.closeAllPanels();
        UI.openControlbar && UI.openControlbar();
        document.getElementById('noVNC_modifiers')?.classList.add("noVNC_open");
        document.getElementById('noVNC_toggle_extra_keys_button')?.classList.add("noVNC_selected");
    },
    closeExtraKeys() {
        document.getElementById('noVNC_modifiers')?.classList.remove("noVNC_open");
        document.getElementById('noVNC_toggle_extra_keys_button')?.classList.remove("noVNC_selected");
    },
    toggleExtraKeys() {
        if (document.getElementById('noVNC_modifiers')?.classList.contains("noVNC_open")) {
            UI.closeExtraKeys();
        } else  {
            UI.openExtraKeys();
        }
    },
    sendEsc() { UI.sendKey(KeyTable.XK_Escape, "Escape"); },
    sendTab() { UI.sendKey(KeyTable.XK_Tab, "Tab"); },
    toggleCtrl() {
        const btn = document.getElementById('noVNC_toggle_ctrl_button');
        if (btn?.classList.contains("noVNC_selected")) {
            UI.sendKey(KeyTable.XK_Control_L, "ControlLeft", false);
            btn.classList.remove("noVNC_selected");
        } else {
            UI.sendKey(KeyTable.XK_Control_L, "ControlLeft", true);
            btn.classList.add("noVNC_selected");
        }
    },
    toggleWindows() {
        const btn = document.getElementById('noVNC_toggle_windows_button');
        if (btn?.classList.contains("noVNC_selected")) {
            UI.sendKey(KeyTable.XK_Super_L, "MetaLeft", false);
            btn.classList.remove("noVNC_selected");
        } else {
            UI.sendKey(KeyTable.XK_Super_L, "MetaLeft", true);
            btn.classList.add("noVNC_selected");
        }
    },
    toggleAlt() {
        const btn = document.getElementById('noVNC_toggle_alt_button');
        if (btn?.classList.contains("noVNC_selected")) {
            UI.sendKey(KeyTable.XK_Alt_L, "AltLeft", false);
            btn.classList.remove("noVNC_selected");
        } else {
            UI.sendKey(KeyTable.XK_Alt_L, "AltLeft", true);
            btn.classList.add("noVNC_selected");
        }
    },
    sendCtrlAltDel() {
        UI.rfb.sendCtrlAltDel();
        UI.rfb.focus();
        UI.idleControlbar();
    },
    sendKey(keysym, code, down) {
        UI.rfb.sendKey(keysym, code, down);
        UI.rfb.focus();
        UI.idleControlbar();
    },
    updatePowerButton() {
        if (UI.connected && UI.rfb && UI.rfb.capabilities && UI.rfb.capabilities.power && !UI.rfb.viewOnly) {
            const btn = document.getElementById('noVNC_power_button');
            if (btn) btn.classList.remove("noVNC_hidden");
        } else {
            const btn = document.getElementById('noVNC_power_button');
            if (btn) btn.classList.add("noVNC_hidden");
            UI.closePowerPanel && UI.closePowerPanel();
        }
    },
    toggleFullscreen() {
        if (isWebView()) {
            UI.showStatus('Fullscreen is not available in this environment.', 'error');
            return;
        }
        const docEl = document.documentElement;
        const body = document.body;
        const canFullscreen = (
            docEl.requestFullscreen ||
            docEl.mozRequestFullScreen ||
            docEl.webkitRequestFullscreen ||
            body.msRequestFullscreen
        );
        if (!canFullscreen) {
            UI.showStatus('Fullscreen is not supported on this device/browser.', 'error');
            return;
        }
        if (document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement || document.msFullscreenElement) {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        } else {
            if (docEl.requestFullscreen) {
                docEl.requestFullscreen();
            } else if (docEl.mozRequestFullScreen) {
                docEl.mozRequestFullScreen();
            } else if (docEl.webkitRequestFullscreen) {
                docEl.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
            } else if (body.msRequestFullscreen) {
                body.msRequestFullscreen();
            }
        }
        UI.updateFullscreenButton();
    },
    updateFullscreenButton() {
        if (document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement || document.msFullscreenElement ) {
            document.getElementById('noVNC_fullscreen_button')?.classList.add("noVNC_selected");
        } else {
            document.getElementById('noVNC_fullscreen_button')?.classList.remove("noVNC_selected");
        }
    },
    
    applyResizeMode() {
        if (!UI.rfb) return;
        const mode = UI.getSetting('resize');
        if (UI.rfb.scaleViewport !== undefined) {
            UI.rfb.scaleViewport = mode === 'scale';
        }
        if (UI.rfb.resizeSession !== undefined) {
            UI.rfb.resizeSession = mode === 'remote';
        }
        
        // Update container and canvas styles based on mode
        const container = document.getElementById('noVNC_container');
        if (!container) return;
        
        const canvas = container.querySelector('canvas');
        if (!canvas) return;
        
        if (mode === 'scale') {
            // For local scaling, ensure the container fills the viewport
            // and the canvas scales proportionally within it
            container.style.overflow = 'hidden';
            container.style.width = '100vw';
            container.style.height = '100vh';
            container.style.display = 'flex';
            container.style.alignItems = 'center';
            container.style.justifyContent = 'center';
            canvas.style.maxWidth = '100%';
            canvas.style.maxHeight = '100%';
            canvas.style.width = 'auto';
            canvas.style.height = 'auto';
            canvas.style.objectFit = 'contain';
        } else if (mode === 'remote') {
            // For remote scaling, let the RFB handle sizing
            container.style.overflow = 'auto';
            container.style.width = '';
            container.style.height = '';
            container.style.display = '';
            canvas.style.maxWidth = '';
            canvas.style.maxHeight = '';
            canvas.style.width = '';
            canvas.style.height = '';
            canvas.style.objectFit = '';
        } else {
            // For no scaling, show scrollbars if needed
            container.style.overflow = 'auto';
            container.style.width = '';
            container.style.height = '';
            container.style.display = '';
            canvas.style.maxWidth = 'none';
            canvas.style.maxHeight = 'none';
            canvas.style.width = '';
            canvas.style.height = '';
            canvas.style.objectFit = '';
        }
        
        // Update clipping based on mode
        UI.updateViewClip();
    },
    setupScalingDropdown() {
        const scalingSelect = document.getElementById('noVNC_setting_scaling');
        if (!scalingSelect) return;
        // Set initial value from settings
        const resizeValue = UI.getSetting('resize');
        if (scalingSelect.value !== undefined) {
            scalingSelect.value = resizeValue || 'off';
        }
        scalingSelect.onchange = function() {
            if (scalingSelect && scalingSelect.value !== undefined) {
                UI.saveSetting('resize', scalingSelect.value);
                if (typeof UI.applyResizeMode === 'function') {
                    UI.applyResizeMode();
                }
            }
        };
    },
    addControlbarHandlers() {
        document.getElementById("noVNC_control_bar")
            .addEventListener('mousemove', UI.activateControlbar);
        document.getElementById("noVNC_control_bar")
            .addEventListener('mouseup', UI.activateControlbar);
        document.getElementById("noVNC_control_bar")
            .addEventListener('mousedown', UI.activateControlbar);
        document.getElementById("noVNC_control_bar")
            .addEventListener('keydown', UI.activateControlbar);

        document.getElementById("noVNC_control_bar")
            .addEventListener('mousedown', UI.keepControlbar);
        document.getElementById("noVNC_control_bar")
            .addEventListener('keydown', UI.keepControlbar);

        document.getElementById("noVNC_view_drag_button")
            .addEventListener('click', UI.toggleViewDrag);

        document.getElementById("noVNC_control_bar_handle")
            .addEventListener('mousedown', UI.controlbarHandleMouseDown);
        document.getElementById("noVNC_control_bar_handle")
            .addEventListener('mouseup', UI.controlbarHandleMouseUp);
        document.getElementById("noVNC_control_bar_handle")
            .addEventListener('mousemove', UI.dragControlbarHandle);
        // resize events aren't available for elements
        window.addEventListener('resize', UI.updateControlbarHandle);

        const exps = document.getElementsByClassName("noVNC_expander");
        for (let i = 0;i < exps.length;i++) {
            exps[i].addEventListener('click', UI.toggleExpander);
        }
    },

    addExtraKeysHandlers() {
        document.getElementById("noVNC_toggle_extra_keys_button")
            .addEventListener('click', UI.toggleExtraKeys);
        document.getElementById("noVNC_toggle_ctrl_button")
            .addEventListener('click', UI.toggleCtrl);
        document.getElementById("noVNC_toggle_windows_button")
            .addEventListener('click', UI.toggleWindows);
        document.getElementById("noVNC_toggle_alt_button")
            .addEventListener('click', UI.toggleAlt);
        document.getElementById("noVNC_send_tab_button")
            .addEventListener('click', UI.sendTab);
        document.getElementById("noVNC_send_esc_button")
            .addEventListener('click', UI.sendEsc);
        document.getElementById("noVNC_send_ctrl_alt_del_button")
            .addEventListener('click', UI.sendCtrlAltDel);
    },

    addMachineHandlers() {
        // Modern power panel buttons
        const shutdownBtn = document.getElementById("noVNC_modern_shutdown");
        if (shutdownBtn) shutdownBtn.addEventListener('click', () => UI.rfb && UI.rfb.machineShutdown());
        const rebootBtn = document.getElementById("noVNC_modern_reboot");
        if (rebootBtn) rebootBtn.addEventListener('click', () => UI.rfb && UI.rfb.machineReboot());
        const resetBtn = document.getElementById("noVNC_modern_reset");
        if (resetBtn) resetBtn.addEventListener('click', () => UI.rfb && UI.rfb.machineReset());
    },

    addConnectionControlHandlers() {
        document.getElementById("noVNC_disconnect_button")
            .addEventListener('click', UI.disconnect);
        document.getElementById("noVNC_connect_button")
            .addEventListener('click', UI.connect);
        document.getElementById("noVNC_cancel_reconnect_button")
            .addEventListener('click', UI.cancelReconnect);

        document.getElementById("noVNC_approve_server_button")
            .addEventListener('click', UI.approveServer);
        document.getElementById("noVNC_reject_server_button")
            .addEventListener('click', UI.rejectServer);
        document.getElementById("noVNC_credentials_button")
            .addEventListener('click', UI.setCredentials);
    },

    addClipboardHandlers() {
        const clipboardButtonMain = document.getElementById("noVNC_clipboard_button");
        if (clipboardButtonMain) clipboardButtonMain.addEventListener('click', UI.toggleClipboardPanel);
        const clipboardText = document.getElementById("noVNC_clipboard_text");
        if (clipboardText) clipboardText.addEventListener('change', UI.clipboardSend);
    },

    addSettingChangeHandler(name, changeFunc) {
        const ctrl = document.getElementById('noVNC_setting_' + name);
        if (!ctrl) return;
        if (typeof changeFunc !== 'function') {
            changeFunc = () => UI.saveSetting(name);
        }
        ctrl.addEventListener('change', changeFunc);
    },

    addSettingsHandlers() {
        document.getElementById("noVNC_settings_button")
            .addEventListener('click', UI.toggleSettingsPanel);

        UI.addSettingChangeHandler('encrypt');
        UI.addSettingChangeHandler('resize');
        UI.addSettingChangeHandler('resize', UI.applyResizeMode);
        UI.addSettingChangeHandler('resize', UI.updateViewClip);
        UI.addSettingChangeHandler('quality');
        UI.addSettingChangeHandler('quality', UI.updateQuality);
        UI.addSettingChangeHandler('compression');
        UI.addSettingChangeHandler('compression', UI.updateCompression);
        UI.addSettingChangeHandler('view_clip');
        UI.addSettingChangeHandler('view_clip', UI.updateViewClip);
        UI.addSettingChangeHandler('shared');
        UI.addSettingChangeHandler('view_only');
        UI.addSettingChangeHandler('view_only', UI.updateViewOnly);
        UI.addSettingChangeHandler('show_dot');
        UI.addSettingChangeHandler('show_dot', UI.updateShowDotCursor);
        UI.addSettingChangeHandler('host');
        UI.addSettingChangeHandler('port');
        UI.addSettingChangeHandler('path');
        UI.addSettingChangeHandler('repeaterID');
        UI.addSettingChangeHandler('logging');
        UI.addSettingChangeHandler('logging', UI.updateLogging);
        UI.addSettingChangeHandler('reconnect');
        UI.addSettingChangeHandler('reconnect_delay');
    },

    bell(e) {
        // Optionally play a sound or show a notification
        // Example: play a sound if you have one
        // let audio = document.getElementById('noVNC_bell_audio');
        // if (audio) { audio.play(); }
        // Or just log for now:
        Log.Debug("Bell event received from server");
    },

    showTouchKeyboard() {
        // Show the on-screen keyboard panel but prevent Android keyboard from opening
        const keyboardBtn = document.getElementById('noVNC_keyboard_button');
        if (keyboardBtn) {
            // Prevent default behavior that would trigger the Android keyboard
            const event = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            // Dispatch the event directly instead of using click()
            keyboardBtn.dispatchEvent(event);
        }
    },
};

// Quick Menu UI logic is now handled by setupQuickMenuPanel at the end of this file

// Draggable quick menu toggle button
function setupQuickMenuDraggable() {
    const btn = document.getElementById('noVNC_quick_menu_toggle');
    if (!btn) return;
    let isDragging = false;
    let startX, startY, origX, origY;
    let winW = window.innerWidth, winH = window.innerHeight;
    let btnW = btn.offsetWidth, btnH = btn.offsetHeight;

    // --- Position Persistence ---
    function saveBtnPosition(pos) {
        if (WebUtil && typeof WebUtil.localStorageSet === 'function') {
            WebUtil.localStorageSet('noVNC_quick_menu_btn_pos', JSON.stringify(pos));
            return;
        }
        try {
            if (typeof localStorage !== 'undefined' && localStorage !== null && typeof localStorage.setItem === 'function') {
                localStorage.setItem('noVNC_quick_menu_btn_pos', JSON.stringify(pos));
                return;
            }
        } catch (e) {}
        try {
            if (typeof sessionStorage !== 'undefined' && sessionStorage !== null && typeof sessionStorage.setItem === 'function') {
                sessionStorage.setItem('noVNC_quick_menu_btn_pos', JSON.stringify(pos));
                return;
            }
        } catch (e) {}
        // If no storage available, do nothing
    }
    function loadBtnPosition() {
        try {
            return WebUtil.localStorageGet ? WebUtil.localStorageGet('noVNC_quick_menu_btn_pos', null) : null;
        } catch (e) { return null; }
    }
    function setBtnPosition(pos) {
        // Remove all manual positions first
        btn.style.left = '';
        btn.style.top = '';
        btn.style.right = '';
        btn.style.bottom = '';
        // Set to snapped corner
        if (pos.left !== undefined) btn.style.left = pos.left + 'px';
        if (pos.right !== undefined) btn.style.right = pos.right + 'px';
        if (pos.top !== undefined) btn.style.top = pos.top + 'px';
        if (pos.bottom !== undefined) btn.style.bottom = pos.bottom + 'px';
    }
    function getCorner(x, y) {
        // On mobile devices, always snap to top-right corner for consistency
        if (window.innerWidth <= 600) {
            return {top: 24, right: 24};
        }
        
        // Snap to nearest corner on larger screens
        const corners = [
            {top: 24, left: 24}, // top-left
            {top: 24, right: 24}, // top-right
            {top: winH - btnH - 24, left: 24}, // bottom-left
            {top: winH - btnH - 24, right: 24} // bottom-right
        ];
        let minDist = Infinity, best = corners[1]; // Default to top-right
        for (const c of corners) {
            // Calculate position for comparison
            const cLeft = c.left !== undefined ? c.left : (c.right !== undefined ? winW - btnW - c.right : 0);
            const cTop = c.top;
            const dist = Math.hypot(x - cLeft, y - cTop);
            if (dist < minDist) { minDist = dist; best = c; }
        }
        return best;
    }
    // Restore position on load
    let pos = loadBtnPosition();
    if (pos) {
        // On mobile devices, always position in the top right corner for consistency
        if (window.innerWidth <= 600) {
            setBtnPosition({top: 24, left: 24});
        } else {
            setBtnPosition(pos);
        }
    } else {
        // Default to top left on all devices to avoid overlaying ping meter
        setBtnPosition({top: 24, left: 24});
    }
    function onMouseDown(e) {
        if (e.button !== 0) return;
        isDragging = true;
        btn.classList.add('dragging');
        startX = e.clientX;
        startY = e.clientY;
        const rect = btn.getBoundingClientRect();
        origX = rect.left;
        origY = rect.top;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        e.preventDefault();
    }
    function onMouseMove(e) {
        if (!isDragging) return;
        let dx = e.clientX - startX;
        let dy = e.clientY - startY;
        let newX = origX + dx;
        let newY = origY + dy;
        btn.style.transition = 'none';
        btn.style.left = newX + 'px';
        btn.style.top = newY + 'px';
        btn.style.right = 'auto';
        btn.style.bottom = 'auto';
    }
    function onMouseUp(e) {
        if (!isDragging) return;
        isDragging = false;
        btn.classList.remove('dragging');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        // Snap to nearest corner
        let rect = btn.getBoundingClientRect();
        winW = window.innerWidth; winH = window.innerHeight;
        btnW = btn.offsetWidth; btnH = btn.offsetHeight;
        const corner = getCorner(rect.left, rect.top);
        btn.style.transition = '';
        setBtnPosition(corner);
        saveBtnPosition(corner);
    }
    btn.addEventListener('mousedown', onMouseDown);
    // Touch support
    btn.addEventListener('touchstart', function(e) {
        if (e.touches.length !== 1) return;
        isDragging = true;
        btn.classList.add('dragging');
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        const rect = btn.getBoundingClientRect();
        origX = rect.left;
        origY = rect.top;
        document.addEventListener('touchmove', onTouchMove);
        document.addEventListener('touchend', onTouchEnd);
        e.preventDefault();
    }, {passive: false});
    function onTouchMove(e) {
        if (!isDragging || e.touches.length !== 1) return;
        let dx = e.touches[0].clientX - startX;
        let dy = e.touches[0].clientY - startY;
        let newX = origX + dx;
        let newY = origY + dy;
        btn.style.transition = 'none';
        btn.style.left = newX + 'px';
        btn.style.top = newY + 'px';
        btn.style.right = 'auto';
        btn.style.bottom = 'auto';
    }
    function onTouchEnd(e) {
        if (!isDragging) return;
        isDragging = false;
        btn.classList.remove('dragging');
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
        // Snap to nearest corner
        let rect = btn.getBoundingClientRect();
        winW = window.innerWidth; winH = window.innerHeight;
        btnW = btn.offsetWidth; btnH = btn.offsetHeight;
        const corner = getCorner(rect.left, rect.top);
        btn.style.transition = '';
        setBtnPosition(corner);
        saveBtnPosition(corner);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupQuickMenuDraggable);
} else {
    setupQuickMenuDraggable();
}

// Handle window resize to maintain consistent positioning
window.addEventListener('resize', function() {
    const btn = document.getElementById('noVNC_quick_menu_toggle');
    if (!btn) return;
    
    // On mobile devices, always position in the top left corner
    if (window.innerWidth <= 600) {
        btn.style.transition = '';
        btn.style.left = '12px';
        btn.style.top = '24px';
        btn.style.right = '';
        btn.style.bottom = '';
    }
    
    // Update menu position as well
    const quickMenu = document.getElementById('noVNC_quick_menu');
    if (quickMenu && window.innerWidth <= 600) {
        quickMenu.style.top = '80px';
        quickMenu.style.left = '24px';
        quickMenu.style.right = 'auto';
    }
}); 

// Modern panel logic
function closeAllModernPanels() {
    // Close all modal backdrops
    document.querySelectorAll('.noVNC_modal_backdrop').forEach(b => b.classList.remove('open'));
    // Close all panels
    document.querySelectorAll('.noVNC_modern_panel').forEach(p => p.classList.remove('open'));
    // Close quick menu if it's open
    const quickMenu = document.getElementById('noVNC_quick_menu');
    if (quickMenu && quickMenu.classList.contains('open')) {
        quickMenu.classList.remove('open');
    }
}

function setupModernPanels() {
    // Helper function to open a panel with animation
    function openPanel(modalBackdrop, panel) {
        // First ensure all other panels are closed
        closeAllModernPanels();
        
        // Add a small delay to ensure smooth transition
        setTimeout(() => {
            modalBackdrop.classList.add('open');
            panel.classList.add('open');
            
            // Focus the first input if there is one
            const firstInput = panel.querySelector('input, textarea, select');
            if (firstInput) firstInput.focus();
        }, 10);
    }
    
    // Helper function to close a panel with animation
    function closePanel(modalBackdrop, panel) {
        panel.classList.remove('open');
        modalBackdrop.classList.remove('open');
    }

    // Settings panel
    const settingsPanelBtn = document.getElementById('noVNC_quick_settings');
    const settingsModal = document.getElementById('noVNC_modern_settings_modal');
    const settingsPanel = document.getElementById('noVNC_modern_settings');
    const settingsClose = document.getElementById('noVNC_modern_settings_close');
    
    if (settingsPanelBtn && settingsModal && settingsPanel && settingsClose) {
        settingsPanelBtn.onclick = () => {
            openPanel(settingsModal, settingsPanel);
            // Sync quality value display
            const q = document.getElementById('noVNC_setting_quality');
            const qv = document.getElementById('noVNC_setting_quality_value');
            if (q && qv) qv.textContent = q.value;
            // Sync scaling dropdown value
            const scalingSelect = document.getElementById('noVNC_setting_scaling');
            if (scalingSelect) {
                const resizeValue = UI.getSetting('resize');
                scalingSelect.value = resizeValue || 'off';
            }
        };
        settingsClose.onclick = () => closePanel(settingsModal, settingsPanel);
    }
    
    // Quality slider live update
    const qualitySlider = document.getElementById('noVNC_setting_quality');
    const qualityValue = document.getElementById('noVNC_setting_quality_value');
    if (qualitySlider && qualityValue) {
        qualitySlider.addEventListener('input', function() {
            qualityValue.textContent = this.value;
            UI.saveSetting('quality');
            UI.updateQuality && UI.updateQuality();
        });
    }

    // Modern settings panel scaling dropdown wiring
    const scalingSelect = document.getElementById('noVNC_setting_scaling');
    if (scalingSelect) {
        // Set initial value from settings
        const resizeValue = UI.getSetting('resize');
        scalingSelect.value = resizeValue || 'off';
        scalingSelect.addEventListener('change', function() {
            if (scalingSelect && scalingSelect.value !== undefined) {
                UI.saveSetting('resize', scalingSelect.value);
                UI.applyResizeMode && UI.applyResizeMode();
            }
        });
    }

    // Clipboard panel
    const clipboardBtnQuick = document.getElementById('noVNC_quick_clipboard');
    const clipboardModal = document.getElementById('noVNC_modern_clipboard_modal');
    const clipboardPanel = document.getElementById('noVNC_modern_clipboard');
    const clipboardClose = document.getElementById('noVNC_modern_clipboard_close');
    
    if (clipboardBtnQuick && clipboardModal && clipboardPanel && clipboardClose) {
        clipboardBtnQuick.onclick = () => openPanel(clipboardModal, clipboardPanel);
        clipboardClose.onclick = () => closePanel(clipboardModal, clipboardPanel);
    }
    
    const clipboardSendBtn = document.getElementById('noVNC_modern_clipboard_send');
    if (clipboardSendBtn) {
        clipboardSendBtn.onclick = (e) => {
            e.preventDefault();
            const text = document.getElementById('noVNC_modern_clipboard_text').value;
            if (UI.rfb && UI.rfb.clipboardPasteFrom) UI.rfb.clipboardPasteFrom(text);
        };
    }

    // Power panel
    const quickPowerBtn = document.getElementById('noVNC_quick_power');
const powerModal = document.getElementById('noVNC_modern_power_modal');
const powerPanel = document.getElementById('noVNC_modern_power');
const powerClose = document.getElementById('noVNC_modern_power_close');
    
    if (quickPowerBtn && powerModal && powerPanel && powerClose) {
        quickPowerBtn.onclick = () => openPanel(powerModal, powerPanel);
        powerClose.onclick = () => closePanel(powerModal, powerPanel);
    }
    
    const shutdownBtn = document.getElementById('noVNC_modern_shutdown');
    const rebootBtn = document.getElementById('noVNC_modern_reboot');
    const resetBtn = document.getElementById('noVNC_modern_reset');
    
    if (shutdownBtn) shutdownBtn.onclick = () => { if (UI.rfb) UI.rfb.machineShutdown(); closeAllModernPanels(); };
    if (rebootBtn) rebootBtn.onclick = () => { if (UI.rfb) UI.rfb.machineReboot(); closeAllModernPanels(); };
    if (resetBtn) resetBtn.onclick = () => { if (UI.rfb) UI.rfb.machineReset(); closeAllModernPanels(); };

    // Close modal on backdrop click
    document.querySelectorAll('.noVNC_modal_backdrop').forEach(backdrop => {
        backdrop.addEventListener('mousedown', function(e) {
            if (e.target === backdrop) closeAllModernPanels();
        });
        backdrop.addEventListener('touchend', function(e) {
            if (e.target === backdrop) closeAllModernPanels();
        });
    });
    
    // Close panels with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            // Only close if a panel is open
            const openPanels = document.querySelectorAll('.noVNC_modern_panel.open');
            if (openPanels.length > 0) {
                closeAllModernPanels();
                e.preventDefault();
            }
        }
    });

}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupModernPanels);
} else {
    setupModernPanels();
}

// Hide the connect button forever
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        const domLoadedConnectBtn = document.getElementById('noVNC_connect_button');
        if (domLoadedConnectBtn) domLoadedConnectBtn.style.display = 'none';
    });
} else {
    const fallbackConnectBtn = document.getElementById('noVNC_connect_button');
    if (fallbackConnectBtn) fallbackConnectBtn.style.display = 'none';
}

// --- LATENCY METER ---
(function setupLatencyMeter() {
    // Create the latency meter container
    const meter = document.createElement('div');
    meter.id = 'noVNC_latency_meter';
    meter.style.position = 'fixed';
    meter.style.top = '18px';
    meter.style.right = '24px';
    meter.style.zIndex = '9999';
    meter.style.display = 'flex';
    meter.style.alignItems = 'center';
    meter.style.gap = '8px';
    meter.style.background = 'rgba(30,32,36,0.82)';
    meter.style.borderRadius = '10px';
    meter.style.padding = '6px 16px 6px 12px';
    meter.style.boxShadow = '0 2px 12px 0 rgba(0,0,0,0.10)';
    meter.style.fontWeight = '600';
    meter.style.fontSize = '1em';
    meter.style.userSelect = 'none';
    meter.style.pointerEvents = 'none';

    // --- Transparency Slider ---
    const transparencyWrap = document.createElement('div');
    transparencyWrap.style.position = 'absolute';
    transparencyWrap.style.top = '100%';
    transparencyWrap.style.right = '0';
    transparencyWrap.style.background = 'rgba(30,32,36,0.95)';
    transparencyWrap.style.borderRadius = '8px';
    transparencyWrap.style.padding = '8px 12px';
    transparencyWrap.style.marginTop = '8px';
    transparencyWrap.style.display = 'none';
    transparencyWrap.style.zIndex = '10000';
    transparencyWrap.style.boxShadow = '0 2px 12px 0 rgba(0,0,0,0.10)';
    transparencyWrap.style.userSelect = 'auto';
    transparencyWrap.style.pointerEvents = 'auto';
    transparencyWrap.innerHTML = `<label style="font-size:0.95em;font-weight:500;">Ping Overlay Transparency <input id="noVNC_latency_transparency" type="range" min="0.2" max="1" step="0.01" value="0.82" style="vertical-align:middle;width:90px;margin-left:8px;"></label>`;
    document.body.appendChild(transparencyWrap);
    // Show/hide on click
    meter.addEventListener('click', function() {
        transparencyWrap.style.display = transparencyWrap.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('mousedown', function(e) {
        if (!transparencyWrap.contains(e.target) && e.target !== meter) {
            transparencyWrap.style.display = 'none';
        }
    });
    // Persist transparency
    function saveTransparency(val) {
        if (WebUtil && typeof WebUtil.localStorageSet === 'function') {
            WebUtil.localStorageSet('noVNC_latency_transparency', val);
        } else {
            try {
                if (typeof localStorage !== 'undefined' && localStorage !== null && typeof localStorage.setItem === 'function') {
                    localStorage.setItem('noVNC_latency_transparency', val);
                    return;
                }
            } catch (e) {}
            try {
                if (typeof sessionStorage !== 'undefined' && sessionStorage !== null && typeof sessionStorage.setItem === 'function') {
                    sessionStorage.setItem('noVNC_latency_transparency', val);
                    return;
                }
            } catch (e) {}
            // If no storage available, do nothing
        }
    }
    function safeGetLocalStorageItem(key, fallback) {
        try {
            if (typeof localStorage !== 'undefined' && localStorage !== null) {
                const v = WebUtil.localStorageGet ? WebUtil.localStorageGet(key, fallback) : fallback;
                return v !== null ? v : fallback;
            }
        } catch (e) {}
        return fallback;
    }
    function loadTransparency() {
        let v = safeGetLocalStorageItem('noVNC_latency_transparency', null);
        if (!v) return 0.82;
        return parseFloat(v);
    }
    const transparencySlider = transparencyWrap.querySelector('#noVNC_latency_transparency');
    function setMeterAlpha(alpha) {
        meter.style.background = `rgba(30,32,36,${alpha})`;
    }
    transparencySlider.value = loadTransparency();
    setMeterAlpha(transparencySlider.value);
    transparencySlider.addEventListener('input', function() {
        setMeterAlpha(this.value);
        saveTransparency(this.value);
    });

    // Inline SVG network icon
    const icon = document.createElement('span');
    icon.id = 'noVNC_latency_icon';
    icon.innerHTML = `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="11" r="10" stroke="currentColor" stroke-width="2" fill="none"/><path d="M6 15c1.5-2 8.5-2 10 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="11" cy="15" r="1.5" fill="currentColor"/></svg>`;
    icon.style.display = 'inline-flex';
    icon.style.verticalAlign = 'middle';
    icon.style.fontSize = '1.2em';
    icon.style.transition = 'color 0.2s';

    // Latency text
    const text = document.createElement('span');
    text.id = 'noVNC_latency_text';
    text.textContent = '-- ms';
    text.style.transition = 'color 0.2s';

    meter.appendChild(icon);
    meter.appendChild(text);
    document.body.appendChild(meter);

    // Color logic
    function setMeterColor(latency) {
        let color;
        if (latency === null) {
            color = '#aaa';
        } else if (latency < 80) {
            color = '#22c55e'; // green
        } else if (latency < 200) {
            color = '#eab308'; // yellow
        } else {
            color = '#ef4444'; // red
        }
        icon.style.color = color;
        text.style.color = color;
    }

    // Ping logic
    async function pingServer() {
        const url = window.location.origin + window.location.pathname;
        const start = performance.now();
        let latency = null;
        try {
            // Use HEAD for minimal data
            const resp = await fetch(url, { method: 'HEAD', cache: 'no-store', mode: 'no-cors' });
            latency = Math.round(performance.now() - start);
        } catch (e) {
            latency = null;
        }
        if (latency !== null) {
            text.textContent = latency + ' ms';
        } else {
            text.textContent = '-- ms';
        }
        setMeterColor(latency);
    }

    // Initial ping and interval
    pingServer();
    setInterval(pingServer, 2000);
})();

// --- Quality slider fix ---
// Ensure the slider uses the full range (0-9) and updates UI and RFB logic
function fixQualitySlider() {
    const slider = document.getElementById('noVNC_setting_quality');
    const value = document.getElementById('noVNC_setting_quality_value');
    if (!slider || !value) return;
    slider.min = 0;
    slider.max = 9;
    slider.step = 1;
    // Set value from setting if available
    let saved = UI.getSetting && UI.getSetting('quality');
    if (saved !== undefined && saved !== null) slider.value = saved;
    value.textContent = slider.value;
    slider.addEventListener('input', function() {
        value.textContent = this.value;
        UI.saveSetting && UI.saveSetting('quality');
        UI.updateQuality && UI.updateQuality();
    });
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixQualitySlider);
} else {
    fixQualitySlider();
}

// Quick Menu open/close logic (like other panels, centered, no design change)
function openQuickMenuPanel() {
        // Close any other open panels first
        if (typeof closeAllModernPanels === 'function') {
            closeAllModernPanels();
        }
        
        const quickMenu = document.getElementById('noVNC_quick_menu');
        if (quickMenu) {
            // Set display to flex and immediately add open classes without animation delay
            quickMenu.style.display = 'flex';
            quickMenu.classList.add('noVNC_open');
            quickMenu.classList.add('open');
        }
    }

function closeQuickMenuPanel() {
    const quickMenu = document.getElementById('noVNC_quick_menu');
    if (quickMenu) {
        // Remove both class names used for the open state and immediately hide without animation delay
        quickMenu.classList.remove('noVNC_open');
        quickMenu.classList.remove('open');
        quickMenu.style.display = 'none';
    }
}

function toggleQuickMenuPanel(e) {
    // Prevent default behavior to avoid double triggers
    if (e) e.preventDefault();
    
    const quickMenu = document.getElementById('noVNC_quick_menu');
    if (!quickMenu) return;
    
    // Toggle the menu state
    if (quickMenu.classList.contains('open') || quickMenu.classList.contains('noVNC_open')) {
        closeQuickMenuPanel();
    } else {
        openQuickMenuPanel();
    }
}

function setupQuickMenuPanel() {
    const quickMenu = document.getElementById('noVNC_quick_menu');
    const quickMenuToggle = document.getElementById('noVNC_quick_menu_toggle');
    const quickMenuClose = document.getElementById('noVNC_quick_menu_close');
    if (!quickMenu || !quickMenuToggle || !quickMenuClose) return;
    
    // Use a single handler for both click and touch events
    // This prevents the issue where both handlers fire in sequence
    let touchHandled = false;
    
    quickMenuToggle.addEventListener('click', function(e) {
        if (touchHandled) {
            touchHandled = false;
            return;
        }
        toggleQuickMenuPanel(e);
    });
    
    quickMenuToggle.addEventListener('touchend', function(e) {
        touchHandled = true;
        toggleQuickMenuPanel(e);
    }, {passive: false});
    
    quickMenuClose.addEventListener('click', closeQuickMenuPanel);
    quickMenuClose.addEventListener('touchend', function(e) {
        e.preventDefault();
        closeQuickMenuPanel();
    }, {passive: false});
    
    // Close on outside click
    document.addEventListener('mousedown', (e) => {
        if ((quickMenu.classList.contains('noVNC_open') || quickMenu.classList.contains('open')) && 
            !quickMenu.contains(e.target) && 
            e.target !== quickMenuToggle) {
            closeQuickMenuPanel();
        }
    });
    
    // Escape key closes
    quickMenu.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeQuickMenuPanel();
    });
    
    // Ensure settings, clipboard, and power buttons work with both click and touch
    const settingsTouchBtn = document.getElementById('noVNC_quick_settings');
    const clipboardBtnTouch = document.getElementById('noVNC_quick_clipboard');
    const touchPowerBtn = document.getElementById('noVNC_quick_power');
    
    if (settingsTouchBtn) {
        settingsTouchBtn.addEventListener('touchend', function(e) {
            e.preventDefault();
            closeQuickMenuPanel();
            const settingsModal = document.getElementById('noVNC_modern_settings_modal');
            const settingsPanel = document.getElementById('noVNC_modern_settings');
            if (settingsModal && settingsPanel) {
                settingsModal.classList.add('open');
                settingsPanel.classList.add('open');
            } else if (UI && typeof UI.toggleSettingsPanel === 'function') {
                UI.toggleSettingsPanel();
            }
        }, {passive: false});
    }
    
    if (clipboardBtnTouch) {
        clipboardBtnTouch.addEventListener('touchend', function(e) {
            e.preventDefault();
            closeQuickMenuPanel();
            const clipboardModal = document.getElementById('noVNC_clipboard_modal');
            const clipboardPanel = document.getElementById('noVNC_clipboard');
            if (clipboardModal && clipboardPanel) {
                clipboardModal.classList.add('open');
                clipboardPanel.classList.add('open');
            } else if (UI && typeof UI.toggleClipboardPanel === 'function') {
                UI.toggleClipboardPanel();
            }
        }, {passive: false});
    }
    
    if (touchPowerBtn) {
        touchPowerBtn.addEventListener('touchend', function(e) {
            e.preventDefault();
            closeQuickMenuPanel();
            const powerModal = document.getElementById('noVNC_power_modal');
            const powerPanel = document.getElementById('noVNC_power');
            if (powerModal && powerPanel) {
                powerModal.classList.add('open');
                powerPanel.classList.add('open');
            } else if (UI && typeof UI.togglePowerPanel === 'function') {
                UI.togglePowerPanel();
            }
        }, {passive: false});
    }
    
    // Wire up quick menu buttons to existing UI actions
    const connectBtn = document.getElementById('noVNC_quick_connect');
    if (connectBtn) connectBtn.onclick = () => { closeQuickMenuPanel(); UI.connect && UI.connect(); };
    
    const disconnectBtn = document.getElementById('noVNC_quick_disconnect');
    if (disconnectBtn) disconnectBtn.onclick = () => { closeQuickMenuPanel(); UI.disconnect && UI.disconnect(); };
    
    const settingsQuickBtn = document.getElementById('noVNC_quick_settings');
    if (settingsQuickBtn) settingsQuickBtn.onclick = () => { 
        closeQuickMenuPanel(); 
        const settingsModal = document.getElementById('noVNC_modern_settings_modal');
        const settingsPanel = document.getElementById('noVNC_modern_settings');
        if (settingsModal && settingsPanel) {
            settingsModal.classList.add('open');
            settingsPanel.classList.add('open');
        }
    };
    
    const clipboardBtnMenu = document.getElementById('noVNC_quick_clipboard');
    if (clipboardBtnMenu) clipboardBtnMenu.onclick = () => { 
        closeQuickMenuPanel(); 
        const clipboardModal = document.getElementById('noVNC_modern_clipboard_modal');
        const clipboardPanel = document.getElementById('noVNC_modern_clipboard');
        if (clipboardModal && clipboardPanel) {
            clipboardModal.classList.add('open');
            clipboardPanel.classList.add('open');
        }
    };
    
    const menuPowerBtn = document.getElementById('noVNC_quick_power');
    if (menuPowerBtn) menuPowerBtn.onclick = () => { 
        closeQuickMenuPanel(); 
        const powerModal = document.getElementById('noVNC_modern_power_modal');
        const powerPanel = document.getElementById('noVNC_modern_power');
        if (powerModal && powerPanel) {
            powerModal.classList.add('open');
            powerPanel.classList.add('open');
        }
    };
    
    const fullscreenBtn = document.getElementById('noVNC_quick_fullscreen');
    if (fullscreenBtn) fullscreenBtn.onclick = () => { closeQuickMenuPanel(); UI.toggleFullscreen && UI.toggleFullscreen(); };
    
    const keyboardBtn = document.getElementById('noVNC_quick_keyboard');
    if (keyboardBtn) keyboardBtn.onclick = (e) => { e.preventDefault(); closeQuickMenuPanel(); UI.showTouchKeyboard && UI.showTouchKeyboard(); return false; };
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupQuickMenuPanel);
} else {
    setupQuickMenuPanel();
}

export default UI;
