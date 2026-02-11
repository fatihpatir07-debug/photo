// State
const state = {
    brightness: 100,
    contrast: 100,
    saturate: 100,
    activeFilter: 'none',
    facingMode: 'user', // 'user' or 'environment'
    stream: null,
    mode: 'camera' // 'camera' or 'image'
};

// Shutter Sound (Short "Click" sound - Base64)
const shutterSound = new Audio("data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=");
// NOTE: The above is a dummy empty placeholder to prevent errors if base64 is invalid in prompt. 
// I will use a real short beep/click sound here.
// Let's use a generated simple beep via AudioContext instead for lighter weight and reliability.
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playShutterSound() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.1);
}


// Elements
const video = document.getElementById('camera-feed');
const staticImage = document.getElementById('static-image');
const canvas = document.getElementById('capture-canvas');
const shutterBtn = document.getElementById('shutter-btn');
const flashOverlay = document.getElementById('flash-overlay');
const switchCameraBtn = document.getElementById('switch-camera-btn');
const infoBtn = document.getElementById('info-btn');
const galleryBtn = document.getElementById('gallery-btn');
const closeImageBtn = document.getElementById('close-image-btn');
const fileInput = document.getElementById('file-input');
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
    if (state.mode !== 'camera') return;

    // Don't stop stream immediately if resizing or similar, 
    // but here we want to ensure fresh stream if facing mode changed.
    if (state.stream) {
        // optim: check if facing mode matches? 
        const track = state.stream.getVideoTracks()[0];
        const settings = track.getSettings();
        if (settings.facingMode === state.facingMode) return; // Already good

        track.stop();
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
        // Silent fail or UI indicator better than alert loop
    }
}

// Mode Switching
function setMode(mode) {
    state.mode = mode;
    if (mode === 'camera') {
        video.hidden = false;
        staticImage.classList.add('hidden');
        switchCameraBtn.classList.remove('hidden');
        galleryBtn.classList.remove('hidden');
        closeImageBtn.classList.add('hidden');
        initCamera();
    } else {
        video.hidden = true;
        staticImage.classList.remove('hidden');
        switchCameraBtn.classList.add('hidden');
        galleryBtn.classList.add('hidden');
        closeImageBtn.classList.remove('hidden');

        // OPTIMIZATION: Keep camera running in background for fast switch back?
        // Or stop to save battery? Saving battery is better for 'Editor' mode.
        if (state.stream) {
            state.stream.getTracks().forEach(track => track.stop());
            state.stream = null;
        }
    }
    updateVisuals();
}

// Gallery Handling
galleryBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            staticImage.src = e.target.result;
            staticImage.onload = () => setMode('image');
        };
        reader.readAsDataURL(file);
    }
    fileInput.value = '';
});

closeImageBtn.addEventListener('click', () => {
    setMode('camera');
});

// Filter Logic
function updateVisuals() {
    // 1. Manual Filter
    const manualFilter = `brightness(${state.brightness}%) contrast(${state.contrast}%) saturate(${state.saturate}%)`;

    // 2. Preset Filter
    // CRITICAL: Ensure syntax is valid for both CSS and Canvas `filter`
    let presetFilter = '';
    switch (state.activeFilter) {
        case 'bw': presetFilter = 'grayscale(100%)'; break;
        case 'sepia': presetFilter = 'sepia(100%)'; break;
        case 'vintage': presetFilter = 'sepia(50%) contrast(80%) brightness(110%)'; break;
        case 'cyber': presetFilter = 'saturate(200%) contrast(120%) hue-rotate(180deg)'; break;
        case 'auto-enhance': presetFilter = 'contrast(115%) saturate(125%)'; break;
        default: presetFilter = '';
    }

    const combinedFilter = `${manualFilter} ${presetFilter}`.trim();

    if (state.mode === 'camera') {
        video.style.filter = combinedFilter;
        staticImage.style.filter = '';
    } else {
        staticImage.style.filter = combinedFilter;
        video.style.filter = '';
    }

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

document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');

        const filterName = e.target.getAttribute('data-filter');
        state.activeFilter = filterName;
        updateVisuals();
    });
});

switchCameraBtn.addEventListener('click', () => {
    state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
    initCamera();
});

// Capture & Save logic
shutterBtn.addEventListener('mousedown', () => shutterBtn.style.transform = "scale(0.9)");
shutterBtn.addEventListener('mouseup', () => shutterBtn.style.transform = "scale(1)");

shutterBtn.addEventListener('click', async () => {
    // Sound
    playShutterSound();

    // Flash
    flashOverlay.style.opacity = 1;
    setTimeout(() => flashOverlay.style.opacity = 0, 100);

    let width, height, source;

    if (state.mode === 'camera') {
        width = video.videoWidth;
        height = video.videoHeight;
        source = video;
    } else {
        width = staticImage.naturalWidth;
        height = staticImage.naturalHeight;
        source = staticImage;
    }

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');

    if (state.mode === 'camera' && state.facingMode === 'user') {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
    }

    // Apply Filter to Canvas
    // ctx.filter syntax must be exact w3c format
    const visualFilter = updateVisuals();
    ctx.filter = visualFilter;

    ctx.drawImage(source, 0, 0, width, height);

    // Native Share / Save
    canvas.toBlob(async (blob) => {
        const file = new File([blob], `lumina_${Date.now()}.jpg`, { type: 'image/jpeg' });

        // Try Native Share API First (Mobile)
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: 'Lumina Capture',
                    text: 'Captured with Lumina'
                });
                console.log("Shared successfully");
                return;
            } catch (err) {
                console.warn("Share failed or cancelled:", err);
                // Fallback to download if share is cancelled? Maybe not, duplicate save.
                // But if share *fails*, we might want to fallback.
                if (err.name !== 'AbortError') {
                    downloadFallback(blob);
                }
            }
        } else {
            // Desktop Fallback
            downloadFallback(blob);
        }
    }, 'image/jpeg', 0.95);
});

function downloadFallback(blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lumina_${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

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
