// js/booking.js
(function() {
    let bookingTimer = null;
    let selectedSeats = [];
    const SINGLE_PRICE = 68000;
    const VIP_PRICE = 75000;
    const DOUBLE_PRICE = 145000;

    function renderBookingSeatMap() {
        const movieId = localStorage.getItem('selectedBookingMovieId') || 'm2';
        const cinemaName = localStorage.getItem('selectedBookingCinema') || 'Beta Thanh Xuân';
        const showDate = localStorage.getItem('selectedBookingDate') || '05/10/2026';
        const showTime = localStorage.getItem('selectedBookingTime') || '15:45';

        let m = null;
        if (typeof DemoData !== 'undefined' && DemoData.movies) {
            m = DemoData.movies.find(x => x.id === movieId) || DemoData.movies[0];
        }
        const movieTitle = m ? m.title : "Avengers: Hồi Kết - Phiên Bản Đặc Biệt A";

        const elBc = document.getElementById('bk-movie-name-bc');
        if (elBc) elBc.innerText = movieTitle;
        const elTitle = document.getElementById('bk-movie-title');
        if (elTitle) elTitle.innerText = movieTitle;
        const elCinema = document.getElementById('bk-cinema');
        if (elCinema) elCinema.innerText = cinemaName;
        const elDate = document.getElementById('bk-date');
        if (elDate) elDate.innerText = showDate;
        const elTime = document.getElementById('bk-time');
        if (elTime) elTime.innerText = showTime;

        if (m) {
            const elPoster = document.getElementById('bk-poster');
            if (elPoster) elPoster.src = m.imageUrl || 'https://placehold.co/150x220';
            const elGenres = document.getElementById('bk-genres');
            if (elGenres) elGenres.innerText = (m.genres || []).join(', ');
            const elDuration = document.getElementById('bk-duration');
            if (elDuration) elDuration.innerText = (m.duration || 120) + ' phút';
            const elBadge = document.getElementById('bk-age-badge');
            if (elBadge) {
                elBadge.innerText = m.ageRating || 'P';
                elBadge.className = 'mg-age age-' + (m.ageRating || 'p').toLowerCase();
            }
            const elWarning = document.getElementById('bk-warning');
            if (elWarning) {
                let ageNum = '13';
                if (m.ageRating === 'T18') ageNum = '18';
                else if (m.ageRating === 'T16') ageNum = '16';
                elWarning.innerText = 'Theo quy định của cục điện ảnh, phim này không dành cho khán giả dưới ' + ageNum + ' tuổi.';
            }
        }

        // Render seat map
        const seatMapEl = document.getElementById('bk-seat-map');
        if (!seatMapEl) return;
        seatMapEl.innerHTML = '';
        selectedSeats = [];
        updateSummary();

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
                    btn.type = 'button';
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
                    
                    btn.addEventListener('click', () => toggleSeat(btn));
                    rowEl.appendChild(btn);
                }
            }
            seatMapEl.appendChild(rowEl);
        });

        // Timer
        if (bookingTimer) clearInterval(bookingTimer);
        let timeLeft = 10 * 60;
        const countdownEl = document.getElementById('bk-countdown-val');
        if (countdownEl) {
            countdownEl.innerText = '10:00';
            bookingTimer = setInterval(() => {
                timeLeft--;
                if (timeLeft < 0) {
                    clearInterval(bookingTimer);
                    alert("Hết thời gian giữ ghế. Vui lòng đặt lại!");
                    if (window.spaNavigate) window.spaNavigate('home');
                    else window.location.hash = '#home';
                    return;
                }
                const m = Math.floor(timeLeft / 60);
                const s = timeLeft % 60;
                countdownEl.innerText = `${m}:${s.toString().padStart(2, '0')}`;
            }, 1000);
        }
    }

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
        const seatLabelEl = document.getElementById('bk-seats-selected');
        if (seatLabelEl) seatLabelEl.innerText = labels || 'Chưa chọn ghế';
        
        const total = selectedSeats.reduce((sum, s) => sum + s.price, 0);
        const totalEl = document.getElementById('bk-total-val');
        if (totalEl) totalEl.innerText = total.toLocaleString('vi-VN') + ' vnđ';
    }

    // Gắn sự kiện submit
    function initSubmitBtn() {
        const submitBtn = document.getElementById('bk-submit-btn');
        if (!submitBtn || submitBtn.dataset.bound) return;
        submitBtn.dataset.bound = 'true';

        submitBtn.addEventListener('click', () => {
            if (selectedSeats.length === 0) {
                alert("Vui lòng chọn ít nhất 1 ghế!");
                return;
            }

            const activeMovieId = localStorage.getItem('selectedBookingMovieId') || 'm2';
            const orderId = (typeof DB !== 'undefined' && DB.generateId) ? DB.generateId.order() : 'BC' + Math.random().toString(36).substring(2, 10).toUpperCase();
            const seatLabels = selectedSeats.map(s => s.label);
            const totalAmount = selectedSeats.reduce((sum, s) => sum + s.price, 0);

            const orderData = {
                orderId: orderId,
                userId: 1,
                movieId: activeMovieId,
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
            if (window.spaNavigate) window.spaNavigate('checkout');
            else window.location.hash = '#checkout';
        });
    }

    window.renderBookingSeatMap = renderBookingSeatMap;

    document.addEventListener('DOMContentLoaded', () => {
        initSubmitBtn();
        renderBookingSeatMap();
    });
})();
