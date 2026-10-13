// js/reconcile.js

/**
 * RECONCILIATION ENGINE - ĐỘNG CƠ ĐỐI SOÁT VÀ HOÀN TIỀN TỰ ĐỘNG
 * (Thực thi BR-06, BR-07, BR-08, BR-09)
 * Chạy ngầm định kỳ hoặc mỗi khi đồng hồ ảo bị tua nhanh.
 */
window.reconcileEngine = {
    lastRunMs: 0,
    
    init: function() {
        this.lastRunMs = VirtualClock.now().getTime();
        
        // Lắng nghe tua thời gian ảo
        window.addEventListener('clock:advance', () => this.checkSchedule());
        
        // Loop tự nhiên (cho thời gian chạy bình thường)
        setInterval(() => this.checkSchedule(), 5000); 
    },
    
    checkSchedule: function() {
        const settings = JSON.parse(localStorage.getItem('demoSettings') || '{}');
        const mode = settings.mode || 'AS-IS';
        
        // BR-06: Chỉ hoạt động nếu mode = TO-BE
        if (mode !== 'TO-BE') return; 
        
        const intervalMin = settings.reconcileIntervalMin || 15;
        const intervalMs = intervalMin * 60000;
        const nowMs = VirtualClock.now().getTime();
        
        // Tính toán số lượng chu kỳ đã bị trôi qua (khi tua nhanh thời gian)
        if (nowMs - this.lastRunMs >= intervalMs) {
            let cycles = Math.floor((nowMs - this.lastRunMs) / intervalMs);
            if (cycles > 100) cycles = 100; // Cap để tránh crash nếu tua quá xa
            
            console.log(`\n[RECON-SCHEDULER] Bắt đầu chạy ${cycles} chu kỳ (mỗi chu kỳ ${intervalMin} phút)...`);
            
            for(let i = 0; i < cycles; i++) {
                // Đẩy thời gian ảo giả lập cho từng chu kỳ để tính logic
                const simulatedTime = new Date(this.lastRunMs + (i + 1) * intervalMs);
                this.runReconciliation(simulatedTime);
                this.processRefundQueue(simulatedTime);
            }
            
            this.lastRunMs += cycles * intervalMs;
        }
    },
    
    /**
     * Chạy đối soát từng đơn hàng
     */
    runReconciliation: function(simulatedTime = VirtualClock.now()) {
        const settings = JSON.parse(localStorage.getItem('demoSettings') || '{}');
        if (settings.mode !== 'TO-BE') {
            console.log("[RECON] AS-IS: Không có đối soát tự động.");
            return;
        }

        console.log(`[RECON] ---- JOB ĐỐI SOÁT LÚC ${simulatedTime.toLocaleTimeString()} ----`);
        
        const orders = DB.all('beta_orders') || [];
        // Lọc các đơn có nguy cơ kẹt (Có txnId nhưng chưa PAID)
        const targetOrders = orders.filter(o => 
            ['PENDING_VERIFY', 'FAILED', 'EXPIRED'].includes(o.status) && o.txnId
        );
        
        let matched = 0, mismatched = 0, handled = 0;
        
        targetOrders.forEach(order => {
            if (!window.gatewayCore) return;
            const gwStatus = window.gatewayCore.getTxnStatus(order.txnId);
            if (!gwStatus) return;
            
            // Xử lý LỆCH: Beta thất bại/kẹt nhưng Cổng báo Thành công và đã Trừ tiền
            if (gwStatus.status === 'SUCCESS' && gwStatus.debited && order.status !== 'PAID') {
                console.warn(`[RECON] ⚠️ PHÁT HIỆN LỆCH! Đơn ${order.orderId}: Beta=[${order.status}], Cổng=[SUCCESS]`);
                mismatched++;
                this.analyzeMismatchAndRefund(order, gwStatus, simulatedTime);
            } 
            // KHỚP: Cả 2 cùng thất bại
            else if (gwStatus.status === 'FAILED' && ['FAILED', 'EXPIRED'].includes(order.status)) {
                matched++;
            }
        });
        
        // Lưu lịch sử lần chạy
        DB.insert('recon_runs', {
            id: DB.generateId.ticket(),
            timestamp: simulatedTime.toISOString(),
            matched, mismatched, handled
        });
        console.log(`[RECON] Hoàn tất. Mismatch: ${mismatched}, Matched: ${matched}`);
    },
    
    /**
     * BR-07: Đánh giá an toàn và Quyết định Hoàn tiền tự động
     */
    analyzeMismatchAndRefund: function(order, gwStatus, simulatedTime) {
        // Kiểm tra 5 điều kiện
        const timeElapsedMin = (simulatedTime.getTime() - new Date(order.createdAt).getTime()) / 60000;
        
        const checks = {
            a: (gwStatus.status === 'SUCCESS' && gwStatus.debited === true),
            b: (['FAILED', 'EXPIRED', 'PENDING_VERIFY', 'CANCELLED'].includes(order.status)),
            c: (gwStatus.amount === order.amount),
            d: (!order.refundId), // Chưa tạo lệnh hoàn
            e: (timeElapsedMin >= 30) // Quá 30 phút (để tránh hoàn oan do Callback kẹt đang trên đường tới)
        };
        
        const allPassed = Object.values(checks).every(Boolean);
        
        if (allPassed) {
            console.log(`[RECON] ✅ Đủ 5 điều kiện. Tạo lệnh HOÀN TIỀN (AUTO) cho đơn ${order.orderId}.`);
            
            const refundId = DB.generateId.refund();
            DB.insert('beta_refunds', {
                refundId: refundId,
                orderId: order.orderId,
                txnId: order.txnId,
                amount: order.amount,
                type: 'AUTO',
                status: 'CHECKING',
                checks: checks,
                createdAt: simulatedTime.toISOString(),
                slaBreached: false
            });
            
            DB.update('beta_orders', order.orderId, {
                status: 'REFUND_PENDING',
                refundId: refundId
            });
            
        } else {
            // Nếu đã tạo lệnh hoàn rồi thì bỏ qua
            if (!checks.d) return;
            
            console.warn(`[RECON] ❌ Thiếu điều kiện tự động: ${JSON.stringify(checks)}. Tạo Support Ticket cho CSKH.`);
            const tickets = DB.all('support_tickets');
            if(!tickets.find(t => t.orderId === order.orderId)) {
                DB.insert('support_tickets', {
                    id: DB.generateId.ticket(),
                    orderId: order.orderId,
                    source: 'SYSTEM',
                    reason: 'Đối soát phát hiện lệch tiền nhưng thiếu điều kiện hoàn tự động',
                    checks: checks,
                    status: 'OPEN',
                    createdAt: simulatedTime.toISOString()
                });
            }
        }
    },
    
    /**
     * BR-08, BR-09: Xử lý hàng đợi Hoàn tiền
     */
    processRefundQueue: function(simulatedTime = VirtualClock.now()) {
        const refunds = DB.all('beta_refunds') || [];
        const settings = JSON.parse(localStorage.getItem('demoSettings') || '{}');
        const delayMin = settings.refundSendDelayMin || 60; // Thường ngân hàng yêu cầu T+1, ở đây cho 60p demo
        
        refunds.forEach(rf => {
            const createdMs = new Date(rf.createdAt).getTime();
            const elapsedMs = simulatedTime.getTime() - createdMs;
            
            if (rf.status === 'CHECKING') {
                // Đánh cờ SLA nếu quá 24h chưa xử lý
                if (elapsedMs >= 24 * 60 * 60 * 1000 && !rf.slaBreached) {
                    rf.slaBreached = true;
                    DB.update('beta_refunds', rf.refundId, rf);
                }
                
                // Đủ độ trễ an toàn, gọi Cổng thanh toán để Refund
                if (elapsedMs >= delayMin * 60000) {
                    console.log(`[RECON] Gọi lệnh hoàn tiền Gateway cho Refund ${rf.refundId}...`);
                    if (window.gatewayCore) {
                        const res = window.gatewayCore.refund(rf.txnId, rf.amount);
                        if (res.success) {
                            rf.status = 'SENT';
                            rf.gatewayRef = res.refundRef;
                            rf.sentAt = simulatedTime.toISOString();
                            DB.update('beta_refunds', rf.refundId, rf);
                            
                            // Trong hệ thống thật, Cổng nhận lệnh -> chuyển Bank xử lý -> gọi lại callback
                            // Demo này tự chuyển qua BANK_PROCESSING luôn
                            console.log(`[RECON] Lệnh hoàn tiền đã được Cổng chấp nhận. Đang xử lý tại Ngân hàng...`);
                            rf.status = 'BANK_PROCESSING';
                            DB.update('beta_refunds', rf.refundId, rf);
                        } else {
                            console.error(`[RECON] Hoàn tiền lỗi từ Cổng: ${res.message}`);
                            rf.status = 'ERROR';
                            DB.update('beta_refunds', rf.refundId, rf);
                        }
                    }
                }
            } 
            else if (rf.status === 'BANK_PROCESSING') {
                const sentMs = new Date(rf.sentAt).getTime();
                // Giả lập thời gian tiền về thẻ: 3 ngày làm việc (ảo)
                if (simulatedTime.getTime() - sentMs >= 3 * 24 * 60 * 60 * 1000) {
                    console.log(`[RECON] ✅ Tiền đã về tài khoản khách hàng cho Refund ${rf.refundId}`);
                    rf.status = 'COMPLETED';
                    rf.completedAt = simulatedTime.toISOString();
                    DB.update('beta_refunds', rf.refundId, rf);
                    
                    const order = DB.get('beta_orders', rf.orderId);
                    DB.update('beta_orders', rf.orderId, {
                        status: 'REFUNDED'
                    });
                    
                    // BR-09: Gửi thông báo "Thất bại - Đã hoàn tiền"
                    if (window.createMultiChannelNotification) {
                        window.createMultiChannelNotification(
                            rf.orderId, order.userEmail, 
                            "Giao dịch thất bại - Đã hoàn tiền", 
                            `Giao dịch mua vé ${order.orderId} của bạn đã thất bại. Hệ thống đối soát đã tự động hoàn lại ${rf.amount.toLocaleString()} đ vào thẻ của bạn.`
                        );
                    }
                }
            }
        });
    }
};

