const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.html');
let content = fs.readFileSync(indexPath, 'utf-8');

// 1. Add account.css link
if (!content.includes('account.css')) {
  content = content.replace(
    '<link rel="stylesheet" href="css/style.css">',
    '<link rel="stylesheet" href="css/style.css">\n    <link rel="stylesheet" href="css/account.css">'
  );
  console.log('Added account.css link');
}

// 2. Update Top Bar with user dropdown
const oldTopBarRegex = /<!-- 2\. TOP BAR CHUẨN BETA CINEMAS -->[\s\S]*?<\/header>/;
const newTopBarAndHeader = `<!-- 2. TOP BAR CHUẨN BETA CINEMAS -->
    <div id="top-bar">
        <div class="container-fluid" style="display:flex; justify-content: flex-end; align-items: center; gap: 15px; font-size: 13px;">
            <span id="nav-user-guest">
                <a href="javascript:void(0)" onclick="window.openAuthModal('login')">Đăng nhập</a> <span style="margin:0 10px;">|</span>
                <a href="javascript:void(0)" onclick="window.openAuthModal('register')">Đăng ký</a>
            </span>
            
            <div id="nav-user-info" class="topbar-user-container" style="display:none;">
                <div class="topbar-user-trigger">
                    <span>Xin chào:</span>
                    <b id="nav-username" style="color: #ffd166;">—</b>
                    <span id="nav-user-points-badge" class="topbar-user-points" style="display:none;">50 điểm</span>
                    <span style="font-size: 10px; margin-left: 2px;">▾</span>
                </div>
                <div class="topbar-dropdown-menu">
                    <a href="#account" onclick="window.spaNavigate('account', 'tab=profile');">
                        <span>👤</span> Thông tin tài khoản
                    </a>
                    <a href="#account" onclick="window.spaNavigate('account', 'tab=orders');">
                        <span>🎟️</span> Lịch sử giao dịch
                    </a>
                    <a href="#account" onclick="window.spaNavigate('account', 'tab=password');">
                        <span>🔑</span> Đổi mật khẩu
                    </a>
                    <a href="#inbox" onclick="window.spaNavigate('inbox');">
                        <span>🔔</span> Thông báo
                    </a>
                    <div class="dropdown-divider"></div>
                    <a href="javascript:void(0)" onclick="window.logout(event)" class="logout-link">
                        <span>🚪</span> Đăng xuất
                    </a>
                </div>
            </div>
            
            <span class="flag-icon" title="English" style="width: 22px; height: 14px; display: inline-block; background: url('https://upload.wikimedia.org/wikipedia/en/a/ae/Flag_of_the_United_Kingdom.svg') no-repeat center/cover; cursor: pointer;"></span>
        </div>
    </div>

    <!-- 3. MAIN HEADER -->
    <header id="site-header" style="background: white; padding: 15px 0; box-shadow: 0 2px 10px rgba(0,0,0,0.08); position: sticky; top: 0; z-index: 1000; transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.35s ease; will-change: transform;">
        <div class="container-fluid header-main" style="display: flex; align-items: center; justify-content: center; gap: 35px;">
            <!-- Logo -->
            <a href="#home" onclick="window.spaNavigate('home')" class="logo-box" style="flex-shrink: 0;">
                <img alt="Beta Cinemas" style="height: 65px;" src="https://www.betacinemas.vn/Assets/Common/logo/logo.png">
            </a>
            
            <!-- Selector Rạp -->
            <div class="cinema-selector" style="position: relative; flex-shrink: 0;">
                <select id="header-cinema-select" onchange="if(typeof setLoc==='function') setLoc('cinema', this.value)" style="appearance: none; -webkit-appearance: none; border: 1px solid #ccc; border-radius: 30px; padding: 12px 45px 12px 25px; font-family: 'Be Vietnam Pro', sans-serif; font-size: 15px; font-weight: 500; color: #333; background: white; cursor: pointer; outline: none; min-width: 240px;">
                    <option value="Beta Thanh Xuân">Beta Thanh Xuân</option>
                    <option value="Beta Giải Phóng">Beta Giải Phóng</option>
                    <option value="Beta Mỹ Đình">Beta Mỹ Đình</option>
                    <option value="Beta Quang Trung">Beta Quang Trung</option>
                    <option value="Beta Ung Văn Khiêm">Beta Ung Văn Khiêm</option>
                </select>
                <svg viewBox="0 0 24 24" style="position: absolute; right: 18px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; fill: #666; pointer-events: none;"><path d="M7 10l5 5 5-5z"></path></svg>
            </div>

            <!-- Menu Điều Hướng Chính -->
            <nav class="main-nav">
                <ul style="display: flex; list-style: none; margin: 0; padding: 0; gap: 28px; align-items: center;">
                    <li><a href="#schedule" onclick="window.spaNavigate('schedule')" class="spa-nav-link" style="text-decoration: none; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 15px; color: var(--text-navy);">LỊCH CHIẾU THEO RẠP</a></li>
                    <li><a href="#home" onclick="window.spaNavigate('home')" class="spa-nav-link" style="text-decoration: none; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 15px; color: var(--text-navy);">PHIM</a></li>
                    <li><a href="#cinema" onclick="window.spaNavigate('cinema')" class="spa-nav-link" style="text-decoration: none; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 15px; color: var(--text-navy);">RẠP</a></li>
                    <li><a href="#gia-ve" onclick="window.spaNavigate('gia-ve')" class="spa-nav-link" style="text-decoration: none; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 15px; color: var(--text-navy);">GIÁ VÉ</a></li>
                    <li><a href="#promo-combo" onclick="window.spaNavigate('promo-combo')" class="spa-nav-link" style="text-decoration: none; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 15px; color: var(--text-navy);">TIN MỚI VÀ ƯU ĐÃI</a></li>
                    <li><a href="#account" onclick="window.spaNavigate('account')" class="spa-nav-link" style="text-decoration: none; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 15px; color: var(--text-navy);">THÀNH VIÊN</a></li>
                    <li class="nav-dropdown" style="position: relative;" onmouseenter="const m=this.querySelector('.dropdown-menu-support'); if(m) m.style.display='block';" onmouseleave="const m=this.querySelector('.dropdown-menu-support'); if(m) m.style.display='none';">
                        <a href="support.html" class="spa-nav-link" style="text-decoration: none; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 15px; color: var(--text-navy); display: flex; align-items: center; gap: 4px;">
                            HỖ TRỢ <span style="font-size: 10px;">▾</span>
                        </a>
                        <ul class="dropdown-menu-support" style="display: none; position: absolute; top: 100%; left: 0; min-width: 250px; background: white; box-shadow: 0 4px 15px rgba(0,0,0,0.12); border-radius: 6px; list-style: none; margin: 0; padding: 6px 0; z-index: 1001; border-top: 3px solid #03599d;">
                            <li><a href="support.html" style="display: block; padding: 8px 16px; font-size: 13.5px; color: #333; text-decoration: none; font-weight: 600;">Khiếu nại thanh toán</a></li>
                            <li><a href="support-tracking.html" style="display: block; padding: 8px 16px; font-size: 13.5px; color: #333; text-decoration: none; font-weight: 600;">Theo dõi khiếu nại</a></li>
                            <li><a href="faq.html" style="display: block; padding: 8px 16px; font-size: 13.5px; color: #333; text-decoration: none; font-weight: 600;">Câu hỏi thường gặp về thanh toán</a></li>
                        </ul>
                    </li>
                    <li><a href="#booking" onclick="window.spaNavigate('booking')" class="spa-nav-link" style="text-decoration: none; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 15px; color: #ff5722; background: #fff3e0; padding: 6px 14px; border-radius: 20px;">🎟️ ĐẶT VÉ NGAY</a></li>
                </ul>
            </nav>
        </div>
    </header>`;

