// js/showtimes-modal.js

(function() {
    let stModalEl = null;
    let stConfirmModalEl = null;
    let currentMovie = null;

    function buildShowtimesDOM() {
        if (stModalEl) return;
        const html = `
            <div id="st-modal" class="st-modal" role="dialog" aria-modal="true" tabindex="-1">
                <div class="st-overlay" id="st-overlay"></div>
                <div class="st-wrapper">
                    <div class="st-container">
                        <div class="st-header">
                            <h2 id="st-title">LỊCH CHIẾU - Phim</h2>
                            <button class="st-close-btn" id="st-close-btn" aria-label="Đóng">&times;</button>
                        </div>
                        <div class="st-body">
                            <div class="st-cinema-name" id="st-cinema-name">Rạp Beta</div>
                            
                            <div class="st-date-selector" id="st-date-selector">
                                <!-- Render dates -->
                            </div>
                            
                            <div class="st-format">2D PHỤ ĐỀ</div>
                            
                            <div class="st-times" id="st-times-container">
                                <!-- Render times -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Modal xác nhận đặt vé -->
            <div id="st-confirm-modal" class="st-modal" role="dialog" aria-modal="true" tabindex="-1" style="z-index: 1060;">
                <div class="st-overlay" id="st-confirm-overlay"></div>
                <div class="st-wrapper st-confirm-wrapper">
                    <div class="st-confirm-header">
                        <h3>BẠN ĐANG ĐẶT VÉ XEM PHIM</h3>
                        <button class="st-close-btn" id="st-confirm-close-btn" aria-label="Đóng">&times;</button>
                    </div>
                    <div class="st-confirm-body">
                        <h2 id="st-confirm-movie" class="st-confirm-movie">Tên Phim</h2>
                        
                        <div class="st-confirm-table">
                            <div class="st-table-row st-table-head">
                                <div>Rạp chiếu</div>
                                <div>Ngày chiếu</div>
                                <div>Giờ chiếu</div>
                            </div>
                            <div class="st-table-row st-table-data">
                                <div id="st-confirm-cinema">Beta</div>
                                <div id="st-confirm-date">01/01/2026</div>
                                <div id="st-confirm-time">10:00</div>
                            </div>
                        </div>
                        
                        <div class="st-confirm-footer">
                            <button type="button" id="st-btn-agree" class="st-confirm-btn" style="border:none; cursor:pointer;">ĐỒNG Ý</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        stModalEl = document.getElementById('st-modal');
        stConfirmModalEl = document.getElementById('st-confirm-modal');

        // Events cho Modal Lịch Chiếu
        document.getElementById('st-close-btn').addEventListener('click', closeShowtimes);
        document.getElementById('st-overlay').addEventListener('click', closeShowtimes);
        
        // Events cho Modal Xác nhận
        document.getElementById('st-confirm-close-btn').addEventListener('click', closeConfirmModal);
        document.getElementById('st-confirm-overlay').addEventListener('click', closeConfirmModal);
        const agreeBtn = document.getElementById('st-btn-agree');
        if (agreeBtn) {
            agreeBtn.addEventListener('click', () => {
                const cinemaName = document.getElementById('st-confirm-cinema').innerText;
                const dateStr = document.getElementById('st-confirm-date').innerText;
                const timeStr = document.getElementById('st-confirm-time').innerText;
                if (currentMovie) {
                    localStorage.setItem('selectedBookingMovieId', currentMovie.id);
                }
                localStorage.setItem('selectedBookingCinema', cinemaName);
                localStorage.setItem('selectedBookingDate', dateStr);
                localStorage.setItem('selectedBookingTime', timeStr);
                closeConfirmModal();
                if (window.spaNavigate) {
                    window.spaNavigate('booking');
                } else {
                    window.location.hash = '#booking';
                }
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (stConfirmModalEl.classList.contains('show')) {
                    closeConfirmModal();
                } else if (stModalEl.classList.contains('show')) {
                    closeShowtimes();
                }
            }
        });
    }

    // Lấy 3 ngày tiếp theo
    function getNext3Days() {
        const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
        const result = [];
        const today = new Date();
        for(let i=0; i<3; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            const dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}`;
            const fullDateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getFullYear()}`;
            const dayStr = days[d.getDay()];
            result.push({ dateStr, dayStr, fullDateStr, dateObj: d });
        }
        return result;
    }

    // Random thời gian chiếu
    function generateTimes() {
        return [
            { time: '10:00', seats: Math.floor(Math.random() * 100) + 10 },
            { time: '12:30', seats: Math.floor(Math.random() * 100) + 10 },
            { time: '15:45', seats: Math.floor(Math.random() * 100) + 10 },
            { time: '19:15', seats: Math.floor(Math.random() * 100) + 10 },
            { time: '21:30', seats: Math.floor(Math.random() * 100) + 10 }
        ];
    }

    window.openShowtimes = function(movieId, e) {
        if(e) e.preventDefault();
        buildShowtimesDOM();

        currentMovie = typeof DemoData !== 'undefined' ? DemoData.movies.find(m => m.id === movieId) : null;
        if (!currentMovie) return;

        document.getElementById('st-title').innerText = 'LỊCH CHIẾU - ' + currentMovie.title;
        
        const currentCin = localStorage.getItem('selectedCinema') || 'Beta Cinemas Thanh Xuân';
        document.getElementById('st-cinema-name').innerText = 'Rạp ' + currentCin;

        const dates = getNext3Days();
        const dateContainer = document.getElementById('st-date-selector');
        dateContainer.innerHTML = dates.map((d, index) => `
            <div class="st-date-item ${index === 0 ? 'active' : ''}" onclick="window.selectDate(this, '${d.fullDateStr}')" data-full="${d.fullDateStr}">
                <span class="st-date-num">${d.dateStr}</span>
                <span class="st-day-str">- ${d.dayStr}</span>
            </div>
        `).join('');

        // Lưu ngày mặc định vào attribute để xài
        dateContainer.setAttribute('data-active-date', dates[0].fullDateStr);

        renderTimes();

        document.body.style.overflow = 'hidden';
        stModalEl.classList.add('show');
        stModalEl.focus();
    };

    window.selectDate = function(el, fullDateStr) {
        document.querySelectorAll('.st-date-item').forEach(item => item.classList.remove('active'));
        el.classList.add('active');
        document.getElementById('st-date-selector').setAttribute('data-active-date', fullDateStr);
        renderTimes();
    }

    function renderTimes() {
        const times = generateTimes();
        const container = document.getElementById('st-times-container');
        container.innerHTML = times.map(t => `
            <div class="st-time-btn" onclick="openConfirmModal('${t.time}')">
                <span class="st-time-val">${t.time}</span>
                <span class="st-seats">${t.seats} ghế trống</span>
            </div>
        `).join('');
    }

    window.closeShowtimes = function() {
        if (!stModalEl) return;
        document.body.style.overflow = '';
        stModalEl.classList.remove('show');
    };

    window.openConfirmModal = function(timeStr) {
        // Lấy thông tin hiện tại
        const cinemaName = (localStorage.getItem('selectedCinema') || 'Beta Cinemas Thanh Xuân').replace('Beta Cinemas ', 'Beta ');
        const dateStr = document.getElementById('st-date-selector').getAttribute('data-active-date');
        
        document.getElementById('st-confirm-movie').innerText = currentMovie.title;
        document.getElementById('st-confirm-cinema').innerText = cinemaName;
        document.getElementById('st-confirm-date').innerText = dateStr;
        document.getElementById('st-confirm-time').innerText = timeStr;

        // Đóng modal 1 và mở modal 2
        stModalEl.classList.remove('show');
        stConfirmModalEl.classList.add('show');
    };

    window.closeConfirmModal = function() {
        stConfirmModalEl.classList.remove('show');
        // Trả lại overflow
        document.body.style.overflow = '';
    };

})();
