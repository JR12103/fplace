/**
 * FPLACE — Server
 * Node.js + ws + express
 * Install: npm install express ws
 * Run:     node server.js
 */

const express = require('express');
const http    = require('http');
const WebSocket = require('ws');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

// ─── CONFIG ──────────────────────────────────────────
const PORT      = process.env.PORT || 3000;
const WORLD_W   = 1000;   // world width  in pixels
const WORLD_H   = 500;    // world height in pixels
const DATA_FILE = './world.json';
const USERS_FILE= './users.json';

// ADMIN — change this to your desired username
const ADMIN_NAME = 'Admin';
const ADMIN_PASS = 'fplace2025admin'; // sha256 hash recommended in prod

// Cooldown table: level → ms
function getCooldown(level) {
  if (level >= 20) return 0;
  return Math.max(0, 3000 - (level - 1) * 150);
}

// Max paint points: starts at 50, +5 per level
function getMaxPoints(level) {
  return 50 + (level - 1) * 5;
}

// XP needed to reach next level: 100 per level
function xpForLevel(level) {
  return level * 100;
}

// ─── WORLD STATE ─────────────────────────────────────
let worldColors = new Array(WORLD_W * WORLD_H).fill('#1a1a2e');
let pixelOwner  = new Array(WORLD_W * WORLD_H).fill(null);
let pixelTime   = new Array(WORLD_W * WORLD_H).fill(null);

// ─── USERS ───────────────────────────────────────────
let users = {}; // { token: { name, level, xp, points, totalPx, lastSeen, isAdmin } }

// ─── PERSISTENCE ─────────────────────────────────────
function loadWorld() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      worldColors = d.colors || worldColors;
      pixelOwner  = d.owners || pixelOwner;
      pixelTime   = d.times  || pixelTime;
      console.log('[FPlace] World loaded from disk.');
    } else {
      initDefaultWorld();
    }
  } catch(e) {
    console.error('[FPlace] Failed to load world:', e.message);
    initDefaultWorld();
  }
}

function saveWorld() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      colors: worldColors,
      owners: pixelOwner,
      times:  pixelTime,
    }));
  } catch(e) {
    console.error('[FPlace] Save error:', e.message);
  }
}

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      console.log('[FPlace] Users loaded:', Object.keys(users).length);
    }
  } catch(e) { console.error('[FPlace] Users load error:', e.message); }
}

function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users));
  } catch(e) { console.error('[FPlace] Users save error:', e.message); }
}

// Auto-save every 30 seconds
setInterval(() => { saveWorld(); saveUsers(); }, 30000);

// ─── DEFAULT WORLD ────────────────────────────────────
function initDefaultWorld() {
  console.log('[FPlace] Generating default world...');
  // Color regions like a map
  const regions = [
    { x:0,   y:0,   w:200, h:WORLD_H, c:'#1565c0' }, // ocean west
    { x:800, y:0,   w:200, h:WORLD_H, c:'#1565c0' }, // ocean east
    { x:200, y:0,   w:600, h:50,      c:'#0d47a1' }, // north sea
    { x:200, y:450, w:600, h:50,      c:'#0d47a1' }, // south sea
    { x:200, y:50,  w:150, h:200,     c:'#2e7d32' }, // north america
    { x:200, y:250, w:130, h:200,     c:'#388e3c' }, // south america
    { x:380, y:70,  w:180, h:180,     c:'#bf360c' }, // europe
    { x:380, y:250, w:180, h:200,     c:'#f57f17' }, // africa
    { x:570, y:60,  w:180, h:180,     c:'#6a1b9a' }, // asia
    { x:570, y:280, w:100, h:140,     c:'#00695c' }, // southeast asia
    { x:690, y:300, w:110, h:150,     c:'#1b5e20' }, // oceania
  ];
  regions.forEach(({ x, y, w, h, c }) => {
    for (let dx = 0; dx < w; dx++)
      for (let dy = 0; dy < h; dy++)
        setRaw(x+dx, y+dy, c);
  });
  // "Roads" / borders
  for (let x = 0; x < WORLD_W; x++) {
    setRaw(x, 50,  '#ffffff44');
    setRaw(x, 250, '#ffffff44');
    setRaw(x, 449, '#ffffff44');
  }
  // FPLACE text center
  drawPixelText(Math.floor(WORLD_W/2)-35, Math.floor(WORLD_H/2)-4, 'FPLACE', '#ffffff');
  console.log('[FPlace] Default world ready.');
}

function setRaw(x, y, c) {
  if (x < 0 || x >= WORLD_W || y < 0 || y >= WORLD_H) return;
  worldColors[y * WORLD_W + x] = c;
}

