(function() {
    let modalEl = null;
    let focusTrapBoundary = null;
    let returnFocusEl = null;
    let simulatedInterval = null;

    function buildModalDOM() {
        if (modalEl) return;
        const html = `
            <div id="trailer-modal" class="trailer-modal" role="dialog" aria-modal="true" tabindex="-1">
                <div class="trailer-overlay" id="trailer-overlay"></div>
                <div class="trailer-wrapper">
                    <div class="trailer-container">
                        <div class="trailer-header">
                            <h2 id="tl-title">TRAILER</h2>
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
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        modalEl = document.getElementById('trailer-modal');

        // Bắt sự kiện đóng
        document.getElementById('trailer-close-btn').addEventListener('click', closeTrailer);
        document.getElementById('trailer-overlay').addEventListener('click', closeTrailer);
        
        // Khóa focus trong modal
        modalEl.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeTrailer();
            if (e.key === 'Tab') {
                const focusableElements = modalEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
                const first = focusableElements[0];
                const last = focusableElements[focusableElements.length - 1];
                if (e.shiftKey) {
                    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
                } else {
                    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
                }
            }
        });
    }

    function parseDuration(timeStr) {
        if(!timeStr) return 0;
        const pts = timeStr.split(':');
        return parseInt(pts[0])*60 + parseInt(pts[1]);
    }

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function renderPlaceholder(movie) {
        const container = document.getElementById('trailer-video-container');
        const bgImg = movie.imageUrl || 'https://placehold.co/800x450?text=Trailer';
        const totalSecs = parseDuration(movie.trailer.duration || '1:30');
        
        container.innerHTML = `
            <div class="tl-placeholder" style="background: url('${bgImg}') center/cover no-repeat;">
                <div class="tl-big-play" id="tl-play-btn">▶</div>
                <div class="tl-controls">
                    <div class="tl-progress-bar"><div class="tl-progress-fill" id="tl-progress"></div></div>
                    <div class="tl-controls-row">
                        <button class="tl-btn-small" id="tl-pause-btn" style="display:none;">⏸</button>
                        <span class="tl-time"><span id="tl-curr">0:00</span> / ${movie.trailer.duration}</span>
                        <button class="tl-btn-small">🕪</button>
                    </div>
                </div>
                <div id="tl-replay-overlay" style="display:none; position:absolute; top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);flex-direction:column;align-items:center;justify-content:center;">
                    <button class="tl-buy-btn" id="tl-replay-btn" style="background:var(--blue);">XEM LẠI</button>
                </div>
            </div>
        `;

        let isPlaying = false;
        let currSecs = 0;
        const playBtn = document.getElementById('tl-play-btn');
        const pauseBtn = document.getElementById('tl-pause-btn');
        const progressFill = document.getElementById('tl-progress');
        const currLabel = document.getElementById('tl-curr');
        const replayOverlay = document.getElementById('tl-replay-overlay');
        const replayBtn = document.getElementById('tl-replay-btn');

        function updateUI() {
            progressFill.style.width = `${(currSecs / totalSecs) * 100}%`;
            currLabel.innerText = formatTime(currSecs);
            if (currSecs >= totalSecs) {
                clearInterval(simulatedInterval);
                isPlaying = false;
                replayOverlay.style.display = 'flex';
                pauseBtn.style.display = 'none';
                playBtn.style.display = 'none';
            }
        }

        function togglePlay() {
            if (currSecs >= totalSecs) return;
            isPlaying = !isPlaying;
            if (isPlaying) {
                playBtn.style.display = 'none';
                pauseBtn.style.display = 'block';
                simulatedInterval = setInterval(() => {
                    currSecs += 1;
                    updateUI();
                }, 1000);
            } else {
                playBtn.style.display = 'flex';
                pauseBtn.style.display = 'none';
                clearInterval(simulatedInterval);
            }
        }

        playBtn.addEventListener('click', togglePlay);
        pauseBtn.addEventListener('click', togglePlay);
        replayBtn.addEventListener('click', () => {
            currSecs = 0;
            updateUI();
            replayOverlay.style.display = 'none';
            togglePlay();
        });
    }

    // Build embed URL compatible with Beta Cinemas trailer-embed.js
    function buildTrailerEmbedUrl(urlTrailer) {
        if (!urlTrailer) return '';
        if (/facebook\.com|fb\.watch/i.test(urlTrailer)) {
            return 'https://www.facebook.com/plugins/video.php?href=' + encodeURIComponent(urlTrailer) + '&show_text=false';
        }
        if (/^https?:\/\//i.test(urlTrailer)) {
            const url = urlTrailer.replace("watch?v=", "embed/").replace("youtu.be/", "www.youtube.com/embed/");
            return url + (url.includes('?') ? '&' : '?') + 'rel=0&showinfo=0&autoplay=1';
        }
        return 'https://www.youtube.com/embed/' + urlTrailer + '?rel=0&showinfo=0&autoplay=1';
    }
    window.buildTrailerEmbedUrl = buildTrailerEmbedUrl;

    function renderYoutube(movieOrId, customTitle) {
        const container = document.getElementById('trailer-video-container');
        let ytId = '';
        let fullEmbedUrl = '';

        if (typeof movieOrId === 'object' && movieOrId.trailer) {
            ytId = movieOrId.trailer.youtubeId || 'dQw4w9WgXcQ';
            fullEmbedUrl = buildTrailerEmbedUrl(ytId);
        } else if (typeof movieOrId === 'string') {
            ytId = movieOrId;
            fullEmbedUrl = buildTrailerEmbedUrl(ytId);
        }

        container.innerHTML = `
            <iframe width="100%" height="100%" src="${fullEmbedUrl}" title="Trailer player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen onerror="handleYtError('${ytId}')"></iframe>
            <div id="yt-error" class="trailer-yt-error" style="display:none;">
                <p>Không thể tải video. Vui lòng kiểm tra kết nối mạng.</p>
                <a href="${fullEmbedUrl.replace('embed/', 'watch?v=').replace('?rel=0&showinfo=0&autoplay=1', '')}" target="_blank" class="tl-buy-btn" style="background:var(--blue); margin-top:10px;">Mở trên YouTube</a>
            </div>
        `;

        window.handleYtError = function() {
            const iframe = document.querySelector('.trailer-player-content iframe');
            if (iframe) iframe.style.display = 'none';
            const err = document.getElementById('yt-error');
            if (err) err.style.display = 'flex';
        };
    }

    window.openTrailer = function(movieIdOrUrl, optionalTitle) {
        returnFocusEl = document.activeElement;
        buildModalDOM();

        let movie = null;
        if (typeof DemoData !== 'undefined' && DemoData.movies) {
            movie = DemoData.movies.find(m => m.id === movieIdOrUrl);
        }

        const title = movie ? movie.title : (optionalTitle || 'TRAILER PHIM');
        document.getElementById('tl-title').innerText = 'TRAILER - ' + title;

        clearInterval(simulatedInterval);
        const container = document.getElementById('trailer-video-container');
        container.innerHTML = '';

        if (movie) {
            if (movie.trailer && movie.trailer.type === 'youtube') {
                renderYoutube(movie);
            } else {
                renderPlaceholder(movie);
            }
        } else if (movieIdOrUrl) {
            renderYoutube(movieIdOrUrl, title);
        }

        // Hiện modal
        document.body.style.overflow = 'hidden';
        modalEl.classList.add('show');
        modalEl.focus();
    };

    window.closeTrailer = function() {
        if (!modalEl) return;
        document.body.style.overflow = '';
        modalEl.classList.remove('show');
        clearInterval(simulatedInterval);
        
        // PHẢI xóa iframe để dừng tiếng YouTube
        document.getElementById('trailer-video-container').innerHTML = '';
        
        if (returnFocusEl) returnFocusEl.focus();
    };

})();
