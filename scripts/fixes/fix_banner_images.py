import re

with open('index.html', 'r', encoding='utf-8') as f:
    text = f.read()

# Remove 'active' from the second banner slide if it exists
text = re.sub(r'(<img src="https://files.betacorp.vn/media/images/2026/09/14/[^"]+".*?class="banner-slide)\s+active(">)', r'\1\2', text)

# Add referrerpolicy="no-referrer" to both banner images
text = re.sub(r'(<img src="https://files.betacorp.vn/[^"]+".*?)>', r'\1 referrerpolicy="no-referrer">', text)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(text)