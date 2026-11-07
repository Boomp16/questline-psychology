/* Verified email progress backup client. */
const EMAIL_BACKUP_URL = 'https://script.google.com/macros/s/AKfycbx_RcDLs9YoayV6wICL8km5QPXVlW4COqLpwu4v6yfDFefseEOCSfHXc1Kw2hVgQXVu/exec';
const EMAIL_BACKUP_STATE = 'qlEmailBackup';
const EMAIL_BACKUP_CLIENT = 'qlEmailBackupClientKey';
const EMAIL_BACKUP_INTERVAL = 24 * 60 * 60 * 1000;
const progressDialog = document.querySelector('#cloudPromptDialog');
const progressOpenBtn = document.querySelector('#accountSyncBtn');
const progressCloseBtn = document.querySelector('#closeCloudPrompt');
const continueLocalBtn = document.querySelector('#cloudPromptLocal');
const progressStatus = document.querySelector('#cloudAccountStatus');
const emailInput = document.querySelector('#progressEmail');
const codeInput = document.querySelector('#progressEmailCode');
const requestCodeBtn = document.querySelector('#requestEmailCodeBtn');
const verifyCodeBtn = document.querySelector('#verifyEmailCodeBtn');
const downloadBtn = document.querySelector('#downloadBackupBtn');
const restoreInput = document.querySelector('#restoreBackupFile');
const backupStatusEl = document.querySelector('#backupStatus');
const pendingRequests = new Map();
let saveTimer = null;
let importInProgress = false;

