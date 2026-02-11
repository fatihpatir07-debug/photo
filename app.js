// State
const state = {
    brightness: 100,
    contrast: 100,
    saturate: 100,
    hue: 0,
    activeFilter: 'none',
    facingMode: 'user',
    stream: null,
    mode: 'camera',
    zoom: 1,
    zoomMin: 1,
    zoomMax: 3,
    segmenter: null,
    segmentationResult: null,
    isModelLoading: true
};

// Elements
const video = document.getElementById('camera-feed');
const canvasFeed = document.getElementById('canvas-feed'); // NEW: Viewfinder
const staticImage = document.getElementById('static-image');
const canvas = document.getElementById('capture-canvas'); // Hidden capture canvas
const shutterBtn = document.getElementById('shutter-btn');
const flashOverlay = document.getElementById('flash-overlay');
const switchCameraBtn = document.getElementById('switch-camera-btn');
const infoBtn = document.getElementById('info-btn');
const galleryBtn = document.getElementById('gallery-btn');
const closeImageBtn = document.getElementById('close-image-btn');
const fileInput = document.getElementById('file-input');
const infoModal = document.getElementById('info-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const loadingOverlay = document.getElementById('loading-overlay');

// Zoom Elements
const zoomSlider = document.getElementById('zoom-slider');
const zoomValue = document.getElementById('zoom-value');
const zoomContainer = document.getElementById('zoom-container');

// Panels
const sliderPanel = document.getElementById('sliders-panel');
const beautyPanel = document.getElementById('beauty-panel');
const filtersPanel = document.getElementById('filters-panel');

const toggleSlidersBtn = document.getElementById('toggle-sliders-btn');
const toggleBeautyBtn = document.getElementById('toggle-beauty-btn');
const toggleFiltersBtn = document.getElementById('toggle-filters-btn');

const sliders = {
    brightness: document.getElementById('brightness'),
    contrast: document.getElementById('contrast'),
    saturate: document.getElementById('saturate'),
    hue: document.getElementById('hair-hue')
};

// --- AI & PREDICTION ---
async function initAI() {
    loadingOverlay.classList.remove('hidden');
    try {
        const { FilesetResolver, ImageSegmenter } = window;
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        state.segmenter = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/1/hair_segmenter.tflite",
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            outputCategoryMask: true,
            outputConfidenceMasks: false
        });

        console.log("AI Model Loaded");
        state.isModelLoading = false;
        loadingOverlay.classList.add('hidden');
        predictWebcam();
    } catch (e) {
        console.error("AI Init Error:", e);
        loadingOverlay.classList.add('hidden');
        alert("AI Model failed. Hair features disabled.");
    }
}

// Prediction Loop (runs as fast as possible/needed)
let lastVideoTime = -1;
async function predictWebcam() {
    if (state.mode === 'camera' && state.segmenter && video.readyState >= 2 && !video.paused && !video.ended) {
        if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            try {
                const startTimeMs = performance.now();
                state.segmentationResult = await state.segmenter.segmentForVideo(video, startTimeMs);
            } catch (e) { }
        }
    }
    requestAnimationFrame(predictWebcam);
}


// --- MAIN RENDERING LOOP (Viewfinder) ---
const ctxFeed = canvasFeed.getContext('2d', { willReadFrequently: true });

function renderLoop() {
    if (state.mode === 'camera' && video.readyState >= 2) {
        // Sync canvas size to video size?
        // Or keep canvas size fixed to window?
        // Better: Canvas size = Video Size (for 1:1 pixel mapping) 
        // CSS handles scaling to screen 'contain'.
        if (canvasFeed.width !== video.videoWidth) {
            canvasFeed.width = video.videoWidth;
            canvasFeed.height = video.videoHeight;
        }

        const w = canvasFeed.width;
        const h = canvasFeed.height;

        // 1. Draw Video Frame
        ctxFeed.drawImage(video, 0, 0, w, h);

        // 2. Get Data if needed (Only if we have filters or hair tint active)
        // Optimization: If no filters, just drawing is enough?
        // BUT user expects "Preview" of filters. So we MUST process.
        // Performance hit is unavoidable for full preview.

        const imageData = ctxFeed.getImageData(0, 0, w, h);

        // 3. Get Mask (Async result)
        // Mask usually matches video input size.
        let mask = null;
        if (state.segmentationResult) {
            mask = state.segmentationResult.categoryMask.getAsUint8Array();
        }

        // 4. Transform Pixels
        applyFiltersToData(imageData.data, w, h, mask);

        // 5. Put Back
        ctxFeed.putImageData(imageData, 0, 0);
    }

    requestAnimationFrame(renderLoop);
}


