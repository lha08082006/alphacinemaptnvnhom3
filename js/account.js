// js/account.js - Quản lý Tài khoản & Lịch sử Giao dịch Thành viên Beta Cinemas
'use strict';

(function () {
    let cachedUser = null;
    let allOrders = [];

    // Danh sách rạp Beta Cinemas
    const CINEMAS = [
        'Beta Thanh Xuân',
        'Beta Giải Phóng',
        'Beta Mỹ Đình',
        'Beta Đan Phượng',
        'Beta Quang Trung',
        'Beta Ung Văn Khiêm',
        'Beta Trần Quang Khải',
        'Beta Empire Bình Dương',
        'Beta Biên Hòa',
        'Beta Nha Trang',
        'Beta Thái Nguyên',
        'Beta Bắc Giang',
        'Beta Thanh Hóa'
    ];

    /**
     * Khởi tạo giao diện tài khoản
     */
    window.initAccountView = async function (params) {
        // Kiểm tra tab được chỉ định qua query string hoặc hash
        let activeTab = 'profile';
        if (params && params.get) {
            activeTab = params.get('tab') || 'profile';
        } else if (window.location.hash.includes('orders') || window.location.hash.includes('my-orders')) {
            activeTab = 'orders';
        }

        switchAccountTab(activeTab);
        await loadUserProfile();
        if (activeTab === 'orders') {
            await loadOrderHistory();
        }
    };

    /**
     * Chuyển tab trong trang Tài khoản
     */
    window.switchAccountTab = function (tabName) {
        const tabs = ['profile', 'orders', 'password'];
        if (!tabs.includes(tabName)) tabName = 'profile';

        // Cập nhật menu sidebar
        document.querySelectorAll('.account-menu-link').forEach(link => {
            if (link.dataset.tab === tabName) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });

        // Cập nhật panel hiển thị
        tabs.forEach(t => {
            const panel = document.getElementById(`panel-${t}`);
            if (panel) {
                panel.style.display = (t === tabName) ? 'block' : 'none';
            }
        });

        // Nếu chuyển sang tab orders thì tải dữ liệu đơn nếu chưa có
        if (tabName === 'orders' && allOrders.length === 0) {
            loadOrderHistory();
        }
    };

    /**
     * Tải thông tin người dùng từ Backend API
     */
    async function loadUserProfile() {
        try {
            let user = null;
            if (window.API && API.get) {
                const res = await API.get('/auth/me');
                user = res.user || res;
            }

            if (!user) {
                const localStr = localStorage.getItem('currentUser');
                if (localStr) user = JSON.parse(localStr);
            }

            if (!user) {
                // Chưa đăng nhập -> thông báo mở modal đăng nhập
                const userBox = document.getElementById('account-not-logged');
                const mainBox = document.getElementById('account-main-content');
                if (userBox) userBox.style.display = 'block';
                if (mainBox) mainBox.style.display = 'none';
                return;
            }

            cachedUser = user;
            renderMemberCard(user);
            populateProfileForm(user);
            updateTopBarUser(user);

            const userBox = document.getElementById('account-not-logged');
            const mainBox = document.getElementById('account-main-content');
            if (userBox) userBox.style.display = 'none';
            if (mainBox) mainBox.style.display = 'block';

        } catch (err) {
            console.warn('Không thể tải profile qua API, sử dụng dữ liệu cục bộ:', err);
            const localStr = localStorage.getItem('currentUser');
            if (localStr) {
                const user = JSON.parse(localStr);
                cachedUser = user;
                renderMemberCard(user);
                populateProfileForm(user);
                updateTopBarUser(user);
            }
        }
    }

    /**
     * Hiển thị Thẻ Thành Viên Điện Tử (Beta Member Card)
     */
    function renderMemberCard(user) {
        const cardName = document.getElementById('card-holder-name');
        const cardNum = document.getElementById('card-number-display');
        const cardPts = document.getElementById('card-points-display');
        const cardTier = document.getElementById('card-tier-text');
        const cardSpend = document.getElementById('card-spend-display');

        const fullName = user.full_name || user.name || user.email.split('@')[0];
        if (cardName) cardName.innerText = fullName;

        // Sinh mã thẻ thành viên dạng BC-0000-xxxx
        const cardIdNumber = String(user.id || 1001).padStart(6, '0');
        const formattedNum = `BC-${cardIdNumber.slice(0, 3)}-${cardIdNumber.slice(3)}`;
        if (cardNum) cardNum.innerText = formattedNum;

        const points = Number(user.points || 0);
        if (cardPts) cardPts.innerText = `${points.toLocaleString('vi-VN')} điểm`;
        if (cardSpend) {
            const estimatedSpend = points * 1000;
            cardSpend.innerText = `${estimatedSpend.toLocaleString('vi-VN')} ₫`;
        }

        if (cardTier) {
            if (points >= 500) {
                cardTier.innerText = 'BETA VIP';
            } else {
                cardTier.innerText = 'BETA STAR';
            }
        }
    }

    /**
     * Cập nhật thông tin vào Form Thông tin tài khoản
     */
    function populateProfileForm(user) {
        const inpName = document.getElementById('acc-name');
        const inpEmail = document.getElementById('acc-email');
        const inpPhone = document.getElementById('acc-phone');
        const inpDob = document.getElementById('acc-dob');
        const inpGender = document.getElementById('acc-gender');
        const selCinema = document.getElementById('acc-cinema');

        if (inpName) inpName.value = user.full_name || user.name || '';
        if (inpEmail) inpEmail.value = user.email || '';
        if (inpPhone) inpPhone.value = user.phone || '';

        // Điền danh sách rạp nếu có
        if (selCinema && selCinema.options.length <= 1) {
            selCinema.innerHTML = CINEMAS.map(c => `<option value="${c}">${c}</option>`).join('');
            const savedCinema = localStorage.getItem('user_favorite_cinema') || 'Beta Thanh Xuân';
            selCinema.value = savedCinema;
        }
    }

    /**
     * Cập nhật Top-bar với Dropdown thân thiện
     */
    function updateTopBarUser(user) {
        const guestBox = document.getElementById('nav-user-guest');
        const infoBox = document.getElementById('nav-user-info');
        const usernameEl = document.getElementById('nav-username');
        const pointsBadge = document.getElementById('nav-user-points-badge');

        if (guestBox) guestBox.style.display = 'none';
        if (infoBox) infoBox.style.display = 'inline-flex';

        const name = user.full_name || user.name || user.email.split('@')[0];
        if (usernameEl) usernameEl.innerText = name;
        if (pointsBadge) {
            const pts = user.points || 0;
            pointsBadge.innerText = `${pts} điểm`;
        }
    }

    /**
     * Tải Lịch Sử Giao Dịch
     */
    window.loadOrderHistory = async function () {
        const container = document.getElementById('orders-list-container');
        if (!container) return;

        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #64748b;">
                <div style="font-size: 24px; margin-bottom: 8px;">⏳</div>
                Đang tải hành trình điện ảnh & lịch sử giao dịch của bạn...
            </div>
        `;

        try {
            let orders = [];
            if (window.API && API.get) {
                orders = await API.get('/orders');
            }

            if (!orders || !Array.isArray(orders)) {
                orders = [];
            }

            allOrders = orders;
            applyOrdersFilter();

        } catch (err) {
            console.warn('Lỗi khi tải đơn hàng:', err);
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #dc2626;">
                    Không thể nạp lịch sử giao dịch: ${err.message || 'Lỗi kết nối máy chủ.'}
                </div>
            `;
        }
    };

    /**
     * Lọc danh sách đơn hàng theo trạng thái & từ khóa
     */
    window.applyOrdersFilter = function () {
        const container = document.getElementById('orders-list-container');
        if (!container) return;

        const periodVal = document.getElementById('order-filter-period')?.value || 'ALL';
        const statusVal = document.getElementById('order-filter-status')?.value || 'ALL';
        const keyword = (document.getElementById('order-filter-search')?.value || '').trim().toLowerCase();

        let filtered = [...allOrders];

        // 1. Lọc theo trạng thái
        if (statusVal !== 'ALL') {
            filtered = filtered.filter(o => o.status === statusVal);
        }

        // 2. Lọc theo từ khóa (Mã đơn hoặc Tên phim)
        if (keyword) {
            filtered = filtered.filter(o => {
                const idMatch = (o.orderId || o.id || '').toLowerCase().includes(keyword);
                const movieMatch = (o.movieTitle || '').toLowerCase().includes(keyword);
                return idMatch || movieMatch;
            });
        }

        // 3. Render kết quả
        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 50px 20px; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1;">
                    <div style="font-size: 40px; margin-bottom: 12px;">🎟️</div>
                    <div style="font-weight: 700; color: #334155; font-size: 16px; margin-bottom: 6px;">Chưa tìm thấy giao dịch đặt vé nào</div>
                    <p style="color: #64748b; font-size: 13.5px; margin: 0 0 16px;">Hãy cùng khám phá những bộ phim bom tấn đang chiếu tại rạp Beta Cinemas nhé!</p>
                    <button type="button" class="btn-save-profile" onclick="if(window.spaNavigate) window.spaNavigate('home')">
                        ĐẶT VÉ XEM PHIM NGAY
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(renderOrderCard).join('');
    };

    /**
     * Template HTML cho 1 Card Lịch sử giao dịch
     */
    function renderOrderCard(o) {
        const orderCode = o.orderId || `BC${o.id}`;
        const createdDate = o.createdAt ? new Date(o.createdAt).toLocaleString('vi-VN') : 'Gần đây';
        const movieTitle = o.movieTitle || 'Vé xem phim Beta Cinemas';
        const cinema = o.cinemaName || 'Beta Thanh Xuân';
        const room = o.roomName || 'Phòng chiếu 01';
        const startsAt = o.startsAt ? new Date(o.startsAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Suất chiếu tiêu chuẩn';
        const totalFormatted = Number(o.amountTotal || 0).toLocaleString('vi-VN') + ' ₫';

        // Xử lý nhãn trạng thái
        let statusBadge = '';
        if (o.status === 'PAID') {
            statusBadge = '<span class="order-badge-status status-paid">Đã thanh toán</span>';
        } else if (o.status === 'PENDING_VERIFY' || o.status === 'HOLD') {
            statusBadge = '<span class="order-badge-status status-pending">Đang xử lý</span>';
        } else if (o.status === 'REFUNDED') {
            statusBadge = '<span class="order-badge-status status-refunded">Đã hoàn tiền</span>';
        } else {
            statusBadge = '<span class="order-badge-status status-failed">' + (o.status || 'Thất bại') + '</span>';
        }

        // Xử lý danh sách ghế
        const seatsText = (o.seats && o.seats.length > 0) ? o.seats.join(', ') : (o.seatDetails || 'Chưa chọn ghế');

        // Xử lý combos
        let combosHtml = '';
        if (o.combos && o.combos.length > 0) {
            const list = o.combos.map(c => `${c.comboName || c.name || 'Combo'} x${c.quantity}`).join(' | ');
            combosHtml = `<div class="order-combos-text">🍿 <b>Bắp nước:</b> ${list}</div>`;
        }

        // Poster phim fallback
        const posterSrc = o.posterUrl || 'https://www.betacinemas.vn/Assets/Common/logo/logo.png';

        return `
            <div class="order-card" id="card-${orderCode}">
                <div class="order-card-header">
                    <span class="order-card-id">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                        Mã đơn: <b>${orderCode}</b>
                    </span>
                    <span class="order-card-date">🕒 ${createdDate}</span>
                    ${statusBadge}
                </div>
                <div class="order-card-body">
                    <img src="${posterSrc}" alt="${movieTitle}" class="order-movie-poster" onerror="this.src='https://www.betacinemas.vn/Assets/Common/logo/logo.png'; this.style.objectFit='contain'; this.style.padding='10px';">
                    <div class="order-movie-info">
                        <h4 class="order-movie-title">${movieTitle}</h4>
                        <div class="order-meta-row">
                            <span class="order-meta-item">📍 <b>${cinema}</b> - ${room}</span>
                            <span class="order-meta-item">⏰ <b>${startsAt}</b></span>
                        </div>
                        <div style="margin-top: 4px;">
                            <span class="order-seats-tag">🪑 Ghế: ${seatsText}</span>
                        </div>
                        ${combosHtml}
                    </div>
                    <div class="order-card-right">
                        <div class="order-total-price">${totalFormatted}</div>
                        <div class="order-actions-row">
                            <button type="button" class="btn-view-ticket" onclick="window.openETicketModal('${orderCode}')">
                                🎟️ Vé Điện Tử
                            </button>
                            <a href="support.html?orderId=${encodeURIComponent(orderCode)}&action=report" class="btn-report-ticket" title="Khiếu nại / Báo lỗi đơn hàng">
                                ⚠️ Khiếu nại
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Mở Modal Vé Điện Tử E-Ticket với mã QR Code
     */
    window.openETicketModal = function (orderId) {
        const order = allOrders.find(o => (o.orderId === orderId || `BC${o.id}` === orderId)) || {
            orderId: orderId,
            movieTitle: 'VÉ XEM PHIM BETA CINEMAS',
            cinemaName: 'Beta Thanh Xuân',
            roomName: 'Phòng chiếu 01',
            startsAt: new Date().toISOString(),
            seats: ['F07', 'F08'],
            amountTotal: 150000
        };

        const modal = document.getElementById('eticket-modal');
        if (!modal) return;

        document.getElementById('eticket-order-id').innerText = order.orderId || `BC${order.id}`;
        document.getElementById('eticket-movie-title').innerText = order.movieTitle || 'VÉ XEM PHIM BETA CINEMAS';
        document.getElementById('eticket-cinema').innerText = order.cinemaName || 'Beta Thanh Xuân';
        document.getElementById('eticket-room').innerText = order.roomName || 'Phòng chiếu 01';
        
        const startsStr = order.startsAt ? new Date(order.startsAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Hôm nay';
        document.getElementById('eticket-time').innerText = startsStr;
        
        const seatsStr = (order.seats && order.seats.length > 0) ? order.seats.join(', ') : (order.seatDetails || 'F07, F08');
        document.getElementById('eticket-seats').innerText = seatsStr;
        
        document.getElementById('eticket-total').innerText = Number(order.amountTotal || 0).toLocaleString('vi-VN') + ' ₫';

        // Sinh QR Code
        const qrContainer = document.getElementById('eticket-qrcode-container');
        if (qrContainer) {
            qrContainer.innerHTML = '';
            const qrContent = `BETACINEMAS|ORDER:${order.orderId || orderId}|SEATS:${seatsStr}`;

            if (typeof QRCode !== 'undefined') {
                new QRCode(qrContainer, {
                    text: qrContent,
                    width: 160,
                    height: 160,
                    colorDark: "#005198",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.H
                });
            } else {
                // Fallback nếu thư viện QRCode chưa nạp
                qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrContent)}" width="160" height="160" alt="QR Code">`;
            }
        }

        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    };

    /**
     * Đóng Modal Vé Điện Tử
     */
    window.closeETicketModal = function () {
        const modal = document.getElementById('eticket-modal');
        if (modal) modal.classList.remove('show');
        document.body.style.overflow = '';
    };

    /**
     * Khởi tạo các sự kiện Submit form
     */
    function initAccountEvents() {
        // Form lưu thông tin cá nhân
        const profileForm = document.getElementById('acc-profile-form');
        if (profileForm) {
            profileForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = document.getElementById('btn-save-profile');
                const alertSuccess = document.getElementById('acc-profile-alert-success');
                const alertError = document.getElementById('acc-profile-alert-error');

                if (alertSuccess) alertSuccess.style.display = 'none';
                if (alertError) alertError.style.display = 'none';

                const full_name = document.getElementById('acc-name')?.value.trim();
                const phone = document.getElementById('acc-phone')?.value.trim();
                const favCinema = document.getElementById('acc-cinema')?.value;

                if (favCinema) {
                    localStorage.setItem('user_favorite_cinema', favCinema);
                }

                btn.disabled = true;
                btn.innerText = 'ĐANG LƯU...';

                try {
                    if (window.API && API.put) {
                        const res = await API.put('/auth/profile', { full_name, phone });
                        if (res.user) cachedUser = res.user;
                    }

                    // Cập nhật localStorage
                    const curUserStr = localStorage.getItem('currentUser');
                    if (curUserStr) {
                        const u = JSON.parse(curUserStr);
                        u.full_name = full_name;
                        u.name = full_name;
                        u.phone = phone;
                        localStorage.setItem('currentUser', JSON.stringify(u));
                        cachedUser = u;
                    }

                    if (cachedUser) {
                        renderMemberCard(cachedUser);
                        updateTopBarUser(cachedUser);
                    }

                    if (alertSuccess) {
                        alertSuccess.innerText = 'Cập nhật thông tin tài khoản thành công!';
                        alertSuccess.style.display = 'block';
                    }

                } catch (err) {
                    if (alertError) {
                        alertError.innerText = err.message || 'Lỗi khi cập nhật thông tin cá nhân.';
                        alertError.style.display = 'block';
                    }
                } finally {
                    btn.disabled = false;
                    btn.innerText = 'LƯU THAY ĐỔI';
                }
            });
        }

        // Form đổi mật khẩu
        const pwForm = document.getElementById('acc-password-form');
        if (pwForm) {
            pwForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const currentPassword = document.getElementById('acc-old-pw')?.value;
                const newPassword = document.getElementById('acc-new-pw')?.value;
                const confirmPassword = document.getElementById('acc-confirm-pw')?.value;
                const alertSuccess = document.getElementById('acc-pw-alert-success');
                const alertError = document.getElementById('acc-pw-alert-error');
                const btn = document.getElementById('btn-change-password');

                if (alertSuccess) alertSuccess.style.display = 'none';
                if (alertError) alertError.style.display = 'none';

                if (newPassword !== confirmPassword) {
                    if (alertError) {
                        alertError.innerText = 'Mật khẩu mới và mật khẩu xác nhận không khớp!';
                        alertError.style.display = 'block';
                    }
                    return;
                }

                if (newPassword.length < 6) {
                    if (alertError) {
                        alertError.innerText = 'Mật khẩu mới phải có ít nhất 6 ký tự!';
                        alertError.style.display = 'block';
                    }
                    return;
                }

                btn.disabled = true;
                btn.innerText = 'ĐANG ĐỔI MẬT KHẨU...';

                try {
                    if (window.API && API.post) {
                        await API.post('/auth/change-password', {
                            current_password: currentPassword,
                            new_password: newPassword
                        });
                    }

                    if (alertSuccess) {
                        alertSuccess.innerText = 'Đổi mật khẩu thành công! Vui lòng ghi nhớ mật khẩu mới của bạn.';
                        alertSuccess.style.display = 'block';
                    }
                    pwForm.reset();

                } catch (err) {
                    if (alertError) {
                        alertError.innerText = err.message || 'Mật khẩu hiện tại không chính xác.';
                        alertError.style.display = 'block';
                    }
                } finally {
                    btn.disabled = false;
                    btn.innerText = 'CẬP NHẬT MẬT KHẨU';
                }
            });
        }

        // Modal backdrop click
        const eticketModal = document.getElementById('eticket-modal');
        if (eticketModal) {
            eticketModal.addEventListener('click', (e) => {
                if (e.target === eticketModal) window.closeETicketModal();
            });
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        initAccountEvents();
        // Cập nhật Top-bar nếu có sẵn thông tin user
        const localUser = localStorage.getItem('currentUser');
        if (localUser) {
            try {
                updateTopBarUser(JSON.parse(localUser));
            } catch (e) {}
        }
    });

})();
