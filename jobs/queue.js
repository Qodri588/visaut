'use strict';
/**
 * queue.js — job queue + worker pool (max N paralel).
 *
 * Job lifecycle:
 *   queued → running → (done | failed | cancelled)
 *
 * Setiap job punya:
 *   { id, createdAt, status, params, currentStage, percent, message, log[], result, error, startedAt, endedAt }
 *
 * Progress di-emit lewat events hub:
 *   hub.emit('job:progress', { id, stage, percent, message })
 *   hub.emit('job:status',   { id, status, ...job })
 */
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { runAutomation } = require('../automation/runner');
const hub = require('./events');

const jobs = new Map(); // id -> job
const waiting = []; // antrian job id
let activeCount = 0;

/** Buat context emit untuk 1 job */
function makeCtx(job) {
  return {
    emit(stage, percent, message, data) {
      job.currentStage = stage;
      job.percent = Math.round(percent);
      if (message) job.message = message;
      job.log.push({ t: Date.now(), stage, percent: job.percent, message, data });
      hub.emit('job:progress', {
        id: job.id,
        stage,
        percent: job.percent,
        message,
        data,
      });
    },
  };
}

/** Tambah job baru ke antrian */
function enqueue(params) {
  const id = 'job_' + crypto.randomBytes(6).toString('hex');
  const job = {
    id,
    createdAt: Date.now(),
    startedAt: null,
    endedAt: null,
    status: 'queued',
    params,
    currentStage: null,
    percent: 0,
    message: 'Menunggu giliran...',
    log: [],
    result: null,
    error: null,
  };
  jobs.set(id, job);
  waiting.push(id);
  hub.emit('job:status', serializeJob(job));
  pump();
  return job;
}

/** Jadwalkan eksekusi job berikutnya jika slot tersedia */
function pump() {
  while (activeCount < config.AUTOMATION.maxParallel && waiting.length > 0) {
    const id = waiting.shift();
    const job = jobs.get(id);
    if (!job || job.status === 'cancelled') continue;
    activeCount++;
    runJob(job).catch((err) => {
      // safety net: seharusnya sudah ditangani di runJob
      console.error('Unhandled job error:', err);
    });
  }
}

/** Jalankan 1 job end-to-end */
async function runJob(job) {
  job.status = 'running';
  job.startedAt = Date.now();
  job.message = 'Mulai...';
  hub.emit('job:status', serializeJob(job));

  const ctx = makeCtx(job);
  try {
    const result = await runAutomation(job.params, ctx);
    job.status = 'done';
    job.percent = 100;
    job.message = 'Selesai';
    job.result = result;
    job.endedAt = Date.now();
    hub.emit('job:status', serializeJob(job));
  } catch (err) {
    job.status = 'failed';
    job.error = err && err.message ? err.message : String(err);
    job.message = 'Error: ' + job.error;
    job.endedAt = Date.now();
    hub.emit('job:status', serializeJob(job));
    console.error(`Job ${job.id} failed:`, err);
  } finally {
    activeCount--;
    pump();
  }
}

/** Batalkan job (queued: langsung; running: hanya menandai, flow tetap jalan) */
function cancel(id) {
  const job = jobs.get(id);
  if (!job) return null;
  if (job.status === 'queued') {
    job.status = 'cancelled';
    job.endedAt = Date.now();
    hub.emit('job:status', serializeJob(job));
  } else if (job.status === 'running') {
    // Tidak bisa benar-benar membunuh browser dari sini tanpa ref;
    // tandai sebagai request cancel
    job.message = 'Pembatalan diminta (akan berhenti setelah langkah saat ini)';
    hub.emit('job:status', serializeJob(job));
  }
  return serializeJob(job);
}

function get(id) {
  const j = jobs.get(id);
  return j ? serializeJob(j) : null;
}

function list() {
  return Array.from(jobs.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(serializeJob);
}

function serializeJob(j) {
  // Hindari kirim data besar ke client
  return {
    id: j.id,
    status: j.status,
    currentStage: j.currentStage,
    percent: j.percent,
    message: j.message,
    params: j.params,
    error: j.error,
    result: j.result,
    createdAt: j.createdAt,
    startedAt: j.startedAt,
    endedAt: j.endedAt,
    // batasi log ke 200 entry terakhir
    log: j.log.slice(-200),
  };
}

/** Hapus job dari memori (untuk cleanup UI) */
function remove(id) {
  const j = jobs.get(id);
  if (!j) return false;
  if (j.status === 'running' || j.status === 'queued') return false;
  jobs.delete(id);
  return true;
}

module.exports = { enqueue, cancel, get, list, remove };
