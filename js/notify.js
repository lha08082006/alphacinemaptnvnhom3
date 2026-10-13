// js/notify.js

window.showToast = function(msg, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = msg;
    
    container.appendChild(toast);
    
    requestAnimationFrame(() => toast.classList.add('show'));
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// Quản lý thông báo đa kênh (Web, Email, SMS)
window.createMultiChannelNotification = function(orderId, email, title, body) {
    let notifs = JSON.parse(localStorage.getItem('notifications') || '[]');
    const now = VirtualClock.now();
    
    // 1. Web Notification (Gửi ngay lập tức)
    notifs.push({
        id: DB.generateId.ticket(),
        orderId: orderId, email: email, title: title, body: body,
        type: 'WEB', read: false,
        createdAt: now.toISOString()
    });
    
    // 2. Email (Giả lập delay 5s)
    setTimeout(() => {
        let currentNotifs = JSON.parse(localStorage.getItem('notifications') || '[]');
        currentNotifs.push({
            id: DB.generateId.ticket(),
            orderId: orderId, email: email, title: `[EMAIL] ${title}`, body: body,
            type: 'EMAIL', read: false,
            createdAt: VirtualClock.now().toISOString()
        });
        localStorage.setItem('notifications', JSON.stringify(currentNotifs));
        updateBell();
    }, 5000);
    
    // 3. SMS (Giả lập delay 15s)
    setTimeout(() => {
        let currentNotifs = JSON.parse(localStorage.getItem('notifications') || '[]');
        currentNotifs.push({
            id: DB.generateId.ticket(),
            orderId: orderId, email: email, title: `[SMS] ${title}`, body: body,
            type: 'SMS', read: false,
            createdAt: VirtualClock.now().toISOString()
        });
        localStorage.setItem('notifications', JSON.stringify(currentNotifs));
        updateBell();
    }, 15000);

    localStorage.setItem('notifications', JSON.stringify(notifs));
    updateBell();
}

window.updateBell = function() {
    const user = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if(!user) return;
    
    const notifs = JSON.parse(localStorage.getItem('notifications') || '[]');
    const myNotifs = notifs.filter(n => n.email === user.email && !n.read);
    const bellBadge = document.getElementById('bell-badge');
    
    if (bellBadge) {
        bellBadge.innerText = myNotifs.length;
        bellBadge.style.display = myNotifs.length > 0 ? 'inline-block' : 'none';
    }
}

// Chèn đè hàm notification trong betaCore để tận dụng hệ thống đa kênh
document.addEventListener('DOMContentLoaded', () => {
    if (window.betaCore) {
        window.betaCore.createNotification = function(email, message, type) {
            // Mapping sang hệ thống mới
            const title = type === 'success' ? 'Thông báo Thành công' : (type === 'error' ? 'Giao dịch Thất bại' : 'Cập nhật Đơn hàng');
            createMultiChannelNotification('SYSTEM', email, title, message);
        };
    }
    updateBell();
});
