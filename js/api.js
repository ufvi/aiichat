/* js/api.js — OpenAI-compatible API client */

let isStreaming = false;
let abortController = null;

async function callAPI(messages, onChunk) {
  const profile = getActiveProfile();
  const { endpoint, apiKey, model, systemPrompt, temperature, maxTokens,
          topP, frequencyPenalty, presencePenalty, stream,
          thinkingEnabled, thinkingEffort } = profile;

  const apiMsgs = [];
  if (systemPrompt && systemPrompt.trim()) {
    apiMsgs.push({ role: 'system', content: systemPrompt });
  }
  for (const m of messages) {
    apiMsgs.push({ role: m.role, content: m.content });
  }

  abortController = new AbortController();

  const requestBody = {
    model,
    messages: apiMsgs,
    temperature: parseFloat(temperature),
    max_tokens: parseInt(maxTokens),
    top_p: parseFloat(topP),
    frequency_penalty: parseFloat(frequencyPenalty),
    presence_penalty: parseFloat(presencePenalty),
    stream
  };

  // Thinking / reasoning controls
  const effort = thinkingEffort || 'high';
  if (thinkingEnabled) {
    // OpenAI-compatible format
    requestBody.thinking = { type: 'enabled' };
    if (effort) {
      requestBody.reasoning_effort = effort;
    }
    // Anthropic-compatible format (for proxies / alternative endpoints)
    requestBody.output_config = { effort };
  } else {
    // Explicitly disable thinking — model won't produce reasoning_content
    requestBody.thinking = { type: 'disabled' };
  }

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody),
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
    let fullContent = '';
    let fullReasoning = '';
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
        if (d === '[DONE]') return { content: fullContent, reasoning: fullReasoning };
        try {
          const json = JSON.parse(d);
          const delta = json.choices?.[0]?.delta;
          if (!delta) continue;
          if (delta.content) {
            fullContent += delta.content;
          }
          if (delta.reasoning_content) {
            fullReasoning += delta.reasoning_content;
          }
          onChunk(fullContent, fullReasoning);
        } catch (_) {}
      }
    }
    return { content: fullContent, reasoning: fullReasoning };
  } else {
    const data = await resp.json();
    const msg = data.choices?.[0]?.message || {};
    const content = msg.content || '';
    const reasoning = msg.reasoning_content || '';
    onChunk(content, reasoning);
    return { content, reasoning };
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
    let fullReasoning = '';

    try {
      const result = await callAPI(msgsForAPI, (content, reasoning) => {
        fullContent = content;
        fullReasoning = reasoning || '';
        aiMsg.content = fullContent;
        aiMsg.reasoning = fullReasoning;
        if (bodyEl) bodyEl.innerHTML = buildMsgBodyHTML(fullContent, fullReasoning, true);
      });
      fullContent = result.content;
      fullReasoning = result.reasoning || '';
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
    aiMsg.reasoning = fullReasoning;
    if (bodyEl) {
      bodyEl.classList.remove('streaming');
      bodyEl.innerHTML = buildMsgBodyHTML(fullContent, fullReasoning, false);
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