// --- CAMERA SETUP ---
async function initCamera() {
    if (state.mode !== 'camera') return;
    if (state.stream) state.stream.getTracks().forEach(t => t.stop());

    try {
        const constraints = {
            video: {
                facingMode: state.facingMode,
                width: { ideal: 1280 }, // 720p is good compromise for JS processing per frame
                height: { ideal: 720 },
                zoom: true
            },
            audio: false
        };
        state.stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = state.stream;
        // video.play(); // Auto-played by attribute, but sometimes needed.

        // Mirror Logic done via CSS on Canvas
        updateMirroring();

        // Hardware Zoom Init
        const track = state.stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities();
        if (capabilities.zoom) {
            state.zoomMin = capabilities.zoom.min;
            state.zoomMax = capabilities.zoom.max;
            zoomSlider.min = state.zoomMin;
            zoomSlider.max = state.zoomMax;
            zoomSlider.step = capabilities.zoom.step || 0.1;
        } else {
            zoomSlider.min = 1; zoomSlider.max = 3; zoomSlider.step = 0.1;
        }
        zoomSlider.value = state.zoom;
        if (capabilities.zoom) {
            track.applyConstraints({ advanced: [{ zoom: state.zoom }] });
        }

    } catch (err) { console.error("Camera error:", err); }
}

function updateMirroring() {
    if (state.facingMode === 'user') {
        canvasFeed.style.transform = 'scaleX(-1)';
    } else {
        canvasFeed.style.transform = 'scaleX(1)';
    }
}

// Mode Switching
function setMode(mode) {
    state.mode = mode;
    if (mode === 'camera') {
        video.hidden = true; // Video always hidden, we rely on canvas feed
        canvasFeed.hidden = false;
        staticImage.classList.add('hidden');
        switchCameraBtn.classList.remove('hidden');
        galleryBtn.classList.remove('hidden');
        closeImageBtn.classList.add('hidden');
        zoomContainer.style.display = 'flex';
        initCamera();
    } else {
        canvasFeed.hidden = true;
        video.hidden = true;
        staticImage.classList.remove('hidden');
        switchCameraBtn.classList.add('hidden');
        galleryBtn.classList.add('hidden');
        closeImageBtn.classList.remove('hidden');
        zoomContainer.style.display = 'none';
        if (state.stream) {
            state.stream.getTracks().forEach(t => t.stop());
            state.stream = null;
        }

        // Static Image Segmentation
        if (state.segmenter && staticImage.complete) {
            state.segmenter.segment(staticImage, (result) => {
                state.segmentationResult = result;
                // Force a repaint/updateVisuals for invalidation?
                // Visuals for Static Image are handled via 'updateVisuals' (CSS).
                // WAIT. If we want HAIR TINT on static image, CSS hue-rotate won't work selectively.
                // We need Canvas for Static Image too? 
                // Or just use the capture logic to 'Apply' it finally?
                // User expects Preview in Gallery too.
                // Let's keep it simple: CSS Preview only for gallery for now (Global tint).
            });
        }
    }
}

galleryBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            staticImage.src = e.target.result;
            staticImage.onload = () => {
                setMode('image');
                if (state.segmenter) {
                    state.segmenter.segment(staticImage, (result) => {
                        state.segmentationResult = result; // Store for capture
                    });
                }
            };
        };
        reader.readAsDataURL(file);
    }
    fileInput.value = '';
});
closeImageBtn.addEventListener('click', () => setMode('camera'));

// Wait for Global MediaPipe
if (window.FilesetResolver) initAI();
else window.addEventListener('mediapipe-ready', initAI);

// Kick off Render Loop
renderLoop();


// --- LOGIC ---
// Visuals (CSS) - NO LONGER USED FOR CAMERA PREVIEW. ONLY FOR GALLERY PREVIEW (Global Tint)
function updateVisuals() {
    // Gallery Mode Only
    if (state.mode === 'image') {
        // Just global tint for gallery preview
        const manualFilter = `brightness(${state.brightness}%) contrast(${state.contrast}%) saturate(${state.saturate}%) hue-rotate(${state.hue}deg)`;
        let presetFilter = getPresetFilterStr();
        staticImage.style.filter = `${manualFilter} ${presetFilter}`.trim();
    }
}
// We call this to update state, but renderLoop handles Camera logic
function handleSliderChange(e) {
    const { id, value } = e.target;
    if (id === 'hair-hue') state.hue = value;
    else state[id] = value;
    updateVisuals();
}
function getPresetFilterStr() {
    if (state.activeFilter === 'bw') return 'grayscale(100%)';
    if (state.activeFilter === 'sepia') return 'sepia(100%)';
    if (state.activeFilter === 'vintage') return 'sepia(50%) contrast(80%) brightness(110%)';
    if (state.activeFilter === 'cyber') return 'saturate(200%) contrast(120%) hue-rotate(180deg)';
    if (state.activeFilter === 'auto-enhance') return 'contrast(115%) saturate(125%)';
    return '';
}

