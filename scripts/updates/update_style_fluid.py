import re

with open('css/style.css', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('.container { width: 100%; max-width: 1200px; margin: 0 auto; padding: 0 15px; }', 
    '.container { width: 100%; max-width: 1200px; margin: 0 auto; padding: 0 15px; }\n.container-fluid { width: 100%; max-width: 1600px; margin: 0 auto; padding: 0 20px; }')

# Fix #top-bar .container to also apply to #top-bar .container-fluid
text = text.replace('#top-bar .container {', '#top-bar .container, #top-bar .container-fluid {')

with open('css/style.css', 'w', encoding='utf-8') as f:
    f.write(text)