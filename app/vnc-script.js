// Canvas setup
const canvas = document.getElementById('vncCanvas');
const ctx = canvas.getContext('2d');

// Integration with noVNC RFB
let rfbConnection = null;

// Keyboard key mapping
const keyMap = {
    '1': 0xAE, '2': 0xAF, '3': 0xB0, '4': 0xB1, '5': 0xB2,
    '6': 0xB3, '7': 0xB4, '8': 0xB5, '9': 0xB6, '0': 0xB7,
    'Q': 0x71, 'W': 0x77, 'E': 0x65, 'R': 0x72, 'T': 0x74,
    'Y': 0x79, 'U': 0x75, 'I': 0x69, 'O': 0x6F, 'P': 0x70,
    'A': 0x61, 'S': 0x73, 'D': 0x64, 'F': 0x66, 'G': 0x67,
    'H': 0x68, 'J': 0x6A, 'K': 0x6B, 'L': 0x6C,
    'Z': 0x7A, 'X': 0x78, 'C': 0x63, 'V': 0x76, 'B': 0x62,
    'N': 0x6E, 'M': 0x6D,
    'Space': 0x20,
    'Enter': 0xFF0D,
    'Backspace': 0xFF08,
    'Shift': 0xFFE1,
    'Ctrl': 0xFFE3,
    'Alt': 0xFFE9
};

// Set canvas size
function resizeCanvas() {
    const container = document.getElementById('vncContainer');
    const aspectRatio = 16 / 9;
    
    let width = container.clientWidth;
    let height = width / aspectRatio;
    
    if (height > container.clientHeight) {
        height = container.clientHeight;
        width = height * aspectRatio;
    }
    
    canvas.width = 1920;
    canvas.height = 1080;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    
    drawDummyDesktop();
}

