/**
 * BETA CINEMAS DEMO - COMMON JAVASCRIPT UTILITIES
 * Các hàm tiện ích dùng chung cho giao diện Khách hàng & Quản trị
 */

// 1. Giao tiếp API chuẩn
async function api(url, opts = {}) {
  const headers = opts.headers || {};
  let body = opts.body;

  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const response = await fetch(url, {
    method: opts.method || (body ? 'POST' : 'GET'),
    headers,
    body
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.error || `Lỗi hệ thống (${response.status})`;
    throw new Error(errorMsg);
  }

  return data;
}

// 2. Định dạng tiền tệ VND (luôn là số nguyên)
function formatVND(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '0đ';
  return Number(amount).toLocaleString('vi-VN') + 'đ';
}
const money = formatVND;

// 3. Định dạng thời gian
function formatDateTime(isoString) {
  if (!isoString) return '--:--';
  const d = new Date(isoString);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' +
         d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// 4. Đồng hồ đếm ngược định dạng mm:ss
function formatCountdown(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const remS = s % 60;
  return String(m).padStart(2, '0') + ':' + String(remS).padStart(2, '0');
}

// 5. Thông báo Toast nổi bật
function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// 6. Trình tạo mã QR giả lập (SVG offline không phụ thuộc internet)
function renderFakeQR(text, size = 200) {
  const n = 25, cell = size / n;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const rnd = () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5; h >>>= 0;
    return h;
  };

  let rects = '';
  const inFinder = (x, y) => (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!inFinder(x, y) && (rnd() % 2 === 0)) {
        rects += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}"/>`;
      }
    }
  }

  const finder = (x, y) => `
    <rect x="${x * cell}" y="${y * cell}" width="${7 * cell}" height="${7 * cell}"/>
    <rect x="${(x + 1) * cell}" y="${(y + 1) * cell}" width="${5 * cell}" height="${5 * cell}" fill="#fff"/>
    <rect x="${(x + 2) * cell}" y="${(y + 2) * cell}" width="${3 * cell}" height="${3 * cell}"/>
  `;

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="#111827">
      ${rects}
      ${finder(0, 0)}
      ${finder(n - 7, 0)}
      ${finder(0, n - 7)}
    </svg>
  `;
}

// 7. Quản lý Header khách hàng
async function initCustomerNav() {
  const userBox = document.getElementById('client-nav-user');
  if (!userBox) return;

  try {
    const res = await api('/api/auth/me');
    if (res.ok && res.user) {
      userBox.innerHTML = `
        <div class="user-badge">
          <span>👤 ${res.user.name}</span>
        </div>
        <button class="btn btn-outline btn-sm" style="color:#fff;border-color:rgba(255,255,255,0.3)" onclick="customerLogout()">Đăng xuất</button>
      `;
    } else {
      userBox.innerHTML = `
        <a href="/login" class="btn btn-primary btn-sm">Đăng nhập</a>
      `;
    }
  } catch (e) {
    userBox.innerHTML = `<a href="/login" class="btn btn-primary btn-sm">Đăng nhập</a>`;
  }
}

async function customerLogout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
    showToast('Đã đăng xuất tài khoản.', 'info');
    setTimeout(() => location.href = '/', 600);
  } catch (e) {
    location.reload();
  }
}

// 8. Quản lý Header Admin & Phân quyền
async function initAdminNav(activeNavId) {
  const brandRole = document.getElementById('admin-header-role');
  const userBox = document.getElementById('admin-header-user');

  try {
    const res = await api('/api/admin/auth/me');
    if (!res.ok || !res.user) {
      location.href = '/admin/login';
      return;
    }

    if (brandRole) {
      brandRole.textContent = res.user.role;
    }

    if (userBox) {
      userBox.innerHTML = `
        <span style="font-size:13px;color:#9CA3AF">${res.user.name} [<b>${res.user.role}</b>]</span>
        <button class="btn btn-outline btn-sm" style="color:#F87171;border-color:#4B5563;margin-left:8px" onclick="adminLogout()">Đăng xuất</button>
      `;
    }

    // Ẩn/Hiện menu theo vai trò (Zero-trust RBAC ở UI, Backend đã chặn requireRole)
    const role = res.user.role;
    document.querySelectorAll('[data-role]').forEach(el => {
      const allowedRoles = el.getAttribute('data-role').split(',');
      if (role !== 'MANAGER' && !allowedRoles.includes(role)) {
        el.style.display = 'none';
      }
    });

  } catch (e) {
    location.href = '/admin/login';
  }
}

async function adminLogout() {
  try {
    await api('/api/admin/auth/logout', { method: 'POST' });
    location.href = '/admin/login';
  } catch (e) {
    location.href = '/admin/login';
  }
}

// 9. Lấy tham số Query param từ URL
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}


// 10. TÍNH NĂNG SMART HEADER: Ẩn khi cuộn xuống, hiện khi cuộn ngược lên
function setupSmartHeader() {
  const header = document.querySelector('.header-client, .header-admin');
  if (!header) return;

  let lastScrollY = Math.max(0, window.pageYOffset || document.documentElement.scrollTop);
  let isHidden = false;

  window.addEventListener('scroll', () => {
    const currentScrollY = Math.max(0, window.pageYOffset || document.documentElement.scrollTop);
    const diff = currentScrollY - lastScrollY;

    // Gần đầu trang -> hiện bình thường
    if (currentScrollY <= 30) {
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

document.addEventListener('DOMContentLoaded', setupSmartHeader);
if (document.readyState === 'interactive' || document.readyState === 'complete') {
  setupSmartHeader();
}
