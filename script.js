const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = 900;
canvas.height = 500;

const gravity = 0.5; // Reduced gravity

// Music
const bgMusic = new Audio('music.mp3');
bgMusic.loop = true;
const shootSound = new Audio('shoot.mp3');

const playerImg = new Image();
playerImg.src = "image.png";

const playerRunImg = new Image();
playerRunImg.src = "image2.png";

const playerJumpImg = new Image();
playerJumpImg.src = "image3.png";

let cameraX = 0;
const keys = {};

let gameState = "menu"; // "menu" | "play" | "gameover" | "win"

const player = {
  x: 100,
  y: 300,
  width: 60,
  height: 75,
  speed: 7,     // Max speed
  vx: 0,        // Velocity X
  dy: 0,
  onGround: false,
  state: "idle",
  acceleration: 1.0, // Faster start
  friction: 0.8,     // Faster stop
  facing: "right",
  jumpCount: 0,
  maxJumps: 2
};

// --- LEVELS ---
const levels = [[]]; // Placeholder, we generate map in loadLevel

let currentLevel = 0;
let platforms = levels[currentLevel];

// --- GAME OBJECTS ---
let enemies = [];
let coins = [];
let powerups = [];
let spikes = [];
let checkpoints = [];
let bullets = []; // Bullets array
let particles = []; // Particles array
let finishRect = { x: 0, y: 0, w: 0, h: 0 };

let score = 0;

let shield = false;
let shieldTimer = 0; // frames
let shootTimer = 0;

let lastCheckpoint = { x: 100, y: 300 };

// --- INPUT ---
window.addEventListener("keydown", (e) => {
  keys[e.code] = true;

  if (e.code === "Enter" && gameState === "menu") {
    bgMusic.play().catch(() => {}); // Play music on start
    gameState = "play";
    loadLevel(currentLevel, true);
  }

  if (e.code === "KeyR" && (gameState === "play" || gameState === "gameover" || gameState === "win")) {
    gameState = "play";
    loadLevel(currentLevel, gameState === "win"); // Full reset only on win, otherwise checkpoint
  }

  // Jump (Double Jump)
  if (e.code === "ArrowUp" && gameState === "play") {
    if (player.onGround || player.jumpCount < player.maxJumps) {
      player.dy = -12; // Adjusted jump force
      createParticles(player.x + player.width / 2, player.y + player.height, "#fff", 10); // Jump dust
      player.jumpCount++;
      player.onGround = false;
    }
  }

  // Shoot
  if (e.code === "Space" && gameState === "play") {
    shoot();
  }
});

window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
  // Variable jump height (release key to stop rising)
  if (e.code === "ArrowUp" && player.dy < -4) {
    player.dy = -4;
  }
});

// Mobile: tap left/right + tap top half to jump
window.addEventListener("touchstart", (e) => {
  if (gameState === "menu") {
    bgMusic.play().catch(() => {});
    gameState = "play";
    loadLevel(currentLevel, true);
    return;
  }

  if (gameState === "gameover" || gameState === "win") {
    gameState = "play";
    loadLevel(currentLevel, true);
    return;
  }

  const t = e.touches[0];
  const x = t.clientX;
  const y = t.clientY;

  const w = window.innerWidth;
  const h = window.innerHeight;

  // top half = jump
  if (y < h / 2) {
    if (player.onGround || player.jumpCount < player.maxJumps) {
      player.dy = -12;
      createParticles(player.x + player.width / 2, player.y + player.height, "#fff", 10);
      player.jumpCount++;
      player.onGround = false;
    }
    return;
  }

  // bottom half left/right
  if (x < w / 2) keys["ArrowLeft"] = true;
  else keys["ArrowRight"] = true;
});

window.addEventListener("touchend", () => {
  keys["ArrowLeft"] = false;
  keys["ArrowRight"] = false;
  keys["ArrowUp"] = false;
});

// --- LEVEL LOADING ---
function loadLevel(levelIndex, fullResetScore) {
  if (fullResetScore) {
    score = 0;
    lastCheckpoint = { x: 100, y: 300 };
    // Generate map only on full reset to keep it consistent during retries? 
    // For simplicity, we regenerate, but since logic is deterministic-ish below, it's fine.
    generateMap(); 
  }

  player.x = lastCheckpoint.x;
  player.y = lastCheckpoint.y;
  player.dy = 0;
  player.vx = 0;
  player.onGround = false;
  player.jumpCount = 0;

  cameraX = 0;

  shield = false;
  shieldTimer = 0;
  shootTimer = 0;
}

