// State
const state = {
    brightness: 100,
    contrast: 100,
    saturate: 100,
    hue: 0, // Hair Tint (0-360)
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


// AI Initialization
async function initAI() {
    loadingOverlay.classList.remove('hidden');
    try {
        const { FilesetResolver, ImageSegmenter } = window;

        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );

        state.segmenter = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath:
                    "https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/1/hair_segmenter.tflite",
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            outputCategoryMask: true,
            outputConfidenceMasks: false
        });

        console.log("AI Model Loaded");
        state.isModelLoading = false;
        loadingOverlay.classList.add('hidden');

        // Start prediction loop
        predictWebcam();

    } catch (e) {
        console.error("AI Init Error:", e);
        loadingOverlay.classList.add('hidden');
        alert("AI Model failed to load. Hair color feature may not work.");
    }
}

// Wait for global imports or immediate if ready
if (window.FilesetResolver) {
    initAI();
} else {
    window.addEventListener('mediapipe-ready', initAI);
}


// Continuous Prediction Loop for Live Video
let lastVideoTime = -1;
async function predictWebcam() {
    if (state.mode === 'camera' && state.segmenter && video.currentTime !== lastVideoTime && !video.paused && !video.ended) {
        lastVideoTime = video.currentTime;
        try {
            const startTimeMs = performance.now();
            // result: { categoryMask: Float32Array, width, height }
            // Hair is category index 1 usually for hair segmenter? Or just mask?
            // Hair Segmenter output: category mask with 0=bg, 1=hair.
            state.segmentationResult = await state.segmenter.segmentForVideo(video, startTimeMs);
        } catch (e) { console.log(e); }
    }
    // Also handle Static Image segmentation if needed? 
    // For static image, we'll run segment() once when image loaded.

    requestAnimationFrame(predictWebcam);
}


// Camera Init
async function initCamera() {
    if (state.mode !== 'camera') return;
    if (state.stream) state.stream.getTracks().forEach(t => t.stop());

    try {
        const constraints = {
            video: {
                facingMode: state.facingMode,
                width: { ideal: 1280 }, // Lower res for detection speed check? 1920 might be heavy
                height: { ideal: 720 },
                zoom: true
            },
            audio: false
        };
        state.stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = state.stream;
        video.classList.toggle('rear-camera', state.facingMode === 'environment');

        const track = state.stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities();

        if (capabilities.zoom) {
            state.zoomMin = capabilities.zoom.min;
            state.zoomMax = capabilities.zoom.max;
            zoomSlider.min = state.zoomMin;
            zoomSlider.max = state.zoomMax;
            zoomSlider.step = capabilities.zoom.step || 0.1;
            zoomSlider.value = state.zoom;
            track.applyConstraints({ advanced: [{ zoom: state.zoom }] });
        } else {
            state.zoomMin = 1;
            state.zoomMax = 3;
            zoomSlider.min = 1;
            zoomSlider.max = 3;
            zoomSlider.step = 0.1;
            zoomSlider.value = state.zoom;
        }

    } catch (err) {
        console.error("Camera error:", err);
    }
}

function setMode(mode) {
    state.mode = mode;
    if (mode === 'camera') {
        video.hidden = false;
        staticImage.classList.add('hidden');
        switchCameraBtn.classList.remove('hidden');
        galleryBtn.classList.remove('hidden');
        closeImageBtn.classList.add('hidden');
        zoomContainer.style.display = 'flex';
        initCamera();

        // Switch Segmenter to VIDEO mode if needed (Task API is tricky with switching modes dynamically, 
        // usually safer to check 'runningMode' or create new. 
        // We initialized with 'VIDEO'. For image, we might need 'IMAGE'.
        // Let's rely on 'segmentForVideo' for camera. 

    } else {
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

        // Perform segmentation on the static image once
        if (state.segmenter && staticImage.complete) {
            // We need to switch to pure image segmentation? 
            // Or just pass the image to segment makes sense.
            state.segmenter.segment(staticImage, (result) => {
                state.segmentationResult = result;
                updateVisuals(); // Repaint canvas overlay if we were doing that
            });
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
                // Run segmentation for static image
                if (state.segmenter) {
                    state.segmenter.segment(staticImage, (result) => {
                        state.segmentationResult = result;
                    });
                }
            };
        };
        reader.readAsDataURL(file);
    }
    fileInput.value = '';
});
closeImageBtn.addEventListener('click', () => setMode('camera'));

