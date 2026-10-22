// js/layout.js

document.addEventListener('DOMContentLoaded', () => {
    // Determine the active path for the menu
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';

    // 1. Chèn Header & Footer
    const headerHtml = `
        <div id="top-bar">
            <div class="container-fluid" style="display:flex; justify-content: flex-end; align-items: center; gap: 15px; font-size: 13px;">
                <span id="nav-user-guest" style="display:none;">
                    <a href="dang-nhap.html" id="nav-login">Đăng nhập</a> <span style="margin:0 10px;">|</span>
                    <a href="dang-nhap.html#register" id="nav-register">Đăng ký</a>
                </span>
                
                <div id="nav-user-info" class="topbar-user-container" style="display:inline-flex; align-items: center;">
                    <div class="topbar-user-trigger">
                        <span>Xin chào:</span>
                        <b id="nav-username" style="color: #ffd166;">— Thành viên</b>
                        <span id="nav-user-points-badge" class="topbar-user-points" style="display:none;">50 điểm</span>
                        <span style="font-size: 10px; margin-left: 2px;">▾</span>
                    </div>
                    <div class="topbar-dropdown-menu">
                        <a href="index.html#account?tab=profile">
                            <span>👤</span> Thông tin tài khoản
                        </a>
                        <a href="index.html#account?tab=orders">
                            <span>🎟️</span> Lịch sử giao dịch
                        </a>
                        <a href="index.html#account?tab=password">
                            <span>🔑</span> Đổi mật khẩu
                        </a>
                        <div class="dropdown-divider"></div>
                        <a href="#" onclick="logout(event)" class="logout-link">
                            <span>🚪</span> Đăng xuất
                        </a>
                    </div>
                </div>
                
                <span class="flag-icon" title="English" style="width: 22px; height: 14px; display: inline-block; background: url('https://upload.wikimedia.org/wikipedia/en/a/ae/Flag_of_the_United_Kingdom.svg') no-repeat center/cover; cursor: pointer;"></span>
            </div>
        </div>
        <header id="site-header" style="background: white; padding: 15px 0; box-shadow: 0 2px 10px rgba(0,0,0,0.08); position: sticky; top: 0; z-index: 1000; transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.35s ease; will-change: transform;">
            <!-- Căn giữa toàn bộ cụm Header bằng justify-content: center và thêm gap -->
            <div class="container-fluid header-main" style="display: flex; align-items: center; justify-content: center; gap: 35px;">
                
                <!-- Logo to hơn -->
                <a href="index.html" class="logo-box" style="flex-shrink: 0;">
                    <img alt="Beta Cinemas" style="height: 65px;" src="https://www.betacinemas.vn/Assets/Common/logo/logo.png">
                </a>
                
                <!-- Khung Dropdown to hơn -->
                <div class="cinema-selector" style="position: relative; flex-shrink: 0;">
                    <select id="header-cinema-select" onchange="setLoc('cinema', this.value)" style="appearance: none; -webkit-appearance: none; border: 1px solid #ccc; border-radius: 30px; padding: 12px 45px 12px 25px; font-family: 'Be Vietnam Pro', sans-serif; font-size: 15px; font-weight: 500; color: #333; background: white; cursor: pointer; outline: none; min-width: 240px;">
                        <!-- JS render -->
                    </select>
                    <svg viewBox="0 0 24 24" style="position: absolute; right: 18px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; fill: #666; pointer-events: none;"><path d="M7 10l5 5 5-5z"></path></svg>
                </div>

                <!-- Chữ Menu to hơn và khoảng cách đều nhau -->
                <nav class="main-nav">
                    <ul style="display: flex; list-style: none; margin: 0; padding: 0; gap: 30px; align-items: center;">
                        <li><a href="schedule.html" style="text-decoration: none; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 16px; color: var(--text-navy);">LỊCH CHIẾU THEO RẠP</a></li>
                        <li><a href="index.html" style="text-decoration: none; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 16px; color: var(--text-navy);">PHIM</a></li>
                        <li><a href="cinema.html" style="text-decoration: none; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 16px; color: var(--text-navy);">RẠP</a></li>
                        <li><a href="gia-ve.html" style="text-decoration: none; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 16px; color: var(--text-navy);">GIÁ VÉ</a></li>
                        <li><a href="combo.html" style="text-decoration: none; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 16px; color: var(--text-navy);">TIN MỚI VÀ ƯU ĐÃI</a></li>
                        <li><a href="#" style="text-decoration: none; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 16px; color: var(--text-navy);">NHƯỢNG QUYỀN</a></li>
                        <li><a href="index.html#account" style="text-decoration: none; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 16px; color: var(--text-navy);">THÀNH VIÊN</a></li>
                        <li class="nav-dropdown" style="position: relative;">
                            <a href="support.html" class="nav-link-dropdown" style="text-decoration: none; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 16px; color: var(--text-navy); display: flex; align-items: center; gap: 4px;">
                                HỖ TRỢ <span style="font-size: 11px;">▾</span>
                            </a>
                            <ul class="dropdown-menu-support">
                                <li><a href="support.html">Khiếu nại thanh toán</a></li>
                                <li><a href="support-tracking.html">Theo dõi khiếu nại</a></li>
                                <li><a href="faq.html">Câu hỏi thường gặp về thanh toán</a></li>
                            </ul>
                        </li>
                    </ul>
                </nav>

            </div>
        </header>
    `;

    document.body.insertAdjacentHTML('afterbegin', headerHtml);

    const footerHtml = `
<footer id="site-footer" style="background:#064e96; color:white; padding: 40px 0; margin-top: 50px; font-family: 'Be Vietnam Pro', sans-serif;">
    <div class="footer-grid" style="max-width: 1600px; margin: 0 auto; padding: 0 20px; font-size: 14px; line-height: 1.8;">
        
        <!-- Column 1 -->
        <div style="text-align: center;">
            <a href="index.html" style="display:inline-block; margin-bottom:20px;">
                <img alt="Beta Cinemas" style="height: 55px;" src="https://betacinemas.vn/Assets/Common/logo/logo-white.png">
            </a>
            <p style="margin:0 0 10px 0; font-family: 'Montserrat', sans-serif; font-size:16px;"><strong>TUYỂN DỤNG</strong></p>
            <a href="#" style="display:inline-block; padding:8px 20px; border:2px solid white; color:white; text-decoration:none; border-radius:20px; font-weight:bold; transition:0.2s;" onmouseover="this.style.background='white'; this.style.color='#064e96';" onmouseout="this.style.background='transparent'; this.style.color='white';">ỨNG TUYỂN NGAY</a>
        </div>

        <!-- Column 2 -->
        <div>
            <h4 style="font-family: 'Montserrat', sans-serif; font-size: 18px; color: var(--pink, #E58FCB); margin: 0 0 10px 0; text-transform: uppercase;">CÁC RẠP CỦA BETA</h4>
            <div style="width: 50px; height: 2px; background: var(--pink, #E58FCB); margin-bottom: 15px;"></div>
            
            <ul style="list-style: none; padding: 0; margin: 0;">
                <li style="margin-bottom: 10px;"><a href="#" style="color: white; text-decoration: none;">&gt; Beta Cinemas Nowzone, TP Hồ Chí Minh, Sắp khai trương - Hotline 1900 636807</a></li>
                <li style="margin-bottom: 10px;"><a href="#" style="color: white; text-decoration: none;">&gt; Beta Cinemas Xuân Thủy, Hà Nội - Hotline 0333 023 183</a></li>
                <li style="margin-bottom: 10px;"><a href="#" style="color: white; text-decoration: none;">&gt; Beta Cinemas Tây Sơn, Hà Nội - Hotline 0976 894 773</a></li>
                <li style="margin-bottom: 10px;"><a href="#" style="color: white; text-decoration: none;">&gt; Beta Cinemas Vĩnh Yên, Phú Thọ - Hotline 0977 632 215</a></li>
                <li style="margin-bottom: 10px;"><a href="#" style="color: white; text-decoration: none;">&gt; Beta Cinemas Ung Văn Khiêm, TP Hồ Chí Minh - Hotline 0969 874 873</a></li>
                <li style="margin-bottom: 10px;"><a href="#" style="color: white; text-decoration: none;">&gt; Beta Cinemas Lào Cai - Hotline 0358 968 970</a></li>
                <li style="margin-bottom: 10px;"><a href="#" style="color: white; text-decoration: none;">&gt; Beta Cinemas Trần Quang Khải, TP Hồ Chí Minh - Hotline 1900 638 362</a></li>
                <li style="margin-bottom: 10px;"><a href="#" style="color: white; text-decoration: none;">&gt; Beta Cinemas TRMall Phú Quốc, An Giang - Hotline 0983 474 440</a></li>
                <li style="margin-bottom: 10px;"><a href="#" style="color: white; text-decoration: none;">&gt; Beta Cinemas Empire Bình Dương, TP Hồ Chí Minh - Hotline 0784 531 525</a></li>
                <li style="margin-bottom: 10px;"><a href="#" style="color: white; text-decoration: none;">&gt; Beta Cinemas Quang Trung, TP Hồ Chí Minh - Hotline 0706 075 509</a></li>
                <li style="margin-bottom: 10px;"><a href="#" style="color: white; text-decoration: none;">&gt; Beta Cinemas Giải Phóng, Hà Nội - Hotline 0585 680 360</a></li>
                <li style="margin-bottom: 10px;"><a href="#" style="color: white; text-decoration: none;">&gt; Beta Cinemas Thanh Xuân, Hà Nội - Hotline 082 4812878</a></li>
            </ul>
        </div>

        <!-- Column 3 -->
        <div>
            <h4 style="font-family: 'Montserrat', sans-serif; font-size: 18px; color: var(--pink, #E58FCB); margin: 0 0 10px 0; text-transform: uppercase;">LIÊN HỆ</h4>
            <div style="width: 50px; height: 2px; background: var(--pink, #E58FCB); margin-bottom: 15px;"></div>
            
            <p style="font-family: 'Montserrat', sans-serif; font-weight: 800; margin-bottom: 5px;">CÔNG TY CỔ PHẦN BETA MEDIA</p>
            <p style="margin-top: 0;">Giấy chứng nhận ĐKKD số: 0106633482 - Đăng ký lần đầu ngày 08/09/2014 tại Sở Kế hoạch và Đầu tư Thành phố Hà Nội</p>
            <p>Địa chỉ trụ sở: Tầng 3, số 595, đường Giải Phóng, Phường Tương Mai, Thành phố Hà Nội, Việt Nam</p>
            
            <p style="font-family: 'Montserrat', sans-serif; font-weight: 800; margin-bottom: 5px; margin-top: 20px;">LIÊN HỆ CHĂM SÓC KHÁCH HÀNG:</p>
            <p style="margin: 0;">Hotline: 1900 636807</p>
            <p style="margin: 0;">Email: cskh@betacinemas.vn</p>

            <p style="font-family: 'Montserrat', sans-serif; font-weight: 800; margin-bottom: 5px; margin-top: 20px;">LIÊN HỆ QUẢNG CÁO:</p>
            <p style="margin: 0;">Hotline: 086 2886475</p>
            <p style="margin: 0;">Email: marketing@betacinemas.vn</p>
        </div>
    </div>
    
    <div style="background: rgba(0,0,0,0.2); padding: 20px 0; margin-top: 40px;">
        <div style="max-width: 1600px; margin: 0 auto; padding: 0 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
            <div>
                <p style="margin:0; font-size: 13px;">Copyright © 2026 Beta Cinemas Demo.</p>
            </div>
            <div>
                <!-- Icons mạng xã hội -->
            </div>
        </div>
    </div>
</footer>
<style>
.footer-grid {
    display: grid;
    grid-template-columns: 1fr 2fr 2fr;
    gap: 40px;
}
@media (max-width: 992px) {
    .footer-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 768px) {
    .footer-grid { grid-template-columns: 1fr; }
}

/* Hover effects for main nav */
.main-nav ul li a:hover {
    color: var(--blue) !important;
}

/* Dropdown Menu Hỗ Trợ */
.nav-dropdown {
    position: relative;
    padding: 10px 0;
}
.dropdown-menu-support {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    min-width: 260px;
    background: white;
    box-shadow: 0 6px 20px rgba(0,0,0,0.12);
    border-radius: 6px;
    list-style: none;
    margin: 0;
    padding: 8px 0;
    z-index: 1001;
    border-top: 3px solid #03599d;
}
.nav-dropdown:hover .dropdown-menu-support {
    display: block;
}
.dropdown-menu-support li a {
    display: block;
    padding: 10px 18px;
    font-family: 'Be Vietnam Pro', sans-serif !important;
    font-size: 14px !important;
    font-weight: 600 !important;
    color: #333 !important;
    text-decoration: none !important;
    transition: background 0.15s, color 0.15s;
    white-space: nowrap;
}
.dropdown-menu-support li a:hover {
    background: #e3f2fd;
    color: #03599d !important;
}
</style>
    `;
    document.body.insertAdjacentHTML('beforeend', footerHtml);

    // 2. Load dạnh sách rạp
    if (typeof DemoData !== 'undefined' && document.getElementById('header-cinema-select')) {
        const select = document.getElementById('header-cinema-select');
        select.innerHTML = DemoData.cinemas.map(c => `<option value="${c.name}">${c.name}</option>`).join('');

        let currentCin = localStorage.getItem('selectedCinema');
        if (!currentCin) {
            currentCin = DemoData.cinemas[0].name;
            localStorage.setItem('selectedCinema', currentCin);
        }
        select.value = currentCin;
    }

        // 3. Hiển thị Trạng thái Đăng nhập
    updateAuthUI();

    // 4. Khởi tạo Smart Sticky Header
    initSmartHeader();
});

