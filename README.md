# Visual Automation App

Cross-platform (**Windows & Linux**) — File Manager + Browser Automation untuk
`https://visual.farishitam777.workers.dev/`.

## Fitur

1. **Web App File Manager** — kelola file/folder di dalam `storage/`:
   - Upload (multi-file), buat folder, rename, delete, download
   - Kategori: Preset, Audio, Media, Exports

2. **Automation Engine** (Playwright + Chromium):
   - Buka web app target → upload preset → upload audio → upload image/video
   - Isi nama export → auto-detect & klik tombol Export → tunggu download `.webm`
   - Tutup browser → convert `.webm` → `.mp4` (ffmpeg)

3. **Progress real-time** — WebSocket push ke UI, progress bar per-langkah + log

4. **Worker pool** — jalankan sampai **3 job paralel** (configurable), sisanya mengantri

## Instalasi

### Prasyarat
- **Node.js ≥ 18** (di mesin ini: Node 26)
- ffmpeg opsional — `ffmpeg-static` sudah bundle binary per-OS

### Langkah
```bash
npm install            # juga menjalankan: playwright install chromium
npm start              # atau: node server.js
```

Aplikasi otomatis membuka browser ke `http://localhost:3000`.

### Environment variables (opsional)
| Variabel     | Default | Keterangan                              |
|--------------|---------|-----------------------------------------|
| `PORT`       | 3000    | Port HTTP                               |
| `HOST`       | 0.0.0.0 | Bind host                               |
| `MAX_PARALLEL` | 3     | Job automation paralel maksimum         |
| `HEADED`     | unset   | Set `1` untuk lihat browser (debug)     |

## Menjalankan Job

1. Upload file lewat **File Manager** (atau drop file ke folder yang sesuai)
2. Di panel **Buat Job**: pilih preset + audio + (opsional image/video) + nama export
3. Klik **Jalankan Job**
4. Pantau progress di panel **Job & Progress** (klik **Log** untuk detail)
5. Output `.mp4` muncul di folder **Exports**

## Struktur

```
storage/
├── presets/   ← file .json/.preset
├── audio/     ← .mp3/.wav/...
├── media/     ← image & video
└── exports/   ← hasil .mp4 (+ .webm sumber)
```

## Edit selector

Jika UI web app target berubah, edit **`automation/selectors.js`** — tidak perlu
ubah kode lainnya.

## Troubleshooting

- **Tombol export tidak ditemukan** → tambah teks kandidat di `selectors.exportButtonTexts`
- **Upload gagal / timeout** → naikkan `AUTOMATION.uploadTimeout` di `config.js`
- **ffmpeg error** → pastikan `ffmpeg-static` ter-install atau ffmpeg ada di PATH
- **Mau lihat browser jalan** → `set HEADED=1` (Windows) / `HEADED=1` (Linux) lalu start
