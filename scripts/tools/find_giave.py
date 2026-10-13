with open('index.html', 'r', encoding='utf-8') as f:
    text = f.read()

for i, line in enumerate(text.splitlines()):
    if 'GIÁ VÉ' in line or 'GIA' in line.upper():
        print(f"Line {i}: {line.strip()}")