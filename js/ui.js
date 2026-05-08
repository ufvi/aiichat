/* js/ui.js — All rendering functions */

/* ─── Top-level render ─── */
function fullRender() {
  renderConvList();
  renderChat();
  renderApiStatus();
  renderSidebarProfile();
}

/* ─── Conversation list ─── */
function renderConvList() {
  const list = document.getElementById('conversation-list');
  const convs = Object.values(state.conversations).sort((a, b) => b.createdAt - a.createdAt);

  if (convs.length === 0) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-3);font-size:12px;">暂无对话</div>';
    return;
  }

  list.innerHTML = convs.map(c => {
    const ver      = c.versions[c.currentVersionId];
    const msgCount = ver ? ver.messages.length : 0;
    const verCount = Object.keys(c.versions).length;
    const active   = c.id === state.currentConversationId;
    return `<div class="conv-item ${active ? 'active' : ''}" data-conv-id="${c.id}">
      <span class="conv-icon">💬</span>
      <div class="conv-info">
        <div class="conv-title">${escHtml(c.title)}</div>
        <div class="conv-meta">${msgCount} 条 · ${verCount} 版本 · ${fmtTime(c.createdAt)}</div>
      </div>
      <button class="conv-delete" data-conv-id="${c.id}" title="删除对话">✕</button>
    </div>`;
  }).join('');
}

/* ─── Chat area ─── */
function renderChat() {
  const conv   = getConv();
  const msgEl  = document.getElementById('messages-container');

  document.getElementById('chat-title').textContent = conv ? conv.title : '未选择对话';
  document.getElementById('version-btn').style.display  = conv ? '' : 'none';
  document.getElementById('add-msg-btn').style.display  = conv ? '' : 'none';

  if (!conv) {
    msgEl.innerHTML = '<div class="empty-state"><div class="empty-icon">💬</div><p>选择或新建对话，开始聊天</p></div>';
    document.getElementById('ver-label-text').textContent = '—';
    return;
  }

  const ver = getCurVer();
  document.getElementById('ver-label-text').textContent = ver ? ver.label : '—';

  if (!ver || ver.messages.length === 0) {
    msgEl.innerHTML = '<div class="empty-state"><div class="empty-icon">✨</div><p>发送消息开始对话</p></div>';
    renderVersionSelector();
    return;
  }

  msgEl.innerHTML = '';
  ver.messages.forEach((m, i) => appendMsgElement(m, i));
  renderVersionSelector();
  scrollToBottom();
}

/* ─── Single message element ─── */
function appendMsgElement(msg, idx, isStreamingPlaceholder = false) {
  const container = document.getElementById('messages-container');
  const empty = container.querySelector('.empty-state');
  if (empty) empty.remove();

  const roleNames = { user: '👤 用户', assistant: '🤖 AI', system: '⚙ 系统' };
  const wrap = document.createElement('div');
  wrap.className = `msg-wrapper ${msg.role}`;
  wrap.dataset.msgId = msg.id;

  wrap.innerHTML = `
    <div class="msg-header">
      <span class="role-badge ${msg.role}">${roleNames[msg.role] || msg.role}</span>
      <span class="msg-timestamp">${fmtTime(msg.timestamp)}</span>
      <div class="msg-actions" id="actions-${msg.id}">${buildActionBtns(msg)}</div>
    </div>
    <div class="msg-body">${isStreamingPlaceholder ? '' : renderMarkdown(msg.content)}</div>
  `;
  container.appendChild(wrap);
  return wrap;
}

function buildActionBtns(msg) {
  const id = msg.id;
  let html = `<button class="msg-action-btn" onclick="copyMsg('${id}')">⎘ 复制</button>`;
  html    += `<button class="msg-action-btn" onclick="editMsg('${id}')">✏ 编辑</button>`;
  if (msg.role === 'assistant') {
    html  += `<button class="msg-action-btn regen" onclick="regenMsg('${id}')">↺ 重新生成</button>`;
  }
  html    += `<button class="msg-action-btn danger" onclick="deleteMsg('${id}')">✕</button>`;
  return html;
}

