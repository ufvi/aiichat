/* js/markdown.js — Markdown rendering + syntax highlighting */

function escHtmlInner(t) {
  return String(t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlightCode(code, lang) {
  const KW = {
    javascript: /\b(const|let|var|function|return|if|else|for|while|class|new|import|export|from|as|async|await|try|catch|throw|typeof|this|null|undefined|true|false|of|in|switch|case|break|default|extends|super)\b/g,
    typescript: /\b(const|let|var|function|return|if|else|for|while|class|new|import|export|from|as|async|await|try|catch|throw|typeof|this|null|undefined|true|false|interface|type|enum|extends|implements|super|abstract|readonly|keyof)\b/g,
    python:     /\b(def|class|return|if|elif|else|for|while|import|from|as|with|try|except|finally|raise|True|False|None|lambda|and|or|not|in|is|pass|break|continue|yield|global|nonlocal)\b/g,
    java:       /\b(public|private|protected|class|interface|extends|implements|new|return|if|else|for|while|try|catch|finally|throw|static|final|void|this|super|null|true|false|import|package)\b/g,
    go:         /\b(func|var|const|type|struct|interface|return|if|else|for|range|switch|case|break|default|import|package|go|chan|select|defer|map|nil|true|false)\b/g,
    rust:       /\b(fn|let|mut|const|struct|enum|impl|trait|use|mod|pub|return|if|else|for|while|loop|match|Some|None|Ok|Err|true|false|self|Self|super|crate|async|await|move|ref|where)\b/g,
    css:        /\b(color|background|border|margin|padding|font|display|position|width|height|top|left|right|bottom|flex|grid|animation|transition|transform|opacity|overflow|cursor|pointer)\b/g,
  };
  const lang2 = (lang || '').toLowerCase();
  const aliases = { js: 'javascript', ts: 'typescript', py: 'python' };
  const resolvedLang = aliases[lang2] || lang2;

  // Temporary placeholder approach to avoid nested replacement issues
  const ph = [];
  let idx = 0;
  function placeholder(html) { const t = `\x00${idx++}\x00`; ph.push(html); return t; }

  let out = code;
  // Comments first
  out = out.replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)/g, m => placeholder(`<span class="tok-cmt">${escHtmlInner(m)}</span>`));
  // Strings
  out = out.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, m => placeholder(`<span class="tok-str">${escHtmlInner(m)}</span>`));
  // Numbers
  out = out.replace(/\b(\d+\.?\d*)\b/g, m => placeholder(`<span class="tok-num">${m}</span>`));
  // Keywords
  const kwRe = KW[resolvedLang];
  if (kwRe) out = out.replace(kwRe, m => placeholder(`<span class="tok-kw">${m}</span>`));
  // Function names
  out = out.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g, m => placeholder(`<span class="tok-fn">${m.replace(/\s*$/, '')}</span>(`));

  // Escape remaining HTML
  out = out.replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[ch]));
  // Restore placeholders
  return out.replace(/\x00(\d+)\x00/g, (_, i) => ph[+i]);
}

function renderMarkdown(raw) {
  if (!raw) return '';

  // Step 1: extract code blocks to protect them
  const codeBlocks = [];
  let out = raw.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const escapedCode = escHtmlInner(code.trimEnd());
    const highlighted = highlightCode(escapedCode, lang);
    const langLabel = lang || 'CODE';
    const block = `<div class="code-block"><div class="code-block-header"><span class="code-lang">${langLabel}</span><button class="code-copy-btn" onclick="copyCode(this)">复制</button></div><code>${highlighted}</code></div>`;
    codeBlocks.push(block);
    return `\x01CODE${codeBlocks.length - 1}\x01`;
  });

  // Inline code
  out = out.replace(/`([^`\n]+)`/g, (_, code) =>
    `<code class="inline-code">${escHtmlInner(code)}</code>`
  );

  // Headers
  out = out.replace(/^#{3} (.+)$/gm, '<h3>$1</h3>');
  out = out.replace(/^#{2} (.+)$/gm, '<h2>$1</h2>');
  out = out.replace(/^# (.+)$/gm,    '<h1>$1</h1>');

  // Blockquotes
  out = out.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // Tables
  out = out.replace(
    /\|(.+)\|\n\|[-: |]+\|\n((?:\|.+\|\n?)+)/g,
    (_, header, body) => {
      const ths = header.split('|').filter(Boolean).map(h => `<th>${h.trim()}</th>`).join('');
      const rows = body.trim().split('\n').map(r => {
        const tds = r.split('|').filter(Boolean).map(c => `<td>${c.trim()}</td>`).join('');
        return `<tr>${tds}</tr>`;
      }).join('');
      return `<table><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
    }
  );

  // Bold + italic
  out = out.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  out = out.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
  out = out.replace(/\*(.+?)\*/g,         '<em>$1</em>');

  // Links
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  // Lists
  out = out.replace(/^[ \t]*[-*+] (.+)$/gm, '<li>$1</li>');
  out = out.replace(/^[ \t]*\d+\. (.+)$/gm,  '<li>$1</li>');
  out = out.replace(/((?:<li>[\s\S]*?<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Paragraphs (split on blank lines)
  const parts = out.split(/\n{2,}/);
  out = parts.map(p => {
    p = p.trim();
    if (!p) return '';
    if (/^<(h[1-6]|ul|ol|blockquote|table|div|pre|\x01CODE)/.test(p)) return p;
    return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
  }).filter(Boolean).join('\n');

  // Restore code blocks
  out = out.replace(/\x01CODE(\d+)\x01/g, (_, i) => codeBlocks[+i]);

  return out;
}

function copyCode(btn) {
  const code = btn.closest('.code-block').querySelector('code').innerText;
  navigator.clipboard.writeText(code).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✓ 已复制';
    setTimeout(() => { btn.textContent = orig; }, 1600);
  }).catch(() => {
    toast('复制失败', 'error');
  });
}
