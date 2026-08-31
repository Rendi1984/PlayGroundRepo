'use strict';
/*
 * מסך כניסה. הקוד עצמו לא כתוב כאן — נשמר רק ה-hash שלו, כדי שחיפוש
 * מהיר בקוד המקור לא יחשוף אותו.
 *
 * זו חסימה רכה: היא מונעת כניסה מזדמנת של מי שהגיע ללינק, אבל מי שיודע
 * לקרוא קוד יכול לעקוף אותה. אין דרך לעשות חסימה אמיתית באתר סטטי בלי שרת.
 */
const Gate = (() => {
  const KEY = 'wheel.gate';
  const EXPECTED = 2085917571;
  const hash = s => {
    let x = 5381;
    for (const c of String(s)) x = ((x * 33) ^ c.charCodeAt(0)) >>> 0;
    return x;
  };

  let open = false;
  try { open = localStorage.getItem(KEY) === String(EXPECTED); } catch {}

  return {
    get open() { return open; },
    unlock(code) {
      if (hash(String(code).trim()) !== EXPECTED) return false;
      open = true;
      try { localStorage.setItem(KEY, String(EXPECTED)); } catch {}
      return true;
    },
    lock() {
      open = false;
      try { localStorage.removeItem(KEY); } catch {}
    },
  };
})();