if (oldTopBarRegex.test(content)) {
  content = content.replace(oldTopBarRegex, newTopBarAndHeader);
  console.log('Updated Top Bar and Main Header');
} else {
  console.warn('Could not match old Top Bar regex');
}

// 3. Add view-account section
const accountViewHtml = `
    <!-- ========================================== -->
    <!-- VIEW: account (Tài Khoản & Thành Viên Beta Cinemas) -->
    <!-- ========================================== -->
    <section id="view-account" class="spa-view" data-view-id="account" style="display: none;">
        <div class="account-wrapper">
            
            <!-- Trạng thái: Chưa đăng nhập -->
            <div id="account-not-logged" style="display: none; text-align: center; padding: 70px 20px; background: #ffffff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); max-width: 600px; margin: 40px auto; border: 1px solid #e2e8f0;">
                <div style="font-size: 48px; margin-bottom: 15px;">🔒</div>
                <h3 style="font-family: 'Montserrat', sans-serif; font-size: 22px; font-weight: 800; color: #005198; margin-bottom: 10px;">Vui lòng đăng nhập tài khoản</h3>
                <p style="color: #64748b; font-size: 14px; margin-bottom: 25px;">Quý khách vui lòng đăng nhập tài khoản thành viên Beta Cinemas để tra cứu thông tin cá nhân và lịch sử đặt vé.</p>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button type="button" class="btn-save-profile" onclick="window.openAuthModal('login')">
                        ĐĂNG NHẬP NGAY
                    </button>
                    <button type="button" class="btn-save-profile" style="background: #e2e8f0; color: #334155;" onclick="window.openAuthModal('register')">
                        ĐĂNG KÝ TÀI KHOẢN
                    </button>
                </div>
            </div>

            <!-- Trạng thái: Đã đăng nhập (Layout 2 cột) -->
            <div id="account-main-content" class="account-grid">
                
                <!-- CỘT TRÁI: Thẻ Thành Viên & Menu Sidebar -->
                <aside class="account-sidebar">
                    <!-- Thẻ thành viên Beta Member Card -->
                    <div class="beta-member-card">
                        <div class="card-top">
                            <div class="card-logo-text">
                                BETA CINEMAS
                                <span class="card-logo-sub">MEMBER PASS</span>
                            </div>
                            <span class="card-tier-badge" id="card-tier-text">BETA STAR</span>
                        </div>
                        <div class="card-chip"></div>
                        <div class="card-number" id="card-number-display">BC-001-089</div>
                        <div class="card-holder-name" id="card-holder-name">NGUYỄN VĂN A</div>
                        <div class="card-stats-row">
                            <div class="card-stat-item">
                                <span class="card-stat-label">Điểm tích lũy</span>
                                <span class="card-stat-val" id="card-points-display">50 điểm</span>
                            </div>
                            <div class="card-stat-item" style="text-align: right;">
                                <span class="card-stat-label">Tổng chi tiêu 2026</span>
                                <span class="card-stat-val" id="card-spend-display">50.000 ₫</span>
                            </div>
                        </div>
                    </div>

                    <!-- Menu điều hướng Sidebar -->
                    <div class="account-menu-box">
                        <ul class="account-menu-list">
                            <li class="account-menu-item">
                                <a href="javascript:void(0)" class="account-menu-link active" data-tab="profile" onclick="window.switchAccountTab('profile')">
                                    <span class="account-menu-icon">👤</span>
                                    <span>Thông tin tài khoản</span>
                                </a>
                            </li>
                            <li class="account-menu-item">
                                <a href="javascript:void(0)" class="account-menu-link" data-tab="orders" onclick="window.switchAccountTab('orders')">
                                    <span class="account-menu-icon">🎟️</span>
                                    <span>Lịch sử giao dịch</span>
                                </a>
                            </li>
                            <li class="account-menu-item">
                                <a href="javascript:void(0)" class="account-menu-link" data-tab="password" onclick="window.switchAccountTab('password')">
                                    <span class="account-menu-icon">🔑</span>
                                    <span>Đổi mật khẩu</span>
                                </a>
                            </li>
                            <li class="account-menu-item">
                                <a href="javascript:void(0)" class="account-menu-link" onclick="window.logout(event)" style="color: #dc2626;">
                                    <span class="account-menu-icon">🚪</span>
                                    <span>Đăng xuất</span>
                                </a>
                            </li>
                        </ul>
                    </div>
                </aside>

                <!-- CỘT PHẢI: Nội dung chi tiết các tab -->
                <main class="account-content-card">
                    
                    <!-- TAB 1: THÔNG TIN TÀI KHOẢN -->
                    <section id="panel-profile" class="account-panel">
                        <div class="account-panel-header">
                            <h3 class="account-panel-title">THÔNG TIN TÀI KHOẢN</h3>
                        </div>

                        <div id="acc-profile-alert-success" class="acc-alert success"></div>
                        <div id="acc-profile-alert-error" class="acc-alert error"></div>

                        <form id="acc-profile-form">
                            <div class="account-form-grid">
                                <div class="form-group">
                                    <label class="acc-label">Họ và tên *</label>
                                    <input type="text" id="acc-name" class="acc-input" required placeholder="Nhập họ và tên">
                                </div>

                                <div class="form-group">
                                    <label class="acc-label">Địa chỉ Email</label>
                                    <div class="input-with-badge">
                                        <input type="email" id="acc-email" class="acc-input" readonly placeholder="email@domain.com">
                                        <span class="input-verified-badge">✓ Đã xác thực</span>
                                    </div>
                                </div>

                                <div class="form-group">
                                    <label class="acc-label">Số điện thoại *</label>
                                    <input type="tel" id="acc-phone" class="acc-input" required placeholder="0912 345 678" pattern="[0-9]{10,11}">
                                </div>

                                <div class="form-group">
                                    <label class="acc-label">Ngày sinh</label>
                                    <input type="date" id="acc-dob" class="acc-input" value="2000-01-01">
                                </div>

                                <div class="form-group">
                                    <label class="acc-label">Giới tính</label>
                                    <select id="acc-gender" class="acc-select">
                                        <option value="MALE">Nam</option>
                                        <option value="FEMALE">Nữ</option>
                                        <option value="OTHER">Khác</option>
                                    </select>
                                </div>

                                <div class="form-group">
                                    <label class="acc-label">Rạp Beta yêu thích</label>
                                    <select id="acc-cinema" class="acc-select">
                                        <option value="Beta Thanh Xuân">Beta Thanh Xuân (Hà Nội)</option>
                                        <option value="Beta Giải Phóng">Beta Giải Phóng (Hà Nội)</option>
                                        <option value="Beta Mỹ Đình">Beta Mỹ Đình (Hà Nội)</option>
                                        <option value="Beta Quang Trung">Beta Quang Trung (TP.HCM)</option>
                                        <option value="Beta Ung Văn Khiêm">Beta Ung Văn Khiêm (TP.HCM)</option>
                                    </select>
                                </div>

                                <div class="form-group-full" style="margin-top: 15px;">
                                    <button type="submit" id="btn-save-profile" class="btn-save-profile">
                                        LƯU THAY ĐỔI
                                    </button>
                                </div>
                            </div>
                        </form>
                    </section>

                    <!-- TAB 2: LỊCH SỬ GIAO DỊCH (HÀNH TRÌNH ĐIỆN ẢNH) -->
                    <section id="panel-orders" class="account-panel" style="display: none;">
                        <div class="account-panel-header">
                            <h3 class="account-panel-title">HÀNH TRÌNH ĐIỆN ẢNH & LỊCH SỬ GIAO DỊCH</h3>
                        </div>

                        <!-- Bộ lọc giao dịch -->
                        <div class="orders-filter-bar">
                            <div class="filter-group">
                                <span class="filter-label">Thời gian:</span>
                                <select id="order-filter-period" class="filter-select" onchange="window.applyOrdersFilter()">
                                    <option value="ALL">Tất cả thời gian</option>
                                    <option value="30D">30 ngày gần đây</option>
                                    <option value="90D">3 tháng gần đây</option>
                                    <option value="2026">Năm 2026</option>
                                </select>
                            </div>

                            <div class="filter-group">
                                <span class="filter-label">Trạng thái:</span>
                                <select id="order-filter-status" class="filter-select" onchange="window.applyOrdersFilter()">
                                    <option value="ALL">Tất cả trạng thái</option>
                                    <option value="PAID">Đã thanh toán (Thành công)</option>
                                    <option value="PENDING_VERIFY">Đang xử lý / Chờ đối soát</option>
                                    <option value="REFUNDED">Đã hoàn tiền</option>
                                    <option value="FAILED">Thất bại / Hết hạn</option>
                                </select>
                            </div>

                            <div class="filter-search-box">
                                <input type="text" id="order-filter-search" class="filter-search-input" placeholder="Tìm theo mã đơn, phim..." oninput="window.applyOrdersFilter()">
                                <span class="filter-search-icon">🔍</span>
                            </div>
                        </div>

                        <!-- Danh sách đơn hàng -->
                        <div id="orders-list-container" class="orders-container">
                            <!-- Render bằng account.js -->
                        </div>
                    </section>

                    <!-- TAB 3: ĐỔI MẬT KHẨU -->
                    <section id="panel-password" class="account-panel" style="display: none;">
                        <div class="account-panel-header">
                            <h3 class="account-panel-title">ĐỔI MẬT KHẨU TÀI KHOẢN</h3>
                        </div>

                        <div id="acc-pw-alert-success" class="acc-alert success"></div>
                        <div id="acc-pw-alert-error" class="acc-alert error"></div>

                        <form id="acc-password-form" style="max-width: 480px;">
                            <div class="form-group" style="margin-bottom: 18px;">
                                <label class="acc-label">Mật khẩu hiện tại *</label>
                                <input type="password" id="acc-old-pw" class="acc-input" required placeholder="Nhập mật khẩu hiện tại...">
                            </div>

                            <div class="form-group" style="margin-bottom: 18px;">
                                <label class="acc-label">Mật khẩu mới *</label>
                                <input type="password" id="acc-new-pw" class="acc-input" required placeholder="Nhập mật khẩu mới (ít nhất 6 ký tự)...">
                            </div>

                            <div class="form-group" style="margin-bottom: 22px;">
                                <label class="acc-label">Xác nhận mật khẩu mới *</label>
                                <input type="password" id="acc-confirm-pw" class="acc-input" required placeholder="Nhập lại mật khẩu mới...">
                            </div>

                            <button type="submit" id="btn-change-password" class="btn-save-profile">
                                CẬP NHẬT MẬT KHẨU
                            </button>
                        </form>
                    </section>

                </main>
            </div>
        </div>
    </section>
`;