function drawPixelText(sx, sy, text, c) {
  const F = {
    F:[[1,1,1,1],[1,0,0,0],[1,1,1,0],[1,0,0,0],[1,0,0,0]],
    P:[[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,0,0],[1,0,0,0]],
    L:[[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,1,1,1]],
    A:[[0,1,1,0],[1,0,0,1],[1,1,1,1],[1,0,0,1],[1,0,0,1]],
    C:[[0,1,1,1],[1,0,0,0],[1,0,0,0],[1,0,0,0],[0,1,1,1]],
    E:[[1,1,1,1],[1,0,0,0],[1,1,1,0],[1,0,0,0],[1,1,1,1]],
  };
  let px = sx;
  for (const ch of text) {
    const g = F[ch]; if (!g) { px += 4; continue; }
    for (let r = 0; r < g.length; r++)
      for (let col = 0; col < g[r].length; col++)
        if (g[r][col]) setRaw(px+col, sy+r, c);
    px += 5;
  }
}

// ─── CONNECTED CLIENTS ───────────────────────────────
const clients = new Map(); // ws → { token, name, lastPaint, isAdmin }

function broadcast(data, exclude) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(ws => {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN)
      ws.send(msg);
  });
}

function sendTo(ws, data) {
  if (ws.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify(data));
}

function onlineCount() {
  return wss.clients.size;
}

function getLeaderboard() {
  return Object.values(users)
    .sort((a, b) => b.totalPx - a.totalPx)
    .slice(0, 10)
    .map(u => ({ name: u.name, px: u.totalPx, level: u.level }));
}

// ─── TOKEN HELPERS ────────────────────────────────────
function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

function getOrCreateUser(token, name) {
  if (!users[token]) {
    users[token] = {
      name: name || 'Anon',
      level: 1,
      xp: 0,
      points: 50,       // start points = getMaxPoints(1)
      totalPx: 0,
      lastSeen: Date.now(),
      isAdmin: false,
    };
  } else {
    if (name) users[token].name = name;
    users[token].lastSeen = Date.now();
    // Regen points since last seen (1 pt per 30s, capped at max)
    const elapsed = Date.now() - (users[token].lastRegenAt || users[token].lastSeen);
    const regenCycles = Math.floor(elapsed / 30000);
    if (regenCycles > 0) {
      const maxPts = getMaxPoints(users[token].level);
      users[token].points = Math.min(maxPts, users[token].points + regenCycles);
      users[token].lastRegenAt = Date.now();
    }
  }
  return users[token];
}

// ─── REGEN LOOP ───────────────────────────────────────
setInterval(() => {
  Object.values(users).forEach(u => {
    if (u.isAdmin) return; // admin has infinite
    const max = getMaxPoints(u.level);
    if (u.points < max) {
      u.points = Math.min(max, u.points + 1);
    }
    u.lastRegenAt = Date.now();
  });
  // Notify online users of their updated points
  clients.forEach((info, ws) => {
    const u = users[info.token];
    if (!u) return;
    sendTo(ws, { type: 'pointsUpdate', points: u.isAdmin ? Infinity : u.points });
  });
}, 30000);

