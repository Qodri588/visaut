/* app.js — frontend logic untuk file manager + job runner */
'use strict';

const API = '/api';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------- State ---------- */
const state = {
  currentDir: 'presets',   // relatif dari storage
  jobs: new Map(),         // id -> job
  pickTarget: null,        // 'preset' | 'audio' | 'media'
  mediaType: 'none',
};

/* ---------- Utils ---------- */
function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || ('HTTP ' + res.status));
  }
  return data;
}

function fmtTime(ms) {
  if (!ms) return '-';
  const d = new Date(ms);
  return d.toLocaleTimeString();
}

/** Format durasi ms → "1h 5m 12s" / "3m 12s" / "45s" */
function fmtElapsed(ms) {
  if (!ms || ms < 0) return '-';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/** Hitung elapsed berdasar status job */
function elapsedOf(j) {
  if (!j.startedAt) return null;
  if (j.status === 'running') return Date.now() - j.startedAt;
  if (j.endedAt) return j.endedAt - j.startedAt;
  return null;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function iconFor(name, type) {
  if (type === 'dir') return '📁';
  const ext = name.split('.').pop().toLowerCase();
  if (['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac'].includes(ext)) return '🎵';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) return '🖼';
  if (['mp4', 'webm', 'mkv', 'mov', 'avi'].includes(ext)) return '🎥';
  if (['json', 'preset'].includes(ext)) return '⚙';
  return '📄';
}

/* ---------- File Manager ---------- */
async function loadDir(dir = state.currentDir) {
  state.currentDir = dir;
  try {
    const data = await api('/files?dir=' + encodeURIComponent(dir));
    renderBreadcrumb(dir);
    renderFileList(data.items, dir);
  } catch (e) {
    toast('Gagal load: ' + e.message, 'err');
  }
}

function renderBreadcrumb(dir) {
  const parts = dir.split('/').filter(Boolean);
  let html = `<a data-dir="">🏠 root</a>`;
  let acc = '';
  for (const p of parts) {
    acc += (acc ? '/' : '') + p;
    html += ` / <a data-dir="${escapeHtml(acc)}">${escapeHtml(p)}</a>`;
  }
  $('#breadcrumb').innerHTML = html;
  $$('#breadcrumb a').forEach((a) => {
    a.addEventListener('click', () => loadDir(a.dataset.dir));
  });
}

function renderFileList(items, dir) {
  const list = $('#fileList');
  if (!items.length) {
    list.innerHTML = `<li class="empty">Folder kosong. Upload file atau buat folder.</li>`;
    return;
  }
  list.innerHTML = items.map((it) => `
    <li class="fileitem" data-path="${escapeHtml(it.path)}" data-type="${it.type}">
      <span class="icon">${iconFor(it.name, it.type)}</span>
      <span class="name">${escapeHtml(it.name)}</span>
      <span class="meta">${it.type === 'file' ? it.sizeHuman : ''}</span>
      <span class="row-actions">
        ${it.type === 'file' ? `<a class="btn btn-sm" href="${API}/files/download?path=${encodeURIComponent(it.path)}" target="_blank">⬇</a>` : ''}
        <button class="btn btn-sm" data-act="rename">✎</button>
        <button class="btn btn-sm" data-act="delete">🗑</button>
      </span>
    </li>
  `).join('');

  $$('.fileitem', list).forEach((li) => {
    li.addEventListener('click', (e) => {
      if (e.target.closest('[data-act]') || e.target.closest('a')) return;
      const t = li.dataset.type;
      const p = li.dataset.path;
      if (t === 'dir') loadDir(p);
    });
    $$('[data-act]', li).forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const act = btn.dataset.act;
        const p = li.dataset.path;
        if (act === 'delete') {
          if (!confirm('Hapus "' + p + '"?')) return;
          try {
            await fetch(API + '/files?path=' + encodeURIComponent(p), { method: 'DELETE' });
            toast('Dihapus', 'ok');
            loadDir();
          } catch (err) { toast(err.message, 'err'); }
        } else if (act === 'rename') {
          const np = prompt('Nama baru:', p.split('/').pop());
          if (!np) return;
          const to = p.split('/').slice(0, -1).concat(np).join('/');
          try {
            await api('/files/rename', {
              method: 'POST',
              body: JSON.stringify({ from: p, to }),
            });
            loadDir();
          } catch (err) { toast(err.message, 'err'); }
        }
      });
    });
  });
}

// Category tabs
$$('#catTabs .cat-tab').forEach((b) => {
  b.addEventListener('click', () => {
    $$('#catTabs .cat-tab').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    loadDir(b.dataset.dir);
  });
});

