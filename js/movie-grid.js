// js/movie-grid.js
document.addEventListener('DOMContentLoaded', () => {
    const tabs = document.querySelectorAll('.grid-tab');
    const gridContainer = document.getElementById('movie-grid') || document.getElementById('movie-list');
    if (!tabs.length || !gridContainer) return;

    // Lấy tab từ hash url
    let activeTab = location.hash.replace('#', '') || 'nowShowing';
    if (!['nowShowing', 'comingSoon', 'special'].includes(activeTab)) {
        activeTab = 'nowShowing';
    }

    function renderMovies(tabId) {
        gridContainer.innerHTML = '';
        const movies = DemoData.getMoviesByTab(tabId);

        if (movies.length === 0) {
            gridContainer.innerHTML = '<p style="text-align:center; width:100%; grid-column:1/-1;">Chưa có phim nào trong mục này.</p>';
            return;
        }

        movies.forEach(m => {
            const hotBadge = m.hot ? `<div class="mg-hot">HOT</div>` : '';
            const sneakBadge = m.sneakShow ? `<div class="mg-sneak">${m.sneakShow.label}</div>` : '';
            
            // Thêm referrerpolicy="no-referrer" để ảnh của Beta không bị lỗi 403
            const posterHtml = m.imageUrl 
                ? `<img class="mg-poster-img" src="${m.imageUrl}" alt="${m.title}" style="width: 100%; height: 100%; object-fit: cover;" referrerpolicy="no-referrer">`
                : `<div class="mg-poster-bg" style="background: #333;"><div class="mg-poster-title" style="color: white">${m.title.toUpperCase()}</div></div>`;
            
            const primaryBtnText = tabId === 'comingSoon' ? 'CHI TIẾT' : 'MUA VÉ';

            const html = `
                <div class="mg-card">
                    <div class="mg-poster-wrapper">
                        <div class="mg-age age-${m.ageRating.toLowerCase()}">${m.ageRating}</div>
                        ${hotBadge}
                        
                        ${posterHtml}
                        
                        ${sneakBadge}
                        <div class="mg-overlay">
                            <button class="mg-btn-trailer" onclick="openTrailer('${m.id}')">▶ TRAILER</button>
                        </div>
                    </div>
                    <div class="mg-info">
                        <h3 class="mg-title" title="${m.title}">${m.title}</h3>
                        <div class="mg-meta">Thể loại: ${m.genres.join(', ')}</div>
                        <div class="mg-meta">Thời lượng: ${m.duration} phút</div>
                        <button class="mg-buy-btn" onclick="openShowtimes('${m.id}', event)">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="margin-right: 5px;"><path d="M4 4h16a2 2 0 0 1 2 2v4a2 2 0 0 0 0 4v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 0 0-4V6a2 2 0 0 1 2-2zm0 2v3.54A4 4 0 0 1 2 12a4 4 0 0 1 2 2.46V18h16v-3.54A4 4 0 0 1 22 12a4 4 0 0 1-2-2.46V6H4zm4 4h8v2H8v-2z"/></svg>
                            ${primaryBtnText}
                        </button>
                    </div>
                </div>
            `;
            gridContainer.insertAdjacentHTML('beforeend', html);
        });
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const tabId = tab.dataset.tab;
            location.hash = tabId;
            renderMovies(tabId);
        });
    });

    // Kích hoạt tab ban đầu
    const initialTab = document.querySelector(`.grid-tab[data-tab="${activeTab}"]`);
    if(initialTab) initialTab.click();
    else tabs[0].click();
});
