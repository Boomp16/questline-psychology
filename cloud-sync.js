/* Firebase optional Google sign-in + per-user Firestore progress storage.
   Replace firebaseConfig placeholders with this app's Firebase web config. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
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
let auth = null;
let db = null;
let suppressCloudWrite = false;
let saveTimer = null;

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

if (promptSignInBtn) promptSignInBtn.addEventListener('click', () => signInBtn ? signInBtn.click() : sayStatus('Google sign-in button is not available.'));

if (!hasFirebaseConfig) {
  sayStatus('Cloud sign-in is not configured yet. Continue without signing in, or ask the site admin to finish Firebase setup.');
  openCloudPrompt();
  if (signInBtn) {
    signInBtn.addEventListener('click', () => sayStatus('Admin perlu menyelesaikan konfigurasi Firebase sebelum Google sign-in tersedia.'));
  }
} else {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  if (signInBtn) signInBtn.addEventListener('click', async () => {
    signInBtn.disabled = true;
    if (promptSignInBtn) promptSignInBtn.disabled = true;
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      sessionStorage.setItem('qlCloudPromptDismissed', '1');
      closeCloudPrompt();
    } catch (error) {
      console.error('Google sign-in failed:', error);
      sayStatus('Google sign-in failed. You can retry or continue without signing in.');
    } finally {
      signInBtn.disabled = false;
      if (promptSignInBtn) promptSignInBtn.disabled = false;
    }
  });
  if (signOutBtn) signOutBtn.addEventListener('click', () => signOut(auth).then(() => { sessionStorage.removeItem('qlCloudPromptDismissed'); openCloudPrompt(); }).catch(error => { console.error(error); sayStatus('Could not sign out. Try again.'); }));

  onAuthStateChanged(auth, async user => {
    if (!user) {
      if (signInBtn) signInBtn.hidden = false;
      if (signOutBtn) signOutBtn.hidden = true;
      sayStatus('Not signed in. Progress stays in this browser only.');
      if (!sessionStorage.getItem('qlCloudPromptDismissed')) openCloudPrompt();
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
