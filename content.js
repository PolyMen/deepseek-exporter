let slider = null;
let isSliderOpen = false;

chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'toggleSlider') toggleSlider();
});

function toggleSlider() {
    isSliderOpen ? closeSlider() : openSlider();
}

function openSlider() {
    if (!slider) createSlider();
    slider.style.display = 'block';
    setTimeout(() => slider.classList.add('open'), 10);
    isSliderOpen = true;
}

function closeSlider() {
    slider.classList.remove('open');
    setTimeout(() => slider.style.display = 'none', 300);
    isSliderOpen = false;
}

function createSlider() {
    slider = document.createElement('div');
    slider.id = 'deepseek-exporter-slider';
    slider.innerHTML = `
        <div class="slider-overlay" id="sliderOverlay"></div>
        <div class="slider-panel">
            <iframe src="${chrome.runtime.getURL('slider.html')}"></iframe>
        </div>
    `;
    
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    
    document.body.appendChild(slider);
    
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = chrome.runtime.getURL('styles.css');
    document.head.appendChild(style);
    
    document.getElementById('sliderOverlay').addEventListener('click', closeSlider);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isSliderOpen) closeSlider();
});