if (!content.includes('id="view-account"')) {
  content = content.replace(
    '<!-- ==========================================\n    <!-- VIEW: login',
    accountViewHtml + '\n    <!-- ==========================================\n    <!-- VIEW: login'
  );
  if (!content.includes('id="view-account"')) {
    // fallback replace
    content = content.replace(
      '<section id="view-login"',
      accountViewHtml + '\n    <section id="view-login"'
    );
  }
  console.log('Added view-account section');
}

// 4. Update view-login to official Beta Cinemas style
const officialViewLoginHtml = `<section id="view-login" class="spa-view" data-view-id="login" style="display: none;">
    <div class="container auth-container" style="max-width: 480px; margin: 40px auto 60px;">
        <div class="card" style="border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 10px 30px rgba(0,0,0,0.08); overflow: hidden;">
            <div style="background: #005198; color: white; text-align: center; padding: 22px 20px;">
                <h3 style="font-family: 'Montserrat', sans-serif; font-size: 20px; font-weight: 800; margin: 0; letter-spacing: 1px;">BETA CINEMAS</h3>
                <div style="font-size: 12px; color: #bfdbfe; margin-top: 4px; letter-spacing: 1px;">CỔNG THÀNH VIÊN ĐIỆN ẢNH</div>
            </div>
            
            <div class="card-body" style="padding: 26px;">
                <!-- Tabs -->
                <div style="display: flex; border-bottom: 2px solid #f1f5f9; margin-bottom: 22px;">
                    <button type="button" id="view-login-tab-btn" class="active" onclick="window.switchViewLoginTab('login')" style="flex: 1; padding: 12px; background: none; border: none; border-bottom: 3px solid #005198; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 14px; color: #005198; cursor: pointer;">
                        ĐĂNG NHẬP
                    </button>
                    <button type="button" id="view-reg-tab-btn" onclick="window.switchViewLoginTab('register')" style="flex: 1; padding: 12px; background: none; border: none; border-bottom: 3px solid transparent; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 14px; color: #94a3b8; cursor: pointer;">
                        ĐĂNG KÝ
                    </button>
                </div>

                <!-- Panel Đăng nhập -->
                <div id="view-login-panel-login">
                    <form id="view-login-form">
                        <div class="form-group" style="margin-bottom: 16px;">
                            <label class="acc-label">Email tài khoản *</label>
                            <input type="email" id="view-login-email" class="acc-input" value="khachhang@gmail.com" required placeholder="Nhập địa chỉ email...">
                        </div>
                        
                        <div class="form-group" style="margin-bottom: 16px;">
                            <label class="acc-label">Mật khẩu *</label>
                            <input type="password" id="view-login-password" class="acc-input" value="Password@123" required placeholder="Nhập mật khẩu...">
                        </div>

                        <div id="view-login-error" class="acc-alert error" style="display: none;"></div>

                        <button type="submit" id="btn-view-login-submit" class="btn-save-profile" style="width: 100%; margin-top: 10px;">
                            ĐĂNG NHẬP
                        </button>

                        <button type="button" class="btn-loginfacebook" onclick="window.demoSocialLogin('Facebook')" style="width: 100%; border: none; border-radius: 10px; color: white; padding: 12px; font-weight: 700; font-size: 14px; cursor: pointer; margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                            ĐĂNG NHẬP BẰNG FACEBOOK
                        </button>
                    </form>

                    <div style="margin-top: 22px; padding: 14px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; color: #475569; line-height: 1.6;">
                        <strong style="color: #f26b38;">Tài khoản Khách Hàng Demo (Pass: Password@123):</strong><br>
                        • Khách hàng: <b>khachhang@gmail.com</b> (Có 100 điểm thưởng)<br>
                        • Khách hàng 2: <b>khachhang2@gmail.com</b>
                    </div>
                </div>

                <!-- Panel Đăng ký -->
                <div id="view-login-panel-reg" style="display: none;">
                    <form id="view-reg-form">
                        <div class="form-group" style="margin-bottom: 14px;">
                            <label class="acc-label">Họ và tên *</label>
                            <input type="text" id="view-reg-name" class="acc-input" required placeholder="Nguyễn Văn A">
                        </div>
                        <div class="form-group" style="margin-bottom: 14px;">
                            <label class="acc-label">Email *</label>
                            <input type="email" id="view-reg-email" class="acc-input" required placeholder="example@email.com">
                        </div>
                        <div class="form-group" style="margin-bottom: 14px;">
                            <label class="acc-label">Số điện thoại *</label>
                            <input type="tel" id="view-reg-phone" class="acc-input" required placeholder="0912 345 678">
                        </div>
                        <div class="form-group" style="margin-bottom: 14px;">
                            <label class="acc-label">Mật khẩu *</label>
                            <input type="password" id="view-reg-password" class="acc-input" required placeholder="Ít nhất 6 ký tự">
                        </div>
                        <div class="form-group" style="margin-bottom: 14px;">
                            <label class="acc-label">Xác nhận mật khẩu *</label>
                            <input type="password" id="view-reg-confirm-pw" class="acc-input" required placeholder="Nhập lại mật khẩu">
                        </div>

                        <div id="view-reg-error" class="acc-alert error" style="display: none;"></div>

                        <button type="submit" id="btn-view-reg-submit" class="btn-save-profile" style="width: 100%; margin-top: 10px;">
                            ĐĂNG KÝ TÀI KHOẢN
                        </button>
                    </form>
                </div>
            </div>
        </div>
    </div>
</section>`;

