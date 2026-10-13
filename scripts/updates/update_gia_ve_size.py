import re

with open('gia-ve.html', 'r', encoding='utf-8') as f:
    text = f.read()

# Thay đổi CSS: Thêm width: 100% để hình ảnh luôn giãn to hết cỡ theo container
text = text.replace('max-width: 100%;', 'width: 100%;\n            max-width: 1000px; /* BẠN CÓ THỂ CHỈNH THÔNG SỐ NÀY ĐỂ TO NHỎ */')

with open('gia-ve.html', 'w', encoding='utf-8') as f:
    f.write(text)