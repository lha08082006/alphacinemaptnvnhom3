with open('gia-ve.html', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace the src attribute
text = text.replace('src="images/gia_ve.png"', 'src="https://res.cloudinary.com/kzufwtif/image/upload/f_auto/q_auto/gia_ve.png.png"')

with open('gia-ve.html', 'w', encoding='utf-8') as f:
    f.write(text)