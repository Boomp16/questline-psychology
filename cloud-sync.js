/* Firebase optional Google sign-in + per-user Firestore progress storage.
   Replace firebaseConfig placeholders with this app's Firebase web config. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, getRedirectResult, onAuthStateChanged, signInWithRedirect, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCIGmRfc0LCXN5hQTBIL890bctbU2dYKM',
  authDomain: 'motivationalquestline.firebaseapp.com',
  projectId: 'motivationalquestline',
  storageBucket: 'motivationalquestline.firebasestorage.app',
  messagingSenderId: '420416192082',
  appId: '1:420416192082:web:ddfb39650fc15b30f8a98b',
  measurementId: 'G-GCRZD6CK79'
};
const hasFirebaseConfig = !Object.values(firebaseConfig).some(value => value.startsWith('REPLACE_'));
const statusEl = document.querySelector('#cloudAccountStatus');
const signInBtn = document.querySelector('#googleSignInBtn');
const signOutBtn = document.querySelector('#googleSignOutBtn');
const promptDialog = document.querySelector('#cloudPromptDialog');
const promptSignInBtn = document.querySelector('#cloudPromptSignIn');
const promptLocalBtn = document.querySelector('#cloudPromptLocal');
const promptCloseBtn = document.querySelector('#closeCloudPrompt');
const promptStatusEl = document.querySelector('#cloudPromptStatus');
const launchPromptBtn = document.querySelector('#accountSyncBtn');
const downloadBackupBtn = document.querySelector('#downloadBackupBtn');
const restoreBackupFile = document.querySelector('#restoreBackupFile');
const backupStatusEl = document.querySelector('#backupStatus');
const isSignInTab = new URL(window.location.href).searchParams.get('qlGoogleSignIn') === '1';
let auth = null;
let db = null;
let suppressCloudWrite = false;
let saveTimer = null;
let signInInProgress = false;

function sayStatus(message) {
  if (statusEl) statusEl.textContent = message;
  if (promptStatusEl) promptStatusEl.textContent = message;
}

function openCloudPrompt() {
  if (promptDialog && !promptDialog.open) promptDialog.showModal();
}

function closeCloudPrompt() {
  if (promptDialog && promptDialog.open) promptDialog.close();
}

if (launchPromptBtn) launchPromptBtn.addEventListener('click', openCloudPrompt);
if (promptLocalBtn) promptLocalBtn.addEventListener('click', closeCloudPrompt);
if (promptCloseBtn) promptCloseBtn.addEventListener('click', closeCloudPrompt);
if (promptDialog) promptDialog.addEventListener('click', event => {
  if (event.target === promptDialog) closeCloudPrompt();
});

function localSnapshot() {
  return {
    quests: JSON.parse(localStorage.getItem('qlQuests') || '[]'),
    strategies: JSON.parse(localStorage.getItem('qlStrategies') || '{}'),
    profile: JSON.parse(localStorage.getItem('qlProfile') || '{}'),
    settings: JSON.parse(localStorage.getItem('qlSettings') || '{}'),
    reflection: localStorage.getItem('qlReflection') || ''
  };
}

function validateSnapshot(data) {
  return !!data && typeof data === 'object'
    && Array.isArray(data.quests)
    && data.strategies && typeof data.strategies === 'object' && !Array.isArray(data.strategies)
    && data.profile && typeof data.profile === 'object' && !Array.isArray(data.profile)
    && data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
    && typeof data.reflection === 'string';
}

function parseBackup(text) {
  const backup = JSON.parse(text);
  const snapshot = backup && backup.format === 'questline-backup-v1' ? backup.data : backup;
  if (!validateSnapshot(snapshot)) throw new Error('This file is not a valid Questline backup.');
  return snapshot;
}

function downloadBackup() {
  const backup = {format:'questline-backup-v1', exportedAt:new Date().toISOString(), data:localSnapshot()};
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], {type:'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Questline-Progress-Backup.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  if (backupStatusEl) backupStatusEl.textContent = 'Backup downloaded. Keep the JSON file somewhere safe.';
}

async function restoreBackup(file, statusElement) {
  if (!file) return null;
  try {
    const snapshot = parseBackup(await file.text());
    if (statusElement) statusElement.textContent = 'Backup file is valid.';
    return snapshot;
  } catch (error) {
    if (statusElement) statusElement.textContent = error.message || 'Could not read that backup file.';
    return null;
  }
}

if (downloadBackupBtn) downloadBackupBtn.addEventListener('click', downloadBackup);
if (restoreBackupFile) restoreBackupFile.addEventListener('change', async event => {
  const snapshot = await restoreBackup(event.target.files[0], backupStatusEl);
  if (!snapshot) return;
  if (!confirm('Replace this browser\'s current Questline progress with the selected backup?')) return;
  writeSnapshot(snapshot);
  localStorage.setItem('qlPendingCloudBackup', JSON.stringify(snapshot));
  if (auth?.currentUser) {
    try {
      await saveCloud(auth.currentUser.uid);
      localStorage.removeItem('qlPendingCloudBackup');
      if (backupStatusEl) backupStatusEl.textContent = 'Backup restored and synced.';
    } catch (error) {
      console.error('Questline backup sync failed:', error);
      if (backupStatusEl) backupStatusEl.textContent = 'Restored here, but cloud sync failed. Your local progress is safe.';
    }
  } else if (backupStatusEl) {
    backupStatusEl.textContent = 'Backup restored. It will sync after Google sign-in.';
  }
  event.target.value = '';
});


function writeSnapshot(data) {
  suppressCloudWrite = true;
  try {
    localStorage.setItem('qlQuests', JSON.stringify(Array.isArray(data.quests) ? data.quests : []));
    localStorage.setItem('qlStrategies', JSON.stringify(data.strategies && typeof data.strategies === 'object' ? data.strategies : {}));
    localStorage.setItem('qlProfile', JSON.stringify(data.profile && typeof data.profile === 'object' ? data.profile : {}));
    localStorage.setItem('qlSettings', JSON.stringify(data.settings && typeof data.settings === 'object' ? data.settings : {}));
    localStorage.setItem('qlReflection', String(data.reflection || ''));
  } finally {
    suppressCloudWrite = false;
  }
  if (typeof window.renderAll === 'function') window.renderAll();
}

async function saveCloud(uid) {
  if (!db || !uid || suppressCloudWrite) return;
  await setDoc(doc(db, 'users', uid, 'questline', 'progress'), {
    ...localSnapshot(),
    updatedAt: serverTimestamp()
  });
}

function queueCloudSave() {
  if (!auth || !auth.currentUser || suppressCloudWrite) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveCloud(auth.currentUser.uid).catch(error => {
      console.error('Questline cloud save failed:', error);
      sayStatus('Masuk, tetapi cloud save gagal. Progress masih tersimpan di browser ini.');
    });
  }, 800);
}

function startGoogleSignIn(button) {
  if (!auth) {
    sayStatus('Google sign-in is not initialized. Check Firebase setup and reload.');
    return;
  }
  if (signInInProgress) {
    sayStatus('Google sign-in is already opening.');
    return;
  }

  // Open synchronously from the click so the browser treats this as user-initiated.
  const signInTab = window.open('about:blank', '_blank');
  if (!signInTab) {
    sayStatus('The sign-in tab was blocked. Allow pop-ups for this site, then try again.');
    return;
  }

  const signInUrl = new URL(window.location.href);
  signInUrl.searchParams.set('qlGoogleSignIn', '1');
  signInTab.location.replace(signInUrl.toString());
  sayStatus('Sign-in opened in a new tab. Select a backup there if you have one, then continue.');
}


if (promptSignInBtn) promptSignInBtn.addEventListener('click', event => {
  event.preventDefault();
  startGoogleSignIn(promptSignInBtn);
});
if (signInBtn) signInBtn.addEventListener('click', event => {
  event.preventDefault();
  if (isSignInTab && auth) {
    signInWithRedirect(auth, new GoogleAuthProvider()).catch(error => {
      console.error('Google sign-in redirect failed:', error.code, error.message, error);
      sayStatus('Google sign-in failed (' + (error.code || 'unknown') + '). ' + (error.message || ''));
    });
  } else {
    startGoogleSignIn(signInBtn);
  }
});

if (!hasFirebaseConfig) {
  sayStatus('Cloud sign-in is not configured yet. Continue using Questline locally, or open Save progress to check the setup.');
} else {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  getRedirectResult(auth).catch(error => {
    console.error('Google sign-in redirect result failed:', error.code, error.message, error);
    const code = error && error.code ? ' (' + error.code + ')' : '';
    sayStatus('Google sign-in did not complete' + code + '. Check Firebase Authentication settings and try again.');
  });

  const signInUrl = new URL(window.location.href);
  if (isSignInTab) {
    signInUrl.searchParams.delete('qlGoogleSignIn');
    window.history.replaceState({}, '', signInUrl.toString());
    openCloudPrompt();
    sayStatus('Choose a backup if needed, then continue with Google.');
  }

  if (signOutBtn) signOutBtn.addEventListener('click', () => signOut(auth).then(() => { sessionStorage.removeItem('qlCloudPromptDismissed'); openCloudPrompt(); }).catch(error => { console.error(error); sayStatus('Could not sign out. Try again.'); }));

  onAuthStateChanged(auth, async user => {
    if (!user) {
      if (signInBtn) signInBtn.hidden = false;
      if (signOutBtn) signOutBtn.hidden = true;
      sayStatus('Not signed in. Progress stays in this browser only.');
      return;
    }
    sessionStorage.setItem('qlCloudPromptDismissed', '1');
    closeCloudPrompt();
    if (signInBtn) signInBtn.hidden = true;
    if (signOutBtn) signOutBtn.hidden = false;
    if (user) {
      sayStatus('Memuat progress Google account…');
      try {
        const ref = doc(db, 'users', user.uid, 'questline', 'progress');
        const pendingBackupText = localStorage.getItem('qlPendingCloudBackup');
        if (pendingBackupText) {
          const pendingBackup = parseBackup(JSON.stringify(JSON.parse(pendingBackupText)));
          await setDoc(ref, {...pendingBackup, updatedAt:serverTimestamp()});
          writeSnapshot(pendingBackup);
          localStorage.removeItem('qlPendingCloudBackup');
          sayStatus('Backup restored and synced to ' + (user.displayName || user.email) + '.');
          return;
        }
        const snapshot = await getDoc(ref);
        if (snapshot.exists()) {
          writeSnapshot(snapshot.data());
        } else {
          await setDoc(ref, {...localSnapshot(), updatedAt: serverTimestamp()});
        }
        sayStatus('Progress tersambung ke ' + (user.displayName || user.email) + '.');
      } catch (error) {
        console.error('Questline cloud load failed:', error);
        sayStatus('Tidak bisa memuat cloud progress. Data lokal tidak dihapus; periksa Firebase setup dan Rules.');
      }
    }
  });
}

window.addEventListener('storage', event => {
  if (['qlQuests','qlStrategies','qlProfile','qlSettings','qlReflection'].includes(event.key)) queueCloudSave();
});

// app.js writes localStorage from the same tab, which does not emit a storage event.
// Observe state-saving calls safely and debounce cloud writes while signed in.
const originalSetItem = Storage.prototype.setItem;
Storage.prototype.setItem = function(key, value) {
  originalSetItem.call(this, key, value);
  if (['qlQuests','qlStrategies','qlProfile','qlSettings','qlReflection'].includes(key)) queueCloudSave();
};
