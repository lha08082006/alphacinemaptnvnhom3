import re

with open('js/trailer.js', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace the HTML structure
old_html = '''<div id="trailer-modal" class="trailer-modal" role="dialog" aria-modal="true" tabindex="-1">
                <div class="trailer-overlay" id="trailer-overlay"></div>
                <div class="trailer-wrapper">
                    <button class="trailer-close-btn" id="trailer-close-btn" aria-label="Đóng">&times;</button>
                    <div class="trailer-container">
                        <div class="trailer-player">
                            <div class="trailer-player-content" id="trailer-video-container">
                                <!-- Nội dung video sẽ render ở đây -->
                            </div>
                        </div>
                        <div class="trailer-info">
                            <div class="tl-details">
                                <h2 id="tl-title">Tên Phim <span class="tl-age" id="tl-age">T18</span></h2>
                                <div class="tl-meta" id="tl-meta">Thể loại • 120 phút</div>
                            </div>
                            <button class="tl-buy-btn" id="tl-buy-btn">MUA VÉ</button>
                        </div>
                    </div>
                </div>
            </div>'''

new_html = '''<div id="trailer-modal" class="trailer-modal" role="dialog" aria-modal="true" tabindex="-1">
                <div class="trailer-overlay" id="trailer-overlay"></div>
                <div class="trailer-wrapper">
                    <div class="trailer-container">
                        <div class="trailer-header">
                            <h2 id="tl-title">TRAILER - Tên Phim</h2>
                            <button class="trailer-close-btn" id="trailer-close-btn" aria-label="Đóng">&times;</button>
                        </div>
                        <div class="trailer-body">
                            <div class="trailer-player">
                                <div class="trailer-player-content" id="trailer-video-container">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>'''

# The actual file might have different encoding characters due to previous steps, let's use a regex to replace everything between <div id="trailer-modal" and document.body.insertAdjacentHTML
text = re.sub(
    r'<div id="trailer-modal" class="trailer-modal".*?</div>\s*</div>\s*</div>\s*</div>',
    new_html,
    text,
    flags=re.DOTALL
)

# Fix openTrailer logic to update title correctly
text = re.sub(
    r'document\.getElementById\(\'tl-title\'\)\.innerHTML = \$\{movie\.title\} <span class="tl-age">\$\{movie\.ageRating\}</span>;',
    'document.getElementById(\'tl-title\').innerText = TRAILER - ;',
    text
)
# Remove the meta and buyBtn logic
text = re.sub(r'document\.getElementById\(\'tl-meta\'\)\.innerText = \$\{movie\.genres\.join\(\', \'\}\) • \$\{movie\.duration\} phút;', '', text)
text = re.sub(r'const buyBtn = document\.getElementById\(\'tl-buy-btn\'\);.*?\} else \{\s*buyBtn\.innerText = \'MUA VÉ\';\s*\}', '', text, flags=re.DOTALL)

with open('js/trailer.js', 'w', encoding='utf-8') as f:
    f.write(text)