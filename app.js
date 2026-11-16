let frame = 0;
const canvas = document.getElementById('game-container');
const ctx = canvas.getContext('2d');
const sbCounter = document.getElementById('sb-counter');
const fpsDisplay = document.getElementById('fps-counter');
const deathModal = document.getElementById('death-modal');

// --- Assets ---
// Each animation frame is 64x64. spritesheetL.png is the left-facing sheet.
const playerSpriteSheet = new Image();
playerSpriteSheet.src = './assets/spritesheet.png';
const playerSpriteSheetL = new Image();
playerSpriteSheetL.src = './assets/spritesheetLeft.png';

const cloudImg1 = new Image();
cloudImg1.src = './assets/cloud1.png';
const cloudImg2 = new Image();
cloudImg2.src = './assets/cloud2.png';
const cloudImg3 = new Image();
cloudImg3.src = './assets/cloud3.png';

[cloudImg1, cloudImg2, cloudImg3].forEach((img) => {
  img.width = 200;
  img.height = 100;
});

// --- Constants & State ---
let currentFrame = 0;
const playerFrameSize = 64;
const playerScale = 2;
const JUMP_SPEED = 22;
const MOVE_SPEED = 5;
const GRAVITY = 1;
const TILE_SIZE = 40;

let cameraX = 0;
let cameraY = 0;
let editorMode = false;
let selectedTile = 1;
let sb = 0;

const TILE_TYPES = {
  0: { name: 'Eraser', solid: false, color: 'transparent' },
  1: { name: 'Ground', solid: true, color: '#5C4033', friction: 0.8, bounce: 0 },
  2: { name: 'Spring', solid: true, color: '#00CED1', friction: 0.98, bounce: 0.6 },
  3: { name: 'Stone', solid: true, color: '#87949a', friction: 0.9, bounce: 0 },
  4: { name: 'Spikes', solid: false, color: '#e34d4d', lethal: true },
  5: { name: 'Checkpoint', solid: false, color: '#f4c542', checkpoint: true },
  6: { name: 'Goal', solid: false, color: '#9a72df', goal: true }
};

const LEVEL_ROWS = 20;
const LEVEL_COLS = 180;

function createExampleLevel() {
  const map = Array.from({ length: LEVEL_ROWS }, () => Array(LEVEL_COLS).fill(0));
  const platform = (start, row, length, type = 1) => {
    for (let x = start; x < start + length && x < LEVEL_COLS; x++) {
      if (row >= 0 && row < LEVEL_ROWS) map[row][x] = type;
    }
  };

  // Main route: safe starting area, gaps, raised platforms and a finish.
  platform(0, 16, 18);
  platform(22, 16, 14);
  platform(40, 16, 16);
  platform(60, 16, 15);
  platform(79, 16, 18);
  platform(101, 16, 16);
  platform(121, 16, 18);
  platform(143, 16, 15);
  platform(162, 16, 18);

  // Upper platforms to make the route more interesting.
  platform(8, 13, 5, 3);
  platform(15, 11, 4, 1);
  platform(25, 13, 5, 3);
  platform(33, 11, 4, 1);
  platform(44, 13, 5, 3);
  platform(52, 10, 5, 1);
  platform(64, 13, 5, 3);
  platform(72, 11, 5, 1);
  platform(83, 13, 5, 3);
  platform(91, 10, 5, 1);
  platform(105, 13, 5, 3);
  platform(113, 11, 5, 1);
  platform(125, 13, 5, 3);
  platform(134, 10, 5, 1);
  platform(147, 13, 5, 3);
  platform(155, 11, 5, 1);
  platform(166, 13, 6, 3);

  // Springs, hazards, checkpoints and the finish marker.
  [12, 47, 87, 109, 151].forEach(x => map[15][x] = 2);
  [20, 21, 37, 38, 57, 58, 76, 77, 98, 99, 118, 119, 140, 141, 159, 160].forEach(x => map[15][x] = 4);
  map[15][60] = 5;
  map[15][121] = 5;
  map[15][162] = 5;
  map[15][177] = 6;
  // Ground underneath the route prevents an endless fall in the demo.
  platform(0, 19, LEVEL_COLS, 3);
  return map;
}

let levelMap = createExampleLevel();

