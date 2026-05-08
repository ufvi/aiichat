/* js/api.js — OpenAI-compatible API client */

let isStreaming = false;
let abortController = null;

async function callAPI(messages, onChunk) {
  const profile = getActiveProfile();
  const { endpoint, apiKey, model, systemPrompt, temperature, maxTokens,
          topP, frequencyPenalty, presencePenalty, stream } = profile;

  const apiMsgs = [];
  if (systemPrompt && systemPrompt.trim()) {
    apiMsgs.push({ role: 'system', content: systemPrompt });
  }
  for (const m of messages) {
    apiMsgs.push({ role: m.role, content: m.content });
  }

  abortController = new AbortController();

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: apiMsgs,
      temperature: parseFloat(temperature),
      max_tokens: parseInt(maxTokens),
      top_p: parseFloat(topP),
      frequency_penalty: parseFloat(frequencyPenalty),
      presence_penalty: parseFloat(presencePenalty),
      stream
    }),
    signal: abortController.signal
  });

  if (!resp.ok) {
    let errMsg = `HTTP ${resp.status}`;
    try {
      const errBody = await resp.json();
      errMsg = errBody.error?.message || errMsg;
    } catch (_) {}
    throw new Error(errMsg);
  }

  if (stream) {
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data: ')) continue;
        const d = t.slice(6);
        if (d === '[DONE]') return full;
        try {
          const json = JSON.parse(d);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) { full += delta; onChunk(delta, full); }
        } catch (_) {}
      }
    }
    return full;
  } else {
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '';
    onChunk(content, content);
    return content;
  }
}

function setSendingState(sending) {
  const sendBtn = document.getElementById('send-btn');
  const stopBtn = document.getElementById('stop-btn');
  sendBtn.disabled = sending;
  stopBtn.classList.toggle('visible', sending);
}

async function sendMessage(userText, isResumeVersion = false) {
  if (isStreaming) return;
  const conv = getConv();
  if (!conv) return;

  const profile = getActiveProfile();
  if (!profile.apiKey.trim()) {
    toast('请先在设置中配置 API Key', 'error');
    return;
  }

  isStreaming = true;
  setSendingState(true);

  try {
    const ver = getCurVer();
    if (!ver) return;

    // Append user message if not resuming
    if (!isResumeVersion && userText) {
      const userMsg = { id: 'msg_' + uid(), role: 'user', content: userText, timestamp: now() };
      ver.messages.push(userMsg);
      autoTitle(conv, userText);
      appendMsgElement(userMsg, ver.messages.length - 1);
      scrollToBottom();
    }

    // Add AI placeholder
    const aiMsg = { id: 'msg_' + uid(), role: 'assistant', content: '', timestamp: now() };
    ver.messages.push(aiMsg);
    const placeholder = appendMsgElement(aiMsg, ver.messages.length - 1, true);
    const bodyEl = placeholder ? placeholder.querySelector('.msg-body') : null;
    if (bodyEl) { bodyEl.innerHTML = ''; bodyEl.classList.add('streaming'); }
    scrollToBottom();

    // Messages to send (exclude streaming placeholder)
    const msgsForAPI = ver.messages.slice(0, -1);
    let fullContent = '';

    try {
      fullContent = await callAPI(msgsForAPI, (delta, full) => {
        fullContent = full;
        aiMsg.content = full;
        if (bodyEl) bodyEl.innerHTML = renderMarkdown(full);
        scrollToBottom();
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        toast('已停止生成', 'info');
      } else {
        toast('API 错误：' + err.message, 'error');
        ver.messages.pop();
        if (placeholder) placeholder.remove();
        isStreaming = false;
        setSendingState(false);
        saveState();
        renderConvList();
        return;
      }
    }

    aiMsg.content = fullContent;
    if (bodyEl) {
      bodyEl.classList.remove('streaming');
      bodyEl.innerHTML = renderMarkdown(fullContent);
      // Re-bind action buttons after content is final
      const actionsEl = placeholder.querySelector(`#actions-${aiMsg.id}`);
      if (actionsEl) actionsEl.innerHTML = buildActionBtns(aiMsg);
    }

    saveState();
    renderConvList();
    renderVersionSelector();
  } finally {
    isStreaming = false;
    setSendingState(false);
  }
}
