# LoudWave VNC Viewer Integration

## Overview

This document describes the integration of the LoudWave Dash VNC Viewer UI with the noVNC application. The LoudWave UI provides a modern, touch-friendly interface for remote desktop connections, layered on top of the existing noVNC infrastructure.

## Architecture

The integration consists of three main components:

### 1. **LoudWave UI Layer** (`vnc-viewer.html` elements in `vnc.html`)
- Modern pill-shaped navigation bar at the bottom
- Connection info sidebar
- Virtual keyboard overlay
- Quality settings dialog
- Disconnect confirmation dialog
- Touch-optimized controls with haptic feedback

### 2. **LoudWave Styling** (`app/styles/vnc-viewer.css`)
- Modern glassmorphic design with backdrop filters
- Responsive layout supporting mobile and desktop
- Touch-friendly button sizes and spacing
- Smooth animations and transitions
- Proper z-index stacking to work with noVNC UI

### 3. **Integration Bridge** (`app/loudwave-integration.js`)
- Monitors RFB (Remote Framebuffer) connection state
- Synchronizes connection status with UI
- Handles quality metrics
- Manages resolution tracking
- Provides utility methods for common operations

## Features

### Pill Navigation
The main control interface accessed via a floating pill at the bottom of the screen. Shows:
- Server connection status with ping indicator
- Keyboard button (toggles virtual keyboard)
- Ctrl+Alt+Del quick button
- Info button (opens connection details)
- Fullscreen toggle
- Quality settings
- Disconnect button

### Virtual Keyboard
- Full QWERTY keyboard layout
- Special keys: Shift, Ctrl, Alt, Enter, Backspace
- Spacebar support
- Key presses send directly to RFB connection
- Haptic feedback on supported devices

### Info Menu
Slide-out menu showing:
- Server name
- Display resolution
- Connection quality rating
- Current latency
- Performance stats button

### Quality Settings
Dialog allowing selection of three quality levels:
- **High Quality**: Best visual quality, higher bandwidth usage
- **Medium Quality**: Balanced quality and performance
- **Low Quality**: Faster performance, lower bandwidth

### Canvas Integration
The LoudWave canvas element (with ID `vncCanvas`) is initially hidden, allowing the primary noVNC display to show. Both can be toggled if needed for different visualization modes.

## File Structure

```
Novnc/
├── vnc.html                           # Main HTML with integrated UI
├── app/
│   ├── vnc-script.js                  # LoudWave UI interaction logic
│   ├── loudwave-integration.js        # RFB integration bridge
│   ├── ui.js                          # noVNC UI (existing)
│   └── styles/
│       ├── vnc-viewer.css             # LoudWave styling
│       ├── base.css                   # noVNC base styles
│       └── custom.css                 # noVNC custom styles
└── core/                              # noVNC core library
```

## Wiring the Session Screen

### Connection Flow
1. User loads vnc.html
2. noVNC UI initializes and establishes RFB connection
3. LoudWave integration module detects RFB object
4. Dispatches `rfbCreated` event with RFB instance
5. LoudWave UI becomes operational and synced with connection state

### Input Methods

**Mouse/Touch to RFB:**
```javascript
// Handled in vnc-script.js handlePointerMove()
if (window.rfb && window.rfb.sendPointerEvent) {
    window.rfb.sendPointerEvent(x, y, buttonMask);
}
```

**Keyboard to RFB:**
```javascript
// Virtual keyboard sends via vnc-script.js
if (window.rfb && window.rfb.sendKey) {
    window.rfb.sendKey(keySym, down);
}
```

**Special Commands:**
- Ctrl+Alt+Del: `window.rfb.sendCtrlAltDel()`
- Disconnect: `window.rfb.disconnect()`

## Function Reference

### LoudWave UI Functions

#### Control Functions
- `toggleKeyboardLW()` - Toggle virtual keyboard visibility
- `sendCtrlAltDelLW()` - Send Ctrl+Alt+Del command
- `openInfoMenuLW()` - Open connection info sidebar
- `closeInfoMenuLW()` - Close info sidebar
- `toggleFullscreenLW()` - Toggle fullscreen mode
- `openQualitySettingsLW()` - Open quality settings dialog
- `closeQualitySettingsLW()` - Close quality dialog
- `setQualityLW(quality)` - Set quality level ('high', 'medium', 'low')
- `disconnectLW()` - Show disconnect confirmation
- `confirmDisconnectLW()` - Confirm and execute disconnect

