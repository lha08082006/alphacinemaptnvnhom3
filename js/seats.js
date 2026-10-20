// js/seats.js
document.addEventListener('DOMContentLoaded', () => {
    // Demo: Fixed values
    const movieId = 1;
    const m = DB.get('movies', movieId);
    
    // Fill Sidebar
    document.getElementById('bc-title').innerText = m.title;
    document.getElementById('sb-title').innerText = m.title;
    document.getElementById('sb-genres').innerText = m.genres.join(', ');
    document.getElementById('sb-duration').innerText = m.duration + ' phút';
    
    // Màu Random cho poster
    const colors = ['1976d2', '388e3c', 'd32f2f', 'f57c00', '7b1fa2'];
    const color = colors[m.id % colors.length];
    document.getElementById('sb-poster').src = `https://via.placeholder.com/300x450/${color}/ffffff?text=${encodeURIComponent(m.title)}`;
    
    let ageNotice = document.getElementById('age-notice');
    if(m.ageRating === 'T18') {
        ageNotice.innerText = 'Theo quy định của cục điện ảnh, phim này không dành cho khán giả dưới 18 tuổi.';
        ageNotice.style.background = '#ffcc80'; ageNotice.style.color = '#e65100';
    } else if(m.ageRating === 'P') {
        ageNotice.innerText = 'Phim phổ biến đến mọi đối tượng khán giả.';
        ageNotice.style.background = '#c8e6c9'; ageNotice.style.color = '#2e7d32';
    } else {
        ageNotice.innerText = `Phim dành cho khán giả từ ${m.ageRating.substring(1)} tuổi trở lên.`;
    }
    
    const rows = ['A','B','C','D','E','F','G','H','I','J','K'];
    const cols = 14;
    const mapEl = document.getElementById('seat-map');
    
    let selected = [];
    
    // Đếm ngược 10 phút giữ lượt chọn ghế
    let seatTimeLeft = 600;
    const timerEl = document.getElementById('timer');
    if (timerEl) {
        timerEl.innerText = '10:00';
        setInterval(() => {
            if (seatTimeLeft > 0) {
                seatTimeLeft--;
                const m = Math.floor(seatTimeLeft / 60).toString().padStart(2, '0');
                const s = (seatTimeLeft % 60).toString().padStart(2, '0');
                timerEl.innerText = `${m}:${s}`;
                if (seatTimeLeft <= 60) timerEl.style.color = 'red';
            }
        }, 1000);
    }
    
    // Build Map
    rows.forEach((r, idx) => {
        const rowEl = document.createElement('div');
        rowEl.className = 'seat-row';
        
        // Thêm khoảng lùi hai bên cho các hàng để tạo độ cong nhẹ
        let margin = Math.abs(5 - idx) * 10; 
        rowEl.style.padding = `0 ${margin}px`;

        for(let c=1; c<=cols; c++) {
            // Hàng L là ghế đôi (chỉ có 7 ghế đôi)
            if(r === 'L' && c > cols/2) continue;
            
            const seatId = r + c;
            const el = document.createElement('div');
            el.className = 'seat';
            el.innerText = seatId;
            el.dataset.id = seatId;
            
            if(r === 'L') {
                el.className += ' double';
                el.innerText = `L${c*2-1} - L${c*2}`;
            }
            
            // Randomly mark some as sold or holding for visual
            if (Math.random() < 0.1) el.classList.add('sold');
            else if (Math.random() < 0.05) el.classList.add('holding');
            
            el.onclick = () => {
                if(el.classList.contains('sold') || el.classList.contains('holding')) return;
                
                if(el.classList.contains('selected')) {
                    el.classList.remove('selected');
                    selected = selected.filter(s => s !== seatId);
                } else {
                    if(selected.length >= 8) {
                        alert('Chỉ được chọn tối đa 8 ghế!');
                        return;
                    }
                    el.classList.add('selected');
                    selected.push(seatId);
                }
                updateSummary();
            }
            rowEl.appendChild(el);
        }
        mapEl.appendChild(rowEl);
    });

    // Thêm Hàng L cuối cùng (Ghế Đôi)
    const rowL = document.createElement('div');
    rowL.className = 'seat-row';
    for(let c=1; c<=7; c++) {
        const seatId = 'L' + c;
        const el = document.createElement('div');
        el.className = 'seat double';
        el.innerText = `L${c*2-1} - L${c*2}`;
        el.dataset.id = seatId;
        
        el.onclick = () => {
            if(el.classList.contains('selected')) {
                el.classList.remove('selected');
                selected = selected.filter(s => s !== seatId);
            } else {
                if(selected.length >= 8) { alert('Chỉ được chọn tối đa 8 ghế!'); return; }
                el.classList.add('selected');
                selected.push(seatId);
            }
            updateSummary();
        }
        rowL.appendChild(el);
    }
    mapEl.appendChild(rowL);
    
    function updateSummary() {
        document.getElementById('sb-seats').innerText = selected.length > 0 ? selected.join(', ') : '...';
        document.getElementById('lbl-total').innerText = (selected.length * 80000).toLocaleString() + ' đ';
    }
    
    window.nextStep = function() {
        if(selected.length === 0) {
            alert('Vui lòng chọn ít nhất 1 ghế!');
            return;
        }
        
        // Tạo Draft Order
        const orderId = DB.generateId.order();
        DB.insert('beta_orders', {
            orderId: orderId,
            userId: 1,
            movieId: 1,
            seats: selected,
            amount: selected.length * 80000,
            status: 'HOLDING',
            holdExpiresAt: VirtualClock.now(10 * 60 * 1000).toISOString(),
            createdAt: VirtualClock.now().toISOString()
        });
        
        localStorage.setItem('currentOrder', orderId);
        if (window.spaNavigate) window.spaNavigate('checkout');
        else location.href = '#checkout';
    }
});
