// js/timer.js
'use strict';

(function() {
    let timerInterval = null;
    let isExpiredHandled = false;
    let serverHoldExpiresAt = null;

    async function initTimer() {
        const timerDisplays = document.querySelectorAll('.hold-timer, #countdown-timer, #bk-countdown-val, #gw-timer');
        if (timerDisplays.length === 0) return;

        const urlParams = new URLSearchParams(window.location.search || window.location.hash.split('?')[1] || '');
        const orderId = urlParams.get('orderId') || localStorage.getItem('currentOrder');

        if (!orderId) {
            // Chưa có đơn hàng -> hiển thị thời gian giữ chỗ mặc định (5 phút)
            timerDisplays.forEach(el => {
                if (el.innerText === '10:00' || el.innerText === '--:--' || !el.innerText) {
                    el.innerText = '05:00';
                }
            });
            return;
        }

        try {
            // Lấy thời gian hold_expires_at thực tế từ server qua API
            let orderData = null;
            if (typeof API !== 'undefined' && API.get) {
                try {
                    orderData = await API.get(`/orders/${orderId}/status`);
                } catch (e) {
                    // Nếu lỗi 401/404 thì bỏ qua hoặc dùng DB local nếu có
                }
            }

            if (!orderData && typeof DB !== 'undefined') {
                orderData = DB.get('beta_orders', orderId);
            }

            if (orderData) {
                // Kiểm tra trạng thái đơn
                if (['EXPIRED', 'FAILED', 'CANCELLED'].includes(orderData.status)) {
                    timerDisplays.forEach(el => el.innerText = '00:00');
                    handleExpire();
                    return;
                }

                if (orderData.holdExpiresAt) {
                    serverHoldExpiresAt = new Date(orderData.holdExpiresAt).getTime();
                }
            }

            if (!serverHoldExpiresAt) {
                // Nếu không có thông tin từ server, kiểm tra xem có lưu tạm không
                const cachedExp = localStorage.getItem(`hold_exp_${orderId}`);
                if (cachedExp) {
                    serverHoldExpiresAt = new Date(cachedExp).getTime();
                }
            } else {
                localStorage.setItem(`hold_exp_${orderId}`, new Date(serverHoldExpiresAt).toISOString());
            }

            if (!serverHoldExpiresAt) {
                return;
            }

            updateTimer();
            if (timerInterval) clearInterval(timerInterval);
            timerInterval = setInterval(updateTimer, 1000);

        } catch (err) {
            console.error('[Timer] Lỗi khởi tạo đồng hồ:', err);
        }
    }

    function updateTimer() {
        if (!serverHoldExpiresAt) return;

        const timerDisplays = document.querySelectorAll('.hold-timer, #countdown-timer, #bk-countdown-val, #gw-timer');
        const now = (typeof VirtualClock !== 'undefined') ? VirtualClock.now().getTime() : Date.now();
        const diff = serverHoldExpiresAt - now;

        if (diff <= 0) {
            timerDisplays.forEach(el => {
                el.innerText = '00:00';
                el.style.color = '#dc3545';
            });
            handleExpire();
            return;
        }

        const m = Math.floor(diff / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

        timerDisplays.forEach(el => {
            el.innerText = timeStr;
            if (diff <= 60000) {
                el.style.color = '#dc3545';
            } else {
                el.style.color = '';
            }
        });
    }

    function handleExpire() {
        if (isExpiredHandled) return;
        isExpiredHandled = true;

        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        // Xóa mã đơn đã hết hạn khỏi localStorage
        localStorage.removeItem('currentOrder');

        // Hiển thị modal thông báo hết hạn
        const existingModal = document.getElementById('timer-expired-modal');
        if (existingModal) existingModal.remove();

        const modalHtml = `
            <div id="timer-expired-modal" class="modal-overlay" style="display:flex; z-index: 999999; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); justify-content: center; align-items: center; padding: 20px;">
                <div class="modal" style="background: white; max-width: 440px; width: 100%; text-align: center; border-radius: 8px; border-top: 5px solid #dc3545; box-shadow: 0 10px 30px rgba(0,0,0,0.3); padding: 30px 24px;">
                    <div style="font-size: 40px; margin-bottom: 12px;">⏰</div>
                    <h3 style="color: #dc3545; font-size: 20px; font-weight: 800; margin-bottom: 12px; text-transform: uppercase;">Hết thời gian giữ ghế</h3>
                    <p style="margin-bottom: 25px; color: #555; font-size: 14px; line-height: 1.6;">Đã hết thời gian giữ ghế theo quy định của hệ thống. Ghế của bạn đã được tự động nhả để nhường cho khách hàng khác.</p>
                    <button class="btn btn-primary" style="width: 100%; background: #005198; color: white; padding: 12px; border: none; border-radius: 4px; font-weight: 700; font-size: 15px; cursor: pointer;" onclick="if(window.spaNavigate){window.spaNavigate('booking');document.getElementById('timer-expired-modal')?.remove();}else{window.location.href='booking.html';}">CHỌN LẠI GHẾ</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    window.initHoldTimer = initTimer;
    window.setHoldExpiresAt = function(isoOrMs) {
        serverHoldExpiresAt = typeof isoOrMs === 'number' ? isoOrMs : new Date(isoOrMs).getTime();
        isExpiredHandled = false;
        updateTimer();
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(updateTimer, 1000);
    };

    document.addEventListener('DOMContentLoaded', initTimer);
    window.addEventListener('clock:advance', updateTimer);
})();
