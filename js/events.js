/* js/events.js — All event handlers */

/* ══════════════════════════
   MODEL SUGGESTIONS
══════════════════════════ */
const MODEL_SUGGESTIONS = [
  { model: 'gpt-4o',                  provider: 'OpenAI' },
  { model: 'gpt-4o-mini',             provider: 'OpenAI' },
  { model: 'gpt-4-turbo',             provider: 'OpenAI' },
  { model: 'gpt-3.5-turbo',           provider: 'OpenAI' },
  { model: 'o1',                       provider: 'OpenAI' },
  { model: 'o1-mini',                  provider: 'OpenAI' },
  { model: 'o3-mini',                  provider: 'OpenAI' },
  { model: 'claude-opus-4-5',          provider: 'Anthropic' },
  { model: 'claude-sonnet-4-5',        provider: 'Anthropic' },
  { model: 'claude-haiku-4-5',         provider: 'Anthropic' },
  { model: 'gemini-2.0-flash',         provider: 'Google' },
  { model: 'gemini-1.5-pro',           provider: 'Google' },
  { model: 'gemini-1.5-flash',         provider: 'Google' },
  { model: 'deepseek-chat',            provider: 'DeepSeek' },
  { model: 'deepseek-reasoner',        provider: 'DeepSeek' },
  { model: 'mistral-large-latest',     provider: 'Mistral' },
  { model: 'mistral-small-latest',     provider: 'Mistral' },
  { model: 'open-mixtral-8x7b',        provider: 'Mistral' },
  { model: 'llama-3.3-70b-versatile',  provider: 'Groq' },
  { model: 'qwen-max',                 provider: 'Alibaba' },
  { model: 'qwen-plus',                provider: 'Alibaba' },
  { model: 'qwen-turbo',               provider: 'Alibaba' },
];

function initCombobox(inputId, listId) {
  const input = document.getElementById(inputId);
  const list  = document.getElementById(listId);
  if (!input || !list) return;

  function showSuggestions(filter) {
    const q = (filter || '').toLowerCase();
    const filtered = MODEL_SUGGESTIONS.filter(m =>
      m.model.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q)
    );
    list.innerHTML = filtered.map(m =>
      `<div class="suggestion-item" data-model="${m.model}">
        <span>${escHtml(m.model)}</span>
        <span class="suggestion-provider">${escHtml(m.provider)}</span>
      </div>`
    ).join('');
    list.classList.toggle('open', filtered.length > 0);
  }

  input.addEventListener('focus', () => showSuggestions(input.value));
  input.addEventListener('input', () => showSuggestions(input.value));
  input.addEventListener('blur',  () => setTimeout(() => list.classList.remove('open'), 160));
  list.addEventListener('mousedown', e => {
    const item = e.target.closest('.suggestion-item');
    if (item) { input.value = item.dataset.model; list.classList.remove('open'); }
  });
}

/* ══════════════════════════
   SLIDER SYNC
══════════════════════════ */
function initSliders() {
  [
    ['cfg-temp',       'cfg-temp-val'],
    ['cfg-max-tokens', 'cfg-max-tokens-val'],
    ['cfg-top-p',      'cfg-top-p-val'],
    ['cfg-freq-pen',   'cfg-freq-pen-val'],
    ['cfg-pres-pen',   'cfg-pres-pen-val'],
  ].forEach(([sId, vId]) => {
    const sl = document.getElementById(sId);
    const vl = document.getElementById(vId);
    if (sl && vl) {
      sl.addEventListener('input', () => { vl.value = sl.value; });
      vl.addEventListener('input', () => { sl.value = vl.value; });
    }
  });
}

/* ══════════════════════════
   THEME TOGGLE
══════════════════════════ */
const THEME_KEY = 'polychat_theme';

function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  updateThemeIcon(theme);
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.textContent = theme === 'light' ? '☀' : '☾';
}

function initThemeToggle() {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  updateThemeIcon(getCurrentTheme());
  btn.addEventListener('click', () => {
    const next = getCurrentTheme() === 'light' ? 'dark' : 'light';
    applyTheme(next);
  });
  // Follow OS theme changes when user hasn't made an explicit choice
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
    if (!localStorage.getItem(THEME_KEY)) {
      applyTheme(e.matches ? 'light' : 'dark');
    }
  });
}

/* ══════════════════════════
   MODAL SYSTEM
══════════════════════════ */
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function initModals() {
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    }
  });
}

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId  = btn.dataset.tab;
      const modal  = btn.closest('.modal, .tabs')?.closest('.modal') || btn.closest('.modal');
      const scope  = modal || document;
      scope.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      scope.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById(tabId);
      if (panel) panel.classList.add('active');
    });
  });
}

