/* Manual JSON export/import for browser-local Questline progress. */
const backupDownloadBtn = document.querySelector('#downloadBackupBtn');
const backupRestoreInput = document.querySelector('#restoreBackupFile');
const backupStatus = document.querySelector('#backupStatus');
const backupDialog = document.querySelector('#cloudPromptDialog');
const backupDialogOpen = document.querySelector('#localBackupBtn');
const backupDialogClose = document.querySelector('#closeCloudPrompt');
if (backupDialogOpen) backupDialogOpen.addEventListener('click', () => { if (backupDialog && !backupDialog.open) backupDialog.showModal(); });
if (backupDialogClose) backupDialogClose.addEventListener('click', () => { if (backupDialog?.open) backupDialog.close(); });
if (backupDialog) backupDialog.addEventListener('click', event => { if (event.target === backupDialog) backupDialog.close(); });

function readQuestlineSnapshot() {
  return {
    quests: JSON.parse(localStorage.getItem('qlQuests') || '[]'),
    strategies: JSON.parse(localStorage.getItem('qlStrategies') || '{}'),
    profile: JSON.parse(localStorage.getItem('qlProfile') || '{}'),
    settings: JSON.parse(localStorage.getItem('qlSettings') || '{}'),
    reflection: localStorage.getItem('qlReflection') || ''
  };
}

function isValidQuestlineSnapshot(data) {
  return !!data && typeof data === 'object'
    && Array.isArray(data.quests)
    && data.strategies && typeof data.strategies === 'object' && !Array.isArray(data.strategies)
    && data.profile && typeof data.profile === 'object' && !Array.isArray(data.profile)
    && data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
    && typeof data.reflection === 'string';
}

function sayBackupStatus(message) {
  if (backupStatus) backupStatus.textContent = message;
}

if (backupDownloadBtn) backupDownloadBtn.addEventListener('click', () => {
  const backup = {
    format: 'questline-backup-v1',
    exportedAt: new Date().toISOString(),
    data: readQuestlineSnapshot()
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Cadangan-Progres-Questline.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  sayBackupStatus('Cadangan diunduh. Progresmu tetap tersimpan di browser ini.');
});

if (backupRestoreInput) backupRestoreInput.addEventListener('change', async event => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const data = parsed && parsed.format === 'questline-backup-v1' ? parsed.data : parsed;
    if (!isValidQuestlineSnapshot(data)) throw new Error('File ini bukan cadangan Questline yang valid.');
    if (!confirm('Pulihkan cadangan ini? Progres yang tersimpan di browser saat ini akan diganti.')) return;

    const safetyCopy = {
      format: 'questline-backup-v1',
      exportedAt: new Date().toISOString(),
      data: readQuestlineSnapshot()
    };
    localStorage.setItem('qlPreRestoreBackup', JSON.stringify(safetyCopy));
    localStorage.setItem('qlQuests', JSON.stringify(data.quests));
    localStorage.setItem('qlStrategies', JSON.stringify(data.strategies));
    localStorage.setItem('qlProfile', JSON.stringify(data.profile));
    localStorage.setItem('qlSettings', JSON.stringify(data.settings));
    localStorage.setItem('qlReflection', data.reflection);
    if (typeof window.renderAll === 'function') window.renderAll();
    sayBackupStatus('Cadangan berhasil dipulihkan. Salinan progres sebelumnya disimpan sebagai pemulihan sementara di browser ini.');
  } catch (error) {
    sayBackupStatus(error.message || 'File cadangan tidak dapat dibaca.');
  } finally {
    event.target.value = '';
  }
});
