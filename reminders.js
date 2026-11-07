/* Optional daily email reminders. */
const REMINDER_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx_RcDLs9YoayV6wICL8km5QPXVlW4COqLpwu4v6yfDFefseEOCSfHXc1Kw2hVgQXVu/exec';
const REMINDER_STATUS_KEY = 'qlReminderSubscription';

function reminderClientKey() {
  let key = localStorage.getItem('qlReminderClientKey');
  if (!key) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    key = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('qlReminderClientKey', key);
  }
  return key;
}

function setReminderStatus(message) {
  const settings = document.querySelector('#settingsDialog .form-note');
  if (settings) settings.textContent = message;
  if (typeof toast === 'function') toast(message);
}

function submitReminderRequest(action, email, hasOpenQuests) {
  if (!REMINDER_SCRIPT_URL.startsWith('https://script.google.com/macros/s/') || REMINDER_SCRIPT_URL.includes('PASTE_YOUR')) {
    setReminderStatus('Pengingat belum tersambung. Admin perlu memasukkan URL Apps Script.');
    return false;
  }
  let frame = document.querySelector('#questline-reminder-response');
  if (!frame) {
    frame = document.createElement('iframe');
    frame.id = 'questline-reminder-response';
    frame.name = 'questline-reminder-response';
    frame.title = 'Questline reminder response';
    frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10px;bottom:0;border:0;opacity:0;pointer-events:none';
    frame.addEventListener('load', () => {
      try {
        const text = frame.contentDocument && frame.contentDocument.body ? frame.contentDocument.body.innerText : '';
        if (text && /Questline|confirmation|unsubscri|reminder|already/i.test(text)) {
          if (/quest reminder status updated/i.test(text)) {
            const saved = JSON.parse(localStorage.getItem(REMINDER_STATUS_KEY) || '{}');
            saved.status = 'active';
            saved.hasOpenQuests = reminderHasOpenQuests();
            localStorage.setItem(REMINDER_STATUS_KEY, JSON.stringify(saved));
            setReminderStatus(saved.hasOpenQuests ? 'Pengingat aktif; masih ada quest yang belum selesai.' : 'Tidak ada quest yang belum selesai. Email pengingat dijeda.');
          }
          if (/confirmation email sent/i.test(text)) setReminderStatus('Konfirmasi dikirim. Pengingat baru aktif setelah alamat email dikonfirmasi.');
          if (/you are unsubscribed|already removed/i.test(text)) localStorage.removeItem(REMINDER_STATUS_KEY);
        }
      } catch (_) {
        // Cross-origin iframe content cannot be read; keep the clear pending status instead.
      }
    });
    document.body.appendChild(frame);
  }
  const form = document.createElement('form');
  form.method = 'post';
  form.action = REMINDER_SCRIPT_URL;
  form.target = frame.name;
  form.style.display = 'none';
  [['action', action], ['email', email], ['clientKey', reminderClientKey()], ['hasOpenQuests', String(!!hasOpenQuests)]].forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
  form.remove();
  return true;
}

function reminderHasOpenQuests() {
  try {
    return JSON.parse(localStorage.getItem('qlQuests') || '[]')
      .some(quest => Number(quest.done || 0) < Number(quest.parts || 0));
  } catch (error) {
    console.error('Could not read Questline quest progress:', error);
    return false;
  }
}

let questStatusTimer = null;
function syncReminderQuestStatus() {
  clearTimeout(questStatusTimer);
  questStatusTimer = setTimeout(() => {
    const saved = JSON.parse(localStorage.getItem(REMINDER_STATUS_KEY) || 'null');
    if (!saved || !['active','pending'].includes(saved.status)) return;
    submitReminderRequest('questStatus', saved.email, reminderHasOpenQuests());
  }, 1200);
}
window.questlineProgressUpdated = syncReminderQuestStatus;
setTimeout(syncReminderQuestStatus, 1500);

const reminderSettingsForm = document.querySelector('#settingsForm');
if (reminderSettingsForm) {
  reminderSettingsForm.addEventListener('submit', event => {
    const email = document.querySelector('#reminderEmail').value.trim().toLowerCase();
    const enabled = document.querySelector('#remindersEnabled').checked;
    const quests = JSON.parse(localStorage.getItem('qlQuests') || '[]');
    const hasOpenQuests = quests.some(quest => Number(quest.done || 0) < Number(quest.parts || 0));
    const previous = JSON.parse(localStorage.getItem(REMINDER_STATUS_KEY) || 'null');

    if (enabled && !email) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setReminderStatus('Masukkan alamat email sebelum mengaktifkan pengingat.');
      return;
    }

    if (enabled && previous && previous.email === email && previous.status === 'active') {
      event.preventDefault();
      event.stopImmediatePropagation();
      submitReminderRequest('questStatus', email, hasOpenQuests);
      setReminderStatus(hasOpenQuests
        ? 'Pengingat aktif; masih ada quest yang belum selesai.'
        : 'Tidak ada quest yang belum selesai. Email pengingat dijeda sampai ada quest aktif.');
      return;
    }

    if (enabled && previous && previous.email === email && previous.status === 'pending') {
      event.preventDefault();
      event.stopImmediatePropagation();
      submitReminderRequest('subscribe', email, hasOpenQuests);
      setReminderStatus('Mengirim ulang permintaan konfirmasi. Cek Inbox dan Spam; permintaan ulang dibatasi.');
      return;
    }

    if (enabled) {
      event.preventDefault();
      event.stopImmediatePropagation();
      localStorage.setItem(REMINDER_STATUS_KEY, JSON.stringify({email, status: 'pending', hasOpenQuests}));
      submitReminderRequest('subscribe', email, hasOpenQuests);
      sayStatus(hasOpenQuests
        ? 'Permintaan terkirim. Cek email dan folder Spam, lalu konfirmasi alamatmu.'
        : 'Permintaan terkirim. Cek email dan folder Spam. Pengingat dikirim hanya jika ada quest yang belum selesai.');
      return;
    }

  if (!enabled && previous) {
      event.preventDefault();
      event.stopImmediatePropagation();
      localStorage.setItem(REMINDER_STATUS_KEY, JSON.stringify({email: previous.email, status: 'unsubscribing', hasOpenQuests: false}));
      submitReminderRequest('unsubscribe', previous.email, false);
      setReminderStatus('Permintaan berhenti berlangganan terkirim. Aktifkan kembali setelah konfirmasi berhenti muncul.');
    }
  }, true);
}
