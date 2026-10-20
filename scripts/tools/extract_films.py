import re
import sys

with open(r'c:\Users\Admin\Downloads\Beta Cinemas (home page).html', 'r', encoding='utf-8', errors='ignore') as f:
    html = f.read()

# Find all film items in tab-1 (dang chieu)
items = re.findall(r'<div class="film-item".*?class="film-details".*?</div>\s*</div>\s*</div>', html, re.DOTALL)
print(f'Total film items: {len(items)}')

films = []
for item in items:
    title_m = re.search(r'<h3>\s*<a[^>]*>(.*?)</a>', item)
    genre_m = re.search(r'Thể loại:</strong>\s*(.*?)\s*</p>', item)
    duration_m = re.search(r'Thời lượng:</strong>\s*(.*?)\s*</p>', item)
    age_m = re.search(r'src="[^"]*c-(\d+)\.png"', item)
    age_p = re.search(r'src="[^"]*p\.png"', item)
    trailer_m = re.search(r'data-trailerurl="([^"]+)"', item)
    img_m = re.search(r'<img class="img-responsive border-radius-20"[^>]*src="([^"]+)"', item)
    
    age = 'P'
    if age_m: age = 'T' + age_m.group(1)
    
    films.append({
        'title': title_m.group(1).strip() if title_m else '',
        'genre': genre_m.group(1).strip() if genre_m else '',
        'duration': duration_m.group(1).strip() if duration_m else '',
        'age': age,
        'trailer': trailer_m.group(1).strip() if trailer_m else '',
        'img': img_m.group(1).strip() if img_m else ''
    })

for f in films:
    print(f"{f['title']} | {f['genre']} | {f['duration']} | {f['age']} | {f['trailer']}")
