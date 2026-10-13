// js/gateway-core.js

/**
 * CỔNG THANH TOÁN (MÔ PHỎNG)
 * Chứa các API giả lập cung cấp cho Website Beta gọi (Đối soát, Hoàn tiền, Tạo giao dịch).
 * Đồng thời chứa logic tự động kích hoạt các Callback bị Delay khi thời gian trôi qua.
 */
window.gatewayCore = {
    /**
     * API tạo giao dịch (Thường được gọi bởi Website Merchant khi bắt đầu chuyển trang)
     */
    createTxn: function(orderId, method, amount) {
        const txnId = DB.generateId.txn();
        DB.insert('gateway_txns', {
            txnId: txnId,
            orderId: orderId,
            method: method,
            amount: amount,
            status: 'PENDING',
            debited: false, // Tiền khách hàng chưa bị trừ
            callback: { mode: 'OK', delayedUntil: null },
            refund: null,
            createdAt: VirtualClock.now().toISOString()
        });
        console.log(`[GATEWAY] Đã tạo giao dịch mới: ${txnId}`);
        return txnId;
    },
    
    /**
     * API Tra cứu trạng thái giao dịch (Dành cho Merchant Đối soát)
     * Trả về nguyên gốc trạng thái thật nằm tại Cổng thanh toán
     */
    getTxnStatus: function(txnId) {
        const txn = DB.get('gateway_txns', txnId);
        if(!txn) return null;
        
        console.log(`[GATEWAY API] getTxnStatus(${txnId}) -> ${txn.status} (Debited: ${txn.debited})`);
        return {
            status: txn.status,
            debited: txn.debited,
            amount: txn.amount,
            refundStatus: txn.refund ? txn.refund.status : null
        };
    },
    
    /**
     * API Yêu cầu hoàn tiền (Merchant gọi sang khi Đối soát phát hiện lệch)
     */
    refund: function(txnId, amount) {
        console.log(`[GATEWAY API] Yêu cầu hoàn tiền ${amount} đ cho giao dịch ${txnId}`);
        const txn = DB.get('gateway_txns', txnId);
        
        if(!txn) {
            return { success: false, message: 'Giao dịch không tồn tại' };
        }
        if(txn.status !== 'SUCCESS' || !txn.debited) {
            return { success: false, message: 'Giao dịch chưa thành công, không thể hoàn tiền' };
        }
        if(txn.refund && txn.refund.status === 'REFUNDED') {
            return { success: false, message: 'Giao dịch đã được hoàn tiền trước đó' };
        }
        
        const refundRef = DB.generateId.refund();
        txn.refund = {
            id: refundRef,
            amount: amount,
            status: 'REFUNDED',
            createdAt: VirtualClock.now().toISOString()
        };
        
        DB.update('gateway_txns', txnId, txn);
        console.log(`[GATEWAY API] Hoàn tiền thành công. Mã Refund: ${refundRef}`);
        return { success: true, refundRef: refundRef };
    },

    /**
     * Vòng lặp mô phỏng hệ thống Cổng tự động Retry Callback nếu bị Delay (S5)
     */
    processDelayedCallbacks: function() {
        const now = VirtualClock.now().getTime();
        const txns = DB.all('gateway_txns').filter(t => t.callback && t.callback.mode === 'DELAYED' && t.callback.delayedUntil);
        
        txns.forEach(txn => {
            if(now >= txn.callback.delayedUntil) {
                console.log(`\n[GATEWAY WORKER] ⚡ Thực thi Callback (bị delay) cho giao dịch ${txn.txnId}`);
                
                // Đổi trạng thái để không gọi lại nữa
                txn.callback.mode = 'DONE';
                txn.callback.delayedUntil = null;
                DB.update('gateway_txns', txn.txnId, txn);
                
                // Bắn qua Beta (Giả lập việc gửi Webhook qua mạng)
                if (typeof window.betaCore !== 'undefined') {
                    window.betaCore.receiveCallback({
                        txnId: txn.txnId,
                        orderId: txn.orderId,
                        amount: txn.amount,
                        status: txn.status
                    });
                } else {
                    console.error("[GATEWAY WORKER] Không tìm thấy betaCore để nhận Webhook.");
                }
            }
        });
    }
};

// Đăng ký worker chạy ẩn
window.addEventListener('clock:advance', () => {
    if(window.gatewayCore) window.gatewayCore.processDelayedCallbacks();
});
setInterval(() => {
    if(window.gatewayCore) window.gatewayCore.processDelayedCallbacks();
}, 2000);