/* ══════════════════════════
   API PROFILE MANAGEMENT
══════════════════════════ */
let editingProfileId = null;

function openNewProfile() {
  editingProfileId = null;
  document.getElementById('profile-edit-title').textContent = '新建 API 方案';
  document.getElementById('profile-edit-id').value   = '';
  document.getElementById('profile-name').value      = '';
  document.getElementById('profile-endpoint').value  = 'https://api.openai.com/v1/chat/completions';
  document.getElementById('profile-apikey').value    = '';
  document.getElementById('profile-model').value     = 'gpt-4o';
  document.getElementById('profile-system-prompt').value = '';
  document.getElementById('profile-stream').checked  = true;
  openModal('profile-edit-overlay');
}

function openEditProfile(profileId) {
  const p = state.apiProfiles[profileId];
  if (!p) return;
  editingProfileId = profileId;
  document.getElementById('profile-edit-title').textContent = `编辑方案「${p.name}」`;
  document.getElementById('profile-edit-id').value   = p.id;
  document.getElementById('profile-name').value      = p.name;
  document.getElementById('profile-endpoint').value  = p.endpoint;
  document.getElementById('profile-apikey').value    = p.apiKey;
  document.getElementById('profile-model').value     = p.model;
  document.getElementById('profile-system-prompt').value = p.systemPrompt || '';
  document.getElementById('profile-stream').checked  = p.stream !== false;
  openModal('profile-edit-overlay');
}

function saveProfile() {
  const name = document.getElementById('profile-name').value.trim();
  if (!name) { toast('请填写方案名称', 'error'); return; }

  const id = editingProfileId || ('p_' + uid());
  const existing = state.apiProfiles[id] || {};

  state.apiProfiles[id] = {
    ...existing,
    id,
    name,
    endpoint:         document.getElementById('profile-endpoint').value.trim(),
    apiKey:           document.getElementById('profile-apikey').value.trim(),
    model:            document.getElementById('profile-model').value.trim(),
    systemPrompt:     document.getElementById('profile-system-prompt').value,
    stream:           document.getElementById('profile-stream').checked,
    // Keep params from existing or defaults
    temperature:      existing.temperature      ?? 0.7,
    maxTokens:        existing.maxTokens        ?? 2048,
    topP:             existing.topP             ?? 1,
    frequencyPenalty: existing.frequencyPenalty ?? 0,
    presencePenalty:  existing.presencePenalty  ?? 0,
  };

  if (!editingProfileId) {
    // Auto-switch to new profile
    state.currentProfileId = id;
  }

  saveState();
  renderProfileList();
  renderSidebarProfile();
  renderApiStatus();
  closeModal('profile-edit-overlay');
  toast(editingProfileId ? '方案已更新 ✓' : '方案已创建 ✓', 'success');
}

function switchToProfile(profileId) {
  if (!state.apiProfiles[profileId]) return;
  state.currentProfileId = profileId;
  saveState();
  renderProfileList();
  renderSidebarProfile();
  renderApiStatus();
  toast(`已切换到「${state.apiProfiles[profileId].name}」`, 'success');
}

function deleteProfile(profileId) {
  const p = state.apiProfiles[profileId];
  if (!p) return;
  if (Object.keys(state.apiProfiles).length <= 1) { toast('至少保留一个方案', 'error'); return; }
  if (!confirm(`确定删除方案「${p.name}」？`)) return;

  delete state.apiProfiles[profileId];
  if (state.currentProfileId === profileId) {
    state.currentProfileId = Object.keys(state.apiProfiles)[0];
  }
  saveState();
  renderProfileList();
  renderSidebarProfile();
  renderApiStatus();
  toast('方案已删除', 'info');
}

/* ══════════════════════════
   PARAMETERS SAVE
══════════════════════════ */
function saveParams() {
  const p = getActiveProfile();
  if (!p) return;
  p.temperature      = parseFloat(document.getElementById('cfg-temp').value);
  p.maxTokens        = parseInt(document.getElementById('cfg-max-tokens').value);
  p.topP             = parseFloat(document.getElementById('cfg-top-p').value);
  p.frequencyPenalty = parseFloat(document.getElementById('cfg-freq-pen').value);
  p.presencePenalty  = parseFloat(document.getElementById('cfg-pres-pen').value);
  saveState();
  closeModal('settings-overlay');
  toast('参数已保存 ✓', 'success');
}

/* ══════════════════════════
   MESSAGE ACTIONS (global, called from inline onclick)
══════════════════════════ */
function copyMsg(msgId) {
  const ver = getCurVer();
  if (!ver) return;
  const msg = ver.messages.find(m => m.id === msgId);
  if (msg) navigator.clipboard.writeText(msg.content).then(() => toast('已复制', 'success'));
}