function resetSliders() {
    state.brightness = 100; state.contrast = 100; state.saturate = 100;
    state.hue = 0; state.zoom = 1;
    sliders.brightness.value = 100; sliders.contrast.value = 100; sliders.saturate.value = 100;
    sliders.hue.value = 0; zoomSlider.value = 1; zoomValue.innerText = '1x';

    if (state.mode === 'camera' && state.stream) {
        const track = state.stream.getVideoTracks()[0];
        if (track.getCapabilities().zoom) track.applyConstraints({ advanced: [{ zoom: 1 }] });
    }
    updateMirroring();
    updateVisuals();
}
Object.values(sliders).forEach(s => s.addEventListener('input', handleSliderChange));
document.getElementById('reset-sliders').addEventListener('click', resetSliders);

// ... Panel switching code ...
function switchPanel(panelName) {
    [sliderPanel, beautyPanel, filtersPanel].forEach(p => p.classList.remove('active'));
    [toggleSlidersBtn, toggleBeautyBtn, toggleFiltersBtn].forEach(b => b.classList.remove('active'));

    if (panelName === 'adjust') {
        sliderPanel.classList.add('active');
        toggleSlidersBtn.classList.add('active');
    } else if (panelName === 'beauty') {
        beautyPanel.classList.add('active');
        toggleBeautyBtn.classList.add('active');
    } else if (panelName === 'filters') {
        filtersPanel.classList.add('active');
        toggleFiltersBtn.classList.add('active');
    }
}
toggleSlidersBtn.addEventListener('click', () => switchPanel('adjust'));
toggleBeautyBtn.addEventListener('click', () => switchPanel('beauty'));
toggleFiltersBtn.addEventListener('click', () => switchPanel('filters'));
document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        state.activeFilter = e.target.getAttribute('data-filter');
        updateVisuals(); // for gallery
    });
});
switchCameraBtn.addEventListener('click', () => {
    state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
    initCamera();
});
zoomSlider.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    state.zoom = value;
    zoomValue.innerText = value.toFixed(1) + 'x';
    if (state.mode === 'camera' && state.stream) {
        const track = state.stream.getVideoTracks()[0];
        if (track.getCapabilities().zoom) {
            track.applyConstraints({ advanced: [{ zoom: value }] });
        }
        // Software Zoom via CSS transform? 
        // We handle software zoom in renderLoop or Capture logic? 
        // For Viewfinder (Canvas), we can drawImage with crop if needed.
        // But let's leave viewfinder full frame if hardware zoom fails, to keep it simple, 
        // BUT capture will be cropped.
    }
});


// PIXEL MATH
function clamp(val) { return Math.max(0, Math.min(255, val)); }