const oldViewLoginRegex = /<section id="view-login"[\s\S]*?<\/section>/;
if (oldViewLoginRegex.test(content)) {
  content = content.replace(oldViewLoginRegex, officialViewLoginHtml);
  console.log('Updated view-login section');
}

// 5. Add E-Ticket Modal before auth modal
const eTicketModalHtml = `
    <!-- ========================================== -->
    <!-- MODAL VÉ ĐIỆN TỬ E-TICKET QR CODE CHUẨN BETA CINEMAS -->
    <!-- ========================================== -->
    <div id="eticket-modal" class="eticket-modal-backdrop">
        <div class="eticket-paper">
            <div class="eticket-header">
                <button type="button" class="eticket-close-btn" onclick="window.closeETicketModal()">✕</button>
                <div class="eticket-header-title">BETA CINEMAS</div>
                <div class="eticket-header-sub">VÉ XEM PHIM ĐIỆN TỬ (E-TICKET)</div>
            </div>
            
            <div class="eticket-body">
                <h3 id="eticket-movie-title" class="eticket-movie-title">TÊN BỘ PHIM</h3>
                
                <div class="eticket-details-list">
                    <div class="eticket-detail-row">
                        <span class="eticket-detail-label">Mã vé / Đơn hàng:</span>
                        <span id="eticket-order-id" class="eticket-detail-value" style="color: #005198;">BC26100123</span>
                    </div>
                    <div class="eticket-detail-row">
                        <span class="eticket-detail-label">Rạp chiếu:</span>
                        <span id="eticket-cinema" class="eticket-detail-value">Beta Thanh Xuân</span>
                    </div>
                    <div class="eticket-detail-row">
                        <span class="eticket-detail-label">Phòng chiếu:</span>
                        <span id="eticket-room" class="eticket-detail-value">Phòng 01 (2D)</span>
                    </div>
                    <div class="eticket-detail-row">
                        <span class="eticket-detail-label">Suất chiếu:</span>
                        <span id="eticket-time" class="eticket-detail-value">20:00 - 22/10/2026</span>
                    </div>
                    <div class="eticket-detail-row">
                        <span class="eticket-detail-label">Ghế ngồi:</span>
                        <span id="eticket-seats" class="eticket-detail-value" style="color: #d97706;">E05, E06 (VIP)</span>
                    </div>
                    <div class="eticket-detail-row">
                        <span class="eticket-detail-label">Tổng thanh toán:</span>
                        <span id="eticket-total" class="eticket-detail-value" style="color: #059669;">160.000 ₫</span>
                    </div>
                </div>

                <div class="eticket-qr-section">
                    <div id="eticket-qrcode-container" class="eticket-qrcode-canvas"></div>
                    <div class="eticket-barcode-mock">||||| ||| ||||||| |||| ||</div>
                    <div class="eticket-qr-hint">Vui lòng xuất trình mã QR này cho nhân viên soát vé tại cửa rạp</div>
                </div>
            </div>

            <div class="eticket-footer">
                <button type="button" class="btn-save-profile" style="height: 38px; padding: 0 20px; font-size: 13px;" onclick="window.print()">
                    🖨️ IN VÉ
                </button>
                <button type="button" class="btn-save-profile" style="height: 38px; padding: 0 20px; font-size: 13px; background: #64748b;" onclick="window.closeETicketModal()">
                    ĐÓNG LẠI
                </button>
            </div>
        </div>
    </div>
`;

