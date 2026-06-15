'use strict';
/**
 * converter.js — convert .webm → .mp4 memakai ffmpeg.
 *
 * Strategi dua tahap:
 *   1. REMUX (stream copy) — tanpa encode ulang, hampir instan.
 *      Berhasil kalau codec di webm kompatibel dengan MP4 (H.264+AAC).
 *   2. FALLBACK (re-encode cepat) — kalau remux gagal (codec VP8/VP9/Opus
 *      tidak didukung MP4), pakai ultrafast + semua thread CPU.
 *
 * Strategi ffmpeg binary:
 *   1. ffmpeg-static (bundle, cross-platform)
 *   2. fallback ke 'ffmpeg' di PATH
 */
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');

// Resolve binary ffmpeg
let resolvedFfmpeg = null;
function findFfmpeg() {
  if (resolvedFfmpeg) return resolvedFfmpeg;
  if (ffmpegPath && fs.existsSync(ffmpegPath)) {
    resolvedFfmpeg = ffmpegPath;
    return resolvedFfmpeg;
  }
  resolvedFfmpeg = 'ffmpeg'; // andalkan PATH
  return resolvedFfmpeg;
}

ffmpeg.setFfmpegPath(findFfmpeg());

/**
 * Coba remux (stream copy) webm → mp4 tanpa re-encode.
 * @returns {Promise<string>} outputPath jika berhasil
 * @throws {Error} jika remux gagal
 */
function tryRemux(inputPath, outputPath, onProgress) {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(inputPath)
      .outputOptions([
        '-c copy',            // copy stream tanpa encode ulang
        '-movflags +faststart',
      ])
      .output(outputPath)
      .on('start', () => {
        if (onProgress) onProgress(10, { stage: 'remux' });
      })
      .on('error', (err) => {
        // hapus file hasil remux yang corrupt/invalid
        try { fs.unlinkSync(outputPath); } catch (_) {}
        reject(new Error(`remux gagal: ${err.message}`));
      })
      .on('end', () => {
        if (onProgress) onProgress(100, { stage: 'done' });
        resolve(outputPath);
      });

    cmd.run();
  });
}

/**
 * Re-encode webm → mp4 dengan setting tercepat.
 */
function reEncode(inputPath, outputPath, onProgress) {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(inputPath)
      .outputOptions([
        '-c:v libx264',
        '-preset ultrafast',   // tercepat — trade-off: file lebih besar
        '-crf 26',             // sedikit lebih rendah quality tapi lebih cepat dari 23
        '-threads 0',          // gunakan semua core CPU
        '-c:a aac',
        '-b:a 192k',
        '-movflags +faststart',
        '-pix_fmt yuv420p',
      ])
      .output(outputPath)
      .on('start', (cmdline) => {
        if (onProgress) onProgress(0, { stage: 're-encode' });
      })
      .on('progress', (info) => {
        if (onProgress) onProgress(Math.min(99, info.percent || 0), { stage: 'progress', info });
      })
      .on('error', (err) => {
        reject(new Error(`ffmpeg error: ${err.message}`));
      })
      .on('end', () => {
        if (onProgress) onProgress(100, { stage: 'done' });
        resolve(outputPath);
      });

    cmd.run();
  });
}

/**
 * Convert webm → mp4.
 * Otomatis pilih remux (instan) atau re-encode (cepat) tergantung kompatibilitas codec.
 *
 * @param {string} inputPath  path file .webm
 * @param {string} outputPath path file .mp4
 * @param {(percent:number, info:object)=>void} onProgress
 * @returns {Promise<string>} outputPath
 */
async function convertWebmToMp4(inputPath, outputPath, onProgress) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input tidak ditemukan: ${inputPath}`);
  }

  // Hapus output lama jika sudah ada
  try { fs.unlinkSync(outputPath); } catch (_) {}

  // Tahap 1: Coba remux (instan, tanpa encode ulang)
  try {
    return await tryRemux(inputPath, outputPath, onProgress);
  } catch (_) {
    // Remux gagal — codec tidak kompatibel, lanjut re-encode
  }

  // Tahap 2: Fallback re-encode dengan setting tercepat
  if (onProgress) onProgress(0, { stage: 'fallback-re-encode' });
  return reEncode(inputPath, outputPath, onProgress);
}

module.exports = { convertWebmToMp4, findFfmpeg };
