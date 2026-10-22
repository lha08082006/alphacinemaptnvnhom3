/**
 * js/schedule.js
 * Quản lý giao diện Lịch Chiếu Theo Rạp (Schedule View)
 */
'use strict';

(function () {
    let currentCinemaId = 2; // Mặc định Beta Cinemas Thanh Xuân (id = 2)
    let currentDate = null;

    // Danh sách rạp mặc định
    const DEFAULT_CINEMAS = [
        { id: 2, name: 'Beta Cinemas Thanh Xuân', city: 'Hà Nội' },
        { id: 1, name: 'Beta Cinemas Thái Nguyên', city: 'Thái Nguyên' },
        { id: 3, name: 'Beta Cinemas Giải Phóng', city: 'Hà Nội' },
        { id: 4, name: 'Beta Cinemas Quang Trung', city: 'TP.HCM' },
        { id: 5, name: 'Beta Cinemas Trần Quang Khải', city: 'TP.HCM' }
    ];

    const DAYS_OF_WEEK = ['CHỦ NHẬT', 'THỨ HAI', 'THỨ BA', 'THỨ TƯ', 'THỨ NĂM', 'THỨ SÁU', 'THỨ BẢY'];

    // Sinh 7 ngày liên tiếp tính từ hôm nay
    function generateDays() {
        const days = [];
        // Sử dụng mốc ngày 2026-10-22 làm mốc hiện tại nếu hệ thống đang ở thời gian giả lập
        const baseDate = new Date();
        const simYear = baseDate.getFullYear();
        const startDate = simYear >= 2026 ? baseDate : new Date('2026-10-22T00:00:00Z');

        for (let i = 0; i < 7; i++) {
            const d = new Date(startDate);
            d.setDate(startDate.getDate() + i);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const dateStr = `${yyyy}-${mm}-${dd}`;
            const dayName = i === 0 ? 'HÔM NAY' : (i === 1 ? 'NGÀY MAI' : DAYS_OF_WEEK[d.getDay()]);
            const displayDate = `${dd}/${mm}`;
            days.push({ dateStr, dayName, displayDate, fullDate: d });
        }
        return days;
    }

    // Render thanh chọn rạp
    function renderCinemaBar(cinemas, activeId, onSelect) {
        let bar = document.getElementById('sch-cinema-bar');
        if (!bar) {
            const container = document.querySelector('.sch-container');
            if (container) {
                bar = document.createElement('div');
                bar.id = 'sch-cinema-bar';
                bar.className = 'sch-cinema-bar';
                container.insertBefore(bar, document.getElementById('sch-date-bar'));
            }
        }
        if (!bar) return;

        bar.innerHTML = '';
        cinemas.forEach((c) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'sch-cinema-tab' + (c.id === activeId ? ' active' : '');
            btn.innerHTML = `<span class="sch-cin-name">${c.name}</span><span class="sch-cin-city">${c.city || ''}</span>`;
            btn.onclick = () => {
                currentCinemaId = c.id;
                localStorage.setItem('selectedBookingCinema', c.name);
                localStorage.setItem('selectedBookingCinemaId', c.id);
                renderCinemaBar(cinemas, c.id, onSelect);
                onSelect(c.id, currentDate);
            };
            bar.appendChild(btn);
        });
    }

    // Render thanh chọn ngày
    function renderDateBar(days, activeDateStr, onSelect) {
        const bar = document.getElementById('sch-date-bar');
        if (!bar) return;

        bar.innerHTML = '';
        days.forEach((day) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'sch-date-card' + (day.dateStr === activeDateStr ? ' active' : '');
            btn.innerHTML = `
                <span class="sch-day-name">${day.dayName}</span>
                <span class="sch-day-val">${day.displayDate}</span>
            `;
            btn.onclick = () => {
                currentDate = day.dateStr;
                localStorage.setItem('selectedBookingDate', day.displayDate);
                renderDateBar(days, day.dateStr, onSelect);
                onSelect(currentCinemaId, day.dateStr);
            };
            bar.appendChild(btn);
        });
    }

    // Render danh sách phim và các suất chiếu
    function renderMovieList(movies) {
        const listEl = document.getElementById('sch-movie-list');
        if (!listEl) return;

        if (!movies || movies.length === 0) {
            listEl.innerHTML = `
                <div class="sch-empty-box">
                    <div style="font-size: 40px; margin-bottom: 12px;">🎬</div>
                    <div style="font-size: 16px; font-weight: 700; color: #475569;">Chưa có lịch chiếu cho ngày này</div>
                    <div style="font-size: 13px; color: #94a3b8; margin-top: 6px;">Quý khách vui lòng chọn ngày khác hoặc chọn cụm rạp khác.</div>
                </div>
            `;
            return;
        }

        listEl.innerHTML = movies.map((m) => {
            const ageBadge = m.ageRating ? `<span class="mg-age age-${m.ageRating.toLowerCase()}">${m.ageRating}</span>` : '';
            const genresStr = Array.isArray(m.genres) ? m.genres.join(', ') : (m.genres || 'Hành động, Tâm lý');
            const poster = m.posterUrl || m.imageUrl || 'images/banner_real.png';

            // Gom suất chiếu theo định dạng (2D Phụ Đề, 2D Lồng Tiếng...)
            const formats = {};
            (m.showtimes || []).forEach((st) => {
                const fmt = st.format ? `${st.format} Phụ Đề` : '2D Phụ Đề';
                if (!formats[fmt]) formats[fmt] = [];
                formats[fmt].push(st);
            });

            const formatHtml = Object.keys(formats).map((fmt) => {
                const buttons = formats[fmt].map((st) => {
                    const isLate = st.isLate || st.time >= '22:00';
                    const btnClass = 'sch-time-btn' + (isLate ? ' sch-time-late' : '');
                    return `
                        <button type="button" class="${btnClass}" onclick="window.selectShowtimeFromSchedule(${st.id}, '${encodeURIComponent(m.movieTitle)}', '${st.time}', ${m.movieId})">
                            ${st.time}
                        </button>
                    `;
                }).join('');

                return `
                    <div class="sch-format-group">
                        <div class="sch-format-title">${fmt}</div>
                        <div class="sch-time-grid">${buttons}</div>
                    </div>
                `;
            }).join('');

            return `
                <div class="sch-movie-card">
                    <div class="sch-poster-wrap">
                        <img src="${poster}" onerror="this.onerror=null; this.src='images/banner_real.png';" alt="${m.movieTitle}">
                    </div>
                    <div class="sch-movie-info">
                        <div class="sch-title-row">
                            ${ageBadge}
                            <h3 class="sch-movie-title">${m.movieTitle}</h3>
                        </div>
                        <div class="sch-movie-meta">
                            <span>⏱️ ${m.durationMin || 120} phút</span>
                            <span>•</span>
                            <span>🏷️ ${genresStr}</span>
                        </div>
                        <div class="sch-formats-container">
                            ${formatHtml}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Bấm chọn suất chiếu -> chuyển thẳng sang màn hình Đặt Vé #booking
    window.selectShowtimeFromSchedule = function (showtimeId, encodedTitle, timeStr, movieId) {
        const title = decodeURIComponent(encodedTitle);
        localStorage.setItem('selectedBookingShowtimeId', showtimeId);
        localStorage.setItem('selectedShowtimeId', showtimeId);
        localStorage.setItem('selectedBookingTime', timeStr);
        if (movieId) localStorage.setItem('selectedBookingMovieId', movieId);

        // Chuyển hướng sang view booking
        if (typeof window.spaNavigate === 'function') {
            window.spaNavigate('booking', `showtimeId=${showtimeId}`);
        } else {
            window.location.hash = `#booking?showtimeId=${showtimeId}`;
        }
    };

    // Hàm nạp dữ liệu lịch chiếu chính
    async function loadScheduleData(cinemaId, dateStr) {
        const listEl = document.getElementById('sch-movie-list');
        if (listEl) {
            listEl.innerHTML = '<div style="padding: 40px; text-align: center; color: #64748b; font-weight: 600;">Đang tải lịch chiếu...</div>';
        }

        try {
            let data = null;
            if (window.API && typeof API.get === 'function') {
                const res = await API.get(`/showtimes?cinemaId=${cinemaId}&date=${dateStr}`);
                data = (res && res.data) ? res.data : res;
            } else {
                const base = (typeof API_BASE !== 'undefined') ? API_BASE : '/api/v1';
                const res = await fetch(`${base}/showtimes?cinemaId=${cinemaId}&date=${dateStr}`);
                const json = await res.json();
                data = json.data || json;
            }

            if (data && data.movies) {
                renderMovieList(data.movies);
            } else {
                throw new Error('Dữ liệu rỗng');
            }
        } catch (err) {
            console.warn('[Schedule] API không khả dụng, sử dụng dữ liệu mẫu:', err);
            // Dữ liệu fallback từ DemoData nếu có
            if (typeof DemoData !== 'undefined' && DemoData.movies) {
                const fallbackMovies = DemoData.movies.slice(0, 6).map((m, idx) => ({
                    movieId: m.id,
                    movieTitle: m.title,
                    ageRating: m.ageRating,
                    durationMin: m.duration,
                    genres: m.genres,
                    posterUrl: m.imageUrl,
                    showtimes: [
                        { id: idx * 4 + 1, time: '09:30', format: '2D' },
                        { id: idx * 4 + 2, time: '14:15', format: '2D' },
                        { id: idx * 4 + 3, time: '19:45', format: '2D' },
                        { id: idx * 4 + 4, time: '22:30', format: '2D', isLate: true }
                    ]
                }));
                renderMovieList(fallbackMovies);
            } else {
                renderMovieList([]);
            }
        }
    }

    // Hàm gọi khởi tạo từ SPA View
    window.renderScheduleData = async function (explicitCinemaId, explicitDate) {
        const days = generateDays();
        currentDate = explicitDate || days[0].dateStr;
        currentCinemaId = explicitCinemaId || Number(localStorage.getItem('selectedBookingCinemaId')) || 2;

        let cinemas = DEFAULT_CINEMAS;
        try {
            if (window.API && typeof API.get === 'function') {
                const res = await API.get('/showtimes');
                if (res && res.cinemas && res.cinemas.length > 0) {
                    cinemas = res.cinemas;
                }
            }
        } catch (_) {}

        renderCinemaBar(cinemas, currentCinemaId, (cId, dStr) => {
            loadScheduleData(cId, dStr);
        });

        renderDateBar(days, currentDate, (cId, dStr) => {
            loadScheduleData(cId, dStr);
        });

        loadScheduleData(currentCinemaId, currentDate);
    };

    // Tự động khởi tạo nếu mở trực tiếp view schedule
    document.addEventListener('DOMContentLoaded', () => {
        if (window.location.hash.includes('schedule')) {
            window.renderScheduleData();
        }
    });
})();
