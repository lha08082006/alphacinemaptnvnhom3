// js/booking.js
'use strict';

(function() {
    let bookingTimer = null;
    let selectedSeats = [];
    let currentShowtime = null;

    function formatTime(isoString) {
        if (!isoString) return '';
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return isoString;
        const hours = d.getHours().toString().padStart(2, '0');
        const minutes = d.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    function formatDate(isoString) {
        if (!isoString) return '';
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return isoString;
        const day = d.getDate().toString().padStart(2, '0');
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    }

    function getAgeNotice(ageRating) {
        switch (ageRating) {
            case 'T18':
                return 'Theo quy định của cục điện ảnh, phim này không dành cho khán giả dưới 18 tuổi.';
            case 'T16':
                return 'Theo quy định của cục điện ảnh, phim này không dành cho khán giả dưới 16 tuổi.';
            case 'T13':
                return 'Theo quy định của cục điện ảnh, phim này không dành cho khán giả dưới 13 tuổi.';
            case 'P':
            default:
                return 'Phim phổ biến đến mọi đối tượng khán giả.';
        }
    }

    function getShowtimeId() {
        const urlParams = new URLSearchParams(window.location.search);
        let id = urlParams.get('showtimeId');
        if (id) return id;

        if (window.location.hash.includes('?')) {
            const hashParams = new URLSearchParams(window.location.hash.split('?')[1]);
            id = hashParams.get('showtimeId');
            if (id) return id;
        }

        id = localStorage.getItem('selectedShowtimeId') || localStorage.getItem('selectedBookingShowtimeId');
        if (id) return id;

        return 1;
    }

    function renderFallbackSeats(seatMapEl) {
        let movie = null;
        const savedMovieId = localStorage.getItem('selectedBookingMovieId');
        if (typeof DemoData !== 'undefined' && DemoData.movies) {
            movie = DemoData.movies.find((m) => m.id === savedMovieId) || DemoData.movies[0];
        }

        const cinemaName = localStorage.getItem('selectedBookingCinema') || (typeof DemoData !== 'undefined' && DemoData.cinemas?.[0]?.name) || 'Beta Thanh Xuân';
        const dateStr = localStorage.getItem('selectedBookingDate') || formatDate(new Date().toISOString());
        const timeStr = localStorage.getItem('selectedBookingTime') || '19:30';

        currentShowtime = {
            id: 1,
            movieId: movie?.id || 'm1',
            movieTitle: movie?.title || 'ĐÀO, PHỞ VÀ PIANO',
            cinemaName: cinemaName,
            startsAt: new Date().toISOString(),
            genres: movie?.genres || ['Hành động', 'Tâm lý'],
            durationMin: movie?.duration || 120,
            ageRating: movie?.ageRating || 'T13',
            imageUrl: movie?.imageUrl || 'https://files.betacorp.vn/media%2fimages%2f2026%2f09%2f29%2f400x633%2D095119%2D290926%2D27.jpg',
            priceStandard: 68000,
            priceVip: 75000,
            priceCouple: 145000,
        };

        // Cập nhật sidebar & breadcrumb
        updateSidebar(currentShowtime, timeStr, dateStr);

        // Sinh danh sách ghế 8 hàng (A -> H) x 12 cột chuẩn rạp Beta
        const fallbackSeats = [];
        const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
        
        rows.forEach((r) => {
            if (r === 'H') {
                // Hàng ghế đôi Sweetbox (6 cặp ghế đôi = 12 chỗ)
                for (let c = 1; c <= 12; c++) {
                    const pairCol = (c % 2 !== 0) ? (c + 1) : (c - 1);
                    fallbackSeats.push({
                        id: `${r}${c}`,
                        row: r,
                        col: c,
                        label: `${r}${c}`,
                        type: 'COUPLE',
                        pairCol: pairCol,
                        price: 145000,
                        status: (c === 5 || c === 6) ? 'SOLD' : 'AVAILABLE',
                    });
                }
            } else {
                // Hàng ghế đơn
                for (let c = 1; c <= 12; c++) {
                    let type = 'STANDARD';
                    let price = 68000;
                    if (r === 'C' || r === 'D' || r === 'E' || r === 'F') {
                        type = 'VIP';
                        price = 75000;
                    }
                    fallbackSeats.push({
                        id: `${r}${c}`,
                        row: r,
                        col: c,
                        label: `${r}${c}`,
                        type,
                        price,
                        status: ((r === 'C' && (c === 5 || c === 6)) || (r === 'D' && (c === 7 || c === 8))) ? 'SOLD' : 'AVAILABLE',
                    });
                }
            }
        });

        renderSeatGrid(seatMapEl, fallbackSeats);
    }

    function updateSidebar(showtime, customTime, customDate) {
        const elBc = document.getElementById('bk-movie-name-bc');
        if (elBc) elBc.innerText = showtime.movieTitle;
        const elTitle = document.getElementById('bk-movie-title');
        if (elTitle) elTitle.innerText = showtime.movieTitle;
        const elCinema = document.getElementById('bk-cinema');
        if (elCinema) elCinema.innerText = showtime.cinemaName;
        const elDate = document.getElementById('bk-date');
        if (elDate) elDate.innerText = customDate || formatDate(showtime.startsAt);
        const elTime = document.getElementById('bk-time');
        if (elTime) elTime.innerText = customTime || formatTime(showtime.startsAt);
        const elGenres = document.getElementById('bk-genres');
        if (elGenres) elGenres.innerText = Array.isArray(showtime.genres) ? showtime.genres.join(', ') : (showtime.genres || '');
        const elDuration = document.getElementById('bk-duration');
        if (elDuration) elDuration.innerText = `${showtime.durationMin} phút`;

        const elBadge = document.getElementById('bk-age-badge');
        if (elBadge) {
            elBadge.innerText = showtime.ageRating || 'P';
            elBadge.className = 'mg-age age-' + (showtime.ageRating || 'p').toLowerCase();
        }

        const elPoster = document.getElementById('bk-poster');
        if (elPoster) {
            let imgUrl = showtime.imageUrl;
            if (!imgUrl && typeof DemoData !== 'undefined' && DemoData.movies) {
                const found = DemoData.movies.find((m) => m.id === showtime.movieId || m.title === showtime.movieTitle);
                if (found) imgUrl = found.imageUrl;
            }
            if (imgUrl) {
                elPoster.src = imgUrl;
            }
        }

        const elWarning = document.getElementById('bk-warning');
        if (elWarning) {
            elWarning.innerText = getAgeNotice(showtime.ageRating);
        }
    }

    function renderSeatGrid(seatMapEl, seats) {
        if (!seatMapEl) return;
        seatMapEl.innerHTML = '';
        selectedSeats = [];
        updateSummary();

        // Gom nhóm ghế theo từng hàng (row)
        const rowsMap = new Map();
        seats.forEach((s) => {
            if (!rowsMap.has(s.row)) {
                rowsMap.set(s.row, []);
            }
            rowsMap.get(s.row).push(s);
        });

        const sortedRows = Array.from(rowsMap.keys()).sort();

        sortedRows.forEach((rowKey) => {
            const rowSeats = rowsMap.get(rowKey).sort((a, b) => a.col - b.col);
            const rowEl = document.createElement('div');
            rowEl.className = 'seat-row';

            // Ký hiệu hàng bên trái
            const leftLabel = document.createElement('div');
            leftLabel.className = 'row-letter';
            leftLabel.innerText = rowKey;
            rowEl.appendChild(leftLabel);

            let prevCol = 0;
            rowSeats.forEach((s) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'seat-btn';
                btn.dataset.id = s.id;
                btn.dataset.label = s.label;
                btn.dataset.price = s.price;
                btn.dataset.type = s.type;

                // Lối đi phân bổ cân xứng tuyệt đối 4 - 4 - 4 cho phòng 12 cột (giữa cột 4-5 và 8-9)
                if (s.col === 5 || s.col === 9 || (prevCol > 0 && s.col - prevCol > 1)) {
                    btn.style.marginLeft = '18px';
                }
                prevCol = s.col;

                if (s.type === 'VIP') {
                    btn.classList.add('seat-vip');
                } else if (s.type === 'COUPLE') {
                    btn.classList.add('seat-double');
                    if (s.pairCol && s.pairCol === s.col + 1) {
                        btn.classList.add('seat-couple-left');
                    } else if (s.pairCol && s.pairCol === s.col - 1) {
                        btn.classList.add('seat-couple-right');
                    }
                }

                if (s.status === 'SOLD') {
                    btn.classList.add('seat-sold');
                    btn.disabled = true;
                    btn.title = `Ghế ${s.label} đã bán`;
                } else if (s.status === 'HELD') {
                    btn.classList.add('seat-holding');
                    btn.disabled = true;
                    btn.title = `Ghế ${s.label} đang được giữ chỗ`;
                } else {
                    btn.title = `Ghế ${s.label} (${Number(s.price).toLocaleString('vi-VN')} đ)`;
                    btn.addEventListener('click', () => toggleSeat(btn, s));
                }

                btn.innerText = s.label;
                rowEl.appendChild(btn);
            });

            // Ký hiệu hàng bên phải
            const rightLabel = document.createElement('div');
            rightLabel.className = 'row-letter';
            rightLabel.innerText = rowKey;
            rowEl.appendChild(rightLabel);

            seatMapEl.appendChild(rowEl);
        });

        startTimer(600); // 10 phút đếm ngược
    }

    async function loadSeatMap() {
        const showtimeId = getShowtimeId();
        const seatMapEl = document.getElementById('bk-seat-map');
        if (seatMapEl) {
            seatMapEl.innerHTML = '<div style="padding: 50px; text-align: center; color: #888;">Đang tải sơ đồ ghế...</div>';
        }

        try {
            if (typeof API === 'undefined' || !API.get) {
                renderFallbackSeats(seatMapEl);
                return;
            }

            const data = await API.get(`/showtimes/${showtimeId}/seats`);
            const showtime = data.showtime;
            const seats = data.seats || [];
            currentShowtime = showtime;

            updateSidebar(showtime);
            renderSeatGrid(seatMapEl, seats);

            if (typeof window.initHoldTimer === 'function') {
                window.initHoldTimer();
            }

        } catch (err) {
            renderFallbackSeats(seatMapEl);
        }
    }

    function toggleSeat(btn, seatData) {
        if (btn.disabled || btn.classList.contains('seat-sold') || btn.classList.contains('seat-holding')) return;

        const isSelected = btn.classList.contains('selected');

        if (isSelected) {
            btn.classList.remove('selected');
            selectedSeats = selectedSeats.filter((s) => s.id !== seatData.id);
        } else {
            if (selectedSeats.length >= 8) {
                alert('Mỗi đơn hàng chỉ được chọn tối đa 8 ghế!');
                return;
            }
            btn.classList.add('selected');
            selectedSeats.push({
                id: seatData.id,
                label: seatData.label,
                price: Number(seatData.price),
                type: seatData.type,
            });
        }

        updateSummary();
    }

    function updateSummary() {
        const labels = selectedSeats.map((s) => s.label).join(', ');
        const seatLabelEl = document.getElementById('bk-seats-selected');
        if (seatLabelEl) {
            seatLabelEl.innerText = labels || 'Chưa chọn ghế';
        }

        const total = selectedSeats.reduce((sum, s) => sum + s.price, 0);
        const totalEl = document.getElementById('bk-total-val');
        if (totalEl) {
            totalEl.innerText = total.toLocaleString('vi-VN') + ' vnđ';
        }
    }

    function startTimer(durationSec) {
        if (bookingTimer) clearInterval(bookingTimer);
        let timeLeft = durationSec;
        const countdownEl = document.getElementById('bk-countdown-val');
        if (!countdownEl) return;

        countdownEl.innerText = '10:00';
        countdownEl.style.color = '#0f172a';
        bookingTimer = setInterval(() => {
            timeLeft--;
            if (timeLeft < 0) {
                clearInterval(bookingTimer);
                countdownEl.innerText = '00:00';
                countdownEl.style.color = '#dc3545';
                alert('Thời gian chọn ghế đã hết hạn. Trang sẽ tự động tải lại để làm mới trạng thái ghế!');
                loadSeatMap();
                return;
            }
            const m = Math.floor(timeLeft / 60);
            const s = timeLeft % 60;
            countdownEl.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            if (timeLeft <= 60) {
                countdownEl.style.color = '#dc3545';
            }
        }, 1000);
    }

    function initSubmitBtn() {
        const submitBtn = document.getElementById('bk-submit-btn');
        if (!submitBtn || submitBtn.dataset.bound) return;
        submitBtn.dataset.bound = 'true';

        submitBtn.addEventListener('click', async () => {
            if (selectedSeats.length === 0) {
                alert('Vui lòng chọn ít nhất 1 ghế để tiếp tục!');
                return;
            }

            if (!currentShowtime) {
                alert('Chưa có thông tin suất chiếu!');
                return;
            }

            const totalAmount = selectedSeats.reduce((sum, s) => sum + s.price, 0);
            const seatLabels = selectedSeats.map((s) => s.label);
            const primarySeatType = selectedSeats.some((s) => s.type === 'VIP') ? 'VIP' : (selectedSeats.some((s) => s.type === 'COUPLE') ? 'ĐÔI' : 'THƯỜNG');
            const avgUnitPrice = Math.round(totalAmount / selectedSeats.length);

            const tempOrderId = 'BC' + Date.now().toString().slice(-8);

            // Tạo order hoàn chỉnh lưu vào DB
            const orderData = {
                orderId: tempOrderId,
                userId: 1,
                movieId: currentShowtime.movieId || 'm1',
                cinemaId: 'c2',
                showtimeId: 'ST1',
                seats: seatLabels,
                seatType: primarySeatType,
                seatUnitPrice: avgUnitPrice,
                seatAmount: totalAmount,
                amount: totalAmount,
                combos: [],
                status: 'HOLDING',
                holdExpiresAt: (typeof VirtualClock !== 'undefined') ? VirtualClock.now(10 * 60 * 1000).toISOString() : new Date(Date.now() + 10 * 60 * 1000).toISOString(),
                createdAt: (typeof VirtualClock !== 'undefined') ? VirtualClock.now().toISOString() : new Date().toISOString()
            };

            if (typeof DB !== 'undefined') {
                DB.insert('beta_orders', orderData);
            }
            localStorage.setItem('currentOrder', tempOrderId);
            localStorage.setItem('tempSelectedSeats', JSON.stringify(selectedSeats));
            localStorage.setItem('tempShowtime', JSON.stringify(currentShowtime));

            // Nếu có API backend online thì gọi đồng bộ
            if (typeof API !== 'undefined' && API.post) {
                try {
                    const res = await API.post('/orders/hold', {
                        showtimeId: currentShowtime.id,
                        seatIds: selectedSeats.map((s) => s.id),
                    });
                    if (res && res.orderId) {
                        localStorage.setItem('currentOrder', res.orderId);
                        orderData.orderId = res.orderId;
                        if (typeof DB !== 'undefined') {
                            DB.insert('beta_orders', orderData);
                        }
                    }
                } catch(e) {
                    console.log('API backend offline, proceeding with client DB order:', tempOrderId);
                }
            }

            if (window.spaNavigate) {
                window.spaNavigate('checkout', `orderId=${orderData.orderId}`);
            } else {
                window.location.hash = `#checkout?orderId=${orderData.orderId}`;
            }
        });
    }

    window.renderBookingSeatMap = loadSeatMap;

    document.addEventListener('DOMContentLoaded', () => {
        initSubmitBtn();
        loadSeatMap();
    });
})();
