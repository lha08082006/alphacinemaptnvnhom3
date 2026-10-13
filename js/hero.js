// js/hero.js
document.addEventListener('DOMContentLoaded', () => {
    const slides = document.querySelectorAll('.banner-slide');
    const dots = document.querySelectorAll('.banner-dots .dot');
    if (!slides.length) return;

    let currentIndex = 0;
    let slideInterval;

    function showSlide(index) {
        slides.forEach(s => s.classList.remove('active'));
        dots.forEach(d => d.classList.remove('active'));
        
        currentIndex = index;
        if (currentIndex >= slides.length) currentIndex = 0;
        if (currentIndex < 0) currentIndex = slides.length - 1;

        slides[currentIndex].classList.add('active');
        if (dots[currentIndex]) {
            dots[currentIndex].classList.add('active');
        }
    }

    function moveSlide(step) {
        showSlide(currentIndex + step);
        resetInterval();
    }

    function currentSlide(index) {
        showSlide(index);
        resetInterval();
    }

    function startInterval() {
        slideInterval = setInterval(() => {
            showSlide(currentIndex + 1);
        }, 3000); // 3 giây
    }

    function resetInterval() {
        clearInterval(slideInterval);
        startInterval();
    }

    // Expose functions globally for inline onclick handlers
    window.moveSlide = moveSlide;
    window.currentSlide = currentSlide;

    startInterval();
});
