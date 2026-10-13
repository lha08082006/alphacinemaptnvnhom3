import re

with open('index.html', 'r', encoding='utf-8') as f:
    text = f.read()

pattern = re.compile(r'<div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba\(0,0,0,0\.05\); border: 1px solid #eee;">\s*<div style="height: 200px; background: linear-gradient\(45deg, var\(--pink-soft\).*?</p>\s*</div>\s*</div>', re.DOTALL)

new_promo = '''<div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05); border: 1px solid #eee; display: flex; flex-direction: column;">
                <div style="height: 200px; overflow: hidden;">
                    <img src="images/hssv.png" style="width: 100%; height: 100%; object-fit: cover;" alt="Học sinh - Sinh viên">
                </div>
                <div style="padding: 20px; display: flex; flex-direction: column; flex-grow: 1;">
                    <h3 style="margin:0 0 10px 0; font-size: 18px; color: var(--text-navy);">Học sinh - Sinh viên - Đồng giá từ 40k</h3>
                    <p style="margin:0 0 15px 0; font-size: 14px; color: #666; line-height: 1.6;">Xuất trình thẻ Học sinh / Sinh viên hoặc CCCD dưới 22 tuổi để nhận ưu đãi đặc quyền.</p>
                    <a href="promotion-detail-hssv.html" style="margin-top: auto; display: inline-block; text-align: center; background: var(--blue); color: white; padding: 10px; border-radius: 8px; font-weight: bold; text-decoration: none;">XEM CHI TIẾT</a>
                </div>
            </div>'''

text = pattern.sub(new_promo, text)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(text)