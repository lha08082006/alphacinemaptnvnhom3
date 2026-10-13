import re

with open('index.html', 'r', encoding='utf-8') as f:
    text = f.read()

text = re.sub(r'max-width:\s*1300px;\s*margin:\s*0\s*auto;\s*padding:\s*0\s*15px;', 'max-width: 1600px; margin: 0 auto; padding: 0 20px;', text)
text = text.replace('class="container"', 'class="container-fluid"')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(text)