/**
 * HÀM TEST ĐỂ GIẢNG VIÊN GỌI TRONG CONSOLE F12
 * Khởi tạo dữ liệu giả lập cho Kịch bản treo, rồi kích hoạt Recon chạy.
 */
window.testReconciliation = function() {
    console.log("========== [TEST RECONCILIATION] ==========");
    const orderId = DB.generateId.order();
    const txnId = DB.generateId.txn();
    
    // Giao dịch cách đây 40 phút (Đủ đk hoàn tiền)
    let d = VirtualClock.now();
    d.setMinutes(d.getMinutes() - 40);
    
    DB.insert('beta_orders', {
        orderId: orderId, status: 'PENDING_VERIFY', amount: 150000,
        txnId: txnId, createdAt: d.toISOString(), userEmail: 'khachhang@gmail.com'
    });
    
    DB.insert('gateway_txns', {
        txnId: txnId, orderId: orderId, amount: 150000,
        status: 'SUCCESS', debited: true, createdAt: d.toISOString()
    });
    
    console.log(`Đã tạo Đơn Treo giả lập: Order=${orderId}, Txn=${txnId}`);
    
    // Chạy Recon ngay lập tức
    window.reconcileEngine.runReconciliation(VirtualClock.now());
    console.log("Hãy kiểm tra bảng beta_refunds trong localStorage để thấy lệnh hoàn tiền!");
};

document.addEventListener('DOMContentLoaded', () => {
    window.reconcileEngine.init();
});
