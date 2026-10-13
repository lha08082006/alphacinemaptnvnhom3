import re

with open('js/layout.js', 'r', encoding='utf-8') as f:
    text = f.read()

new_footer = '''const footerHtml = \
<footer id="site-footer" style="background:#064e96; color:white; padding: 40px 0; margin-top: 50px; font-family: 'Be Vietnam Pro', sans-serif;">
    <div style="max-width: 1300px; margin: 0 auto; padding: 0 15px; display: grid; grid-template-columns: 1fr 1fr 1.5fr; gap: 40px; font-size: 14px; line-height: 1.8;">
        
        <!-- Column 1 -->
        <div>
            <!-- Logo -->
            <div style="margin-bottom: 20px;">
                <svg viewBox="0 0 200 60" style="height: 60px;">
                    <text x="0" y="30" font-family="Montserrat" font-size="28" font-weight="900" fill="white">beta</text>
                    <text x="0" y="55" font-family="Montserrat" font-size="24" font-weight="400" fill="white">cinemas</text>
                    <circle cx="85" cy="15" r="8" fill="#fbc02d" />
                    <rect x="95" y="10" width="10" height="10" fill="#ff4081" transform="rotate(45 100 15)" />
                    <polygon points="120,5 130,20 110,20" fill="#29b6f6" />
                </svg>
            </div>
            
            <ul style="list-style: none; padding: 0; margin: 0;">
                <li style="margin-bottom: 5px;"><a href="#" style="color: white; text-decoration: none;">&gt; Tuyển dụng</a></li>
                <li style="margin-bottom: 5px;"><a href="#" style="color: white; text-decoration: none;">&gt; Giới thiệu</a></li>
                <li style="margin-bottom: 5px;"><a href="#" style="color: white; text-decoration: none;">&gt; Liên hệ</a></li>
                <li style="margin-bottom: 5px;"><a href="#" style="color: white; text-decoration: none;">&gt; F.A.Q</a></li>
                <li style="margin-bottom: 5px;"><a href="#" style="color: white; text-decoration: none;">&gt; Hoạt động xã hội</a></li>
                <li style="margin-bottom: 5px;"><a href="#" style="color: white; text-decoration: none;">&gt; Điều khoản sử dụng</a></li>
                <li style="margin-bottom: 5px;"><a href="#" style="color: white; text-decoration: none;">&gt; Chính sách thanh toán, đổi trả - hoàn vé</a></li>
                <li style="margin-bottom: 5px;"><a href="#" style="color: white; text-decoration: none;">&gt; Liên hệ quảng cáo</a></li>
                <li style="margin-bottom: 5px;"><a href="#" style="color: white; text-decoration: none;">&gt; Điều khoản bảo mật</a></li>
                <li style="margin-bottom: 5px;"><a href="#" style="color: white; text-decoration: none;">&gt; Hướng dẫn đặt vé online</a></li>
            </ul>

            <h4 style="font-family: 'Montserrat', sans-serif; font-size: 18px; color: var(--pink, #E58FCB); margin: 30px 0 10px 0; text-transform: uppercase;">TẢI ỨNG DỤNG</h4>
            <div style="width: 50px; height: 2px; background: var(--pink, #E58FCB); margin-bottom: 15px;"></div>
            <ul style="list-style: none; padding: 0; margin: 0;">
                <li style="margin-bottom: 5px;"><a href="#" style="color: white; text-decoration: none;">&gt; Beta Cinemas cho iOS</a></li>
                <li style="margin-bottom: 5px;"><a href="#" style="color: white; text-decoration: none;">&gt; Beta Cinemas cho Android</a></li>
            </ul>
        </div>

        <!-- Column 2 -->
        <div>
            <h4 style="font-family: 'Montserrat', sans-serif; font-size: 18px; color: var(--pink, #E58FCB); margin: 0 0 10px 0; text-transform: uppercase;">CỤM RẠP BETA</h4>
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
            <p style="margin: 0;">Hotline: 0934 632 682</p>
            <p style="margin: 0;">Email: info@betacinemas.vn</p>

            <p style="font-family: 'Montserrat', sans-serif; font-weight: 800; margin-bottom: 5px; margin-top: 20px;">LIÊN HỆ HỢP TÁC KINH DOANH:</p>
            <p style="margin: 0;">Hotline: 1800 646420</p>
            <p style="margin: 0;">Email: info@betacinemas.vn</p>

            <h4 style="font-family: 'Montserrat', sans-serif; font-size: 18px; color: var(--pink, #E58FCB); margin: 30px 0 10px 0; text-transform: uppercase;">KẾT NỐI VỚI CHÚNG TÔI</h4>
            <div style="width: 50px; height: 2px; background: var(--pink, #E58FCB); margin-bottom: 15px;"></div>
            
            <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                <!-- FB -->
                <a href="#" style="display:inline-block; width:40px; height:40px; border:2px solid white; border-radius:8px; text-align:center; line-height:36px; color:white; text-decoration:none; font-weight:bold; font-size: 20px;">f</a>
                <!-- YT -->
                <a href="#" style="display:inline-block; width:40px; height:40px; border:2px solid white; border-radius:8px; text-align:center; line-height:36px; color:white; text-decoration:none; font-weight:bold; font-size: 20px;">▶</a>
                <!-- TikTok -->
                <a href="#" style="display:inline-block; width:40px; height:40px; border:2px solid white; border-radius:8px; text-align:center; line-height:36px; color:white; text-decoration:none; font-weight:bold; font-size: 20px;">♪</a>
                <!-- IG -->
                <a href="#" style="display:inline-block; width:40px; height:40px; border:2px solid white; border-radius:8px; text-align:center; line-height:36px; color:white; text-decoration:none; font-weight:bold; font-size: 20px;">📷</a>
            </div>

            <!-- BCT Logo Placeholder -->
            <div style="display: flex; align-items: center; gap: 10px;">
                <svg viewBox="0 0 100 100" style="width: 50px; height: 50px;">
                    <circle cx="50" cy="50" r="45" fill="white" />
                    <circle cx="50" cy="50" r="40" fill="#004e9a" />
                    <path d="M 30 50 L 45 65 L 75 35" stroke="white" stroke-width="8" fill="none" />
                </svg>
                <div style="font-size: 12px; line-height: 1.2;">
                    <strong>ĐÃ THÔNG BÁO</strong><br>BỘ CÔNG THƯƠNG
                </div>
            </div>

        </div>
    </div>
    
    <!-- Original Demo Info at the bottom -->
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); text-align: center; font-size: 13px; color: #aaa;">
        Sản phẩm học tập - Không dùng thực tế. Demo Hệ thống xử lý giao dịch treo & Đối soát (Reconciliation).<br>
        <a href="support.html" style="color:var(--pink-soft);">Hỗ trợ khách hàng (CSKH)</a> | <a href="admin/index.html" style="color:var(--pink-soft);">Trang Admin</a>
    </div>
</footer>
\;'''

text = re.sub(r'const footerHtml = .*?;', new_footer, text, flags=re.DOTALL)

with open('js/layout.js', 'w', encoding='utf-8') as f:
    f.write(text)