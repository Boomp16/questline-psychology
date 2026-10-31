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

function submitReminderRequest(action, email) {
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
          setReminderStatus(text.slice(0, 350));
          if (/daily questline reminders are active|already subscribed/i.test(text)) {
            const saved = JSON.parse(localStorage.getItem(REMINDER_STATUS_KEY) || '{}');
            saved.status = 'active';
            localStorage.setItem(REMINDER_STATUS_KEY, JSON.stringify(saved));
          }
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
  [['action', action], ['email', email], ['clientKey', reminderClientKey()]].forEach(([name, value]) => {
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

const reminderSettingsForm = document.querySelector('#settingsForm');
if (reminderSettingsForm) {
  reminderSettingsForm.addEventListener('submit', event => {
    const email = document.querySelector('#reminderEmail').value.trim().toLowerCase();
    const enabled = document.querySelector('#remindersEnabled').checked;
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
      setReminderStatus('Pengingat harian sudah aktif untuk email ini.');
      return;
    }

    if (enabled && previous && previous.email === email && previous.status === 'pending') {
      event.preventDefault();
      event.stopImmediatePropagation();
      submitReminderRequest('subscribe', email);
      setReminderStatus('Mengirim ulang permintaan konfirmasi. Cek Inbox dan Spam; permintaan ulang dibatasi.');
      return;
    }

    if (enabled) {
      event.preventDefault();
      event.stopImmediatePropagation();
      localStorage.setItem(REMINDER_STATUS_KEY, JSON.stringify({email, status: 'pending'}));
      submitReminderRequest('subscribe', email);
      setReminderStatus('Permintaan terkirim. Cek Inbox e-mail dan Spam, lalu klik Confirm reminders.');
      return;
    }

    if (previous) {
      event.preventDefault();
      event.stopImmediatePropagation();
      localStorage.setItem(REMINDER_STATUS_KEY, JSON.stringify({email: previous.email, status: 'unsubscribing'}));
      submitReminderRequest('unsubscribe', previous.email);
      setReminderStatus('Permintaan berhenti dikirim. Setelah selesai, aktifkan lagi untuk meminta konfirmasi baru.');
    }
  }, true);
}
