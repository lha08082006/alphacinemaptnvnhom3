with open('css/hero.css', 'r', encoding='utf-8') as f:
    text = f.read()

import re

text = re.sub(r'\.banner-slider \{[^\}]+\}', '.banner-slider {\n    width: 100%;\n    max-width: 100%;\n    margin: 0 0 30px 0;\n    padding: 0;\n    position: relative;\n    overflow: hidden;\n}', text)

text = re.sub(r'\.banner-slides \{[^\}]+\}', '.banner-slides {\n    position: relative;\n    width: 100%;\n    padding-bottom: 30%; /* typical 1920x576 ratio */\n    border-radius: 0;\n    overflow: hidden;\n}', text)

with open('css/hero.css', 'w', encoding='utf-8') as f:
    f.write(text)