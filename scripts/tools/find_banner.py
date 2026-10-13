with open('css/style.css', 'r', encoding='utf-8') as f:
    text = f.read()

for i, line in enumerate(text.splitlines()):
    if 'banner' in line.lower():
        print(f"Line {i}: {line}")