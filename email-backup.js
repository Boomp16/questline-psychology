/* Verified email progress backup client. */
const EMAIL_BACKUP_URL = 'https://script.google.com/macros/s/AKfycbx_RcDLs9YoayV6wICL8km5QPXVlW4COqLpwu4v6yfDFefseEOCSfHXc1Kw2hVgQXVu/exec';
const EMAIL_BACKUP_STATE = 'qlEmailBackup';
const EMAIL_BACKUP_CLIENT = 'qlEmailBackupClientKey';
const EMAIL_BACKUP_INTERVAL = 24 * 60 * 60 * 1000;
const progressDialog = document.querySelector('#cloudPromptDialog');
const progressOpenBtn = document.querySelector('#accountSyncBtn');
const progressCloseBtn = document.querySelector('#closeCloudPrompt');
const emailInput = document.querySelector('#progressEmail');
const codeInput = document.querySelector('#progressEmailCode');
const primaryEmailAction = document.querySelector('#primaryEmailAction');
const restoreButton = document.querySelector('#restoreBackupBtn');
const restoreInput = document.querySelector('#restoreBackupFile');
const progressStatus = document.querySelector('#cloudAccountStatus');
const backupStatus = document.querySelector('#backupStatus');
const codeStep = document.querySelector('#emailCodeStep');
const localChoice = document.querySelector('#cloudPromptLocal');
const dismissedKey = 'qlEmailBackupPromptDismissed';
const pendingRequests = new Map();
let backupTimer = 0;
let restoring = false;
let awaitingEmailCode = false;

function getAccount() {
  try { return JSON.parse(localStorage.getItem(EMAIL_BACKUP_STATE) || 'null'); }
  catch (_) { return null; }
}
function getClientKey() {
  let key = localStorage.getItem(EMAIL_BACKUP_CLIENT);
  if (!key) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    key = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(EMAIL_BACKUP_CLIENT, key);
  }
  return key;
}
function getSnapshot() {
  return {
    quests: JSON.parse(localStorage.getItem('qlQuests') || '[]'),
    strategies: JSON.parse(localStorage.getItem('qlStrategies') || '{}'),
    profile: JSON.parse(localStorage.getItem('qlProfile') || '{}'),
    settings: JSON.parse(localStorage.getItem('qlSettings') || '{}'),
    reflection: localStorage.getItem('qlReflection') || ''
  };
}
function makeBackup() {
  return {format:'questline-backup-v1', exportedAt:new Date().toISOString(), data:getSnapshot()};
}
function validSnapshot(data) {
  return !!data && typeof data === 'object' && Array.isArray(data.quests)
    && data.strategies && typeof data.strategies === 'object' && !Array.isArray(data.strategies)
    && data.profile && typeof data.profile === 'object' && !Array.isArray(data.profile)
    && data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
    && typeof data.reflection === 'string';
}
function setProgressStatus(message) {
  if (progressStatus) progressStatus.textContent = message;
}
function requestService(action, extra = {}) {
  const email = emailInput?.value.trim().toLowerCase() || getAccount()?.email || '';
  if (!email) { setProgressStatus('Masukkan alamat email terlebih dahulu.'); return; }
  const callbackName = 'questlineCallback_' + crypto.randomUUID().replace(/-/g, '');
  let completed = false;
  const script = document.createElement('script');
  const cleanup = () => {
    if (completed) return;
    completed = true;
    clearTimeout(timer);
    delete window[callbackName];
    script.remove();
  };
  window[callbackName] = result => { cleanup(); handleServiceResponse(action, result); };
  script.onerror = () => { cleanup(); setProgressStatus('Layanan email gagal dimuat. Coba lagi.'); };
  const params = new URLSearchParams({ action, email, clientKey:getClientKey(), callback:callbackName });
  for (const [key, value] of Object.entries(extra)) params.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  script.src = EMAIL_BACKUP_URL + '?' + params.toString();
  const timer = setTimeout(() => { cleanup(); setProgressStatus('Layanan email tidak merespons. Periksa penerapan Apps Script, lalu coba lagi.'); }, 30000);
  setProgressStatus(action === 'requestEmailCode' ? 'Mengirim kode verifikasi…' : 'Memeriksa kode…');
  document.head.appendChild(script);
}

