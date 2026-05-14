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
  stream: true,
  thinkingEnabled: false,
  thinkingEffort: 'high'
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

/* ─── Version divergence helpers ─── */

/**
 * Returns true if `msgs[0..len-1]` is identical to `prefix[0..len-1]`.
 * Identity is checked by id + role + content (covers edited messages that
 * keep the same id but get new content).
 */
function versionSharesPrefix(msgs, prefix, len) {
  for (let j = 0; j < len; j++) {
    const pm = prefix[j];
    const vm = msgs[j];
    if (!pm || !vm) return false;
    if (vm.id !== pm.id || vm.role !== pm.role || vm.content !== pm.content) return false;
  }
  return true;
}

/** Stable fingerprint for a message slot; '__end__' when the version stops here. */
function msgFingerprint(msg) {
  if (!msg) return '__end__';
  return `${msg.id}\x00${msg.role}\x00${msg.content}`;
}

/**
 * Among the versions in `group` (all sharing the same message at `divIdx`),
 * find the "introducer": the earliest version whose parent either lacks or
 * differs at `divIdx`. This is the version that first created this alternative,
 * which makes the best representative to switch to.
 */
function findIntroducer(conv, group, divIdx) {
  const sorted = [...group].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true }));

  for (const v of sorted) {
    if (!v.parentVersionId) return v;           // root — always the originator
    const parent = conv.versions[v.parentVersionId];
    if (!parent) return v;
    const pMsg = parent.messages[divIdx];
    const vMsg = v.messages[divIdx];
    // If the parent didn't have this message (or had a different one), v introduced it
    if (!pMsg || !vMsg || pMsg.id !== vMsg.id || pMsg.content !== vMsg.content) return v;
  }
  return sorted[0];
}

/**
 * Compute all fork-point switchers that should be displayed when rendering
 * the current version, sorted top-to-bottom by message index.
 *
 * Algorithm: scan every position i from 0 to curVer.messages.length (inclusive).
 * At each i, collect every version that shares curVer's exact prefix [0..i-1].
 * If those versions differ at position i (different message or some end here),
 * that's a fork point. Build one representative per distinct branch.
 *
 * This correctly handles:
 *   • Viewing the root version (v1) which has no parent but does have children.
 *   • Nested forks at multiple depths.
 *   • "Trailing" forks where curVer ends but siblings continue (or vice-versa).
 *
 * Each returned object: { divIdx, forkGroup, activeBranchId }
 *   divIdx        — message index where branches diverge
 *   forkGroup     — array of representative versions, one per distinct branch,
 *                   sorted by label
 *   activeBranchId — id of the representative that IS curVer (always present)
 */
function getAllForkPoints(conv) {
  const curVer = conv.versions[conv.currentVersionId];
  if (!curVer) return [];

  const allVersions = Object.values(conv.versions);
  if (allVersions.length <= 1) return [];

  const curMsgs = curVer.messages;
  const forkPoints = [];

  for (let i = 0; i <= curMsgs.length; i++) {
    // ── Step 1: versions sharing curVer's prefix [0..i-1] ──
    const compatible = allVersions.filter(v =>
      versionSharesPrefix(v.messages, curMsgs, i)
    );
    if (compatible.length <= 1) continue;

    // ── Step 2: group by what they have at position i ──
    const byMsg = new Map();
    for (const v of compatible) {
      const fp = msgFingerprint(v.messages[i]);
      if (!byMsg.has(fp)) byMsg.set(fp, []);
      byMsg.get(fp).push(v);
    }
    if (byMsg.size <= 1) continue; // All agree at position i — no fork

    // ── Step 3: pick the introducer as each group's representative ──
    const forkGroup = [];
    let activeRepId = null;
    for (const [, group] of byMsg) {
      const rep = findIntroducer(conv, group, i);
      forkGroup.push(rep);
      if (group.some(v => v.id === curVer.id)) activeRepId = rep.id;
    }

    forkGroup.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true }));

    forkPoints.push({ divIdx: i, forkGroup, activeBranchId: activeRepId });
  }

  // Already in ascending-index order (we iterated i=0..n)
  return forkPoints;
}

function getRelatedVersions(conv) {
  return Object.values(conv.versions)
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
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
