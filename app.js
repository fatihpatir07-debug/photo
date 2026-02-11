// State
const state = {
    brightness: 100,
    contrast: 100,
    saturate: 100,
    activeFilter: 'none',
    facingMode: 'user', // 'user' or 'environment'
    stream: null
};

// Elements
const video = document.getElementById('camera-feed');
const canvas = document.getElementById('capture-canvas');
const shutterBtn = document.getElementById('shutter-btn');
const flashOverlay = document.getElementById('flash-overlay');
const switchCameraBtn = document.getElementById('switch-camera-btn');
const infoBtn = document.getElementById('info-btn');
const infoModal = document.getElementById('info-modal');
const closeModalBtn = document.getElementById('close-modal-btn');

// Manual Controls
const sliderPanel = document.getElementById('sliders-panel');
const filtersPanel = document.getElementById('filters-panel');
const toggleSlidersBtn = document.getElementById('toggle-sliders-btn');
const toggleFiltersBtn = document.getElementById('toggle-filters-btn');

const sliders = {
    brightness: document.getElementById('brightness'),
    contrast: document.getElementById('contrast'),
    saturate: document.getElementById('saturate')
};

// Initialization
async function initCamera() {
    if (state.stream) {
        state.stream.getTracks().forEach(track => track.stop());
    }

    try {
        const constraints = {
            video: {
                facingMode: state.facingMode,
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: false
        };

        state.stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = state.stream;

        // Handle mirroring logic
        if (state.facingMode === 'user') {
            video.classList.remove('rear-camera');
        } else {
            video.classList.add('rear-camera');
        }

    } catch (err) {
        console.error("Camera error:", err);
        alert("Camera access denied or unavailable.");
    }
}

// Filter Logic
function updateVisuals() {
    // 1. Calculate manual filter string
    const manualFilter = `brightness(${state.brightness}%) contrast(${state.contrast}%) saturate(${state.saturate}%)`;

    // 2. Apply preset filter + manual adjustments
    // We modify the VIDEO element's style. 
    // Note: CSS blending of multiple filters: We put manual first, then presets if needed? 
    // easier to apply presets via `className` and manual via `style.filter` 
    // BUT `style.filter` overrides class filter.
    // So we must combine them manually in JS.

    let presetFilter = '';
    switch (state.activeFilter) {
        case 'bw': presetFilter = 'grayscale(1)'; break;
        case 'sepia': presetFilter = 'sepia(1)'; break;
        case 'vintage': presetFilter = 'sepia(0.5) contrast(0.8) brightness(1.1)'; break;
        case 'cyber': presetFilter = 'saturate(2) contrast(1.2) hue-rotate(180deg)'; break;
        case 'auto-enhance': presetFilter = 'contrast(1.15) saturate(1.25)'; break; // Subtle pop
        default: presetFilter = '';
    }

    // Combine: Manual first, then Preset
    const combinedFilter = `${manualFilter} ${presetFilter}`;
    video.style.filter = combinedFilter;
    return combinedFilter;
}

function handleSliderChange(e) {
    const { id, value } = e.target;
    state[id] = value;
    updateVisuals();
}

function resetSliders() {
    state.brightness = 100;
    state.contrast = 100;
    state.saturate = 100;

    sliders.brightness.value = 100;
    sliders.contrast.value = 100;
    sliders.saturate.value = 100;

    updateVisuals();
}

// Event Listeners for Sliders
Object.values(sliders).forEach(slider => {
    slider.addEventListener('input', handleSliderChange);
});

document.getElementById('reset-sliders').addEventListener('click', resetSliders);

// UI Toggles
toggleSlidersBtn.addEventListener('click', () => {
    sliderPanel.classList.add('active');
    filtersPanel.classList.remove('active');
    toggleSlidersBtn.classList.add('active');
    toggleFiltersBtn.classList.remove('active');
});

toggleFiltersBtn.addEventListener('click', () => {
    filtersPanel.classList.add('active');
    sliderPanel.classList.remove('active');
    toggleFiltersBtn.classList.add('active');
    toggleSlidersBtn.classList.remove('active');
});

// Filter Chips
document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
        // Remove active from all
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');

        const filterName = e.target.getAttribute('data-filter');
        state.activeFilter = filterName;

        // Optional: Reset sliders when changing presets? 
        // User might want to tweak a preset, so we keep sliders as is? 
        // Let's keep sliders as is for more control.
        updateVisuals();
    });
});

// Camera Switch
switchCameraBtn.addEventListener('click', () => {
    state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
    initCamera();
});

// Capture
shutterBtn.addEventListener('mousedown', () => shutterBtn.style.transform = "scale(0.9)");
shutterBtn.addEventListener('mouseup', () => shutterBtn.style.transform = "scale(1)");

shutterBtn.addEventListener('click', () => {
    // Flash effect
    flashOverlay.style.opacity = 1;
    setTimeout(() => flashOverlay.style.opacity = 0, 100);

    // Prepare canvas
    const width = video.videoWidth;
    const height = video.videoHeight;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');

    // Apply mirrors if facing user
    if (state.facingMode === 'user') {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
    }

    // Apply Filters to Context
    ctx.filter = updateVisuals();

    // Draw
    ctx.drawImage(video, 0, 0, width, height);

    // Export
    const dataURL = canvas.toDataURL('image/jpeg', 0.95);
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = `lumina_${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// Info Modal
infoBtn.addEventListener('click', () => {
    infoModal.classList.remove('hidden');
});

closeModalBtn.addEventListener('click', () => {
    infoModal.classList.add('hidden');
});
infoModal.addEventListener('click', (e) => {
    if (e.target === infoModal) infoModal.classList.add('hidden');
});

// Start
initCamera();
updateVisuals();
