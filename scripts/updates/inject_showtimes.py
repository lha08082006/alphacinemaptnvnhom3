with open('index.html', 'r', encoding='utf-8') as f:
    text = f.read()

# Add CSS link
if '<link rel="stylesheet" href="css/showtimes-modal.css">' not in text:
    text = text.replace('</head>', '    <link rel="stylesheet" href="css/showtimes-modal.css">\n</head>')

# Add JS script
if '<script src="js/showtimes-modal.js"></script>' not in text:
    text = text.replace('</body>', '    <script src="js/showtimes-modal.js"></script>\n</body>')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(text)