// js/my-orders.js - Quản lý trang Lịch sử giao dịch

(function() {
    const STATUS_MAP = {
        HOLDING: { text: 'Đang giữ chỗ', class: 'badge-HOLDING' },
        AWAITING_PAYMENT: { text: 'Chờ thanh toán', class: 'badge-AWAITING_PAYMENT' },
        PENDING_VERIFY: { text: 'Đang xác minh', class: 'badge-PENDING_VERIFY' },
        PAID: { text: 'Đã có vé', class: 'badge-PAID' },
        FAILED: { text: 'Thất bại', class: 'badge-FAILED' },
        EXPIRED: { text: 'Hết hạn', class: 'badge-EXPIRED' },
        REFUND_PENDING: { text: 'Đang hoàn tiền', class: 'badge-REFUND_PENDING' },
        REFUNDED: { text: 'Đã hoàn xong', class: 'badge-REFUNDED' },
    };

    function formatMoney(amount) {
        if (amount === null || amount === undefined) return '0 ₫';
        return Number(amount).toLocaleString('vi-VN') + ' ₫';
    }

    async function loadOrders() {
        const loadingEl = document.getElementById('orders-loading');
        const emptyEl = document.getElementById('orders-empty');
        const tableWrapper = document.getElementById('orders-table-wrapper');
        const tbody = document.getElementById('orders-tbody');

        try {
            const orders = await API.get('/orders');

            if (loadingEl) loadingEl.style.display = 'none';

            if (!orders || orders.length === 0) {
                if (emptyEl) emptyEl.style.display = 'block';
                return;
            }

            if (tableWrapper) tableWrapper.style.display = 'block';
            if (!tbody) return;

            tbody.innerHTML = orders.map((o) => {
                const st = STATUS_MAP[o.status] || { text: o.status, class: 'badge-HOLDING' };
                const createdDate = new Date(o.createdAt).toLocaleString('vi-VN');

                let claimBadge = '';
                if (o.remainingClaimMinutes > 0) {
                    claimBadge = `<span class="claim-badge claim-valid">⏰ Còn ${o.remainingClaimMinutes} phút</span>`;
                } else {
                    claimBadge = `<span class="claim-badge claim-expired">Đã quá hạn 60p</span>`;
                }

                return `
                    <tr>
                        <td>
                            <strong>${o.orderId}</strong>
                        </td>
                        <td>${createdDate}</td>
                        <td><strong>${formatMoney(o.amountTotal)}</strong></td>
                        <td>
                            <span class="badge-status ${st.class}">${st.text}</span>
                        </td>
                        <td>
                            ${claimBadge}
                        </td>
                        <td style="text-align: center; white-space: nowrap;">
                            <a href="result.html?orderId=${encodeURIComponent(o.orderId)}" class="btn-action btn-view" title="Xem chi tiết đơn hàng và vé">
                                👁️ Chi tiết vé
                            </a>
                            <a href="support.html?orderId=${encodeURIComponent(o.orderId)}&action=report" class="btn-action btn-report" title="Báo lỗi thanh toán cho đơn này">
                                ⚠️ Báo lỗi
                            </a>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            console.error('Lỗi khi tải lịch sử đơn hàng:', err);
            if (loadingEl) {
                loadingEl.innerHTML = `
                    <div style="color: #b91c1c;">
                        ❌ ${err.message || 'Không thể tải lịch sử đơn hàng. Vui lòng đăng nhập lại.'}
                        <div style="margin-top: 15px;">
                            <a href="dang-nhap.html" class="btn btn-primary" style="background: #03599d; color: white; padding: 8px 16px; border-radius: 4px; text-decoration: none;">
                                ĐĂNG NHẬP
                            </a>
                        </div>
                    </div>
                `;
            }
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        loadOrders();
    });
})();