// Draw dummy Windows 11 desktop
function drawDummyDesktop() {
    // Background gradient (Windows 11 style)
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#1e3a8a');
    gradient.addColorStop(0.5, '#3b82f6');
    gradient.addColorStop(1, '#60a5fa');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add some geometric shapes for Windows 11 aesthetic
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.arc(1600, 300, 400, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.arc(400, 800, 500, 0, Math.PI * 2);
    ctx.fill();
    
    // Taskbar
    ctx.fillStyle = 'rgba(30, 30, 40, 0.7)';
    ctx.fillRect(0, canvas.height - 60, canvas.width, 60);
    
    // Windows icon (start button)
    ctx.fillStyle = '#ffffff';
    const startX = 40;
    const startY = canvas.height - 40;
    const size = 24;
    
    // Draw Windows logo
    ctx.fillRect(startX, startY, size/2 - 2, size/2 - 2);
    ctx.fillRect(startX + size/2 + 2, startY, size/2 - 2, size/2 - 2);
    ctx.fillRect(startX, startY + size/2 + 2, size/2 - 2, size/2 - 2);
    ctx.fillRect(startX + size/2 + 2, startY + size/2 + 2, size/2 - 2, size/2 - 2);
    
    // Taskbar icons
    const iconY = canvas.height - 40;
    const iconSize = 30;
    const iconSpacing = 50;
    let iconX = 120;
    
    // Draw some app icons
    for (let i = 0; i < 5; i++) {
        ctx.fillStyle = 'rgba(102, 126, 234, 0.5)';
        ctx.fillRect(iconX, iconY - iconSize/2, iconSize, iconSize);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(iconX + 4, iconY - iconSize/2 + 4, iconSize - 8, iconSize - 8);
        iconX += iconSpacing;
    }
    
    // System tray
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px Arial';
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    ctx.fillText(time, canvas.width - 100, canvas.height - 25);
    
    // Network icon
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(canvas.width - 150, canvas.height - 35, 20, 2);
    ctx.fillRect(canvas.width - 150, canvas.height - 30, 20, 2);
    ctx.fillRect(canvas.width - 150, canvas.height - 25, 20, 2);
    
    // Desktop icons
    drawDesktopIcon(60, 80, 'This PC');
    drawDesktopIcon(60, 200, 'Documents');
    drawDesktopIcon(60, 320, 'Downloads');
    drawDesktopIcon(60, 440, 'Chrome');
    
    // Center text
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Windows 11 Pro', canvas.width / 2, canvas.height / 2 - 50);
    
    ctx.font = '24px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText('Remote Desktop Session', canvas.width / 2, canvas.height / 2);
    
    ctx.font = '18px Arial';
    ctx.fillText('Connected to Main Server', canvas.width / 2, canvas.height / 2 + 40);
}

function drawDesktopIcon(x, y, label) {
    // Icon background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(x, y, 60, 60);
    
    // Icon inner
    ctx.fillStyle = 'rgba(102, 126, 234, 0.5)';
    ctx.fillRect(x + 10, y + 10, 40, 40);
    
    // Label
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(label, x, y + 80);
}

// Touch/Mouse interaction
let isDragging = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener('mousedown', handlePointerDown);
canvas.addEventListener('mousemove', handlePointerMove);
canvas.addEventListener('mouseup', handlePointerUp);
canvas.addEventListener('touchstart', handlePointerDown);
canvas.addEventListener('touchmove', handlePointerMove);
canvas.addEventListener('touchend', handlePointerUp);

function handlePointerDown(e) {
    isDragging = true;
    const pos = getPointerPosition(e);
    lastX = pos.x;
    lastY = pos.y;
    
    // Show touch indicator
    const indicator = document.getElementById('touchIndicator');
    indicator.style.left = pos.clientX + 'px';
    indicator.style.top = pos.clientY + 'px';
    indicator.classList.add('active');
    
    // Send to RFB
    if (window.rfb && window.rfb.sendPointerEvent) {
        window.rfb.sendPointerEvent(lastX, lastY, 1); // Button 1 (left click)
    }
    
    if (navigator.vibrate) {
        navigator.vibrate(5);
    }
}

function handlePointerMove(e) {
    if (!isDragging) return;
    
    const pos = getPointerPosition(e);
    const indicator = document.getElementById('touchIndicator');
    indicator.style.left = pos.clientX + 'px';
    indicator.style.top = pos.clientY + 'px';
    
    lastX = pos.x;
    lastY = pos.y;
    
    // Send movement to RFB
    if (window.rfb && window.rfb.sendPointerEvent) {
        window.rfb.sendPointerEvent(lastX, lastY, 0);
    }
}

function handlePointerUp(e) {
    isDragging = false;
    const pos = getPointerPosition(e);
    const indicator = document.getElementById('touchIndicator');
    indicator.classList.remove('active');
    
    // Release button in RFB
    if (window.rfb && window.rfb.sendPointerEvent) {
        window.rfb.sendPointerEvent(pos.x, pos.y, 0);
    }
}

function getPointerPosition(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    
    return {
        x: (clientX - rect.left) * (canvas.width / rect.width),
        y: (clientY - rect.top) * (canvas.height / rect.height),
        clientX: clientX,
        clientY: clientY
    };
}

// Pill navigation control
let pillTimeout;
let isPillVisible = false;

function showPill() {
    const pill = document.getElementById('pillNav');
    const topBar = document.getElementById('topBar');
    
    pill.classList.remove('hidden-completely');
    pill.classList.add('visible');
    topBar.classList.remove('hidden');
    isPillVisible = true;
    
    clearTimeout(pillTimeout);
    pillTimeout = setTimeout(hidePill, 4000);
}

function hidePill() {
    const pill = document.getElementById('pillNav');
    const topBar = document.getElementById('topBar');
    const keyboard = document.getElementById('virtualKeyboard');
    const menu = document.getElementById('sideMenu');
    
    // Don't hide if keyboard or menu is open
    if (keyboard.classList.contains('active') || menu.classList.contains('active')) {
        return;
    }
    
    pill.classList.remove('visible');
    topBar.classList.add('hidden');
    isPillVisible = false;
    
    // Completely hide after animation
    setTimeout(() => {
        if (!isPillVisible) {
            pill.classList.add('hidden-completely');
        }
    }, 400);
}

// Tap on canvas to show pill
canvas.addEventListener('click', (e) => {
    if (!isPillVisible) {
        showPill();
    }
});

// Swipe up gesture on canvas to show pill
let touchStartY = 0;
canvas.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
});

canvas.addEventListener('touchend', (e) => {
    const touchEndY = e.changedTouches[0].clientY;
    const swipeDistance = touchStartY - touchEndY;
    
    // If swiped up more than 50px
    if (swipeDistance > 50 && !isPillVisible) {
        showPill();
    }
});

// DISABLED: Initialize pill as visible - pill now shows ONLY via Ctrl+V
// showPill();

// Info Menu functions
window.openInfoMenu = function() {
    const menu = document.getElementById('sideMenu');
    menu.classList.add('active');
    
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }
    
    // DISABLED: showPill(); // Keep pill visible - only show via Ctrl+V
}

window.closeInfoMenu = function() {
    const menu = document.getElementById('sideMenu');
    menu.classList.remove('active');
    
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }
}

// Quality Settings functions
let currentQuality = 'high';

window.openQualitySettings = function() {
    document.getElementById('qualityDialog').classList.add('active');
    
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }
    
    // DISABLED: showPill(); // only show via Ctrl+V
}

window.closeQualitySettings = function() {
    document.getElementById('qualityDialog').classList.remove('active');
    
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }
}

