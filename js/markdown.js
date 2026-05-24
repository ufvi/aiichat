/* markdown.js — Block-based Markdown renderer for AI chat responses
 *
 * Architecture: line → blocks → HTML (no chained-regex soup)
 * Handles: h1–h6, code fences, lists (nested), tables, blockquotes,
 *          inline code, bold, italic, strikethrough, links, HR
 */

'use strict';

// ── 1. HTML escape ────────────────────────────────────────────────────────────

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── 2. Syntax highlighting ────────────────────────────────────────────────────

const _ALIASES = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python',     py3: 'python',
  sh: 'bash',       zsh: 'bash',       shell: 'bash',
  rs: 'rust',
  c:  'c',          cc: 'cpp',         cxx: 'cpp',
};

const _KW = {
  javascript: /\b(async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|false|finally|for|from|function|if|import|in|instanceof|let|new|null|of|return|static|super|switch|this|throw|true|try|typeof|undefined|var|void|while|with|yield)\b/g,
  typescript: /\b(abstract|any|as|async|await|boolean|break|case|catch|class|const|constructor|continue|declare|default|delete|do|else|enum|export|extends|false|finally|for|from|function|if|implements|import|in|infer|instanceof|interface|keyof|let|module|namespace|never|new|null|number|of|private|protected|public|readonly|return|satisfies|static|string|super|switch|this|throw|true|try|type|typeof|undefined|unknown|var|void|while|yield)\b/g,
  python:     /\b(and|as|assert|async|await|break|class|continue|def|del|elif|else|except|False|finally|for|from|global|if|import|in|is|lambda|None|nonlocal|not|or|pass|raise|return|True|try|while|with|yield)\b/g,
  java:       /\b(abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|false|final|finally|float|for|if|implements|import|instanceof|int|interface|long|native|new|null|package|private|protected|public|return|short|static|super|switch|synchronized|this|throw|throws|transient|true|try|var|void|volatile|while)\b/g,
  go:         /\b(break|case|chan|const|continue|default|defer|else|fallthrough|false|for|func|go|goto|if|import|interface|map|nil|package|range|return|select|struct|switch|true|type|var)\b/g,
  rust:       /\b(as|async|await|break|const|continue|crate|dyn|else|enum|extern|false|fn|for|if|impl|in|let|loop|match|mod|move|mut|None|Ok|Err|pub|ref|return|self|Self|Some|static|struct|super|trait|true|type|unsafe|use|where|while)\b/g,
  c:          /\b(auto|break|case|char|const|continue|default|do|double|else|enum|extern|false|float|for|goto|if|inline|int|long|NULL|register|return|short|signed|sizeof|static|struct|switch|true|typedef|union|unsigned|void|volatile|while)\b/g,
  cpp:        /\b(alignas|alignof|and|auto|bool|break|case|catch|char|class|concept|const|constexpr|continue|decltype|default|delete|do|double|else|enum|explicit|export|extern|false|float|for|friend|goto|if|inline|int|long|mutable|namespace|new|noexcept|nullptr|operator|override|private|protected|public|register|requires|return|short|signed|sizeof|static|struct|switch|template|this|throw|true|try|typedef|typeid|typename|union|unsigned|using|virtual|void|volatile|while)\b/g,
  css:        /\b(absolute|animation|auto|background|border|bottom|color|content|cursor|display|flex|fixed|font|grid|height|inherit|initial|inline|left|margin|none|opacity|overflow|padding|position|relative|right|static|sticky|top|transform|transition|unset|width|z-index)\b/g,
  bash:       /\b(break|case|continue|do|done|elif|else|esac|exit|export|false|fi|for|function|if|in|local|read|return|select|shift|then|true|unset|until|while)\b/g,
  sql:        /\b(ADD|ALL|ALTER|AND|AS|ASC|AVG|BETWEEN|BY|CASE|COUNT|CREATE|DELETE|DESC|DISTINCT|DROP|ELSE|END|EXISTS|FALSE|FROM|FULL|GROUP|HAVING|IN|INNER|INSERT|INTO|IS|JOIN|LEFT|LIKE|LIMIT|MAX|MIN|NOT|NULL|ON|OR|ORDER|OUTER|PRIMARY|RIGHT|SELECT|SET|SUM|TABLE|THEN|TOP|TRUE|UNION|UNIQUE|UPDATE|VALUES|WHEN|WHERE)\b/gi,
};