function generateMap() {
  platforms = [];
  enemies = [];
  coins = [];
  spikes = [];
  checkpoints = [];
  bullets = [];
  particles = [];
  powerups = [{ x: 2000, y: 410, size: 20, taken: false, type: "shield" }];

  let currentX = 0;
  let currentY = 450;

  // Starting ground
  platforms.push({ x: 0, y: 450, width: 800, height: 50 });
  currentX += 800;

  // Generate 30 segments for a big map
  for (let i = 0; i < 30; i++) {
    // Gap (Pit)
    const gap = 150 + Math.random() * 100;
    currentX += gap;

    // Platform
    const width = 400 + Math.random() * 400;
    // Random height variation
    if (Math.random() > 0.5) currentY = 350 + Math.random() * 100;
    else currentY = 450;
    
    // Clamp Y
    if (currentY > 450) currentY = 450;

    platforms.push({ x: currentX, y: currentY, width: width, height: 50 });
    
    let hasCheckpoint = false;

    // Add Checkpoint every 6 segments
    if (i > 0 && i % 6 === 0) {
      checkpoints.push({ x: currentX + 50, y: currentY - 60, w: 40, h: 60, triggered: false });
      hasCheckpoint = true;
    }

    // Add Enemies (Only if no checkpoint to avoid camping)
    if (!hasCheckpoint && Math.random() > 0.2) {
      const rand = Math.random();
      let type = "walker";
      let speed = 1;
      let color = "#111";

      if (rand > 0.75) { type = "jumper"; color = "#800"; } // Jumping enemy
      else if (rand > 0.5) { type = "flyer"; color = "#005"; } // Flying enemy
      else if (rand > 0.3) { speed = 3; color = "#333"; } // Fast enemy

      enemies.push({ 
        x: currentX + 100 + Math.random() * 100, 
        y: currentY - 40, 
        baseY: currentY - 40, // Remember base Y for physics
        width: 40, height: 40, 
        dir: 1, minX: currentX, maxX: currentX + width - 40,
        type: type, speed: speed, color: color,
        vy: 0, angle: Math.random() * Math.PI // For flyers
      });
    }

    // Add Spikes
    if (Math.random() > 0.4) {
      spikes.push({ x: currentX + width / 2, y: currentY });
    }

    currentX += width;
  }

  // Finish Line
  finishRect = { x: currentX + 200, y: 350, w: 50, h: 100 };
  platforms.push({ x: currentX, y: 450, width: 500, height: 50 });
}

function nextLevel() {
  currentLevel++;
  if (currentLevel >= levels.length) currentLevel = 0;
  loadLevel(currentLevel, false);
}

function gameOver() {
  gameState = "gameover";
}

// --- SHOOTING ---
function shoot() {
  if (shootTimer > 0) return;
  shootTimer = 15;
  shootSound.currentTime = 0;
  shootSound.play().catch(() => {});

  const dir = player.facing === "right" ? 1 : -1;
  bullets.push({
    x: player.x + player.width / 2,
    y: player.y + player.height / 2,
    vx: dir * 12,
    r: 4,
    color: "yellow"
  });
}

function updateBullets() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    let b = bullets[i];
    b.x += b.vx;
    
    // Despawn if far off screen
    if (Math.abs(b.x - cameraX) > canvas.width) {
      bullets.splice(i, 1);
      continue;
    }

    // Collision with enemies
    for (let j = enemies.length - 1; j >= 0; j--) {
      let e = enemies[j];
      if (b.x > e.x && b.x < e.x + e.width && b.y > e.y && b.y < e.y + e.height) {
        enemies.splice(j, 1);
        bullets.splice(i, 1);
        createParticles(e.x + e.width/2, e.y + e.height/2, "#66bb6a", 15); // Zombie blood/dust
        score += 20;
        break;
      }
    }
  }
}

