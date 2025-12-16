# Quick Reference - Latest UI Changes

## 🎮 User Controls

### Show/Hide Control Pill
| Action | Desktop | Mac |
|--------|---------|-----|
| Toggle Pill | `Ctrl + V` | `Cmd + V` |
| Keyboard Input | Click keyboard button | Click keyboard button |
| Connection Info | Click info button | Click info button |
| Quality Settings | Click quality button | Click quality button |
| Fullscreen | Click fullscreen button | Click fullscreen button |
| Disconnect | Click disconnect button | Click disconnect button |

### Ping Indicator (WiFi Icon)
Located at the top of the pill navigation, shows:
- **Latency in milliseconds** (e.g., "45ms")
- **Color coding by connection quality**:
  - 🟢 Green = Excellent (< 50ms)
  - 🟢 Light Green = Good (50-100ms)
  - 🟡 Yellow = Fair (100-150ms)
  - 🟠 Orange = Poor (150-250ms)
  - 🔴 Red = Bad (> 250ms)

---

## 🔄 What's Changed

### ✅ Old Menu Hidden
- The old noVNC control bar at the top-left is now hidden
- Cleaner, less cluttered interface
- All controls available from the pill navigation

### ✅ New Shortcut System
- **Old**: Click screen to show pill
- **New**: Press `Ctrl+V` (or `Cmd+V`) to toggle pill
- Screen clicks no longer interfere with session
- More intentional control

### ✅ Real-time Ping Display
- See your latency at a glance
- WiFi icon color reflects connection quality
- Updates continuously during session
- Helps diagnose connection issues

### ✅ Welcome Dialog
- First-time users see a shortcut guide
- Shows on first connection only
- Won't appear again after acknowledgment
- Clear, simple instructions

---

## 📱 On First Connection

1. **Page loads** → Remote connection established
2. **Pill appears** → Navigation visible at bottom
3. **Welcome dialog** → Shortcut information displays
4. **Click "Okay, got it!"** → Dialog closes
5. **Start controlling** → Use pill buttons or Ctrl+V

---

## 💡 Tips

- **Mobile with keyboard**: Full Ctrl+V shortcut support
- **Mobile without keyboard**: Use pill buttons directly (always visible when connected)
- **Want to see controls?**: Press `Ctrl+V` anytime
- **Want to hide controls?**: Press `Ctrl+V` again (auto-hides after 4 seconds anyway)
- **Check connection**: Look at ping indicator color in the pill header

---

## 🔧 Technical Summary

**Files Updated:**
- `vnc.html` - Keyboard handler, welcome dialog, ping display
- `app/styles/vnc-viewer.css` - Hide old menu, add ping colors

**Key Functions:**
- `Ctrl+V` / `Cmd+V` - Toggle pill visibility
- `window.updatePingIndicator(ms)` - Update ping display
- `window.showWelcomeDialog()` - Show welcome
- `window.closeWelcomeDialogLW()` - Dismiss welcome

---

## ❓ Common Questions

**Q: Can I click the screen to show the pill?**  
A: No, only `Ctrl+V` shows it now. This prevents accidental interactions with the remote desktop.

**Q: Will the welcome dialog show every time?**  
A: No, only once. Dismissed dialogs are remembered using browser storage.

**Q: What if I'm on mobile without a keyboard?**  
A: The pill shows automatically when connected and won't hide unless the auto-hide timeout triggers (4 seconds).

**Q: Can I customize the keyboard shortcut?**  
A: Not in this version, but it can be added as a future enhancement. Currently hardcoded to `Ctrl+V`.

**Q: What does the ping color mean?**  
A: Green = good connection, Red = poor connection. Use it to diagnose issues.

---

**Status**: ✅ Ready for deployment and use

