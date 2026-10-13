import glob

for file in glob.glob('*.html'):
    with open(file, 'r', encoding='utf-8') as f:
        text = f.read()
    
    if '<meta name="referrer" content="no-referrer">' in text:
        text = text.replace('<meta name="referrer" content="no-referrer">', '')
        with open(file, 'w', encoding='utf-8') as f:
            f.write(text)