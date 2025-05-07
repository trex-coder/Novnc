/*
 * noVNC: HTML5 VNC client
 * Copyright (C) 2019 The noVNC authors
 * Licensed under MPL 2.0 (see LICENSE.txt)
 *
 * See README.md for usage and integration instructions.
 */

import * as Log from '../core/util/logging.js';

// init log level reading the logging HTTP param
export function initLogging(level) {
    "use strict";
    if (typeof level !== "undefined") {
        Log.initLogging(level);
    } else {
        const param = document.location.href.match(/logging=([A-Za-z0-9._-]*)/);
        Log.initLogging(param || undefined);
    }
}

// Read a query string variable
export function getQueryVar(name, defVal) {
    "use strict";
    const re = new RegExp('.*[?&]' + name + '=([^&#]*)'),
        match = document.location.href.match(re);
    if (typeof defVal === 'undefined') { defVal = null; }
    
    if (match) {
        return decodeURIComponent(match[1]);
    }
    
    return defVal;
}

// Read a hash fragment variable
export function getHashVar(name, defVal) {
    "use strict";
    const re = new RegExp('.*[&#]' + name + '=([^&]*)'),
        match = document.location.hash.match(re);
    if (typeof defVal === 'undefined') { defVal = null; }

    if (match) {
        return decodeURIComponent(match[1]);
    }

    return defVal;
}

// Read a variable from the fragment or the query string
// Fragment takes precedence
export function getConfigVar(name, defVal) {
    "use strict";
    const val = getHashVar(name);

    if (val === null) {
        return getQueryVar(name, defVal);
    }

    return val;
}

/*
 * Cookie handling. Dervied from: http://www.quirksmode.org/js/cookies.html
 */

// No days means only for this browser session
export function createCookie(name, value, days) {
    "use strict";
    let date, expires;
    if (days) {
        date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toGMTString();
    } else {
        expires = "";
    }

    let secure;
    if (document.location.protocol === "https:") {
        secure = "; secure";
    } else {
        secure = "";
    }
    document.cookie = name + "=" + value + expires + "; path=/" + secure;
}

export function readCookie(name, defaultValue) {
    "use strict";
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');

    for (let i = 0; i < ca.length; i += 1) {
        let c = ca[i];
        while (c.charAt(0) === ' ') {
            c = c.substring(1, c.length);
        }
        if (c.indexOf(nameEQ) === 0) {
            return c.substring(nameEQ.length, c.length);
        }
    }

    return (typeof defaultValue !== 'undefined') ? defaultValue : null;
}

export function eraseCookie(name) {
    "use strict";
    createCookie(name, "", -1);
}

/*
 * Setting handling.
 */

let settings = {};
let settingsLoaded = false;

export async function initSettings() {
    if (settingsLoaded) {
        return Promise.resolve();
    }

    settings = {};

    // First try to load defaults.json
    try {
        const response = await fetch('./defaults.json');
        if (response.ok) {
            const defaults = await response.json();
            for (const [key, value] of Object.entries(defaults)) {
                settings[key] = value;
            }
        }
    } catch (err) {
        Log.Error("Failed to load defaults.json: " + err);
    }

    // Then try to load from storage
    if (window.chrome && window.chrome.storage) {
        const chromeSettings = await new Promise(resolve => window.chrome.storage.sync.get(resolve));
        settings = { ...settings, ...chromeSettings };
    } else {
        // Load from localStorage
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            try {
                const value = localStorage.getItem(key);
                if (value !== null) {
                    settings[key] = value;
                }
            } catch (e) {
                if (e instanceof DOMException) {
                    Log.Warn("Could not read setting from localStorage: " + e);
                } else {
                    throw e;
                }
            }
        }
    }

    settingsLoaded = true;
    return Promise.resolve();
}

// Update the settings cache, but do not write to permanent storage
export function setSetting(name, value) {
    settings[name] = value;
}

// No days means only for this browser session
export function writeSetting(name, value) {
    "use strict";
    if (settings[name] === value) return;
    settings[name] = value;
    
    if (window.chrome && window.chrome.storage) {
        const setting = {};
        setting[name] = value;
        window.chrome.storage.sync.set(setting);
    } else {
        try {
            localStorage.setItem(name, value);
        } catch (e) {
            if (e instanceof DOMException) {
                Log.Warn("Could not write setting to localStorage: " + e);
            } else {
                throw e;
            }
        }
    }
}

export function readSetting(name, defaultValue) {
    "use strict";
    // First check our settings cache
    if (name in settings) {
        return settings[name];
    }

    // Then check URL parameters
    const urlValue = getConfigVar(name);
    if (urlValue !== null) {
        settings[name] = urlValue;
        return urlValue;
    }

    // Finally use default
    if (typeof defaultValue !== "undefined") {
        settings[name] = defaultValue;
        return defaultValue;
    }
    
    return null;
}

export function eraseSetting(name) {
    "use strict";
    delete settings[name];
    if (window.chrome && window.chrome.storage) {
        window.chrome.storage.sync.remove(name);
    } else {
        try {
            localStorage.removeItem(name);
        } catch (e) {
            if (e instanceof DOMException) {
                Log.Warn("Could not erase setting from localStorage: " + e);
            } else {
                throw e;
            }
        }
    }
}
