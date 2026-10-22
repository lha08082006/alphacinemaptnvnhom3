// js/result.js
'use strict';

(function() {
    // 1. Hằng số nghiệp vụ dùng chung
    const REFUND_ESTIMATED_TIMES = Object.freeze({
        INTL_CARD: 'trong vòng 30 ngày làm việc',
        CC: 'trong vòng 30 ngày làm việc',
        ATM: 'trong vòng 7 ngày làm việc',
        VNBANK: 'trong vòng 7 ngày làm việc',
        WALLET: '7-14 ngày làm việc',
        QR: '7-14 ngày làm việc',
        VNPAYQR: '7-14 ngày làm việc',
        BANK_TRANSFER: '24-48 giờ làm việc',
        SEPAY: '24-48 giờ làm việc',
        DEFAULT: '7-14 ngày làm việc'
    });

    const STATUS_MAP = Object.freeze({
        HOLDING: 'Đang giữ ghế',
        AWAITING_PAYMENT: 'Chờ thanh toán',
        PENDING_VERIFY: 'Đang xác minh (Đối soát)',
        PAID: 'Thanh toán thành công',
        FAILED: 'Thanh toán thất bại',
        EXPIRED: 'Hết hạn giữ chỗ',
        CANCELLED: 'Đã hủy',
        REFUND_PENDING: 'Đã tạo lệnh hoàn tiền',
        REFUNDED: 'Đã hoàn tiền thành công'
    });

    const REFUND_STATUS_MAP = Object.freeze({
        CHECKING: 'Đang kiểm tra điều kiện hoàn tiền',
        SENT: 'Đã gửi lệnh hoàn sang cổng thanh toán',
        BANK_PROCESSING: 'Ngân hàng đang xử lý hoàn tiền',
        COMPLETED: 'Tiền đã được hoàn về tài khoản của bạn',
        REJECTED: 'Yêu cầu hoàn tiền bị từ chối'
    });

    window.REFUND_ESTIMATED_TIMES = REFUND_ESTIMATED_TIMES;

    function getEstimatedRefundTime(method) {
        if (!method) return REFUND_ESTIMATED_TIMES.DEFAULT;
        const normalized = method.toUpperCase();
        return REFUND_ESTIMATED_TIMES[normalized] || REFUND_ESTIMATED_TIMES.DEFAULT;
    }

    function formatMoney(amount) {
        if (amount === null || amount === undefined) return '0 ₫';
        return Number(amount).toLocaleString('vi-VN') + ' ₫';
    }

    function formatTime(isoStr) {
        if (!isoStr) return '';
        try {
            const d = new Date(isoStr);
            return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + d.toLocaleDateString('vi-VN');
        } catch (e) {
            return isoStr;
        }
    }

    function getMethodDisplay(method) {
        if (!method) return 'VNPAY';
        const m = method.toUpperCase();
        if (m === 'SEPAY' || m === 'BANK_TRANSFER' || m === 'SEPAY_BANK_TRANSFER') return 'SePay - Quét mã QR Chuyển khoản (Sandbox)';
        if (m === 'ATM' || m === 'VNBANK') return 'Thẻ ATM nội địa (Napas/NCB)';
        if (m === 'INTL_CARD' || m === 'CC' || m === 'INTCARD') return 'Thẻ quốc tế (Visa/Master/JCB)';
        if (m === 'QR' || m === 'WALLET' || m === 'VNPAYQR') return 'VNPAY-QR (App Ngân hàng & Ví)';
        return method;
    }

    function renderTimeline(timeline) {
        if (!timeline || !timeline.length) return '';
        let itemsHtml = '';
        timeline.forEach(item => {
            const fromLabel = STATUS_MAP[item.fromStatus] || item.fromStatus || 'Tạo đơn';
            const toLabel = STATUS_MAP[item.toStatus] || item.toStatus;
            const actor = item.actorType ? `[${item.actorType}]` : '';
            const reason = item.reason ? ` - ${item.reason}` : '';
            itemsHtml += `
                <div class="timeline-item">
                    <div class="timeline-dot"></div>
                    <div class="timeline-time">${formatTime(item.at)}</div>
                    <div class="timeline-content">${fromLabel} ➔ <strong style="color: #03599d;">${toLabel}</strong></div>
                    <div class="timeline-reason">${actor}${reason}</div>
                </div>
            `;
        });

        return `
            <div class="timeline-box">
                <div class="timeline-title">
                    <span>📜 Lịch sử trạng thái đơn hàng</span>
                </div>
                <div class="timeline-items">${itemsHtml}</div>
            </div>
        `;
    }

    // Biến quản lý Polling cho trạng thái PENDING_VERIFY
    let pollInterval = null;
    let pollCount = 0;
    const MAX_POLL_COUNT = 10; // Giới hạn tối đa 10 lần (khoảng 30 giây)
    const POLL_INTERVAL_MS = 3000; // Mỗi 3 giây

    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    function renderClaimAction(orderId, paymentTime, remainingClaimMinutes) {
        if (!orderId) return '';
        let claimMin = remainingClaimMinutes;
        if (claimMin === undefined && paymentTime) {
            const elapsedMs = Date.now() - new Date(paymentTime).getTime();
            claimMin = Math.max(0, Math.floor((60 * 60 * 1000 - elapsedMs) / 60000));
        }
        const isExpired = claimMin === undefined || claimMin <= 0;

        return `
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; margin: 18px 0 10px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; text-align: left;">
                <div>
                    <div style="font-weight: 700; font-size: 13.5px; color: ${isExpired ? '#64748b' : '#03599d'};">
                        ${isExpired ? '⚠️ Đã quá thời hạn khiếu nại trực tuyến (quá 60 phút)' : `⏰ Hạn khiếu nại thanh toán: Còn <strong>${claimMin} phút</strong>`}
                    </div>
                    <div style="font-size: 12px; color: #64748b;">
                        Theo Điều khoản Mục 3: Khiếu nại trong vòng 60 phút sau khi thanh toán
                    </div>
                </div>
                <a href="support.html?orderId=${encodeURIComponent(orderId)}&action=report" style="background: #fff7ed; color: #c2410c; border: 1px solid #fed7aa; padding: 7px 14px; border-radius: 4px; font-weight: 700; font-size: 13px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                    ⚠️ Báo lỗi thanh toán
                </a>
            </div>
        `;
    }

    function renderStatusView(data, isPolling = false) {
        const content = document.getElementById('result-content');
        if (!content) return;

        const status = data.status;
        const orderId = data.orderId || '';
        const totalFormatted = formatMoney(data.amountTotal || data.amount);
        const paymentMethod = data.paymentMethod || 'VNPAY';
        const estimatedTime = data.estimatedRefundTime || getEstimatedRefundTime(paymentMethod);

        // 1. Trạng thái PAID (Thành công - Có vé)
        if (status === 'PAID') {
            stopPolling();
            const ticket = data.ticket;
            const ticketCode = ticket ? (ticket.ticket_id || ticket.ticketId || 'CS' + orderId.substring(2)) : 'Chờ xuất vé';
            const qrPayload = ticket ? (ticket.qr_payload || ticket.qrPayload || `TICKET:${ticketCode}:${orderId}`) : '';

            content.innerHTML = `
                <div class="icon-large icon-success">✔️</div>
                <h2 style="color: #28a745; margin-bottom: 8px; font-weight: 800;">THANH TOÁN THÀNH CÔNG</h2>
                <p style="margin: 10px 0 20px; font-size: 15px; color: #444;">
                    Đơn hàng <strong>${orderId}</strong> đã thanh toán thành công và vé xem phim điện tử đã được phát hành!
                </p>

                <!-- THẺ VÉ ĐIỆN TỬ -->
                <div class="ticket-card" style="background: #ffffff; border: 2px dashed #28a745; border-radius: 8px; padding: 20px; margin: 20px 0; box-shadow: 0 4px 15px rgba(40,167,69,0.08);">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e9ecef; padding-bottom: 12px; margin-bottom: 15px;">
                        <span style="font-weight: 800; color: #03599d; font-size: 16px; letter-spacing: 0.5px;">🎟️ VÉ XEM PHIM ĐIỆN TỬ</span>
                        <span style="background: #28a745; color: white; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 700;">HỢP LỆ</span>
                    </div>

                    <div style="display: flex; flex-wrap: wrap; gap: 20px; align-items: center; justify-content: space-around;">
                        <!-- Mã QR mô phỏng -->
                        <div style="text-align: center;">
                            <div style="width: 130px; height: 130px; border: 1px solid #ddd; padding: 8px; border-radius: 6px; background: white; margin: 0 auto; display: flex; align-items: center; justify-content: center;">
                                <svg width="114" height="114" viewBox="0 0 24 24" fill="#222">
                                    <path d="M2 2h8v8H2V2zm2 2v4h4V4H4zm10-2h8v8h-8V2zm2 2v4h4V4h-4zM2 14h8v8H2v-8zm2 2v4h4v-4H4zm14-2h4v2h-4v-2zm-4 0h2v4h-2v-4zm2 4h4v4h-4v-4zm2 2v-2h-2v2h2zm-8-2h2v2H8v-2zm4-6h2v2h-2v-2zm-2 2h2v2h-2v-2zm4 2h2v2h-2v-2z"/>
                                </svg>
                            </div>
                            <div style="font-size: 11px; color: #666; margin-top: 6px;">Quét mã tại cổng soát vé</div>
                        </div>

                        <!-- Thông tin vé -->
                        <div style="flex: 1; min-width: 220px; text-align: left; font-size: 14px;">
                            <div class="info-card-row"><span>Mã vé:</span><strong style="color: #03599d; font-size: 16px; font-family: monospace;">${ticketCode}</strong></div>
                            <div class="info-card-row"><span>Mã đơn hàng:</span><strong>${orderId}</strong></div>
                            <div class="info-card-row"><span>Số tiền:</span><strong style="color: #dc3545; font-size: 15px;">${totalFormatted}</strong></div>
                            <div class="info-card-row"><span>Phương thức:</span><span>${getMethodDisplay(paymentMethod)}</span></div>
                            <div class="info-card-row"><span>Thời gian cấp vé:</span><span>${formatTime(ticket ? ticket.issued_at || ticket.issuedAt : new Date().toISOString())}</span></div>
                        </div>
                    </div>
                </div>

                ${renderClaimAction(orderId, data.paymentTime || data.createdAt, data.remainingClaimMinutes)}

                <div style="display: flex; gap: 12px; justify-content: center; margin: 25px 0 15px;">
                    <a href="index.html" class="btn btn-secondary">VỀ TRANG CHỦ</a>
                    <a href="inbox.html" class="btn btn-primary">XEM THÔNG BÁO VÉ</a>
                </div>
                ${renderTimeline(data.timeline)}
            `;
            return true;
        }

        // 2. Trạng thái PENDING_VERIFY (Đang xác minh giao dịch)
        if (status === 'PENDING_VERIFY' || status === 'AWAITING_PAYMENT') {
            const hasExceeded = pollCount >= MAX_POLL_COUNT;

            content.innerHTML = `
                <div class="icon-large icon-warning" style="animation: pulse 1.5s infinite;">⏳</div>
                <h2 style="color: #f39c12; margin-bottom: 8px; font-weight: 800;">ĐANG XÁC MINH GIAO DỊCH</h2>
                
                <div style="background: #fff8e1; border-left: 4px solid #f39c12; padding: 12px 16px; margin: 15px 0; text-align: left; border-radius: 4px; font-size: 13.5px; color: #795548; line-height: 1.6;">
                    ⚠️ <strong>Lưu ý quan trọng:</strong> Hệ thống đang kiểm tra kết quả đối soát tự động từ Ngân hàng / Cổng VNPay. 
                    <strong style="color: #dc3545;">Quý khách vui lòng KHÔNG thanh toán lại</strong> để tránh bị trừ tiền 2 lần.
                </div>

                <div class="info-card">
                    <div class="info-card-row"><span>Mã đơn hàng:</span><strong>${orderId}</strong></div>
                    <div class="info-card-row"><span>Số tiền giao dịch:</span><strong>${totalFormatted}</strong></div>
                    <div class="info-card-row"><span>Phương thức:</span><span>${getMethodDisplay(paymentMethod)}</span></div>
                    <div class="info-card-row"><span>Trạng thái đối soát:</span><strong style="color: #f39c12;">ĐANG ĐỐI SOÁT TỰ ĐỘNG</strong></div>
                </div>

                ${renderClaimAction(orderId, data.paymentTime || data.createdAt, data.remainingClaimMinutes)}

                ${!hasExceeded ? `
                    <div style="margin: 20px 0; color: #666; font-size: 13.5px;">
                        <div class="spinner" style="width: 32px; height: 32px; border-width: 3px; margin: 0 auto 10px;"></div>
                        <div>Đang tự động cập nhật trạng thái... (Kiểm tra lần <strong>${pollCount}</strong> / ${MAX_POLL_COUNT})</div>
                    </div>
                ` : `
                    <!-- HƯỚNG DẪN KHI ĐỐI SOÁT KÉO DÀI QUÁ LÂU -->
                    <div style="background: #e8f4fd; border: 1px solid #b8daff; border-radius: 6px; padding: 16px 20px; margin: 20px 0; text-align: left; font-size: 13.5px;">
                        <h4 style="color: #03599d; margin: 0 0 10px 0; font-size: 15px; display: flex; align-items: center; gap: 6px;">
                            ℹ️ HƯỚNG DẪN XỬ LÝ KHI GIAO DỊCH CHỜ XÁC MINH LÂU
                        </h4>
                        <p style="margin: 0 0 8px 0; color: #333; line-height: 1.5;">
                            Giao dịch của bạn đang mất nhiều thời gian hơn dự kiến từ cổng thanh toán. Hệ thống đối soát định kỳ vẫn đang tiếp tục xử lý đơn này.
                        </p>
                        <ul style="margin: 0; padding-left: 20px; color: #555; line-height: 1.6;">
                            <li><strong>Kiểm tra Email:</strong> Khi hoàn tất đối soát, hệ thống sẽ tự động xuất vé hoặc thông báo hoàn tiền về Email của bạn.</li>
                            <li><strong>Không cần giữ mở trang này:</strong> Bạn có thể đóng tab, hệ thống không bị gián đoạn.</li>
                            <li><strong>Tra cứu tiến độ:</strong> Sử dụng mã đơn <code>${orderId}</code> tại trang Hỗ trợ (Support) hoặc liên hệ CSKH.</li>
                        </ul>
                    </div>

                    <div style="display: flex; gap: 12px; justify-content: center; margin-bottom: 15px;">
                        <button class="btn btn-primary" onclick="window.restartPolling()">KIỂM TRA LẠI NGAY</button>
                        <a href="support.html?orderId=${encodeURIComponent(orderId)}" class="btn btn-secondary">TRA CỨU HỖ TRỢ</a>
                    </div>
                `}

                ${renderTimeline(data.timeline)}
            `;
            return hasExceeded; // Dừng polling nếu đã vượt quá giới hạn
        }

        // 3. Trạng thái FAILED (Giao dịch thất bại)
        if (status === 'FAILED') {
            stopPolling();
            content.innerHTML = `
                <div class="icon-large icon-error">❌</div>
                <h2 style="color: #dc3545; margin-bottom: 8px; font-weight: 800;">GIAO DỊCH THẤT BẠI</h2>
                <p style="margin: 10px 0 20px; font-size: 15px; color: #555;">
                    Thanh toán cho đơn hàng <strong>${orderId}</strong> không thành công hoặc đã bị từ chối từ phía ngân hàng phát hành thẻ.
                </p>

                <div class="info-card">
                    <div class="info-card-row"><span>Mã đơn hàng:</span><strong>${orderId}</strong></div>
                    <div class="info-card-row"><span>Số tiền:</span><strong>${totalFormatted}</strong></div>
                    <div class="info-card-row"><span>Phương thức:</span><span>${getMethodDisplay(paymentMethod)}</span></div>
                    <div class="info-card-row" style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed #ddd;">
                        <span style="color: #666;">Lưu ý:</span>
                        <span style="color: #333; font-style: italic;">Nếu tài khoản của quý khách đã bị trừ tiền, hệ thống đối soát sẽ tự động hoàn tiền theo quy định.</span>
                    </div>
                </div>

                ${renderClaimAction(orderId, data.paymentTime || data.createdAt, data.remainingClaimMinutes)}

                <div style="display: flex; gap: 12px; justify-content: center; margin: 25px 0 15px;">
                    <a href="booking.html" class="btn btn-orange">ĐẶT VÉ LẠI</a>
                    <a href="support.html?orderId=${encodeURIComponent(orderId)}" class="btn btn-secondary">LIÊN HỆ CSKH</a>
                </div>
                ${renderTimeline(data.timeline)}
            `;
            return true;
        }

        // 4. Trạng thái EXPIRED (Hết hạn giữ chỗ)
        if (status === 'EXPIRED') {
            stopPolling();
            content.innerHTML = `
                <div class="icon-large icon-error">⏱️</div>
                <h2 style="color: #dc3545; margin-bottom: 8px; font-weight: 800;">HẾT HẠN GIỮ GHẾ</h2>
                <p style="margin: 10px 0 20px; font-size: 15px; color: #555;">
                    Đơn hàng <strong>${orderId}</strong> đã quá thời gian giữ ghế theo quy định (5 phút). Ghế đã được tự động giải phóng để nhường cho khách hàng khác.
                </p>

                <div class="info-card">
                    <div class="info-card-row"><span>Mã đơn hàng:</span><strong>${orderId}</strong></div>
                    <div class="info-card-row"><span>Số tiền đơn:</span><strong>${totalFormatted}</strong></div>
                    <div class="info-card-row"><span>Trạng thái:</span><strong style="color: #dc3545;">HẾT HẠN (EXPIRED)</strong></div>
                </div>

                ${renderClaimAction(orderId, data.paymentTime || data.createdAt, data.remainingClaimMinutes)}

                <div style="display: flex; gap: 12px; justify-content: center; margin: 25px 0 15px;">
                    <a href="booking.html" class="btn btn-orange">CHỌN LẠI GHẾ</a>
                    <a href="index.html" class="btn btn-secondary">VỀ TRANG CHỦ</a>
                </div>
                ${renderTimeline(data.timeline)}
            `;
            return true;
        }

        // 5. Trạng thái REFUND_PENDING (Đã tạo lệnh hoàn tiền)
        if (status === 'REFUND_PENDING') {
            stopPolling();
            const refund = data.refund;
            const refundCode = refund ? (refund.refundId || refund.refund_id || 'RF' + orderId.substring(2)) : 'RF-PENDING';
            const refundAmount = refund ? formatMoney(refund.amount) : totalFormatted;
            const refundStatusText = refund ? (REFUND_STATUS_MAP[refund.status] || refund.status) : 'Đang kiểm tra điều kiện';

            content.innerHTML = `
                <div class="icon-large icon-warning">🔄</div>
                <h2 style="color: #f39c12; margin-bottom: 8px; font-weight: 800;">ĐÃ TẠO LỆNH HOÀN TIỀN</h2>
                <p style="margin: 10px 0 20px; font-size: 15px; color: #555;">
                    Đơn hàng <strong>${orderId}</strong> thanh toán muộn hoặc có sự cố đối soát, hệ thống đã lập lệnh hoàn tiền tự động về tài khoản của quý khách.
                </p>

                <div class="info-card">
                    <div class="info-card-row"><span>Mã đơn hàng:</span><strong>${orderId}</strong></div>
                    <div class="info-card-row"><span>Mã lệnh hoàn:</span><strong style="color: #03599d; font-family: monospace;">${refundCode}</strong></div>
                    <div class="info-card-row"><span>Số tiền hoàn:</span><strong style="color: #dc3545; font-size: 16px;">${refundAmount}</strong></div>
                    <div class="info-card-row"><span>Phương thức thanh toán:</span><strong>${getMethodDisplay(paymentMethod)}</strong></div>
                    <div class="info-card-row"><span>Tiến độ hoàn tiền:</span><strong style="color: #f39c12;">${refundStatusText}</strong></div>
                </div>

                <!-- BẢNG THỜI GIAN DỰ KIẾN HOÀN TIỀN (ĐỒNG NHẤT ĐIỀU KHOẢN CHECKOUT) -->
                <div style="background: #fdfaf3; border: 1px solid #ffeeba; border-radius: 6px; padding: 18px 20px; margin: 20px 0; text-align: left; font-size: 13.5px;">
                    <div style="font-weight: 800; color: #856404; font-size: 14.5px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                        ⏱️ THỜI GIAN DỰ KIẾN TIỀN VỀ TÀI KHOẢN
                    </div>
                    
                    <div style="background: white; border: 1px solid #fae8b4; border-radius: 4px; padding: 10px 14px; margin-bottom: 12px;">
                        <span style="color: #555;">Dự kiến cho phương thức của bạn (<strong>${getMethodDisplay(paymentMethod)}</strong>):</span><br>
                        <strong style="color: #03599d; font-size: 15px;">👉 ${estimatedTime}</strong>
                    </div>

                    <div style="font-size: 12.5px; color: #666; line-height: 1.6;">
                        <em>Chi tiết quy định hoàn tiền theo Điều 7 - Điều khoản thanh toán Beta Cinemas:</em><br>
                        • <strong>Thẻ quốc tế (Visa, Master, JCB):</strong> trong vòng 30 ngày làm việc.<br>
                        • <strong>Thẻ nội địa (ATM Napas / NCB):</strong> trong vòng 7 ngày làm việc.<br>
                        • <strong>Ví điện tử & App ngân hàng (VNPAY-QR):</strong> 7-14 ngày làm việc.
                    </div>
                </div>

                ${renderClaimAction(orderId, data.paymentTime || data.createdAt, data.remainingClaimMinutes)}

                <div style="display: flex; gap: 12px; justify-content: center; margin: 25px 0 15px;">
                    <a href="support.html?orderId=${encodeURIComponent(orderId)}" class="btn btn-primary">TRA CỨU TIẾN ĐỘ HOÀN</a>
                    <a href="index.html" class="btn btn-secondary">VỀ TRANG CHỦ</a>
                </div>
                ${renderTimeline(data.timeline)}
            `;
            return true;
        }

        // 6. Trạng thái REFUNDED (Đã hoàn xong)
        if (status === 'REFUNDED') {
            stopPolling();
            const refund = data.refund;
            const refundCode = refund ? (refund.refundId || refund.refund_id || 'RF' + orderId.substring(2)) : 'RF-COMPLETED';
            const refundAmount = refund ? formatMoney(refund.amount) : totalFormatted;

            content.innerHTML = `
                <div class="icon-large icon-refund">💰</div>
                <h2 style="color: #17a2b8; margin-bottom: 8px; font-weight: 800;">ĐÃ HOÀN TIỀN THÀNH CÔNG</h2>
                <p style="margin: 10px 0 20px; font-size: 15px; color: #555;">
                    Thủ tục hoàn tiền cho đơn hàng <strong>${orderId}</strong> đã được hoàn tất thành công về tài khoản / thẻ của quý khách.
                </p>

                <div class="info-card">
                    <div class="info-card-row"><span>Mã đơn hàng:</span><strong>${orderId}</strong></div>
                    <div class="info-card-row"><span>Mã lệnh hoàn:</span><strong style="color: #03599d; font-family: monospace;">${refundCode}</strong></div>
                    <div class="info-card-row"><span>Số tiền đã hoàn:</span><strong style="color: #28a745; font-size: 16px;">${refundAmount}</strong></div>
                    <div class="info-card-row"><span>Phương thức hoàn:</span><span>${getMethodDisplay(paymentMethod)}</span></div>
                    <div class="info-card-row"><span>Thời gian hoàn tất:</span><span>${formatTime(refund && refund.completedAt ? refund.completedAt : new Date().toISOString())}</span></div>
                </div>

                ${renderClaimAction(orderId, data.paymentTime || data.createdAt, data.remainingClaimMinutes)}

                <div style="display: flex; gap: 12px; justify-content: center; margin: 25px 0 15px;">
                    <a href="index.html" class="btn btn-primary">VỀ TRANG CHỦ</a>
                    <a href="support.html" class="btn btn-secondary">TRANG HỖ TRỢ</a>
                </div>
                ${renderTimeline(data.timeline)}
            `;
            return true;
        }

        // 7. Các trạng thái khác (CANCELLED, HOLDING...)
        stopPolling();
        content.innerHTML = `
            <div class="icon-large" style="color: #6c757d;">ℹ️</div>
            <h2 style="color: #495057; margin-bottom: 8px;">TRẠNG THÁI: ${STATUS_MAP[status] || status}</h2>
            <p style="margin: 15px 0; font-size: 15px; color: #555;">
                Đơn hàng <strong>${orderId}</strong> hiện có trạng thái: ${STATUS_MAP[status] || status}.
            </p>
            <div class="info-card">
                <div class="info-card-row"><span>Mã đơn hàng:</span><strong>${orderId}</strong></div>
                <div class="info-card-row"><span>Số tiền:</span><strong>${totalFormatted}</strong></div>
            </div>
            <div style="display: flex; gap: 12px; justify-content: center; margin: 20px 0 15px;">
                <a href="index.html" class="btn btn-primary">VỀ TRANG CHỦ</a>
            </div>
            ${renderTimeline(data.timeline)}
        `;
        return true;
    }

    // Hiển thị form tra cứu bảo mật khi chưa đăng nhập hoặc không phải chính chủ đơn (Requirement 4)
    function renderVerificationLookup(orderId, message) {
        stopPolling();
        const content = document.getElementById('result-content');
        if (!content) return;

        content.innerHTML = `
            <div class="icon-large icon-warning">🔒</div>
            <h2 style="color: #03599d; margin-bottom: 10px; font-weight: 800;">XÁC THỰC QUYỀN TRUY CẬP ĐƠN HÀNG</h2>
            <p style="margin: 10px 0 20px; font-size: 14.5px; color: #555; line-height: 1.6;">
                ${message || 'Đơn hàng này được bảo vệ quyền riêng tư. Vui lòng xác nhận Email hoặc Số điện thoại bạn đã sử dụng khi đặt vé:'}
            </p>

            <div style="max-width: 440px; margin: 0 auto 25px; background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 22px 20px; text-align: left;">
                <div style="margin-bottom: 12px;">
                    <label style="font-weight: 700; font-size: 13px; color: #333; display: block; margin-bottom: 6px;">Mã đơn hàng:</label>
                    <input type="text" id="verify-order-id" value="${orderId || ''}" readonly style="width: 100%; box-sizing: border-box; padding: 9px 12px; background: #e9ecef; border: 1px solid #ced4da; border-radius: 4px; font-weight: 700; color: #495057;">
                </div>

                <div style="margin-bottom: 18px;">
                    <label style="font-weight: 700; font-size: 13px; color: #333; display: block; margin-bottom: 6px;">Email hoặc Số điện thoại đặt vé:</label>
                    <input type="text" id="verify-contact" placeholder="Ví dụ: khach@gmail.com hoặc 0987654321" style="width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #03599d; border-radius: 4px; font-size: 14px;">
                    <div id="verify-error" style="color: #dc3545; font-size: 12.5px; margin-top: 6px; display: none;"></div>
                </div>

                <button type="button" class="btn btn-primary" id="btn-do-verify" style="width: 100%; padding: 11px 0; font-size: 14.5px;" onclick="window.submitVerificationLookup()">
                    XÁC THỰC & XEM KẾT QUẢ ĐƠN
                </button>
            </div>

            <div style="font-size: 13px; color: #777;">
                Hoặc <a href="login.html?next=${encodeURIComponent(window.location.href)}" style="color: #03599d; font-weight: 700;">Đăng nhập tài khoản</a> nếu bạn đã có tài khoản Beta Cinemas.
            </div>
        `;
    }

    // Xử lý gửi tra cứu bảo mật (POST /support/lookup)
    window.submitVerificationLookup = async function() {
        const orderId = document.getElementById('verify-order-id')?.value?.trim();
        const contact = document.getElementById('verify-contact')?.value?.trim();
        const errEl = document.getElementById('verify-error');
        const btn = document.getElementById('btn-do-verify');

        if (!contact) {
            if (errEl) {
                errEl.innerText = 'Vui lòng nhập Email hoặc Số điện thoại đặt vé!';
                errEl.style.display = 'block';
            }
            return;
        }

        if (errEl) errEl.style.display = 'none';
        if (btn) {
            btn.disabled = true;
            btn.innerText = 'Đang kiểm tra...';
        }

        try {
            const res = await API.post('/support/lookup', {
                orderId,
                contact,
            });

            if (res && res.found) {
                // Xác thực thành công! Render toàn bộ đơn hàng
                renderStatusView(res);
            } else {
                if (errEl) {
                    errEl.innerText = res.message || 'Thông tin Email / SĐT không khớp với đơn hàng. Vui lòng kiểm tra lại.';
                    errEl.style.display = 'block';
                }
            }
        } catch (e) {
            console.error('Lỗi khi xác thực tra cứu:', e);
            if (errEl) {
                errEl.innerText = e.message || 'Có lỗi xảy ra khi tra cứu. Vui lòng thử lại sau.';
                errEl.style.display = 'block';
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerText = 'XÁC THỰC & XEM KẾT QUẢ ĐƠN';
            }
        }
    };

    // Hàm lấy trạng thái từ API và kích hoạt Polling
    async function initResult() {
        const urlParams = new URLSearchParams(window.location.search || window.location.hash.split('?')[1] || '');
        const orderId = urlParams.get('orderId') || localStorage.getItem('currentOrder');
        const demoMode = urlParams.get('demo');

        // Hỗ trợ chế độ Demo mô phỏng (Nghiệm thu)
        if (demoMode) {
            handleDemoMode(demoMode, orderId || 'BC896751187266');
            return;
        }

        if (!orderId) {
            const content = document.getElementById('result-content');
            if (content) {
                content.innerHTML = `
                    <div class="icon-large icon-error">⚠️</div>
                    <h2 style="color: #dc3545; font-weight: 800;">KHÔNG TÌM THẤY MÃ ĐƠN HÀNG</h2>
                    <p style="margin: 15px 0; color: #666;">Đường dẫn không chứa thông tin mã đơn hàng hợp lệ.</p>
                    <a href="index.html" class="btn btn-primary" style="margin-top: 15px;">VỀ TRANG CHỦ</a>
                `;
            }
            return;
        }

        pollCount = 0;

        async function doFetch() {
            pollCount++;
            try {
                const data = await API.get(`/orders/${encodeURIComponent(orderId)}/status`);
                const isFinished = renderStatusView(data, true);
                if (isFinished) {
                    stopPolling();
                }
            } catch (err) {
                console.error('Lỗi khi tải trạng thái đơn hàng:', err);
                stopPolling();

                // Requirement 4: Nếu 401 hoặc 404 -> Cho phép tra cứu bảo mật bằng mã đơn + Email/SĐT
                if (err.status === 401) {
                    renderVerificationLookup(
                        orderId,
                        'Đơn hàng này được bảo vệ. Vui lòng xác thực Email hoặc Số điện thoại bạn đã dùng khi đặt vé để xem kết quả:'
                    );
                } else if (err.status === 404) {
                    renderVerificationLookup(
                        orderId,
                        `Đơn hàng <strong>${orderId}</strong> không thuộc tài khoản đang đăng nhập (hoặc bạn đã đặt vé ở chế độ khách). Vui lòng xác nhận thông tin liên hệ:`
                    );
                } else {
                    const content = document.getElementById('result-content');
                    if (content) {
                        content.innerHTML = `
                            <div class="icon-large icon-error">⚠️</div>
                            <h2 style="color: #dc3545;">LỖI TẢI THÔNG TIN ĐƠN HÀNG</h2>
                            <p style="margin: 15px 0; color: #666;">${err.message || 'Không thể kết nối đến máy chủ.'}</p>
                            <a href="index.html" class="btn btn-primary" style="margin-top: 15px;">VỀ TRANG CHỦ</a>
                        `;
                    }
                }
            }
        }

        // Lần gọi đầu tiên
        await doFetch();

        // Khởi tạo polling nếu đơn cần tiếp tục kiểm tra
        if (!pollInterval) {
            pollInterval = setInterval(doFetch, POLL_INTERVAL_MS);
        }
    }

    window.restartPolling = function() {
        pollCount = 0;
        initResult();
    };

    // Hàm mô phỏng Demo phục vụ Nghiệm thu
    function handleDemoMode(mode, orderId) {
        stopPolling();
        const now = new Date().toISOString();
        const baseOrder = {
            orderId: orderId,
            amount: 150000,
            amountTotal: 150000,
            paymentMethod: 'ATM',
            customer_email: 'khachhang@gmail.com',
            timeline: [
                { id: 1, fromStatus: null, toStatus: 'HOLDING', reason: 'Chọn ghế', actorType: 'USER', at: now }
            ]
        };

        switch (mode.toLowerCase()) {
            case 'paid':
                renderStatusView({
                    ...baseOrder,
                    status: 'PAID',
                    paymentMethod: 'ATM',
                    ticket: {
                        ticket_id: 'CS' + orderId.substring(2, 10),
                        status: 'VALID',
                        qr_payload: 'TICKET_BETA_' + orderId,
                        issued_at: now
                    },
                    timeline: [
                        { id: 3, fromStatus: 'AWAITING_PAYMENT', toStatus: 'PAID', reason: 'Cổng thanh toán xác nhận thành công', actorType: 'GATEWAY', at: now },
                        { id: 2, fromStatus: 'HOLDING', toStatus: 'AWAITING_PAYMENT', reason: 'Khởi tạo thanh toán VNPay', actorType: 'USER', at: now },
                        ...baseOrder.timeline
                    ]
                });
                break;

            case 'pending_verify':
                pollCount = MAX_POLL_COUNT; // Hiển thị chế độ chờ lâu với hướng dẫn đối soát
                renderStatusView({
                    ...baseOrder,
                    status: 'PENDING_VERIFY',
                    paymentMethod: 'QR',
                    timeline: [
                        { id: 3, fromStatus: 'AWAITING_PAYMENT', toStatus: 'PENDING_VERIFY', reason: 'Chờ đối soát tự động từ cổng', actorType: 'SYSTEM', at: now },
                        { id: 2, fromStatus: 'HOLDING', toStatus: 'AWAITING_PAYMENT', reason: 'Khởi tạo thanh toán VNPay', actorType: 'USER', at: now },
                        ...baseOrder.timeline
                    ]
                });
                break;

            case 'failed':
                renderStatusView({
                    ...baseOrder,
                    status: 'FAILED',
                    paymentMethod: 'INTL_CARD',
                    timeline: [
                        { id: 3, fromStatus: 'AWAITING_PAYMENT', toStatus: 'FAILED', reason: 'Thẻ không đủ số dư hoặc bị từ chối', actorType: 'GATEWAY', at: now },
                        { id: 2, fromStatus: 'HOLDING', toStatus: 'AWAITING_PAYMENT', reason: 'Khởi tạo thanh toán', actorType: 'USER', at: now },
                        ...baseOrder.timeline
                    ]
                });
                break;

            case 'expired':
                renderStatusView({
                    ...baseOrder,
                    status: 'EXPIRED',
                    paymentMethod: 'ATM',
                    timeline: [
                        { id: 2, fromStatus: 'HOLDING', toStatus: 'EXPIRED', reason: 'Quá thời gian giữ chỗ 5 phút', actorType: 'SCHEDULER', at: now },
                        ...baseOrder.timeline
                    ]
                });
                break;

            case 'refund_pending':
                renderStatusView({
                    ...baseOrder,
                    status: 'REFUND_PENDING',
                    paymentMethod: 'ATM',
                    estimatedRefundTime: 'trong vòng 7 ngày làm việc',
                    refund: {
                        refundId: 'RF' + orderId.substring(2, 10),
                        amount: 150000,
                        status: 'CHECKING',
                        detectedAt: now
                    },
                    timeline: [
                        { id: 4, fromStatus: 'FAILED', toStatus: 'REFUND_PENDING', reason: 'Phát hiện tiền về muộn, lập lệnh hoàn', actorType: 'SYSTEM', at: now },
                        { id: 3, fromStatus: 'AWAITING_PAYMENT', toStatus: 'FAILED', reason: 'Hết thời gian chờ phản hồi', actorType: 'SCHEDULER', at: now },
                        ...baseOrder.timeline
                    ]
                });
                break;

            case 'refunded':
                renderStatusView({
                    ...baseOrder,
                    status: 'REFUNDED',
                    paymentMethod: 'INTL_CARD',
                    estimatedRefundTime: 'trong vòng 30 ngày làm việc',
                    refund: {
                        refundId: 'RF' + orderId.substring(2, 10),
                        amount: 150000,
                        status: 'COMPLETED',
                        completedAt: now
                    },
                    timeline: [
                        { id: 5, fromStatus: 'REFUND_PENDING', toStatus: 'REFUNDED', reason: 'Cổng thanh toán xác nhận hoàn tiền thành công', actorType: 'GATEWAY', at: now },
                        { id: 4, fromStatus: 'FAILED', toStatus: 'REFUND_PENDING', reason: 'Lập lệnh hoàn tiền', actorType: 'SYSTEM', at: now },
                        ...baseOrder.timeline
                    ]
                });
                break;

            case 'lookup':
            case 'guest':
                renderVerificationLookup(orderId, 'Mô phỏng: Bạn chưa đăng nhập hoặc không phải chính chủ đơn. Vui lòng xác thực Email hoặc Số điện thoại:');
                break;

            default:
                initResult();
                break;
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        initResult();
    });
})();
