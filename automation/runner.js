'use strict';
/**
 * runner.js — orkestrasi 1 job automation end-to-end.
 *
 * MEKANISME EXPORT:
 *   - Klik tombol "Export" (header) → mulai render real-time pakai MediaRecorder.
 *   - Render berlangsung selama durasi audio (real-time recording canvas).
 *   - Setelah selesai, app langsung trigger download via <a download>.click()
 *     (blob URL), TANPA dialog pilih lokasi file lagi. Kita pakai
 *     Playwright download event (acceptDownloads: true) + download.saveAs().
 *
 * SELECTOR STRATEGY (3-tier, robust):
 *   1. data-testid locator — paling stabil, kita tambahkan di source web
 *   2. Role-based locator (getByRole) — fallback kedua
 *   3. Text-based / CSS :has-text() — fallback terakhir
 *
 * FLOW YANG BENAR (sesuai struktur web app):
 *   1. Buka halaman → tunggu ready
 *   2. Upload preset via input[type=file] langsung (bypass klik button)
 *   3. Pindah ke tab "Media" (kalau belum di tab media)
 *   4. Upload audio via file input langsung
 *   5. Upload image/video (opsional) via file input langsung
 *   6. Isi nama export di inspector panel
 *   7. Klik Export → tunggu render + download .webm
 *   8. Tutup browser
 *
 * @param {object} job  { id, preset, audio, mediaType, mediaPath, exportName }
 * @param {object} ctx  { emit }  emit(stage, percent, message, data)
 */
const path = require('path');
const fs = require('fs');
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
  try {
    await page.waitForSelector('aside.library-panel', { state: 'attached', timeout: config.AUTOMATION.pageTimeout });
  } catch (_) {
    ctx.emit('navigate', 50, 'Warning: library-panel tidak ditemukan, coba lanjut...');
  }
  // Tunggu tambahan untuk React hydration & lazy-load
  await sleep(2000);
}

/**
 * Cari elemen dengan strategi 3-tier:
 *   1. data-testid (paling stabil)
 *   2. Role-based (getByRole)
 *   3. Text-based (getByText)
 *
 * @param {import('playwright').Page} page
 * @param {string|null} testId  data-testid value (tanpa bracket)
 * @param {string[]} roleTexts  teks kandidat untuk getByRole
 * @param {Function|null} roleType  'button' | 'link' | null
 * @param {string|null} cssFallback  CSS selector fallback terakhir
 * @returns {import('playwright').Locator}
 */
async function findElement(page, testId, roleTexts, roleType, cssFallback, ctx, label) {
  // Tier 1: data-testid
  if (testId) {
    try {
      const el = page.locator(`[data-testid="${testId}"]`);
      if ((await el.count()) > 0 && (await el.first().isVisible())) {
        ctx.emit('navigate', 5, `${label}: ditemukan via data-testid "${testId}"`);
        return el.first();
      }
    } catch (_) { /* lanjut ke tier berikutnya */ }
  }

  // Tier 2: Role-based
  if (roleTexts && roleType) {
    for (const text of roleTexts) {
      try {
        const el = page.getByRole(roleType, { name: text, exact: false });
        if ((await el.count()) > 0 && (await el.first().isVisible())) {
          ctx.emit('navigate', 5, `${label}: ditemukan via role "${text}"`);
          return el.first();
        }
      } catch (_) { /* lanjut */ }
    }
  }

  // Tier 3: Text-based
  if (roleTexts) {
    for (const text of roleTexts) {
      try {
        const el = page.getByText(text, { exact: false });
        if ((await el.count()) > 0 && (await el.first().isVisible())) {
          ctx.emit('navigate', 5, `${label}: ditemukan via text "${text}"`);
          return el.first();
        }
      } catch (_) { /* lanjut */ }
    }
  }

  // Tier 4: CSS fallback
  if (cssFallback) {
    ctx.emit('navigate', 5, `${label}: fallback ke CSS selector`);
    await page.waitForSelector(cssFallback, { state: 'visible', timeout: config.AUTOMATION.pageTimeout });
    return page.locator(cssFallback).first();
  }

  throw new Error(`Elemen "${label}" tidak ditemukan (semua strategi gagal)`);
}

