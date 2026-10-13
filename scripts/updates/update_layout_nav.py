import re

with open('js/layout.js', 'r', encoding='utf-8') as f:
    text = f.read()

old_nav = '''
                <div class="cinema-selector">
                    <select id="header-cinema-select" onchange="setLoc('cinema', this.value)">
                        <!-- JS render -->
                    </select>
                </div>

                <nav class="main-nav">
                    <ul>
                        <li><a href="schedule.html" class="">LỊCH CHIẾU THEO RẠP</a></li>
                        <li><a href="index.html" class="">PHIM</a></li>
                        <li><a href="cinema.html" class="">RẠP</a></li>
                        <li><a href="price.html" class="">GIÁ VÉ</a></li>
                        <li><a href="combo.html" class="">TIN MỚI VÀ ƯU ĐÃI</a></li>
                        <li><a href="#" class="">NHƯỢNG QUYỀN</a></li>
                        <li><a href="#" class="">THÀNH VIÊN</a></li>
                    </ul>
                </nav>'''

new_nav = '''
                <div style="display: flex; align-items: center; gap: 30px; flex: 1; justify-content: flex-end;">
                    <div class="cinema-selector" style="position: relative;">
                        <select id="header-cinema-select" onchange="setLoc('cinema', this.value)" style="appearance: none; -webkit-appearance: none; border: 1px solid #ccc; border-radius: 20px; padding: 8px 35px 8px 15px; font-family: 'Be Vietnam Pro', sans-serif; font-size: 14px; font-weight: 600; color: #333; background: white; cursor: pointer; outline: none; min-width: 180px;">
                            <!-- JS render -->
                        </select>
                        <svg viewBox="0 0 24 24" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; fill: #666; pointer-events: none;"><path d="M7 10l5 5 5-5z"></path></svg>
                    </div>

                    <nav class="main-nav">
                        <ul style="display: flex; list-style: none; margin: 0; padding: 0; gap: 20px;">
                            <li><a href="schedule.html" style="text-decoration: none; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 14px; color: var(--text-navy);">LỊCH CHIẾU THEO RẠP</a></li>
                            <li><a href="index.html" style="text-decoration: none; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 14px; color: var(--text-navy);">PHIM</a></li>
                            <li><a href="cinema.html" style="text-decoration: none; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 14px; color: var(--text-navy);">RẠP</a></li>
                            <li><a href="price.html" style="text-decoration: none; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 14px; color: var(--text-navy);">GIÁ VÉ</a></li>
                            <li><a href="combo.html" style="text-decoration: none; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 14px; color: var(--text-navy);">TIN MỚI VÀ ƯU ĐÃI</a></li>
                            <li><a href="#" style="text-decoration: none; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 14px; color: var(--text-navy);">NHƯỢNG QUYỀN</a></li>
                            <li><a href="#" style="text-decoration: none; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 14px; color: var(--text-navy);">THÀNH VIÊN</a></li>
                        </ul>
                    </nav>
                </div>'''

text = text.replace(old_nav, new_nav)
with open('js/layout.js', 'w', encoding='utf-8') as f:
    f.write(text)