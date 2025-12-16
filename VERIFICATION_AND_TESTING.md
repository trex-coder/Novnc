# Verification & Testing Guide

## Quick Test Steps

### 1. Clear Browser Cache and Reload
```
Ctrl+Shift+Delete (Windows/Linux) or Cmd+Shift+Delete (Mac)
→ Clear cached images and files
→ Reload vnc.html in browser
```

### 2. Open Developer Console
```
F12 (Windows/Linux) or Cmd+Option+I (Mac)
→ Click "Console" tab
→ Watch for messages
```

### 3. Expected Console Output (In Order)

**Initial Load:**
- No red error messages
- No SyntaxError
- Page shows noVNC connection dialog

**When RFB Connects:**
- `"RFB connected, LoudWave integration ready"`
- Pill navigation APPEARS at bottom of screen
- Connection status shows "Connected"

**If Connection Fails:**
- `"RFB disconnected"`
- Pill navigation is HIDDEN
- Error message in connection dialog

### 4. Test Pill Visibility

**Before Connection:**
- [ ] Pill is completely hidden
- [ ] Click anywhere on screen does NOT show pill
- [ ] Virtual keyboard does NOT appear

**After Connection:**
- [ ] Pill AUTOMATICALLY appears at bottom
- [ ] Can click pill buttons (keyboard, info, quality, etc.)
- [ ] Click outside pill hides it after 4 seconds
- [ ] Click again shows it (with 4-second timeout)

**During Disconnection:**
- [ ] Pill hides immediately
- [ ] Clicking does NOT show pill
- [ ] No console errors

### 5. Check window.rfb in Console

Type in DevTools console:
```javascript
window.rfb
// Should output: RFB {...} if connected
// Or: undefined if not connected

window.rfb.connected
// Should output: true or false

UI.rfb
// Should output same as window.rfb
```

### 6. Test RFB Functions

```javascript
// Test in console:
window.rfb.sendKey(65, true)   // Should work without error
window.rfb.sendPointerEvent(100, 100, 1)  // Should work

// Check connection state
window.rfb.connected  // true/false
```

---

## Common Issues & Fixes

### Issue: Still Getting SyntaxError

