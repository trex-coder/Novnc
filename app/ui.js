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
        UI.closeAllPanels && UI.closeAllPanels();
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
        UI.closeSettingsPanel && UI.closeSettingsPanel();
        UI.closePowerPanel && UI.closePowerPanel();
        UI.closeClipboardPanel && UI.closeClipboardPanel();
        UI.closeExtraKeys && UI.closeExtraKeys();
        closeQuickMenuPanel();
    },
    openSettingsPanel() {
        UI.closeAllPanels && UI.closeAllPanels();
        UI.openControlbar && UI.openControlbar();
        UI.updateSetting && UI.updateSetting('encrypt');
        UI.updateSetting && UI.updateSetting('view_clip');
        UI.updateSetting && UI.updateSetting('resize');
        UI.updateSetting && UI.updateSetting('quality');
        UI.updateSetting && UI.updateSetting('compression');
        UI.updateSetting && UI.updateSetting('shared');
        UI.updateSetting && UI.updateSetting('view_only');
        UI.updateSetting && UI.updateSetting('path');
        UI.updateSetting && UI.updateSetting('repeaterID');
        UI.updateSetting && UI.updateSetting('logging');
        UI.updateSetting && UI.updateSetting('reconnect');
        UI.updateSetting && UI.updateSetting('reconnect_delay');
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
        UI.closeAllPanels && UI.closeAllPanels();
        UI.openControlbar && UI.openControlbar();
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
        UI.closeAllPanels && UI.closeAllPanels();
        UI.openControlbar && UI.openControlbar();
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
    },
    updateViewClip() {
        if (!UI.rfb) return;
        const scaling = UI.getSetting('resize') === 'scale';
        let brokenScrollbars = false;
        if (!hasScrollbarGutter) {
            if (isIOS() || isAndroid() || isMac() || isChromeOS()) {
                brokenScrollbars = true;
            }
        }
        if (scaling) {
            UI.forceSetting('view_clip', false);
            UI.rfb.clipViewport  = false;
        } else if (brokenScrollbars) {
            UI.forceSetting('view_clip', true);
            UI.rfb.clipViewport = true;
        } else {
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
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen();
            } else if (document.documentElement.mozRequestFullScreen) {
                document.documentElement.mozRequestFullScreen();
            } else if (document.documentElement.webkitRequestFullscreen) {
                document.documentElement.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
            } else if (document.body.msRequestFullscreen) {
                document.body.msRequestFullscreen();
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
        UI.rfb.scaleViewport = UI.getSetting('resize') === 'scale';
        UI.rfb.resizeSession = UI.getSetting('resize') === 'remote';
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
        const clipboardBtn = document.getElementById("noVNC_clipboard_button");
        if (clipboardBtn) clipboardBtn.addEventListener('click', UI.toggleClipboardPanel);
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
};

// Quick Menu UI logic
function setupQuickMenu() {
    const quickMenu = document.getElementById('noVNC_quick_menu');
    const quickMenuToggle = document.getElementById('noVNC_quick_menu_toggle');
    const quickMenuClose = document.getElementById('noVNC_quick_menu_close');
    if (!quickMenu || !quickMenuToggle || !quickMenuClose) return;
    function openMenu() { 
        // Close any open panels first
        closeAllModernPanels();
        // Then open the quick menu
        const quickMenu = document.getElementById('noVNC_quick_menu');
        if (quickMenu) quickMenu.classList.add('open');
    }
    function closeMenu() { 
        const quickMenu = document.getElementById('noVNC_quick_menu');
        if (quickMenu) quickMenu.classList.remove('open');
    }
    // Prevent double open on touch/click
    let touchHandled = false;
    quickMenuToggle.addEventListener('click', function(e) {
        if (touchHandled) { touchHandled = false; return; }
        openMenu();
    });
    quickMenuToggle.addEventListener('touchend', function(e) {
        touchHandled = true;
        openMenu();
        e.preventDefault();
    }, {passive: false});
    quickMenuClose.addEventListener('click', closeMenu);
    // Close menu on outside click
    document.addEventListener('mousedown', (e) => {
        if (quickMenu.classList.contains('noVNC_open') && !quickMenu.contains(e.target) && e.target !== quickMenuToggle) {
            closeMenu();
        }
    });
    // Wire up quick menu buttons to existing UI actions
    document.getElementById('noVNC_quick_connect').onclick = () => { closeMenu(); UI.connect(); };
    document.getElementById('noVNC_quick_disconnect').onclick = () => { closeMenu(); UI.disconnect(); };
    document.getElementById('noVNC_quick_settings').onclick = () => { closeMenu(); UI.openSettingsPanel(); };
    document.getElementById('noVNC_quick_clipboard').onclick = () => { closeMenu(); UI.openClipboardPanel(); };
    document.getElementById('noVNC_quick_power').onclick = () => { closeMenu(); UI.openPowerPanel(); };
    document.getElementById('noVNC_quick_fullscreen').onclick = () => { closeMenu(); UI.toggleFullscreen(); };
}
// Call setupQuickMenu after DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupQuickMenu);
} else {
    setupQuickMenu();
}

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
        localStorage.setItem('noVNC_quick_menu_btn_pos', JSON.stringify(pos));
    }
    function loadBtnPosition() {
        try {
            return JSON.parse(localStorage.getItem('noVNC_quick_menu_btn_pos'));
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
        // Snap to nearest corner
        const corners = [
            {top: 24, left: 24}, // top-left
            {top: 24, left: winW - btnW - 24}, // top-right
            {top: winH - btnH - 24, left: 24}, // bottom-left
            {top: winH - btnH - 24, left: winW - btnW - 24} // bottom-right
        ];
        let minDist = Infinity, best = corners[0];
        for (const c of corners) {
            const dist = Math.hypot(x - c.left, y - c.top);
            if (dist < minDist) { minDist = dist; best = c; }
        }
        return best;
    }
    // Restore position on load
    let pos = loadBtnPosition();
    if (pos) {
        setBtnPosition(pos);
    } else {
        // Default to top left
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
    const settingsBtn = document.getElementById('noVNC_quick_settings');
    const settingsModal = document.getElementById('noVNC_modern_settings_modal');
    const settingsPanel = document.getElementById('noVNC_modern_settings');
    const settingsClose = document.getElementById('noVNC_modern_settings_close');
    
    if (settingsBtn && settingsModal && settingsPanel && settingsClose) {
        settingsBtn.onclick = () => {
            openPanel(settingsModal, settingsPanel);
            // Sync quality value display
            const q = document.getElementById('noVNC_setting_quality');
            const qv = document.getElementById('noVNC_setting_quality_value');
            if (q && qv) qv.textContent = q.value;
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

    // Clipboard panel
    const clipboardBtn = document.getElementById('noVNC_quick_clipboard');
    const clipboardModal = document.getElementById('noVNC_modern_clipboard_modal');
    const clipboardPanel = document.getElementById('noVNC_modern_clipboard');
    const clipboardClose = document.getElementById('noVNC_modern_clipboard_close');
    
    if (clipboardBtn && clipboardModal && clipboardPanel && clipboardClose) {
        clipboardBtn.onclick = () => openPanel(clipboardModal, clipboardPanel);
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
    const powerBtn = document.getElementById('noVNC_quick_power');
    const powerModal = document.getElementById('noVNC_modern_power_modal');
    const powerPanel = document.getElementById('noVNC_modern_power');
    const powerClose = document.getElementById('noVNC_modern_power_close');
    
    if (powerBtn && powerModal && powerPanel && powerClose) {
        powerBtn.onclick = () => openPanel(powerModal, powerPanel);
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
        const connectBtn = document.getElementById('noVNC_connect_button');
        if (connectBtn) connectBtn.style.display = 'none';
    });
} else {
    const connectBtn = document.getElementById('noVNC_connect_button');
    if (connectBtn) connectBtn.style.display = 'none';
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
        localStorage.setItem('noVNC_latency_transparency', val);
    }
    function loadTransparency() {
        let v = localStorage.getItem('noVNC_latency_transparency');
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
    const quickMenu = document.getElementById('noVNC_quick_menu');
    if (quickMenu) quickMenu.classList.add('noVNC_open');
}
function closeQuickMenuPanel() {
    const quickMenu = document.getElementById('noVNC_quick_menu');
    if (quickMenu) quickMenu.classList.remove('noVNC_open');
}
function setupQuickMenuPanel() {
    const quickMenu = document.getElementById('noVNC_quick_menu');
    const quickMenuToggle = document.getElementById('noVNC_quick_menu_toggle');
    const quickMenuClose = document.getElementById('noVNC_quick_menu_close');
    if (!quickMenu || !quickMenuToggle || !quickMenuClose) return;
    quickMenuToggle.addEventListener('click', openQuickMenuPanel);
    quickMenuClose.addEventListener('click', closeQuickMenuPanel);
    // Close on outside click (optional, like other panels)
    document.addEventListener('mousedown', (e) => {
        if (quickMenu.classList.contains('noVNC_open') && !quickMenu.contains(e.target) && e.target !== quickMenuToggle) {
            closeQuickMenuPanel();
        }
    });
    // Escape key closes
    quickMenu.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeQuickMenuPanel();
    });
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupQuickMenuPanel);
} else {
    setupQuickMenuPanel();
}

export default UI;
