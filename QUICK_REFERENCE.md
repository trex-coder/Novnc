# LoudWave VNC Viewer - Quick Reference Guide

## Quick Start

### Opening the Application
1. Open `vnc.html` in a web browser
2. The noVNC control interface will appear
3. Connect to your VNC server using the connection dialog
4. Once connected, the LoudWave UI pill will appear at the bottom

### Core Controls

#### Pill Navigation Bar (Bottom of Screen)
- **Appears On**: Click anywhere on the screen or swipe up
- **Auto-Hides**: After 4 seconds of inactivity
- **Contains**:
  - 📡 Connection status indicator
  - ⌨️ Keyboard button
  - ⌨️ Ctrl+Alt+Del button
  - ℹ️ Info button
  - 🖥️ Fullscreen button
  - ⚙️ Quality settings
  - ❌ Disconnect button

#### Virtual Keyboard
```
Press ⌨️ button to open
- Full QWERTY layout
- Special keys: Shift, Ctrl, Alt, Enter, Backspace, Space
- Click any key to send input
```

#### Connection Info Menu
```
Press ℹ️ button to open
Shows:
- Server name/address
- Display resolution
- Connection quality
- Network latency
- Performance stats button
```

#### Quality Settings
```
Press ⚙️ button to open
Options:
- 📶 High Quality (best visuals, high bandwidth)
- 📊 Medium Quality (balanced)
- 📱 Low Quality (fast, low bandwidth)
```

---

## Keyboard Shortcuts

| Key Combination | Action | Notes |
|-----------------|--------|-------|
| `Click Screen` | Show Pill Nav | Auto-hides after 4s |
| `Swipe Up` | Show Pill Nav | Mobile gesture |
| `⌨️ Button` | Toggle Keyboard | Full QWERTY keyboard |
| `Ctrl+Alt+Del` Button | Send Special Keys | Works remotely |
| `ℹ️ Button` | Show Info Menu | Connection details |
| `🖥️ Button` | Fullscreen | Desktop only |
| `❌ Button` | Disconnect | Shows confirmation |
| Back Button | Go Back | Navigation |

---

## API Reference

### Window Functions (Available Globally)

```javascript
// Navigation & Visibility
showPillLW()                    // Show pill nav immediately
hidePillLW()                    // Hide pill nav
toggleKeyboardLW()              // Show/hide virtual keyboard

// Control Commands
sendCtrlAltDelLW()              // Send Ctrl+Alt+Del to remote
toggleFullscreenLW()            // Toggle fullscreen mode
disconnectLW()                  // Show disconnect dialog

// Info & Settings
openInfoMenuLW()                // Open connection info sidebar
closeInfoMenuLW()               // Close info sidebar
openQualitySettingsLW()         // Open quality dialog
closeQualitySettingsLW()        // Close quality dialog
setQualityLW('high'|'medium'|'low')  // Set video quality

// Dialogs
closeDisconnectDialogLW()       // Cancel disconnect
confirmDisconnectLW()           // Execute disconnect
goBack()                        // Navigate back

// Utilities
showToastLW(message)            // Show notification toast
```

### Integration Object

```javascript
// Access: window.loudwaveIntegration

// Properties
.rfb                            // RFB connection object
.connectionQuality              // 'excellent'|'good'|'fair'|'poor'
.lastLatency                    // Latency in milliseconds
.canvasWidth                    // Display width in pixels
.canvasHeight                   // Display height in pixels

// Methods
.setServerName(name)            // Update server display
.setResolution(width, height)   // Update resolution display
.setLatency(ms)                 // Update latency display
.updateConnectionStatus(status) // Update connection indicator
.getConnectionQuality()         // Get quality rating
.sendCtrlAltDel()              // Send special key combo
.sendKey(keySym)               // Send keyboard key
.sendMouseMove(x, y)           // Send pointer movement
```

---

## Common Tasks

### Connect to VNC Server
1. Load vnc.html in browser
2. Click "Connect" button in the connection dialog
3. Enter host/port/password as needed
4. Wait for connection to establish
5. LoudWave UI automatically becomes available

### Send Ctrl+Alt+Del
1. Show pill navigation (click screen)
2. Press Ctrl+Alt+Del button
3. Command sent to remote desktop

### Type Text Using Virtual Keyboard
1. Show pill navigation
2. Press ⌨️ keyboard button
3. Click each letter/character on keyboard
4. Keyboard auto-hides when done

### Change Video Quality
1. Show pill navigation
2. Press ⚙️ quality button
3. Select desired quality level
4. Setting takes effect immediately

### Check Connection Status
1. Show pill navigation
2. Press ℹ️ info button
3. View all connection details
4. Press "Performance Stats" for detailed metrics

### Disconnect Session
1. Show pill navigation
2. Press ❌ disconnect button
3. Confirm in dialog
4. Connection closes cleanly

---

## Keyboard Key Mapping

Virtual keyboard supports these keys:

```
Numbers:    0-9
Letters:    A-Z (QWERTY layout)
Special:    
  - Space (spacebar)
  - Enter (return key)
  - Backspace (delete)
  - Shift (shift key)
  - Ctrl (control key)
  - Alt (alt key)
```

**Note**: Use the physical keyboard when possible for better typing experience.

---

## Mobile-Specific Features

### Touch Support
- ✅ Full touch input to remote desktop
- ✅ Touch indicator shows tap point
- ✅ Long-press gestures supported
- ✅ Multi-touch capable

### Haptic Feedback
- ✅ Button clicks vibrate (if enabled)
- ✅ Key presses vibrate
- ✅ Confirmations vibrate
- ✅ Disable in device settings if unwanted

