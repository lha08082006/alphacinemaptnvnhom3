with open('schedule.html', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('onclick="openTrailer(', 'referrerpolicy="no-referrer" onclick="openTrailer(')

with open('schedule.html', 'w', encoding='utf-8') as f:
    f.write(text)