// Upload
$('#btnUpload').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', async (e) => {
  const files = e.target.files;
  if (!files.length) return;
  const fd = new FormData();
  for (const f of files) fd.append('file', f);
  fd.append('targetDir', state.currentDir);
  try {
    toast('Uploading ' + files.length + ' file...');
    const res = await fetch(API + '/files/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.error || 'Upload gagal');
    toast('Upload selesai: ' + (data.saved.length) + ' file', 'ok');
    loadDir();
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    e.target.value = '';
  }
});

// Mkdir
$('#btnMkdir').addEventListener('click', async () => {
  const name = prompt('Nama folder baru:');
  if (!name) return;
  const target = state.currentDir ? (state.currentDir + '/' + name) : name;
  try {
    await api('/files/mkdir', { method: 'POST', body: JSON.stringify({ path: target }) });
    loadDir();
  } catch (e) { toast(e.message, 'err'); }
});

// Refresh
$('#btnRefresh').addEventListener('click', () => loadDir());

/* ---------- File picker (modal) ---------- */
function openPicker(target) {
  state.pickTarget = target;
  const titles = {
    preset: 'Pilih file PRESET',
    audio: 'Pilih file AUDIO',
    media: 'Pilih file IMAGE/VIDEO',
  };
  $('#pickerTitle').textContent = titles[target] || 'Pilih file';
  $('#pickerModal').hidden = false;
  renderPicker(target);
}

async function renderPicker(target) {
  // Tentukan folder default tiap target
  const dirMap = { preset: 'presets', audio: 'audio', media: 'media' };
  const list = $('#pickerList');
  list.innerHTML = '<li class="empty">Memuat...</li>';
  try {
    const data = await api('/files?dir=' + (dirMap[target] || ''));
    const files = data.items.filter((i) => i.type === 'file');
    if (!files.length) {
      list.innerHTML = '<li class="empty">Belum ada file. Upload dulu via File Manager.</li>';
      return;
    }
    list.innerHTML = files.map((f) => `
      <li class="picker-item" data-path="${escapeHtml(f.path)}">
        <span class="icon">${iconFor(f.name, 'file')}</span>
        <span class="name">${escapeHtml(f.name)}</span>
        <span class="meta">${f.sizeHuman}</span>
      </li>
    `).join('');
    $$('.picker-item', list).forEach((li) => {
      li.addEventListener('click', () => {
        const p = li.dataset.path;
        if (target === 'preset') $('#jobPreset').value = p;
        else if (target === 'audio') $('#jobAudio').value = p;
        else if (target === 'media') $('#jobMedia').value = p;
        $('#pickerModal').hidden = true;
      });
    });
  } catch (e) {
    list.innerHTML = '<li class="empty">Error: ' + escapeHtml(e.message) + '</li>';
  }
}

$('#pickerClose').addEventListener('click', () => $('#pickerModal').hidden = true);

$$('[data-pick]').forEach((b) => {
  b.addEventListener('click', () => openPicker(b.dataset.pick));
});

/* ---------- Media type seg ---------- */
$$('#mediaTypeSeg .seg-btn').forEach((b) => {
  b.addEventListener('click', () => {
    $$('#mediaTypeSeg .seg-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    state.mediaType = b.dataset.mt;
    $('#mediaPick').style.display = state.mediaType === 'none' ? 'none' : 'flex';
    if (state.mediaType === 'none') $('#jobMedia').value = '';
  });
});

/* ---------- Job runner ---------- */
$('#btnRunJob').addEventListener('click', async () => {
  const preset = $('#jobPreset').value;
  const audio = $('#jobAudio').value;
  const exportName = $('#jobName').value.trim();
  const mediaType = state.mediaType === 'none' ? null : state.mediaType;
  const mediaPath = $('#jobMedia').value || null;

  if (!preset) return toast('Preset wajib dipilih', 'err');
  if (!audio) return toast('Audio wajib dipilih', 'err');
  if (!exportName) return toast('Nama export wajib diisi', 'err');
  if (mediaType && !mediaPath) return toast('File media wajib dipilih', 'err');

  try {
    const data = await api('/jobs', {
      method: 'POST',
      body: JSON.stringify({ preset, audio, mediaType, mediaPath, exportName }),
    });
    toast('Job dibuat: ' + data.job.id, 'ok');
    upsertJob(data.job);
    // reset sebagian
    $('#jobName').value = '';
  } catch (e) {
    toast(e.message, 'err');
  }
});

/* ---------- Jobs render ---------- */
function upsertJob(job) {
  state.jobs.set(job.id, Object.assign(state.jobs.get(job.id) || {}, job));
  renderJobs();
}

function renderJobs() {
  const list = $('#jobList');
  const jobs = Array.from(state.jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
  if (!jobs.length) {
    list.innerHTML = '<div class="empty">Belum ada job. Buat dari panel "Buat Job".</div>';
    return;
  }
  list.innerHTML = jobs.map(jobCardHtml).join('');

  $$('.job-card', list).forEach((card) => {
    const id = card.dataset.id;
    $$('[data-act]', card).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        if (act === 'cancel') {
          try { await api('/jobs/' + id + '/cancel', { method: 'POST' }); } catch (e) { toast(e.message, 'err'); }
        } else if (act === 'remove') {
          try {
            await fetch(API + '/jobs/' + id, { method: 'DELETE' });
            state.jobs.delete(id);
            renderJobs();
          } catch (e) { toast(e.message, 'err'); }
        } else if (act === 'log') {
          showLog(state.jobs.get(id));
        }
      });
    });
  });
}

