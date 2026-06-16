'use strict';
/**
 * selectors.js — selector untuk web app target.
 *
 * Strategi UTAMA: data-testid attribute (ditambahkan di source web App.tsx).
 * Fallback: Playwright role-based locator (getByRole, getByText).
 * CSS selector HANYA dipakai sebagai fallback terakhir.
 *
 * DATA-TESTID MAP (sesuai App.tsx):
 *   Header:   btn-open-project, btn-save-project, btn-export
 *   Tabs:     tab-media, tab-visualizer, tab-effects, tab-text, tab-presets
 *   Media:    btn-import-audio, btn-import-cover, btn-import-images, btn-import-videos
 *   Inputs:   input-audio, input-cover, input-images, input-videos, input-project
 *   Export:   input-export-filename
 */

module.exports = {
  /* ==================== HEADER BUTTONS ==================== */

  /**
   * Tombol Open (load project/preset) di header.
   * Digunakan untuk upload preset .json.
   * data-testid: "btn-open-project"
   */
  openProjectButton: '[data-testid="btn-open-project"]',

  /**
   * Tombol Export di header.
   * data-testid: "btn-export"
   */
  exportButton: '[data-testid="btn-export"]',

  /**
   * Kandidat teks tombol export (fallback jika data-testid tidak ada).
   * Urutan = prioritas.
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

  /* ==================== TAB NAVIGATION ==================== */

  /**
   * Tab buttons di toolrail/sidebar.
   * Untuk pindah ke panel yang benar sebelum upload.
   */
  tabButtons: {
    media: '[data-testid="tab-media"]',
    visualizer: '[data-testid="tab-visualizer"]',
    effects: '[data-testid="tab-effects"]',
    text: '[data-testid="tab-text"]',
    presets: '[data-testid="tab-presets"]',
  },

  /**
   * Teks label untuk fallback tab detection.
   */
  tabLabels: {
    media: 'Media',
    visualizer: 'Visualizer',
    effects: 'Effects',
    text: 'Text',
    presets: 'Presets',
  },

  /* ==================== UPLOAD BUTTONS (Media Panel) ==================== */

  /**
   * Tombol import audio di media panel.
   * Hanya muncul jika tab "Media" aktif.
   * data-testid: "btn-import-audio"
   */
  importAudioButton: '[data-testid="btn-import-audio"]',

  /**
   * Tombol import cover art (image) di media panel.
   * data-testid: "btn-import-cover"
   */
  importCoverButton: '[data-testid="btn-import-cover"]',

  /**
   * Tombol add images (background) di media panel.
   * data-testid: "btn-import-images"
   */
  importImagesButton: '[data-testid="btn-import-images"]',

  /**
   * Tombol add videos di media panel.
   * data-testid: "btn-import-videos"
   */
  importVideosButton: '[data-testid="btn-import-videos"]',

  /* ==================== HIDDEN FILE INPUTS ==================== */

  /**
   * Input[type=file] tersembunyi yang muncul saat tombol upload diklik.
   * Bisa langsung setFiles() tanpa perlu klik tombol (lebih stabil).
   */
  fileInputs: {
    audio: '[data-testid="input-audio"]',
    cover: '[data-testid="input-cover"]',
    images: '[data-testid="input-images"]',
    videos: '[data-testid="input-videos"]',
    project: '[data-testid="input-project"]',
  },

  /** Fallback generic file input selector */
  fileInputFallback: 'input[type="file"]',

  /* ==================== INSPECTOR PANEL (Export Settings) ==================== */

  /**
   * Input nama export file di inspector panel.
   * data-testid: "input-export-filename"
   */
  exportNameInput: '[data-testid="input-export-filename"]',

  /**
   * Kandidat teks label untuk cari input nama export (role-based fallback).
   */
  exportNameLabels: ['File name', 'File Name', 'Filename', 'Name', 'Nama', 'Export'],

  /* ==================== FALLBACK TEXT SELECTORS ==================== */

  /**
   * Teks label untuk auto-detect tombol upload berdasarkan isi teks.
   * Digunakan jika data-testid tidak ditemukan di halaman.
   */
  uploadButtonLabels: {
    preset: ['Open', 'Load', 'Import Preset', 'Preset', 'Open Preset'],
    audio: ['Import audio', 'Audio', 'Import Audio', 'Add Audio'],
    image: ['Import image', 'Image', 'Import Image', 'Add Image', 'Cover art', 'Add images'],
    video: ['Import video', 'Video', 'Import Video', 'Add Video', 'Add videos'],
  },

  /**
   * CSS fallback selectors (terakhir) jika semua strategi lain gagal.
   * Menggunakan :has-text() agar tidak bergantung pada posisi DOM.
   */
  fallbackSelectors: {
    audio: 'aside.library-panel :has-text("Import audio")',
    image: 'aside.library-panel :has-text("Add images")',
    cover: 'aside.library-panel :has-text("Cover art")',
    video: 'aside.library-panel :has-text("Add videos")',
    preset: 'header .header-actions button:has-text("Open")',
  },
};
