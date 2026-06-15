'use strict';
/**
 * routes/files.js — REST API untuk file manager (storage/).
 *  GET    /api/files?dir=presets                 → list isi folder
 *  GET    /api/files/download?path=...           → download file
 *  POST   /api/files/upload                      → upload (multipart, field: file, targetDir)
 *  POST   /api/files/mkdir                       → buat folder
 *  POST   /api/files/rename                      → rename
 *  POST   /api/files/move                        → pindah file
 *  DELETE /api/files?path=...                    → hapus file/folder
 *
 * Semua path di-resolve relatif terhadap STORAGE_DIR & divalidasi (anti path traversal).
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const multer = require('multer');
const config = require('../config');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 * 1024 } }); // 2GB

/** Resolve path aman terhadap STORAGE_DIR. Reject path traversal. */
function safeResolve(relPath) {
  if (!relPath) return config.STORAGE_DIR;
  const cleaned = relPath.replace(/\\/g, '/').replace(/^\//, '');
  const full = path.resolve(config.STORAGE_DIR, cleaned);
  if (full !== config.STORAGE_DIR && !full.startsWith(config.STORAGE_DIR + path.sep)) {
    const err = new Error('Path traversal ditolak');
    err.code = 'EBADPATH';
    throw err;
  }
  return full;
}

function formatBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return (n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + u[i];
}

// LIST folder
router.get('/', async (req, res) => {
  try {
    const dir = req.query.dir || '';
    const full = safeResolve(dir);
    const entries = await fsp.readdir(full, { withFileTypes: true });
    const items = await Promise.all(entries.map(async (e) => {
      const p = path.join(full, e.name);
      let size = 0, mtime = null;
      try {
        const st = await fsp.stat(p);
        size = st.size;
        mtime = st.mtimeMs;
      } catch (_) { /* ignore */ }
      const rel = path.relative(config.STORAGE_DIR, p).split(path.sep).join('/');
      return {
        name: e.name,
        path: rel,
        type: e.isDirectory() ? 'dir' : 'file',
        size,
        sizeHuman: formatBytes(size),
        mtime,
      };
    }));
    // folder dulu, lalu file; masing-masing alfabet
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    res.json({ ok: true, dir, items });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// DOWNLOAD
router.get('/download', async (req, res) => {
  try {
    const full = safeResolve(req.query.path);
    if (!(await fileExists(full)) || (await fsp.stat(full)).isDirectory()) {
      return res.status(404).json({ ok: false, error: 'File tidak ditemukan' });
    }
    res.download(full);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// UPLOAD (bisa multiple)
router.post('/upload', upload.array('file', 20), async (req, res) => {
  try {
    const targetDir = req.body.targetDir || '';
    const fullDir = safeResolve(targetDir);
    await fsp.mkdir(fullDir, { recursive: true });

    const saved = [];
    for (const f of req.files || []) {
      const dest = path.join(fullDir, f.originalname);
      await fsp.writeFile(dest, f.buffer);
      saved.push({
        name: f.originalname,
        size: f.size,
        sizeHuman: formatBytes(f.size),
        path: path.relative(config.STORAGE_DIR, dest).split(path.sep).join('/'),
      });
    }
    res.json({ ok: true, saved });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// MKDIR
router.post('/mkdir', async (req, res) => {
  try {
    const full = safeResolve(req.body.path);
    await fsp.mkdir(full, { recursive: true });
    res.json({ ok: true, path: path.relative(config.STORAGE_DIR, full).split(path.sep).join('/') });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// RENAME
router.post('/rename', async (req, res) => {
  try {
    const from = safeResolve(req.body.from);
    const to = safeResolve(req.body.to);
    await fsp.rename(from, to);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// MOVE
router.post('/move', async (req, res) => {
  try {
    const from = safeResolve(req.body.from);
    let to = safeResolve(req.body.to);
    const st = await fsp.stat(from);
    const dest = st.isDirectory() ? path.join(to, path.basename(from)) : to;
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.rename(from, dest);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// DELETE
router.delete('/', async (req, res) => {
  try {
    const full = safeResolve(req.query.path);
    if (full === config.STORAGE_DIR) {
      return res.status(400).json({ ok: false, error: 'Tidak boleh hapus root' });
    }
    const st = await fsp.stat(full);
    if (st.isDirectory()) await fsp.rm(full, { recursive: true });
    else await fsp.unlink(full);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

async function fileExists(p) {
  try { await fsp.access(p); return true; } catch (_) { return false; }
}

module.exports = router;