// Zoom Logic
zoomSlider.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    state.zoom = value;
    zoomValue.innerText = value.toFixed(1) + 'x';

    if (state.mode === 'camera' && state.stream) {
        const track = state.stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities();
        if (capabilities.zoom) {
            track.applyConstraints({ advanced: [{ zoom: value }] });
            video.style.transform = state.facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
        } else {
            const baseTransform = state.facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
            video.style.transform = `${baseTransform} scale(${value})`;
        }
    }
});

// Visuals (CSS Preview)
// NOTE: We cannot easily preview "Hair Only" color logic via simple CSS hue-rotate.
// CSS hue-rotate applies to everything. 
// For "Beauty Mode" preview, if they are using Hair Color slider, the preview on the <video> element
// will show GLOBAL hue rotation (changing face color too). 
// This is a known limitation unless we render video to a canvas every frame.
// PROPOSAL: To avoid heavy Canvas rendering loop for preview, we will accept that the 
// PREVIEW shows global color shift, but the CAPTURE shows only hair.
// OR: We create a preview canvas overlaid on video?
// Let's implement the "Global Preview, Accurate Capture" approach for performance first.
// If user says "My face is green", we explain it applies to hair only on save, 
// OR we switch to Canvas-based rendering loop for the entire viewfinder.
// Given "Premium Experience", Canvas Viewfinder is better but power hungry. 
// Let's stick to CSS filters for now for responsiveness, but maybe warn user?
// BETTER: If Detetction is running, we could theoretically draw the mask on a canvas overlay.
// Let's stick to "CSS Global Tint" for preview, but maybe dial it down? 
// No, let's keep it simple: "Hair Tint" slider affects CSS hue-rotate, making whole video change color.
function updateVisuals() {
    // If we are in Beauty mode and adjusting Hue, user sees global change.

    const manualFilter = `brightness(${state.brightness}%) contrast(${state.contrast}%) saturate(${state.saturate}%) hue-rotate(${state.hue}deg)`;
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
    if (id === 'hair-hue') state.hue = value;
    else state[id] = value;
    updateVisuals();
}

function resetSliders() {
    state.brightness = 100;
    state.contrast = 100;
    state.saturate = 100;
    state.hue = 0;
    state.zoom = 1;

    sliders.brightness.value = 100;
    sliders.contrast.value = 100;
    sliders.saturate.value = 100;
    sliders.hue.value = 0;
    zoomSlider.value = 1;
    zoomValue.innerText = '1x';

    if (state.mode === 'camera') {
        const track = state.stream.getVideoTracks()[0];
        if (track.getCapabilities().zoom) {
            track.applyConstraints({ advanced: [{ zoom: 1 }] });
        }
        const baseTransform = state.facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
        video.style.transform = baseTransform;
    }
    updateVisuals();
}
Object.values(sliders).forEach(slider => slider.addEventListener('input', handleSliderChange));
document.getElementById('reset-sliders').addEventListener('click', resetSliders);

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
        updateVisuals();
    });
});
switchCameraBtn.addEventListener('click', () => {
    state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
    initCamera();
});


// PIXEL MATH / CAPTURE LOGIC
function clamp(val) { return Math.max(0, Math.min(255, val)); }