// --- PARTICLES ---
function createParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x: x,
      y: y,
      vx: (Math.random() - 0.5) * 5,
      vy: (Math.random() - 0.5) * 5,
      life: 1.0,
      color: color
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.03;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// --- UPDATE ---
function updatePlayer() {
  if (shootTimer > 0) shootTimer--;
  player.state = "idle";
  
  // Capture previous ground state to detect landing
  const wasOnGround = player.onGround;

  // Physics: Acceleration & Friction
  if (keys["ArrowLeft"]) {
    player.vx -= player.acceleration;
    player.state = "run";
    player.facing = "left";
  }
  if (keys["ArrowRight"]) {
    player.vx += player.acceleration;
    player.state = "run";
    player.facing = "right";
  }

  // Apply Friction
  player.vx *= player.friction;

  // Cap Speed
  if (player.vx > player.speed) player.vx = player.speed;
  if (player.vx < -player.speed) player.vx = -player.speed;

  // Stop completely if very slow
  if (Math.abs(player.vx) < 0.1) player.vx = 0;

  player.x += player.vx;

  player.dy += gravity;
  player.y += player.dy;

  player.onGround = false;

  // Platform collision (standing on top)
  platforms.forEach((p) => {
    const isFalling = player.dy >= 0;

    const hit =
      player.x < p.x + p.width &&
      player.x + player.width > p.x &&
      player.y + player.height > p.y &&
      player.y + player.height <= p.y + p.height &&
      isFalling;

    if (hit) {
      player.y = p.y - player.height;
      player.dy = 0;
      player.onGround = true;
      player.jumpCount = 0;
    }
  });

  // Landing effect
  if (!wasOnGround && player.onGround) {
    createParticles(player.x + player.width / 2, player.y + player.height, "#8d6e63", 8);
  }

  if (!player.onGround) player.state = "jump";

  // Fall out of screen
  if (player.y > canvas.height + 200) {
    gameOver();
  }

  // Camera
  cameraX = player.x - canvas.width / 2 + player.width / 2;
  if (cameraX < 0) cameraX = 0;

  // Checkpoints
  checkpoints.forEach(cp => {
    if (!cp.triggered && player.x > cp.x) {
      cp.triggered = true;
      lastCheckpoint = { x: cp.x, y: cp.y + cp.h - player.height }; // Save safe spot
      score += 50; // Bonus for checkpoint
    }
  });

  // Finish Line
  if (player.x < finishRect.x + finishRect.w &&
      player.x + player.width > finishRect.x &&
      player.y < finishRect.y + finishRect.h &&
      player.y + player.height > finishRect.y) {
    gameState = "win";
  }
}

function updateEnemies() {
  enemies.forEach((e) => {
    // Horizontal movement
    e.x += e.dir * e.speed;
    if (e.x < e.minX) e.dir = 1;
    if (e.x > e.maxX) e.dir = -1;

    // Jumper Logic
    if (e.type === "jumper") {
      e.y += e.vy;
      e.vy += gravity;
      if (e.y >= e.baseY) {
        e.y = e.baseY;
        e.vy = 0;
        if (Math.random() < 0.02) e.vy = -14; // Random jump
      }
    }
    // Flyer Logic
    else if (e.type === "flyer") {
      e.angle += 0.05;
      e.y = e.baseY + Math.sin(e.angle) * 60; // Move up and down
    }
  });
}

function checkEnemyCollision() {
  enemies.forEach((e) => {
    const hit =
      player.x < e.x + e.width &&
      player.x + player.width > e.x &&
      player.y < e.y + e.height &&
      player.y + player.height > e.y;

    if (hit) {
      if (shield) {
        shield = false;
        shieldTimer = 0;
        e.x += 140;
      } else {
        gameOver();
      }
    }
  });
}

function checkSpikeCollision() {
  spikes.forEach((s) => {
    // Spike is a triangle approx 20px wide, 20px high
    const hit =
      player.x < s.x + 15 &&
      player.x + player.width > s.x + 5 &&
      player.y + player.height > s.y - 15 &&
      player.y < s.y;

    if (hit) gameOver();
  });
}

function updateCoins() {
  coins.forEach((c) => {
    if (c.taken) return;

    const closestX = Math.max(player.x, Math.min(c.x, player.x + player.width));
    const closestY = Math.max(player.y, Math.min(c.y, player.y + player.height));

    const dx = c.x - closestX;
    const dy = c.y - closestY;

    if (dx * dx + dy * dy < c.r * c.r) {
      c.taken = true;
      score += 10;
      createParticles(c.x, c.y, "gold", 10); // Coin sparkle
    }
  });
}

function updatePowerups() {
  powerups.forEach((p) => {
    if (p.taken) return;

    const hit =
      player.x < p.x + p.size &&
      player.x + player.width > p.x &&
      player.y < p.y + p.size &&
      player.y + player.height > p.y;

    if (hit) {
      p.taken = true;

      if (p.type === "shield") {
        shield = true;
        shieldTimer = 8 * 60; // ~8 sec
      }
    }
  });

  if (shield) {
    shieldTimer--;
    if (shieldTimer <= 0) {
      shield = false;
      shieldTimer = 0;
    }
  }
}

