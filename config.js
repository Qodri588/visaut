'use strict';
/**
 * config.js — konfigurasi terpusat aplikasi
 * Semua nilai yang mungkin berubah ada di sini (URL target, parallel, path, dll).
 */
const path = require('path');
const os = require('os');

const ROOT_DIR = __dirname;
const STORAGE_DIR = path.join(ROOT_DIR, 'storage');

/** Folder tempat file-file project dikelola oleh web app file manager */
const FOLDERS = {
  presets: path.join(STORAGE_DIR, 'presets'),
  audio: path.join(STORAGE_DIR, 'audio'),
  media: path.join(STORAGE_DIR, 'media'),
  exports: path.join(STORAGE_DIR, 'exports'),
};

/** Ekstensi tiap kategori, dipakai untuk auto-sort file upload */
const EXT_CATEGORIES = {
  preset: ['.json', '.preset', '.vpreset'],
  audio: ['.mp3', '.wav', '.aac', '.m4a', '.ogg', '.flac', '.wma'],
  image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'],
  video: ['.mp4', '.webm', '.mkv', '.mov', '.avi', '.flv', '.wmv'],
};

/** List kategori yang ditampilkan di UI file manager (urutan) */
const FILE_MANAGER_DIRS = ['presets', 'audio', 'media', 'exports'];

const SERVER = {
  port: process.env.PORT || 7576,
  host: process.env.HOST || '0.0.0.0',
};

const AUTOMATION = {
  /** Jumlah job automation maksimum yang berjalan bersamaan */
  maxParallel: parseInt(process.env.MAX_PARALLEL || '3', 10),
  /** Timeout per langkah upload (ms) */
  uploadTimeout: 120000,
  /** Timeout menunggu halaman siap */
  pageTimeout: 60000,
  /** Timeout menunggu render real-time selesai + download (ms).
   *  Render bersifat real-time (selama durasi audio), jadi default 30 menit. */
  renderTimeout: parseInt(process.env.RENDER_TIMEOUT || (30 * 60 * 1000), 10),
  /** Headless browser atau tidak (debug: set false) */
  headless: process.env.HEADED ? false : true,
  /** Max retry per langkah */
  maxRetries: 1,
};

/** URL target web app yang diautomation */
const TARGET_URL = 'https://visual.farishitam777.workers.dev/';

module.exports = {
  ROOT_DIR,
  STORAGE_DIR,
  FOLDERS,
  EXT_CATEGORIES,
  FILE_MANAGER_DIRS,
  SERVER,
  AUTOMATION,
  TARGET_URL,
  isWindows: process.platform === 'win32',
  isLinux: process.platform === 'linux',
};
