// js/checkout.js

document.addEventListener('DOMContentLoaded', () => {
    // 1. Khởi tạo DB nếu cần
    if (typeof DB !== 'undefined') DB.seed();
    
    // Đảm bảo combos mới nhất luôn được lưu
    if (typeof DemoData !== 'undefined' && DemoData.combos) {
        localStorage.setItem('combos', JSON.stringify(DemoData.combos));
    }

    // 2. Lấy đơn hàng hiện tại hoặc tạo dữ liệu mẫu khớp với Ảnh 1
    const urlParams = new URLSearchParams(window.location.search);
    let orderId = urlParams.get('orderId') || localStorage.getItem('currentOrder') || 'BC896751187266';
    
    let order = (typeof DB !== 'undefined') ? DB.get('beta_orders', orderId) : null;
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

    // 3. Thông tin phim & rạp (Mặc định khớp chuẩn với Ảnh 1)
    let m = (typeof DB !== 'undefined') ? DB.get('movies', order.movieId || 'm1') : null;
    if (!m && typeof DemoData !== 'undefined' && DemoData.movies) {
        m = DemoData.movies.find(x => x.id === order.movieId || x.id === 'm1');
    }
    if (!m) {
        m = {
            id: 'm1',
            title: 'Trại Buồn Người',
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
    const cinemaName = (c && c.name) ? c.name : 'Beta Thanh Xuân';

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
    if (sbDate) sbDate.innerText = '08/10/2026';

    const sbTime = document.getElementById('sb-time');
    if (sbTime) sbTime.innerText = '21:30';

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
    const seatPrice = order.seatUnitPrice || 50000;
    const seatCount = (order.seats && order.seats.length > 0) ? order.seats.length : 1;
    const seatAmount = seatCount * seatPrice;

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

    // 9. Xử lý Modal Điều khoản thanh toán (Ảnh 4)
    window.openTncModal = function() {
        const modal = document.getElementById('tnc-modal');
        if (modal) {
            modal.style.display = 'flex';
            const checkbox = document.getElementById('tnc-agree');
            if (checkbox) checkbox.checked = true; // Mặc định tích như Ảnh 4
        }
    };

    window.closeTncModal = function() {
        const modal = document.getElementById('tnc-modal');
        if (modal) modal.style.display = 'none';
    };

    // Đóng modal khi click ra ngoài hộp thoại
    window.onclick = function(event) {
        const modal = document.getElementById('tnc-modal');
        if (event.target === modal) {
            closeTncModal();
        }
    };

    // 10. Tiến hành thanh toán sau khi xác nhận điều khoản (Ảnh 5)
    window.proceedPayment = function() {
        const checkbox = document.getElementById('tnc-agree');
        if (checkbox && !checkbox.checked) {
            alert('Vui lòng đồng ý với điều khoản sử dụng và mua vé cho người có độ tuổi phù hợp!');
            return;
        }

        closeTncModal();

        // Lấy phương thức thanh toán đã chọn
        const paymentRadio = document.querySelector('input[name="payment_method"]:checked');
        const method = paymentRadio ? paymentRadio.value : 'QR';

        const txnId = (typeof DB !== 'undefined' && DB.generateId) 
            ? DB.generateId.txn() 
            : 'GW' + Math.random().toString(36).substring(2, 12).toUpperCase();

        if (typeof DB !== 'undefined') {
            DB.insert('gateway_txns', {
                txnId: txnId,
                orderId: order.orderId,
                method: method,
                amount: order.amount,
                status: 'PENDING',
                debited: false,
                callback: null,
                createdAt: new Date().toISOString()
            });
            DB.update('beta_orders', order.orderId, { txnId: txnId, status: 'AWAITING_PAYMENT' });
        }

        // Chuyển tới màn hình Thanh toán QR (Ảnh 5)
        location.href = `gateway.html?txn=${txnId}&orderId=${order.orderId}&method=${method}`;
    };
});
