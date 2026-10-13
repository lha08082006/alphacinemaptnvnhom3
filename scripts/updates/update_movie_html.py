import re
with open('movie.html', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('alt="">', 'alt="" referrerpolicy="no-referrer">')

with open('movie.html', 'w', encoding='utf-8') as f:
    f.write(text)