### Responsive Design
- ✅ Auto-scales to screen size
- ✅ Portrait and landscape modes
- ✅ Safe area support (notched devices)
- ✅ Virtual keyboard auto-hides when not needed

### Orientation Lock
- Not enforced (user can rotate)
- UI adapts to landscape/portrait
- Quality adjusts for screen size

---

## Troubleshooting

### UI Not Appearing
**Solution**: Click on the remote desktop area to show pill navigation

### Keyboard Not Working
**Try These**:
1. Click ⌨️ button to ensure keyboard is open
2. Click specific key again
3. Check connection status is "Connected"
4. Try Ctrl+Alt+Del button to test RFB communication

### Disconnection Issues
**Check**:
- Network connection is stable
- Server is still running
- No firewall blocking connection
- Connection timeout settings in settings

### Touch Input Not Working
**On Mobile**:
1. Ensure touch is enabled in browser settings
2. Try using physical keyboard instead
3. Check connection quality isn't poor
4. Restart browser and reconnect

### Quality Settings Not Applying
**Verify**:
1. Connection is active (pill shows "Connected")
2. Quality has been selected and saved
3. Server supports encoding changes
4. Monitor bandwidth to confirm change took effect

---

## Connection Status Indicators

### Pill Navigation Status Colors

- 🟢 **Green Light**: Connected and excellent quality
- 🟡 **Yellow Light**: Connected but fair quality
- 🔴 **Red Light**: Disconnected or poor quality

### Status Messages

| Message | Meaning | Action |
|---------|---------|--------|
| Connected | Active VNC session | Normal operation |
| Disconnected | No active session | Reconnect to server |
| Connecting | Session initializing | Wait for completion |
| Connection Lost | Unexpected disconnect | Reconnect manually |

---

## Performance Tips

### For Better Video Quality
1. Ensure good network connection
2. Use "High Quality" if possible
3. Close other bandwidth-heavy apps
4. Reduce remote desktop resolution if slow

### For Better Responsiveness
1. Use "Low Quality" on slow networks
2. Close unnecessary remote applications
3. Enable local scaling in settings
4. Reduce animation effects

### For Battery Life (Mobile)
1. Use "Low Quality" to reduce CPU
2. Close keyboard when not typing
3. Enable power saving mode on device
4. Use WiFi instead of mobile data when possible

---

## Browser Developer Tools

### Enable Debug Logging
```javascript
// In browser console:
// Check if integration initialized
console.log(window.loudwaveIntegration);

// Check RFB connection
console.log(window.rfb);

// Monitor connection quality
console.log(window.loudwaveIntegration.connectionQuality);
```

### Monitor Performance
```javascript
// Check latency
console.log(window.loudwaveIntegration.lastLatency + 'ms');

// Check current quality
console.log(window.loudwaveIntegration.getConnectionQuality());
```

---

## File Locations

| Component | Location |
|-----------|----------|
| Main HTML | `vnc.html` |
| UI Styles | `app/styles/vnc-viewer.css` |
| UI Scripts | `app/vnc-script.js` |
| Integration | `app/loudwave-integration.js` |
| Documentation | `LOUDWAVE_INTEGRATION.md` |
| Implementation Notes | `IMPLEMENTATION_SUMMARY.md` |

---

## Support & Help

### Common Issues & Solutions

**Q: Pill navigation won't appear?**  
A: Click on the remote desktop area, or swipe up from bottom

**Q: Keyboard text appearing on remote?**  
A: Virtual keyboard is working! Send input normally

**Q: Connection quality showing "Poor"?**  
A: Switch to Low Quality setting or check network

**Q: Buttons not responding?**  
A: Ensure connection is active, check console for errors

**Q: Mobile not working?**  
A: Verify touch is enabled, try desktop browser first

---

## Keyboard Combinations

### Using Virtual Keyboard
```
To type: Shift + A → types "A"
To copy: Ctrl + C  → sends copy command
To paste: Ctrl + V → sends paste command
To save: Ctrl + S  → sends save command
```

### Using Physical Keyboard
```
Direct typing works on connected remote
Modifier keys (Ctrl, Alt, Shift) apply to next key
Combinations: Ctrl+Alt+Del for Task Manager
```

---

## Settings & Configuration

### Quality Presets

| Setting | Bandwidth | Latency | CPU | Quality |
|---------|-----------|---------|-----|---------|
| High | High | Low | Medium | Excellent |
| Medium | Medium | Medium | Low | Good |
| Low | Low | Low | Low | Fair |

### Auto Quality Adjustment
- Not currently enabled (manual selection only)
- Future version may auto-adjust based on latency

### Network Requirements

| Quality | Min Bandwidth | Recommended |
|---------|---------------|-------------|
| High | 2 Mbps | 5+ Mbps |
| Medium | 1 Mbps | 3+ Mbps |
| Low | 512 Kbps | 1+ Mbps |

---

## Version Information

- **LoudWave Integration**: v1.0
- **noVNC Base**: Latest with RFB support
- **Last Updated**: December 16, 2025
- **Tested On**: Chrome, Firefox, Safari, Edge

---

## Quick Keyboard Reference

```
⌨️  = Virtual Keyboard Button
ℹ️  = Info Menu Button
⚙️  = Quality Settings Button
🖥️  = Fullscreen Button
❌  = Disconnect Button
📡  = Connection Status
🔙  = Back Button
```

---

**For detailed technical documentation, see LOUDWAVE_INTEGRATION.md**
