'use strict';
/**
 * selectors.js — semua CSS selector untuk web app target.
 * Jika UI berubah, cukup edit file ini (tidak perlu sentuh logic).
 *
 * Berdasarkan selector yang diberikan user:
 *  - header button:nth-child(4)         → upload preset
 *  - library-panel media-panel > button → upload audio
 *  - media-panel > div > button:2       → upload image
 *  - media-panel > div > button:3       → upload video
 *  - inspector-panel section:2 label:2 input → nama export
 *  - export button: di-auto-detect (tidak pasti selector-nya)
 */

module.exports = {
  // Tombol upload preset di header
  uploadPresetButton: '#root > div > header > div.header-actions > button:nth-child(4)',

  // Tombol upload audio di library panel
  uploadAudioButton: '#root > div > div.workspace > aside.library-panel > div.media-panel > button',

  // Tombol upload image (child ke-2 dari div di dalam media-panel)
  uploadImageButton: '#root > div > div.workspace > aside.library-panel > div.media-panel > div > button:nth-child(2)',

  // Tombol upload video (child ke-3 dari div di dalam media-panel)
  uploadVideoButton: '#root > div > div.workspace > aside.library-panel > div.media-panel > div > button:nth-child(3)',

  // Input nama export di inspector panel
  exportNameInput: '#root > div > div.workspace > aside.inspector-panel > section:nth-child(2) > label:nth-child(2) > input',

  /**
   * Tombol export tidak punya selector pasti — di-auto-detect.
   * Kandidat teks yang akan dicari (case-insensitive) pada elemen <button>.
   * Urutan = prioritas. Playwright `getByRole('button', { name })` dipakai.
   */
  exportButtonTexts: [
    'Export',
    'Export Video',
    'Render',
    'Render Video',
    'Download',
    'Download Video',
    'Save',
    'Save Video',
    'Export as MP4',
    'Mulai Render',
    'Ekspor',
  ],

  /** Selector input[type=file] tersembunyi yang biasanya muncul saat tombol upload diklik */
  fileInputFallback: 'input[type="file"]',
};
