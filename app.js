// State
const state = {
    brightness: 100,
    contrast: 100,
    saturate: 100,
    hue: 0, // Hair Tint (0-360)
    glow: 0, // Soft Glow (0-100)
    activeFilter: 'none',
    facingMode: 'user',
    stream: null,
    mode: 'camera',
    zoom: 1,
    zoomMin: 1,
    zoomMax: 3,
    segmenter: null,
    segmentationResult: null
};

// Wait for DOM
document.addEventListener('DOMContentLoaded', () => {

    // Elements
    const video = document.getElementById('camera-feed');
    const aiOverlay = document.getElementById('ai-overlay');
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
    // We removed #loading-overlay from HTML, so safe to ignore or remove ref if not adding back.

    // Zoom
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
        glow: document.getElementById('soft-glow'),
        hue: document.getElementById('hair-hue')
    };

    // --- AI LOGIC (OPTIMIZED) ---
    async function initAI() {
        if (!window.FilesetResolver || !window.ImageSegmenter) return;
        try {
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
            predictWebcam();
        } catch (e) { console.error("AI Init Error ignored", e); }
    }

    if (window.FilesetResolver) initAI();
    else window.addEventListener('mediapipe-ready', initAI);

    // AI Loop - Throttled
    let lastVideoTime = -1;
    let frameCounter = 0;
    async function predictWebcam() {
        if (state.mode === 'camera' && state.segmenter && video && !video.paused && video.videoWidth > 0) {
            // Optimization: Run every 2nd or 3rd frame to save FPS
            frameCounter++;
            if (frameCounter % 3 === 0 && video.currentTime !== lastVideoTime) {
                lastVideoTime = video.currentTime;
                try {
                    const startTimeMs = performance.now();
                    state.segmentationResult = await state.segmenter.segmentForVideo(video, startTimeMs);
                    drawOverlay();
                } catch (e) { }
            }
        }
        requestAnimationFrame(predictWebcam);
    }

    function drawOverlay() {
        if (!aiOverlay) return;
        const ctxOverlay = aiOverlay.getContext('2d');

        // Sync size (Optimize: do this only on resize?)
        if (aiOverlay.width !== video.videoWidth) {
            aiOverlay.width = video.videoWidth;
            aiOverlay.height = video.videoHeight;
        }

        ctxOverlay.clearRect(0, 0, aiOverlay.width, aiOverlay.height);

        // Only draw if Hue is active and we have result
        if (!state.segmentationResult || Math.abs(state.hue) < 2) return;

        const w = aiOverlay.width;
        const h = aiOverlay.height;
        const mask = state.segmentationResult.categoryMask.getAsUint8Array();

        // Optimize: Use 32-bit pixel view? 
        const imageData = ctxOverlay.createImageData(w, h);
        const data = imageData.data;

        // Pre-calc Color (Simple Tint for Overlay)
        // This is a "tint layer", not true hue rotate of underlying pixels
        // True hue-rotate requires reading video pixels -> heavy.
        // We stick to Tint Overlay for Preview Performance.
        const hVal = state.hue;
        // Convert Hue to RGB approximation for tint
        let r = 0, g = 0, b = 0;
        // Basic Rainbow map
        const s = 1.0, v = 0.6; // Saturation / Value fixed for tint
        const c = v * s;
        const x = c * (1 - Math.abs(((hVal / 60) % 2) - 1));
        const m = v - c;
        let r1 = 0, g1 = 0, b1 = 0;
        if (0 <= hVal && hVal < 60) { r1 = c; g1 = x; b1 = 0; }
        else if (60 <= hVal && hVal < 120) { r1 = x; g1 = c; b1 = 0; }
        else if (120 <= hVal && hVal < 180) { r1 = 0; g1 = c; b1 = x; }
        else if (180 <= hVal && hVal < 240) { r1 = 0; g1 = x; b1 = c; }
        else if (240 <= hVal && hVal < 300) { r1 = x; g1 = 0; b1 = c; }
        else if (300 <= hVal && hVal < 360) { r1 = c; g1 = 0; b1 = x; }
        const R = (r1 + m) * 255; const G = (g1 + m) * 255; const B = (b1 + m) * 255;

        for (let i = 0; i < mask.length; i++) {
            if (mask[i] === 1) { // Hair category
                const idx = i * 4;
                data[idx] = R;
                data[idx + 1] = G;
                data[idx + 2] = B;
                data[idx + 3] = 120; // Semi-transparent (approx 0.5)
            }
        }

        ctxOverlay.putImageData(imageData, 0, 0);

        // Optional: Blur the mask slightly for softness? 
        // ctxOverlay.filter = 'blur(2px)'; // Might be heavy
    }


    // --- CAMERA ---
    async function initCamera() {
        if (state.mode !== 'camera') return;
        try {
            const constraints = {
                video: {
                    facingMode: state.facingMode,
                    width: { ideal: 1280 }, // Good balance
                    height: { ideal: 720 },
                    zoom: true
                },
                audio: false
            };
            state.stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = state.stream;
            video.onloadedmetadata = () => updateMirroring();

            const track = state.stream.getVideoTracks()[0];
            const cap = track.getCapabilities ? track.getCapabilities() : {};
            if (cap.zoom && zoomSlider) {
                state.zoomMin = cap.zoom.min;
                state.zoomMax = cap.zoom.max;
                zoomSlider.min = state.zoomMin;
                zoomSlider.max = state.zoomMax;
                zoomSlider.step = cap.zoom.step || 0.1;
                track.applyConstraints({ advanced: [{ zoom: state.zoom }] }).catch(e => { });
            } else if (zoomSlider) {
                state.zoomMin = 1; state.zoomMax = 3;
                zoomSlider.min = 1; zoomSlider.max = 3; zoomSlider.step = 0.1;
            }
            if (zoomSlider) zoomSlider.value = state.zoom;
        } catch (err) { console.error("Camera fail", err); }
    }

    function updateMirroring() {
        if (!video) return;
        const tf = state.facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
        video.style.transform = tf;
        if (aiOverlay) aiOverlay.style.transform = tf;
    }

    function setMode(mode) {
        state.mode = mode;
        if (mode === 'camera') {
            if (video) video.hidden = false;
            if (aiOverlay) aiOverlay.hidden = false;
            if (staticImage) staticImage.classList.add('hidden');
            if (switchCameraBtn) switchCameraBtn.classList.remove('hidden');
            if (galleryBtn) galleryBtn.classList.remove('hidden');
            if (closeImageBtn) closeImageBtn.classList.add('hidden');
            if (zoomContainer) zoomContainer.style.display = 'flex';
            initCamera();
        } else {
            if (video) video.hidden = true;
            if (aiOverlay) aiOverlay.hidden = true;
            if (staticImage) staticImage.classList.remove('hidden');
            if (switchCameraBtn) switchCameraBtn.classList.add('hidden');
            if (galleryBtn) galleryBtn.classList.add('hidden');
            if (closeImageBtn) closeImageBtn.classList.remove('hidden');
            if (zoomContainer) zoomContainer.style.display = 'none';
            if (state.stream) { state.stream.getTracks().forEach(t => t.stop()); state.stream = null; }

            // Segment Static Image?
            if (state.segmenter && staticImage.complete) {
                // state.segmenter.segment(staticImage, ...);
                // Not implementing static preview logic for now to save complexity
            }
        }
        updateVisuals();
    }

    function updateVisuals() {
        const manual = `brightness(${state.brightness}%) contrast(${state.contrast}%) saturate(${state.saturate}%)`;
        let preset = '';
        if (state.activeFilter === 'bw') preset = 'grayscale(100%)';
        else if (state.activeFilter === 'sepia') preset = 'sepia(100%)';
        else if (state.activeFilter === 'vintage') preset = 'sepia(50%) contrast(80%) brightness(110%)';
        else if (state.activeFilter === 'cyber') preset = 'saturate(200%) contrast(120%) hue-rotate(180deg)';
        else if (state.activeFilter === 'auto-enhance') preset = 'contrast(115%) saturate(125%)';

        let glowFix = '';
        if (state.glow > 0) {
            const bBoost = 100 + (state.glow * 0.1);
            glowFix = `brightness(${bBoost}%)`;
        }

        const css = `${manual} ${preset} ${glowFix}`.trim();

        if (state.mode === 'camera' && video) {
            video.style.filter = css;
            if (aiOverlay) aiOverlay.style.filter = css;
            staticImage.style.filter = '';
        } else if (staticImage) {
            staticImage.style.filter = css;
            if (video) video.style.filter = '';
        }
    }

    function handleSlider(e) {
        state[e.target.id === 'hair-hue' ? 'hue' : (e.target.id === 'soft-glow' ? 'glow' : e.target.id)] = e.target.value;
        updateVisuals();
    }
    Object.values(sliders).forEach(s => s && s.addEventListener('input', handleSlider));

    const resetBtn = document.getElementById('reset-sliders');
    if (resetBtn) resetBtn.addEventListener('click', () => {
        state.brightness = 100; state.contrast = 100; state.saturate = 100; state.glow = 0; state.hue = 0; state.zoom = 1;
        sliders.brightness.value = 100; sliders.contrast.value = 100; sliders.saturate.value = 100;
        sliders.glow.value = 0; sliders.hue.value = 0; zoomSlider.value = 1; zoomValue.innerText = '1x';
        if (state.mode === 'camera' && state.stream) {
            const t = state.stream.getVideoTracks()[0];
            if (t.getCapabilities().zoom) t.applyConstraints({ advanced: [{ zoom: 1 }] });
        }
        updateMirroring();
        updateVisuals();
    });

    // Panel
    function switchPanel(name) {
        [sliderPanel, beautyPanel, filtersPanel].forEach(p => p.classList.remove('active'));
        [toggleSlidersBtn, toggleBeautyBtn, toggleFiltersBtn].forEach(b => b.classList.remove('active'));
        if (name === 'adjust') { sliderPanel.classList.add('active'); toggleSlidersBtn.classList.add('active'); }
        if (name === 'beauty') { beautyPanel.classList.add('active'); toggleBeautyBtn.classList.add('active'); }
        if (name === 'filters') { filtersPanel.classList.add('active'); toggleFiltersBtn.classList.add('active'); }
    }
    if (toggleSlidersBtn) toggleSlidersBtn.addEventListener('click', () => switchPanel('adjust'));
    if (toggleBeautyBtn) toggleBeautyBtn.addEventListener('click', () => switchPanel('beauty'));
    if (toggleFiltersBtn) toggleFiltersBtn.addEventListener('click', () => switchPanel('filters'));

    document.querySelectorAll('.filter-chip').forEach(c => c.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-chip').forEach(x => x.classList.remove('active'));
        e.target.classList.add('active');
        state.activeFilter = e.target.getAttribute('data-filter');
        updateVisuals();
    }));

    // Listeners
    if (galleryBtn) galleryBtn.addEventListener('click', () => fileInput.click());
    if (fileInput) fileInput.addEventListener('change', (e) => {
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
    if (closeImageBtn) closeImageBtn.addEventListener('click', () => setMode('camera'));
    if (switchCameraBtn) switchCameraBtn.addEventListener('click', () => {
        state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
        initCamera();
    });
    if (zoomSlider) zoomSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        state.zoom = val;
        zoomValue.innerText = val.toFixed(1) + 'x';
        if (state.mode === 'camera' && state.stream) {
            const track = state.stream.getVideoTracks()[0];
            if (track.getCapabilities().zoom) track.applyConstraints({ advanced: [{ zoom: val }] });
            else {
                const base = state.facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
                video.style.transform = `${base} scale(${val})`;
                if (aiOverlay) aiOverlay.style.transform = `${base} scale(${val})`;
            }
        }
    });
    if (infoBtn) infoBtn.addEventListener('click', () => infoModal.classList.remove('hidden'));
    if (closeModalBtn) closeModalBtn.addEventListener('click', () => infoModal.classList.add('hidden'));

    // --- CAPTURE ---
    if (shutterBtn) shutterBtn.addEventListener('click', async () => {
        // Sound
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.frequency.value = 800;
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);

        flashOverlay.style.opacity = 0.8;
        setTimeout(() => flashOverlay.style.opacity = 0, 150);

        let src = (state.mode === 'camera') ? video : staticImage;
        let w = (state.mode === 'camera') ? video.videoWidth : staticImage.naturalWidth;
        let h = (state.mode === 'camera') ? video.videoHeight : staticImage.naturalHeight;

        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');

        // Zoom Crop
        let sx = 0, sy = 0, sw = w, sh = h;
        if (state.mode === 'camera' && state.zoom > 1) {
            const t = state.stream.getVideoTracks()[0];
            if (!t.getCapabilities().zoom) {
                sw = w / state.zoom; sh = h / state.zoom;
                sx = (w - sw) / 2; sy = (h - sh) / 2;
            }
        }
        if (state.mode === 'camera' && state.facingMode === 'user') {
            ctx.translate(w, 0); ctx.scale(-1, 1);
        }

        ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);

        // 1. Soft Glow (Canvas Blur Overlay)
        if (state.glow > 0) {
            const glowAmt = state.glow / 100;
            ctx.save();
            ctx.filter = 'blur(20px)';
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = glowAmt * 0.7;
            ctx.drawImage(canvas, 0, 0);
            ctx.restore();
        }

        const imageData = ctx.getImageData(0, 0, w, h);

        // 2. AI Hair Tint (High Quality Capture)
        if (state.hue !== 0 && state.segmenter) {
            try {
                // To tint hair correctly without rotating everything, we need the MASK.
                // Run segmenter on the CAPTURED imageData
                // segment() synchronous or async? ImageSegmenter.segment() is usually sync-like or returns result.
                // But wait, Tasks-Vision API: segment() -> SegmentationResult
                const result = state.segmenter.segment(imageData);
                const mask = result.categoryMask.getAsUint8Array();

                // Now apply TRUE Hue Rotate to hair pixels
                applyHairHue(imageData.data, mask, state.hue);

            } catch (e) { console.error("Capture segment fail", e); }
        }

        // 3. Global Filters
        applyFiltersToData(imageData.data);
        ctx.putImageData(imageData, 0, 0);

        canvas.toBlob(blob => {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `hare_${Date.now()}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }, 'image/jpeg', 0.95);
    });

    function applyHairHue(data, mask, hueVal) {
        // Rotates Hue of pixels where mask==1
        // Hue Math
        const hueRad = (hueVal * Math.PI) / 180;
        const cosA = Math.cos(hueRad);
        const sinA = Math.sin(hueRad);
        // Precalc matrix
        const r1 = cosA + (1 - cosA) / 3, r2 = (1 - cosA) / 3 - Math.sqrt(1 / 3) * sinA, r3 = (1 - cosA) / 3 + Math.sqrt(1 / 3) * sinA;
        const g1 = (1 - cosA) / 3 + Math.sqrt(1 / 3) * sinA, g2 = cosA + (1 - cosA) / 3, g3 = (1 - cosA) / 3 - Math.sqrt(1 / 3) * sinA;
        const b1 = (1 - cosA) / 3 - Math.sqrt(1 / 3) * sinA, b2 = (1 - cosA) / 3 + Math.sqrt(1 / 3) * sinA, b3 = cosA + (1 - cosA) / 3;

        for (let i = 0; i < mask.length; i++) {
            if (mask[i] === 1) { // Hair
                const idx = i * 4;
                const r = data[idx], g = data[idx + 1], b = data[idx + 2];
                // Apply rotation
                data[idx] = r * r1 + g * r2 + b * r3;
                data[idx + 1] = r * g1 + g * g2 + b * g3;
                data[idx + 2] = r * b1 + g * b2 + b * b3;
            }
        }
    }

    function applyFiltersToData(data) {
        const b = state.brightness / 100;
        const c = state.contrast / 100;
        const s = state.saturate / 100;
        for (let i = 0; i < data.length; i += 4) {
            let r = data[i], g = data[i + 1], bb = data[i + 2];
            r *= b; g *= b; bb *= b;
            r = (r - 128) * c + 128; g = (g - 128) * c + 128; bb = (bb - 128) * c + 128;
            const gray = 0.299 * r + 0.587 * g + 0.114 * bb;
            r = gray + (r - gray) * s; g = gray + (g - gray) * s; bb = gray + (bb - gray) * s;
            data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
            data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
            data[i + 2] = bb < 0 ? 0 : bb > 255 ? 255 : bb;
        }
    }
});