window.setQuality = function(quality) {
    currentQuality = quality;
    
    // Remove active class from all options
    document.querySelectorAll('.quality-option').forEach(option => {
        option.classList.remove('active');
    });
    
    // Add active class to selected option
    event.target.closest('.quality-option').classList.add('active');
    
    // Show feedback
    const qualityNames = {
        'high': 'High Quality',
        'medium': 'Medium Quality',
        'low': 'Low Quality'
    };
    
    const toast = document.createElement('div');
    toast.textContent = `${qualityNames[quality]} selected`;
    toast.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(30, 30, 50, 0.95);
        backdrop-filter: blur(20px);
        padding: 16px 24px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: white;
        font-size: 14px;
        z-index: 4000;
        animation: fadeIn 0.2s ease;
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.2s ease';
        setTimeout(() => toast.remove(), 200);
    }, 1500);
    
    // Close dialog after a delay
    setTimeout(() => {
        closeQualitySettings();
    }, 1000);
    
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }
    
    console.log('Quality set to:', quality);
}

// Keyboard functions
window.toggleKeyboard = function() {
    const keyboard = document.getElementById('virtualKeyboard');
    keyboard.classList.toggle('active');
    
    if (keyboard.classList.contains('active')) {
        showPill();
    }
    
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }
}

// Add click handlers to keyboard keys
document.querySelectorAll('.key').forEach(key => {
    key.addEventListener('click', function() {
        const keyText = this.textContent;
        console.log('Key pressed:', keyText);
        
        if (navigator.vibrate) {
            navigator.vibrate(5);
        }
        
        // Send to RFB if available
        if (window.rfb && window.rfb.sendKey) {
            const keySym = keyMap[keyText];
            if (keySym) {
                window.rfb.sendKey(keySym, true);
                window.rfb.sendKey(keySym, false);
            }
        }
    });
});

// Control functions
window.sendCtrlAltDel = function() {
    console.log('Sending Ctrl+Alt+Del');
    
    // Show temporary feedback
    const toast = document.createElement('div');
    toast.textContent = 'Ctrl+Alt+Del sent';
    toast.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(30, 30, 50, 0.95);
        backdrop-filter: blur(20px);
        padding: 16px 24px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: white;
        font-size: 14px;
        z-index: 4000;
        animation: fadeIn 0.2s ease;
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.2s ease';
        setTimeout(() => toast.remove(), 200);
    }, 1500);
    
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }
    
    showPill();
}

window.toggleFullscreen = function() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
    
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }
    
    showPill();
}

window.showStats = function() {
    alert('Performance Stats:\n\nFPS: 60\nLatency: 45ms\nBandwidth: 2.5 Mbps\nPacket Loss: 0%');
    
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }
}

window.takeScreenshot = function() {
    const link = document.createElement('a');
    link.download = 'screenshot_' + Date.now() + '.png';
    link.href = canvas.toDataURL();
    link.click();
    
    // Show temporary feedback
    const toast = document.createElement('div');
    toast.textContent = 'Screenshot saved!';
    toast.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(30, 30, 50, 0.95);
        backdrop-filter: blur(20px);
        padding: 16px 24px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: white;
        font-size: 14px;
        z-index: 4000;
        animation: fadeIn 0.2s ease;
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.2s ease';
        setTimeout(() => toast.remove(), 200);
    }, 1500);
    
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }
    
    showPill();
}

window.disconnect = function() {
    document.getElementById('disconnectDialog').classList.add('active');
    
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }
}

window.closeDisconnectDialog = function() {
    document.getElementById('disconnectDialog').classList.remove('active');
    
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }
}

window.confirmDisconnect = function() {
    if (navigator.vibrate) {
        navigator.vibrate(20);
    }
    
    closeDisconnectDialog();
    
    setTimeout(() => {
        window.history.back();
    }, 500);
}

window.goBack = function() {
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }
    window.history.back();
}

// Handle window resize
window.addEventListener('resize', resizeCanvas);

// Initial setup
resizeCanvas();

// Update time every minute
setInterval(() => {
    drawDummyDesktop();
}, 60000);

// Close menu when clicking outside
document.addEventListener('click', (e) => {
    const menu = document.getElementById('sideMenu');
    const pillNav = document.getElementById('pillNav');
    
    if (menu.classList.contains('active') && 
        !menu.contains(e.target) && 
        !pillNav.contains(e.target)) {
        menu.classList.remove('active');
    }
});

// Close quality dialog when clicking outside
document.getElementById('qualityDialog').addEventListener('click', function(e) {
    if (e.target === this) {
        closeQualitySettings();
    }
});

// Add CSS for toast animations
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }
`;
document.head.appendChild(style);