function initSmartHeader() {
    const header = document.getElementById('site-header');
    if (!header) return;

    let lastScrollY = Math.max(0, window.pageYOffset || document.documentElement.scrollTop);
    let isHidden = false;

    window.addEventListener('scroll', () => {
        const currentScrollY = Math.max(0, window.pageYOffset || document.documentElement.scrollTop);
        const diff = currentScrollY - lastScrollY;

        // Gần đầu trang -> hiện bình thường
        if (currentScrollY <= 35) {
            if (isHidden) {
                header.classList.remove('header-hidden');
                header.classList.remove('header-visible');
                isHidden = false;
            }
        }
        // Cuộn xuống -> ẩn đi (không chạy theo)
        else if (diff > 8 && currentScrollY > 80) {
            if (!isHidden) {
                header.classList.add('header-hidden');
                header.classList.remove('header-visible');
                isHidden = true;
            }
        }
        // Cuộn ngược trở lại -> trượt xuống hiện lên
        else if (diff < -8) {
            if (isHidden) {
                header.classList.remove('header-hidden');
                header.classList.add('header-visible');
                isHidden = false;
            }
        }

        lastScrollY = currentScrollY;
    }, { passive: true });
}

window.setLoc = function (type, val) {
    if (type === 'cinema') {
        localStorage.setItem('selectedCinema', val);
        window.location.reload();
    }
};

