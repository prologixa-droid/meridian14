(() => {
  'use strict';

  const APP = 'meridian-operations-workbench';
  const ASSIGNMENT = 'PT-100';
  const MAX_FILE_BYTES = 12 * 1024 * 1024;
  const KEYS = Object.freeze([
    'meridian-product-review-pt100-v3',
    'meridian-work-tickets-v2',
    'meridian-catalog-corrections-v2',
    'meridian-review-drafts-v1',
    'meridian-workspace-events-v1',
    'meridian-qa-patches-pt100-v2',
    'meridian-qa-runs-pt100-v2',
    'meridian-mock-interview-history-v1',
    'meridian-mock-interview-active-v1',
  ]);

  const $ = (selector) => document.querySelector(selector);
  const status = $('#workspaceStorageStatus');
  const fileInput = $('#workspaceBackupFile');
  const exportButton = $('#exportWorkspaceBackup');
  const importButton = $('#importWorkspaceBackup');
  if (!status || !fileInput || !exportButton || !importButton) return;

  const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const setStatus = (message, state = 'ready') => {
    status.textContent = message;
    status.dataset.state = state;
  };
  const record = (title, detail, state = 'Exported') => {
    window.MeridianWorkspace?.recordEvent('workspace', title, detail, state);
  };

  function refreshStorageStatus() {
    const probe = `meridian-storage-check-${Date.now()}`;
    try {
      localStorage.setItem(probe, 'ok');
      localStorage.removeItem(probe);
      setStatus('Browser storage passed a small write check. Work stays on this device; a full browser quota can still prevent saving.', 'ready');
    } catch {
      setStatus('Browser storage could not be confirmed. Download a backup if possible; unsaved work may not survive a reload.', 'warning');
    }
  }

  function collectBackup() {
    const data = {};
    let bytes = 0;
    for (const key of KEYS) {
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      bytes += new Blob([raw]).size;
      data[key] = raw;
    }
    return {
      app: APP,
      schemaVersion: 1,
      assignment: ASSIGNMENT,
      exportedAt: new Date().toISOString(),
      privacy: 'No authentication tokens, service credentials, or secrets are included.',
      data,
      byteCount: bytes,
    };
  }

  exportButton.addEventListener('click', () => {
    try {
      record('Workspace backup downloaded', 'Local training data export · credentials excluded');
      const backup = collectBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `meridian-${ASSIGNMENT}-workspace-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      setStatus(`Backup downloaded · ${Object.keys(backup.data).length} local data groups · credentials excluded.`, 'ready');
    } catch {
      setStatus('Backup could not be created. Check browser storage and available device space.', 'warning');
    }
  });

  importButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setStatus('This backup is larger than the 12 MB import limit.', 'warning');
      return;
    }

    let backup;
    try {
      backup = JSON.parse(await file.text());
      validateBackup(backup);
    } catch (error) {
      setStatus(error.message || 'This file is not a valid Meridian workspace backup.', 'warning');
      return;
    }

    const groups = Object.keys(backup.data);
    const date = backup.exportedAt ? new Date(backup.exportedAt).toLocaleString() : 'unknown date';
    const accepted = window.confirm(
      `Restore this PT-100 backup from ${date}?\n\n` +
      `All PT-100 workspace data groups in this browser will be replaced or reset to the backup state; groups absent from the file return to application defaults. ` +
      `Meridian sign-in settings are left untouched. The page will reload after restore.`
    );
    if (!accepted) return;

    try {
      replaceWorkspaceData(backup.data);
      record('Workspace backup restored', `${groups.length} local data groups restored · page reload required`, 'Restored');
      setStatus('Backup restored. Reloading the workspace…', 'ready');
      window.setTimeout(() => window.location.reload(), 250);
    } catch {
      setStatus('Restore could not be completed. Existing local data was preserved where the browser allowed rollback.', 'warning');
    }
  });

  function validateBackup(backup) {
    if (!plainObject(backup) || backup.app !== APP || backup.schemaVersion !== 1 || backup.assignment !== ASSIGNMENT || !plainObject(backup.data)) {
      throw new Error('This backup does not match the Meridian PT-100 format.');
    }
    const entries = Object.entries(backup.data);
    if (!entries.length) throw new Error('The backup contains no workspace data.');
    let bytes = 0;
    for (const [key, raw] of entries) {
      if (!KEYS.includes(key) || typeof raw !== 'string') throw new Error('The backup contains an unsupported data field.');
      bytes += new Blob([raw]).size;
      if (bytes > MAX_FILE_BYTES) throw new Error('The workspace data exceeds the 12 MB import limit.');
      let value;
      try { value = JSON.parse(raw); } catch { throw new Error(`The saved ${key} data is damaged.`); }
      if (!validDataForKey(key, value)) throw new Error(`The saved ${key} data has an unexpected structure.`);
    }
  }

  function validDataForKey(key, value) {
    if (key === 'meridian-product-review-pt100-v3') return plainObject(value) && Object.entries(value).every(([index, row]) => /^\d+$/.test(index) && Number(index) < 100 && plainObject(row) && ['reviewed', 'escalated', 'skipped'].includes(row.status));
    if (key === 'meridian-review-drafts-v1') return plainObject(value) && Object.entries(value).every(([index, row]) => /^\d+$/.test(index) && Number(index) < 100 && plainObject(row));
    if (key === 'meridian-work-tickets-v2') return Array.isArray(value) && value.every((ticket) => plainObject(ticket) && typeof ticket.id === 'string' && ['new', 'triaged', 'in_progress', 'blocked', 'in_review', 'closed', 'cancelled', 'open', 'resolved'].includes(ticket.status));
    if (key === 'meridian-catalog-corrections-v2') return plainObject(value) && Object.entries(value).every(([sku, fields]) => /^SKU-C\d{5}$/.test(sku) && plainObject(fields) && Object.entries(fields).every(([field, text]) => ['name', 'description', 'ingredients', 'suitability', 'claims', 'directions', 'netContent'].includes(field) && typeof text === 'string' && text.length <= 10000));
    if (key === 'meridian-workspace-events-v1') return Array.isArray(value) && value.every((event) => plainObject(event) && typeof event.title === 'string' && typeof event.detail === 'string');
    if (key === 'meridian-qa-runs-pt100-v2') return Array.isArray(value) && value.length <= 10 && value.every(validQaRun);
    if (key === 'meridian-mock-interview-history-v1') return Array.isArray(value) && value.length <= 8 && value.every((item) => plainObject(item) && typeof item.level === 'string' && (typeof item.questionCount === 'number' || item.questionCount == null) && (typeof item.score === 'number' || typeof item.score === 'string' || item.score == null) && typeof item.date === 'string' && Array.isArray(item.transcript));
    if (key === 'meridian-mock-interview-active-v1') return plainObject(value) && ['foundation', 'standard', 'stretch'].includes(value.level) && Number.isInteger(value.answerCount) && value.answerCount >= 0 && value.answerCount <= 30 && Array.isArray(value.transcript) && value.transcript.length === value.answerCount * 2 && value.transcript.every((turn) => plainObject(turn) && ['assistant', 'user'].includes(turn.role) && typeof turn.text === 'string') && typeof value.responseDraft === 'string';
    if (key === 'meridian-qa-patches-pt100-v2') return plainObject(value) && Object.entries(value).every(([name, flag]) => ['discountSubtotal', 'confirmationEvent'].includes(name) && typeof flag === 'boolean');
    return false;
  }

  function validQaRun(run) {
    return plainObject(run) && /^QA-\d{6}$/.test(run.id) && run.total === 8
      && Number.isInteger(run.passed) && run.passed >= 0 && run.passed <= 8
      && run.failed === 8 - run.passed && typeof run.time === 'string' && typeof run.duration === 'string'
      && Array.isArray(run.results) && run.results.length === 8
      && run.results.every((item) => plainObject(item) && ['passed', 'failed'].includes(item.status)
        && typeof item.name === 'string' && typeof item.detail === 'string' && typeof item.duration === 'string');
  }

  function replaceWorkspaceData(data) {
    const before = new Map(KEYS.map((key) => [key, localStorage.getItem(key)]));
    try {
      for (const key of KEYS) localStorage.removeItem(key);
      for (const [key, raw] of Object.entries(data)) localStorage.setItem(key, raw);
    } catch (error) {
      try {
        for (const key of KEYS) localStorage.removeItem(key);
        for (const [key, raw] of before) if (raw !== null) localStorage.setItem(key, raw);
      } catch { /* Best-effort rollback if device storage itself has failed. */ }
      throw error;
    }
  }

  refreshStorageStatus();
})();
