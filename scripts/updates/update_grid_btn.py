with open('js/movie-grid.js', 'r', encoding='utf-8') as f:
    text = f.read()

old_btn = '<a href="movie.html?id=" class="mg-buy-btn">'
new_btn = '<button class="mg-buy-btn" onclick="openShowtimes(\\'\\', event)">'
text = text.replace(old_btn, new_btn)

old_btn_close = '</a>\\n                    </div>\\n                </div>\\n            ;'
new_btn_close = '</button>\\n                    </div>\\n                </div>\\n            ;'
text = text.replace(old_btn_close, new_btn_close)

with open('js/movie-grid.js', 'w', encoding='utf-8') as f:
    f.write(text)