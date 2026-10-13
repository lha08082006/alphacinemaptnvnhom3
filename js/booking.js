// js/booking.js
document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. SET MOVIE DATA ---
    const movieName = "Avengers: Hồi Kết - Phiên Bản Đặc Biệt A";
    const cinemaName = "Beta Thanh Xuân";
    const showDate = "05/10/2026";
    const showTime = "15:45";
    
    document.getElementById('bk-movie-name-bc').innerText = movieName;
    document.getElementById('bk-movie-title').innerText = movieName;
    document.getElementById('bk-cinema').innerText = cinemaName;
    document.getElementById('bk-date').innerText = showDate;
    document.getElementById('bk-time').innerText = showTime;
    
    // Giả lập poster
    if (typeof DemoData !== 'undefined') {
        const m = DemoData.movies.find(x => x.id === 'm2') || DemoData.movies[0];
        document.getElementById('bk-poster').src = m.imageUrl || 'https://placehold.co/150x220';
        document.getElementById('bk-genres').innerText = m.genres.join(', ');
        document.getElementById('bk-duration').innerText = m.duration + ' phút';
        document.getElementById('bk-age-badge').innerText = m.ageRating;
        document.getElementById('bk-age-badge').className = 'mg-age age-' + m.ageRating.toLowerCase();
        
        // Update warning banner text
        let ageNum = '13';
        if (m.ageRating === 'T18') ageNum = '18';
        else if (m.ageRating === 'T16') ageNum = '16';
        document.getElementById('bk-warning').innerText = 'Theo quy định của cục điện ảnh, phim này không dành cho khán giả dưới ' + ageNum + ' tuổi.';
    }

    // --- 2. RENDER SEAT MAP ---
    const seatMapEl = document.getElementById('bk-seat-map');
    const layout = [
        "__sssssssssss__", 
        "_sssssssssssss_", 
        "_sssssssssssss_", 
        "___sssssssssss_", 
        "svvvvvvvvvvvvvs", 
        "svvvvvvvvvvvvvs", 
        "svvvvvvvvvvvvvs", 
        "svvvvvvvvvvvvvs", 
        "sssssssssssssss", 
        "d_d_d_d_d_d"      
    ];

    const rowLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    let selectedSeats = [];
    const SINGLE_PRICE = 68000;
    const VIP_PRICE = 75000;
    const DOUBLE_PRICE = 145000;

    layout.forEach((rowStr, rIndex) => {
        const rowEl = document.createElement('div');
        rowEl.className = 'seat-row';
        const rowLetter = rowLetters[rIndex];
        
        let seatNum = 1;
        
        for(let c = 0; c < rowStr.length; c++) {
            const char = rowStr[c];
            if (char === '_') {
                const spacer = document.createElement('div');
                spacer.className = 'seat-btn spacer';
                rowEl.appendChild(spacer);
            } else {
                const btn = document.createElement('button');
                btn.className = 'seat-btn';
                
                let seatLabel = '';
                let price = SINGLE_PRICE;
                
                if (char === 's') {
                    seatLabel = rowLetter + seatNum;
                    seatNum++;
                } else if (char === 'v') {
                    btn.classList.add('seat-vip');
                    seatLabel = rowLetter + seatNum;
                    price = VIP_PRICE;
                    seatNum++;
                } else if (char === 'd') {
                    btn.classList.add('seat-double');
                    seatLabel = `${rowLetter}${seatNum}-${rowLetter}${seatNum+1}`;
                    price = DOUBLE_PRICE;
                    seatNum += 2;
                }
                
                btn.innerText = seatLabel;
                btn.dataset.label = seatLabel;
                btn.dataset.price = price;
                
                if (Math.random() < 0.2) {
                    btn.disabled = true;
                }
                
                btn.addEventListener('click', () => toggleSeat(btn));
                
                rowEl.appendChild(btn);
            }
        }
        seatMapEl.appendChild(rowEl);
    });

    // --- 3. HANDLE SEAT SELECTION ---
    function toggleSeat(btn) {
        if (btn.disabled) return;
        
        const label = btn.dataset.label;
        const price = parseInt(btn.dataset.price);
        
        if (btn.classList.contains('selected')) {
            btn.classList.remove('selected');
            selectedSeats = selectedSeats.filter(s => s.label !== label);
        } else {
            if (selectedSeats.length >= 8) {
                alert("Bạn chỉ được chọn tối đa 8 ghế!");
                return;
            }
            btn.classList.add('selected');
            selectedSeats.push({ label, price });
        }
        updateSummary();
    }

    function updateSummary() {
        const labels = selectedSeats.map(s => s.label).join(', ');
        document.getElementById('bk-seats-selected').innerText = labels || 'Chưa chọn ghế';
        
        const total = selectedSeats.reduce((sum, s) => sum + s.price, 0);
        document.getElementById('bk-total-val').innerText = total.toLocaleString('vi-VN') + ' vnđ';
    }

    updateSummary();

    // --- 4. COUNTDOWN TIMER ---
    let timeLeft = 10 * 60; // 10 phút
    const countdownEl = document.getElementById('bk-countdown-val');
    
    const timer = setInterval(() => {
        timeLeft--;
        if (timeLeft < 0) {
            clearInterval(timer);
            alert("Hết thời gian giữ ghế. Vui lòng đặt lại!");
            window.location.href = 'index.html';
            return;
        }
        
        const m = Math.floor(timeLeft / 60);
        const s = timeLeft % 60;
        countdownEl.innerText = `${m}:${s.toString().padStart(2, '0')}`;
    }, 1000);

    // --- 5. SUBMIT BTN ---
    document.getElementById('bk-submit-btn').addEventListener('click', () => {
        if (selectedSeats.length === 0) {
            alert("Vui lòng chọn ít nhất 1 ghế!");
            return;
        }

        const orderId = (typeof DB !== 'undefined' && DB.generateId) ? DB.generateId.order() : 'BC' + Math.random().toString(36).substring(2, 10).toUpperCase();
        const seatLabels = selectedSeats.map(s => s.label);
        const totalAmount = selectedSeats.reduce((sum, s) => sum + s.price, 0);

        const orderData = {
            orderId: orderId,
            userId: 1,
            movieId: 'm2',
            cinemaId: 'c2',
            seats: seatLabels,
            amount: totalAmount,
            seatAmount: totalAmount,
            status: 'HOLDING',
            holdExpiresAt: (typeof VirtualClock !== 'undefined') ? VirtualClock.now(10 * 60 * 1000).toISOString() : new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            createdAt: (typeof VirtualClock !== 'undefined') ? VirtualClock.now().toISOString() : new Date().toISOString()
        };

        if (typeof DB !== 'undefined') {
            DB.insert('beta_orders', orderData);
        }
        localStorage.setItem('currentOrder', orderId);
        window.location.href = 'checkout.html';
    });
});
