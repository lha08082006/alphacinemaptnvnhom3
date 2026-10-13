with open('gia-ve.html', 'r', encoding='utf-8') as f:
    text = f.read()

# Add w_1200 and no-referrer
text = text.replace('upload/f_auto/q_auto/', 'upload/w_1200,f_auto,q_auto/')
text = text.replace('class="gia-ve-img">', 'class="gia-ve-img" referrerpolicy="no-referrer">')

with open('gia-ve.html', 'w', encoding='utf-8') as f:
    f.write(text)