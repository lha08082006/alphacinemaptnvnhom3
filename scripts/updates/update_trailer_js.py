with open('js/trailer.js', 'r', encoding='utf-8') as f:
    text = f.read()

start_str = 'function renderPlaceholder(movie) {'
end_str = 'playBtn.addEventListener('

idx_start = text.find(start_str)
idx_end = text.find(end_str)

if idx_start != -1 and idx_end != -1:
    before = text[:idx_start + len(start_str)]
    after = text[idx_end:]
    
    new_content = """
        const container = document.getElementById('trailer-video-container');
        const bgImg = movie.imageUrl || 'https://via.placeholder.com/800x450?text=Trailer';
        const totalSecs = parseDuration(movie.trailer.duration || '1:30');
        
        container.innerHTML = 
            <div class="tl-placeholder" style="background: url('') center/cover no-repeat;">
                <div class="tl-big-play" id="tl-play-btn">▶</div>
                <div class="tl-controls">
                    <div class="tl-progress-bar"><div class="tl-progress-fill" id="tl-progress"></div></div>
                    <div class="tl-controls-row">
                        <button class="tl-btn-small" id="tl-pause-btn" style="display:none;">⏸</button>
                        <span class="tl-time"><span id="tl-curr">0:00</span> / </span>
                        <button class="tl-btn-small">🕪</button>
                    </div>
                </div>
                <div id="tl-replay-overlay" style="display:none; position:absolute; top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);flex-direction:column;align-items:center;justify-content:center;">
                    <button class="tl-buy-btn" id="tl-replay-btn" style="background:var(--blue);">XEM LẠI</button>
                </div>
            </div>
        ;

        let isPlaying = false;
        let currSecs = 0;
        const playBtn = document.getElementById('tl-play-btn');
        const pauseBtn = document.getElementById('tl-pause-btn');
        const progressFill = document.getElementById('tl-progress');
        const currLabel = document.getElementById('tl-curr');
        const replayOverlay = document.getElementById('tl-replay-overlay');
        const replayBtn = document.getElementById('tl-replay-btn');

        function updateUI() {
            progressFill.style.width = ${(currSecs / totalSecs) * 100}%;
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

        """
    text = before + new_content + after

with open('js/trailer.js', 'w', encoding='utf-8') as f:
    f.write(text)