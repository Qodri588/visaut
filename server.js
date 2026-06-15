'use strict';
/**
 * server.js — entrypoint aplikasi.
 * - Express: REST API + static frontend
 * - WebSocket (ws): broadcast progress job ke semua client
 * - Auto-init folder storage
 * - Auto-buka browser ke UI (opsional, Windows & Linux)
 */
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const config = require('./config');
const hub = require('./jobs/events');

// --- Init folder storage ---
async function ensureStorage() {
  await fsp.mkdir(config.STORAGE_DIR, { recursive: true });
  for (const k of Object.keys(config.FOLDERS)) {
    await fsp.mkdir(config.FOLDERS[k], { recursive: true });
  }
}

// --- App setup ---
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

// API
app.use('/api/files', require('./routes/files'));
app.use('/api/jobs', require('./routes/jobs'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, platform: process.platform, node: process.version, maxParallel: config.AUTOMATION.maxParallel });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- HTTP + WS server ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'hello', t: Date.now() }));

  const onStatus = (job) => safeSend(ws, { type: 'job:status', job });
  const onProgress = (p) => safeSend(ws, { type: 'job:progress', ...p });

  hub.on('job:status', onStatus);
  hub.on('job:progress', onProgress);

  ws.on('close', () => {
    hub.off('job:status', onStatus);
    hub.off('job:progress', onProgress);
  });
});

function safeSend(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

// --- Start ---
(async () => {
  await ensureStorage();
  server.listen(config.SERVER.port, config.SERVER.host, () => {
    const url = `http://localhost:${config.SERVER.port}`;
    console.log('');
    console.log('========================================');
    console.log('  Visual Automation App');
    console.log('========================================');
    console.log(`  Platform   : ${process.platform}`);
    console.log(`  Node       : ${process.version}`);
    console.log(`  URL        : ${url}`);
    console.log(`  Max parallel: ${config.AUTOMATION.maxParallel}`);
    console.log(`  Headless   : ${config.AUTOMATION.headless}`);
    console.log(`  Storage    : ${config.STORAGE_DIR}`);
    console.log(`  Target     : ${config.TARGET_URL}`);
    console.log('========================================');
    console.log('');

    // Auto-open browser (best effort)
    openBrowser(url).catch(() => {});
  });
})();

function openBrowser(url) {
  const cmd = config.isWindows
    ? `start "" "${url}"`
    : config.isLinux
    ? `xdg-open "${url}"`
    : `open "${url}"`;
  const exec = require('child_process').exec;
  return new Promise((resolve, reject) => exec(cmd, (err) => (err ? reject(err) : resolve())));
}
