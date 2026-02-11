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

// Shutter Sound
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

// Start Camera
async function initCamera() {
    if (state.mode !== 'camera') return;
    if (state.stream) {
        const track = state.stream.getVideoTracks()[0];
        const settings = track.getSettings();
        if (settings.facingMode === state.facingMode) return;
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
        if (state.facingMode === 'user') {
            video.classList.remove('rear-camera');
        } else {
            video.classList.add('rear-camera');
        }
    } catch (err) {
        console.error("Camera error:", err);
    }
}

// Switch Logic
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
        if (state.stream) {
            state.stream.getTracks().forEach(track => track.stop());
            state.stream = null;
        }
    }
    updateVisuals();
}

galleryBtn.addEventListener('click', () => fileInput.click());
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
closeImageBtn.addEventListener('click', () => setMode('camera'));

// Visuals (CSS Preview)
function updateVisuals() {
    const manualFilter = `brightness(${state.brightness}%) contrast(${state.contrast}%) saturate(${state.saturate}%)`;
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
Object.values(sliders).forEach(slider => slider.addEventListener('input', handleSliderChange));
document.getElementById('reset-sliders').addEventListener('click', resetSliders);

// Toggles
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
        state.activeFilter = e.target.getAttribute('data-filter');
        updateVisuals();
    });
});
switchCameraBtn.addEventListener('click', () => {
    state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
    initCamera();
});

// --- PIXEL MANIPULATION FOR ROBUST SAVING ---
// Clamp value between 0 and 255
function clamp(val) { return Math.max(0, Math.min(255, val)); }

function applyFiltersToData(data, w, h) {
    // 1. Sliders
    const b = state.brightness / 100;
    const c = state.contrast / 100;
    const s = state.saturate / 100;

    // Contrast Factor
    const contrastFactor = (1.015 * (c * 255 + 22.5)) / (255 * (1.015 + 22.5)); // Approx logic or use standard
    // Actually standard: input range is 50-150. Center is 100.
    // Let's use simpler relative contrast:
    // val = (val - 128) * c + 128

    // Saturation weights
    const Rw = 0.3086, Gw = 0.6094, Bw = 0.0820;

    for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b_val = data[i + 2];

        // Brightness
        r *= b;
        g *= b;
        b_val *= b;

        // Contrast
        r = (r - 128) * c + 128;
        g = (g - 128) * c + 128;
        b_val = (b_val - 128) * c + 128;

        // Saturation
        // Luminance
        const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b_val; // or correct weights
        r = -gray * s + r * (1 + s) + gray * s; // Simple shift? 
        // Better:
        // final = gray + (color - gray) * saturation
        r = gray + (r - gray) * s;
        g = gray + (g - gray) * s;
        b_val = gray + (b_val - gray) * s;

        // Presets
        if (state.activeFilter === 'bw') {
            const avg = 0.3 * r + 0.59 * g + 0.11 * b_val;
            r = avg; g = avg; b_val = avg;
        } else if (state.activeFilter === 'sepia') {
            const tr = 0.393 * r + 0.769 * g + 0.189 * b_val;
            const tg = 0.349 * r + 0.686 * g + 0.168 * b_val;
            const tb = 0.272 * r + 0.534 * g + 0.131 * b_val;
            r = tr; g = tg; b_val = tb;
        } else if (state.activeFilter === 'vintage') {
            // Sepia 50%, Contrast 80%, Brightness 110%
            // Approx:
            const tr = 0.393 * r + 0.769 * g + 0.189 * b_val;
            const tg = 0.349 * r + 0.686 * g + 0.168 * b_val;
            const tb = 0.272 * r + 0.534 * g + 0.131 * b_val;
            // Blend 50%
            r = r * 0.5 + tr * 0.5;
            g = g * 0.5 + tg * 0.5;
            b_val = b_val * 0.5 + tb * 0.5;
            // Contrast 0.8 / Brightness 1.1
            r = ((r - 128) * 0.8 + 128) * 1.1;
            g = ((g - 128) * 0.8 + 128) * 1.1;
            b_val = ((b_val - 128) * 0.8 + 128) * 1.1;
        } else if (state.activeFilter === 'cyber') {
            // High sat, Cyan/Magenta tint intent?
            // "hue-rotate" is extremely expensive manually.
            // Let's approximate Cyber with High Contrast + Cool Tint
            r = (r - 128) * 1.4 + 128; // Contrast
            g = (g - 128) * 1.4 + 128;
            b_val = (b_val - 128) * 1.6 + 128; // Blue push
            // Saturation 2x
            const gr = 0.3 * r + 0.59 * g + 0.11 * b_val;
            r = gr + (r - gr) * 2.0;
            g = gr + (g - gr) * 2.0;
            b_val = gr + (b_val - gr) * 2.0;
        } else if (state.activeFilter === 'auto-enhance') {
            // Contrast 1.15, Sat 1.25
            r = (r - 128) * 1.15 + 128;
            g = (g - 128) * 1.15 + 128;
            b_val = (b_val - 128) * 1.15 + 128;
            const gr = 0.3 * r + 0.59 * g + 0.11 * b_val;
            r = gr + (r - gr) * 1.25;
            g = gr + (g - gr) * 1.25;
            b_val = gr + (b_val - gr) * 1.25;
        }

        data[i] = clamp(r);
        data[i + 1] = clamp(g);
        data[i + 2] = clamp(b_val);
    }
}

// Capture
shutterBtn.addEventListener('mousedown', () => shutterBtn.style.transform = "scale(0.9)");
shutterBtn.addEventListener('mouseup', () => shutterBtn.style.transform = "scale(1)");

shutterBtn.addEventListener('click', async () => {
    playShutterSound();
    flashOverlay.style.opacity = 0.8;
    setTimeout(() => flashOverlay.style.opacity = 0, 150);

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

    // 1. Draw RAW image
    ctx.drawImage(source, 0, 0, width, height);

    // 2. Extract Data
    const imageData = ctx.getImageData(0, 0, width, height);

    // 3. Process Pixels (Manual)
    applyFiltersToData(imageData.data, width, height);

    // 4. Put Data Back
    ctx.putImageData(imageData, 0, 0);

    // 5. Direct Download (Skip Share Sheet as requested)
    canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `lumina_${Date.now()}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url); // Clean up
    }, 'image/jpeg', 0.95);
});

// Info Modal
infoBtn.addEventListener('click', () => infoModal.classList.remove('hidden'));
closeModalBtn.addEventListener('click', () => infoModal.classList.add('hidden'));
infoModal.addEventListener('click', (e) => { if (e.target === infoModal) infoModal.classList.add('hidden'); });

initCamera();
updateVisuals();
