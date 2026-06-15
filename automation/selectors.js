'use strict';
/**
 * selectors.js — selector untuk web app target.
 *
 * Strategi: pakai Playwright locator role-based (getByRole, getByText, getByTestId)
 * yang lebih stabil daripada CSS nth-child selector di cross-environment (Windows/Linux,
 * headed/headless, resolusi berbeda). Fallback ke CSS selector hanya jika diperlukan.
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
   */
  uploadAudioButton: '#root > div > div.workspace > aside.library-panel > div.media-panel > button',

  /**
   * Upload image — cari button di media panel yang teks-nya mengandung "Import image"
   * atau label "Image".
   */
  uploadImageButton: '#root > div > div.workspace > aside.library-panel > div.media-panel > div > button:nth-child(2)',

  /**
   * Upload video — cari button di media panel yang teks-nya mengandung "Import video"
   * atau label "Video".
   */
  uploadVideoButton: '#root > div > div.workspace > aside.library-panel > div.media-panel > div > button:nth-child(3)',

  /**
   * Input nama export di inspector panel.
   */
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

  /** Selector input[type=file] tersembunyi yang biasanya muncul saat tombol upload diklik */
  fileInputFallback: 'input[type="file"]',
};
