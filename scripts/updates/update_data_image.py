import re

with open('js/data.js', 'r', encoding='utf-8') as f:
    text = f.read()

# I will replace posterStyle: { ... }, titleLines: [...] with imageUrl: 'link_anh_o_day.jpg'
text = re.sub(r"posterStyle: \{[^\}]+\}, titleLines: \[.*?\]", "imageUrl: 'link_anh_o_day.jpg'", text)

with open('js/data.js', 'w', encoding='utf-8') as f:
    f.write(text)