/**
 * Pindah ke tab tertentu di toolrail sidebar.
 * Cek dulu apakah tab sudah aktif (class "active").
 */
async function switchToTab(page, tabName, ctx) {
  ctx.emit('navigate', 2, `Memastikan tab "${tabName}" aktif...`);
  const testId = selectors.tabButtons[tabName];
  if (!testId) {
    ctx.emit('navigate', 2, `Tab "${tabName}" tidak dikenali, skip`);
    return;
  }

  try {
    const tabBtn = page.locator(testId).first();
    // Cek apakah tab sudah aktif
    const isActive = await tabBtn.evaluate(el => el.classList.contains('active'));
    if (isActive) {
      ctx.emit('navigate', 3, `Tab "${tabName}" sudah aktif`);
      return;
    }
    ctx.emit('navigate', 5, `Klik tab "${tabName}"...`);
    await tabBtn.click();
    await sleep(500); // tunggu React re-render
    ctx.emit('navigate', 5, `Tab "${tabName}" aktif`);
  } catch (_) {
    // Fallback: coba via teks
    const labelText = selectors.tabLabels[tabName];
    if (labelText) {
      try {
        const tabBtn = page.locator(`nav.toolrail button:has-text("${labelText}")`).first();
        await tabBtn.click();
        await sleep(500);
      } catch (_2) {
        ctx.emit('navigate', 2, `Warning: tidak bisa pindah ke tab "${tabName}"`);
      }
    }
  }
}

/**
 * Upload file dengan 2 metode:
 *   METODE A (utama): Langsung setFiles() pada input[type=file] tersembunyi.
 *                     Tidak perlu klik button → lebih cepat dan stabil.
 *   METODE B (fallback): Klik button → tunggu filechooser → setFiles().
 */
