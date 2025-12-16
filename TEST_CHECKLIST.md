# Quick Test Checklist

## Pre-Test Setup
- Open browser DevTools (F12)
- Go to Console tab
- Look for logs with `[Keyboard]`, `[UI]`, `[Ping]`, `[Pill]` prefixes

## Test 1: Welcome Dialog
**Expected**: Dialog appears once on first connection
1. Load VNC page
2. Start connection
3. Wait for connection to establish
4. ✅ Welcome dialog should appear with message about Ctrl+V
5. Dialog should have:
   - Translucent background (glassy look)
   - White text
   - Buttons with subtle gray border
   - "Got it" button clickable
6. Reload page and reconnect
7. ✅ Welcome dialog should NOT appear again (session-based)

## Test 2: Ctrl+V Toggle
**Expected**: Ctrl+V toggles pill visibility smoothly
1. After welcome dialog closes or after 5-10 seconds
2. ✅ Pill should be visible on screen (with latency info)
3. Press `Ctrl+V`
4. ✅ Console should show `[Keyboard] Ctrl+V pressed`
5. ✅ Pill should slide down smoothly (animation takes 0.4s)
6. Press `Ctrl+V` again
7. ✅ Pill should slide back up smoothly
8. Try pressing it multiple times
9. ✅ Should toggle reliably every time

## Test 3: Ping Meter Display
**Expected**: Latency values appear in pill
1. During active connection
2. ✅ Should see icon next to "Remote Desktop" text in pill
3. ✅ Should see `XX ms` or similar value (e.g., "45 ms", "120 ms")
4. Console should show `[Ping]` logs every 2 seconds
5. Color should change based on latency:
   - < 50ms: Green (excellent)
   - < 100ms: Lime green (good)
   - < 150ms: Yellow (fair)
   - < 250ms: Orange (poor)
   - > 250ms: Red (bad)

## Test 4: Pill Display Timing
**Expected**: Pill appears when session screen becomes visible
1. Start fresh connection
2. During connection: `[UI] Scheduling pill display` should appear in console
3. ✅ Pill should NOT appear until session screen is ready
4. Wait for remote desktop view to appear
5. ✅ Pill should slide up at approximately same time
6. Pill bottom position should be around 30px from screen bottom
7. No pill should be visible during page loading state

## Test 5: Old Elements Hidden
**Expected**: Old UI elements are removed
1. Check that old menu button (top right) is NOT visible
2. Check that old ping meter is NOT visible
3. Only new pill navigation should appear during session

## Console Output Examples

### Ctrl+V Working
```
[Keyboard] Ctrl+V pressed
[Keyboard] Pill classes: pill-nav visible
[Keyboard] Hidden-completely: false Visible: true
[Keyboard] Hiding pill via Ctrl+V
```

### Ping Meter Working
```
[Ping] Starting ping measurement
[Ping] Fetch completed, latency: 42ms
[Ping] Calling updatePingIndicator with 42
[Ping] Next ping in 2000ms
```

### Pill Display Working
```
[UI] Session screen ready, showing pill
[UI] Calling showPillLW
[Pill] Showing pill
[UI] Calling showWelcomeDialogOnConnect
```

## Troubleshooting

### If Ctrl+V doesn't work:
- Check console for `[Keyboard] Ctrl+V pressed`
- If no log appears, listener might not be attached
- If log appears but pill doesn't move, classes aren't being toggled

### If Ping doesn't display:
- Check for `[Ping]` logs in console
- If fetches aren't happening, check network tab
- If values appear in console but not UI, check if DOM element exists
- Value should appear as "XX ms" next to wifi icon

### If Pill appears too early:
- Check timing of `noVNC_loading` class removal
- Pill should appear when this class is gone AND session is rendering
- Current delay is 100ms checks with 5s timeout

### If Welcome dialog doesn't appear:
- First connection should always show it
- Check for `showWelcomeDialogOnConnect` in console
- If not appearing, check if session flag already set
- Try opening browser DevTools → Application → Session Storage to clear it
