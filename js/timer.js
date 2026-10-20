// js/timer.js

document.addEventListener('DOMContentLoaded', () => {
    const timerDisplays = document.querySelectorAll('.hold-timer');
    if (timerDisplays.length === 0) return;

    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('orderId') || localStorage.getItem('currentOrder') || 'DEMO-ORDER';

    let order = (typeof DB !== 'undefined') ? DB.get('beta_orders', orderId) : null;
    const nowTime = (typeof VirtualClock !== 'undefined') ? VirtualClock.now().getTime() : Date.now();

    // Ensure we have a valid 10-minute hold expiration
    if (!order || !order.holdExpiresAt || new Date(order.holdExpiresAt).getTime() <= nowTime) {
        const newExpiresAt = new Date(nowTime + 10 * 60 * 1000).toISOString();
        if (order) {
            order.holdExpiresAt = newExpiresAt;
            order.status = 'HOLDING';
            DB.update('beta_orders', orderId, { holdExpiresAt: newExpiresAt, status: 'HOLDING' });
        } else {
            localStorage.setItem('demo_hold_expires', newExpiresAt);
        }
    }

    let isExpiredHandled = false;

    function updateTimer() {
        if (typeof DB !== 'undefined') {
            order = DB.get('beta_orders', orderId);
        }
        
        const now = (typeof VirtualClock !== 'undefined') ? VirtualClock.now().getTime() : Date.now();
        const expiresAt = order && order.holdExpiresAt 
            ? new Date(order.holdExpiresAt).getTime() 
            : new Date(localStorage.getItem('demo_hold_expires') || (now + 10 * 60 * 1000)).getTime();
        
        const diff = expiresAt - now;

        if (diff <= 0) {
            timerDisplays.forEach(el => el.innerText = '00:00');
            handleExpire();
            return;
        }

        const m = Math.floor(diff / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        const timeStr = `${m}:${s.toString().padStart(2, '0')}`;
        
        timerDisplays.forEach(el => {
            el.innerText = timeStr;
            if (diff <= 60000) {
                el.style.color = '#d32f2f';
            } else {
                el.style.color = '#222';
            }
        });
    }

    function handleExpire() {
        if (isExpiredHandled) return;
        isExpiredHandled = true;
        
        if (typeof DB !== 'undefined' && order) {
            DB.update('beta_orders', orderId, { status: 'EXPIRED' });
        }
        
        const modalHtml = `
            <div class="modal-overlay" style="display:flex; z-index: 10000; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); justify-content: center; align-items: center;">
                <div class="modal" style="background: white; max-width: 400px; text-align: center; border-radius: 8px; border-top: 5px solid #d32f2f; box-shadow: 0 4px 20px rgba(0,0,0,0.2);">
                    <div class="modal-body" style="padding: 30px 20px;">
                        <h3 style="color: #d32f2f; margin-bottom: 15px;">HẾT THỜI GIAN</h3>
                        <p style="margin-bottom: 25px; color: #555;">Đã hết thời gian giữ ghế. Giao dịch đã bị huỷ để nhường ghế cho khách hàng khác.</p>
                        <button class="btn btn-primary" style="width: 100%; background: #03599d; color: white; padding: 10px; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;" onclick="if(window.spaNavigate){window.spaNavigate('booking');document.querySelector('.modal-overlay')?.remove();}else{location.href='#booking';}">CHỌN LẠI GHẾ</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    updateTimer();
    setInterval(updateTimer, 1000);
    window.addEventListener('clock:advance', updateTimer);
});