/* ─── Version selector dropdown ─── */
function renderVersionSelector() {
  const conv = getConv();
  const dd   = document.getElementById('version-dropdown');
  if (!conv) { dd.innerHTML = ''; return; }

  const vers = Object.values(conv.versions)
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

  dd.innerHTML = vers.map(v => {
    const isActive = v.id === conv.currentVersionId;
    const parent   = v.parentVersionId ? conv.versions[v.parentVersionId] : null;
    return `<div class="ver-item ${isActive ? 'active' : ''}" data-ver-id="${v.id}">
      <span class="ver-label">${v.label}</span>
      <div class="ver-info">
        <strong>${v.messages.length} 条消息</strong>
        <span>${parent ? '分叉自 ' + parent.label : '主线'} · ${fmtTime(v.createdAt)}</span>
      </div>
      ${isActive ? '<span style="color:var(--accent);font-size:11px">●</span>' : ''}
    </div>`;
  }).join('');
}

/* ─── Profile list (in settings) ─── */
function renderProfileList() {
  const list = document.getElementById('profile-list');
  const profiles = Object.values(state.apiProfiles);

  if (profiles.length === 0) {
    list.innerHTML = '<div style="color:var(--text-3);font-size:12px;padding:10px 0">暂无方案，请新建。</div>';
    return;
  }

  list.innerHTML = profiles.map(p => {
    const isActive = p.id === state.currentProfileId;
    const endpoint = p.endpoint ? new URL(p.endpoint).hostname : '—';
    return `<div class="profile-item ${isActive ? 'active-profile' : ''}">
      <div class="profile-active-indicator"></div>
      <div class="profile-details">
        <div class="profile-item-name">${escHtml(p.name)}</div>
        <div class="profile-item-meta">${escHtml(p.model)} · ${escHtml(endpoint)}</div>
      </div>
      <div class="profile-actions">
        ${!isActive ? `<button class="profile-action-btn switch-btn" onclick="switchToProfile('${p.id}')">切换</button>` : '<button class="profile-action-btn" disabled style="opacity:0.4">当前</button>'}
        <button class="profile-action-btn" onclick="openEditProfile('${p.id}')">编辑</button>
        ${profiles.length > 1 ? `<button class="profile-action-btn danger-btn" onclick="deleteProfile('${p.id}')">删除</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

/* ─── Sidebar profile indicator ─── */
function renderSidebarProfile() {
  const p = getActiveProfile();
  document.getElementById('sidebar-profile-name').textContent  = p.name || '未配置';
  document.getElementById('sidebar-profile-model').textContent = p.model || '';
}

/* ─── API status in input meta ─── */
function renderApiStatus() {
  const p     = getActiveProfile();
  const hasKey = !!p.apiKey.trim();
  const dot   = document.getElementById('api-status-dot');
  const label = document.getElementById('api-status-label');
  dot.className = 'status-dot ' + (hasKey ? 'ok' : 'err');
  label.textContent = p.model || '未配置';
}

/* ─── Load params into settings form ─── */
function loadParamsToForm() {
  const p = getActiveProfile();
  setSlider('cfg-temp',       'cfg-temp-val',       p.temperature);
  setSlider('cfg-max-tokens', 'cfg-max-tokens-val', p.maxTokens);
  setSlider('cfg-top-p',      'cfg-top-p-val',      p.topP);
  setSlider('cfg-freq-pen',   'cfg-freq-pen-val',   p.frequencyPenalty);
  setSlider('cfg-pres-pen',   'cfg-pres-pen-val',   p.presencePenalty);

  document.getElementById('stat-convs').textContent    = Object.keys(state.conversations).length;
  document.getElementById('stat-profiles').textContent = Object.keys(state.apiProfiles).length;
  document.getElementById('stat-size').textContent     = getStorageSize();
}

function setSlider(sliderId, valId, value) {
  const sl = document.getElementById(sliderId);
  const vl = document.getElementById(valId);
  if (sl) sl.value = value;
  if (vl) vl.value = value;
}

/* ─── Helpers ─── */
function scrollToBottom() {
  const c = document.getElementById('messages-container');
  c.scrollTop = c.scrollHeight;
}

/* ─── Mobile sidebar ─── */
function openMobileSidebar() {
  document.getElementById('sidebar').classList.add('mobile-open');
  document.getElementById('sidebar-overlay').classList.add('visible');
}

function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
}