function handleServiceResponse(action, result) {
  if (!result) { setProgressStatus('Layanan email memberi respons kosong. Coba lagi.'); return; }
  if (result.status === 'codeSent') {
    awaitingEmailCode = true;
    if (codeStep) codeStep.hidden = false;
    if (codeInput) codeInput.focus();
    if (primaryEmailAction) primaryEmailAction.textContent = 'Konfirmasi kode';
    setProgressStatus('Kode dikirim ke email. Masukkan 6 digit tersebut.');
    return;
  }
  if (result.status === 'verified') {
    awaitingEmailCode = false;
    const email = result.email;
    localStorage.setItem(EMAIL_BACKUP_STATE, JSON.stringify({email,status:'verified',clients:[getClientKey()]}));
    const settings = JSON.parse(localStorage.getItem('qlSettings') || '{}');
    settings.email = email;
    localStorage.setItem('qlSettings', JSON.stringify(settings));
    const reminderEmail = document.querySelector('#reminderEmail');
    if (reminderEmail) reminderEmail.value = email;
    if (emailInput) emailInput.readOnly = true;
    if (codeStep) codeStep.hidden = true;
    if (primaryEmailAction) { primaryEmailAction.textContent = 'Cadangan email aktif'; primaryEmailAction.disabled = true; }
    setProgressStatus('Email aktif. Cadangan pertama sedang dikirim; berikutnya maksimal sekali sehari.');
    localStorage.removeItem('qlLastEmailBackupAt');
    queueEmailBackup();
    return;
  }
  if (result.status === 'backupSent') {
    localStorage.setItem('qlLastEmailBackupAt', String(Date.now()));
    if (backupStatus) backupStatus.textContent = 'Cadangan progres terkirim ke email.';
    setProgressStatus('Email cadangan terbaru sudah dikirim.');
    clearTimeout(backupTimer);
    backupTimer = setTimeout(queueEmailBackup, EMAIL_BACKUP_INTERVAL);
    return;
  }
  if (result.status === 'throttled') {
    localStorage.setItem('qlLastEmailBackupAt', String(Date.now()));
    setProgressStatus(result.message || 'Cadangan terbaru masih berlaku.');
    clearTimeout(backupTimer);
    backupTimer = setTimeout(queueEmailBackup, EMAIL_BACKUP_INTERVAL);
    return;
  }
  if (action === 'requestEmailCode') {
    awaitingEmailCode = false;
    if (codeStep) codeStep.hidden = true;
    if (primaryEmailAction) primaryEmailAction.textContent = 'Aktifkan cadangan email';
  }
  setProgressStatus(result.message || 'Permintaan belum berhasil. Coba lagi.');
}
function queueEmailBackup() {
  const account = getAccount();
  if (!account || account.status !== 'verified' || restoring) return;
  clearTimeout(backupTimer);
  const lastSent = Number(localStorage.getItem('qlLastEmailBackupAt') || 0);
  const wait = EMAIL_BACKUP_INTERVAL - (Date.now() - lastSent);
  if (wait > 0) {
    backupTimer = setTimeout(queueEmailBackup, wait);
    return;
  }
  backupTimer = setTimeout(() => requestService('saveBackup', {payload:JSON.stringify(makeBackup())}), 1500);
}
window.questlineProgressUpdated = queueEmailBackup;

function openProgressDialog() { if (progressDialog && !progressDialog.open) progressDialog.showModal(); }
function closeProgressDialog() { if (progressDialog?.open) progressDialog.close(); }
if (progressOpenBtn) progressOpenBtn.addEventListener('click', openProgressDialog);
if (progressCloseBtn) progressCloseBtn.addEventListener('click', event => {
  event.preventDefault();
  localStorage.setItem(dismissedKey, '1');
  closeProgressDialog();
});
function skipEmailBackup(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
  localStorage.setItem(dismissedKey, '1');
  if (progressDialog?.open) progressDialog.close();
}
document.addEventListener('click', event => {
  if (event.target.closest('#cloudPromptLocal')) skipEmailBackup(event);
}, true);
if (progressDialog) progressDialog.addEventListener('click', event => { if (event.target === progressDialog) closeProgressDialog(); });
if (localStorage.getItem(dismissedKey) !== '1') openProgressDialog();

