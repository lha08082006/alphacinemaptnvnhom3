// js/beta-core.js

/**
 * WEBSITE BETA - BACKEND LOGIC MÔ PHỎNG
 * Xử lý các quy tắc nghiệp vụ quan trọng (BR-03, BR-04, BR-05, BR-10, BR-11)
 * Tách biệt hoàn toàn khỏi code giao diện (UI) để đóng vai trò như một Backend ảo.
 */
window.betaCore = {
    // Lưu các job hẹn giờ xử lý timeout
    _timeoutJobs: [],

    /**
     * BƯỚC 7: Xử lý khi user bấm nút "THANH TOÁN"
     */
    startPayment: function(orderId, method) {
        console.log(`[BETA] startPayment called for order ${orderId}, method ${method}`);
        const order = DB.get('beta_orders', orderId);
        
        if (!order || order.status !== 'HOLDING') {
            console.error(`[BETA] Lỗi: Đơn hàng không hợp lệ hoặc đã hết hạn giữ chỗ.`);
            if (typeof showToast === 'function') showToast("Đơn hàng không hợp lệ hoặc đã hết hạn!", "error");
            return;
        }

        const now = VirtualClock.now();
        if (new Date(order.holdExpiresAt) <= now) {
            console.error(`[BETA] Lỗi: Hết thời gian giữ ghế.`);
            this.releaseSeats(orderId);
            if (typeof showToast === 'function') showToast("Hết thời gian giữ ghế!", "error");
            return;
        }

        // Cập nhật trạng thái chờ thanh toán
        DB.update('beta_orders', orderId, { status: 'AWAITING_PAYMENT' });
        console.log(`[BETA] Đã cập nhật trạng thái đơn ${orderId} -> AWAITING_PAYMENT`);

        // Tạo giao dịch trên Cổng thanh toán (Gateway)
        let txnId;
        if (typeof gatewayCore !== 'undefined' && gatewayCore.createTxn) {
            txnId = gatewayCore.createTxn(orderId, method, order.amount);
        } else {
            // Fallback (Nếu Gateway chưa load, ghi thẳng vào DB để giả lập)
            txnId = DB.generateId.txn();
            DB.insert('gateway_txns', {
                txnId: txnId, orderId: orderId, method: method,
                amount: order.amount, status: 'PENDING', debited: false,
                callback: null, createdAt: now.toISOString()
            });
        }
        
        // Link txnId vào order của Beta
        DB.update('beta_orders', orderId, { txnId: txnId });

        // Đặt đồng hồ đếm ngược chờ Callback (BR-03: Xử lý khi timeout không nhận được callback)
        const settings = JSON.parse(localStorage.getItem('demoSettings'));
        const timeoutSec = settings.callbackTimeoutSec || 600; // Mặc định 10 phút
        
        // Gắn vào hàng đợi check timeout (Tương thích với tính năng tua thời gian của Demo)
        this._scheduleTimeoutCheck(orderId, now.getTime() + timeoutSec * 1000);

        console.log(`[BETA] Đang chuyển hướng Browser sang Gateway với txnId: ${txnId}`);
        
        // Giả lập redirect qua Gateway sau 1.5s để thể hiện rõ màn hình "Đang chuyển..."
        document.body.innerHTML = `
            <div style="display:flex; height:100vh; align-items:center; justify-content:center; flex-direction:column; background:#f9f9f9; font-family: sans-serif;">
                <div style="width: 50px; height: 50px; border: 5px solid var(--beta-blue, #005198); border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <h2 style="color: var(--beta-blue, #005198); margin-top: 20px;">Đang kết nối cổng thanh toán...</h2>
                <style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>
            </div>
        `;
        
        setTimeout(() => {
            location.href = `gateway.html?txn=${txnId}`;
        }, 1500);
    },

    /**
     * BƯỚC 10 & 11: Backend nhận Webhook (Callback) từ Gateway
     */
    receiveCallback: function(payload) {
        console.log(`\n[BETA] =======================================`);
        console.log(`[BETA] 📩 WEBHOOK INCOMING: Nhận Callback từ Gateway:`, payload);
        
        const { txnId, orderId, amount, status } = payload;
        const order = DB.get('beta_orders', orderId);
        
        // 1. Kiểm tra tính hợp lệ
        if (!order) {
            console.error(`[BETA] ❌ Lỗi Callback: Không tìm thấy đơn hàng ${orderId}`);
            return { code: '01', message: 'Order not found' };
        }

        if (order.txnId !== txnId) {
            console.error(`[BETA] ❌ Lỗi Callback: txnId không khớp`);
            return { code: '02', message: 'Invalid txnId' };
        }

        if (order.amount !== amount) {
            console.error(`[BETA] ❌ Lỗi Callback: Sai số tiền`);
            return { code: '03', message: 'Invalid amount' };
        }

        // 2. Tính lũy đẳng (Idempotent): Xử lý trùng lặp Callback
        if (order.status === 'PAID' || order.status === 'CANCELLED' || order.status === 'FAILED') {
            // Cực kì quan trọng: Nếu đã xử lý rồi mà Cổng Retry lại, phải báo OK để Cổng không gọi nữa
            // nhưng không cập nhật logic tiếp theo (tránh xuất 2 lần vé hoặc hoàn 2 lần)
            if (order.status === 'PAID' && status === 'SUCCESS') {
                console.log(`[BETA] ⚠️ Callback lặp: Đơn hàng ${orderId} đã PAID. Bỏ qua (Idempotent).`);
                return { code: '00', message: 'Already processed (Idempotent)' };
            }
        }

        const now = VirtualClock.now().toISOString();

        // 3. Xử lý các trạng thái
        if (status === 'SUCCESS') {
            console.log(`[BETA] ✅ Giao dịch SUCCESS. Chuyển trạng thái PAID và xuất vé.`);
            DB.update('beta_orders', orderId, { 
                status: 'PAID', 
                paidAt: now, 
                callbackAt: now 
            });
            this.issueTicket(orderId);
            return { code: '00', message: 'Success' };
        } 
        else if (status === 'FAILED') {
            console.log(`[BETA] ❌ Giao dịch FAILED. Huỷ đơn, nhả ghế.`);
            DB.update('beta_orders', orderId, { status: 'FAILED', callbackAt: now });
            this.releaseSeats(orderId);
            return { code: '00', message: 'Updated FAILED' };
        }
        else if (status === 'CANCELLED') {
            console.log(`[BETA] 🚫 Giao dịch CANCELLED. Huỷ đơn, nhả ghế.`);
            DB.update('beta_orders', orderId, { status: 'CANCELLED', callbackAt: now });
            this.releaseSeats(orderId);
            return { code: '00', message: 'Updated CANCELLED' };
        }

        return { code: '99', message: 'Unknown status' };
    },

    /**
     * BR-03: Kịch bản timeout do thất lạc Callback (GIAO DỊCH TREO)
     */
    handleCallbackTimeout: function(orderId) {
        const order = DB.get('beta_orders', orderId);
        // Chỉ quét các đơn đang chờ
        if (!order || (order.status !== 'AWAITING_PAYMENT' && order.status !== 'HOLDING')) return;
        
        const settings = JSON.parse(localStorage.getItem('demoSettings'));
        const mode = settings.mode || 'AS-IS';
        
        console.log(`\n[BETA] ⏰ TIMEOUT: Không nhận được Callback cho đơn ${orderId} sau ${settings.callbackTimeoutSec}s.`);
        console.log(`[BETA] Chế độ hiện tại: ${mode}`);
        
        if (mode === 'AS-IS') {
            // GÂY RA LỖI GIAO DỊCH TREO: Nhả ghế ngay và huỷ đơn, bất chấp việc Cổng có thể đã trừ tiền!
            console.log(`[BETA] [AS-IS] Nhả ghế, huỷ đơn (status=FAILED). ⚠️ NGUY CƠ GIAO DỊCH TREO!`);
            DB.update('beta_orders', orderId, { status: 'FAILED' });
            this.releaseSeats(orderId);
            this.createNotification(order.userEmail, `Đơn hàng ${orderId} đã bị huỷ do quá hạn thanh toán.`, 'error');
        } 
        else if (mode === 'TO-BE') {
            // FIX LỖI: Đưa về PENDING_VERIFY, giữ ghế lâu hơn chờ Job Đối soát.
            const pendingVerifyHoldMin = 30; // Giữ ghế thêm 30 phút
            console.log(`[BETA] [TO-BE] Đổi status=PENDING_VERIFY, giữ ghế thêm ${pendingVerifyHoldMin} phút chờ đối soát.`);
            
            const newHoldExpires = new Date(VirtualClock.now().getTime() + pendingVerifyHoldMin * 60000).toISOString();
            
            DB.update('beta_orders', orderId, { 
                status: 'PENDING_VERIFY',
                holdExpiresAt: newHoldExpires 
            });
            this.createNotification(order.userEmail, `Đơn hàng ${orderId} đang chờ xác nhận kết quả thanh toán. Vui lòng kiểm tra lại sau!`, 'warning');
        }
    },

    releaseSeats: function(orderId) {
        console.log(`[BETA] Đã nhả ghế cho đơn hàng ${orderId}`);
        // Không xóa dữ liệu ghế trong DB để còn lưu lịch sử, nhưng vì status không còn là HOLDING/AWAITING nên view chọn ghế sẽ thấy ghế trống.
    },

    issueTicket: function(orderId) {
        const ticketId = DB.generateId.ticket();
        DB.update('beta_orders', orderId, { ticketId: ticketId });
        console.log(`[BETA] Đã phát hành vé ${ticketId} cho đơn ${orderId}`);
        
        const order = DB.get('beta_orders', orderId);
        this.createNotification(order.userEmail, `Thanh toán thành công! Mã vé: ${ticketId}`, 'success');
    },

    createNotification: function(email, message, type) {
        console.log(`[BETA-EMAIL/NOTI] Tới ${email} | ${type.toUpperCase()}: ${message}`);
        // Lưu tạm vào bảng giả để hiện lên chuông thông báo (nếu code UI)
        let notifs = JSON.parse(localStorage.getItem('notifications') || '[]');
        notifs.push({ email, message, type, createdAt: VirtualClock.now().toISOString(), read: false });
        localStorage.setItem('notifications', JSON.stringify(notifs));
    },

    // ---------------- INTERNAL LOGIC ----------------
    _scheduleTimeoutCheck: function(orderId, expireTimeMs) {
        this._timeoutJobs.push({ orderId, expireTimeMs });
    },
    
    _checkTimeouts: function() {
        const nowMs = VirtualClock.now().getTime();
        this._timeoutJobs = this._timeoutJobs.filter(job => {
            if (nowMs >= job.expireTimeMs) {
                this.handleCallbackTimeout(job.orderId);
                return false; 
            }
            return true;
        });
    }
};

// Hook vào VirtualClock để check timeout chuẩn xác khi người dùng Tua nhanh thời gian
window.addEventListener('clock:advance', () => {
    if(window.betaCore) window.betaCore._checkTimeouts();
});
setInterval(() => {
    if(window.betaCore) window.betaCore._checkTimeouts();
}, 2000);
