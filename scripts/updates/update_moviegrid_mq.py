with open('css/movie-grid.css', 'r', encoding='utf-8') as f:
    text = f.read()

# Make sure we don't duplicate media queries
if "@media (max-width: 992px)" not in text:
    text = text.replace(
        '@media (max-width: 576px) { .mg-grid { grid-template-columns: repeat(2, 1fr); gap: 15px; } }',
        '@media (max-width: 992px) { .mg-grid { grid-template-columns: repeat(3, 1fr); gap: 20px; } }\n@media (max-width: 576px) { .mg-grid { grid-template-columns: repeat(2, 1fr); gap: 15px; } }'
    )
    with open('css/movie-grid.css', 'w', encoding='utf-8') as f:
        f.write(text)