window.addEventListener('message', event => {
  let responseHost = '';
  try { responseHost = new URL(event.origin).hostname; } catch (_) { return; }
  const trustedOrigin = responseHost === 'script.google.com' || responseHost === 'script.googleusercontent.com' || responseHost.endsWith('.script.googleusercontent.com');
  if (!trustedOrigin || event.data?.type !== 'questline-email-backup') return;
  const {nonce,result} = event.data;
  const pending = pendingRequests.get(nonce);
  if (!pending || event.source !== pending.source) return;
  clearTimeout(pending.requestTimer);
  pendingRequests.delete(nonce);
  pending.frame.remove();
  if (result.status === 'codeSent') {
    awaitingEmailCode = true;
    if (codeStep) codeStep.hidden = false;
    if (primaryEmailAction) primaryEmailAction.textContent = 'Konfirmasi kode';
    if (codeInput) codeInput.focus();
    setProgressStatus('Kode dikirim ke email. Masukkan 6 digit tersebut.');
  } else if (result.status === 'verified') {
    awaitingEmailCode = false;
    const email = result.email;
    localStorage.setItem(EMAIL_BACKUP_STATE, JSON.stringify({email,status:'verified',clients:[getClientKey()]}));
    const settings = JSON.parse(localStorage.getItem('qlSettings') || '{}');
    settings.email = email;
    localStorage.setItem('qlSettings', JSON.stringify(settings));
    const reminderEmail = document.querySelector('#reminderEmail');
    if (reminderEmail) reminderEmail.value = email;
    if (emailInput) emailInput.readOnly = true;
    if (codeStep) codeStep.hidden = true;
    if (primaryEmailAction) { primaryEmailAction.textContent = 'Cadangan email aktif'; primaryEmailAction.disabled = true; }
    setProgressStatus('Email aktif. Cadangan pertama sedang dikirim; berikutnya maksimal sekali sehari.');
    localStorage.removeItem('qlLastEmailBackupAt');
    queueEmailBackup();
  } else if (result.status === 'backupSent') {
    localStorage.setItem('qlLastEmailBackupAt', String(Date.now()));
    if (backupStatus) backupStatus.textContent = 'Cadangan progres terkirim ke email.';
    setProgressStatus('Email cadangan terbaru sudah dikirim.');
    clearTimeout(backupTimer);
    backupTimer = setTimeout(queueEmailBackup, EMAIL_BACKUP_INTERVAL);
  } else if (result.status === 'throttled') {
    localStorage.setItem('qlLastEmailBackupAt', String(Date.now()));
    setProgressStatus('Cadangan terbaru masih berlaku. Cadangan berikutnya akan dikirim besok.');
    clearTimeout(backupTimer);
    backupTimer = setTimeout(queueEmailBackup, EMAIL_BACKUP_INTERVAL);
  } else {
    if (action === 'requestEmailCode') {
      if (codeStep) codeStep.hidden = false;
      if (codeInput) codeInput.disabled = false;
      if (primaryEmailAction) primaryEmailAction.textContent = 'Kirim ulang kode';
    }
    setProgressStatus(result.message || 'Permintaan belum berhasil. Coba lagi.');
  }
});

if (primaryEmailAction) {
  const activateEmailBackup = event => {
    event.preventDefault();
    primaryEmailAction.classList.add('is-pressed');
    setTimeout(() => primaryEmailAction.classList.remove('is-pressed'), 220);
    const account = getAccount();
    if (awaitingEmailCode || account?.status === 'verified') {
      const code = codeInput?.value.trim() || '';
      if (!/^\d{6}$/.test(code)) { setProgressStatus('Masukkan kode 6 digit dari email.'); return; }
      setProgressStatus('Memeriksa kode…');
      requestService('verifyEmailCode', {code});
      return;
    }
    const email = emailInput?.value.trim().toLowerCase() || '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setProgressStatus('Masukkan alamat email yang valid.'); return; }
    setProgressStatus('Mengirim kode verifikasi…');
    if (codeStep) codeStep.hidden = false;
    if (codeInput) { codeInput.disabled = false; codeInput.focus(); }
    primaryEmailAction.textContent = 'Konfirmasi kode';
    awaitingEmailCode = true;
    requestService('requestEmailCode');
  };
  primaryEmailAction.addEventListener('click', activateEmailBackup);
  primaryEmailAction.addEventListener('pointerdown', () => primaryEmailAction.classList.add('is-pressed'));
  primaryEmailAction.addEventListener('pointerup', () => primaryEmailAction.classList.remove('is-pressed'));
}


if (restoreButton && restoreInput) restoreButton.addEventListener('click', () => restoreInput.click());
if (restoreInput) restoreInput.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const data = parsed?.format === 'questline-backup-v1' ? parsed.data : parsed;
    if (!validSnapshot(data)) throw new Error('Format cadangan Questline tidak valid.');
    if (!confirm('Pulihkan progres dari file cadangan ini? Progres browser saat ini akan diganti.')) return;
    restoring = true;
    for (const [key,value] of Object.entries({qlQuests:data.quests,qlStrategies:data.strategies,qlProfile:data.profile,qlSettings:data.settings,qlReflection:data.reflection})) {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
    window.renderAll?.();
    restoring = false;
    if (backupStatus) backupStatus.textContent = 'Cadangan berhasil dipulihkan.';
  } catch (error) {
    restoring = false;
    if (backupStatus) backupStatus.textContent = error.message || 'File cadangan tidak dapat dibaca.';
  } finally { event.target.value = ''; }
});

const account = getAccount();
if (account?.email && emailInput) {
  emailInput.value = account.email;
  if (account.status === 'verified' && (account.clients || []).includes(getClientKey())) {
    emailInput.readOnly = true;
    if (codeStep) codeStep.hidden = true;
    if (primaryEmailAction) { primaryEmailAction.textContent = 'Cadangan email aktif'; primaryEmailAction.disabled = true; }
    setProgressStatus('Cadangan email aktif untuk ' + account.email + '.');
  }
}
