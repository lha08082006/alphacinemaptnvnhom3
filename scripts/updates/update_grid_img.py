import re
with open('js/movie-grid.js', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace img tag to include referrerpolicy
old_img = 'class="mg-poster-img" src="" alt="" style="width: 100%; height: 100%; object-fit: cover;"'
new_img = 'class="mg-poster-img" src="" alt="" style="width: 100%; height: 100%; object-fit: cover;" referrerpolicy="no-referrer"'

text = text.replace(old_img, new_img)

with open('js/movie-grid.js', 'w', encoding='utf-8') as f:
    f.write(text)