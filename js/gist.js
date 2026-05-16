/* js/gist.js — GitHub Gist 云同步 */

const GIST_FILENAME = 'polychat_backup.json';

/* ─── Token 混淆 ─── */
function encodeToken(t) { return btoa(t.split('').reverse().join('')); }
function decodeToken(e) { try { return atob(e).split('').reverse().join(''); } catch { return e; } }
function getStoredToken() { const r = state.gistConfig?.token || ''; return r ? decodeToken(r) : ''; }

function gistHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

function resolveToken() {
  const inputVal = document.getElementById('gist-token')?.value.trim();
  return inputVal || getStoredToken();
}

/* ─── 验证 Token ─── */
async function gistTest() {
  const dot = document.getElementById('gist-status');
  dot.className = 'status-dot loading';
  const token = resolveToken();
  if (!token) { dot.className = 'status-dot err'; toast('请填写 Token', 'error'); return; }

  try {
    const resp = await fetch('https://api.github.com/user', { headers: gistHeaders(token) });
    const data = await resp.json();
    if (resp.ok) {
      dot.className = 'status-dot ok';
      persistToken(token);
      toast(`验证成功，用户：${data.login} ✓`, 'success');
    } else {
      dot.className = 'status-dot err';
      toast('Token 无效：' + (data.message || resp.status), 'error');
    }
  } catch (e) {
    dot.className = 'status-dot err';
    toast('连接失败：' + e.message, 'error');
  }
}

function persistToken(rawToken) {
  const inputEl = document.getElementById('gist-token');
  const gistIdInput = document.getElementById('gist-id').value.trim();
  state.gistConfig = {
    token:  encodeToken(rawToken),
    gistId: gistIdInput || state.gistConfig?.gistId || ''
  };
  saveState();
  if (inputEl) {
    inputEl.value = '';
    inputEl.placeholder = '已保存（如需更换请重新输入）';
  }
}

/* ─── 备份 ─── */
async function gistBackup() {
  const token = resolveToken();
  if (!token) { toast('请先填写并验证 Token', 'error'); return; }
  if (token !== getStoredToken()) persistToken(token);

  const gistId = state.gistConfig?.gistId || '';
  const convCount = Object.keys(state.conversations).length;

  const backupData = {
    conversations:    state.conversations,
    apiProfiles:      state.apiProfiles,
    currentProfileId: state.currentProfileId,
    _backupTime:      now(),
    _version:         2
  };

  const payload = {
    description: 'PolyChat Backup',
    public: false,
    files: { [GIST_FILENAME]: { content: JSON.stringify(backupData, null, 2) } }
  };

  try {
    const url    = gistId ? `https://api.github.com/gists/${gistId}` : 'https://api.github.com/gists';
    const method = gistId ? 'PATCH' : 'POST';
    const resp   = await fetch(url, { method, headers: gistHeaders(token), body: JSON.stringify(payload) });
    const data   = await resp.json();

    if (resp.ok) {
      if (!state.gistConfig) state.gistConfig = { token: '', gistId: '' };
      state.gistConfig.gistId = data.id;
      document.getElementById('gist-id').value = data.id;
      saveState();
      toast(`备份成功 ✓  共 ${convCount} 个对话`, 'success');
    } else {
      toast('备份失败：' + (data.message || resp.status), 'error');
    }
  } catch (e) {
    toast('备份失败：' + e.message, 'error');
  }
}

/* ─── 恢复 ─── */
async function gistRestore() {
  const token  = resolveToken();
  if (!token) { toast('请先填写并验证 Token', 'error'); return; }
  if (token !== getStoredToken()) persistToken(token);

  const gistId = document.getElementById('gist-id').value.trim() || state.gistConfig?.gistId || '';
  if (!gistId) { toast('请填写 Gist ID', 'error'); return; }

  try {
    const resp = await fetch(`https://api.github.com/gists/${gistId}`, { headers: gistHeaders(token) });
    const data = await resp.json();
    if (!resp.ok) { toast('获取失败：' + (data.message || resp.status), 'error'); return; }

    const fileInfo = data.files?.[GIST_FILENAME];
    if (!fileInfo) { toast(`Gist 中未找到 ${GIST_FILENAME}`, 'error'); return; }

    // GitHub 对大文件会截断 content，需用 raw_url 获取完整内容
    let rawContent = fileInfo.content;
    if (fileInfo.truncated || !rawContent) {
      const rawResp = await fetch(fileInfo.raw_url, { headers: gistHeaders(token) });
      if (!rawResp.ok) {
        toast('获取备份内容失败：' + rawResp.status, 'error');
        return;
      }
      rawContent = await rawResp.text();
    }

    const backup = JSON.parse(rawContent);
    if (!backup.conversations) { toast('备份文件格式不正确', 'error'); return; }

    // Merge conversations with conflict handling
    const { added, conflicted } = mergeConversations(backup.conversations);

    // Merge profiles (same strategy)
    let profileAdded = 0, profileConflicted = 0;
    if (backup.apiProfiles) {
      for (const pid of Object.keys(backup.apiProfiles)) {
        if (state.apiProfiles[pid]) {
          const newId = 'p_' + uid();
          state.apiProfiles[newId] = backup.apiProfiles[pid];
          state.apiProfiles[newId].id = newId;
          profileConflicted++;
        } else {
          state.apiProfiles[pid] = backup.apiProfiles[pid];
          profileAdded++;
        }
      }
    }

    // 修复新导入对话中无效的版本引用
    for (const cid of Object.keys(state.conversations)) {
      const c = state.conversations[cid];
      if (!c.versions || !c.versions[c.currentVersionId]) {
        const vers = Object.keys(c.versions || {});
        c.currentVersionId = vers[0] || null;
      }
    }

    state.currentConversationId = null;
    ensureDefaultProfile();
    saveState();
    closeModal('gist-overlay');
    fullRender();

    const parts = [];
    if (added > 0) parts.push(`新增 ${added} 个对话`);
    if (conflicted > 0) parts.push(`${conflicted} 个冲突已另存为新对话`);
    if (profileAdded > 0) parts.push(`新增 ${profileAdded} 个方案`);
    if (profileConflicted > 0) parts.push(`${profileConflicted} 个方案冲突已另存`);
    toast('恢复成功 ✓  ' + parts.join('，'), 'success');
  } catch (e) {
    toast('恢复失败：' + e.message, 'error');
  }
}

/* ─── 保存配置 ─── */
function saveGistConfig() {
  const inputVal = document.getElementById('gist-token').value.trim();
  if (inputVal) persistToken(inputVal);
  else {
    state.gistConfig = {
      ...state.gistConfig,
      gistId: document.getElementById('gist-id').value.trim()
    };
    saveState();
  }
}