function getEmailBackup() {
  try { return JSON.parse(localStorage.getItem(EMAIL_BACKUP_STATE) || 'null'); }
  catch (_) { return null; }
}
function getClientKey() {
  let key = localStorage.getItem(EMAIL_BACKUP_CLIENT);
  if (!key) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    key = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(EMAIL_BACKUP_CLIENT, key);
  }
  return key;
}
function snapshot() {
  return {
    quests: JSON.parse(localStorage.getItem('qlQuests') || '[]'),
    strategies: JSON.parse(localStorage.getItem('qlStrategies') || '{}'),
    profile: JSON.parse(localStorage.getItem('qlProfile') || '{}'),
    settings: JSON.parse(localStorage.getItem('qlSettings') || '{}'),
    reflection: localStorage.getItem('qlReflection') || ''
  };
}
function backupFileData() {
  return {format:'questline-backup-v1', exportedAt:new Date().toISOString(), data:snapshot()};
}
function validSnapshot(data) {
  return !!data && typeof data === 'object' && Array.isArray(data.quests)
    && data.strategies && typeof data.strategies === 'object' && !Array.isArray(data.strategies)
    && data.profile && typeof data.profile === 'object' && !Array.isArray(data.profile)
    && data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
    && typeof data.reflection === 'string';
}
function setStatus(message) {
  if (progressStatus) progressStatus.textContent = message;
}
function requestService(action, extra = {}) {
  if (!EMAIL_BACKUP_URL.startsWith('https://script.google.com/macros/s/')) {
    setStatus('Layanan email belum dikonfigurasi.');
    return;
  }
  const email = emailInput?.value.trim().toLowerCase() || getEmailBackup()?.email || '';
  if (emailInput && emailInput.value.trim().toLowerCase() !== email) {
    if (progressStatus) progressStatus.textContent = 'Masukkan alamat email yang sama dengan alamat cadangan terverifikasi.';
    return;
  }
  const frame = document.createElement('iframe');
  frame.name = 'questline-email-' + nonce;
  frame.title = 'Respons layanan email Questline';
  frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10px;bottom:0;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(frame);
  pendingRequests.set(nonce, {action,source:frame.contentWindow});
  const form = document.createElement('form');
  form.method = 'post';
  form.action = EMAIL_BACKUP_URL;
  form.target = frame.name;
  form.style.display = 'none';
  const values = {action,email,clientKey:getClientKey(),nonce,...extra};
  for (const [name,value] of Object.entries(values)) {
    const input = document.createElement('input');
    input.type = 'hidden'; input.name = name; input.value = typeof value === 'string' ? value : JSON.stringify(value);
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
  form.remove();
  setTimeout(() => frame.remove(), 60000);
}
function downloadBackup() {
  const blob = new Blob([JSON.stringify(backupFileData(), null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Cadangan-Progres-Questline.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  if (backupStatusEl) backupStatusEl.textContent = 'File Cadangan-Progres-Questline.json diunduh.';
}
function scheduleEmailBackup(immediate = false) {
  const account = getEmailBackup();
  if (!account || account.status !== 'verified' || importInProgress) return;
  const lastSent = Number(localStorage.getItem('qlLastEmailBackupAt') || 0);
  if (Date.now() - lastSent < EMAIL_BACKUP_INTERVAL) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    requestService('saveBackup', {payload:JSON.stringify(backupFileData())});
  }, immediate ? 0 : 1500);
}
window.questlineProgressUpdated = () => scheduleEmailBackup(false);

window.addEventListener('message', event => {
  if ((event.origin !== 'https://script.google.com' && event.origin !== 'https://script.googleusercontent.com') || event.data?.type !== 'questline-email-backup') return;
  const {nonce,result} = event.data;
  const pending = pendingRequests.get(nonce);
  if (!pending || event.source !== pending.source) return;
  const action = pending.action;
  pendingRequests.delete(nonce);
  if (result.status === 'codeSent') {
    if (codeInput) codeInput.disabled = false;
    if (verifyCodeBtn) verifyCodeBtn.disabled = false;
    setStatus('Kode 6 digit dikirim lewat email dan berlaku 15 menit.');
  } else if (result.status === 'verified') {
    const normalizedEmail = result.email;
    const approvedClients = new Set(JSON.parse(localStorage.getItem(EMAIL_BACKUP_STATE) || '{"email":"","status":"pending","clients":[]}').clients || []);
    approvedClients.add(getClientKey());
    emailInput.value = normalizedEmail;
    emailInput.readOnly = true;
    localStorage.setItem(EMAIL_BACKUP_STATE, JSON.stringify({email:normalizedEmail,status:'verified',clients:[...approvedClients]}));
    const settings = JSON.parse(localStorage.getItem('qlSettings') || '{}');
    settings.email = normalizedEmail;
    localStorage.setItem('qlSettings',JSON.stringify(settings));
    const reminderEmail = document.querySelector('#reminderEmail');
    if (reminderEmail) { reminderEmail.value = normalizedEmail; reminderEmail.readOnly = true; }
    setStatus('Email terverifikasi. Cadangan progres akan dikirim berkala ke ' + normalizedEmail + '.');
    requestService('saveBackup', {payload:JSON.stringify(backupFileData())});
  } else if (result.status === 'throttled') {
    localStorage.setItem('qlLastEmailBackupAt', String(Date.now()));
    setStatus(result.message || 'Cadangan terbaru masih berlaku.');
  } else if (result.status === 'backupSent') {
    localStorage.setItem('qlLastEmailBackupAt', String(Date.now()));
    setStatus('Salinan cadangan dikirim ke ' + result.email + '.');
  } else {
    setStatus(result.message || (action === 'verifyEmailCode' ? 'Kode tidak valid.' : 'Permintaan email gagal.'));
  }
});

  if (progressOpenBtn) progressOpenBtn.addEventListener('click', () => progressDialog?.showModal());
if (progressCloseBtn) progressCloseBtn.addEventListener('click', () => {
  localStorage.setItem('qlEmailBackupPromptDismissed','1');
  progressDialog?.close();
});
if (continueLocalBtn) continueLocalBtn.addEventListener('click', () => {
  localStorage.setItem('qlEmailBackupPromptDismissed','1');
  progressDialog?.close();
});
if (progressDialog) progressDialog.addEventListener('click', event => {
  if (event.target === progressDialog) {
    localStorage.setItem('qlEmailBackupPromptDismissed','1');
    progressDialog.close();
  }
});
if (localStorage.getItem('qlEmailBackupPromptDismissed') !== '1') progressDialog?.showModal();
  if (requestCodeBtn) requestCodeBtn.addEventListener('click', () => {
    const verified = getEmailBackup();
    const entered = emailInput?.value.trim().toLowerCase() || '';
    if (verified?.status === 'verified' && verified.email !== entered) {
      setStatus('Perubahan alamat email belum didukung di versi ini. Pulihkan atau hubungi admin untuk mengubah alamat.');
      return;
    }
    requestService('requestEmailCode');
  });
if (verifyCodeBtn) verifyCodeBtn.addEventListener('click', () => {
  const code = codeInput?.value.trim() || '';
  if (!/^\d{6}$/.test(code)) { setStatus('Masukkan kode verifikasi 6 digit.'); return; }
  requestService('verifyEmailCode', {code});
});
if (downloadBtn) downloadBtn.addEventListener('click', downloadBackup);
if (restoreInput) restoreInput.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const data = parsed?.format === 'questline-backup-v1' ? parsed.data : parsed;
    if (!validSnapshot(data)) throw new Error('Format file cadangan tidak valid.');
    if (!confirm('Ganti progres lokal dengan cadangan dari email?')) return;
    importInProgress = true;
    for (const [key,value] of Object.entries({qlQuests:data.quests,qlStrategies:data.strategies,qlProfile:data.profile,qlSettings:data.settings,qlReflection:data.reflection})) localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    window.renderAll?.();
    importInProgress = false;
    localStorage.removeItem('qlLastEmailBackupAt');
    window.questlineProgressUpdated?.();
    if (backupStatusEl) backupStatusEl.textContent = 'Cadangan dipulihkan ke browser ini.';
  } catch (error) {
    importInProgress = false;
    if (backupStatusEl) backupStatusEl.textContent = error.message || 'File cadangan tidak dapat dibaca.';
  } finally { event.target.value = ''; }
});

const verifiedBackup = getEmailBackup();
if (verifiedBackup?.status === 'verified' && Date.now() - Number(localStorage.getItem('qlLastEmailBackupAt') || 0) >= EMAIL_BACKUP_INTERVAL) {
  setTimeout(scheduleEmailBackup, 2000);
}

Storage.prototype.setItem = function(key,value) {
  originalStorageSetItem.call(this,key,value);
  if (['qlQuests','qlStrategies','qlProfile','qlSettings','qlReflection'].includes(key)) scheduleEmailBackup();
};

window.addEventListener('storage', event => {
  if (['qlQuests','qlStrategies','qlProfile','qlSettings','qlReflection'].includes(event.key)) scheduleEmailBackup();
});

const knownEmailBackup = getEmailBackup();
if (knownEmailBackup?.email && emailInput) {
  emailInput.value = knownEmailBackup.email;
  const clients = knownEmailBackup.clients || [];
  if (clients.includes(getClientKey())) {
    emailInput.readOnly = true;
    if (requestCodeBtn) requestCodeBtn.disabled = true;
    if (codeInput) codeInput.disabled = true;
    if (verifyCodeBtn) verifyCodeBtn.disabled = true;
    setStatus('Cadangan email aktif untuk ' + knownEmailBackup.email + '.');
  } else {
    setStatus('Konfirmasikan email ini di browser baru untuk mengaktifkan cadangan di perangkat ini.');
  }
}
