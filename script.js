const canvas = document.getElementById("main-canvas");
const ctx = canvas.getContext("2d");
const mute_btn = document.getElementById("mute")

const NUM_BALLS = 18;
const RADIUS = 14;
const GRAVITY = 2600;
const EPS = 1e-6;
const MAX_ITERS = 32;

const MIN_SPEED = 400;
const MAX_SPEED = 1600;

let lastSoundTime = 0;
const SOUND_COOLDOWN = 0.04;

let MUTED = false;

let W = 0, H = 0;
const balls = [];

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const compressor = audioCtx.createDynamicsCompressor();
compressor.threshold.setValueAtTime(-24, audioCtx.currentTime); // start compressing at -24 dB
compressor.knee.setValueAtTime(30, audioCtx.currentTime);
compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
compressor.release.setValueAtTime(0.25, audioCtx.currentTime);
compressor.connect(audioCtx.destination);

const BALL_IMAGES = [
    "imgs/bunny1.jpg",
    "imgs/bunny2.jpg",
    "imgs/bunny3.jpg",
    "imgs/bunny4.jpg",
    "imgs/bunny5.jpg",
    "imgs/bunny6.jpg",
    "imgs/bunny7.jpg",
    "imgs/bunny8.jpg",
    "imgs/bunny9.jpg",
    "imgs/bunny10.jpg",
];

const loadedImages = [];

function loadImages(sources) {
    return Promise.all(sources.map(src => new Promise(resolve => {
        const img = new Image();
        img.onload  = () => resolve(img);
        img.onerror = () => {
            console.warn("Couldn't load:", src);
            resolve(null);
        };
        img.src = src;
    })));
}

function pickRandomImage() {
    if (loadedImages.length === 0) return null;
    return loadedImages[Math.floor(Math.random() * loadedImages.length)];
}

function makePool(src, size = 6, volume = 0.05) {
    let buffer = null;
    const pool = [];
    
    fetch(src)
    .then(r => r.arrayBuffer())
    .then(data => audioCtx.decodeAudioData(data))
    .then(decoded => {
        buffer = decoded;
        for (let i = 0; i < size; i++) pool.push(null);
    })
    .catch(e => console.error("Audio load failed:", e));
    
    let i = 0;
    
    return function play(pitch = 1, vol = volume) {
        if (!buffer) return;
        
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = pitch;
        
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = vol;
        
        source.connect(gainNode);
        gainNode.connect(compressor);
        
        source.start(0);
        
        source.onended = () => {
            source.disconnect();
            gainNode.disconnect();
        };
    };
}

function randfloat(min, max) {
    return (Math.random() * (max - min) + min).toFixed(2);
}

