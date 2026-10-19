import os
import glob
import re

pages = [
    ('home', 'index.html', 'Trang Chủ'),
    ('schedule', 'schedule.html', 'Lịch Chiếu Theo Rạp'),
    ('cinema', 'cinema.html', 'Hệ Thống Cụm Rạp'),
    ('movie', 'movie.html', 'Chi Tiết Phim'),
    ('gia-ve', 'gia-ve.html', 'Bảng Giá Vé Chuẩn'),
    ('price', 'price.html', 'Chi Tiết Giá Vé & Suất Chiếu'),
    ('booking', 'booking.html', 'Đặt Vé & Chọn Ghế'),
    ('seats', 'seats.html', 'Sơ Đồ Chọn Ghế 2'),
    ('checkout', 'checkout.html', 'Thanh Toán & Chọn Combo'),
    ('gateway', 'gateway.html', 'Cổng VietQR Giả Lập'),
    ('result', 'result.html', 'Kết Quả Giao Dịch'),
    ('ticket', 'ticket.html', 'Vé Xem Phim (E-Ticket)'),
    ('login', 'login.html', 'Đăng Nhập / Đăng Ký Thành Viên'),
    ('my-orders', 'my-orders.html', 'Lịch Sử Đơn Hàng'),
    ('order', 'order.html', 'Chi Tiết & Tra Cứu Đơn'),
    ('inbox', 'inbox.html', 'Hộp Thư Thông Báo'),
    ('support', 'support.html', 'Trung Tâm Trợ Giúp & FAQ'),
    ('promo-t3', 'promotion-detail.html', 'Ưu Đãi Thứ 3 Vui Vẻ'),
    ('promo-hssv', 'promotion-detail-hssv.html', 'Ưu Đãi Học Sinh Sinh Viên'),
    ('promo-combo', 'promotion-detail-combo.html', 'Ưu Đãi Combo'),
    ('admin', 'admin/index.html', 'Quản Trị Hệ Thống'),
    ('admin-reconcile', 'admin/reconcile.html', 'Admin Đối Soát Giao Dịch'),
    ('admin-refunds', 'admin/refunds.html', 'Admin Quản Lý Hoàn Tiền'),
    ('admin-cskh', 'admin/cskh.html', 'Admin Hỗ Trợ Khách Hàng'),
    ('admin-report', 'admin/report.html', 'Admin Báo Cáo Doanh Thu')
]

url_map = {
    'index.html': 'home',
    'schedule.html': 'schedule',
    'cinema.html': 'cinema',
    'movie.html': 'movie',
    'gia-ve.html': 'gia-ve',
    'price.html': 'price',
    'booking.html': 'booking',
    'seats.html': 'seats',
    'checkout.html': 'checkout',
    'gateway.html': 'gateway',
    'result.html': 'result',
    'ticket.html': 'ticket',
    'login.html': 'login',
    'my-orders.html': 'my-orders',
    'order.html': 'order',
    'inbox.html': 'inbox',
    'support.html': 'support',
    'promotion-detail.html': 'promo-t3',
    'promotion-detail-hssv.html': 'promo-hssv',
    'promotion-detail-combo.html': 'promo-combo',
    'admin/index.html': 'admin',
    'admin/reconcile.html': 'admin-reconcile',
    'admin/refunds.html': 'admin-refunds',
    'admin/cskh.html': 'admin-cskh',
    'admin/report.html': 'admin-report',
    'reconcile.html': 'admin-reconcile',
    'refunds.html': 'admin-refunds',
    'cskh.html': 'admin-cskh',
    'report.html': 'admin-report'
}

collected_styles = []
views_html = []
inline_scripts = []