if (!content.includes('id="eticket-modal"')) {
  content = content.replace(
    '<!-- ==========================================\n    <!-- MODAL ĐĂNG NHẬP / ĐĂNG KÝ THÀNH VIÊN',
    eTicketModalHtml + '\n    <!-- ==========================================\n    <!-- MODAL ĐĂNG NHẬP / ĐĂNG KÝ THÀNH VIÊN'
  );
  if (!content.includes('id="eticket-modal"')) {
    content = content.replace('<div id="auth-modal"', eTicketModalHtml + '\n    <div id="auth-modal"');
  }
  console.log('Added eticket-modal');
}

// 6. Update SPA router views and lifecycle
if (!content.includes("'account'")) {
  content = content.replace(
    "const SPA_VIEWS = ['home',",
    "const SPA_VIEWS = ['account', 'thong-tin-tai-khoan', 'home',"
  );
  console.log('Added account to SPA_VIEWS');
}

if (!content.includes("initAccountView(params)")) {
  content = content.replace(
    "else if (viewId === 'my-orders') {\n                initMyOrdersView();\n            }",
    `else if (viewId === 'account' || viewId === 'thong-tin-tai-khoan') {
                if (typeof initAccountView === 'function') initAccountView(params);
            }
            else if (viewId === 'my-orders') {
                window.spaNavigate('account', 'tab=orders');
            }`
  );
  console.log('Updated triggerViewLifecycle for account');
}

