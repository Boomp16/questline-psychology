/* Optional daily email reminders. Configure the Apps Script URL after deployment. */
const REMINDER_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx_RcDLs9YoayV6wICL8km5QPXVlW4COqLpwu4v6yfDFefseEOCSfHXc1Kw2hVgQXVu/exec';

function reminderClientKey() {
  let key = localStorage.getItem('qlReminderClientKey');
  if (!key) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    key = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('qlReminderClientKey', key);
  }
  return key;
}

function submitReminderRequest(action, email) {
  if (!REMINDER_SCRIPT_URL.startsWith('https://script.google.com/macros/s/') || REMINDER_SCRIPT_URL.includes('PASTE_YOUR')) {
    toast('Pengingat belum tersambung. Admin perlu memasukkan URL Apps Script.');
    return;
  }
  let responseFrame = document.querySelector('#questline-reminder-response');
  if (!responseFrame) {
    responseFrame = document.createElement('iframe');
    responseFrame.id = 'questline-reminder-response';
    responseFrame.name = 'questline-reminder-response';
    responseFrame.title = 'Questline reminder response';
    responseFrame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10px;bottom:0;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(responseFrame);
  }
  const form = document.createElement('form');
  form.method = 'post';
  form.action = REMINDER_SCRIPT_URL;
  form.target = responseFrame.name;
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
}

const reminderSettingsForm = document.querySelector('#settingsForm');
if (reminderSettingsForm) {
  reminderSettingsForm.addEventListener('submit', event => {
    const email = document.querySelector('#reminderEmail').value.trim();
    const enabled = document.querySelector('#remindersEnabled').checked;
    const previous = JSON.parse(localStorage.getItem('qlReminderSubscription') || 'null');

    if (enabled && !email) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toast('Masukkan email sebelum mengaktifkan pengingat.');
      return;
    }

    if (enabled && email && previous && previous.email === email && previous.status === 'active') {
      toast('Pengingat sudah aktif.');
      return;
    }
    if (enabled && email && previous && previous.email === email && previous.status === 'pending') {
      submitReminderRequest('subscribe', email);
      toast('Request konfirmasi dikirim. Cek inbox dan Spam.');
      return;
    }

    if (enabled && email) {
      localStorage.setItem('qlReminderSubscription', JSON.stringify({email: email, status: 'pending'}));
      submitReminderRequest('subscribe', email);
      toast('Request konfirmasi dikirim. Cek inbox dan Spam.');
      return;
    }

    if (!enabled && previous) {
      localStorage.removeItem('qlReminderSubscription');
      submitReminderRequest('unsubscribe', previous.email);
      toast('Permintaan berhenti berlangganan dikirim.');
    }
  }, true);
}
