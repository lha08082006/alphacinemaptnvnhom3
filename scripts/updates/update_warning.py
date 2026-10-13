import re

with open('js/booking.js', 'r', encoding='utf-8') as f:
    text = f.read()

old_code = "document.getElementById('bk-age-badge').className = 'mg-age age-' + m.ageRating.toLowerCase();"
new_code = "document.getElementById('bk-age-badge').className = 'mg-age age-' + m.ageRating.toLowerCase();\n\n        // Update warning banner text\n        let ageNum = '13';\n        if (m.ageRating === 'T18') ageNum = '18';\n        else if (m.ageRating === 'T16') ageNum = '16';\n        document.getElementById('bk-warning').innerText = Theo quy định của cục điện ảnh, phim này không dành cho khán giả dưới  tuổi.;"

text = text.replace(old_code, new_code)

with open('js/booking.js', 'w', encoding='utf-8') as f:
    f.write(text)