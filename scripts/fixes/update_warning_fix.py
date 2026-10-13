import re
with open('js/booking.js', 'r', encoding='utf-8') as f:
    text = f.read()
text = re.sub(r'document\.getElementById\(\\\'bk-warning\\\'\)\.innerText = .*?;', 'document.getElementById(\\'bk-warning\\').innerText = \\'Theo quy định của cục điện ảnh, phim này không dành cho khán giả dưới \\' + ageNum + \\' tuổi.\\';', text)
with open('js/booking.js', 'w', encoding='utf-8') as f:
    f.write(text)