function randint(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

const playBoing = makePool("boing.mp3", 3, 0.05);

function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width  = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function spawn() {
    balls.length = 0;
    const minGap = 2 * RADIUS + 6;
    for (let i = 0; i < NUM_BALLS; i++) {
        let x, y, tries = 0;
        do {
            x = RADIUS + Math.random() * (W - 2 * RADIUS);
            y = RADIUS + Math.random() * (H - 2 * RADIUS);
            tries++;
        } while (tries < 300 && balls.some(b =>
            (b.x - x) ** 2 + (b.y - y) ** 2 < minGap * minGap));
            
            balls.push({
                x, y,
                vx: (Math.random() < 0.5 ? -1 : 1) * (200 + Math.random() * 300),
                vy: 0,
                r: RADIUS,
                hue: Math.round(i * 360 / NUM_BALLS),
                img: pickRandomImage(),
            });
        }
}
    
function verticalHitTime(y, vy, targetY) {
    const a = 0.5 * GRAVITY;
    const b = vy;
    const c = y - targetY;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return Infinity;
    const sq = Math.sqrt(disc);
    const t1 = (-b - sq) / (2 * a);
    const t2 = (-b + sq) / (2 * a);
    if (t1 > EPS) return t1;
    if (t2 > EPS) return t2;
    return Infinity;
}

function pairHitTime(a, b) {
    const px = a.x - b.x,  py = a.y - b.y;
    const vx = a.vx - b.vx, vy = a.vy - b.vy;
    const A = vx * vx + vy * vy;
    if (A < 1e-12) return Infinity;
    const B = 2 * (px * vx + py * vy);
    const C = px * px + py * py - 4 * a.r * a.r;
    const disc = B * B - 4 * A * C;
    if (disc < 0) return Infinity;
    const sq = Math.sqrt(disc);
    const t1 = (-B - sq) / (2 * A);
    return t1 > EPS ? t1 : Infinity;
}

function rerandomize(b) {
    const speed = Math.hypot(b.vx, b.vy);
    if (speed < 1e-9) return;
    const target = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
    const k = target / speed;
    b.vx *= k;
    b.vy *= k;
} 

function advanceAll(t) {
    const half = 0.5 * GRAVITY * t * t;
    for (const b of balls) {
        b.y += b.vy * t + half;
        b.vy += GRAVITY * t;
        b.x += b.vx * t;
    }
}
// AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
function resolve(ev) {
    if (ev.type === "floor") {
        const b = balls[ev.i];
        b.y = H - b.r;
        if (b.vy > 0) b.vy = -b.vy;
        rerandomize(b);
    } else if (ev.type === "ceil") {
        const b = balls[ev.i];
        b.y = b.r;
        if (b.vy < 0) b.vy = -b.vy;
        rerandomize(b);
    } else if (ev.type === "left") {
        const b = balls[ev.i];
        b.x = b.r;
        if (b.vx < 0) b.vx = -b.vx;
        rerandomize(b);
    } else if (ev.type === "right") {
        const b = balls[ev.i];
        b.x = W - b.r;
        if (b.vx > 0) b.vx = -b.vx;
        rerandomize(b);
    } else if (ev.type === "pair") {
        const a = balls[ev.i], b = balls[ev.j];
        let nx = b.x - a.x, ny = b.y - a.y;
        const d = Math.hypot(nx, ny) || 1e-9;
        nx /= d; ny /= d;
        const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (vn <= 0) return;
        a.vx -= vn * nx;  a.vy -= vn * ny;
        b.vx += vn * nx;  b.vy += vn * ny;
    }
    const now = performance.now() / 1000;
    if ((now - lastSoundTime) > SOUND_COOLDOWN && MUTED != false) {
        lastSoundTime = now;
        playBoing(randfloat(0.7, 1.0), 0.15);
    }
    // playBoing(randfloat(0.7, 1.0), 0.05);
}

function step(dt) {
    let left = dt;
    
    for (let iter = 0; iter < MAX_ITERS && left > EPS; iter++) {
        let bestT = Infinity;
        let ev = null;
        
        // fuckin walls
        for (let i = 0; i < balls.length; i++) {
            const b = balls[i];
            
            let t = verticalHitTime(b.y, b.vy, H - b.r);
            if (t < bestT) { bestT = t; ev = { type: "floor", i }; }
            
            t = verticalHitTime(b.y, b.vy, b.r);
            if (t < bestT) { bestT = t; ev = { type: "ceil", i }; }
            
            if (b.vx < -EPS) {
                t = (b.r - b.x) / b.vx;
                if (t > EPS && t < bestT) { bestT = t; ev = { type: "left", i }; }
            }
            if (b.vx > EPS) {
                t = (W - b.r - b.x) / b.vx;
                if (t > EPS && t < bestT) { bestT = t; ev = { type: "right", i }; }
            }
        }
        
        // me weng i oleg with my ballss
        for (let i = 0; i < balls.length; i++) {
            for (let j = i + 1; j < balls.length; j++) {
                const t = pairHitTime(balls[i], balls[j]);
                if (t < bestT) { bestT = t; ev = { type: "pair", i, j }; }
            }
        }
        
        if (!ev || bestT > left) {
            advanceAll(left);
            break;
        }
        advanceAll(bestT);
        left -= bestT;
        resolve(ev);
    }
    
    safetyPass();
}

function safetyPass() {
    for (const b of balls) {
        if (b.x < b.r)         { b.x = b.r;      if (b.vx < 0) b.vx = -b.vx; }
        if (b.x > W - b.r)     { b.x = W - b.r;  if (b.vx > 0) b.vx = -b.vx; }
        if (b.y < b.r)         { b.y = b.r;      if (b.vy < 0) b.vy = -b.vy; }
        if (b.y > H - b.r)     { b.y = H - b.r;  if (b.vy > 0) b.vy = -b.vy; }
    }
    for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
            const a = balls[i], b = balls[j];
            const dx = b.x - a.x, dy = b.y - a.y;
            const d2 = dx * dx + dy * dy;
            const m  = a.r + b.r;
            if (d2 < m * m) {
                const d = Math.sqrt(d2) || 1e-9;
                const nx = dx / d, ny = dy / d;
                const push = (m - d) * 0.5;
                a.x -= nx * push;  a.y -= ny * push;
                b.x += nx * push;  b.y += ny * push;
            }
        }
    }
}

function render() {
    ctx.clearRect(0, 0, W, H);
    for (const b of balls) {
        ctx.save();
        
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.clip();
        
        if (b.img) {
            const d = b.r * 2;
            const ia = b.img.width / b.img.height;
            let dw = d, dh = d;
            if (ia > 1) dw = d * ia;
            else        dh = d / ia;
            ctx.drawImage(b.img, b.x - dw / 2, b.y - dh / 2, dw, dh);
        } else {
            ctx.fillStyle = `hsl(${b.hue}, 80%, 60%)`;
            ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
        }
        
        ctx.restore();
    }
}

let lastTime = performance.now();
function frame(now) {
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.05) dt = 0.05;
    step(dt);
    render();
    requestAnimationFrame(frame);
}

window.addEventListener("resize", () => {
    resize();
    for (const b of balls) {
        b.x = Math.min(Math.max(b.x, b.r), W - b.r);
        b.y = Math.min(Math.max(b.y, b.r), H - b.r);
    }
});

async function boot() {
    await loadImages(BALL_IMAGES).then(list => {
        for (const img of list) if (img) loadedImages.push(img);
    });

    resize();
    spawn();
    requestAnimationFrame(frame);
}

mute.addEventListener('click', () => {
    MUTED = !MUTED;
})

boot();