'use strict';
/**
 * selectors.js — selector untuk web app target.
 *
 * Strategi UTAMA: Playwright role-based locator (getByRole, getByText).
 * CSS selector HANYA dipakai sebagai fallback mutakhir dan dibuat lebih robust
 * (pakai data-testid / aria-label / text content selector, bukan nth-child).
 */

module.exports = {
  /**
   * Upload preset — cari button di header yang mengandung teks "Open" atau "Save"
   * lalu klik button preset (biasanya button ke-4 di header-actions).
   * Fallback ke CSS selector yang lama jika role-based gagal.
   */
  uploadPresetButton: '#root > div > header > div.header-actions > button:nth-child(4)',

  /**
   * Upload audio — cari button yang teks-nya mengandung "Import audio"
   * atau label "Audio" di library panel.
   * Fallback CSS: cari button di dalam media-panel (tanpa nth-child).
   */
  uploadAudioButton: 'aside.library-panel div.media-panel button',

  /**
   * Upload image — cari button di media panel yang teks-nya mengandung "Import image"
   * atau label "Image".
   * Fallback CSS: gunakan text selector yang lebih stabil daripada nth-child.
   */
  uploadImageButton: 'aside.library-panel div.media-panel button:has-text("Import image")',

  /**
   * Upload video — cari button di media panel yang teks-nya mengandung "Import video"
   * atau label "Video".
   * Fallback CSS: gunakan text selector yang lebih stabil daripada nth-child.
   */
  uploadVideoButton: 'aside.library-panel div.media-panel button:has-text("Import video")',

  /**
   * Input nama export di inspector panel.
   * Fallback CSS: cari input di inspector panel (tanpa nth-child).
   */
  exportNameInput: 'aside.inspector-panel input[type="text"], aside.inspector-panel input:not([type])',

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

  /**
   * Label teks untuk auto-detect tombol upload berdasarkan isi teks.
   * Digunakan oleh clickAndUpload sebagai fallback jika CSS selector gagal.
   */
  uploadButtonLabels: {
    preset: ['Open', 'Load', 'Import Preset', 'Preset', 'Open Preset'],
    audio: ['Import audio', 'Audio', 'Import Audio', 'Add Audio'],
    image: ['Import image', 'Image', 'Import Image', 'Add Image'],
    video: ['Import video', 'Video', 'Import Video', 'Add Video'],
  },

  /**
   * Text-based selectors yang lebih stabil — dipakai sebagai Fallback kedua
   * jika role-based DAN CSS nth-child gagal. Menggunakan :has-text()
   * sehingga tidak bergantung pada posisi elemen di DOM.
   */
  robustUploadSelectors: {
    audio: 'aside.library-panel :has-text("Import audio")',
    image: 'aside.library-panel :has-text("Import image")',
    video: 'aside.library-panel :has-text("Import video")',
  },

  /** Selector input[type=file] tersembunyi yang biasanya muncul saat tombol upload diklik */
  fileInputFallback: 'input[type="file"]',
};