const player = {
  x: 100,
  y: 16 * TILE_SIZE - playerFrameSize * playerScale,
  width: playerFrameSize * playerScale,
  height: playerFrameSize * playerScale,
  vy: 0,
  vx: 0,
  isJumping: false,
  lookingRight: true,
  spawnX: 100,
  spawnY: 16 * TILE_SIZE - playerFrameSize * playerScale
};

// Jump buffering + coyote time make jumps register reliably around landing edges.
// A fresh key press is buffered briefly; landing consumes that buffered press.
let jumpBuffer = 0;
let coyoteTime = 0;
const JUMP_BUFFER_FRAMES = 9;
const COYOTE_FRAMES = 8;

// --- Canvas sizing ---
function resizeCanvas() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// --- Clouds ---
const clouds = [
  { x: 120, y: 70, img: cloudImg1 },
  { x: 520, y: 150, img: cloudImg2 },
  { x: 900, y: 55, img: cloudImg3 }
];
let cloudDrift = 0;

// --- Hitbox Helper ---
function getPlayerHitbox() {
  return {
    x: player.x + player.width / 8,
    y: player.y + (player.height * 3) / 16,
    width: (player.width * 3) / 4,
    height: (player.height * 13) / 16
  };
}

// --- Input Handling ---
const keyState = Object.create(null);
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();

  // Ignore OS key-repeat: one physical press creates one jump request.
  if (!keyState[e.key]) {
    if (e.key === 'ArrowUp' || e.key === ' ' || e.key.toLowerCase() === 'w') jump();
  }
  keyState[e.key] = true;

  if (e.key.toLowerCase() === 'e' && !e.repeat) toggleEditor();
  if (e.key.toLowerCase() === 'r' && !e.repeat) respawnPlayer();
});

window.addEventListener('keyup', (e) => {
  keyState[e.key] = false;
});

function jump() {
  if (editorMode) return;
  jumpBuffer = JUMP_BUFFER_FRAMES;
  tryJump();
}

function tryJump() {
  if (jumpBuffer > 0 && (coyoteTime > 0 || !player.isJumping)) {
    player.vy = -JUMP_SPEED;
    player.isJumping = true;
    coyoteTime = 0;
    jumpBuffer = 0;
  }
}

// --- Physics & Collisions ---
function updatePlayer() {
  if (editorMode || (deathModal && deathModal.style.display === 'flex')) return;

  if (jumpBuffer > 0) jumpBuffer--;
  if (coyoteTime > 0) coyoteTime--;

  if (keyState['ArrowRight'] || keyState['d'] || keyState['D']) {
    player.vx = MOVE_SPEED;
    player.lookingRight = true;
    if (frame % 4 === 0) currentFrame = (currentFrame + 1) % 8;
  } else if (keyState['ArrowLeft'] || keyState['a'] || keyState['A']) {
    player.vx = -MOVE_SPEED;
    player.lookingRight = false;
    if (frame % 4 === 0) currentFrame = (currentFrame + 1) % 8;
  } else {
    player.vx = 0;
    currentFrame = 0;
  }

  // Horizontal movement and collision.
  player.x += player.vx;
  checkCollisions('x');

  // Vertical movement and collision.
  player.vy += GRAVITY;
  player.y += player.vy;
  checkCollisions('y');

  // Try a buffered jump immediately after a landing.
  tryJump();

  if (player.y > LEVEL_ROWS * TILE_SIZE + 120) showDeath();
}

