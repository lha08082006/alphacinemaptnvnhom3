import re

with open('index.html', 'r', encoding='utf-8') as f:
    text = f.read()

# Make sure only the first banner has 'active'
text = text.replace('class="banner-slide active"', 'class="banner-slide"')
# Re-add active to the very first one
text = text.replace('class="banner-slide"', 'class="banner-slide active"', 1)

# Add referrerpolicy to any files.betacorp.vn image
text = re.sub(r'(<img[^>]+src="https://files\.betacorp\.vn[^"]+"[^>]*)>', r'\1 referrerpolicy="no-referrer">', text)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(text)