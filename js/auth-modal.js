// js/auth-modal.js - Modal Đăng nhập / Đăng ký Beta Cinemas
'use strict';

(function () {
    let loginCaptchaText = '';
    let registerCaptchaText = '';

    const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    function generateRandomCode(len = 6) {
        let code = '';
        for (let i = 0; i < len; i++) {
            code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
        }
        return code;
    }

    function drawCaptcha(canvasId, code) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;

        // Nền nhẹ có ô lưới caro
        ctx.fillStyle = '#e8f5e9';
        ctx.fillRect(0, 0, w, h);

        // Vẽ lưới caro mờ
        ctx.strokeStyle = '#c8e6c9';
        ctx.lineWidth = 1;
        for (let x = 10; x < w; x += 15) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = 10; y < h; y += 10) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Vẽ các đường gạch nhiễu
        for (let i = 0; i < 4; i++) {
            ctx.strokeStyle = ['#81c784', '#a5d6a7', '#66bb6a', '#4caf50'][i % 4];
            ctx.beginPath();
            ctx.moveTo(Math.random() * w, Math.random() * h);
            ctx.lineTo(Math.random() * w, Math.random() * h);
            ctx.stroke();
        }

        // Vẽ từng ký tự với góc xoay nhẹ
        const charSpacing = (w - 20) / code.length;
        ctx.font = 'bold 22px Arial, sans-serif';
        ctx.textBaseline = 'middle';

        for (let i = 0; i < code.length; i++) {
            const char = code[i];
            const x = 12 + i * charSpacing;
            const y = h / 2 + (Math.random() * 6 - 3);
            const angle = (Math.random() * 30 - 15) * (Math.PI / 180);

            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            ctx.fillStyle = ['#1b5e20', '#2e7d32', '#004d40', '#33691e'][i % 4];
            ctx.fillText(char, 0, 0);
            ctx.restore();
        }
    }

    function refreshLoginCaptcha() {
        loginCaptchaText = generateRandomCode(6);
        drawCaptcha('auth-login-captcha-canvas', loginCaptchaText);
        const input = document.getElementById('auth-login-captcha-input');
        if (input) input.value = '';
    }

    function refreshRegisterCaptcha() {
        registerCaptchaText = generateRandomCode(6);
        drawCaptcha('auth-register-captcha-canvas', registerCaptchaText);
        const input = document.getElementById('auth-register-captcha-input');
        if (input) input.value = '';
    }

    window.openAuthModal = function (tab = 'login') {
        const modal = document.getElementById('auth-modal');
        if (!modal) return;
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
        window.switchAuthTab(tab);
    };

    window.closeAuthModal = function () {
        const modal = document.getElementById('auth-modal');
        if (!modal) return;
        modal.classList.remove('show');
        document.body.style.overflow = '';
    };

    window.switchAuthTab = function (tab) {
        const tabLoginBtn = document.getElementById('auth-tab-btn-login');
        const tabRegisterBtn = document.getElementById('auth-tab-btn-register');
        const panelLogin = document.getElementById('auth-panel-login');
        const panelRegister = document.getElementById('auth-panel-register');

        // Reset error messages
        const errLogin = document.getElementById('auth-login-error');
        if (errLogin) { errLogin.style.display = 'none'; errLogin.innerText = ''; }
        const errReg = document.getElementById('auth-register-error');
        if (errReg) { errReg.style.display = 'none'; errReg.innerText = ''; }

        if (tab === 'register') {
            tabLoginBtn?.classList.remove('active');
            tabRegisterBtn?.classList.add('active');
            panelLogin?.classList.remove('active');
            panelRegister?.classList.add('active');
            refreshRegisterCaptcha();
        } else {
            tabRegisterBtn?.classList.remove('active');
            tabLoginBtn?.classList.add('active');
            panelRegister?.classList.remove('active');
            panelLogin?.classList.add('active');
            refreshLoginCaptcha();
        }
    };

    window.demoSocialLogin = function (provider = 'Facebook') {
        const demoUser = {
            id: 99,
            name: `${provider} User`,
            email: `user.${provider.toLowerCase()}@betacinemas.vn`,
            role: 'CUSTOMER',
        };
        localStorage.setItem('currentUser', JSON.stringify(demoUser));
        if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
        alert(`Đăng nhập thành công với tài khoản ${provider}!`);
        window.closeAuthModal();
    };

    window.updateAuthUI = function () {
        const userStr = localStorage.getItem('currentUser');
        const guestSpan = document.getElementById('nav-user-guest');
        const infoSpan = document.getElementById('nav-user-info');
        const usernameSpan = document.getElementById('nav-username');

        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                if (guestSpan) guestSpan.style.display = 'none';
                if (infoSpan) infoSpan.style.display = 'inline-flex';
                if (usernameSpan) usernameSpan.innerText = user.name || user.email || 'Thành viên';
                return;
            } catch (e) {}
        }

        if (guestSpan) guestSpan.style.display = 'inline';
        if (infoSpan) infoSpan.style.display = 'none';
    };

    window.logout = async function (e) {
        if (e && e.preventDefault) e.preventDefault();
        try {
            if (window.API && API.post) {
                await API.post('/auth/logout');
            }
        } catch (_err) {}
        localStorage.removeItem('currentUser');
        window.updateAuthUI();
        alert('Đã đăng xuất tài khoản thành công.');
    };

    function initAuthEvents() {
        // Đóng khi click ngoài backdrop
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) window.closeAuthModal();
            });
        }

        // Phím Escape để đóng
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') window.closeAuthModal();
        });

        // Nút refresh captcha
        document.getElementById('auth-login-captcha-refresh')?.addEventListener('click', refreshLoginCaptcha);
        document.getElementById('auth-login-captcha-canvas')?.addEventListener('click', refreshLoginCaptcha);
        document.getElementById('auth-register-captcha-refresh')?.addEventListener('click', refreshRegisterCaptcha);
        document.getElementById('auth-register-captcha-canvas')?.addEventListener('click', refreshRegisterCaptcha);

        // Submit Login Form
        const loginForm = document.getElementById('auth-login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('auth-login-email').value.trim();
                const password = document.getElementById('auth-login-password').value;
                const captchaInput = document.getElementById('auth-login-captcha-input').value.trim().toUpperCase();
                const errBox = document.getElementById('auth-login-error');
                const submitBtn = document.getElementById('auth-login-submit-btn');

                errBox.style.display = 'none';

                // Kiểm tra Captcha
                if (captchaInput !== loginCaptchaText.toUpperCase()) {
                    errBox.className = 'auth-msg-box error';
                    errBox.innerText = 'Mã xác thực không chính xác. Vui lòng thử lại!';
                    errBox.style.display = 'block';
                    refreshLoginCaptcha();
                    return;
                }

                submitBtn.disabled = true;
                submitBtn.innerText = 'ĐANG ĐĂNG NHẬP...';

                try {
                    let user = null;
                    if (window.API && API.post) {
                        const res = await API.post('/auth/login', { email, password });
                        user = res.user || res;
                    } else {
                        user = {
                            id: 1,
                            name: email.split('@')[0],
                            email: email,
                            role: 'CUSTOMER',
                        };
                    }

                    localStorage.setItem('currentUser', JSON.stringify(user));
                    if (typeof window.updateAuthUI === 'function') window.updateAuthUI();

                    alert(`Đăng nhập thành công! Xin chào ${user.name || user.email}`);
                    window.closeAuthModal();

                    // Nếu đang ở màn hình đặt vé hoặc giỏ hàng, tải lại
                    if (window.location.hash.includes('booking') && typeof window.renderBookingSeatMap === 'function') {
                        window.renderBookingSeatMap();
                    }

                } catch (err) {
                    // Fallback đăng nhập tài khoản demo nếu backend offline
                    if (password === 'Password@123') {
                        const fallbackUser = {
                            id: 1,
                            name: email.split('@')[0],
                            email: email,
                            role: 'CUSTOMER',
                        };
                        localStorage.setItem('currentUser', JSON.stringify(fallbackUser));
                        if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
                        alert(`Đăng nhập thành công! Xin chào ${fallbackUser.name}`);
                        window.closeAuthModal();
                        return;
                    }

                    errBox.className = 'auth-msg-box error';
                    errBox.innerText = err.message || 'Email hoặc mật khẩu không chính xác.';
                    errBox.style.display = 'block';
                    refreshLoginCaptcha();
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.innerText = 'ĐĂNG NHẬP BẰNG TÀI KHOẢN';
                }
            });
        }

        // Submit Register Form
        const regForm = document.getElementById('auth-register-form');
        if (regForm) {
            regForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const name = document.getElementById('auth-reg-name').value.trim();
                const email = document.getElementById('auth-reg-email').value.trim();
                const password = document.getElementById('auth-reg-password').value;
                const confirmPassword = document.getElementById('auth-reg-confirm-password').value;
                const phone = document.getElementById('auth-reg-phone').value.trim();
                const dob = document.getElementById('auth-reg-dob').value;
                const gender = document.getElementById('auth-reg-gender').value;
                const terms = document.getElementById('auth-reg-terms').checked;
                const captchaInput = document.getElementById('auth-register-captcha-input').value.trim().toUpperCase();
                const errBox = document.getElementById('auth-register-error');
                const submitBtn = document.getElementById('auth-reg-submit-btn');

                errBox.style.display = 'none';

                if (!terms) {
                    errBox.className = 'auth-msg-box error';
                    errBox.innerText = 'Quý khách vui lòng đồng ý với các Điều khoản & Chính sách bảo mật của Beta Cinemas!';
                    errBox.style.display = 'block';
                    return;
                }

                if (password !== confirmPassword) {
                    errBox.className = 'auth-msg-box error';
                    errBox.innerText = 'Mật khẩu xác nhận không khớp!';
                    errBox.style.display = 'block';
                    return;
                }

                if (captchaInput !== registerCaptchaText.toUpperCase()) {
                    errBox.className = 'auth-msg-box error';
                    errBox.innerText = 'Mã xác thực không chính xác. Vui lòng nhập lại!';
                    errBox.style.display = 'block';
                    refreshRegisterCaptcha();
                    return;
                }

                submitBtn.disabled = true;
                submitBtn.innerText = 'ĐANG ĐĂNG KÝ...';

                try {
                    let user = null;
                    if (window.API && API.post) {
                        const res = await API.post('/auth/register', {
                            name,
                            email,
                            password,
                            phone,
                            dob,
                            gender,
                        });
                        user = res.user || res;
                    } else {
                        user = {
                            id: Date.now(),
                            name,
                            email,
                            phone,
                            role: 'CUSTOMER',
                        };
                    }

                    localStorage.setItem('currentUser', JSON.stringify(user));
                    if (typeof window.updateAuthUI === 'function') window.updateAuthUI();

                    alert(`Đăng ký tài khoản thành công! Chào mừng ${name} gia nhập thành viên Beta Cinemas.`);
                    window.closeAuthModal();

                } catch (err) {
                    errBox.className = 'auth-msg-box error';
                    errBox.innerText = err.message || 'Không thể đăng ký tài khoản. Vui lòng thử lại sau.';
                    errBox.style.display = 'block';
                    refreshRegisterCaptcha();
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.innerText = 'ĐĂNG KÝ';
                }
            });
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        initAuthEvents();
        window.updateAuthUI();
    });
})();