function checkCollisions(axis) {
  const hb = getPlayerHitbox();
  const offsetX = hb.x - player.x;
  const offsetY = hb.y - player.y;

  const leftCol = Math.floor(hb.x / TILE_SIZE);
  const rightCol = Math.floor((hb.x + hb.width - 0.01) / TILE_SIZE);
  const topRow = Math.floor(hb.y / TILE_SIZE);
  const bottomRow = Math.floor((hb.y + hb.height - 0.01) / TILE_SIZE);

  for (let row = topRow; row <= bottomRow; row++) {
    for (let col = leftCol; col <= rightCol; col++) {
      if (!levelMap[row] || levelMap[row][col] === undefined) continue;
      const tileId = levelMap[row][col];
      const tile = TILE_TYPES[tileId];
      if (!tile || !tile.solid) continue;

      if (axis === 'x') {
        if (player.vx > 0) player.x = col * TILE_SIZE - hb.width - offsetX;
        else if (player.vx < 0) player.x = (col + 1) * TILE_SIZE - offsetX;
        player.vx = 0;
      } else if (axis === 'y') {
        if (player.vy > 0) {
          player.y = row * TILE_SIZE - hb.height - offsetY;
          player.vx *= tile.friction ?? 1;

          if (tile.bounce > 0 && player.vy > 2) {
            player.vy = -player.vy * tile.bounce;
            player.isJumping = true;
            coyoteTime = 0;
          } else {
            player.vy = 0;
            player.isJumping = false;
            coyoteTime = COYOTE_FRAMES;
          }
        } else if (player.vy < 0) {
          player.y = (row + 1) * TILE_SIZE - offsetY;
          player.vy = 0;
        }
      }
    }
  }
}

// --- Respawn / Death ---
function respawnPlayer() {
  player.x = player.spawnX;
  player.y = player.spawnY;
  player.vx = 0;
  player.vy = 0;
  player.isJumping = false;
  coyoteTime = 0;
  jumpBuffer = 0;
  if (deathModal) deathModal.style.display = 'none';
}
window.respawnPlayer = respawnPlayer;

function showDeath() {
  if (deathModal) deathModal.style.display = 'flex';
}

// --- Camera ---
function updateCamera() {
  const levelWidth = LEVEL_COLS * TILE_SIZE;
  const levelHeight = LEVEL_ROWS * TILE_SIZE;
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  cameraX = Math.max(0, Math.min(levelWidth - viewW, player.x + player.width / 2 - viewW * 0.4));
  cameraY = Math.max(0, Math.min(levelHeight - viewH, player.y + player.height / 2 - viewH * 0.55));
}

// --- Rendering ---
function drawMap() {
  const firstCol = Math.max(0, Math.floor(cameraX / TILE_SIZE));
  const lastCol = Math.min(LEVEL_COLS, Math.ceil((cameraX + window.innerWidth) / TILE_SIZE) + 1);
  const firstRow = Math.max(0, Math.floor(cameraY / TILE_SIZE));
  const lastRow = Math.min(LEVEL_ROWS, Math.ceil((cameraY + window.innerHeight) / TILE_SIZE) + 1);

  for (let row = firstRow; row < lastRow; row++) {
    for (let col = firstCol; col < lastCol; col++) {
      const tileId = levelMap[row][col];
      if (!tileId) continue;
      const tile = TILE_TYPES[tileId];
      const x = col * TILE_SIZE - cameraX;
      const y = row * TILE_SIZE - cameraY;

      if (tileId === 4) {
        ctx.fillStyle = tile.color;
        ctx.beginPath();
        ctx.moveTo(x + 2, y + TILE_SIZE);
        ctx.lineTo(x + TILE_SIZE / 2, y + 5);
        ctx.lineTo(x + TILE_SIZE - 2, y + TILE_SIZE);
        ctx.closePath();
        ctx.fill();
      } else if (tileId === 5 || tileId === 6) {
        ctx.fillStyle = tile.color;
        ctx.fillRect(x + 13, y - 16, 14, 56);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + 27, y - 16, 22, 15);
      } else {
        ctx.fillStyle = tile.color;
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(x, y, TILE_SIZE, 6);
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      }
    }
  }
}

function drawPlayer() {
  const sheet = player.lookingRight ? playerSpriteSheet : playerSpriteSheetL;
  const drawX = player.x - cameraX;
  const drawY = player.y - cameraY;

  // Only draw the chosen spritesheet once it has loaded; never stretch a missing image.
  if (sheet.complete && sheet.naturalWidth >= playerFrameSize) {
    ctx.drawImage(
      sheet,
      currentFrame * playerFrameSize, 0,
      playerFrameSize, playerFrameSize,
      drawX, drawY, player.width, player.height
    );
  } else {
    // Simple fallback until the requested spritesheet file loads.
    ctx.fillStyle = '#e8b89b';
    ctx.fillRect(drawX + 20, drawY + 8, 88, 112);
  }
}

