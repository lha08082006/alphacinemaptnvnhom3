with open('js/trailer.js', 'r', encoding='utf-8') as f:
    text = f.read()

start_str = 'window.openTrailer = function(movieId) {'
end_str = 'window.closeTrailer = function() {'

idx_start = text.find(start_str)
idx_end = text.find(end_str)

new_fn = """window.openTrailer = function(movieId) {
        returnFocusEl = document.activeElement;
        buildModalDOM();

        const movie = DemoData.movies.find(m => m.id === movieId);
        if (!movie) return;

        document.getElementById('tl-title').innerText = TRAILER - ;
        
        clearInterval(simulatedInterval);
        const container = document.getElementById('trailer-video-container');
        container.innerHTML = '';

        if (movie.trailer && movie.trailer.type === 'youtube') {
            renderYoutube(movie);
        } else {
            renderPlaceholder(movie);
        }

        document.body.style.overflow = 'hidden';
        modalEl.classList.add('show');
        modalEl.focus();
    };

    """

text = text[:idx_start] + new_fn + text[idx_end:]

with open('js/trailer.js', 'w', encoding='utf-8') as f:
    f.write(text)