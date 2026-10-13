import re

with open('css/movie-grid.css', 'r', encoding='utf-8') as f:
    text = f.read()

text = re.sub(
    r'grid-template-columns:\s*repeat\(auto-fill,\s*minmax\([^)]+\)\);',
    'grid-template-columns: repeat(4, 1fr);',
    text
)

with open('css/movie-grid.css', 'w', encoding='utf-8') as f:
    f.write(text)