function jobCardHtml(j) {
  const stageLabel = {
    browser: 'Browser', navigate: 'Navigasi', upload: 'Upload',
    naming: 'Nama', 'export-click': 'Export', download: 'Download',
    closing: 'Tutup browser', convert: 'Convert',
  }[j.currentStage] || (j.currentStage ? j.currentStage : '-');

  return `
  <div class="job-card" data-id="${escapeHtml(j.id)}">
    <div class="job-card-head">
      <div>
        <div class="name">${escapeHtml(j.params.exportName)}</div>
        <div class="id">${escapeHtml(j.id)} · ${fmtTime(j.createdAt)}${j.startedAt ? ` · <span class="elapsed" id="elapsed-${escapeHtml(j.id)}">⏱ ${fmtElapsed(elapsedOf(j))}</span>` : ''}</div>
      </div>
      <span class="badge badge-${escapeHtml(j.status)}">${escapeHtml(j.status)}</span>
    </div>
    <div class="job-bar"><div style="width:${j.percent || 0}%"></div></div>
    <div class="job-msg">
      <span><span class="job-stage">${escapeHtml(stageLabel)}</span> · ${escapeHtml(j.message || '')}</span>
      <span>${j.percent || 0}%</span>
    </div>
    <div class="job-actions">
      <button class="btn btn-sm" data-act="log">📄 Log</button>
      ${(j.status === 'queued' || j.status === 'running')
        ? `<button class="btn btn-sm btn-danger" data-act="cancel">✕ Batalkan</button>`
        : `<button class="btn btn-sm" data-act="remove">🗑 Hapus</button>`}
    </div>
  </div>`;
}

function showLog(job) {
  if (!job) return;
  $('#logJobId').textContent = job.id;
  const lines = (job.log || []).map((l) =>
    `[${new Date(l.t).toLocaleTimeString()}] [${l.stage}] ${l.percent}% ${l.message || ''}`
  ).join('\n');
  $('#logBody').textContent = lines || '(log kosong)';
  $('#logModal').hidden = false;
}
$('#logClose').addEventListener('click', () => $('#logModal').hidden = true);

$('#btnClearJobs').addEventListener('click', async () => {
  for (const [id, j] of state.jobs) {
    if (j.status === 'done' || j.status === 'failed' || j.status === 'cancelled') {
      try { await fetch(API + '/jobs/' + id, { method: 'DELETE' }); } catch (_) {}
      state.jobs.delete(id);
    }
  }
  renderJobs();
});

/* ---------- WebSocket progress ---------- */
// Update elapsed timer tiap 1 detik untuk job yang sedang running
setInterval(() => {
  let changed = false;
  for (const [id, j] of state.jobs) {
    if (j.status === 'running' && j.startedAt) {
      const el = document.getElementById('elapsed-' + id);
      if (el) {
        el.textContent = '⏱ ' + fmtElapsed(elapsedOf(j));
        changed = true;
      }
    }
  }
}, 1000);

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(proto + '//' + location.host + '/ws');

  ws.addEventListener('open', () => {
    $('#wsStatus').textContent = '● online';
    $('#wsStatus').className = 'pill pill-on';
  });
  ws.addEventListener('close', () => {
    $('#wsStatus').textContent = '● offline (reconnect...)';
    $('#wsStatus').className = 'pill pill-off';
    setTimeout(connectWS, 2000);
  });
  ws.addEventListener('error', () => ws.close());

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'job:status') {
      upsertJob(msg.job);
    } else if (msg.type === 'job:progress') {
      const existing = state.jobs.get(msg.id);
      if (existing) {
        existing.percent = msg.percent;
        existing.currentStage = msg.stage;
        existing.message = msg.message;
        // tambah ke log
        existing.log = existing.log || [];
        existing.log.push({ t: Date.now(), stage: msg.stage, percent: msg.percent, message: msg.message });
        renderJobs();
      }
    }
  });
}

/* ---------- Init ---------- */
(async function init() {
  try {
    const h = await api('/health');
    $('#serverInfo').textContent = `${h.platform} · node ${h.node} · paralel ${h.maxParallel}`;
  } catch (_) { /* ignore */ }

  await loadDir('presets');
  renderJobs();

  // Load jobs existing
  try {
    const data = await api('/jobs');
    (data.jobs || []).forEach(upsertJob);
  } catch (_) {}

  connectWS();
})();