function deleteMsg(msgId) {
  const ver = getCurVer();
  if (!ver) return;
  const idx = ver.messages.findIndex(m => m.id === msgId);
  if (idx < 0) return;
  ver.messages.splice(idx, 1);
  saveState();
  renderChat();
  toast('已删除', 'info');
}

/* Edit context */
let editCtx = null;

function editMsg(msgId) {
  const conv = getConv();
  const ver  = getCurVer();
  if (!conv || !ver) return;
  const idx = ver.messages.findIndex(m => m.id === msgId);
  if (idx < 0) return;
  editCtx = { convId: conv.id, versionId: conv.currentVersionId, msgId, msgIndex: idx };
  document.getElementById('edit-content').value = ver.messages[idx].content;
  openModal('edit-overlay');
}

function regenMsg(msgId) {
  const conv = getConv();
  const ver  = getCurVer();
  if (!conv || !ver || isStreaming) return;
  const idx = ver.messages.findIndex(m => m.id === msgId);
  if (idx < 0) return;

  const baseMessages = ver.messages.slice(0, idx);
  const newVer = forkVersion(conv, baseMessages, conv.currentVersionId);
  saveState();
  renderChat();
  toast(`已分叉为 ${newVer.label}，重新生成中…`, 'info');
  sendMessage(null, true);
}