**Check:**
1. Hard refresh page (Ctrl+Shift+R or Cmd+Shift+R)
2. Close all tabs with vnc.html
3. Clear browser cache completely
4. Check that [vnc.html](vnc.html#L101) has `await` keyword

**Fix if Still Present:**
- Delete browser cache for the domain
- Try in incognito/private window
- Try different browser
- Check [vnc.html](vnc.html) was saved correctly

### Issue: Pill Never Appears

**Check:**
1. Is RFB connected? (Check status in noVNC dialog)
2. Does console show "RFB connected..." message?
3. Check [vnc.html](vnc.html#L950) `showPillLW()` function

**Fix:**
```javascript
// In console:
window.rfb.connected  // Should be true
window.showPillLW()   // Call manually to test
```

### Issue: Pill Appears Before Connected

**Check:**
1. Is connection state being tracked? (Check `lastRFBState` variable)
2. Look at [vnc.html](vnc.html#L130-L150) for state tracking logic

**Fix:**
- Make sure `lastRFBState` variable exists
- Check connection change detection logic

### Issue: Syntax Error Still at ui.js:2160

**Root Cause:** UI.start() not awaited OR module loading interference

**Verify:**
```javascript
// Check if await is present:
```

Look at [vnc.html line 104](vnc.html#L104):
```html
await UI.start({ settings: {...} });
```

Should have `await` keyword. If not, the fix wasn't applied.

### Issue: window.rfb is Undefined

**Check:**
1. Is UI initialized? (No noVNC status bar = not initialized)
2. Is RFB created? (Check [vnc.html line 140](vnc.html#L140))

**Expected Flow:**
```javascript
// Line 104: await UI.start()
↓ waits for complete initialization
// Line 140: window.rfb = UI.rfb
↓ exposes the RFB object
// Now window.rfb is available
```

---

## Performance Indicators

### Good Signs ✅
- [ ] Page loads without error box
- [ ] Console is clean (no red messages)
- [ ] Connection dialog appears
- [ ] After connecting: "RFB connected" message appears
- [ ] Pill navigation appears automatically
- [ ] Pill disappears after disconnect
- [ ] No "Unexpected token" errors

### Bad Signs ❌
- [ ] Red error box showing SyntaxError
- [ ] "RFB connected" never appears in console
- [ ] Pill never appears even when connected
- [ ] Console shows undefined errors
- [ ] window.rfb is always undefined

---

## Browser DevTools Debug Steps

### 1. Check Module Loading
```javascript
// In console:
UI  // Should be the UI object
UI.rfb  // Should exist after connection
window.rfb  // Should equal UI.rfb after connection
```

### 2. Monitor RFB Events
```javascript
// Add listener to see when RFB connects
window.addEventListener('rfbCreated', (e) => {
    console.log('RFB Created Event:', e.detail);
});
```

### 3. Check Pill Visibility
```javascript
// Test showing pill
window.showPillLW();

// Check if it actually shows
const pill = document.getElementById('pillNav');
pill.classList.contains('visible')  // Should be true

// Test hiding pill
window.hidePillLW();
pill.classList.contains('hidden-completely')  // Should be true
```

### 4. Network Tab Analysis
- Should see: `ui.js` loads with no errors
- Should see: WebSocket connection to VNC server
- Should see: No 404 errors for any resources

### 5. Sources Tab Breakpoint
- Set breakpoint at [vnc.html line 104](vnc.html#L104)
- Step through UI.start() completion
- Verify RFB is created
- Verify window.rfb is assigned

---

## Timeout Behavior

### RFB Connection Monitor Polling
- **Check Interval:** 300ms (every 0.3 seconds)
- **Max Duration:** 120 seconds (2 minutes)
- **After 2 minutes:** Polling stops automatically

### Pill Auto-Hide
- **Visible Duration:** 4 seconds (if no interaction)
- **Re-trigger:** Click anywhere on screen
- **Condition:** Only works if RFB connected

---

## Connection State Machine

```
Page Loads
↓
Module Script Executes
↓
await UI.start() ← Waits here
↓
monitorRFB polling starts
↓
RFB Connects (WebSocket opens)
↓
rfbCreated event fires
↓
window.showPillLW() called
↓
Pill Appears ← SUCCESS
```

If pill doesn't appear, one of these steps failed.

---

## After Successful Fix

You should see:

1. **Console Output:**
```
RFB connected, LoudWave integration ready
```

2. **Visual Indicators:**
- Pill nav at bottom center of screen
- Status shows "Remote Desktop Connected"
- Keyboard, info, quality buttons all visible
- Green WiFi icon in pill header

3. **Interactivity:**
- Click keyboard button → Virtual keyboard appears
- Click info button → Connection info sidebar appears
- Click quality → Quality settings dialog appears
- Click disconnect → Confirmation dialog appears

4. **Mobile Behavior** (if testing on mobile):
- Pill appears at bottom center
- Buttons are touch-responsive
- Haptic feedback if enabled

---

## Rollback If Issues Persist

If you need to revert to the previous version:

```javascript
// To disable the fix temporarily (in console):
clearInterval(monitorRFB);  // Stop RFB monitor
window.rfb = undefined;      // Clear window.rfb
```

Or replace [vnc.html](vnc.html#L100-L140) module script with:
```html
<script type="module">
    import UI from "./app/ui.js";
    import * as Log from './core/util/logging.js';
    
    // ... fetch code ...
    
    UI.start({ settings: { defaults: defaults, mandatory: mandatory } });
</script>
```

(But keep the fix in place - it solves the core issue)

---

## Questions?

If issues persist:
1. Check browser console for specific error messages
2. Note the exact error location and message
3. Verify [vnc.html](vnc.html) was fully updated
4. Try hard refresh (Ctrl+Shift+R)
5. Try incognito window to bypass cache
6. Check file timestamps to confirm updates applied

