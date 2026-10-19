// js/admin-layout.js

document.addEventListener('DOMContentLoaded', () => {
    // Inject Sidebar & Header
    const layoutHtml = `
        <style>
            body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f6f9; display: flex; height: 100vh; overflow: hidden; }
            .sidebar { width: 250px; background: #2c3e50; color: white; display: flex; flex-direction: column; }
            .sidebar-logo { padding: 20px; font-size: 20px; font-weight: bold; text-align: center; border-bottom: 1px solid #1a252f; background: var(--beta-blue); }
            .sidebar-menu { flex: 1; padding: 10px 0; overflow-y: auto; }
            .menu-item { padding: 15px 20px; display: block; color: #ecf0f1; text-decoration: none; border-left: 4px solid transparent; transition: 0.2s; cursor: pointer; }
            .menu-item:hover { background: #34495e; }
            .menu-item.active { background: #34495e; border-left-color: var(--beta-orange); font-weight: bold; }
            
            .main-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
            .admin-header { background: white; padding: 15px 30px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.05); z-index: 10; }
            .role-selector { display: flex; align-items: center; gap: 10px; }
            .role-selector select { padding: 8px 15px; border-radius: 4px; border: 1px solid #ccc; font-weight: bold; background: #f9f9f9; }
            
            .content-body { flex: 1; padding: 30px; overflow-y: auto; }
            
            .card { background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); margin-bottom: 20px; overflow: hidden; }
            .card-header { padding: 15px 20px; background: #f8f9fa; border-bottom: 1px solid #eee; font-weight: bold; font-size: 16px; color: #333; }
            .card-body { padding: 20px; }
            
            table.admin-table { width: 100%; border-collapse: collapse; }
            table.admin-table th, table.admin-table td { padding: 12px 15px; border-bottom: 1px solid #eee; text-align: left; font-size: 14px; }
            table.admin-table th { background: #f8f9fa; font-weight: bold; color: #555; }
            table.admin-table tr:hover { background: #fcfcfc; }
            
            .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; color: white; }
            .badge.success { background: #4CAF50; }
            .badge.error { background: #F44336; }
            .badge.warning { background: #FF9800; }
            .badge.info { background: #2196F3; }
            .badge.gray { background: #9E9E9E; }
        </style>
        
        <div class="sidebar">
            <div class="sidebar-logo">BETA ADMIN</div>
            <div class="sidebar-menu" id="admin-menu">
                <a href="index.html" class="menu-item" data-roles="ALL,MANAGER">📊 Dashboard</a>
                <a href="reconcile.html" class="menu-item" data-roles="ALL,IT,ACCOUNTANT">🔄 Động cơ Đối soát</a>
                <a href="refunds.html" class="menu-item" data-roles="ALL,CSKH,ACCOUNTANT">💸 Quản lý Hoàn tiền</a>
                <a href="report.html" class="menu-item" data-roles="ALL,ACCOUNTANT,MANAGER">📈 Báo cáo Kế toán</a>
                <a href="cskh.html" class="menu-item" data-roles="ALL,CSKH">🎧 Ticket CSKH</a>
                <a href="../index.html" class="menu-item" style="margin-top: 50px; color: #aaa;">⬅ Về trang Khách hàng</a>
            </div>
        </div>
        
        <div class="main-content">
            <div class="admin-header">
                <div>
                    <strong style="font-size: 18px; color: #333;" id="page-title">Admin Panel</strong>
                    <span style="margin-left: 15px; font-size: 13px; color: #666;">Chế độ hệ thống: <strong id="sys-mode" style="color: var(--beta-blue);">TO-BE</strong></span>
                </div>
                <div class="role-selector">
                    <span style="font-size: 14px; color: #666;">Góc nhìn (Vai trò):</span>
                    <select id="role-select" onchange="filterMenu()">
                        <option value="ALL">Tất cả (Super Admin)</option>
                        <option value="MANAGER">Quản lý</option>
                        <option value="IT">IT Vận hành</option>
                        <option value="ACCOUNTANT">Kế toán</option>
                        <option value="CSKH">Chăm sóc khách hàng</option>
                    </select>
                </div>
            </div>
            
            <div class="content-body" id="app-content">
                <!-- Nội dung các trang sẽ được move vào đây -->
            </div>
        </div>
    `;
    
    // Bọc nội dung hiện tại vào app-content
    const currentBody = document.body.innerHTML;
    document.body.innerHTML = layoutHtml;
    document.getElementById('app-content').innerHTML = currentBody;
    
    // Cập nhật Active Menu
    const currentPath = location.pathname.split('/').pop();
    document.querySelectorAll('.menu-item').forEach(item => {
        if(item.getAttribute('href') === currentPath) {
            item.classList.add('active');
            document.getElementById('page-title').innerText = item.innerText.replace(/[^\w\s\u0100-\u024F\u1E00-\u1EFF]/g, '').trim();
        }
    });
    
    // Đọc mode
    const settings = JSON.parse(localStorage.getItem('demoSettings') || '{}');
    document.getElementById('sys-mode').innerText = settings.mode || 'AS-IS';
    document.getElementById('sys-mode').style.color = (settings.mode === 'TO-BE') ? '#4CAF50' : '#F44336';
    
    // Filter logic
    window.filterMenu = function() {
        const role = document.getElementById('role-select').value;
        localStorage.setItem('adminRole', role);
        document.querySelectorAll('.menu-item').forEach(item => {
            const roles = item.getAttribute('data-roles') || '';
            if (roles.includes('ALL') || roles.includes(role)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    };
    
    const savedRole = localStorage.getItem('adminRole');
    if(savedRole) {
        document.getElementById('role-select').value = savedRole;
    }
    filterMenu();
});