#### Utility Functions
- `showPillLW()` - Show pill navigation (auto-hides after 4s)
- `hidePillLW()` - Hide pill navigation
- `showToastLW(message)` - Show temporary toast notification
- `goBack()` - Navigate back in history

### Integration Bridge Methods

The `LoudWaveIntegration` class (auto-instantiated as `window.loudwaveIntegration`):

```javascript
// Check connection
loudwaveIntegration.rfb  // RFB object reference

// Update UI
loudwaveIntegration.setServerName(name)
loudwaveIntegration.setResolution(width, height)
loudwaveIntegration.setLatency(ms)
loudwaveIntegration.updateConnectionStatus(status)

// Send input
loudwaveIntegration.sendCtrlAltDel()
loudwaveIntegration.sendKey(keySym)
loudwaveIntegration.sendMouseMove(x, y)
```

## CSS Customization

### Color Scheme
Modify the color variables in `vnc-viewer.css`:
- Primary: `rgba(102, 126, 234, 0.x)` (Blue-purple)
- Success: `#66ea9b` (Green)
- Danger: `#ea6666` (Red)
- Background: `rgba(30, 30, 50, 0.x)` (Dark blue-gray)

### Z-Index Stack
```
Dialog Overlay:        3000
Side Menu:             2950
Pill Navigation:       2900
Virtual Keyboard:      2850
Floating Back Button:  2800
noVNC Control Bar:     1000
noVNC Container:       100
```

## Mobile Considerations

### Touch Events
- Touch indicator shows touch point with ripple effect
- Haptic feedback via `navigator.vibrate()`
- Prevents double-tap zoom on buttons
- Safe area padding support (iPhone notch, Android navigation)

### Responsive Design
- Landscape mode reduces pill button size and spacing
- Virtual keyboard height limited to 50vh on mobile
- Side menu respects screen width (max 85%)
- Dialog padding for touch targets

## Troubleshooting

### RFB Not Connecting
1. Check browser console for errors
2. Verify RFB connection parameters in defaults.json
3. Check that LoudWave integration script loaded (check network tab)
4. Verify RFB object is accessible: `console.log(window.rfb)`

### UI Not Responding
1. Check that event listeners are attached properly
2. Verify z-index doesn't overlap unintentionally
3. Check browser console for JavaScript errors
4. Clear browser cache if styles not updating

### Touch Input Not Working
1. Verify `window.rfb.sendPointerEvent()` is available
2. Check canvas coordinate calculations in `getPointerPosition()`
3. Test on actual touch device (not touch emulation)
4. Check haptic feedback permission if vibration expected

## Browser Compatibility

- **Modern Browsers**: Chrome, Firefox, Safari, Edge (all recent versions)
- **Mobile Browsers**: iOS Safari, Chrome Mobile, Firefox Mobile
- **Feature Support**:
  - Canvas: Required
  - WebSocket: Required (for RFB)
  - Vibration API: Optional (graceful degradation)
  - Fullscreen API: Optional (try-catch wrapper)
  - Backdrop Filter: Optional (fallback colors)

## Future Enhancements

1. **Gesture Support**: Pinch-to-zoom, swipe gestures
2. **Clipboard Sync**: Bi-directional clipboard sharing
3. **File Transfer**: Drag-and-drop file upload
4. **Recording**: Session recording capabilities
5. **Analytics**: Connection metrics and performance tracking
6. **Themes**: Dark/light mode, custom color schemes
7. **Shortcuts**: Custom keyboard shortcuts
8. **Sessions**: Save/restore connection profiles

## Development Notes

### Adding New UI Elements
1. Add HTML to vnc.html in appropriate section
2. Add CSS to vnc-viewer.css with proper z-index
3. Add event handlers in vnc-script.js
4. Optionally integrate with loudwave-integration.js

### Extending Keyboard
To add more keys to the virtual keyboard:
1. Add button to `.keyboard-row` in vnc.html
2. Add key code to `keyMap` in vnc-script.js
3. Update styling if needed in vnc-viewer.css

### RFB Method Reference
Common methods available on the RFB object:
- `sendKey(keySym, down)` - Send keyboard input
- `sendPointerEvent(x, y, buttonMask)` - Send mouse/touch input
- `sendCtrlAltDel()` - Send special key combination
- `disconnect()` - Disconnect from server
- `connected` - Boolean property for connection state

## License

This integration maintains compatibility with noVNC's MPL 2.0 license and the LoudWave Dash project's terms.