// 7. Add account.js script tag
if (!content.includes('account.js')) {
  content = content.replace(
    '<script src="js/auth-modal.js"></script>',
    '<script src="js/auth-modal.js"></script>\n    <script src="js/account.js"></script>'
  );
  console.log('Added account.js script tag');
}

// 8. Add script for view-login tab switcher and submission
const viewLoginScript = `
    <script>
        window.switchViewLoginTab = function(tab) {
            const btnLogin = document.getElementById('view-login-tab-btn');
            const btnReg = document.getElementById('view-reg-tab-btn');
            const panelLogin = document.getElementById('view-login-panel-login');
            const panelReg = document.getElementById('view-login-panel-reg');
            if (tab === 'register') {
                btnLogin.style.color = '#94a3b8';
                btnLogin.style.borderBottomColor = 'transparent';
                btnReg.style.color = '#005198';
                btnReg.style.borderBottomColor = '#005198';
                panelLogin.style.display = 'none';
                panelReg.style.display = 'block';
            } else {
                btnReg.style.color = '#94a3b8';
                btnReg.style.borderBottomColor = 'transparent';
                btnLogin.style.color = '#005198';
                btnLogin.style.borderBottomColor = '#005198';
                panelReg.style.display = 'none';
                panelLogin.style.display = 'block';
            }
        };

        document.addEventListener('DOMContentLoaded', () => {
            const vLoginForm = document.getElementById('view-login-form');
            if (vLoginForm) {
                vLoginForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const email = document.getElementById('view-login-email').value.trim();
                    const password = document.getElementById('view-login-password').value;
                    const errBox = document.getElementById('view-login-error');
                    const btn = document.getElementById('btn-view-login-submit');

                    errBox.style.display = 'none';
                    btn.disabled = true;
                    btn.innerText = 'ĐANG ĐĂNG NHẬP...';

                    try {
                        let user = null;
                        if (window.API && API.post) {
                            const res = await API.post('/auth/login', { email, password });
                            user = res.user || res;
                        } else {
                            user = { id: 1, name: email.split('@')[0], email, role: 'CUSTOMER' };
                        }

                        localStorage.setItem('currentUser', JSON.stringify(user));
                        if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
                        alert('Đăng nhập thành công! Xin chào ' + (user.name || user.email));
                        window.spaNavigate('account');
                    } catch (err) {
                        errBox.innerText = err.message || 'Email hoặc mật khẩu không chính xác.';
                        errBox.style.display = 'block';
                    } finally {
                        btn.disabled = false;
                        btn.innerText = 'ĐĂNG NHẬP';
                    }
                });
            }

            const vRegForm = document.getElementById('view-reg-form');
            if (vRegForm) {
                vRegForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const name = document.getElementById('view-reg-name').value.trim();
                    const email = document.getElementById('view-reg-email').value.trim();
                    const phone = document.getElementById('view-reg-phone').value.trim();
                    const password = document.getElementById('view-reg-password').value;
                    const confirmPw = document.getElementById('view-reg-confirm-pw').value;
                    const errBox = document.getElementById('view-reg-error');
                    const btn = document.getElementById('btn-view-reg-submit');

                    errBox.style.display = 'none';
                    if (password !== confirmPw) {
                        errBox.innerText = 'Mật khẩu xác nhận không khớp!';
                        errBox.style.display = 'block';
                        return;
                    }

                    btn.disabled = true;
                    btn.innerText = 'ĐANG ĐĂNG KÝ...';

                    try {
                        let user = null;
                        if (window.API && API.post) {
                            const res = await API.post('/auth/register', { name, email, password, phone });
                            user = res.user || res;
                        } else {
                            user = { id: Date.now(), name, email, phone, role: 'CUSTOMER' };
                        }

                        localStorage.setItem('currentUser', JSON.stringify(user));
                        if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
                        alert('Đăng ký tài khoản thành công! Chào mừng ' + name + ' gia nhập Beta Cinemas.');
                        window.spaNavigate('account');
                    } catch (err) {
                        errBox.innerText = err.message || 'Lỗi khi đăng ký tài khoản.';
                        errBox.style.display = 'block';
                    } finally {
                        btn.disabled = false;
                        btn.innerText = 'ĐĂNG KÝ TÀI KHOẢN';
                    }
                });
            }
        });
    </script>
`;

if (!content.includes('switchViewLoginTab')) {
  content = content.replace('</body>', viewLoginScript + '\n</body>');
  console.log('Added view-login script');
}

fs.writeFileSync(indexPath, content, 'utf-8');
console.log('Successfully updated index.html');
