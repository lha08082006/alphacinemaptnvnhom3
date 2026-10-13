import re

with open('index.html', 'r', encoding='utf-8') as f:
    text = f.read()

# Xóa đoạn mã có div id="gia-ve"
pattern = re.compile(r'<!-- Gia ve -->.*?<div id="gia-ve".*?</div>\s*</div>\s*', re.DOTALL)
text = pattern.sub('', text)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(text)