// --- DRAW ---
let bgHue = 0;
function drawBackground() {
  // Changing background slowly
  bgHue = (bgHue + 0.2) % 360;
  
  ctx.fillStyle = `hsl(${bgHue}, 60%, 80%)`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Mountains (Background scenery)
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  const mx = cameraX * 0.2; // parallax
  ctx.moveTo(0 - mx, canvas.height);
  ctx.lineTo(300 - mx, 200);
  ctx.lineTo(600 - mx, canvas.height);
  ctx.moveTo(500 - mx, canvas.height);
  ctx.lineTo(900 - mx, 150);
  ctx.lineTo(1300 - mx, canvas.height);
  ctx.fill();

  // top and bottom vignette
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(0, 0, canvas.width, 70);
  ctx.fillRect(0, canvas.height - 60, canvas.width, 60);

  // Sun
  ctx.beginPath();
  ctx.arc(canvas.width - 100, 80, 40, 0, Math.PI * 2);
  ctx.fillStyle = "#ffd700";
  ctx.fill();
  ctx.fillStyle = "rgba(255, 215, 0, 0.3)";
  ctx.beginPath();
  ctx.arc(canvas.width - 100, 80, 55, 0, Math.PI * 2);
  ctx.fill();

  // Clouds can be added here if desired, but sun is a nice touch
}

function drawPlatforms() {
  platforms.forEach((p) => {
    // Soil gradient
    let grad = ctx.createLinearGradient(0, p.y, 0, p.y + p.height);
    grad.addColorStop(0, "#6b3f1e");
    grad.addColorStop(1, "#3d2311");
    ctx.fillStyle = grad;
    ctx.fillRect(p.x - cameraX, p.y, p.width, p.height);

    // Grass top
    ctx.fillStyle = "#4caf50";
    ctx.fillRect(p.x - cameraX, p.y, p.width, 10);
    
    // Grass details
    ctx.fillStyle = "#388e3c";
    for(let i=0; i<p.width; i+=20) {
         ctx.fillRect(p.x - cameraX + i, p.y - 3, 4, 3);
    }
  });
}

function drawCoins() {
  coins.forEach((c) => {
    if (c.taken) return;
    
    // Glow effect
    ctx.shadowBlur = 15;
    ctx.shadowColor = "gold";

    ctx.beginPath();
    ctx.arc(c.x - cameraX, c.y, c.r, 0, Math.PI * 2);
    
    // Gradient coin
    let grad = ctx.createRadialGradient(c.x - cameraX - 2, c.y - 2, 1, c.x - cameraX, c.y, c.r);
    grad.addColorStop(0, "#fff");
    grad.addColorStop(0.3, "gold");
    grad.addColorStop(1, "#b8860b");
    ctx.fillStyle = grad;
    ctx.fill();
    
    ctx.shadowBlur = 0; // Reset shadow
  });
}

function drawPowerups() {
  powerups.forEach((p) => {
    if (p.taken) return;

    if (p.type === "shield") {
      ctx.fillStyle = "cyan";
      ctx.fillRect(p.x - cameraX, p.y, p.size, p.size);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillRect(p.x - cameraX + 4, p.y + 4, p.size - 8, 4);
    }
  });
}

function drawSpikes() {
  spikes.forEach((s) => {
    // Metallic gradient
    let grad = ctx.createLinearGradient(s.x - cameraX, s.y - 25, s.x - cameraX, s.y);
    grad.addColorStop(0, "#aaa");
    grad.addColorStop(1, "#222");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(s.x - cameraX, s.y);
    ctx.lineTo(s.x + 10 - cameraX, s.y - 25);
    ctx.lineTo(s.x + 20 - cameraX, s.y);
    ctx.fill();
  });
}

function drawCheckpoints() {
  checkpoints.forEach(cp => {
    ctx.fillStyle = cp.triggered ? "#00ff00" : "#ff0000";
    // Pole
    ctx.fillRect(cp.x - cameraX, cp.y, 5, cp.h);
    // Flag
    ctx.fillRect(cp.x - cameraX + 5, cp.y, 25, 15);
  });
}

function drawFinish() {
  const f = finishRect;
  ctx.fillStyle = "white";
  ctx.fillRect(f.x - cameraX, f.y, f.w, f.h);
  ctx.fillStyle = "black";
  ctx.fillText("FINISH", f.x - cameraX - 10, f.y - 10);
  // Checkered pattern could go here, but simple is fine
}

