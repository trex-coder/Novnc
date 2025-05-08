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
import Keyboard from "../core/input/keyboard.js";
import RFB from "../core/rfb.js";
import * as WebUtil from "./webutil.js";

const PAGE_TITLE = "noVNC";

const LINGUAS = ["cs", "de", "el", "es", "fr", "it", "ja", "ko", "nl", "pl", "pt_BR", "ru", "sv", "tr", "zh_CN", "zh_TW"];

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
        UI.addTouchSpecificHandlers();
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
        UI.initSetting('host', window.location.hostname || 'localhost');
        UI.initSetting('port', window.location.port || 5900);
        UI.initSetting('encrypt', (window.location.protocol === "https:"));
        UI.initSetting('password');
        UI.initSetting('autoconnect', true);
        UI.initSetting('view_clip', false);
        UI.initSetting('resize', 'scale');
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
        if (UI.getSetting('autoconnect', true)) {
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
        UI.rfb.clipViewport = UI.getSetting('view_clip');
        UI.rfb.scaleViewport = UI.getSetting('resize') === 'scale';
        UI.rfb.resizeSession = UI.getSetting('resize') === 'remote';
        UI.rfb.qualityLevel = parseInt(UI.getSetting('quality'));
        UI.rfb.compressionLevel = parseInt(UI.getSetting('compression'));
        UI.rfb.showDotCursor = UI.getSetting('show_dot');

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

        // Auto-enter fullscreen mode
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        } else if (!document.mozFullScreenElement && document.documentElement.mozRequestFullScreen) {
            document.documentElement.mozRequestFullScreen();
        } else if (!document.webkitFullscreenElement && document.documentElement.webkitRequestFullscreen) {
            document.documentElement.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
        } else if (!document.msFullscreenElement && document.body.msRequestFullscreen) {
            document.body.msRequestFullscreen();
        }

        // Do this last because it can only be used on rendered elements
        UI.rfb.focus();
    },

    disconnectFinished(e) {
        const wasConnected = UI.connected;

        // This variable is ideally set when disconnection starts, but
        // when the disconnection isn't clean or if it is initiated by
        // the server, we need to do it here as well since
        // UI.disconnect() won't be used in those cases.
        UI.connected = false;

        UI.rfb = undefined;

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
        if (ctrl.type === 'checkbox') {
            val = ctrl.checked;
        } else if (typeof ctrl.options !== 'undefined') {
            val = ctrl.options[ctrl.selectedIndex].value;
        } else {
            val = ctrl.value;
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
};

export default UI;
