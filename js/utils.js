/* js/utils.js — Shared utility functions */

const uid = () => Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
const now = () => Date.now();
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

function fmtTime(ts) {
  return new Date(ts).toLocaleString('zh-CN', {
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function escHtml(t) {
  return String(t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

let toastTimer;
function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  el.innerHTML = `<span>${icons[type] || 'ℹ'}</span>${escHtml(msg)}`;
  el.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

function getStorageSize() {
  try {
    const bytes = new Blob([localStorage.getItem('polychat_v2') || '']).size;
    return bytes > 1024 * 1024
      ? (bytes / (1024 * 1024)).toFixed(2) + ' MB'
      : (bytes / 1024).toFixed(1) + ' KB';
  } catch (e) { return '—'; }
}
