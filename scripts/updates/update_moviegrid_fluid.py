import re

with open('css/movie-grid.css', 'r', encoding='utf-8') as f:
    text = f.read()

text = re.sub(r'\.mg-grid \{[\s\S]*?gap: 30px;\n\}', '.mg-grid {\n    display: grid;\n    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));\n    gap: 30px;\n}', text)
text = re.sub(r'@media \(max-width: 992px\) \{ \.mg-grid \{ grid-template-columns: repeat\(3, 1fr\); gap: 20px; \} \}', '', text)

with open('css/movie-grid.css', 'w', encoding='utf-8') as f:
    f.write(text)