async function uploadFile(page, testId, filePath, ctx, label) {
  const maxRetry = config.AUTOMATION.maxRetries || 1;

  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      ctx.emit('upload', 0, `${label}: memulai upload...`);

      // METODE A: langsung ke input[type=file] via data-testid
      const inputTestId = selectors.fileInputs[testId];
      if (inputTestId) {
        try {
          const fileInput = page.locator(inputTestId).first();
          if ((await fileInput.count()) > 0) {
            ctx.emit('upload', 20, `${label}: upload via input langsung (metode A)...`);
            await fileInput.setInputFiles(filePath);
            ctx.emit('upload', 60, `${label}: file terkirim, menunggu proses...`);
            await sleep(2500);
            ctx.emit('upload', 100, `${label}: selesai (metode A)`);
            return;
          }
        } catch (errA) {
          ctx.emit('upload', 10, `${label}: metode A gagal (${errA.message.slice(0, 80)}), coba metode B...`);
        }
      }

      // METODE B: klik button → filechooser dialog
      ctx.emit('upload', 20, `${label}: upload via button + filechooser (metode B)...`);
      const btnTestIdMap = {
        audio: 'btn-import-audio',
        cover: 'btn-import-cover',
        images: 'btn-import-images',
        videos: 'btn-import-videos',
      };
      const btnTestId = btnTestIdMap[testId];
      const btn = await findElement(page, btnTestId, null, null, null, ctx, `${label} button`);

      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: config.AUTOMATION.uploadTimeout }),
        btn.click(),
      ]);
      ctx.emit('upload', 40, `${label}: file chooser terbuka, mengirim file...`);
      await fileChooser.setFiles(filePath);
      ctx.emit('upload', 60, `${label}: file terkirim, menunggu proses...`);
      await sleep(2500);
      ctx.emit('upload', 100, `${label}: selesai (metode B)`);
      return; // sukses
    } catch (err) {
      const msg = err.message || '';
      const isCrash = msg.includes('Target crashed') ||
                      msg.includes('Target closed') ||
                      msg.includes('Browser closed');
      if (attempt < maxRetry && isCrash) {
        ctx.emit('upload', 0, `${label}: target crashed, retry (${attempt + 1}/${maxRetry})...`);
        await sleep(3000);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Upload preset (file .json) via tombol Open di header.
 * Preset = project file yang di-load.
 */
async function uploadPreset(page, filePath, ctx) {
  ctx.emit('upload', 0, 'Preset: memulai upload...');
  const maxRetry = config.AUTOMATION.maxRetries || 1;

  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      // Coba metode A: langsung set input file project
      const inputTestId = selectors.fileInputs.project;
      try {
        const fileInput = page.locator(inputTestId).first();
        if ((await fileInput.count()) > 0) {
          ctx.emit('upload', 20, 'Preset: upload via input langsung...');
          await fileInput.setInputFiles(filePath);
          ctx.emit('upload', 60, 'Preset: file terkirim, menunggu load...');
          await sleep(3000);
          ctx.emit('upload', 100, 'Preset: selesai');
          return;
        }
      } catch (_) { /* fallback ke klik button */ }

      // Metode B: klik tombol "Open" → filechooser
      ctx.emit('upload', 20, 'Preset: klik tombol Open...');
      const btn = await findElement(
        page, 'btn-open-project',
        ['Open', 'Load', 'Import Preset'], 'button',
        selectors.fallbackSelectors.preset,
        ctx, 'Preset'
      );

      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: config.AUTOMATION.uploadTimeout }),
        btn.click(),
      ]);
      ctx.emit('upload', 40, 'Preset: file chooser terbuka, mengirim file...');
      await fileChooser.setFiles(filePath);
      ctx.emit('upload', 60, 'Preset: file terkirim, menunggu load...');
      await sleep(3000);
      ctx.emit('upload', 100, 'Preset: selesai');
      return;
    } catch (err) {
      const msg = err.message || '';
      const isCrash = msg.includes('Target crashed') || msg.includes('Target closed');
      if (attempt < maxRetry && isCrash) {
        ctx.emit('upload', 0, `Preset: crash, retry (${attempt + 1}/${maxRetry})...`);
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

  // Tier 1: data-testid
  try {
    const btn = page.locator(selectors.exportButton).first();
    if ((await btn.count()) > 0 && (await btn.isVisible())) {
      ctx.emit('export-click', 50, 'Tombol export ditemukan via data-testid');
      await btn.click();
      ctx.emit('export-click', 100, 'Tombol Export diklik, render dimulai');
      return;
    }
  } catch (_) { /* fallback */ }

  // Tier 2: role-based
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

  // Tier 3: scan semua button
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
 * Isi nama export di inspector panel.
 */
async function fillExportName(page, exportName, ctx) {
  ctx.emit('naming', 0, 'Mencari input nama export...');

  // Tier 1: data-testid
  try {
    const input = page.locator(selectors.exportNameInput).first();
    if ((await input.count()) > 0 && (await input.isVisible())) {
      await input.click();
      await input.fill('');
      await input.fill(exportName);
      ctx.emit('naming', 100, `Nama diisi via data-testid: ${exportName}`);
      return;
    }
  } catch (_) { /* fallback */ }

  // Tier 2: role-based (cari label "File name" lalu input terkait)
  for (const lbl of selectors.exportNameLabels) {
    try {
      const label = page.getByText(lbl, { exact: false }).first();
      if ((await label.count()) > 0 && (await label.isVisible())) {
        const parent = label.locator('..');
        if ((await parent.count()) > 0) {
          const input = parent.locator('input').first();
          if ((await input.count()) > 0 && (await input.isVisible())) {
            await input.click();
            await input.fill('');
            await input.fill(exportName);
            ctx.emit('naming', 100, `Nama diisi (role-based "${lbl}"): ${exportName}`);
            return;
          }
        }
      }
    } catch (_) { /* lanjut */ }
  }

  // Tier 3: CSS fallback
  ctx.emit('naming', 50, 'Fallback ke CSS selector...');
  const fallbackSel = 'aside.inspector-panel input[type="text"], aside.inspector-panel input:not([type]), aside.inspector-panel input.text-control';
  await page.waitForSelector(fallbackSel, { state: 'visible', timeout: config.AUTOMATION.pageTimeout });
  await page.fill(fallbackSel, exportName);
  ctx.emit('naming', 100, `Nama diisi: ${exportName}`);
}

/**
 * Tunggu hasil render + download .webm.
 * Andalkan Playwright download event — app langsung trigger
 * download via <a download>.click() (tanpa dialog pilih lokasi).
 *
 * @returns {Promise<string>} path file .webm yang tersimpan
 */
async function waitForRenderAndDownload(page, ctx, targetDir) {
  ctx.emit('download', 0, 'Menunggu render selesai & download .webm...');
  const renderTimeoutMs = config.AUTOMATION.renderTimeout;

  // Polling progress setiap 10 detik selama menunggu download
  const progressInterval = setInterval(() => {
    ctx.emit('download', -1, `Masih menunggu render... (timeout: ${Math.round(renderTimeoutMs / 60000)} menit)`);
  }, 15000);

  try {
    const download = await page.waitForEvent('download', { timeout: renderTimeoutMs });
    clearInterval(progressInterval);

    const fname = download.suggestedFilename();
    ctx.emit('download', 50, `Download dimulai: ${fname}`);

    // Pastikan folder export ada
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const savePath = path.join(targetDir, fname);
    await download.saveAs(savePath);
    ctx.emit('download', 100, `Download tersimpan: ${savePath}`);
    return savePath;
  } catch (err) {
    clearInterval(progressInterval);
    throw err;
  }
}

/**
 * Verifikasi bahwa file yang diupload benar-benar ada dan valid.
 */
function validateFile(filePath) {
  if (!filePath) throw new Error('Path file kosong');
  if (!fs.existsSync(filePath)) throw new Error(`File tidak ditemukan: ${filePath}`);
  const stat = fs.statSync(filePath);
  if (stat.size === 0) throw new Error(`File kosong: ${filePath}`);
  return { size: stat.size, name: path.basename(filePath) };
}

/* ==================== MAIN AUTOMATION FLOW ==================== */

async function runAutomation(job, ctx) {
  const { FOLDERS, AUTOMATION, TARGET_URL } = config;
  ctx.emit('browser', 0, 'Menjalankan browser...');

  const browser = await chromium.launch({
    headless: AUTOMATION.headless,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-software-rasterizer',
      '--disable-extensions',
      '--js-flags=--max-old-space-size=512',
      '--single-process',
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
  });

  try {
    // Validasi file input sebelum mulai
    ctx.emit('validate', 0, 'Memvalidasi file input...');
    const presetInfo = validateFile(job.preset);
    const audioInfo = validateFile(job.audio);
    if (job.mediaPath) validateFile(job.mediaPath);
    ctx.emit('validate', 100, `File OK: preset(${presetInfo.name}), audio(${audioInfo.name})`);

    // 1. Buka URL
    ctx.emit('navigate', 0, `Membuka ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: AUTOMATION.pageTimeout });
    await waitForAppReady(page, ctx);
    ctx.emit('navigate', 100, 'Halaman siap');

    // 2. Upload preset (file .json project)
    await uploadPreset(page, job.preset, ctx);

    // 3. Pindah ke tab Media (pastikan panel media terlihat)
    await switchToTab(page, 'media', ctx);

    // 4. Upload audio
    await uploadFile(page, 'audio', job.audio, ctx, 'Audio');

    // 5. Upload image ATAU video (opsional)
    if (job.mediaType === 'image' && job.mediaPath) {
      // Image bisa di-upload sebagai "cover" atau "images" (background)
      // Coba sebagai images (background) dulu, fallback ke cover
      try {
        await uploadFile(page, 'images', job.mediaPath, ctx, 'Image (background)');
      } catch (_) {
        // Fallback: upload sebagai cover
        ctx.emit('upload', 0, 'Image: coba upload sebagai cover art...');
        await uploadFile(page, 'cover', job.mediaPath, ctx, 'Image (cover)');
      }
    } else if (job.mediaType === 'video' && job.mediaPath) {
      await uploadFile(page, 'videos', job.mediaPath, ctx, 'Video');
    }

    // 6. Tunggu sebentar agar semua asset ter-load
    ctx.emit('navigate', 0, 'Menunggu semua asset ter-load...');
    await sleep(2000);

    // 7. Isi nama export di inspector panel
    await fillExportName(page, job.exportName, ctx);

    // 8. Klik export → mulai render real-time
    await clickExportButton(page, ctx);

    // 9. Tunggu render + download .webm
    const webmPath = await waitForRenderAndDownload(page, ctx, FOLDERS.exports);

    // 10. Tutup browser
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
