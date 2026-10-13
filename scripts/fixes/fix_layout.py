import re

with open('js/layout.js', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('const footerHtml = <footer', 'const footerHtml = <footer')
text = text.replace('</footer>\n\;', '</footer>\n;')

with open('js/layout.js', 'w', encoding='utf-8') as f:
    f.write(text)