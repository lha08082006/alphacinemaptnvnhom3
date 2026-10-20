// js/combo.js
document.addEventListener('DOMContentLoaded', () => {
    const orderId = localStorage.getItem('currentOrder');
    if (!orderId) { 
        if (window.spaNavigate) window.spaNavigate('home');
        else location.href = '#home'; 
        return; 
    }
    
    let order = DB.get('beta_orders', orderId);
    if (!order) {
        // Fallback tạo order giả nếu chưa có
        order = {
            orderId: orderId,
            userId: 1,
            movieId: 'm2',
            cinemaId: 'c2',
            seats: ['C11'],
            amount: 68000,
            seatAmount: 68000,
            status: 'HOLDING',
            holdExpiresAt: new Date(Date.now() + 10 * 60000).toISOString(),
            createdAt: new Date().toISOString()
        };
        DB.insert('beta_orders', order);
    }

    // Lookup movie
    let m = DB.get('movies', order.movieId) || DB.get('movies', 'm' + order.movieId);
    if (!m && typeof DemoData !== 'undefined' && DemoData.movies) {
        m = DemoData.movies.find(x => x.id === order.movieId || x.id === 'm' + order.movieId) || DemoData.movies[0];
    }
    if (!m) {
        m = { id: 'm2', title: 'Avengers: Hồi Kết - Phiên Bản Đặc Biệt A', genres: ['Khoa học', 'Viễn tưởng'], duration: 183 };
    }
    
    const user = JSON.parse(localStorage.getItem('currentUser') || 'null');
    
    // Fill Info
    if (document.getElementById('bc-title')) document.getElementById('bc-title').innerText = m.title;
    if (document.getElementById('sb-title')) document.getElementById('sb-title').innerText = m.title;
    if (document.getElementById('sb-genres')) document.getElementById('sb-genres').innerText = Array.isArray(m.genres) ? m.genres.join(', ') : (m.genres || '');
    if (document.getElementById('sb-duration')) document.getElementById('sb-duration').innerText = (m.duration || 183) + ' phút';
    if (document.getElementById('sb-seats')) document.getElementById('sb-seats').innerText = (order.seats && order.seats.length > 0) ? order.seats.join(', ') : 'C11';
    
    // User info
    if (user) {
        if (document.getElementById('user-name')) document.getElementById('user-name').innerText = user.name || 'Khách Hàng';
        if (document.getElementById('user-email')) document.getElementById('user-email').innerText = user.email || 'khachhang@gmail.com';
        if (document.getElementById('user-phone')) document.getElementById('user-phone').innerText = user.phone || '0901234567';
    } else {
        if (document.getElementById('user-name')) document.getElementById('user-name').innerText = 'Khách Hàng';
        if (document.getElementById('user-email')) document.getElementById('user-email').innerText = 'khachhang@gmail.com';
        if (document.getElementById('user-phone')) document.getElementById('user-phone').innerText = '0901234567';
    }
    
    // Poster
    const posterEl = document.getElementById('sb-poster');
    if (posterEl) {
        if (m.imageUrl) {
            posterEl.src = m.imageUrl;
        } else {
            posterEl.src = `https://via.placeholder.com/300x450/1976d2/ffffff?text=${encodeURIComponent(m.title)}`;
        }
    }

    // Seat Calculation
    const seatAmount = order.seatAmount || order.amount || (order.seats ? order.seats.length * 68000 : 68000);
    const seatCount = (order.seats && order.seats.length > 0) ? order.seats.length : 1;
    const unitPrice = Math.round(seatAmount / seatCount);
    
    const seatCalcEl = document.getElementById('seat-summary-calc');
    if (seatCalcEl) {
        seatCalcEl.innerText = `${seatCount} x ${unitPrice.toLocaleString('vi-VN')} = ${seatAmount.toLocaleString('vi-VN')} vnđ`;
    }
    
    // Render Combos
    let combos = DB.all('combos');
    if (!combos || combos.length === 0) {
        combos = (typeof DemoData !== 'undefined' && DemoData.combos) ? DemoData.combos : [];
    }
    
    const tbody = document.getElementById('combo-list');
    const selectedCombos = {};
    
    if (tbody) {
        tbody.innerHTML = '';
        combos.forEach(c => {
            selectedCombos[c.id] = 0;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td width="120" style="text-align: center;">
                    <div style="width: 60px; height: 60px; border-radius: 50%; overflow: hidden; margin: 0 auto; background: #eee; display: flex; align-items: center; justify-content: center;">
                        ${c.img && c.img.startsWith('http') ? `<img src="${c.img}" style="width: 100%; height: 100%; object-fit: cover;">` : c.name.substring(0, 2)}
                    </div>
                </td>
                <td style="font-weight:bold; color:#333; font-size:14px; width: 250px;">
                    ${c.name}
                </td>
                <td style="font-size:13px; color:#666; text-align: left; padding-right: 20px;">
                    ${c.desc}
                </td>
                <td width="120">
                    <div style="display: flex; align-items: center; justify-content: center; border: 1px solid #ccc; border-radius: 20px; width: 80px; height: 30px; margin: 0 auto;">
                        <button style="background: none; border: none; font-size: 18px; cursor: pointer; color: #555; padding: 0 10px;" onclick="updateCombo('${c.id}', -1)">-</button>
                        <div id="qty-${c.id}" style="font-size: 14px; font-weight: bold; width: 20px; text-align: center;">0</div>
                        <button style="background: none; border: none; font-size: 18px; cursor: pointer; color: #03599d; padding: 0 10px;" onclick="updateCombo('${c.id}', 1)">+</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
    
    let comboTotal = 0;
    
    window.updateCombo = function(id, delta) {
        let current = selectedCombos[id] || 0;
        if (current + delta < 0) return;
        selectedCombos[id] = current + delta;
        const qEl = document.getElementById(`qty-${id}`);
        if (qEl) qEl.innerText = selectedCombos[id];
        
        calcTotal();
    }
    
    function calcTotal() {
        comboTotal = 0;
        combos.forEach(c => {
            comboTotal += (selectedCombos[c.id] || 0) * c.price;
        });
        const finalAmount = seatAmount + comboTotal;
        
        const sumTotalEl = document.getElementById('sum-total');
        if (sumTotalEl) sumTotalEl.innerText = finalAmount.toLocaleString('vi-VN') + ' vnđ';
        
        const sumFinalEl = document.getElementById('sum-final');
        if (sumFinalEl) sumFinalEl.innerText = finalAmount.toLocaleString('vi-VN') + ' vnđ';
        
        const lblTotalEl = document.getElementById('lbl-total');
        if (lblTotalEl) lblTotalEl.innerText = finalAmount.toLocaleString('vi-VN') + ' vnđ';
        
        order.amount = finalAmount;
        DB.update('beta_orders', order.orderId, { amount: finalAmount });
    }
    
    calcTotal(); // Init
    
    window.doCheckout = function() {
        const modal = document.getElementById('tnc-modal');
        if (modal) {
            modal.style.display = 'flex';
            const agreeBox = document.getElementById('tnc-agree');
            if (agreeBox) agreeBox.checked = false;
        } else {
            confirmPayment();
        }
    };
    
    window.confirmPayment = function() {
        const agreeBox = document.getElementById('tnc-agree');
        if (agreeBox && !agreeBox.checked) {
            alert('Vui lòng đồng ý với điều khoản sử dụng và mua vé cho người có độ tuổi phù hợp!');
            return;
        }
        
        const modal = document.getElementById('tnc-modal');
        if (modal) modal.style.display = 'none';
        
        const methodRadio = document.querySelector('input[name="payment"]:checked');
        const method = methodRadio ? methodRadio.value : 'QR';
        
        if (window.betaCore) {
            window.betaCore.startPayment(order.orderId, method);
        } else {
            const txnId = (typeof DB !== 'undefined' && DB.generateId) ? DB.generateId.txn() : 'GW' + Math.random().toString(36).substring(2, 12).toUpperCase();
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
            if (window.spaNavigate) window.spaNavigate('gateway', `txn=${txnId}`);
            else location.href = `#gateway?txn=${txnId}`;
        }
    };
});
