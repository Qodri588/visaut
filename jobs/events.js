'use strict';
/**
 * events.js — event hub untuk progress job.
 * Queue/scheduler emit event lewat sini, lalu server.js subscribe
 * untuk broadcast ke semua WebSocket client.
 */
const { EventEmitter } = require('events');

const hub = new EventEmitter();
hub.setMaxListeners(100);

module.exports = hub;
