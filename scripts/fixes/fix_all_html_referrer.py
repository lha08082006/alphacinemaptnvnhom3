import glob

for file in glob.glob('*.html'):
    with open(file, 'r', encoding='utf-8') as f:
        text = f.read()
    if '<head>' in text and 'name="referrer"' not in text:
        text = text.replace('<head>', '<head>\n    <meta name="referrer" content="no-referrer">')
        with open(file, 'w', encoding='utf-8') as f:
            f.write(text)