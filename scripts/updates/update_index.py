import re

with open('index.html', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

new_hero = '''    <div id="hero-section" class="banner-slider">
        <div class="banner-slides">
            <img src="images/banner_real.png" alt="Banner Tháng Phim Siêu Quái" class="banner-slide active">
            <img src="images/banner_real_2.png" alt="Banner Combo" class="banner-slide">
        </div>
        <button class="banner-nav prev" onclick="moveSlide(-1)">&#10094;</button>
        <button class="banner-nav next" onclick="moveSlide(1)">&#10095;</button>
        <div class="banner-dots">
            <span class="dot active" onclick="currentSlide(0)"></span>
            <span class="dot" onclick="currentSlide(1)"></span>
        </div>
    </div>'''

text = re.sub(r'<div id="hero-section".*?</div>', new_hero, text, flags=re.DOTALL)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(text)