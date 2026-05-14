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
  document.getElementById('add-msg-btn').style.display  = conv ? '' : 'none';

  if (!conv) {
    msgEl.innerHTML = '<div class="empty-state"><div class="empty-icon">💬</div><p>选择或新建对话，开始聊天</p></div>';
    return;
  }

  const ver = getCurVer();

  if (!ver || ver.messages.length === 0) {
    msgEl.innerHTML = '<div class="empty-state"><div class="empty-icon">✨</div><p>发送消息开始对话</p></div>';
    return;
  }

  msgEl.innerHTML = '';

  const forkPoints = getAllForkPoints(conv);

  if (forkPoints.length === 0) {
    // No branching — render all messages normally
    ver.messages.forEach((m, i) => appendMsgElement(m, i));
  } else {
    // Render messages interleaved with switchers at each fork point (sorted top-to-bottom)
    let cursor = 0;
    for (const fp of forkPoints) {
      for (let i = cursor; i <= fp.divIdx && i < ver.messages.length; i++) {
        appendMsgElement(ver.messages[i], i);
      }
      cursor = Math.max(cursor, fp.divIdx + 1);
      appendInlineVersionSwitcher(conv, fp.forkGroup, fp.activeBranchId, fp.divIdx);
    }
    // Render remaining messages after the last fork point
    for (let i = cursor; i < ver.messages.length; i++) {
      appendMsgElement(ver.messages[i], i);
    }
  }

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
    <div class="msg-body">${isStreamingPlaceholder ? '' : buildMsgBodyHTML(msg.content, msg.reasoning, false)}</div>
  `;
  container.appendChild(wrap);
  return wrap;
}

function appendInlineVersionSwitcher(conv, forkGroup, activeBranchId, divIdx) {
  const container = document.getElementById('messages-container');
  const empty = container.querySelector('.empty-state');
  if (empty) empty.remove();

  const activeIdx = forkGroup.findIndex(v => v.id === activeBranchId);
  if (activeIdx < 0) return null;

  const isFirst = activeIdx === 0;
  const isLast  = activeIdx === forkGroup.length - 1;
  const groupIds  = forkGroup.map(v => v.id); // plain array — no HTML encoding needed

  const wrap = document.createElement('div');
  wrap.className = 'version-switcher-inline';
  wrap.dataset.divIdx = divIdx;
  wrap.dataset.groupIds = JSON.stringify(groupIds);
  wrap.dataset.activeBranchId = activeBranchId;

  const prevBtn = document.createElement('button');
  prevBtn.className   = 'ver-switch-arrow';
  prevBtn.title       = isFirst ? '已是第一个分支' : '上一个分支';
  prevBtn.textContent = '◀';
  prevBtn.disabled    = isFirst;
  prevBtn.addEventListener('click', () => switchAtForkPoint(groupIds, activeBranchId, -1, divIdx));

  const infoDiv = document.createElement('div');
  infoDiv.className = 'ver-switch-info';

  const labelSpan = document.createElement('span');
  labelSpan.className   = 'ver-switch-label';
  labelSpan.textContent = activeIdx + 1;

  const sepSpan = document.createElement('span');
  sepSpan.className   = 'ver-switch-sep';
  sepSpan.textContent = '/';

  const totalSpan = document.createElement('span');
  totalSpan.className   = 'ver-switch-total';
  totalSpan.textContent = forkGroup.length;

  infoDiv.append(labelSpan, sepSpan, totalSpan);

  const nextBtn = document.createElement('button');
  nextBtn.className   = 'ver-switch-arrow';
  nextBtn.title       = isLast ? '已是最后一个分支' : '下一个分支';
  nextBtn.textContent = '▶';
  nextBtn.disabled    = isLast;
  nextBtn.addEventListener('click', () => switchAtForkPoint(groupIds, activeBranchId, 1, divIdx));

  wrap.append(prevBtn, infoDiv, nextBtn);
  container.appendChild(wrap);
  return wrap;
}

function refreshSwitcher(wrap, fp) {
  const { forkGroup, activeBranchId, divIdx } = fp;
  const activeIdx = forkGroup.findIndex(v => v.id === activeBranchId);
  if (activeIdx < 0) return;
  const groupIds = forkGroup.map(v => v.id);
  const isFirst = activeIdx === 0, isLast = activeIdx === forkGroup.length - 1;

  wrap.dataset.groupIds = JSON.stringify(groupIds);
  wrap.dataset.activeBranchId = activeBranchId;
  wrap.querySelector('.ver-switch-label').textContent = activeIdx + 1;
  wrap.querySelector('.ver-switch-total').textContent = forkGroup.length;

  const mkBtn = (text, dir, disabled, title) => {
    const b = document.createElement('button');
    b.className = 'ver-switch-arrow'; b.textContent = text;
    b.disabled = disabled; b.title = title;
    b.addEventListener('click', () => switchAtForkPoint(groupIds, activeBranchId, dir, divIdx));
    return b;
  };
  wrap.firstChild.replaceWith(mkBtn('◀', -1, isFirst, isFirst ? '已是第一个分支' : '上一个分支'));
  wrap.lastChild.replaceWith(mkBtn('▶',  1, isLast,  isLast  ? '已是最后一个分支' : '下一个分支'));
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

  const thinkingEl = document.getElementById('cfg-thinking');
  const effortGroup = document.getElementById('cfg-thinking-effort-group');
  if (thinkingEl) thinkingEl.checked = !!p.thinkingEnabled;
  if (effortGroup) effortGroup.style.display = p.thinkingEnabled ? '' : 'none';
  const effortEl = document.getElementById('cfg-thinking-effort');
  if (effortEl) effortEl.value = p.thinkingEffort || 'high';

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

/* ─── Thinking / Reasoning block ─── */
function buildThinkingHTML(reasoning, isStreaming) {
  if (!reasoning) return '';
  const openAttr = isStreaming ? ' open' : '';
  return `<details class="thinking-block"${openAttr}>
    <summary class="thinking-summary"><span class="thinking-icon">🧠</span> 思考过程<span class="thinking-indicator"></span></summary>
    <div class="thinking-content">${renderMarkdown(reasoning)}</div>
  </details>`;
}

function buildMsgBodyHTML(content, reasoning, isStreaming) {
  let html = '';
  if (reasoning) html += buildThinkingHTML(reasoning, isStreaming);
  html += renderMarkdown(content);
  return html;
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
