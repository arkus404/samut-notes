(function () {
  var KEY = 'samut.notes.v1';
  var PREFS = 'samut.prefs.v1';
  var $ = function (s) { return document.querySelector(s); };
  var app = $('#app');
  var listEl = $('#list');
  var editor = $('#editor');
  var preview = $('#preview');
  var search = $('#search');
  var stamp = $('#stamp');
  var savedEl = $('#saved');
  var countEl = $('#count');
  var confirmEl = $('#confirm');
  var helpEl = $('#help');

  var seedBody = [
    '# สวัสดี',
    '',
    'นี่คือ **สมุด** — ที่ขียนที่เหลือเพียงตัวอักษร',
    '',
    '- แก้ไข้ด้วยมาร์กดาวน์ สลับตัวอย่างได้ด้วย Ctrl+E',
    '- ค้นหาทันที กด / แล้วพิมพ์',
    '- ข้อมูลอยู่ในเบราว์เซอร์นี้ ไม่ส่งไปไหน',
    '',
    '> กด Ctrl+/ เพื่อดูปุ่มลัดทั้งหมด',
    '',
    '## มาร์กดาวน์สั้น',
    '',
    '**ตัวหนา** และ *ตัวเอียง* และโค้ดแบบอินไลน์',
    '',
    '- [x] รายการ',
    '- [ ] ยังไม่ทำ',
    '',
    '1. เขียน',
    '2. ตรวจ',
    '3. กลับมา'
  ].join('\n');

  var notes = [];
  var activeId = null;
  var query = '';
  var previewOn = false;
  var sideCollapsed = false;
  var saveTimer = null;
  var savedTimer = null;
  var lastFocus = null;

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        notes = JSON.parse(raw);
      } else {
        var t = Date.now();
        notes = [
          { id: uid(), body: seedBody, updatedAt: t },
          { id: uid(), body: '# บันทึกวันนี้\n\n- อ่านน้ำชา\n- เขียนสิ่งที่ยังค้างอยู่', updatedAt: t - 3600000 }
        ];
        persist();
      }
    } catch (e) { notes = []; }
    try {
      var p = JSON.parse(localStorage.getItem(PREFS) || '{}');
      activeId = p.activeId || (notes[0] && notes[0].id);
      previewOn = !!p.previewOn;
      sideCollapsed = !!p.sideCollapsed;
    } catch (e2) {}
    if (activeId && !notes.some(function (n) { return n.id === activeId; })) {
      activeId = notes[0] ? notes[0].id : null;
    }
  }
  function persist() {
    localStorage.setItem(KEY, JSON.stringify(notes));
    localStorage.setItem(PREFS, JSON.stringify({ activeId: activeId, previewOn: previewOn, sideCollapsed: sideCollapsed }));
  }
  function flashSaved() {
    savedEl.classList.add('on');
    clearTimeout(savedTimer);
    savedTimer = setTimeout(function () { savedEl.classList.remove('on'); }, 1200);
  }
  function titleOf(body) {
    var line = (body || '').split('\n').map(function (l) {
      return l.replace(/^#+\s*/, '').trim();
    }).find(Boolean);
    return line || 'ไม่มีชื่อ';
  }
  function snippetOf(body) {
    var lines = (body || '').split('\n').map(function (l) {
      return l.replace(/^#+\s*/, '').trim();
    }).filter(Boolean);
    return lines.slice(1).join(' ') || '';
  }
  function relTime(ts) {
    var d = Date.now() - ts;
    if (d < 45000) return 'เมื่อสักครู่';
    if (d < 3600000) return Math.floor(d / 60000) + ' นาทีที่แล้ว';
    if (d < 86400000) return Math.floor(d / 3600000) + ' ชั่วโมงที่แล้ว';
    if (d < 172800000) return 'เมื่อวาน';
    return new Date(ts).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function absTime(ts) {
    return new Date(ts).toLocaleString('th-TH', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }
  function filtered() {
    var q = query.trim().toLowerCase();
    var arr = notes.slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; });
    if (!q) return arr;
    return arr.filter(function (n) { return (n.body || '').toLowerCase().indexOf(q) !== -1; });
  }
  function active() {
    for (var i = 0; i < notes.length; i++) if (notes[i].id === activeId) return notes[i];
    return null;
  }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, '&#39;');
  }
  function inlineFmt(s) {
    s = escapeHtml(s);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/!\[([^\]]*)\]\((https?:[^)\s]+)\)/g, '<img alt="$1" src="$2">');
    s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+|mailto:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>');
    return s;
  }
  function renderBlocks(text) {
    var lines = text.split('\n');
    var out = [];
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      if (/^\s*$/.test(line)) { i++; continue; }
      if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
      var hm = /^(#{1,6})\s+(.+)$/.exec(line);
      if (hm) {
        var n = hm[1].length;
        out.push('<h' + n + '>' + inlineFmt(hm[2]) + '</h' + n + '>');
        i++; continue;
      }
      if (/^>\s?/.test(line)) {
        var bq = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { bq.push(lines[i].replace(/^>\s?/, '')); i++; }
        out.push('<blockquote>' + renderBlocks(bq.join('\n')) + '</blockquote>');
        continue;
      }
      if (/^[-*+]\s+\[[ xX]\]\s+/.test(line)) {
        var tasks = [];
        while (i < lines.length && /^[-*+]\s+\[[ xX]\]\s+/.test(lines[i])) {
          var tm = /^[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(lines[i]);
          var on = tm[1].toLowerCase() === 'x';
          tasks.push('<li class="task"><input type="checkbox" disabled' + (on ? ' checked' : '') + '> ' + inlineFmt(tm[2]) + '</li>');
          i++;
        }
        out.push('<ul>' + tasks.join('') + '</ul>');
        continue;
      }
      if (/^[-*+]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
        var ordered = /^\d+\.\s+/.test(line);
        var re = ordered ? /^\d+\.\s+(.*)$/ : /^[-*+]\s+(.*)$/;
        var items = [];
        while (i < lines.length && re.test(lines[i])) {
          items.push('<li>' + inlineFmt(re.exec(lines[i])[1]) + '</li>');
          i++;
        }
        out.push((ordered ? '<ol>' : '<ul>') + items.join('') + (ordered ? '</ol>' : '</ul>'));
        continue;
      }
      var para = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s?|(-{3,}|\*{3,})\s*$)/.test(lines[i])) {
        para.push(lines[i]); i++;
      }
      out.push('<p>' + para.map(inlineFmt).join('<br>') + '</p>');
    }
    return out.join('');
  }
  function renderMarkdown(raw) {
    if (!raw || !String(raw).trim()) return '<p class="empty-hint">เริ่มเขียน…</p>';
    var src = String(raw).replace(/\r\n/g, '\n');
    var parts = [];
    var re = /```([^\n`]*)\n([\s\S]*?)```/g;
    var last = 0, m;
    while ((m = re.exec(src))) {
      if (m.index > last) parts.push({ t: 'md', v: src.slice(last, m.index) });
      parts.push({ t: 'code', v: m[2].replace(/\n$/, '') });
      last = m.index + m[0].length;
    }
    if (last < src.length) parts.push({ t: 'md', v: src.slice(last) });
    return parts.map(function (p) {
      return p.t === 'code'
        ? '<pre><code>' + escapeHtml(p.v) + '</code></pre>'
        : renderBlocks(p.v);
    }).join('');
  }
  function renderList() {
    var items = filtered();
    countEl.textContent = items.length === notes.length
      ? notes.length + ' โน้ต'
      : items.length + ' / ' + notes.length;
    if (!items.length) {
      listEl.innerHTML = '<li class="empty-list">' + (query ? 'ไม่พบผลลัพธ์' : 'ยังไม่มีโน้ต') + '</li>';
      return;
    }
    listEl.innerHTML = items.map(function (n) {
      var on = n.id === activeId ? ' active' : '';
      return '<li><button type="button" role="option" class="note-item' + on + '" data-id="' + n.id +
        '" aria-selected="' + (n.id === activeId) + '">' +
        '<div class="note-title">' + escapeHtml(titleOf(n.body)) + '</div>' +
        '<div class="note-meta"><span>' + relTime(n.updatedAt) + '</span><span class="note-snippet">' +
        escapeHtml(snippetOf(n.body)) + '</span></div></button></li>';
    }).join('');
    var onEl = listEl.querySelector('.active');
    if (onEl) onEl.scrollIntoView({ block: 'nearest' });
  }
  function renderMain() {
    var n = active();
    app.classList.toggle('no-note', !n);
    app.classList.toggle('preview-on', previewOn);
    app.classList.toggle('sidebar-collapsed', sideCollapsed);
    $('#mode-edit').setAttribute('aria-pressed', previewOn ? 'false' : 'true');
    $('#mode-preview').setAttribute('aria-pressed', previewOn ? 'true' : 'false');
    if (!n) {
      editor.value = '';
      preview.innerHTML = '';
      stamp.textContent = '';
      return;
    }
    if (editor.value !== n.body) editor.value = n.body;
    preview.innerHTML = renderMarkdown(n.body);
    stamp.textContent = 'แก้ไขล่าสุด ' + relTime(n.updatedAt);
    stamp.title = absTime(n.updatedAt);
  }
  function render() { renderList(); renderMain(); }
  function setActive(id, focusEditor) {
    activeId = id;
    persist();
    render();
    if (focusEditor && !previewOn) {
      editor.focus();
      editor.setSelectionRange(editor.value.length, editor.value.length);
    }
  }
  function createNote() {
    var n = { id: uid(), body: '', updatedAt: Date.now() };
    notes.unshift(n);
    previewOn = false;
    persist();
    setActive(n.id, true);
    closeDrawer();
  }
  function requestDelete() {
    if (!active()) return;
    openModal(confirmEl);
  }
  function doDelete() {
    var id = activeId;
    var vis = filtered();
    var idx = -1;
    for (var i = 0; i < vis.length; i++) if (vis[i].id === id) idx = i;
    notes = notes.filter(function (n) { return n.id !== id; });
    var next = vis[idx + 1] || vis[idx - 1];
    activeId = next && next.id !== id ? next.id : (notes[0] ? notes[0].id : null);
    persist();
    closeModal(confirmEl);
    render();
    if (activeId && !previewOn) editor.focus();
  }
  function setPreview(on) {
    previewOn = on;
    persist();
    renderMain();
    if (!on) editor.focus();
  }
  function toggleSide() {
    if (window.innerWidth <= 720) {
      app.classList.toggle('mobile-open');
      return;
    }
    sideCollapsed = !sideCollapsed;
    persist();
    app.classList.toggle('sidebar-collapsed', sideCollapsed);
  }
  function closeDrawer() { app.classList.remove('mobile-open'); }
  function openModal(el) {
    lastFocus = document.activeElement;
    el.hidden = false;
    el.classList.add('show');
    var btn = el.querySelector('.btn-danger, .btn-ghost');
    if (btn) btn.focus();
  }
  function closeModal(el) {
    el.hidden = true;
    el.classList.remove('show');
    if (lastFocus) lastFocus.focus();
  }

  editor.addEventListener('input', function () {
    var n = active();
    if (!n) return;
    n.body = editor.value;
    n.updatedAt = Date.now();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      persist();
      flashSaved();
      renderList();
      stamp.textContent = 'แก้ไขล่าสุด ' + relTime(n.updatedAt);
    }, 180);
  });
  editor.addEventListener('keydown', function (e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      var a = editor.selectionStart, b = editor.selectionEnd;
      editor.setRangeText('  ', a, b, 'end');
      editor.dispatchEvent(new Event('input'));
    }
  });
  search.addEventListener('input', function () { query = search.value; renderList(); });
  listEl.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-id]');
    if (!btn) return;
    setActive(btn.getAttribute('data-id'), true);
    closeDrawer();
  });
  document.addEventListener('click', function (e) {
    var actEl = e.target.closest('[data-act]');
    if (!actEl) return;
    var a = actEl.getAttribute('data-act');
    if (a === 'new') createNote();
    if (a === 'delete') requestDelete();
    if (a === 'ok-del') doDelete();
    if (a === 'cancel-del') closeModal(confirmEl);
    if (a === 'toggle-side') toggleSide();
    if (a === 'close-drawer') closeDrawer();
    if (a === 'help') openModal(helpEl);
    if (a === 'close-help') closeModal(helpEl);
    if (a === 'home') {
      e.preventDefault();
      var f = filtered();
      if (f[0]) setActive(f[0].id);
    }
  });
  $('#mode-edit').addEventListener('click', function () { setPreview(false); });
  $('#mode-preview').addEventListener('click', function () { setPreview(true); });
  confirmEl.addEventListener('click', function (e) { if (e.target === confirmEl) closeModal(confirmEl); });
  helpEl.addEventListener('click', function (e) { if (e.target === helpEl) closeModal(helpEl); });

  function isTyping(el) {
    return el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable);
  }
  document.addEventListener('keydown', function (e) {
    var mod = e.metaKey || e.ctrlKey;
    var confirmOpen = confirmEl.classList.contains('show');
    var helpOpen = helpEl.classList.contains('show');
    if (e.key === 'Escape') {
      if (confirmOpen) { closeModal(confirmEl); return; }
      if (helpOpen) { closeModal(helpEl); return; }
      if (app.classList.contains('mobile-open')) { closeDrawer(); return; }
      if (query) { query = search.value = ''; renderList(); return; }
      if (previewOn) { setPreview(false); return; }
    }
    if (confirmOpen || helpOpen) return;
    if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); createNote(); return; }
    if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); search.focus(); search.select(); return; }
    if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); setPreview(!previewOn); return; }
    if (mod && (e.key === '\\' || e.code === 'Backslash')) { e.preventDefault(); toggleSide(); return; }
    if (mod && e.key === 'Backspace') { e.preventDefault(); requestDelete(); return; }
    if (mod && e.key === '/') { e.preventDefault(); openModal(helpEl); return; }
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      var items = filtered();
      var ix = -1;
      for (var i = 0; i < items.length; i++) if (items[i].id === activeId) ix = i;
      var ni = e.key === 'ArrowUp' ? Math.max(0, ix - 1) : Math.min(items.length - 1, ix + 1);
      if (items[ni]) setActive(items[ni].id, false);
      return;
    }
    if (!isTyping(e.target) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      var items2 = filtered();
      var ix2 = -1;
      for (var j = 0; j < items2.length; j++) if (items2[j].id === activeId) ix2 = j;
      var nj = e.key === 'ArrowUp' ? Math.max(0, ix2 - 1) : Math.min(items2.length - 1, ix2 + 1);
      if (items2[nj]) setActive(items2[nj].id, false);
      return;
    }
    if (!isTyping(e.target) && e.key === '/' && !e.shiftKey) {
      e.preventDefault();
      search.focus();
      search.select();
    }
  });

  window.addEventListener('beforeunload', function () { persist(); });
  setInterval(function () {
    if (active()) {
      stamp.textContent = 'แก้ไขล่าสุด ' + relTime(active().updatedAt);
      renderList();
    }
  }, 30000);

  load();
  render();
  if (active() && !previewOn) editor.focus();
})();
