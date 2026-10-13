import re

with open('index.html', 'r', encoding='utf-8') as f:
    text = f.read()

# Add meta referrer
if 'name="referrer"' not in text:
    text = text.replace('<head>', '<head>\n    <meta name="referrer" content="no-referrer">')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(text)

with open('js/data.js', 'r', encoding='utf-8') as f:
    text = f.read()

# Update placeholders
text = text.replace('https://via.placeholder.com/300x450?text=Thay+link+anh+vao+day', 'https://placehold.co/300x450?text=S%E1%BA%B5n+s%C3%A0ng')
# Also fix the encoded URL for m2 just to be clean
text = text.replace('https://files.betacorp.vn/media%2fimages%2f2026%2f09%2f03%2fencor%2D002a%2Dg%2Dvie%2Dvn%2D4x5%2D134909%2D030926%2D27.jpg', 'https://files.betacorp.vn/media/images/2026/09/03/encor-002a-g-vie-vn-4x5-134909-030926-27.jpg')

with open('js/data.js', 'w', encoding='utf-8') as f:
    f.write(text)