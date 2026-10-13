with open('index.html', 'r', encoding='utf-8') as f:
    text = f.read()

old_promo = '''<div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05); border: 1px solid #eee;">
                <div style="height: 200px; background: linear-gradient(45deg, var(--lime), #e8f5e9); display:flex; align-items:center; justify-content:center; color: var(--navy); font-weight:900; font-size: 24px;">KHUY_N MAI TH" 3</div>
                <div style="padding: 20px;">
                    <h3 style="margin:0 0 10px 0; font-size: 18px; color: var(--text-navy);">Beta Ten - ?"ng GiA 50k Thc 3 Vui V</h3>
                    <p style="margin:0; font-size: 14px; color: #666; line-height: 1.6;">A?p dng cho m?i sut chiu 2D vAo ngAy thc 3 hAng tu n ti toAn bT h th
g Beta Cinemas.</p>
                </div>
            </div>'''

# We need to find it despite encoding weirdness in powershell, better to use regex on a substring
import re
pattern = re.compile(r'<div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba\(0,0,0,0\.05\); border: 1px solid #eee;">\s*<div style="height: 200px; background: linear-gradient\(45deg, var\(--lime\).*?</p>\s*</div>\s*</div>', re.DOTALL)

new_promo = '''<div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05); border: 1px solid #eee; display: flex; flex-direction: column;">
                <div style="height: 200px; overflow: hidden;">
                    <img src="images/t3.png" style="width: 100%; height: 100%; object-fit: cover;" alt="Thứ 3 vui vẻ">
                </div>
                <div style="padding: 20px; display: flex; flex-direction: column; flex-grow: 1;">
                    <h3 style="margin:0 0 10px 0; font-size: 18px; color: var(--text-navy);">Thứ 3 vui vẻ - Đồng giá từ 40k</h3>
                    <p style="margin:0 0 15px 0; font-size: 14px; color: #666; line-height: 1.6;">Áp dụng cho mọi suất chiếu 2D vào ngày thứ 3 hàng tuần tại hệ thống Beta Cinemas.</p>
                    <a href="promotion-detail.html" style="margin-top: auto; display: inline-block; text-align: center; background: var(--blue); color: white; padding: 10px; border-radius: 8px; font-weight: bold; text-decoration: none;">XEM CHI TIẾT</a>
                </div>
            </div>'''

text = pattern.sub(new_promo, text)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(text)