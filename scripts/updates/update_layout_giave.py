with open('js/layout.js', 'r', encoding='utf-8') as f:
    text = f.read()

# Try to find GIÁ VÉ link and change href to index.html#gia-ve
import re
new_text = re.sub(r'<a href="[^"]*"(.*?)>GIÁ VÉ</a>', r'<a href="index.html#gia-ve"\1>GIÁ VÉ</a>', text)

with open('js/layout.js', 'w', encoding='utf-8') as f:
    f.write(new_text)