const _COMMENT = {
  javascript: /\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
  typescript: /\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
  java:       /\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
  go:         /\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
  rust:       /\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
  c:          /\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
  cpp:        /\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
  css:        /\/\*[\s\S]*?\*\//g,
  python:     /#[^\n]*/g,
  bash:       /#[^\n]*/g,
  sql:        /--[^\n]*/g,
};

function highlight(rawCode, lang) {
  const resolved = _ALIASES[lang.toLowerCase()] ?? lang.toLowerCase();
  const slots = [];

  function slot(html) {
    slots.push(html);
    return `\x02s${slots.length - 1}\x02`;
  }

  let s = rawCode;

  // Comments first (protect from string/keyword passes)
  const cRe = _COMMENT[resolved];
  if (cRe) s = s.replace(cRe, m => slot(`<span class="tok-cmt">${esc(m)}</span>`));

  // Strings: double, single, template
  s = s.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g,
    m => slot(`<span class="tok-str">${esc(m)}</span>`));

  // Numbers: hex, binary, decimal, float
  s = s.replace(/\b(0x[\da-fA-F]+|0b[01]+|\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g,
    m => slot(`<span class="tok-num">${m}</span>`));

  // Keywords
  const kwRe = _KW[resolved];
  if (kwRe) {
    kwRe.lastIndex = 0;
    s = s.replace(kwRe, m => slot(`<span class="tok-kw">${m}</span>`));
  }

  // Function / method call names
  s = s.replace(/\b([A-Za-z_$][A-Za-z0-9_$]*)(\s*)(?=\()/g,
    (_, name, sp) => slot(`<span class="tok-fn">${esc(name)}</span>`) + sp);

  // Restore: escape bare text, substitute placeholders
  const phRe = /\x02s(\d+)\x02/g;
  let result = '', last = 0, m;
  while ((m = phRe.exec(s)) !== null) {
    result += esc(s.slice(last, m.index));
    result += slots[+m[1]];
    last   = m.index + m[0].length;
  }
  return result + esc(s.slice(last));
}

// ── 3. Inline rendering ───────────────────────────────────────────────────────

/** Render inline Markdown (bold, italic, code, links, strikethrough) */
function inline(raw) {
  const parts = [];
  // Split on inline code spans (supports multi-backtick: ``code``)
  const re = /(`+)([\s\S]*?)\1/g;
  let last = 0, m;
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) parts.push(_fmt(raw.slice(last, m.index)));
    parts.push(`<code class="inline-code">${esc(m[2].trim())}</code>`);
    last = m.index + m[0].length;
  }
  if (last < raw.length) parts.push(_fmt(raw.slice(last)));
  return parts.join('');
}

/** Format non-code inline text (escape HTML, then apply emphasis/links) */
function _fmt(s) {
  s = esc(s);
  // Bold + italic (must come before bold/italic alone)
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Strikethrough
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
  // Links — href is already HTML-escaped via esc() above; that's valid in attributes
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    (_, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
  return s;
}

// ── 4. Block parser ───────────────────────────────────────────────────────────

/**
 * Parse an array of lines into a flat array of block objects:
 *   { type: 'heading',    level, text }
 *   { type: 'code',       lang, code }
 *   { type: 'blockquote', lines }
 *   { type: 'table',      lines }
 *   { type: 'list',       items: [{indent, ordered, text}] }
 *   { type: 'hr' }
 *   { type: 'para',       lines }
 */
function parseBlocks(lines) {
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Code fence (```` ``` ```` or ~~~) ───────────────────────────────────
    const fenceM = line.match(/^(`{3,}|~{3,})([\w+#.-]*)/);
    if (fenceM) {
      const fence     = fenceM[1];
      const fenceChar = fence[0];
      const lang      = fenceM[2] || '';
      const codeLines = [];
      i++;
      while (i < lines.length) {
        const cl = lines[i];
        // Closing fence: same character, at least as many, nothing else on line
        if (cl.startsWith(fenceChar.repeat(fence.length)) &&
            cl.trim().replace(/[`~]/g, '').length === 0) {
          i++;
          break;
        }
        codeLines.push(cl);
        i++;
      }
      blocks.push({ type: 'code', lang, code: codeLines.join('\n') });
      continue;
    }

    // ── ATX Heading (# … ######) ─────────────────────────────────────────────
    const headM = line.match(/^(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/);
    if (headM) {
      blocks.push({ type: 'heading', level: headM[1].length, text: headM[2] });
      i++;
      continue;
    }

    // ── Horizontal rule ───────────────────────────────────────────────────────
    if (/^[ \t]*([-*_])(\s*\1){2,}[ \t]*$/.test(line) && line.trim().length >= 3) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // ── Blockquote ────────────────────────────────────────────────────────────
    if (/^>/.test(line)) {
      const bqLines = [];
      while (i < lines.length && /^>/.test(lines[i])) {
        bqLines.push(lines[i].replace(/^>[ \t]?/, ''));
        i++;
      }
      blocks.push({ type: 'blockquote', lines: bqLines });
      continue;
    }

    // ── Table (detect by pipe + separator row) ────────────────────────────────
    if (line.includes('|') && i + 1 < lines.length &&
        /^\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?$/.test(lines[i + 1])) {
      const tableLines = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        tableLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'table', lines: tableLines });
      continue;
    }

    // ── List item ─────────────────────────────────────────────────────────────
    if (/^[ \t]*(?:[-*+]|\d+\.)[ \t]/.test(line)) {
      const items = [];
      while (i < lines.length) {
        const l  = lines[i];
        const lm = l.match(/^([ \t]*)(?:([-*+])|(\d+)\.)[ \t]+([\s\S]*)/);
        if (lm) {
          items.push({
            indent:  lm[1].replace(/\t/g, '    ').length,
            ordered: !!lm[3],
            text:    lm[4],
          });
          i++;
        } else if (l.trim() === '' && i + 1 < lines.length &&
                   /^[ \t]*(?:[-*+]|\d+\.)[ \t]/.test(lines[i + 1])) {
          // Blank line between list items — skip it
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    // ── Blank line ────────────────────────────────────────────────────────────
    if (line.trim() === '') {
      i++;
      continue;
    }

    // ── Paragraph (accumulate until next block-level element) ─────────────────
    const paraLines = [];
    while (i < lines.length) {
      const l = lines[i];
      if (l.trim() === '')                                          break;
      if (/^#{1,6}[ \t]/.test(l))                                  break;
      if (/^(`{3,}|~{3,})/.test(l))                               break;
      if (/^[ \t]*([-*_])(\s*\1){2,}[ \t]*$/.test(l))             break;
      if (/^>/.test(l))                                            break;
      if (/^[ \t]*(?:[-*+]|\d+\.)[ \t]/.test(l))                  break;
      if (l.includes('|') && i + 1 < lines.length &&
          /^\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?$/.test(lines[i + 1])) break;
      paraLines.push(l);
      i++;
    }
    if (paraLines.length) blocks.push({ type: 'para', lines: paraLines });
  }

  return blocks;
}

// ── 5. Block renderer ─────────────────────────────────────────────────────────

function renderBlock(block) {
  switch (block.type) {

    case 'code': {
      const lang   = block.lang;
      const lcLang = lang.toLowerCase();
      const label  = esc(lang.toUpperCase() || 'TEXT');
      const hi     = highlight(block.code, lang);
      const isHtml = lcLang === 'html';
      const previewBtn = isHtml
        ? `<button class="code-preview-btn" onclick="togglePreview(this)">👁 预览</button>`
        : '';
      const previewDiv = isHtml
        ? `\n  <div class="code-preview" style="display:none"><div class="code-preview-inner">${block.code}</div></div>`
        : '';
      return (
        `<div class="code-block">\n` +
        `  <div class="code-block-header">` +
          `<span class="code-lang">${label}</span>` +
          `<div class="code-block-actions">` +
            previewBtn +
            `<button class="code-copy-btn" onclick="copyCode(this)">复制</button>` +
          `</div>` +
        `</div>\n` +
        `  <pre><code>${hi}</code></pre>\n` +
        previewDiv +
        `</div>`
      );
    }

    case 'heading':
      return `<h${block.level} class="md-h">${inline(block.text)}</h${block.level}>`;

    case 'hr':
      return '<hr class="md-hr">';

    case 'blockquote': {
      const inner = parseBlocks(block.lines).map(renderBlock).join('\n');
      return `<blockquote class="md-bq">${inner}</blockquote>`;
    }

    case 'table':
      return renderTable(block.lines);

    case 'list':
      return renderList(block.items, 0);

    case 'para': {
      // Two spaces before \n → <br>; bare newlines → <br> for readable wrapping
      const raw = block.lines.join('\n').replace(/  \n/g, '\n');
      return `<p class="md-p">${inline(raw).replace(/\n/g, '<br>')}</p>`;
    }

    default:
      return '';
  }
}

// ── 6. Table renderer ─────────────────────────────────────────────────────────

function renderTable(lines) {
  /** Is this line a separator row? e.g. | :--- | ---: | */
  const isSep = l => /^\|?[ \t]*:?-{1,}:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?$/.test(l) &&
                     !/[A-Za-z0-9]/.test(l);

  function parseRow(l) {
    return l.replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()));
  }

  const sepIdx    = lines.findIndex(isSep);
  const headLines = sepIdx > 0 ? lines.slice(0, sepIdx) : [];
  const bodyLines = sepIdx >= 0 ? lines.slice(sepIdx + 1) : lines;

  const thead = headLines.length
    ? `<thead>${headLines.map(l =>
        `<tr>${parseRow(l).map(c => `<th>${c}</th>`).join('')}</tr>`
      ).join('')}</thead>`
    : '';

  const tbody = `<tbody>${bodyLines
    .filter(l => l.trim() && l.includes('|'))
    .map(l => `<tr>${parseRow(l).map(c => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody>`;

  return `<table class="md-table">${thead}${tbody}</table>`;
}

// ── 7. List renderer (recursive, handles nesting) ─────────────────────────────

/**
 * Render list items starting at index `start`.
 * Items with indent > items[start].indent become a nested sub-list.
 * Returns the rendered HTML string.
 */
function renderList(items, start) {
  if (start >= items.length) return '';
  const base = items[start].indent;
  const tag  = items[start].ordered ? 'ol' : 'ul';
  let html   = `<${tag} class="md-list">`;
  let i      = start;

  while (i < items.length) {
    const item = items[i];
    if (item.indent < base) break;            // back up to parent
    if (item.indent > base) { i++; continue; } // shouldn't happen here

    html += `<li>${inline(item.text)}`;
    i++;

    // If next item is at a deeper indent, render it as a sub-list
    if (i < items.length && items[i].indent > base) {
      const subStart = i;
      html += renderList(items, subStart);
      // Skip past all sub-items we just consumed
      while (i < items.length && items[i].indent > base) i++;
    }

    html += '</li>';
  }

  return html + `</${tag}>`;
}

// ── 8. Public API ─────────────────────────────────────────────────────────────

/**
 * renderMarkdown(raw) → HTML string
 * Main entry point. Accepts a raw Markdown string, returns safe HTML.
 */
function renderMarkdown(raw) {
  if (!raw || !raw.trim()) return '';
  return parseBlocks(raw.split('\n')).map(renderBlock).join('\n');
}

/**
 * copyCode(btn)
 * Copy button handler for code blocks.
 * Uses textContent of <code> so HTML entities are automatically decoded.
 */
function copyCode(btn) {
  const codeEl = btn.closest('.code-block').querySelector('pre > code');
  if (!codeEl) return;
  navigator.clipboard.writeText(codeEl.textContent).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✓ 已复制';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }).catch(() => {
    if (typeof toast === 'function') toast('复制失败', 'error');
  });
}

/**
 * togglePreview(btn)
 * Toggle HTML preview visibility for HTML code blocks.
 */
function togglePreview(btn) {
  const block   = btn.closest('.code-block');
  const preview = block.querySelector('.code-preview');
  const hidden  = preview.style.display === 'none';
  preview.style.display = hidden ? 'block' : 'none';
  btn.textContent = hidden ? '👁 隐藏' : '👁 预览';
}
