import re

with open('js/layout.js', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('class="container"', 'class="container-fluid"')
text = text.replace('class="container header-main"', 'class="container-fluid header-main"')
text = text.replace('max-width: 1300px; margin: 0 auto; padding: 0 15px;', 'max-width: 1600px; margin: 0 auto; padding: 0 20px;')

with open('js/layout.js', 'w', encoding='utf-8') as f:
    f.write(text)