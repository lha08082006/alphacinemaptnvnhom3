import re

with open('index.html', 'r', encoding='utf-8') as f:
    text = f.read()

gia_ve_html = '''
    <!-- Gia ve -->
    <div id="gia-ve" class="container-fluid" style="margin-top: 60px; margin-bottom: 60px;">
        <h2 class="text-center montserrat" style="color: var(--text-navy); font-size: 32px; text-transform: uppercase;">GIÁ VÉ</h2>
        <div style="text-align: center; margin-top: 30px;">
            <img src="images/gia_ve.png" alt="Bảng giá vé" style="max-width: 100%; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
        </div>
    </div>
'''

if 'id="gia-ve"' not in text:
    # Use regex to find the start of the TIN MỚI section
    pattern = re.compile(r'(<div class="container-fluid"[^>]*>\s*<h2[^>]*>.*?TIN M.*?</h2>)')
    text = pattern.sub(gia_ve_html + r'\n    \1', text, count=1)
    
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(text)
        print("Success")