// ─── WEBSOCKET HANDLER ────────────────────────────────
wss.on('connection', (ws, req) => {
  console.log('[FPlace] New connection');
  let clientInfo = { token: null, name: 'Anon', isAdmin: false };
  clients.set(ws, clientInfo);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      // ── JOIN ──────────────────────────────────────
      case 'join': {
        const token = msg.token || makeToken();
        const name  = (msg.name || 'Anon').slice(0, 24).replace(/[<>]/g, '');
        const isAdmin = (name === ADMIN_NAME && msg.adminPass === ADMIN_PASS);

        const user = getOrCreateUser(token, name);
        if (isAdmin) { user.isAdmin = true; user.name = name; }

        clientInfo.token   = token;
        clientInfo.name    = user.name;
        clientInfo.isAdmin = user.isAdmin;

        // Send world state — send as compressed chunks
        sendTo(ws, {
          type: 'init',
          token,
          user: {
            name:    user.name,
            level:   user.level,
            xp:      user.xp,
            points:  user.isAdmin ? 999999 : user.points,
            maxPts:  user.isAdmin ? 999999 : getMaxPoints(user.level),
            totalPx: user.totalPx,
            isAdmin: user.isAdmin,
            cooldown: getCooldown(user.level),
          },
          world: {
            w: WORLD_W,
            h: WORLD_H,
            colors: worldColors,
          },
          online: onlineCount(),
          leaderboard: getLeaderboard(),
        });

        // Tell others
        broadcast({ type: 'online', count: onlineCount() }, ws);
        console.log(`[FPlace] ${user.name} joined (admin=${user.isAdmin})`);
        break;
      }

      // ── PAINT ─────────────────────────────────────
      case 'paint': {
        if (!clientInfo.token) return;
        const user = users[clientInfo.token];
        if (!user) return;

        const { pixels } = msg; // [{ x, y, color }]
        if (!Array.isArray(pixels) || pixels.length === 0) return;

        // Validate
        if (!user.isAdmin) {
          // Cooldown check
          const now = Date.now();
          const cd  = getCooldown(user.level);
          if (cd > 0 && clientInfo.lastPaint && (now - clientInfo.lastPaint) < cd) {
            sendTo(ws, { type: 'error', msg: 'Cooldown activo' });
            return;
          }
          // Points check
          if (user.points < pixels.length) {
            sendTo(ws, { type: 'error', msg: 'Puntos insuficientes' });
            return;
          }
        }

        const painted = [];
        pixels.forEach(({ x, y, color }) => {
          if (
            typeof x !== 'number' || typeof y !== 'number' ||
            x < 0 || x >= WORLD_W || y < 0 || y >= WORLD_H ||
            typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)
          ) return;

          worldColors[y * WORLD_W + x] = color;
          pixelOwner [y * WORLD_W + x] = user.name;
          pixelTime  [y * WORLD_W + x] = Date.now();
          painted.push({ x, y, color, owner: user.name });
        });

        if (painted.length === 0) return;

        if (!user.isAdmin) {
          user.points  -= painted.length;
          user.totalPx += painted.length;
          user.xp      += painted.length;
          clientInfo.lastPaint = Date.now();

          // Level up
          let leveled = false;
          while (user.xp >= xpForLevel(user.level)) {
            user.xp     -= xpForLevel(user.level);
            user.level  += 1;
            leveled      = true;
          }
          if (leveled) {
            sendTo(ws, { type: 'levelUp', level: user.level, maxPts: getMaxPoints(user.level), cooldown: getCooldown(user.level) });
          }

          sendTo(ws, {
            type:    'paintAck',
            points:  user.points,
            maxPts:  getMaxPoints(user.level),
            xp:      user.xp,
            level:   user.level,
            totalPx: user.totalPx,
          });
        }

        // Broadcast pixels to all others
        broadcast({ type: 'pixels', pixels: painted }, ws);

        // Update leaderboard periodically
        broadcast({ type: 'leaderboard', data: getLeaderboard() });
        break;
      }

      // ── PING ──────────────────────────────────────
      case 'ping': {
        sendTo(ws, { type: 'pong' });
        break;
      }

      // ── ADMIN: CLEAR WORLD ────────────────────────
      case 'adminClear': {
        if (!clientInfo.isAdmin) return;
        worldColors.fill('#1a1a2e');
        pixelOwner.fill(null);
        pixelTime.fill(null);
        broadcast({ type: 'worldReset', colors: worldColors });
        console.log('[FPlace] World cleared by admin');
        break;
      }

      // ── ADMIN: BAN ────────────────────────────────
      case 'adminBan': {
        if (!clientInfo.isAdmin) return;
        const targetName = msg.name;
        clients.forEach((info, targetWs) => {
          if (info.name === targetName && targetWs !== ws) {
            sendTo(targetWs, { type: 'banned', reason: 'Baneado por el administrador' });
            targetWs.close();
          }
        });
        break;
      }
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    broadcast({ type: 'online', count: onlineCount() });
  });

  ws.on('error', (err) => {
    console.error('[FPlace] WS error:', err.message);
    clients.delete(ws);
  });
});

// ─── HTTP ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

app.get('/leaderboard', (_, res) => {
  res.json(getLeaderboard());
});

app.get('/stats', (_, res) => {
  res.json({
    online:  onlineCount(),
    totalUsers: Object.keys(users).length,
    worldSize: `${WORLD_W}×${WORLD_H}`,
  });
});

// ─── BOOT ─────────────────────────────────────────────
loadWorld();
loadUsers();

server.listen(PORT, () => {
  console.log(`\n🗺  FPlace running → http://localhost:${PORT}`);
  console.log(`   World: ${WORLD_W}×${WORLD_H} = ${(WORLD_W*WORLD_H).toLocaleString()} píxeles`);
  console.log(`   Admin: "${ADMIN_NAME}" / pass: "${ADMIN_PASS}"`);
  console.log('   Put index.html in ./public/\n');
});
