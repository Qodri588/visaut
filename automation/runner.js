'use strict';
/**
 * runner.js — orkestrasi 1 job automation end-to-end.
 *
 * MEKANISME EXPORT (terbaru):
 *   - Klik tombol "Export" (header) → mulai render real-time pakai MediaRecorder.
 *   - Render berlangsung selama durasi audio (real-time recording canvas).
 *   - Setelah selesai, app langsung trigger download via <a download>.click()
 *     (blob URL), TANPA dialog pilih lokasi file lagi. Karena itu kita cukup
 *     pakai Playwright download event (acceptDownloads: true) + download.saveAs().
 *
 * @param {object} job  { id, preset, audio, mediaType, mediaPath, exportName }
 * @param {object} ctx  { emit }  emit(stage, percent, message, data)
 */
const path = require('path');
const { chromium } = require('playwright');
const config = require('../config');
const selectors = require('./selectors');

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Upload file dengan klik tombol lalu isi input[type=file] via filechooser.
 */
async function clickAndUpload(page, buttonSelector, filePath, ctx, label) {
  ctx.emit('upload', 0, `${label}: menunggu tombol...`);
  await page.waitForSelector(buttonSelector, { state: 'visible', timeout: config.AUTOMATION.pageTimeout });
  ctx.emit('upload', 20, `${label}: membuka file picker...`);

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: config.AUTOMATION.uploadTimeout }),
    page.click(buttonSelector),
  ]);
  ctx.emit('upload', 40, `${label}: mengirim file...`);
  await fileChooser.setFiles(filePath);
  ctx.emit('upload', 60, `${label}: file terkirim, menunggu proses...`);
  await sleep(2500);
  ctx.emit('upload', 100, `${label}: selesai`);
}

/**
 * Auto-detect & klik tombol Export di header.
 */
async function clickExportButton(page, ctx) {
  ctx.emit('export-click', 0, 'Mencari tombol export...');
  for (const text of selectors.exportButtonTexts) {
    try {
      const btn = page.getByRole('button', { name: text, exact: false });
      if ((await btn.count()) > 0 && (await btn.first().isVisible())) {
        ctx.emit('export-click', 50, `Tombol ditemukan: "${text}", mengklik...`);
        await btn.first().click();
        ctx.emit('export-click', 100, `Tombol "${text}" diklik, render dimulai`);
        return text;
      }
    } catch (_) { /* coba berikutnya */ }
  }
  // Fallback: scan semua button
  const buttons = await page.$$('button');
  for (const b of buttons) {
    try {
      const t = ((await b.textContent()) || '').trim().toLowerCase();
      if (/(export|render|download|save|ekspor)/.test(t) && (await b.isVisible())) {
        ctx.emit('export-click', 90, `Fallback menemukan: "${t}"`);
        await b.click();
        ctx.emit('export-click', 100, 'Tombol diklik (fallback)');
        return t;
      }
    } catch (_) { /* skip */ }
  }
  throw new Error('Tombol export tidak ditemukan di halaman');
}

/**
 * Tunggu hasil render + download .webm.
 * Cukup andalkan Playwright download event — app sekarang langsung trigger
 * download via <a download>.click() (tanpa dialog pilih lokasi).
 *
 * @returns {Promise<string>} path file .webm yang tersimpan
 */
async function waitForRenderAndDownload(page, ctx, targetDir) {
  ctx.emit('download', 0, 'Menunggu render selesai & download .webm...');
  const renderTimeoutMs = config.AUTOMATION.renderTimeout;

  const download = await page.waitForEvent('download', { timeout: renderTimeoutMs });
  const fname = download.suggestedFilename();
  ctx.emit('download', 50, `Download dimulai: ${fname}`);
  const savePath = path.join(targetDir, fname);
  await download.saveAs(savePath);
  ctx.emit('download', 100, `Download tersimpan: ${savePath}`);
  return savePath;
}

async function runAutomation(job, ctx) {
  const { FOLDERS, AUTOMATION, TARGET_URL } = config;
  ctx.emit('browser', 0, 'Menjalankan browser...');

  const browser = await chromium.launch({
    headless: AUTOMATION.headless,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });

  try {
    // 1. Buka URL
    ctx.emit('navigate', 0, `Membuka ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: AUTOMATION.pageTimeout });
    ctx.emit('navigate', 100, 'Halaman siap');

    // 2. Upload preset
    await clickAndUpload(page, selectors.uploadPresetButton, job.preset, ctx, 'Preset');

    // 3. Upload audio
    await clickAndUpload(page, selectors.uploadAudioButton, job.audio, ctx, 'Audio');

    // 4. Upload image ATAU video
    if (job.mediaType === 'image' && job.mediaPath) {
      await clickAndUpload(page, selectors.uploadImageButton, job.mediaPath, ctx, 'Image');
    } else if (job.mediaType === 'video' && job.mediaPath) {
      await clickAndUpload(page, selectors.uploadVideoButton, job.mediaPath, ctx, 'Video');
    }

    // 5. Isi nama export
    ctx.emit('naming', 0, 'Mengisi nama export...');
    await page.waitForSelector(selectors.exportNameInput, { state: 'visible', timeout: AUTOMATION.pageTimeout });
    await page.fill(selectors.exportNameInput, job.exportName);
    ctx.emit('naming', 100, `Nama diisi: ${job.exportName}`);

    // 6. Klik export → mulai render real-time
    await clickExportButton(page, ctx);

    // 7. Tunggu render + download
    const webmPath = await waitForRenderAndDownload(page, ctx, FOLDERS.exports);

    // 8. Tutup browser
    ctx.emit('closing', 50, 'Menutup browser...');
    await browser.close();
    ctx.emit('closing', 100, 'Browser ditutup');

    return { webmPath, exportName: job.exportName };
  } catch (err) {
    try { await browser.close(); } catch (_) { /* ignore */ }
    throw err;
  }
}

module.exports = { runAutomation };