window.updateAuthUI = function () {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    const guestSpan = document.getElementById('nav-user-guest');
    const infoSpan = document.getElementById('nav-user-info');
    if (user) {
        guestSpan.style.display = 'none';
        infoSpan.style.display = 'inline';
        document.getElementById('nav-username').innerText = user.name || user.email;
        checkUnread();
    } else {
        guestSpan.style.display = 'inline';
        infoSpan.style.display = 'none';
    }
};

window.logout = async function (e) {
    if (e && e.preventDefault) e.preventDefault();
    try {
        if (window.API && API.post) {
            await API.post('/auth/logout');
        }
    } catch (_err) {}
    localStorage.removeItem('currentUser');
    if (typeof Notify !== 'undefined' && Notify.success) {
        Notify.success("Đã đăng xuất.");
    }
    updateAuthUI();
    if (window.location.pathname.includes('my-orders') || window.location.pathname.includes('inbox')) {
        window.location.href = 'index.html';
    }
};

window.checkUnread = function () {
    const unreadCount = parseInt(localStorage.getItem('unreadCount') || '0');
    const badge = document.getElementById('bell-badge');
    if (badge) {
        if (unreadCount > 0) {
            badge.innerText = unreadCount;
            badge.style.display = 'inline';
        } else {
            badge.style.display = 'none';
        }
    }
};