function drawEnemies() {
  enemies.forEach((e) => {
    const x = e.x - cameraX;
    const y = e.y;
    
    // Zombie Head
    ctx.fillStyle = "#66bb6a"; // Green
    ctx.fillRect(x + 5, y, 30, 15);
    
    // Zombie Body
    ctx.fillStyle = "#388e3c"; // Darker Green / Shirt
    ctx.fillRect(x + 5, y + 15, 30, 15);
    
    // Legs
    ctx.fillStyle = "#5d4037"; // Brown pants
    ctx.fillRect(x + 8, y + 30, 10, 10);
    ctx.fillRect(x + 22, y + 30, 10, 10);
    
    // Arms (Extended)
    ctx.fillStyle = "#66bb6a";
    if (e.dir === 1) {
        ctx.fillRect(x + 25, y + 15, 15, 8); // Right arm
    } else {
        ctx.fillRect(x, y + 15, -15, 8); // Left arm
    }
    
    // Eyes (Red)
    ctx.fillStyle = "#d32f2f";
    if (e.dir === 1) {
        ctx.fillRect(x + 25, y + 4, 4, 4);
    } else {
        ctx.fillRect(x + 11, y + 4, 4, 4);
    }
  });
}

function drawBullets() {
  bullets.forEach(b => {
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(b.x - cameraX, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - cameraX, p.y, 4, 4);
    ctx.globalAlpha = 1.0;
  });
}

function drawPlayer() {
  const x = player.x - cameraX;
  const y = player.y;

  let img = playerImg;
  if (player.state === "jump") {
    img = playerJumpImg;
  } else if (player.state === "run") {
    img = playerRunImg;
  }

  if (player.facing === "left") {
    ctx.save();
    ctx.translate(x + player.width, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0, player.width, player.height);
    ctx.restore();
  } else {
    ctx.drawImage(img, x, y, player.width, player.height);
  }

  // shield effect
  if (shield) {
    ctx.strokeStyle = "cyan";
    ctx.lineWidth = 3;
    ctx.strokeRect(
      x - 5,
      y - 5,
      player.width + 10,
      player.height + 10
    );
    ctx.lineWidth = 1;
  }
}

function drawUI() {
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.font = "16px Arial";
  ctx.fillText(`Score: ${score}`, 10, 25);
  ctx.fillText(`Level: ${currentLevel + 1}`, 10, 45);

  if (shield) {
    ctx.fillText(`Shield: ${Math.ceil(shieldTimer / 60)}s`, 10, 65);
  }

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillText("R = Restart", canvas.width - 120, 25);

  if (gameState === "gameover") {
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "white";
    ctx.font = "40px Arial";
    ctx.fillText("GAME OVER", canvas.width / 2 - 120, canvas.height / 2);
    ctx.font = "20px Arial";
    ctx.fillText("Press R to Restart", canvas.width / 2 - 90, canvas.height / 2 + 40);
  }

  if (gameState === "win") {
    ctx.fillStyle = "rgba(0, 200, 0, 0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "white";
    ctx.font = "40px Arial";
    ctx.fillText("YOU WIN!", canvas.width / 2 - 100, canvas.height / 2);
    ctx.fillText(`Score: ${score}`, canvas.width / 2 - 80, canvas.height / 2 + 50);
  }
}

function drawMenu() {
  drawBackground();
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.font = "44px Arial";
  ctx.fillText("2D Platformer", 290, 210);
  ctx.font = "20px Arial";
  ctx.fillText("Press ENTER to Start", 330, 255);
  ctx.fillText("Arrow Keys to move + Jump", 320, 285);
  ctx.fillText("R to Restart", 380, 315);
}

// --- LOOP ---
function gameLoop() {
  if (gameState === "menu") {
    drawMenu();
    return requestAnimationFrame(gameLoop);
  }

  if (gameState === "play") {
    updatePlayer();
    updateEnemies();
    updateCoins();
    updatePowerups();
    updateBullets();
    updateParticles();
    checkEnemyCollision();
    checkSpikeCollision();
  }

  drawBackground();
  drawPlatforms();
  drawCheckpoints();
  drawFinish();
  drawSpikes();
  drawCoins();
  drawPowerups();
  drawEnemies();
  drawBullets();
  drawParticles();
  drawPlayer();
  drawUI();

  requestAnimationFrame(gameLoop);
}

// Start
drawMenu();
gameLoop();
