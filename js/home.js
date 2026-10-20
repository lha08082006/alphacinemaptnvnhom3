// js/home.js
document.addEventListener('DOMContentLoaded', () => {
    // Luôn lấy data mới nhất từ DemoData cho trang chủ để hiển thị đúng ngày
    const movies = DemoData.movies;
    
    function renderMovies(tab) {
        const list = document.getElementById('movie-list');
        list.innerHTML = '';
        
        let filtered = DemoData.getMoviesByTab(tab);
        
        filtered.forEach(m => {
            let ageClass = 'age-p';
            if (m.ageRating === 'T13') ageClass = 'age-t13';
            if (m.ageRating === 'T16') ageClass = 'age-t16';
            if (m.ageRating === 'T18') ageClass = 'age-t18';
            
            let hotBadge = m.hot ? '<div class="hot-badge">HOT</div>' : '';

            const pStyle = m.posterStyle;
            const bgStr = `${pStyle.pattern}(${pStyle.pattern.includes('linear') ? '45deg, ' : 'circle at center, '}${pStyle.from}, ${pStyle.to})`;
            const titleHtml = m.titleLines ? m.titleLines.join('<br>') : m.title;

            const html = `
                <div class="movie-card">
                    <div class="movie-poster-box" onclick="window.spaNavigate ? window.spaNavigate('movie', 'id=${m.id}') : location.href='#movie?id=${m.id}'" style="cursor:pointer; background: ${bgStr}; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 20px;">
                        ${hotBadge}
                        <div class="age-badge ${ageClass}">${m.ageRating}</div>
                        <div class="hero-poster-title" style="color: ${pStyle.accent || 'white'}; font-size: 20px; z-index: 2;">${titleHtml}</div>
                        <div style="position: absolute; top:0; left:0; right:0; bottom:0; background: rgba(0,0,0,0.1); pointer-events:none;"></div>
                    </div>
                    <div class="movie-info">
                        <h3 class="movie-title"><a href="#movie?id=${m.id}" onclick="if(window.spaNavigate){event.preventDefault(); window.spaNavigate('movie', 'id=${m.id}');}">${m.title}</a></h3>
                        <div class="movie-meta"><strong>Thể loại:</strong> ${m.genres.join(', ')}</div>
                        <div class="movie-meta"><strong>Thời lượng:</strong> ${m.duration} phút</div>
                        <button class="btn-buy-ticket" onclick="window.spaNavigate ? window.spaNavigate('schedule', 'movieId=${m.id}') : location.href='#schedule?movieId=${m.id}'">
                            🎟 MUA VÉ
                        </button>
                    </div>
                </div>
            `;
            list.insertAdjacentHTML('beforeend', html);
        });
    }

    renderMovies('nowShowing');

    // Tab switching
    const tabs = document.querySelectorAll('.home-tabs .tab-item');
    tabs.forEach((tab, idx) => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            if(idx === 0) renderMovies('comingSoon');
            else if(idx === 1) renderMovies('nowShowing');
            else if(idx === 2) renderMovies('special');
        });
    });
});
