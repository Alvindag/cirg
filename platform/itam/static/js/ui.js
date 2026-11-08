/* ITAM UI behaviour: sliding nav pill, mobile menu, Ctrl/Cmd+K command palette. No dependencies. */
(function () {
  'use strict';

  /* ── Sliding pill that follows the hovered nav item and settles on the active one ── */
  var nav = document.getElementById('nav');
  var pill = document.getElementById('nav-pill');
  if (nav && pill) {
    var items = Array.prototype.slice.call(nav.querySelectorAll('.nav-item'));
    var active = nav.querySelector('.nav-item.active');
    var move = function (el) {
      if (!el) { pill.style.opacity = '0'; return; }
      pill.style.height = el.offsetHeight + 'px';
      pill.style.transform = 'translateY(' + el.offsetTop + 'px)';
      pill.style.opacity = '1';
    };
    items.forEach(function (el) {
      el.addEventListener('mouseenter', function () { move(el); });
      el.addEventListener('focus', function () { move(el); });
      el.addEventListener('blur', function () { move(active); });
    });
    nav.addEventListener('mouseleave', function () { move(active); });
    pill.style.transition = 'none';
    move(active);
    requestAnimationFrame(function () { requestAnimationFrame(function () { pill.style.transition = ''; }); });
    window.addEventListener('resize', function () { move(active); });
  }

  /* ── Mobile menu ── */
  var side = document.getElementById('sidebar');
  var menuBtn = document.getElementById('menu-btn');
  if (side && menuBtn) {
    menuBtn.addEventListener('click', function (e) { e.stopPropagation(); side.classList.toggle('open'); });
    document.addEventListener('click', function (e) { if (!side.contains(e.target)) side.classList.remove('open'); });
  }

  /* ── Command palette ── */
  var back = document.getElementById('cmdk-back');
  var input = document.getElementById('cmdk-input');
  var list = document.getElementById('cmdk-list');
  var openBtn = document.getElementById('open-cmdk');
  if (!back || !input || !list) return;

  var pages = [];
  if (nav) {
    Array.prototype.forEach.call(nav.querySelectorAll('.nav-item'), function (a) {
      var label = (a.textContent || '').replace(/\s+/g, ' ').trim();
      if (label) pages.push({ label: label, href: a.getAttribute('href'), group: 'Go to' });
    });
  }
  var sel = 0, shown = [];

  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function render() {
    var q = input.value.trim();
    var needle = q.toLowerCase();
    shown = pages.filter(function (p) { return !needle || p.label.toLowerCase().indexOf(needle) !== -1; });
    if (q) {
      shown = shown.concat([{ label: 'Search assets for “' + q + '”', href: '/assets?q=' + encodeURIComponent(q), group: 'Assets', hint: 'asset register' },
                            { label: 'Search people for “' + q + '”', href: '/people?q=' + encodeURIComponent(q), group: 'People', hint: 'people & assets' }]);
    }
    if (sel >= shown.length) sel = Math.max(0, shown.length - 1);
    var html = '', lastGroup = '';
    shown.forEach(function (p, i) {
      if (p.group !== lastGroup) { html += '<li class="grp">' + esc(p.group) + '</li>'; lastGroup = p.group; }
      html += '<li class="' + (i === sel ? 'sel' : '') + '"><a href="' + esc(p.href) + '" data-i="' + i + '">' + esc(p.label) + (p.hint ? '<small>' + esc(p.hint) + '</small>' : '') + '</a></li>';
    });
    list.innerHTML = html || '<li class="grp">No matches</li>';
    var cur = list.querySelector('li.sel');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  }

  function open() { back.hidden = false; input.value = ''; sel = 0; render(); setTimeout(function () { input.focus(); }, 0); }
  function close() { back.hidden = true; }

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); back.hidden ? open() : close(); return; }
    if (back.hidden) return;
    if (e.key === 'Escape') { close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[sel]) window.location.href = shown[sel].href; }
  });
  input.addEventListener('input', function () { sel = 0; render(); });
  back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
  list.addEventListener('mousemove', function (e) {
    var a = e.target.closest ? e.target.closest('a[data-i]') : null;
    if (a) { var i = +a.getAttribute('data-i'); if (i !== sel) { sel = i; Array.prototype.forEach.call(list.querySelectorAll('li'), function (li) { li.classList.remove('sel'); }); a.parentNode.classList.add('sel'); } }
  });
  if (openBtn) openBtn.addEventListener('click', open);
})();
