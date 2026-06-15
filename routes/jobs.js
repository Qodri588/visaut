'use strict';
/**
 * routes/jobs.js — REST API untuk job automation.
 *  POST   /api/jobs        → buat job baru
 *  GET    /api/jobs        → list semua job
 *  GET    /api/jobs/:id    → detail 1 job
 *  POST   /api/jobs/:id/cancel → batalkan
 *  DELETE /api/jobs/:id    → hapus dari list (kalau sudah selesai)
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const queue = require('../jobs/queue');

const router = express.Router();

function resolveStorage(relOrAbs) {
  // Bisa path relatif (presets/foo.json) atau absolut
  if (!relOrAbs) return null;
  let p = String(relOrAbs);
  if (path.isAbsolute(p)) return fs.existsSync(p) ? p : null;
  const full = path.join(config.STORAGE_DIR, p);
  return fs.existsSync(full) ? full : null;
}

// CREATE
router.post('/', (req, res) => {
  const { preset, audio, mediaType, mediaPath, exportName } = req.body || {};

  if (!exportName || typeof exportName !== 'string' || !exportName.trim()) {
    return res.status(400).json({ ok: false, error: 'exportName wajib diisi' });
  }
  const presetFull = resolveStorage(preset);
  if (!presetFull) return res.status(400).json({ ok: false, error: 'File preset tidak ditemukan: ' + preset });
  const audioFull = resolveStorage(audio);
  if (!audioFull) return res.status(400).json({ ok: false, error: 'File audio tidak ditemukan: ' + audio });

  let mediaFull = null;
  if (mediaPath) {
    mediaFull = resolveStorage(mediaPath);
    if (!mediaFull) return res.status(400).json({ ok: false, error: 'File media tidak ditemukan: ' + mediaPath });
    if (mediaType !== 'image' && mediaType !== 'video') {
      return res.status(400).json({ ok: false, error: 'mediaType harus "image" atau "video"' });
    }
  }

  const job = queue.enqueue({
    preset: presetFull,
    audio: audioFull,
    mediaType: mediaType || null,
    mediaPath: mediaFull,
    exportName: exportName.trim(),
  });
  res.json({ ok: true, job });
});

// LIST
router.get('/', (req, res) => {
  res.json({ ok: true, jobs: queue.list() });
});

// DETAIL
router.get('/:id', (req, res) => {
  const job = queue.get(req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: 'Job tidak ditemukan' });
  res.json({ ok: true, job });
});

// CANCEL
router.post('/:id/cancel', (req, res) => {
  const job = queue.cancel(req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: 'Job tidak ditemukan' });
  res.json({ ok: true, job });
});

// REMOVE (setelah selesai)
router.delete('/:id', (req, res) => {
  const ok = queue.remove(req.params.id);
  if (!ok) return res.status(400).json({ ok: false, error: 'Tidak bisa hapus job (mungkin masih berjalan)' });
  res.json({ ok: true });
});

module.exports = router;
