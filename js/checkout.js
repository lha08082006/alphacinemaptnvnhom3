// js/checkout.js

(function() {
    let order = null;

    function initCheckout() {
        // 1. Khởi tạo DB nếu cần
        if (typeof DB !== 'undefined') DB.seed();
        
        // Đảm bảo combos mới nhất luôn được lưu
        if (typeof DemoData !== 'undefined' && DemoData.combos) {
            localStorage.setItem('combos', JSON.stringify(DemoData.combos));
        }

        // 2. Lấy đơn hàng hiện tại hoặc tạo dữ liệu mẫu khớp với Ảnh 1
        const urlParams = new URLSearchParams(window.location.search || window.location.hash.split('?')[1] || '');
        let orderId = urlParams.get('orderId') || localStorage.getItem('currentOrder') || 'BC896751187266';
        
        order = (typeof DB !== 'undefined') ? DB.get('beta_orders', orderId) : null;
        if (!order) {
            order = {
                orderId: orderId,
                movieId: 'm1',
                cinemaId: 'c2',
                showtimeId: 'ST1',
                seats: ['J1'],
                seatType: 'VIP',
                seatUnitPrice: 50000,
                amount: 50000,
                combos: [],
                status: 'HOLDING',
                holdExpiresAt: (typeof VirtualClock !== 'undefined') ? VirtualClock.now(10 * 60 * 1000).toISOString() : new Date(Date.now() + 10 * 60 * 1000).toISOString(),
                createdAt: new Date().toISOString()
            };
            if (typeof DB !== 'undefined') DB.insert('beta_orders', order);
            localStorage.setItem('currentOrder', orderId);
        }
        window.currentOrder = order;

        // 3. Thông tin phim & rạp
        let m = (typeof DB !== 'undefined') ? DB.get('movies', order.movieId || 'm1') : null;
        if (!m && typeof DemoData !== 'undefined' && DemoData.movies) {
            m = DemoData.movies.find(x => x.id === order.movieId || x.id === 'm1');
        }
        if (!m) {
            m = {
                id: 'm1',
                title: 'Trại Buôn Người',
                genres: ['Hành động', 'Tâm lý'],
                duration: 135,
                ageRating: 'T18',
                imageUrl: 'https://files.betacorp.vn/media/images/2026/09/15/official-poster-trai-buon-nguoi-final-142318-150926-62.jpg'
            };
        }

        let c = (typeof DB !== 'undefined') ? DB.get('cinemas', order.cinemaId || 'c2') : null;
        if (!c && typeof DemoData !== 'undefined' && DemoData.cinemas) {
            c = DemoData.cinemas.find(x => x.id === order.cinemaId || x.id === 'c2');
        }
        const cinemaName = localStorage.getItem('selectedBookingCinema') || ((c && c.name) ? c.name : 'Beta Thanh Xuân');

        // 4. Cập nhật Sidebar và Breadcrumb
        const bcTitle = document.getElementById('bc-title');
        if (bcTitle) bcTitle.innerText = m.title;

        const sbTitle = document.getElementById('sb-title');
        if (sbTitle) sbTitle.innerText = m.title;

        const sbAge = document.getElementById('sb-age-rating');
        if (sbAge) sbAge.innerText = m.ageRating || 'T18';

        const sbGenres = document.getElementById('sb-genres');
        if (sbGenres) sbGenres.innerText = Array.isArray(m.genres) ? m.genres.join(', ') : (m.genres || 'Hành động, Tâm lý');

        const sbDuration = document.getElementById('sb-duration');
        if (sbDuration) sbDuration.innerText = (m.duration || 135) + ' phút';

        const sbCinema = document.getElementById('sb-cinema');
        if (sbCinema) sbCinema.innerText = cinemaName;

        const sbDate = document.getElementById('sb-date');
        if (sbDate) sbDate.innerText = localStorage.getItem('selectedBookingDate') || '08/10/2026';

        const sbTime = document.getElementById('sb-time');
        if (sbTime) sbTime.innerText = localStorage.getItem('selectedBookingTime') || '21:30';

        const sbSeats = document.getElementById('sb-seats');
        const seatsList = (order.seats && order.seats.length > 0) ? order.seats.join(', ') : 'J1';
        if (sbSeats) sbSeats.innerText = seatsList;

        const sbPoster = document.getElementById('sb-poster');
        if (sbPoster && m.imageUrl) sbPoster.src = m.imageUrl;

        // 5. Thông tin khách hàng
        const user = JSON.parse(localStorage.getItem('currentUser') || 'null');
        const uName = (user && user.name) ? user.name : '— luonghonganh';
        const uEmail = (user && user.email) ? user.email : '[email protected]';
        const uPhone = (user && user.phone) ? user.phone : '';

        const userNameEl = document.getElementById('user-name');
        if (userNameEl) userNameEl.innerText = uName;

        const userEmailEl = document.getElementById('user-email');
        if (userEmailEl) userEmailEl.innerText = uEmail;

        const userPhoneEl = document.getElementById('user-phone');
        if (userPhoneEl) userPhoneEl.innerText = uPhone;

        // 6. Tính toán giá ghế
        const seatCount = (order.seats && order.seats.length > 0) ? order.seats.length : 1;
        const seatAmount = (order.seatAmount !== undefined) ? order.seatAmount : ((order.seatUnitPrice || 50000) * seatCount);
        const seatPrice = Math.round(seatAmount / seatCount);

        const seatQtyEl = document.getElementById('seat-summary-qty');
        if (seatQtyEl) seatQtyEl.innerText = `${seatCount} x ${seatPrice.toLocaleString('vi-VN')}`;

        const seatTotalEl = document.getElementById('seat-summary-total');
        if (seatTotalEl) seatTotalEl.innerText = `= ${seatAmount.toLocaleString('vi-VN')} vnđ`;

        // 7. Render danh sách 7 Combo (Ảnh 1 & 2)
        let combos = (typeof DB !== 'undefined') ? DB.all('combos') : [];
        if (!combos || combos.length === 0) {
            combos = (typeof DemoData !== 'undefined' && DemoData.combos) ? DemoData.combos : [];
        }

        const tbody = document.getElementById('combo-list');
        const selectedCombos = {};

        if (tbody) {
            tbody.innerHTML = '';
            combos.forEach(cb => {
                selectedCombos[cb.id] = 0;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td width="105" style="text-align: center;">
                        <div class="combo-img-wrap">
                            <img src="${cb.img}" alt="${cb.name}" onerror="this.src='images/combos/beta-combo.svg'">
                        </div>
                    </td>
                    <td style="font-weight:bold; color:#222; font-size:14px; width: 235px;">
                        ${cb.name}
                    </td>
                    <td class="combo-desc">
                        ${cb.desc}
                    </td>
                    <td width="130">
                        <div class="qty-control">
                            <div class="qty-val" id="qty-${cb.id}">0</div>
                            <button type="button" class="qty-btn plus" onclick="updateCombo('${cb.id}', 1)">+</button>
                            <button type="button" class="qty-btn minus" onclick="updateCombo('${cb.id}', -1)">-</button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        // 8. Hàm cập nhật combo & tính tổng tiền
        window.updateCombo = function(id, delta) {
            let current = selectedCombos[id] || 0;
            if (current + delta < 0) return;
            selectedCombos[id] = current + delta;
            const qEl = document.getElementById(`qty-${id}`);
            if (qEl) qEl.innerText = selectedCombos[id];
            
            calcTotal();
        };

        function calcTotal() {
            let comboTotal = 0;
            const selectedList = [];
            combos.forEach(c => {
                const q = selectedCombos[c.id] || 0;
                if (q > 0) {
                    comboTotal += q * c.price;
                    selectedList.push({ id: c.id, name: c.name, price: c.price, qty: q });
                }
            });
            const finalAmount = seatAmount + comboTotal;

            const sumTotalEl = document.getElementById('sum-total');
            if (sumTotalEl) sumTotalEl.innerText = finalAmount.toLocaleString('vi-VN') + ' vnđ';

            const sumFinalEl = document.getElementById('sum-final');
            if (sumFinalEl) sumFinalEl.innerText = finalAmount.toLocaleString('vi-VN') + ' vnđ';

            if (order) {
                order.amount = finalAmount;
                order.combos = selectedList;
                if (typeof DB !== 'undefined') {
                    DB.update('beta_orders', order.orderId, { amount: finalAmount, combos: selectedList });
                }
            }
        }

        calcTotal(); // Khởi tạo tổng tiền
    }

    // Modal điều khoản
    window.openTncModal = function() {
        const modal = document.getElementById('tnc-modal');
        if (modal) {
            modal.style.display = 'flex';
            const checkbox = document.getElementById('tnc-agree');
            if (checkbox) checkbox.checked = true;
        }
    };

    window.closeTncModal = function() {
        const modal = document.getElementById('tnc-modal');
        if (modal) modal.style.display = 'none';
    };

    window.onclick = function(event) {
        const modal = document.getElementById('tnc-modal');
        if (event.target === modal) {
            closeTncModal();
        }
    };

    // 10. Tiến hành thanh toán sau khi xác nhận điều khoản (BR-11)
    window.proceedPayment = async function() {
        const checkbox = document.getElementById('tnc-agree');
        if (checkbox && !checkbox.checked) {
            alert('Vui lòng đồng ý với điều khoản sử dụng và mua vé cho người có độ tuổi phù hợp!');
            return;
        }

        const submitBtn = document.querySelector('.btn-tnc-submit');
        const nextBtn = document.querySelector('.btn-sidebar-next');

        // BR-11: Khóa nút ngay sau khi bấm để chống double-click / gửi trùng
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = 'Đang chuyển tới cổng thanh toán...';
        }
        if (nextBtn) {
            nextBtn.disabled = true;
        }

        const paymentRadio = document.querySelector('input[name="payment_method"]:checked');
        const rawMethod = paymentRadio ? paymentRadio.value : 'QR';
        let method = 'WALLET';
        if (rawMethod === 'ATM') {
            method = 'ATM';
        } else if (rawMethod === 'CC' || rawMethod === 'INTL_CARD') {
            method = 'INTL_CARD';
        } else {
            method = 'WALLET';
        }

        const urlParams = new URLSearchParams(window.location.search || window.location.hash.split('?')[1] || '');
        const currentOrd = window.currentOrder || order;
        const orderId = urlParams.get('orderId') || localStorage.getItem('currentOrder') || (currentOrd && currentOrd.orderId);

        if (!orderId) {
            alert('Không tìm thấy thông tin đơn hàng!');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = 'THANH TOÁN';
            }
            if (nextBtn) nextBtn.disabled = false;
            return;
        }

        // BR-11: Sinh Idempotency-Key (8-64 ký tự hợp lệ: alphanumeric + _ -)
        let idempotencyKey = sessionStorage.getItem(`idemp_${orderId}`);
        if (!idempotencyKey) {
            idempotencyKey = 'IDEMP_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
            sessionStorage.setItem(`idemp_${orderId}`, idempotencyKey);
        }

        try {
            if (typeof API === 'undefined' || !API.post) {
                throw new Error('Module kết nối máy chủ API chưa sẵn sàng. Vui lòng tải lại trang.');
            }

            const res = await API.post(
                '/payments',
                { orderId, method },
                { 'Idempotency-Key': idempotencyKey }
            );

            if (res && res.paymentUrl) {
                window.location.href = res.paymentUrl;
            } else {
                throw new Error('Không nhận được đường dẫn thanh toán từ máy chủ.');
            }
        } catch (err) {
            console.error('Lỗi khởi tạo thanh toán:', err);
            alert(err.message || 'Khởi tạo thanh toán thất bại. Vui lòng thử lại!');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = 'THANH TOÁN';
            }
            if (nextBtn) nextBtn.disabled = false;
        }
    };

    window.checkoutController = { init: initCheckout };

    document.addEventListener('DOMContentLoaded', () => {
        initCheckout();
    });
})();