def rewrite_links(html):
    # Rewrite relative links like href="schedule.html" or href="checkout.html?orderId=123"
    for old_url, view_id in url_map.items():
        # Match href="old_url" or href="old_url?query"
        pattern = r'href=[\"\'](?:./)?' + re.escape(old_url) + r'(?:\?([^\"\']*))?[\"\']'
        def repl(match):
            query = match.group(1)
            if query:
                return f'href="#{view_id}?{query}" data-view="{view_id}" data-query="{query}"'
            return f'href="#{view_id}" data-view="{view_id}"'
        html = re.sub(pattern, repl, html, flags=re.IGNORECASE)
        
        # Match location.href = 'old_url' in inline scripts/onlicks
        loc_pattern = r'location\.href\s*=\s*[\"\'](?:./)?' + re.escape(old_url) + r'(?:\?([^\"\']*))?[\"\']'
        def loc_repl(match):
            query = match.group(1)
            if query:
                return f'window.spaNavigate("{view_id}", "{query}")'
            return f'window.spaNavigate("{view_id}")'
        html = re.sub(loc_pattern, loc_repl, html, flags=re.IGNORECASE)

    return html

for vid, fn, title in pages:
    if not os.path.exists(fn):
        continue
    with open(fn, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Collect style blocks
    styles = re.findall(r'<style[^>]*>(.*?)</style>', content, re.DOTALL | re.IGNORECASE)
    for s in styles:
        s_clean = s.strip()
        if s_clean and s_clean not in collected_styles:
            collected_styles.append(f'/* === Style from {fn} ({vid}) === */\n' + s_clean)

    # 2. Extract Body
    body_match = re.search(r'<body[^>]*>(.*?)</body>', content, re.DOTALL | re.IGNORECASE)
    if body_match:
        b_content = body_match.group(1)
        
        # Strip external script tags from body
        b_content = re.sub(r'<script\s+src=[\"\'][^\"\']+[\"\'][^>]*>\s*</script>', '', b_content, flags=re.IGNORECASE)

        # Extract inline script tags
        inlines = re.findall(r'<script(?![^>]*src=)[^>]*>(.*?)</script>', b_content, re.DOTALL | re.IGNORECASE)
        for idx, scr in enumerate(inlines):
            inline_scripts.append((vid, fn, idx, scr.strip()))
            
        # Remove inline script tags from body HTML
        b_content = re.sub(r'<script(?![^>]*src=)[^>]*>.*?</script>', '', b_content, flags=re.DOTALL | re.IGNORECASE)

        # Remove header/footer if they were hardcoded in HTML
        b_content = re.sub(r'<div id=\"top-bar\".*?</div>\s*</div>', '', b_content, flags=re.DOTALL | re.IGNORECASE)
        b_content = re.sub(r'<header id=\"site-header\".*?</header>', '', b_content, flags=re.DOTALL | re.IGNORECASE)
        b_content = re.sub(r'<footer id=\"site-footer\".*?</footer>', '', b_content, flags=re.DOTALL | re.IGNORECASE)

        # Rewrite links
        b_content = rewrite_links(b_content)

        views_html.append(f'''
    <!-- ========================================== -->
    <!-- VIEW: {vid} ({title}) -->
    <!-- ========================================== -->
    <section id="view-{vid}" class="spa-view" data-view-id="{vid}" style="display: none;">
{b_content}
    </section>''')

# Build the unified single HTML document
all_styles_merged = '\n\n'.join(collected_styles)
all_views_merged = '\n'.join(views_html)

# Quick switcher menu items
quick_links_html = ''
for vid, fn, title in pages:
    quick_links_html += f'<button class="spa-quick-btn" onclick="window.spaNavigate(\'{vid}\')">{title}</button>\n'

full_html = f'''<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Beta Cinemas - Nền Tảng Đặt Vé & Thanh Toán Toàn Diện (Single Page Demo)</title>
    
    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Montserrat:wght@400;600;700;800;900&display=swap" rel="stylesheet">
    
    <!-- QRCode JS Library -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>

    <!-- Project Stylesheets -->
    <link rel="stylesheet" href="css/style.css">
    <link rel="stylesheet" href="css/hero.css">
    <link rel="stylesheet" href="css/movie-grid.css">
    <link rel="stylesheet" href="css/trailer.css">
    <link rel="stylesheet" href="css/showtimes-modal.css">
    <link rel="stylesheet" href="css/booking.css">

    <style>
        /* =================================================== */
        /* SPA ROUTING & SHELL STYLES */
        /* =================================================== */
        .spa-view {{
            display: none !important;
            animation: fadeIn 0.25s ease-in-out;
        }}
        .spa-view.active {{
            display: block !important;
        }}
        @keyframes fadeIn {{
            from {{ opacity: 0; transform: translateY(4px); }}
            to {{ opacity: 1; transform: translateY(0); }}
        }}

        /* Thanh Chuyển Nhanh Toàn Diện 24 Trang */
        #spa-quick-bar {{
            background: #0f172a;
            color: #94a3b8;
            padding: 8px 16px;
            font-size: 12px;
            font-family: 'Be Vietnam Pro', sans-serif;
            position: sticky;
            top: 0;
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 10px;
            border-bottom: 2px solid #03599d;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            overflow-x: auto;
            white-space: nowrap;
        }}
        #spa-quick-bar::-webkit-scrollbar {{
            height: 4px;
        }}
        #spa-quick-bar::-webkit-scrollbar-thumb {{
            background: #03599d;
            border-radius: 2px;
        }}
        .spa-quick-title {{
            font-weight: bold;
            color: #38bdf8;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            gap: 6px;
        }}
        .spa-quick-btn {{
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.15);
            color: #e2e8f0;
            padding: 4px 10px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 11px;
            font-family: inherit;
            transition: all 0.2s;
            flex-shrink: 0;
        }}
        .spa-quick-btn:hover, .spa-quick-btn.active {{
            background: #03599d;
            color: #ffffff;
            border-color: #38bdf8;
            font-weight: 600;
        }}

        /* =================================================== */
        /* MERGED STYLES FROM ALL PAGES */
        /* =================================================== */
{all_styles_merged}
    </style>
</head>
<body>

    <!-- 1. THANH ĐIỀU HƯỚNG NHANH CÁC MÀN HÌNH DEMO -->
    <div id="spa-quick-bar">
        <div class="spa-quick-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
            24 TRANG ALL-IN-ONE:
        </div>
{quick_links_html}
    </div>

    <!-- 2. TOP BAR CHUẨN BETA CINEMAS -->
    <div id="top-bar">
        <div class="container-fluid" style="display:flex; justify-content: flex-end; align-items: center; gap: 15px; font-size: 13px;">
            <span id="nav-user-guest" style="display:none;">
                <a href="#login" onclick="window.spaNavigate('login')">Đăng nhập</a> <span style="margin:0 10px;">|</span>
                <a href="#login" onclick="window.spaNavigate('login')">Đăng ký</a>
            </span>
            
            <span id="nav-user-info" style="display:inline-flex; align-items: center; gap: 8px;">
                Xin chào: <span id="nav-username" style="color: white; font-weight: normal;">— luonghonganh</span> <span style="font-size: 10px; margin-left: -4px;">▾</span>
                <a href="#my-orders" onclick="window.spaNavigate('my-orders')" style="color: #ffd166; margin-left: 10px; text-decoration: none; font-weight: 500;">📦 Đơn hàng</a>
                <a href="#inbox" onclick="window.spaNavigate('inbox')" style="color: #ffd166; margin-left: 10px; text-decoration: none; font-weight: 500;">🔔 Thông báo</a>
                <a href="#admin" onclick="window.spaNavigate('admin')" style="color: #38bdf8; margin-left: 10px; text-decoration: none; font-weight: bold; background: rgba(255,255,255,0.15); padding: 2px 8px; border-radius: 4px;">⚙️ Quản trị Admin</a>
            </span>
            
            <span class="flag-icon" title="English" style="width: 22px; height: 14px; display: inline-block; background: url('https://upload.wikimedia.org/wikipedia/en/a/ae/Flag_of_the_United_Kingdom.svg') no-repeat center/cover; cursor: pointer;"></span>
        </div>
    </div>

    <!-- 3. MAIN HEADER -->
    <header id="site-header" style="background: white; padding: 15px 0; box-shadow: 0 2px 10px rgba(0,0,0,0.08); position: sticky; top: 38px; z-index: 1000;">
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
                    <li><a href="#booking" onclick="window.spaNavigate('booking')" class="spa-nav-link" style="text-decoration: none; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 15px; color: #ff5722; background: #fff3e0; padding: 6px 14px; border-radius: 20px;">🎟️ ĐẶT VÉ NGAY</a></li>
                </ul>
            </nav>
        </div>
    </header>

    <!-- 4. KHU VỰC CHỨA CÁC TRANG (SPA VIEWS CONTAINER) -->
    <main id="spa-container">
{all_views_merged}
    </main>

    <!-- 5. CHÂN TRANG FOOTER CHUNG -->
    <footer id="site-footer" style="background:#064e96; color:white; padding: 40px 0; margin-top: 50px; font-family: 'Be Vietnam Pro', sans-serif;">
        <div class="footer-grid" style="max-width: 1600px; margin: 0 auto; padding: 0 20px; font-size: 14px; line-height: 1.8;">
            <div style="text-align: center;">
                <a href="#home" onclick="window.spaNavigate('home')" style="display:inline-block; margin-bottom:20px;">
                    <img alt="Beta Cinemas" style="height: 55px;" src="https://betacinemas.vn/Assets/Common/logo/logo-white.png">
                </a>
                <p style="margin:0 0 10px 0; font-family: 'Montserrat', sans-serif; font-size:16px;"><strong>TUYỂN DỤNG</strong></p>
                <a href="#support" onclick="window.spaNavigate('support')" style="display:inline-block; padding:8px 20px; border:2px solid white; color:white; text-decoration:none; border-radius:20px; font-weight:bold;">ỨNG TUYỂN NGAY</a>
            </div>

            <div>
                <h4 style="font-family: 'Montserrat', sans-serif; font-size: 18px; color: #E58FCB; margin: 0 0 10px 0; text-transform: uppercase;">CÁC RẠP CỦA BETA</h4>
                <div style="width: 50px; height: 2px; background: #E58FCB; margin-bottom: 15px;"></div>
                <ul style="list-style: none; padding: 0; margin: 0;">
                    <li style="margin-bottom: 8px;"><a href="#cinema" onclick="window.spaNavigate('cinema')" style="color: white; text-decoration: none;">&gt; Beta Cinemas Thanh Xuân, Hà Nội - Hotline: 082 4812878</a></li>
                    <li style="margin-bottom: 8px;"><a href="#cinema" onclick="window.spaNavigate('cinema')" style="color: white; text-decoration: none;">&gt; Beta Cinemas Giải Phóng, Hà Nội - Hotline: 0585 680 360</a></li>
                    <li style="margin-bottom: 8px;"><a href="#cinema" onclick="window.spaNavigate('cinema')" style="color: white; text-decoration: none;">&gt; Beta Cinemas Quang Trung, TP Hồ Chí Minh - Hotline: 0706 075 509</a></li>
                    <li style="margin-bottom: 8px;"><a href="#cinema" onclick="window.spaNavigate('cinema')" style="color: white; text-decoration: none;">&gt; Beta Cinemas Ung Văn Khiêm, TP Hồ Chí Minh - Hotline: 0969 874 873</a></li>
                </ul>
            </div>

            <div>
                <h4 style="font-family: 'Montserrat', sans-serif; font-size: 18px; color: #E58FCB; margin: 0 0 10px 0; text-transform: uppercase;">LIÊN HỆ</h4>
                <div style="width: 50px; height: 2px; background: #E58FCB; margin-bottom: 15px;"></div>
                <p style="font-family: 'Montserrat', sans-serif; font-weight: 800; margin-bottom: 5px;">CÔNG TY CỔ PHẦN BETA MEDIA</p>
                <p style="margin: 0;">Hotline CSKH: 1900 636807</p>
                <p style="margin: 0;">Email: cskh@betacinemas.vn</p>
                <p style="margin: 0;">Địa chỉ: Tầng 3, số 595 đường Giải Phóng, Hai Bà Trưng, Hà Nội</p>
            </div>
        </div>
        
        <div style="background: rgba(0,0,0,0.2); padding: 15px 0; margin-top: 30px; text-align: center; font-size: 13px;">
            Copyright © 2026 Beta Cinemas Demo - Single Page Application Consolidated.
        </div>
    </footer>

    <!-- 6. CORE JAVASCRIPT LIBS & LOGIC -->
    <script src="js/clock.js"></script>
    <script src="js/data.js"></script>
    <script src="js/db.js"></script>
    <script src="js/notify.js"></script>
    <script src="js/timer.js"></script>
    <script src="js/hero.js"></script>
    <script src="js/trailer.js"></script>
    <script src="js/movie-grid.js"></script>
    <script src="js/showtimes-modal.js"></script>
    <script src="js/booking.js"></script>
    <script src="js/beta-core.js"></script>
    <script src="js/checkout.js"></script>

    <!-- Admin scripts -->
    <script src="js/admin-index.js"></script>
    <script src="js/admin-reconcile.js"></script>
    <script src="js/admin-refunds.js"></script>
    <script src="js/admin-cskh.js"></script>
    <script src="js/admin-report.js"></script>

    <!-- 7. SPA ROUTER & VIEW CONTROLLER -->
    <script>
        // Danh sách view hợp lệ
        const SPA_VIEWS = {list([v[0] for v in pages])};

        // Hàm điều hướng chính của SPA
        window.spaNavigate = function(viewId, queryString) {{
            if (!viewId) viewId = 'home';
            if (queryString) {{
                window.location.hash = '#' + viewId + '?' + queryString;
            }} else {{
                window.location.hash = '#' + viewId;
            }}
        }};

        // Hàm hiển thị view và khởi tạo tương ứng
        function activateView(viewId, queryParams) {{
            if (!SPA_VIEWS.includes(viewId)) {{
                viewId = 'home';
            }}

            // 1. Ẩn tất cả view, chỉ hiển thị view đích
            document.querySelectorAll('.spa-view').forEach(el => {{
                el.classList.remove('active');
                el.style.display = 'none';
            }});

            const targetView = document.getElementById('view-' + viewId);
            if (targetView) {{
                targetView.classList.add('active');
                targetView.style.display = 'block';
            }}

            // 2. Cập nhật nút trên Quick Bar
            document.querySelectorAll('.spa-quick-btn').forEach(btn => {{
                if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes("'" + viewId + "'")) {{
                    btn.classList.add('active');
                }} else {{
                    btn.classList.remove('active');
                }}
            }});

            // 3. Cuộn lên đầu trang
            window.scrollTo({{ top: 0, behavior: 'smooth' }});

            // 4. Kích hoạt logic riêng của view
            triggerViewLifecycle(viewId, queryParams);
        }}

        // Xử lý các vòng đời khởi tạo khi vào từng màn hình
        function triggerViewLifecycle(viewId, queryParams) {{
            const params = new URLSearchParams(queryParams || window.location.hash.split('?')[1] || window.location.search);

            if (viewId === 'home') {{
                if (typeof initHeroSlider === 'function') initHeroSlider();
                if (typeof renderMovieGrid === 'function') renderMovieGrid();
            }}
            else if (viewId === 'booking') {{
                // Đảm bảo ghế được render và đồng hồ chạy
                if (typeof renderBookingSeatMap === 'function') renderBookingSeatMap();
            }}
            else if (viewId === 'checkout') {{
                // Kích hoạt render combo và tính giá
                if (window.checkoutController && typeof window.checkoutController.init === 'function') {{
                    window.checkoutController.init();
                }}
            }}
            else if (viewId === 'gateway') {{
                initGatewayView(params);
            }}
            else if (viewId === 'result') {{
                initResultView(params);
            }}
            else if (viewId === 'ticket') {{
                initTicketView(params);
            }}
            else if (viewId === 'schedule') {{
                initScheduleView(params);
            }}
            else if (viewId.startsWith('admin')) {{
                // Khởi tạo bảng admin tương ứng
                if (typeof initAdminDashboard === 'function') initAdminDashboard();
            }}
        }}

        // Khởi tạo trang Gateway trong SPA
        function initGatewayView(params) {{
            const txnId = params.get('txn') || 'GW' + Math.random().toString(36).substring(2, 10).toUpperCase();
            const orderId = params.get('orderId') || localStorage.getItem('currentOrder') || '8967511872660710';
            
            let txn = (typeof DB !== 'undefined' && txnId) ? DB.get('gateway_txns', txnId) : null;
            if (!txn && typeof DB !== 'undefined') {{
                let order = DB.get('beta_orders', orderId);
                const amount = (order && order.amount) ? order.amount : 50000;
                txn = {{
                    txnId: txnId,
                    orderId: orderId,
                    amount: amount,
                    status: 'PENDING',
                    debited: false,
                    callback: null,
                    createdAt: new Date().toISOString()
                }};
                DB.insert('gateway_txns', txn);
            }}
            window.currentTxn = txn;

            const lblAmount = document.getElementById('lbl-amount');
            if (lblAmount && txn) {{
                lblAmount.innerText = Number(txn.amount || 50000).toLocaleString('vi-VN') + ' VND';
            }}
            const lblContent = document.getElementById('lbl-content');
            if (lblContent && txn) {{
                lblContent.innerText = 'Thanh toan hoa don ' + (txn.orderId || orderId);
            }}
        }}

        // Khởi tạo trang Result trong SPA
        function initResultView(params) {{
            const orderId = params.get('orderId') || localStorage.getItem('currentOrder');
            const content = document.getElementById('result-content');
            if (!content) return;

            if (!orderId) {{
                content.innerHTML = '<p>Không tìm thấy mã đơn hàng. Vui lòng đặt vé từ trang chủ.</p><button class="btn btn-primary" onclick="window.spaNavigate(\\'home\\')">VỀ TRANG CHỦ</button>';
                return;
            }}

            if (typeof DB !== 'undefined') {{
                const order = DB.get('beta_orders', orderId);
                if (order && order.status === 'PAID') {{
                    content.innerHTML = `
                        <div class="icon-large icon-success" style="font-size: 48px; color: #4CAF50;">✔️</div>
                        <h2 style="color: #4CAF50;">THANH TOÁN THÀNH CÔNG</h2>
                        <p style="margin: 20px 0; font-size: 16px;">Đơn hàng <strong>${{orderId}}</strong> của bạn đã được thanh toán và xuất vé.</p>
                        <button class="btn btn-primary" onclick="window.spaNavigate('ticket', 'orderId=${{orderId}}')">XEM VÉ ĐIỆN TỬ</button>
                    `;
                }}
            }}
        }}

        // Khởi tạo trang Vé điện tử Ticket trong SPA
        function initTicketView(params) {{
            const orderId = params.get('orderId') || localStorage.getItem('currentOrder');
            const qrBox = document.getElementById('qrcode');
            if (qrBox && typeof QRCode !== 'undefined') {{
                qrBox.innerHTML = '';
                new QRCode(qrBox, {{
                    text: orderId || 'BETA-CINEMA-TICKET-2026',
                    width: 140,
                    height: 140,
                    colorDark : "#03599d",
                    colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.H
                }});
            }}
        }}

        // Khởi tạo trang Lịch chiếu Schedule trong SPA
        function initScheduleView(params) {{
            if (typeof renderScheduleData === 'function') {{
                renderScheduleData();
            }}
        }}

        // Bắt sự kiện hashchange để điều hướng không tải lại trang
        function onHashChange() {{
            const fullHash = window.location.hash.replace('#', '') || 'home';
            const parts = fullHash.split('?');
            const viewId = parts[0] || 'home';
            const queryParams = parts[1] || '';
            activateView(viewId, new URLSearchParams(queryParams));
        }}

        window.addEventListener('hashchange', onHashChange);

        // Bắt các cú click vào thẻ <a> liên kết nội bộ
        document.addEventListener('click', function(e) {{
            const link = e.target.closest('a');
            if (!link) return;
            const href = link.getAttribute('href');
            if (!href) return;

            // Nếu href là dạng #view hoặc #view?params
            if (href.startsWith('#')) {{
                e.preventDefault();
                const target = href.replace('#', '');
                const parts = target.split('?');
                window.spaNavigate(parts[0], parts[1] || '');
            }}
        }});

        // Khởi động khi tải xong trang
        document.addEventListener('DOMContentLoaded', () => {{
            // Khởi tạo DB seed nếu chưa có
            if (typeof DB !== 'undefined' && typeof DB.seed === 'function') {{
                DB.seed();
            }}
            onHashChange();
        }});
    </script>
</body>
</html>
'''

# Ghi file app.html
with open('app.html', 'w', encoding='utf-8') as f:
    f.write(full_html)

print(f"SUCCESS: Generated 'app.html' with {len(pages)} consolidated views!")
print(f"File size: {len(full_html)} bytes.")
