with open('js/layout.js', 'r', encoding='utf-8') as f:
    text = f.read()

import re
# Tìm và thay thế href của nút GIÁ VÉ
text = re.sub(r'href="[^"]*"(.*?)>GIÁ VÉ</a>', r'href="gia-ve.html"\1>GIÁ VÉ</a>', text)

with open('js/layout.js', 'w', encoding='utf-8') as f:
    f.write(text)