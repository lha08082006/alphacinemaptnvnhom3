// js/clock.js

const VirtualClock = {
    // Lấy thời gian hiện tại
    now: function(addMs = 0) {
        const offset = parseInt(localStorage.getItem('clockOffset') || '0', 10);
        return new Date(Date.now() + offset + (typeof addMs === 'number' ? addMs : 0));
    },

    // Tua nhanh thời gian
    advanceClock: function(ms) {
        const offset = parseInt(localStorage.getItem('clockOffset') || '0', 10);
        localStorage.setItem('clockOffset', offset + ms);
        
        // Cập nhật lại UI trong demo-panel nếu có
        if (typeof window.updateClockUI === 'function') {
            window.updateClockUI();
        }

        // Phát sự kiện để các module khác (như reconcile.js) phản ứng
        const event = new CustomEvent('clock:advance', { detail: { ms: ms, newTime: this.now() } });
        window.dispatchEvent(event);
        
        console.log(`[VirtualClock] Tua nhanh ${ms}ms. Thời gian hiện tại: ${this.now().toLocaleString()}`);
    },

    // Reset lại thời gian thực
    resetClock: function() {
        localStorage.setItem('clockOffset', '0');
        if (typeof window.updateClockUI === 'function') {
            window.updateClockUI();
        }
        console.log("[VirtualClock] Reset về thời gian thực.");
    }
};

// Gắn vào window để gọi từ các script khác
window.VirtualClock = VirtualClock;