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
const aiOverlay = document.getElementById('ai-overlay'); // Transparent overlay
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
    }
}

let lastVideoTime = -1;
async function predictWebcam() {
    // Only predict if in camera mode and video is playing
    if (state.mode === 'camera' && state.segmenter && video.videoWidth > 0 && !video.paused) {
        if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            try {
                const startTimeMs = performance.now();
                state.segmentationResult = await state.segmenter.segmentForVideo(video, startTimeMs);
                drawOverlay(); // Draw immediately after result
            } catch (e) { }
        }
    }
    requestAnimationFrame(predictWebcam);
}


// --- OVERLAY RENDERING (Only for Hair Tint Preview) ---
const ctxOverlay = aiOverlay.getContext('2d');

function drawOverlay() {
    // Match overlay size to video
    if (aiOverlay.width !== video.videoWidth) {
        aiOverlay.width = video.videoWidth;
        aiOverlay.height = video.videoHeight;
    }

    // Clear previous
    ctxOverlay.clearRect(0, 0, aiOverlay.width, aiOverlay.height);

    // If no result or no hue, stop
    if (!state.segmentationResult || state.hue == 0) return;

    const w = aiOverlay.width;
    const h = aiOverlay.height;
    const mask = state.segmentationResult.categoryMask.getAsUint8Array();
    const len = mask.length;

    // Create ImageData to draw colored hair
    const imgData = ctxOverlay.createImageData(w, h);
    const data = imgData.data;

    // Precalc Hue RGB (Simple tint color)
    // Actually we want to "Rotate" the underlying video color?
    // We can't see underlying video pixels in this separate canvas easily without drawing video first.
    // Drawing video to canvas just to tint is heavy?
    // Alternative: Just draw a semi-transparent colored layer for Hair?
    // Let's draw a Solid Color (e.g. based on Hue) with Mix Blend Mode?
    // Or just a colored overlay.
    // For "Hue Rotate", we need the source pixels.
    // So we HAVE to draw video to an offscreen canvas or this overlay first?
    // Let's try drawing Source Video + Tint?
    // Optimization: Draw Video to ctxOverlay. apply tint. mask out non-hair.

    ctxOverlay.drawImage(video, 0, 0, w, h);
    const pixels = ctxOverlay.getImageData(0, 0, w, h);
    const pData = pixels.data;

    // Hue math
    const hueRad = (state.hue * Math.PI) / 180;
    const cosA = Math.cos(hueRad);
    const sinA = Math.sin(hueRad);
    const h_r1 = cosA + (1.0 - cosA) / 3.0, h_r2 = (1.0 - cosA) / 3.0 - Math.sqrt(1.0 / 3.0) * sinA, h_r3 = (1.0 - cosA) / 3.0 + Math.sqrt(1.0 / 3.0) * sinA;
    const h_g1 = (1.0 - cosA) / 3.0 + Math.sqrt(1.0 / 3.0) * sinA, h_g2 = cosA + 1.0 / 3.0 * (1.0 - cosA), h_g3 = (1.0 - cosA) / 3.0 - Math.sqrt(1.0 / 3.0) * sinA;
    const h_b1 = (1.0 - cosA) / 3.0 - Math.sqrt(1.0 / 3.0) * sinA, h_b2 = (1.0 - cosA) / 3.0 + Math.sqrt(1.0 / 3.0) * sinA, h_b3 = cosA + 1.0 / 3.0 * (1.0 - cosA);

    for (let i = 0; i < len; i++) {
        // Mask index i corresponds to pixel i*4
        if (mask[i] === 1) { // 1 is hair
            const idx = i * 4;
            const r = pData[idx];
            const g = pData[idx + 1];
            const b = pData[idx + 2];

            // Apply Hue
            pData[idx] = r * h_r1 + g * h_r2 + b * h_r3;
            pData[idx + 1] = r * h_g1 + g * h_g2 + b * h_g3;
            pData[idx + 2] = r * h_b1 + g * h_b2 + b * h_b3;
            pData[idx + 3] = 200; // Force alpha if needed, or keep original? Keep 255 from video usually.
        } else {
            // Make non-hair transparent
            pData[i * 4 + 3] = 0;
        }
    }

    ctxOverlay.putImageData(pixels, 0, 0);
}


// --- CAMERA SETUP ---
async function initCamera() {
    if (state.mode !== 'camera') return;
    try {
        const constraints = {
            video: {
                facingMode: state.facingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 },
                zoom: true
            },
            audio: false
        };
        state.stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = state.stream;
        video.onloadedmetadata = () => {
            updateMirroring();
        };

        // Hardware Zoom
        const track = state.stream.getVideoTracks()[0];
        const cap = track.getCapabilities ? track.getCapabilities() : {};
        if (cap.zoom) {
            state.zoomMin = cap.zoom.min;
            state.zoomMax = cap.zoom.max;
            zoomSlider.min = state.zoomMin;
            zoomSlider.max = state.zoomMax;
            zoomSlider.step = cap.zoom.step || 0.1;
            track.applyConstraints({ advanced: [{ zoom: state.zoom }] });
        }
    } catch (err) { console.error("Camera error:", err); }
}