function applyFiltersToData(data, w, h, mask) {
    const b = state.brightness / 100;
    const c = state.contrast / 100;
    const s = state.saturate / 100;

    // Hue Matrix Precalc
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
        let r_in = data[i];
        let g_in = data[i + 1];
        let b_in = data[i + 2];

        // 1. SELECTIVE HUE (Hair Only)
        // If we have a mask, and this pixel corresponds to hair
        let r = r_in, g = g_in, b_val = b_in;

        // Apply Hue Rotate only if mask says it's hair
        // Mask is Float32Array usually size w * h. 
        // Data is w*h*4. 
        // Mask usually matches segmentation result size, which might differ?
        // segmentForVideo result: mask is same size as input Usually?
        // If using MediaPipe ImageSegmenter, mask is flattened array of category indices or confidence?
        // We configured outputCategoryMask: true. So it is Uint8Array/Float32Array of indices.

        if (mask && state.hue !== 0) {
            const pixelIndex = i / 4;
            // category 1 is usually hair in 'hair_segmenter'
            if (mask[pixelIndex] === 1) {
                // Apply Hue
                const rx = r * h_r1 + g * h_r2 + b_val * h_r3;
                const gx = r * h_g1 + g * h_g2 + b_val * h_g3;
                const bx = r * h_b1 + g * h_b2 + b_val * h_b3;
                r = rx; g = gx; b_val = bx;
            }
        } else if (!mask && state.hue !== 0) {
            // Fallback: Global Hue if no mask (or model failed)
            const rx = r * h_r1 + g * h_r2 + b_val * h_r3;
            const gx = r * h_g1 + g * h_g2 + b_val * h_g3;
            const bx = r * h_b1 + g * h_b2 + b_val * h_b3;
            r = rx; g = gx; b_val = bx;
        }

        // 2. Global Adjustments (Brightness, Contrast, Saturation)
        // Brightness
        r *= b; g *= b; b_val *= b;

        // Contrast
        r = (r - 128) * c + 128;
        g = (g - 128) * c + 128;
        b_val = (b_val - 128) * c + 128;

        // Saturation
        const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b_val;
        r = gray + (r - gray) * s;
        g = gray + (g - gray) * s;
        b_val = gray + (b_val - gray) * s;

        // 3. Preset Filters (Global)
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

// NOTE: Audio Context creation needs to be lazy or handled carefully to avoid autoplay blocks, 
// usually on first user interaction is best.
document.body.addEventListener('click', () => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
}, { once: true });


shutterBtn.addEventListener('click', async () => {
    playShutterSound();
    flashOverlay.style.opacity = 0.8;
    setTimeout(() => flashOverlay.style.opacity = 0, 150);

    let source = (state.mode === 'camera') ? video : staticImage;
    let width = (state.mode === 'camera') ? video.videoWidth : staticImage.naturalWidth;
    let height = (state.mode === 'camera') ? video.videoHeight : staticImage.naturalHeight;

    // Zoom Crop Math
    let sx = 0, sy = 0, sWidth = width, sHeight = height;
    let isSoftwareZoom = false;
    if (state.mode === 'camera' && state.zoom > 1) {
        const track = state.stream.getVideoTracks()[0];
        const cap = track.getCapabilities ? track.getCapabilities() : {};
        if (!cap.zoom) isSoftwareZoom = true;
    }
    if (isSoftwareZoom) {
        sWidth = width / state.zoom;
        sHeight = height / state.zoom;
        sx = (width - sWidth) / 2;
        sy = (height - sHeight) / 2;
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (state.mode === 'camera' && state.facingMode === 'user') {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
    }

    // Capture RAW
    ctx.drawImage(source, sx, sy, sWidth, sHeight, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);

    // AI Segmentation Mask Retrieval for CAPTURED image
    // If we rely on the continuously updating 'state.segmentationResult', that matches the VIDEO element size/fov.
    // If we cropped (software zoom), the mask won't align perfectly unless we crop the mask too!
    // COMPLEXITY: Mask is low res or matches video input.
    // Ideally, we run segmentation ON THE CAPTURED IMAGE CANVAS DATA.
    // This ensures perfect alignment.
    let mask = null;
    if (state.segmenter && state.hue !== 0) {
        // Run segmenter on the captured imageData
        // We can pass ImageData directly to segment method?
        // segment(image: ImageData | HTMLImageElement | ...): SegmentationResult
        try {
            const result = state.segmenter.segment(imageData);
            // hair_segmenter: category mask. index 0=bg, 1=hair?
            mask = result.categoryMask.getAsUint8Array();
        } catch (e) {
            console.error("Segmentation during capture failed", e);
        }
    }

    applyFiltersToData(imageData.data, width, height, mask);
    ctx.putImageData(imageData, 0, 0);

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

// Init
initCamera();
updateVisuals();
