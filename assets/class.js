// One class record. class/?id=c00 lists the class's pages as links, grouped as Class Handout, Class Summary and
// Homework; each handout, the summary and the class words open as their own page (class/?id=c00&res=…).
// Nothing is embedded in the list (dated class pages as links).
(() => {
  const N = window.Zs, app = document.getElementById('app');
  const params = new URLSearchParams(location.search);
  const classId = params.get('id') || '', res = params.get('res') || '';
  const pageHref = (r) => `./?id=${encodeURIComponent(classId)}&res=${encodeURIComponent(r)}`;
  const linkCard = (href, kind, title, note) => `<a class="zp-card zp-card-link" href="${href}"><div class="zp-card-kind">${N.esc(kind)}</div><h3>${N.esc(title)}</h3>${note ? `<p class="zp-meta">${N.esc(note)}</p>` : ''}<span class="zp-go">Open →</span></a>`;

  function listPage(c) {
    const handouts = c.resources.length
      ? `<div class="zp-cards">${c.resources.map((r) => linkCard(pageHref(r.id), r.kind, r.label, (r.media || []).length ? `${r.media.length} annotated page${r.media.length === 1 ? '' : 's'}` : '')).join('')}</div>`
      : '<p class="zp-empty">No handout for this class.</p>';
    const summary = c.summaryHtml
      ? `<div class="zp-cards">${linkCard(pageHref('summary'), 'Class Summary', 'What we covered, step by step', c.summaryHidden ? 'Hidden from the learner until Summary visible is turned on' : '')}</div>`
      : '<p class="zp-empty">The class summary will appear here.</p>';
    const words = (c.words || []).length
      ? `<div class="zp-cards">${c.words.map((l) => linkCard(pageHref('words'), 'Class Words', l.title, `${l.words.length} words`)).slice(0, 1).join('')}</div>`
      : '<p class="zp-empty">No word list for this class yet.</p>';
    // Archived homework stays here, under its own closed heading (teacher, 2026-10-26).
    const current = c.tasks.filter((t) => !t.archived), shelved = c.tasks.filter((t) => t.archived);
    const homework = (current.length ? `<div class="zp-cards">${current.map(N.taskCard).join('')}</div>` : '<p class="zp-empty">No homework for this class.</p>') +
      (shelved.length ? `<details class="zp-fold zp-archive" data-fold="homework-archive"><summary><h3>Archived homework <small>${shelved.length}</small></h3></summary><div class="zp-cards">${shelved.map(N.taskCard).join('')}</div></details>` : '');
    app.innerHTML = `
      <p class="zp-back"><a href="../">← Home</a></p>
      <p class="zp-kicker">Class ${N.esc(c.number)} · ${N.esc(N.longDate(c.date))}</p>
      <h1>${N.esc(c.title)}</h1>
      ${c.focus ? `<p class="zp-lead">${N.esc(c.focus)}</p>` : ''}
      ${N.foldBar()}
      <details class="zp-section zp-fold" data-fold="handout" id="class-handout"><summary><h2>Class Handout <small>${c.resources.length}</small></h2></summary>${handouts}</details>
      <details class="zp-section zp-fold" data-fold="summary" id="class-summary"><summary><h2>Class Summary</h2></summary>${summary}</details>
      <details class="zp-section zp-fold" data-fold="words" id="class-words"><summary><h2>Class Words</h2></summary>${words}</details>
      <details class="zp-section zp-fold" data-fold="homework" id="homework"><summary><h2>Homework <small>${current.length}</small></h2></summary>${homework}</details>`;
    N.folds(app, 'class:' + c.id);
    N.openTarget();
  }

  // The summary's numbered parts become remembered toggles, like every other section.
  function foldHeadings(html, prefix) {
    const box = document.createElement('div');
    box.innerHTML = html;
    const out = [];
    let current = null;
    Array.from(box.childNodes).forEach((node) => {
      if (node.nodeType === 1 && node.tagName === 'H3') {
        current = document.createElement('details');
        current.className = 'zp-fold zp-sumfold';
        current.dataset.fold = prefix + ':' + node.textContent.trim().slice(0, 40);
        current.innerHTML = `<summary>${node.innerHTML}</summary><div class="zp-fold-body zp-rich"></div>`;
        out.push(current);
      } else if (current) current.querySelector('.zp-fold-body').appendChild(node);
      else out.push(node);
    });
    box.innerHTML = '';
    out.forEach((n) => box.appendChild(n));
    return box.innerHTML;
  }

  function wordsHtml(lists) {
    return lists.map((l) => {
      const checked = l.words.filter((w) => w.known).length;
      return `<div data-wordlist="${N.esc(l.id)}"><div class="zp-actions"><button class="zp-btn quiet" type="button" data-checkall="${N.esc(l.id)}"${checked === l.words.length ? ' disabled' : ''}>Check all</button><button class="zp-btn quiet" type="button" data-uncheckall="${N.esc(l.id)}"${checked ? '' : ' disabled'}>Uncheck all</button><button class="zp-btn quiet" type="button" data-copy-words="${N.esc(l.id)}">Copy unchecked words</button></div>
        <div class="zp-tablewrap"><table class="zp-wordtable"><thead><tr><th class="ck">Known</th><th>Word</th><th>Meaning</th><th>Example</th></tr></thead><tbody>${l.words.map((w) => `<tr class="${w.known ? 'is-known' : ''}"><td class="ck"><input type="checkbox" aria-label="Known: ${N.esc(w.word)}" data-known="${N.esc(w.id)}"${w.known ? ' checked' : ''}></td><td><strong>${N.esc(w.word)}</strong> <small>${N.esc(w.pos)}</small></td><td>${N.esc(w.meaning)}</td><td class="ex">${N.esc(w.example)}</td></tr>`).join('')}</tbody></table></div></div>`;
    }).join('') + '<p class="zp-msg" id="copy-msg"></p><p class="zp-note">Ticked words are shared with the Vocabulary page. Add your own words there.</p>';
  }

  function resourcePage(c) {
    const back = `<p class="zp-back"><a href="./?id=${encodeURIComponent(c.id)}">← Class ${N.esc(c.number)}</a></p>`;
    let kind, title, body;
    if (res === 'summary') {
      kind = 'Class Summary'; title = c.title;
      body = c.summaryHtml ? `${c.summaryHidden ? '<p class="zp-banner warn">Hidden from the learner until Summary visible is turned on.</p>' : ''}<div class="zp-summary">${foldHeadings(c.summaryHtml, 'summary')}</div>` : '<p class="zp-empty">The class summary will appear here.</p>';
    } else if (res === 'words') {
      kind = 'Class Words'; title = (c.words[0] || {}).title || 'Words from class';
      body = (c.words || []).length ? `<div data-words>${wordsHtml(c.words)}</div>` : '<p class="zp-empty">No word list for this class yet.</p>';
    } else {
      const r = c.resources.filter((x) => x.id === res)[0];
      if (!r) throw new Error('This handout was not found.');
      kind = r.kind; title = r.label;
      body = `<div class="zp-rich zp-respage">${r.html}</div>${(r.media || []).length ? `<div class="zp-res-pages" data-res-pages="${N.esc(r.media.join(','))}"><p class="zp-note">Loading the pages…</p></div>` : ''}`;
    }
    document.title = `${title} · Class ${c.number} · Zishen · IG English`;
    app.innerHTML = `${back}<p class="zp-kicker">Class ${N.esc(c.number)} · ${N.esc(N.longDate(c.date))} · ${N.esc(kind)}</p><h1>${N.esc(title)}</h1>
      <div class="zp-actions"><button class="zp-btn quiet" type="button" id="print">Print / Save as PDF</button></div>${N.foldBar()}${body}`;
    N.folds(app, 'class:' + c.id + ':' + res);
    // Notion-style toggles inside a handout remember their state too.
    app.querySelectorAll('.zp-respage details').forEach((d, i) => { if (!d.dataset.fold) d.dataset.fold = 'n' + i; });
    N.folds(app, 'class:' + c.id + ':' + res);
    let pages = Promise.resolve();
    const box = app.querySelector('[data-res-pages]');
    if (box) {
      // All pages load at once; each appears in its place as soon as it arrives.
      const ids = box.dataset.resPages.split(',');
      box.innerHTML = ids.map((id, i) => `<div class="zp-res-page" data-page="${i}"><p class="zp-note">Loading page ${i + 1} of ${ids.length}…</p></div>`).join('');
      pages = Promise.all(ids.map(async (id, i) => {
        const slot = box.querySelector(`[data-page="${i}"]`);
        try {
          slot.innerHTML = `<img src="${URL.createObjectURL(await N.loadMedia(id))}" alt="Annotated page ${i + 1}">`;
          await slot.querySelector('img').decode();
        } catch (error) { slot.innerHTML = `<p class="zp-msg error">Page ${i + 1} could not be loaded. Reload the page to try again.</p>`; }
      }));
    }
    document.getElementById('print').addEventListener('click', () => window.ZsPrint.print({ prepare: () => pages }).catch(() => window.print()));
    bindWords(c);
    bindClues();
  }

  function bindWords(c) {
    const lists = c.words || [];
    const listById = (id) => lists.filter((l) => l.id === id)[0];
    const redraw = () => { const w = app.querySelector('[data-words]'); if (w) w.innerHTML = wordsHtml(lists); };
    const say = (text, kind) => { const m = document.getElementById('copy-msg'); if (m) { m.textContent = text; m.className = 'zp-msg' + (kind ? ' ' + kind : ''); } };
    async function setKnown(words, known) {
      const before = words.map((w) => w.known);
      words.forEach((w) => { w.known = known; });
      redraw();
      try {
        const status = known ? 'known' : 'learning';
        if (words.length === 1) await N.A.post('setWordStatus', { wordId: words[0].id, status });
        else await N.A.post('setWordStatus', { wordIds: words.map((w) => w.id), status });
      } catch (error) {
        words.forEach((w, i) => { w.known = before[i]; });
        redraw();
        say('Not saved. Check your connection and try again.', 'error');
      }
    }
    app.addEventListener('change', (event) => {
      const tick = event.target.closest('[data-known]');
      if (!tick) return;
      const l = listById(tick.closest('[data-wordlist]').dataset.wordlist);
      setKnown(l.words.filter((w) => w.id === tick.dataset.known), tick.checked);
    });
    app.addEventListener('click', async (event) => {
      const all = event.target.closest('[data-checkall]'), none = event.target.closest('[data-uncheckall]');
      if (all || none) {
        const l = listById(all ? all.dataset.checkall : none.dataset.uncheckall);
        const words = l.words.filter((w) => w.known !== Boolean(all));
        if (words.length) await setKnown(words, Boolean(all));
        return;
      }
      const button = event.target.closest('[data-copy-words]');
      if (!button) return;
      const words = listById(button.dataset.copyWords).words.filter((w) => !w.known && !/\s/.test(w.word.trim())).map((w) => w.word);
      if (!words.length) { say('Nothing to copy: every word is ticked.'); return; }
      try { await navigator.clipboard.writeText(words.join('\n')); say(`Copied ${words.length} words.`, 'success'); }
      catch (error) { say('Copying is blocked here. Use the Vocabulary page to download the list.', 'error'); }
    });
  }

  // Clue finder: show where each question's answer, its clue words and the trap are in the text.
  function bindClues() {
    app.addEventListener('click', (event) => {
      const clue = event.target.closest('[data-clue-toggle]');
      if (!clue) return;
      const box = clue.closest('.zp-cluebox'), q = clue.dataset.clueToggle;
      const qs = q === 'all' ? Array.from(box.querySelectorAll('.zp-cluebar [data-clue-toggle]')).map((b) => b.dataset.clueToggle).filter((x) => x !== 'all') : [q];
      const on = q === 'all' ? !box.classList.contains('show-all') : !box.classList.contains('show-q' + q);
      qs.forEach((x) => box.classList.toggle('show-q' + x, on));
      if (q === 'all') box.classList.toggle('show-all', on);
      box.querySelectorAll('[data-clue-toggle]').forEach((b) => { const x = b.dataset.clueToggle; b.setAttribute('aria-pressed', x === 'all' ? String(box.classList.contains('show-all')) : String(box.classList.contains('show-q' + x))); });
      if (on && q !== 'all') { const first = box.querySelector(`.zp-clue[data-q~="${q}"]`); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    });
  }

  N.A.ready.then(async () => {
    try {
      const data = await N.A.request('getClass', { classId });
      N.previewNote(data.env);
      const c = data.class;
      document.title = `Class ${c.number} · ${c.title} · Zishen · IG English`;
      if (res) resourcePage(c); else listPage(c);
    } catch (error) { N.fail(app, error); }
  });
})();