// --- Level Editor (keeps the existing canvas/tile-map system) ---
function createEditor() {
  const bar = document.createElement('div');
  bar.id = 'editor-toolbar';
  bar.style.cssText = 'position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:10001;display:none;gap:6px;flex-wrap:wrap;align-items:center;justify-content:center;width:min(96vw,900px);padding:10px;background:#173c43;border:2px solid white;border-radius:9px;color:white;font:13px sans-serif';
  bar.innerHTML = '<b>EDITOR</b><span style="opacity:.8">Click: place · Right-click: erase</span><button data-action="save">Save</button><button data-action="load">Load</button><button data-action="close">Done</button>';
  Object.entries(TILE_TYPES).forEach(([id, tile]) => {
    const button = document.createElement('button');
    button.textContent = `${id}: ${tile.name}`;
    button.dataset.tile = id;
    button.style.cssText = `padding:6px;border:2px solid ${Number(id) === selectedTile ? '#ffe36e' : '#789'};border-radius:5px;background:${id === '0' ? '#50666b' : tile.color};color:${id === '0' || id === '3' ? 'white' : '#142f34'};cursor:pointer`;
    button.addEventListener('click', () => {
      selectedTile = Number(id);
      [...bar.querySelectorAll('[data-tile]')].forEach(b => b.style.outline = Number(b.dataset.tile) === selectedTile ? '2px solid #ffe36e' : 'none');
    });
    bar.appendChild(button);
  });
  bar.addEventListener('click', (event) => {
    const action = event.target.dataset.action;
    if (action === 'close') toggleEditor(false);
    if (action === 'save') {
      localStorage.setItem('sarudiLevelMap', JSON.stringify(levelMap));
      alert('Level saved in this browser.');
    }
    if (action === 'load') {
      const saved = localStorage.getItem('sarudiLevelMap');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === LEVEL_ROWS) levelMap = parsed;
        alert('Level loaded.');
      } else alert('No saved level found.');
    }
  });
  document.body.appendChild(bar);
  return bar;
}
const editorToolbar = createEditor();

function toggleEditor(force) {
  editorMode = typeof force === 'boolean' ? force : !editorMode;
  editorToolbar.style.display = editorMode ? 'flex' : 'none';
  canvas.style.cursor = editorMode ? 'crosshair' : 'none';
}

function editorPaint(event, erase = false) {
  if (!editorMode) return;
  const rect = canvas.getBoundingClientRect();
  const worldX = event.clientX - rect.left + cameraX;
  const worldY = event.clientY - rect.top + cameraY;
  const col = Math.floor(worldX / TILE_SIZE);
  const row = Math.floor(worldY / TILE_SIZE);
  if (row < 0 || row >= LEVEL_ROWS || col < 0 || col >= LEVEL_COLS) return;
  levelMap[row][col] = erase ? 0 : selectedTile;
  if (selectedTile === 5) {
    player.spawnX = col * TILE_SIZE;
    player.spawnY = row * TILE_SIZE - player.height;
  }
}
canvas.addEventListener('pointerdown', (event) => {
  if (editorMode) editorPaint(event, event.button === 2);
});
canvas.addEventListener('pointermove', (event) => {
  if (editorMode && event.buttons) editorPaint(event, (event.buttons & 2) === 2);
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

// --- FPS & Main Loop ---
let lastTime = performance.now();
let frameCount = 0;

function updateFPS(now) {
  frameCount++;
  if (now >= lastTime + 1000) {
    const fps = Math.round((frameCount * 1000) / (now - lastTime));
    if (fpsDisplay) fpsDisplay.textContent = `FPS: ${fps}`;
    frameCount = 0;
    lastTime = now;
  }
}

function gameLoop(now) {
  frame++;
  if (sbCounter) sbCounter.textContent = `Sarudi Bucks: ${sb}`;
  updateFPS(now);

  updatePlayer();
  updateCamera();

  // Background and clouds use a slower camera movement for parallax.
  ctx.fillStyle = 'skyblue';
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  for (let cloud of clouds) {
    const cloudX = cloud.x - cameraX * 0.35 + cloudDrift;
    ctx.drawImage(cloud.img, cloudX, cloud.y - cameraY * 0.15, 200, 100);
  }
  cloudDrift -= 0.15;
  if (cloudDrift < -400) cloudDrift = 0;

  drawMap();
  if (!(deathModal && deathModal.style.display === 'flex')) drawPlayer();

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