/* ══════════════════════════
   IMPORT / EXPORT
══════════════════════════ */
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `polychat_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  toast('已导出 JSON ✓', 'success');
}

function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.conversations) { toast('文件格式不正确', 'error'); return; }
      state.conversations         = data.conversations || {};
      state.apiProfiles           = data.apiProfiles   || {};
      state.currentProfileId      = data.currentProfileId || null;
      state.webdavConfig          = data.webdavConfig  || state.webdavConfig;
      state.currentConversationId = null;
      ensureDefaultProfile();
      saveState();
      fullRender();
      toast('导入成功 ✓', 'success');
    } catch (e) {
      toast('解析失败：' + e.message, 'error');
    }
  };
  reader.readAsText(file);
}

/* ══════════════════════════
   TEXTAREA AUTO-RESIZE
══════════════════════════ */
function autoResize(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
}

/* ══════════════════════════
   BIND ALL EVENTS
══════════════════════════ */
function bindEvents() {
  /* Theme toggle */
  initThemeToggle();

  /* Mobile sidebar */
  document.getElementById('menu-btn').addEventListener('click', openMobileSidebar);
  document.getElementById('sidebar-overlay').addEventListener('click', closeMobileSidebar);

  /* New conversation */
  document.getElementById('new-chat-btn').addEventListener('click', () => {
    const conv = newConversation();
    state.currentConversationId = conv.id;
    saveState();
    fullRender();
    closeMobileSidebar();
  });

  /* Conversation list */
  document.getElementById('conversation-list').addEventListener('click', e => {
    const del = e.target.closest('.conv-delete');
    if (del) {
      e.stopPropagation();
      if (!confirm('确定删除此对话？')) return;
      delete state.conversations[del.dataset.convId];
      if (state.currentConversationId === del.dataset.convId) state.currentConversationId = null;
      saveState(); fullRender(); return;
    }
    const item = e.target.closest('.conv-item');
    if (item) {
      state.currentConversationId = item.dataset.convId;
      fullRender();
      closeMobileSidebar();
    }
  });

  /* Send message */
  document.getElementById('send-btn').addEventListener('click', () => {
    const text = document.getElementById('message-input').value.trim();
    if (!text || isStreaming) return;
    if (!state.currentConversationId) {
      const conv = newConversation();
      state.currentConversationId = conv.id;
      fullRender();
    }
    document.getElementById('message-input').value = '';
    autoResize(document.getElementById('message-input'));
    sendMessage(text);
    renderConvList();
  });

  /* Stop streaming */
  document.getElementById('stop-btn').addEventListener('click', () => {
    if (abortController) abortController.abort();
  });

  /* Input textarea */
  const ta = document.getElementById('message-input');
  ta.addEventListener('input', () => autoResize(ta));
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      document.getElementById('send-btn').click();
    }
  });

  /* Version selector */
  document.getElementById('version-btn').addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('version-dropdown').classList.toggle('open');
  });
  document.addEventListener('click', () => {
    document.getElementById('version-dropdown').classList.remove('open');
  });
  document.getElementById('version-dropdown').addEventListener('click', e => {
    const item = e.target.closest('.ver-item');
    if (!item) return;
    const conv = getConv();
    if (conv) {
      conv.currentVersionId = item.dataset.verId;
      saveState(); renderChat();
    }
    document.getElementById('version-dropdown').classList.remove('open');
  });

  /* Add message button */
  document.getElementById('add-msg-btn').addEventListener('click', () => {
    document.getElementById('addmsg-content').value = '';
    document.getElementById('role-user').checked = true;
    openModal('addmsg-overlay');
  });
  document.getElementById('addmsg-confirm-btn').addEventListener('click', () => {
    const conv = getConv();
    const ver  = getCurVer();
    if (!conv || !ver) return;
    const role    = document.querySelector('input[name="add-role"]:checked')?.value || 'user';
    const content = document.getElementById('addmsg-content').value.trim();
    if (!content) { toast('请输入消息内容', 'error'); return; }
    const msg = { id: 'msg_' + uid(), role, content, timestamp: now() };
    ver.messages.push(msg);
    if (role === 'user') autoTitle(conv, content);
    saveState(); renderChat();
    closeModal('addmsg-overlay');
    toast('消息已插入 ✓', 'success');
  });

  /* Settings */
  document.getElementById('settings-btn').addEventListener('click', () => {
    renderProfileList();
    loadParamsToForm();
    openModal('settings-overlay');
  });
  document.getElementById('open-profile-mgr-btn').addEventListener('click', () => {
    renderProfileList();
    loadParamsToForm();
    openModal('settings-overlay');
    // Switch to profiles tab
    document.querySelector('[data-tab="tab-profiles"]').click();
  });
  document.getElementById('save-params-btn').addEventListener('click', saveParams);

  /* Profile management */
  document.getElementById('new-profile-btn').addEventListener('click', openNewProfile);
  document.getElementById('save-profile-btn').addEventListener('click', saveProfile);

  /* Edit message modal */
  document.getElementById('edit-save-only-btn').addEventListener('click', () => {
    if (!editCtx) return;
    const conv = state.conversations[editCtx.convId];
    const ver  = conv?.versions[editCtx.versionId];
    if (!ver) return;
    ver.messages[editCtx.msgIndex].content = document.getElementById('edit-content').value;
    saveState(); renderChat();
    closeModal('edit-overlay');
    toast('已保存 ✓', 'success');
  });
  document.getElementById('edit-save-send-btn').addEventListener('click', () => {
    if (!editCtx || isStreaming) return;
    const conv = state.conversations[editCtx.convId];
    const ver  = conv?.versions[editCtx.versionId];
    if (!ver) return;

    const newContent = document.getElementById('edit-content').value;
    const base = ver.messages.slice(0, editCtx.msgIndex + 1);
    base[editCtx.msgIndex] = { ...ver.messages[editCtx.msgIndex], content: newContent };

    state.currentConversationId = editCtx.convId;
    const newVer = forkVersion(conv, base, editCtx.versionId);
    closeModal('edit-overlay');
    saveState(); renderChat();
    toast(`已分叉为 ${newVer.label}，AI 生成中…`, 'info');
    sendMessage(null, true);
  });

  /* Gist sync */
  document.getElementById('gist-btn').addEventListener('click', () => {
    const cfg = state.gistConfig || {};
    // 永远不把编码后的 token 放进输入框，用 placeholder 提示已保存
    document.getElementById('gist-token').value = '';
    document.getElementById('gist-token').placeholder = cfg.token
      ? '已保存（如需更换请重新输入）'
      : 'ghp_xxxxxxxxxxxxxxxxxxxx';
    document.getElementById('gist-id').value = cfg.gistId || '';
    document.getElementById('gist-status').className = cfg.token ? 'status-dot ok' : 'status-dot';
    openModal('gist-overlay');
  });
  document.getElementById('save-gist-btn').addEventListener('click', () => {
    saveGistConfig();
    closeModal('gist-overlay');
    toast('Gist 配置已保存 ✓', 'success');
  });
  document.getElementById('gist-test-btn').addEventListener('click', gistTest);
  document.getElementById('gist-backup-btn').addEventListener('click', gistBackup);
  document.getElementById('gist-restore-btn').addEventListener('click', () => {
    if (confirm('此操作将覆盖所有本地数据，确认从 Gist 恢复？')) gistRestore();
  });

  /* Import / Export */
  document.getElementById('export-btn').addEventListener('click', exportData);
  document.getElementById('import-file').addEventListener('change', e => {
    importData(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('clear-all-btn').addEventListener('click', () => {
    if (!confirm('确定清空所有对话？此操作不可恢复！')) return;
    state.conversations = {};
    state.currentConversationId = null;
    saveState(); fullRender();
    toast('已清空所有对话', 'info');
  });
}