function applyFiltersToData(data, w, h, mask) {
    const b = state.brightness / 100;
    const c = state.contrast / 100;
    const s = state.saturate / 100;

    // Hue Coefficients
    const hueRad = (state.hue * Math.PI) / 180;
    const cosA = Math.cos(hueRad);
    const sinA = Math.sin(hueRad);
    const h_r1 = cosA + (1.0 - cosA) / 3.0;
    const h_r2 = (1.0 - cosA) / 3.0 - Math.sqrt(1.0 / 3.0) * sinA;
    const h_r3 = (1.0 - cosA) / 3.0 + Math.sqrt(1.0 / 3.0) * sinA;
    const h_g1 = (1.0 - cosA) / 3.0 + Math.sqrt(1.0 / 3.0) * sinA;
    const h_g2 = cosA + 1.0 / 3.0 * (1.0 - cosA);
    const h_g3 = (1.0 - cosA) / 3.0 - Math.sqrt(1.0 / 3.0) * sinA;
    const h_b1 = (1.0 - cosA) / 3.0 - Math.sqrt(1.0 / 3.0) * sinA;
    const h_b2 = (1.0 - cosA) / 3.0 + Math.sqrt(1.0 / 3.0) * sinA;
    const h_b3 = cosA + 1.0 / 3.0 * (1.0 - cosA);

    for (let i = 0; i < data.length; i += 4) {
        let r_in = data[i], g_in = data[i + 1], b_in = data[i + 2];

        // 1. SELECTIVE HUE (Hair)
        let r = r_in, g = g_in, b_val = b_in;
        let isHair = false;

        if (mask && state.hue !== 0) {
            // Mask mapping: mask size == w*h? 
            const pixelIndex = i / 4;
            if (mask[pixelIndex] === 1) isHair = true;
        }

        if (state.hue !== 0) {
            if (isHair || (!mask && state.mode === 'image')) {
                // Apply Hue if hair, OR if image mode/no mask (fallback global)
                // Note: Better to just not apply if no mask in camera mode?
                // User wants Selective. If no mask, don't color face!
                if (isHair) {
                    const rx = r * h_r1 + g * h_r2 + b_val * h_r3;
                    const gx = r * h_g1 + g * h_g2 + b_val * h_g3;
                    const bx = r * h_b1 + g * h_b2 + b_val * h_b3;
                    r = rx; g = gx; b_val = bx;
                }
            }
        }

        // 2. Global Adjustments
        r *= b; g *= b; b_val *= b;
        r = (r - 128) * c + 128; // Contrast
        g = (g - 128) * c + 128;
        b_val = (b_val - 128) * c + 128;

        const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b_val; // Saturation
        r = gray + (r - gray) * s;
        g = gray + (g - gray) * s;
        b_val = gray + (b_val - gray) * s;

        // 3. Presets
        if (state.activeFilter === 'bw') {
            const avg = 0.3 * r + 0.59 * g + 0.11 * b_val;
            r = avg; g = avg; b_val = avg;
        } else if (state.activeFilter === 'sepia') {
            const tr = 0.393 * r + 0.769 * g + 0.189 * b_val;
            const tg = 0.349 * r + 0.686 * g + 0.168 * b_val;
            const tb = 0.272 * r + 0.534 * g + 0.131 * b_val;
            r = tr; g = tg; b_val = tb;
        } else if (state.activeFilter === 'vintage') {
            const tr = 0.393 * r + 0.769 * g + 0.189 * b_val;
            const tg = 0.349 * r + 0.686 * g + 0.168 * b_val;
            const tb = 0.272 * r + 0.534 * g + 0.131 * b_val;
            r = r * 0.5 + tr * 0.5;
            g = g * 0.5 + tg * 0.5;
            b_val = b_val * 0.5 + tb * 0.5;
            r = ((r - 128) * 0.8 + 128) * 1.1;
            g = ((g - 128) * 0.8 + 128) * 1.1;
            b_val = ((b_val - 128) * 0.8 + 128) * 1.1;
        } else if (state.activeFilter === 'cyber') {
            r = (r - 128) * 1.4 + 128;
            g = (g - 128) * 1.4 + 128;
            b_val = (b_val - 128) * 1.6 + 128;
            const gr = 0.3 * r + 0.59 * g + 0.11 * b_val;
            r = gr + (r - gr) * 2.0;
            g = gr + (g - gr) * 2.0;
            b_val = gr + (b_val - gr) * 2.0;
        } else if (state.activeFilter === 'auto-enhance') {
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

// CAPTURE
shutterBtn.addEventListener('click', async () => {
    // Sound & Flash
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.type = 'sine'; osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 0.1);

    flashOverlay.style.opacity = 0.8;
    setTimeout(() => flashOverlay.style.opacity = 0, 150);

    // Get source
    let width, height;
    if (state.mode === 'camera') {
        width = video.videoWidth; height = video.videoHeight;
    } else {
        width = staticImage.naturalWidth; height = staticImage.naturalHeight;
    }

    // Set canvas sizes
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Software Zoom Crop (If Hardware zoom unavailable)
    let sx = 0, sy = 0, sWidth = width, sHeight = height;
    let isSoftwareZoom = false;
    if (state.mode === 'camera' && state.zoom > 1) {
        const track = state.stream.getVideoTracks()[0];
        const cap = track.getCapabilities ? track.getCapabilities() : {};
        if (!cap.zoom) isSoftwareZoom = true;
    }
    if (isSoftwareZoom) {
        sWidth = width / state.zoom; sHeight = height / state.zoom;
        sx = (width - sWidth) / 2; sy = (height - sHeight) / 2;
    }

    // Draw Source to Canvas (Raw)
    if (state.mode === 'camera' && state.facingMode === 'user') {
        ctx.translate(width, 0); ctx.scale(-1, 1);
    }
    if (state.mode === 'camera') ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, width, height);
    else ctx.drawImage(staticImage, 0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height);

    // Re-run segmentation on captured frame for best mask quality?
    // Using previous frame mask might be misaligned if fast movement or crop?
    // If we cropped, previous mask is useless unless we crop mask too.
    // Better to rerun segmentation on the 'imageData' we just captured.
    let mask = null;
    if (state.segmenter && state.hue !== 0) {
        try {
            const result = state.segmenter.segment(imageData);
            mask = result.categoryMask.getAsUint8Array();
        } catch (e) { }
    }

    applyFiltersToData(imageData.data, width, height, mask);
    ctx.putImageData(imageData, 0, 0);

    // Save
    canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `lumina_${Date.now()}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 'image/jpeg', 0.95);
});
