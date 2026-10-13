with open('schedule.html', 'r', encoding='utf-8') as f:
    text = f.read()

import re

# We replace the openConfirmModalFromSch function
new_func = '''window.openConfirmModalFromSch = function(movieId, timeStr) {
                const m = DemoData.movies.find(x => x.id === movieId);
                if (!m) return;
                
                let confirmModal = document.getElementById('sch-confirm-modal');
                if (!confirmModal) {
                    const html = 
                        <div id="sch-confirm-modal" class="st-modal" role="dialog" style="z-index: 1060; display:flex;">
                            <div class="st-overlay" onclick="document.getElementById('sch-confirm-modal').classList.remove('show')"></div>
                            <div class="st-wrapper st-confirm-wrapper">
                                <div class="st-confirm-header">
                                    <h3>BẠN ĐANG ĐẶT VÉ XEM PHIM</h3>
                                    <button class="st-close-btn" onclick="document.getElementById('sch-confirm-modal').classList.remove('show')">&times;</button>
                                </div>
                                <div class="st-confirm-body">
                                    <h2 id="sch-conf-movie" class="st-confirm-movie">Tên Phim</h2>
                                    <div class="st-confirm-table">
                                        <div class="st-table-row st-table-head">
                                            <div>Rạp chiếu</div>
                                            <div>Ngày chiếu</div>
                                            <div>Giờ chiếu</div>
                                        </div>
                                        <div class="st-table-row st-table-data">
                                            <div id="sch-conf-cinema">Beta</div>
                                            <div id="sch-conf-date">01/01/2026</div>
                                            <div id="sch-conf-time">10:00</div>
                                        </div>
                                    </div>
                                    <div class="st-confirm-footer">
                                        <a href="booking.html" class="st-confirm-btn">ĐỒNG Ý</a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ;
                    document.body.insertAdjacentHTML('beforeend', html);
                    confirmModal = document.getElementById('sch-confirm-modal');
                }

                const cinemaName = (localStorage.getItem('selectedCinema') || 'Beta Cinemas Thanh Xuân').replace('Beta Cinemas ', 'Beta ');
                const [y, mm, dd] = selectedDateStr.split('-');
                
                document.getElementById('sch-conf-movie').innerText = m.title;
                document.getElementById('sch-conf-cinema').innerText = cinemaName;
                document.getElementById('sch-conf-date').innerText = ${dd}//;
                document.getElementById('sch-conf-time').innerText = timeStr;
                
                confirmModal.classList.add('show');
            };'''

text = re.sub(r'window\.openConfirmModalFromSch = function.*?};', new_func, text, flags=re.DOTALL)

with open('schedule.html', 'w', encoding='utf-8') as f:
    f.write(text)