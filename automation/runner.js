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
 * SELECTOR STRATEGY (3-tier, robust):
 *   1. Role-based locator (getByRole) — paling stabil cross-environment
 *   2. Text-based locator (getByText → parent click) — fallback kedua
 *   3. CSS :has-text() selector — fallback ketiga (tanpa nth-child)
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
 * Tunggu sampai React app selesai render (DOM stabil).
 * Cek: aside.library-panel sudah muncul = sidebar sudah siap.
 */
async function waitForAppReady(page, ctx) {
  ctx.emit('navigate', 50, 'Menunggu app selesai render...');
  // Cek beberapa marker bahwa DOM sudah ready
  try {
    await page.waitForSelector('aside.library-panel', { state: 'attached', timeout: config.AUTOMATION.pageTimeout });
  } catch (_) {
    ctx.emit('navigate', 50, 'Warning: library-panel tidak ditemukan, coba lanjut...');
  }
  // Tunggu tambahan untuk React hydration & lazy-load
  await sleep(2000);
}

/**
 * Cari dan klik tombol upload berdasarkan teks/label (3-tier strategy).
 * Tier 1: role-based button locator
 * Tier 2: text-based (getByText → parent clickable)
 * Tier 3: CSS :has-text() selector (tanpa nth-child)
 */
async function findUploadButton(page, cssSelector, labelTexts, ctx, label, typeKey) {
  // 1. Role-based: cari button yang teks-nya cocok
  for (const text of labelTexts) {
    try {
      const btn = page.getByRole('button', { name: text, exact: false });
      if ((await btn.count()) > 0 && (await btn.first().isVisible())) {
        ctx.emit('upload', 10, `${label}: role-based ditemukan "${text}"`);
        return btn.first();
      }
    } catch (_) { /* lanjut */ }
  }

  // 2. Text-based: cari teks lalu klik parent/ancestor yang clickable
  for (const text of labelTexts) {
    try {
      const el = page.getByText(text, { exact: false });
      if ((await el.count()) > 0 && (await el.first().isVisible())) {
        // Coba klik teks langsung dulu (bisa jadi <button> atau <a>)
        ctx.emit('upload', 10, `${label}: text-based ditemukan "${text}"`);
        return el.first();
      }
    } catch (_) { /* lanjut */ }
  }

  // 3. Fallback: CSS selector (sekarang menggunakan :has-text, bukan nth-child)
  const robustSelector = (selectors.robustUploadSelectors && selectors.robustUploadSelectors[typeKey]) || cssSelector;
  ctx.emit('upload', 10, `${label}: fallback ke CSS selector`);
  await page.waitForSelector(robustSelector, { state: 'visible', timeout: config.AUTOMATION.pageTimeout });
  return page.locator(robustSelector).first();
}

/**
 * Upload file dengan klik tombol lalu isi input[type=file] via filechooser.
 * Punya retry jika step tertentu gagal (browser crash, timeout, dll).
 */
async function clickAndUpload(page, cssSelector, filePath, ctx, label, typeKey) {
  const maxRetry = config.AUTOMATION.maxRetries || 1;

  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      ctx.emit('upload', 0, `${label}: mencari tombol upload...`);

      // Ambil label teks untuk role-based fallback
      const labelTexts = (selectors.uploadButtonLabels && selectors.uploadButtonLabels[typeKey]) || [];

      const btn = await findUploadButton(page, cssSelector, labelTexts, ctx, label, typeKey);
      ctx.emit('upload', 20, `${label}: membuka file picker...`);

      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: config.AUTOMATION.uploadTimeout }),
        btn.click(),
      ]);
      ctx.emit('upload', 40, `${label}: mengirim file...`);
      await fileChooser.setFiles(filePath);
      ctx.emit('upload', 60, `${label}: file terkirim, menunggu proses...`);
      await sleep(2500);
      ctx.emit('upload', 100, `${label}: selesai`);
      return; // sukses, keluar dari retry loop
    } catch (err) {
      const isCrash = (err.message || '').includes('Target crashed') ||
                      (err.message || '').includes('Target closed') ||
                      (err.message || '').includes('Browser closed');
      if (attempt < maxRetry && isCrash) {
        ctx.emit('upload', 0, `${label}: target crashed, mencoba ulang (${attempt + 1}/${maxRetry})...`);
        await sleep(3000);
        continue;
      }
      throw err;
    }
  }
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
 * Auto-detect input nama export.
 * Coba role-based (label "Export Name" / "File Name") dulu, fallback ke CSS.
 */
async function fillExportName(page, exportName, ctx) {
  ctx.emit('naming', 0, 'Mencari input nama export...');

  // Coba role-based: cari input yang associated label-nya mengandung teks tertentu
  const nameLabels = ['Export Name', 'File Name', 'Filename', 'Name', 'Nama', 'Export'];
  for (const lbl of nameLabels) {
    try {
      // Cari label lalu ambil input terkait
      const label = page.getByText(lbl, { exact: false }).first();
      if ((await label.count()) > 0 && (await label.isVisible())) {
        // Cari input di parent yang sama atau sibling berikutnya
        const parent = label.locator('..');
        if ((await parent.count()) > 0) {
          const input = parent.locator('input').first();
          if ((await input.count()) > 0 && (await input.isVisible())) {
            await input.fill(exportName);
            ctx.emit('naming', 100, `Nama diisi (role-based "${lbl}"): ${exportName}`);
            return;
          }
        }
      }
    } catch (_) { /* lanjut */ }
  }

  // Fallback ke CSS selector
  ctx.emit('naming', 50, 'Fallback ke CSS selector...');
  await page.waitForSelector(selectors.exportNameInput, { state: 'visible', timeout: config.AUTOMATION.pageTimeout });
  await page.fill(selectors.exportNameInput, exportName);
  ctx.emit('naming', 100, `Nama diisi: ${exportName}`);
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
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--disable-gpu',             // stabil di headless Linux tanpa GPU
      '--no-sandbox',               // diperlukan di banyak VPS Linux
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',    // hindari crash karena /dev/shm kecil di VPS
      '--disable-software-rasterizer', // hindari crash GPU di headless
      '--disable-extensions',       // kurangi memory usage
      '--js-flags=--max-old-space-size=512', // limit JS heap, kurangi OOM crash
      '--single-process',           // kurangi proses anak (hemat memory)
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },  // resolusi lebih kecil = lebih hemat memory
    acceptDownloads: true,
  });

  try {
    // 1. Buka URL
    ctx.emit('navigate', 0, `Membuka ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: AUTOMATION.pageTimeout });
    // Tunggu app React selesai render (library-panel = sidebar sudah muncul)
    await waitForAppReady(page, ctx);
    ctx.emit('navigate', 100, 'Halaman siap');

    // 2. Upload preset
    await clickAndUpload(page, selectors.uploadPresetButton, job.preset, ctx, 'Preset', 'preset');

    // 3. Upload audio
    await clickAndUpload(page, selectors.uploadAudioButton, job.audio, ctx, 'Audio', 'audio');

    // 4. Upload image ATAU video
    if (job.mediaType === 'image' && job.mediaPath) {
      await clickAndUpload(page, selectors.uploadImageButton, job.mediaPath, ctx, 'Image', 'image');
    } else if (job.mediaType === 'video' && job.mediaPath) {
      await clickAndUpload(page, selectors.uploadVideoButton, job.mediaPath, ctx, 'Video', 'video');
    }

    // 5. Isi nama export
    await fillExportName(page, job.exportName, ctx);

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
