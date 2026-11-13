/* Recover valid Questline localStorage values if a deployment or interrupted write leaves them missing/corrupt. */
(() => {
  const keys = ['qlQuests', 'qlStrategies', 'qlProfile', 'qlSettings', 'qlReflection'];
  const mirrorKey = key => `qlRecovery:${key}`;
  const valid = {
    qlQuests: value => Array.isArray(value),
    qlStrategies: value => value && typeof value === 'object' && !Array.isArray(value),
    qlProfile: value => value && typeof value === 'object' && !Array.isArray(value),
    qlSettings: value => value && typeof value === 'object' && !Array.isArray(value),
    qlReflection: value => typeof value === 'string'
  };

  for (const key of keys) {
    const current = localStorage.getItem(key);
    let currentValid = false;
    if (current !== null) {
      try { currentValid = valid[key](key === 'qlReflection' ? current : JSON.parse(current)); }
      catch (_) { currentValid = false; }
    }

    if (!currentValid) {
      const mirror = localStorage.getItem(mirrorKey(key));
      if (mirror !== null) {
        try {
          const parsed = key === 'qlReflection' ? mirror : JSON.parse(mirror);
          if (valid[key](parsed)) localStorage.setItem(key, mirror);
        } catch (_) {
          // Ignore an invalid recovery copy and leave the app's normal defaults intact.
        }
      }
    }

    const recovered = localStorage.getItem(key);
    if (recovered !== null) {
      try {
        const parsed = key === 'qlReflection' ? recovered : JSON.parse(recovered);
        if (valid[key](parsed)) localStorage.setItem(mirrorKey(key), recovered);
      } catch (_) {
        // Do not replace a usable mirror with malformed primary data.
      }
    }
  }

  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    originalSetItem.call(this, key, value);
    if (!keys.includes(key)) return;
    try {
      const parsed = key === 'qlReflection' ? String(value) : JSON.parse(String(value));
      if (valid[key](parsed)) originalSetItem.call(this, mirrorKey(key), String(value));
    } catch (_) {
      // Preserve the previous good mirror if a write is malformed.
    }
  };
})();