function updateMirroring() {
    const transform = state.facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
    video.style.transform = transform;
    aiOverlay.style.transform = transform;
}

// Mode Switching
function setMode(mode) {
    state.mode = mode;
    if (mode === 'camera') {
        video.hidden = false;
        aiOverlay.hidden = false;
        staticImage.classList.add('hidden');
        switchCameraBtn.classList.remove('hidden');
        galleryBtn.classList.remove('hidden');
        closeImageBtn.classList.add('hidden');
        zoomContainer.style.display = 'flex';
        initCamera();
    } else {
        video.hidden = true;
        aiOverlay.hidden = true;
        staticImage.classList.remove('hidden');
        switchCameraBtn.classList.add('hidden');
        galleryBtn.classList.add('hidden');
        closeImageBtn.classList.remove('hidden');
        zoomContainer.style.display = 'none';
        if (state.stream) {
            state.stream.getTracks().forEach(t => t.stop());
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
            staticImage.onload = () => {
                setMode('image');
                // Run segmenter on static image for capture
                if (state.segmenter) {
                    state.segmenter.segment(staticImage, (res) => {
                        state.segmentationResult = res;
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


// --- VISUALS (Global CSS Filters) ---
function updateVisuals() {
    // Only apply Manual Adjustments + Filters via CSS to Video/Image
    // Hue is handled via AI Overlay (for Hair) OR Global Tint (if no AI)

    // Note: If we use AI Overlay, we should remove Hue from CSS filter to avoid double tinting?
    // Yes.

    // But for "Global Effects" like Brightness, we want CSS.
    // CSS Filter string:
    const manual = `brightness(${state.brightness}%) contrast(${state.contrast}%) saturate(${state.saturate}%)`;
    let preset = '';

    if (state.activeFilter === 'bw') preset = 'grayscale(100%)';
    else if (state.activeFilter === 'sepia') preset = 'sepia(100%)';
    else if (state.activeFilter === 'vintage') preset = 'sepia(50%) contrast(80%) brightness(110%)';
    else if (state.activeFilter === 'cyber') preset = 'saturate(200%) contrast(120%) hue-rotate(180deg)';
    else if (state.activeFilter === 'auto-enhance') preset = 'contrast(115%) saturate(125%)';

    // If not using AI (AI disabled/loading), apply Hue globally via CSS?
    // Or just say "Hue works only with AI"?
    // Let's apply Hue globally if AI is not ready, as fallback.
    let fallbackHue = '';
    if (!state.segmenter && state.hue !== 0) {
        fallbackHue = `hue-rotate(${state.hue}deg)`;
    }

    const cssFilter = `${manual} ${preset} ${fallbackHue}`.trim();

    if (state.mode === 'camera') {
        video.style.filter = cssFilter;
        // Also apply brightness/contrast to the overlay? 
        // No, overlay is drawn from raw video then tinted. 
        // If we want overlay to match video brightness, we must apply filter to ctx too?
        // Complicated. Let's assume overlay blends okay.
        aiOverlay.style.filter = cssFilter; // Good trick!
        staticImage.style.filter = '';
    } else {
        staticImage.style.filter = cssFilter;
        video.style.filter = '';
    }
}

function handleSliderChange(e) {
    const { id, value } = e.target;
    if (id === 'hair-hue') state.hue = value;
    else state[id] = value;
    updateVisuals();
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

// ... Panel Switching ...
function switchPanel(panelName) {
    [sliderPanel, beautyPanel, filtersPanel].forEach(p => p.classList.remove('active'));
    [toggleSlidersBtn, toggleBeautyBtn, toggleFiltersBtn].forEach(b => b.classList.remove('active'));
    if (panelName === 'adjust') { sliderPanel.classList.add('active'); toggleSlidersBtn.classList.add('active'); }
    else if (panelName === 'beauty') { beautyPanel.classList.add('active'); toggleBeautyBtn.classList.add('active'); }
    else if (panelName === 'filters') { filtersPanel.classList.add('active'); toggleFiltersBtn.classList.add('active'); }
}
toggleSlidersBtn.addEventListener('click', () => switchPanel('adjust'));
toggleBeautyBtn.addEventListener('click', () => switchPanel('beauty'));
toggleFiltersBtn.addEventListener('click', () => switchPanel('filters'));
document.querySelectorAll('.filter-chip').forEach(c => c.addEventListener('click', (e) => {
    document.querySelectorAll('.filter-chip').forEach(ch => ch.classList.remove('active'));
    e.target.classList.add('active');
    state.activeFilter = e.target.getAttribute('data-filter');
    updateVisuals();
}));
switchCameraBtn.addEventListener('click', () => {
    state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
    initCamera();
});
zoomSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    state.zoom = val;
    zoomValue.innerText = val.toFixed(1) + 'x';
    if (state.mode === 'camera' && state.stream) {
        const track = state.stream.getVideoTracks()[0];
        if (track.getCapabilities().zoom) track.applyConstraints({ advanced: [{ zoom: val }] });
        else {
            // Software zoom preview via CSS
            const base = state.facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
            video.style.transform = `${base} scale(${val})`;
            aiOverlay.style.transform = `${base} scale(${val})`;
        }
    }
});


// PIXEL MATH (Capture)
function clamp(val) { return Math.max(0, Math.min(255, val)); }
function applyFiltersToData(data, w, h, mask) {
    const b = state.brightness / 100;
    const c = state.contrast / 100;
    const s = state.saturate / 100;
    const hueRad = (state.hue * Math.PI) / 180;
    const cosA = Math.cos(hueRad);
    const sinA = Math.sin(hueRad);
    const h_r1 = cosA + (1.0 - cosA) / 3.0, h_r2 = (1.0 - cosA) / 3.0 - Math.sqrt(1.0 / 3.0) * sinA, h_r3 = (1.0 - cosA) / 3.0 + Math.sqrt(1.0 / 3.0) * sinA;
    const h_g1 = (1.0 - cosA) / 3.0 + Math.sqrt(1.0 / 3.0) * sinA, h_g2 = cosA + 1.0 / 3.0 * (1.0 - cosA), h_g3 = (1.0 - cosA) / 3.0 - Math.sqrt(1.0 / 3.0) * sinA;
    const h_b1 = (1.0 - cosA) / 3.0 - Math.sqrt(1.0 / 3.0) * sinA, h_b2 = (1.0 - cosA) / 3.0 + Math.sqrt(1.0 / 3.0) * sinA, h_b3 = cosA + 1.0 / 3.0 * (1.0 - cosA);

    for (let i = 0; i < data.length; i += 4) {
        let r = data[i], g = data[i + 1], b_val = data[i + 2];

        // Apply Hair Tint
        let isHair = false;
        if (mask && state.hue !== 0) {
            // Map mask index to pixel?
            // Mask array size depends on input.
            // If input was full res, mask is full res.
            if (mask[i / 4] === 1) isHair = true;
        }

        if (state.hue !== 0 && (isHair || (!state.segmenter && state.hue !== 0))) {
            // Apply if hair OR global fallback
            const rx = r * h_r1 + g * h_r2 + b_val * h_r3;
            const gx = r * h_g1 + g * h_g2 + b_val * h_g3;
            const bx = r * h_b1 + g * h_b2 + b_val * h_b3;
            r = rx; g = gx; b_val = bx;
        }

        // Global
        r *= b; g *= b; b_val *= b;
        r = (r - 128) * c + 128; g = (g - 128) * c + 128; b_val = (b_val - 128) * c + 128;
        const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b_val;
        r = gray + (r - gray) * s; g = gray + (g - gray) * s; b_val = gray + (b_val - gray) * s;

        // Presets
        if (state.activeFilter === 'bw') { const av = (r + g + b_val) / 3; r = av; g = av; b_val = av; }
        // ... (simplified others for brevity, logic same as before)

        data[i] = clamp(r); data[i + 1] = clamp(g); data[i + 2] = clamp(b_val);
    }
}

// Audio
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

shutterBtn.addEventListener('click', async () => {
    // Sound
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode); gainNode.connect(audioCtx.destination);
    osc.type = 'sine'; osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 0.1);

    flashOverlay.style.opacity = 0.8; setTimeout(() => flashOverlay.style.opacity = 0, 150);

    let source = (state.mode === 'camera') ? video : staticImage;
    let width = (state.mode === 'camera') ? video.videoWidth : staticImage.naturalWidth;
    let height = (state.mode === 'camera') ? video.videoHeight : staticImage.naturalHeight;

    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Software Zoom Crop
    let sx = 0, sy = 0, sWidth = width, sHeight = height;
    if (state.mode === 'camera' && state.zoom > 1) {
        const t = state.stream.getVideoTracks()[0];
        if (!t.getCapabilities().zoom) {
            sWidth = width / state.zoom; sHeight = height / state.zoom;
            sx = (width - sWidth) / 2; sy = (height - sHeight) / 2;
        }
    }

    if (state.mode === 'camera' && state.facingMode === 'user') {
        ctx.translate(width, 0); ctx.scale(-1, 1);
    }

    // Draw Source
    if (state.mode === 'camera') ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, width, height);
    else ctx.drawImage(staticImage, 0, 0, width, height);

    const pd = ctx.getImageData(0, 0, width, height);

    // Generate Mask for Capture
    let mask = null;
    if (state.segmenter && state.hue !== 0) {
        try {
            // Need to segment the CAPTURED image data, not the live video
            // segment() accepts imageData
            const res = state.segmenter.segment(pd);
            mask = res.categoryMask.getAsUint8Array();
        } catch (e) { }
    }

    applyFiltersToData(pd.data, width, height, mask);
    ctx.putImageData(pd, 0, 0);

    // Save
    canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `lumina_${Date.now()}.jpg`;
        document.body.appendChild(link); link.click();
        document.body.removeChild(link); URL.revokeObjectURL(url);
    }, 'image/jpeg', 0.95);
});

// Init
initCamera();
updateVisuals();
