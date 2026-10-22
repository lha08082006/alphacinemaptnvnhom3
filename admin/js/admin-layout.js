// admin/js/admin-layout.js
'use strict';

(function() {
    const ROLE_LABELS = {
        MANAGER: 'Quản lý (Manager)',
        IT: 'IT Vận hành',
        ACCOUNTANT: 'Kế toán',
        CSKH: 'Chăm sóc khách hàng',
    };

    const ROLE_PERMISSIONS = {
        MANAGER: [
            'index.html',
            'content.html',
            'operations.html',
            'management.html',
            'orders.html',
            'reconcile.html',
            'refunds.html',
            'cskh.html',
            'report.html',
            'settings.html',
            'audit-log.html',
        ],
        IT: [
            'index.html',
            'orders.html',
            'reconcile.html',
            'settings.html',
            'audit-log.html',
        ],
        ACCOUNTANT: [
            'index.html',
            'orders.html',
            'reconcile.html',
            'refunds.html',
            'report.html',
        ],
        CSKH: [
            'index.html',
            'orders.html',
            'refunds.html',
            'cskh.html',
        ],
    };

    window.adminLogout = async function() {
        try {
            if (window.API && API.post) {
                await API.post('/admin/auth/logout');
            }
        } catch (e) {
            console.warn('Lỗi đăng xuất:', e);
        }
        localStorage.removeItem('currentUser');
        window.location.href = 'login.html';
    };

    document.addEventListener('DOMContentLoaded', async () => {
        // Lưu tạm nội dung trang hiện tại trước khi can thiệp DOM
        const currentBodyHtml = document.body.innerHTML;

        // Render bộ khung giao diện chờ trong khi xác thực
        document.body.innerHTML = `
            <style>
                body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f6f9; display: flex; height: 100vh; overflow: hidden; }
                .sidebar { width: 250px; background: #2c3e50; color: white; display: flex; flex-direction: column; }
                .sidebar-logo { padding: 20px; font-size: 20px; font-weight: bold; text-align: center; border-bottom: 1px solid #1a252f; background: #03599d; letter-spacing: 1px; }
                .sidebar-menu { flex: 1; padding: 10px 0; overflow-y: auto; }
                .menu-item { padding: 15px 20px; display: block; color: #ecf0f1; text-decoration: none; border-left: 4px solid transparent; transition: 0.2s; cursor: pointer; font-size: 14px; }
                .menu-item:hover { background: #34495e; }
                .menu-item.active { background: #34495e; border-left-color: #f26b38; font-weight: bold; color: #fff; }
                
                .main-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
                .admin-header { background: white; padding: 14px 30px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.05); z-index: 10; }
                .user-badge { display: flex; align-items: center; gap: 12px; }
                
                .content-body { flex: 1; padding: 25px 30px; overflow-y: auto; }
                
                .card { background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); margin-bottom: 20px; overflow: hidden; border: 1px solid #e9ecef; }
                .card-header { padding: 14px 20px; background: #f8f9fa; border-bottom: 1px solid #eee; font-weight: bold; font-size: 15px; color: #333; }
                .card-body { padding: 20px; }
                
                table.admin-table { width: 100%; border-collapse: collapse; }
                table.admin-table th, table.admin-table td { padding: 12px 15px; border-bottom: 1px solid #eee; text-align: left; font-size: 13.5px; }
                table.admin-table th { background: #f8f9fa; font-weight: 600; color: #555; }
                table.admin-table tr:hover { background: #fcfcfc; }
                
                .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; color: white; display: inline-block; }
                .badge.success { background: #28a745; }
                .badge.error { background: #dc3545; }
                .badge.warning { background: #ffc107; color: #212529; }
                .badge.info { background: #17a2b8; }
                .badge.gray { background: #6c757d; }
                .badge.primary { background: #03599d; }

                .btn { display: inline-block; padding: 7px 14px; border-radius: 4px; font-weight: 600; font-size: 13px; text-decoration: none; cursor: pointer; border: none; transition: 0.2s; }
                .btn-primary { background: #03599d; color: white; }
                .btn-primary:hover { background: #024477; }
                .btn-danger { background: #dc3545; color: white; }
                .btn-danger:hover { background: #bd2130; }
                .btn-success { background: #28a745; color: white; }
                .btn-success:hover { background: #218838; }
            </style>
            
            <div class="sidebar">
                <div class="sidebar-logo">BETA CINEMAS</div>
                <div class="sidebar-menu" id="admin-menu">
                    <a href="index.html" class="menu-item" data-page="index.html">📊 Tổng quan</a>
                    <a href="content.html" class="menu-item" data-page="content.html">🎬 Nội dung</a>
                    <a href="operations.html" class="menu-item" data-page="operations.html">🏢 Vận hành rạp</a>
                    <a href="management.html" class="menu-item" data-page="management.html">👥 Quản trị</a>
                    <a href="orders.html" class="menu-item" data-page="orders.html">🎟️ Đơn hàng</a>
                    <a href="reconcile.html" class="menu-item" data-page="reconcile.html">🔄 Thanh toán / Đối soát</a>
                    <a href="refunds.html" class="menu-item" data-page="refunds.html">💸 Hoàn tiền</a>
                    <a href="cskh.html" class="menu-item" data-page="cskh.html">🎧 CSKH</a>
                    <a href="report.html" class="menu-item" data-page="report.html">📈 Báo cáo</a>
                    <a href="settings.html" class="menu-item" data-page="settings.html">⚙️ Hệ thống</a>
                    <a href="audit-log.html" class="menu-item" data-page="audit-log.html">📋 Nhật ký</a>
                </div>
            </div>
            
            <div class="main-content">
                <div class="admin-header">
                    <div>
                        <strong style="font-size: 18px; color: #333;" id="page-title">Admin Panel</strong>
                        <span style="margin-left: 15px; font-size: 13px; color: #666;">Chế độ hệ thống: <strong id="sys-mode" style="color: #28a745;">TO-BE</strong></span>
                    </div>
                    <div class="user-badge" id="admin-user-info">
                        <span style="font-size: 13px; color: #777;">Đang xác thực tài khoản nhân viên...</span>
                    </div>
                </div>
                
                <div class="content-body" id="app-content">
                    <div style="padding: 40px; text-align: center; color: #777;">
                        Đang xác thực phiên làm việc nội bộ...
                    </div>
                </div>
            </div>
        `;

        // 1. Xác thực người dùng qua API GET /admin/auth/me TRƯỚC KHI RENDER
        // Hoàn toàn không tin tưởng vào localStorage
        try {
            if (typeof API === 'undefined' || !API.get) {
                throw new Error('API client không khả dụng');
            }

            const meRes = await API.get('/admin/auth/me');
            const user = meRes && meRes.user ? meRes.user : null;

            if (!user || user.role === 'CUSTOMER' || !ROLE_PERMISSIONS[user.role]) {
                window.location.href = 'login.html';
                return;
            }

            // Nếu nhân viên có cờ must_change_password -> chuyển sang trang đổi mật khẩu
            const currentPath = location.pathname.split('/').pop() || 'index.html';
            if (user.must_change_password && currentPath !== 'change-password.html') {
                window.location.href = 'change-password.html';
                return;
            }

            window.adminUser = user;

            // Hiển thị thông tin người dùng ở Header
            const userInfoEl = document.getElementById('admin-user-info');
            if (userInfoEl) {
                userInfoEl.innerHTML = `
                    <span style="font-size: 13.5px; color: #444;">
                        Xin chào: <strong style="color: #03599d;">${user.full_name || user.email}</strong>
                    </span>
                    <span class="badge primary">${ROLE_LABELS[user.role] || user.role}</span>
                    <button class="btn btn-danger" onclick="adminLogout()" style="padding: 5px 10px; font-size: 12px; margin-left: 8px;">
                        Đăng xuất
                    </button>
                `;
            }

            // 2. Lọc menu bên trái theo vai trò của người dùng
            const allowedPages = ROLE_PERMISSIONS[user.role] || ['index.html'];

            document.querySelectorAll('#admin-menu .menu-item').forEach(item => {
                const page = item.getAttribute('data-page');
                if (!page) return;

                if (allowedPages.includes(page)) {
                    item.style.display = 'block';
                    if (currentPath === page) {
                        item.classList.add('active');
                        const pageTitleEl = document.getElementById('page-title');
                        if (pageTitleEl) {
                            pageTitleEl.innerText = item.innerText.replace(/[^\w\s\u0100-\u024F\u1E00-\u1EFF]/g, '').trim();
                        }
                    }
                } else {
                    item.style.display = 'none';
                }
            });

            // 3. Kiểm tra quyền truy cập vào trang hiện tại
            if (!allowedPages.includes(currentPath)) {
                const appContent = document.getElementById('app-content');
                if (appContent) {
                    appContent.innerHTML = `
                        <div class="card" style="padding: 40px; text-align: center;">
                            <h3 style="color: #dc3545; margin-bottom: 15px;">403 - KHÔNG CÓ QUYỀN TRUY CẬP</h3>
                            <p style="color: #666; margin-bottom: 20px;">
                                Vai trò <strong>${ROLE_LABELS[user.role] || user.role}</strong> không có quyền xem trang này.
                            </p>
                            <a href="index.html" class="btn btn-primary">Về Trang Tổng Quan</a>
                        </div>
                    `;
                }
                return;
            }

            // 4. Nếu hợp lệ, gắn lại nội dung gốc của trang vào #app-content và phát sự kiện adminReady
            const appContent = document.getElementById('app-content');
            if (appContent) {
                appContent.innerHTML = currentBodyHtml;
            }

            // Kích hoạt sự kiện để các trang con gọi API lấy dữ liệu
            window.dispatchEvent(new CustomEvent('adminReady', { detail: { user } }));

        } catch (err) {
            console.error('Lỗi xác thực quản trị (401 hoặc lỗi phiên):', err);
            window.location.href = 'login.html';
        }
    });
})();
