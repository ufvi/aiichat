/* js/state.js — Application state, profiles, localStorage */

const STORAGE_KEY = 'polychat_v2';

const DEFAULT_PROFILE_CONFIG = {
  endpoint: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  model: 'gpt-4o',
  systemPrompt: '',
  temperature: 0.7,
  maxTokens: 2048,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  stream: true
};

function createProfile(id, name, overrides = {}) {
  return { id, name, ...DEFAULT_PROFILE_CONFIG, ...overrides };
}

let state = {
  conversations: {},
  currentConversationId: null,
  apiProfiles: {},
  currentProfileId: null,
  gistConfig: { token: '', gistId: '' }
};

/* ─── Profile helpers ─── */
function getActiveProfile() {
  const p = state.apiProfiles[state.currentProfileId];
  if (p) return p;
  const profiles = Object.values(state.apiProfiles);
  return profiles[0] || createProfile('_fallback', 'Default');
}

function ensureDefaultProfile() {
  if (Object.keys(state.apiProfiles).length === 0) {
    const id = 'p_' + uid();
    state.apiProfiles[id] = createProfile(id, 'Default');
    state.currentProfileId = id;
  }
  if (!state.currentProfileId || !state.apiProfiles[state.currentProfileId]) {
    state.currentProfileId = Object.keys(state.apiProfiles)[0];
  }
}

/* ─── Conversation helpers ─── */
function getConv() {
  return state.conversations[state.currentConversationId] || null;
}

function getCurVer() {
  const c = getConv();
  return c ? c.versions[c.currentVersionId] : null;
}

/* ─── Version management ─── */
function computeVersionLabel(conv, parentVersionId) {
  const allLabels = Object.values(conv.versions).map(v => v.label);
  if (!parentVersionId) {
    const nums = allLabels.map(l => { const m = l.match(/^v(\d+)$/); return m ? parseInt(m[1]) : 0; });
    return 'v' + (Math.max(0, ...nums) + 1);
  }
  const parent = conv.versions[parentVersionId];
  const base = parent ? parent.label : 'v1';
  const prefix = base + '.';
  const nums = allLabels
    .filter(l => l.startsWith(prefix))
    .map(l => { const rest = l.slice(prefix.length); const m = rest.match(/^(\d+)/); return m ? parseInt(m[1]) : 0; });
  return prefix + (Math.max(0, ...nums) + 1);
}

function newConversation() {
  const convId = 'c_' + uid();
  const verId  = 'v_' + uid();
  const conv = {
    id: convId, title: '新对话', createdAt: now(),
    currentVersionId: verId,
    versions: {
      [verId]: { id: verId, parentVersionId: null, label: 'v1', createdAt: now(), messages: [] }
    }
  };
  state.conversations[convId] = conv;
  return conv;
}

function forkVersion(conv, baseMessages, parentVersionId) {
  const verId = 'v_' + uid();
  const label = computeVersionLabel(conv, parentVersionId);
  conv.versions[verId] = {
    id: verId, parentVersionId, label, createdAt: now(),
    messages: baseMessages.map(m => ({ ...m }))
  };
  conv.currentVersionId = verId;
  return conv.versions[verId];
}

function autoTitle(conv, firstUserMsg) {
  if (conv.title === '新对话' && firstUserMsg) {
    conv.title = firstUserMsg.slice(0, 28) + (firstUserMsg.length > 28 ? '…' : '');
  }
}

/* ─── LocalStorage ─── */
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { console.error('saveState failed', e); }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);

    state.conversations = saved.conversations || {};
    state.gistConfig   = saved.gistConfig    || { token: '', gistId: '' };
    state.currentConversationId = saved.currentConversationId || null;

    // Migrate old format (single apiConfig → profile)
    if (saved.apiConfig && !saved.apiProfiles) {
      const id = 'p_' + uid();
      state.apiProfiles = {
        [id]: createProfile(id, 'Migrated Config', saved.apiConfig)
      };
      state.currentProfileId = id;
    } else {
      state.apiProfiles    = saved.apiProfiles    || {};
      state.currentProfileId = saved.currentProfileId || null;
    }

    ensureDefaultProfile();

    // Validate currentConversationId
    if (state.currentConversationId && !state.conversations[state.currentConversationId]) {
      state.currentConversationId = null;
    }
  } catch (e) {
    console.error('loadState failed', e);
    ensureDefaultProfile();
  }
}
