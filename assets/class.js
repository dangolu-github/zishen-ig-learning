// One class record: Class Handout, Class Summary, Class Words, Homework. Every section is a remembered toggle.
(() => {
  const N = window.Zs, app = document.getElementById('app');
  const classId = new URLSearchParams(location.search).get('id') || '';
  N.A.ready.then(async () => {
    try {
      const data = await N.A.request('getClass', { classId });
      N.previewNote(data.env);
      const c = data.class;
      document.title = `Class ${c.number} · ${c.title} · Zishen · IG English`;
      const handouts = c.resources.length
        ? c.resources.map((r) => `<details class="zp-fold" data-fold="res:${N.esc(r.id)}" data-res-media="${N.esc((r.media || []).join(','))}"><summary><small>${N.esc(r.kind)}</small>${N.esc(r.label)}</summary><div class="zp-fold-body zp-rich">${r.html}${(r.media || []).length ? '<div class="zp-res-pages" data-res-pages><p class="zp-note">Loading the pages…</p></div>' : ''}</div></details>`).join('')
        : '<p class="zp-empty">No handout for this class.</p>';
      const summary = c.summaryHtml
        ? `${c.summaryHidden ? '<p class="zp-banner warn">Hidden from the learner until Summary visible is turned on.</p>' : ''}<div class="zp-block zp-rich">${c.summaryHtml}</div>`
        : '<p class="zp-empty">The class summary will appear here.</p>';
      const homework = c.tasks.length
        ? `<div class="zp-cards">${c.tasks.map(N.taskCard).join('')}</div>`
        : '<p class="zp-empty">No homework for this class.</p>';
      // Class words: ticked words (Known, shared with the Vocabulary page) are left out of the copy; phrases too.
      const lists = c.words || [];
      const listById = (id) => lists.filter((l) => l.id === id)[0];
      const unchecked = (l) => l.words.filter((w) => !w.known && !/\s/.test(w.word.trim())).map((w) => w.word);
      const wordTable = (l) => {
        const checked = l.words.filter((w) => w.known).length;
        return `<details class="zp-fold" data-fold="words:${N.esc(l.id)}" data-wordlist="${N.esc(l.id)}"><summary><small>${l.words.length} words${checked ? ` · ${checked} known` : ''}</small>${N.esc(l.title)}</summary><div class="zp-fold-body">${l.note ? `<p class="zp-note">${N.esc(l.note)}</p>` : ''}
        <div class="zp-actions"><button class="zp-btn quiet" type="button" data-checkall="${N.esc(l.id)}"${checked === l.words.length ? ' disabled' : ''}>Check all</button><button class="zp-btn quiet" type="button" data-uncheckall="${N.esc(l.id)}"${checked ? '' : ' disabled'}>Uncheck all</button></div>
        <div class="zp-tablewrap"><table class="zp-wordtable"><thead><tr><th class="ck">Known</th><th>Word</th><th>Meaning</th><th>Example</th></tr></thead><tbody>${l.words.map((w) => `<tr class="${w.known ? 'is-known' : ''}"><td class="ck"><input type="checkbox" aria-label="Known: ${N.esc(w.word)}" data-known="${N.esc(w.id)}"${w.known ? ' checked' : ''}></td><td><strong>${N.esc(w.word)}</strong> <small>${N.esc(w.pos)}</small></td><td>${N.esc(w.meaning)}</td><td class="ex">${N.esc(w.example)}</td></tr>`).join('')}</tbody></table></div>
        <div class="zp-actions"><button class="zp-btn quiet" type="button" data-copy-words="${N.esc(l.id)}">Copy unchecked words</button></div></div></details>`;
      };
      const classWordsHtml = () => lists.length
        ? `${lists.map(wordTable).join('')}<p class="zp-msg" id="copy-msg"></p>`
        : '<p class="zp-empty">No word list for this class yet.</p>';
      app.innerHTML = `
        <p class="zp-back"><a href="../">← Home</a></p>
        <p class="zp-kicker">Class ${N.esc(c.number)} · ${N.esc(N.longDate(c.date))}</p>
        <h1>${N.esc(c.title)}</h1>
        ${c.focus ? `<p class="zp-lead">${N.esc(c.focus)}</p>` : ''}
        <div class="zp-actions"><button class="zp-btn quiet" type="button" id="print">Print / Save as PDF</button></div>
        ${N.foldBar()}
        <details class="zp-section zp-fold" data-fold="handout" id="class-handout"><summary><h2>Class Handout</h2></summary>${handouts}</details>
        <details class="zp-section zp-fold" data-fold="summary" id="class-summary"><summary><h2>Class Summary</h2></summary>${summary}</details>
        <details class="zp-section zp-fold" data-fold="words" id="class-words"><summary><h2>Class Words</h2></summary><div data-words>${classWordsHtml()}</div></details>
        <details class="zp-section zp-fold" data-fold="homework" id="homework"><summary><h2>Homework</h2></summary>${homework}</details>`;
      const page = 'class:' + c.id;
      N.folds(app, page);
      N.openTarget();
      // Page images of an annotated handout load when its toggle is opened (and before printing).
      const pageLoads = [];
      app.querySelectorAll('details[data-res-media]').forEach((fold) => {
        const ids = fold.dataset.resMedia ? fold.dataset.resMedia.split(',') : [];
        if (!ids.length) return;
        let loading = null;
        const start = () => loading || (loading = (async () => {
          const box = fold.querySelector('[data-res-pages]');
          const urls = [];
          for (const id of ids) urls.push(URL.createObjectURL(await N.loadMedia(id)));
          box.innerHTML = urls.map((u, i) => `<img src="${u}" alt="Annotated page ${i + 1}">`).join('');
        })().catch((error) => { loading = null; fold.querySelector('[data-res-pages]').innerHTML = `<p class="zp-msg error">${N.esc(error.message || 'The pages could not be loaded.')}</p>`; }));
        pageLoads.push(start);
        if (fold.open) start();
        fold.addEventListener('toggle', () => { if (fold.open) start(); });
      });
      const redraw = () => { app.querySelector('[data-words]').innerHTML = classWordsHtml(); N.folds(app, page); };
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
        // Clue finder: show where each question's answer, its clue words and the trap are in the text.
        const clue = event.target.closest('[data-clue-toggle]');
        if (clue) {
          const box = clue.closest('.zp-cluebox'), q = clue.dataset.clueToggle;
          const qs = q === 'all' ? Array.from(box.querySelectorAll('[data-clue-toggle]')).map((b) => b.dataset.clueToggle).filter((x) => x !== 'all') : [q];
          const on = q === 'all' ? !box.classList.contains('show-all') : !box.classList.contains('show-q' + q);
          qs.forEach((x) => box.classList.toggle('show-q' + x, on));
          if (q === 'all') box.classList.toggle('show-all', on);
          box.querySelectorAll('[data-clue-toggle]').forEach((b) => { const x = b.dataset.clueToggle; b.setAttribute('aria-pressed', x === 'all' ? String(box.classList.contains('show-all')) : String(box.classList.contains('show-q' + x))); });
          if (on && q !== 'all') { const first = box.querySelector(`.zp-clue[data-q~="${q}"]`); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
          return;
        }
        const all = event.target.closest('[data-checkall]'), none = event.target.closest('[data-uncheckall]');
        if (all || none) {
          const l = listById(all ? all.dataset.checkall : none.dataset.uncheckall);
          const words = l.words.filter((w) => w.known !== Boolean(all));
          if (words.length) await setKnown(words, Boolean(all));
          return;
        }
        const button = event.target.closest('[data-copy-words]');
        if (!button) return;
        const words = unchecked(listById(button.dataset.copyWords));
        if (!words.length) { say('Nothing to copy: every word is ticked.'); return; }
        try { await navigator.clipboard.writeText(words.join('\n')); say(`Copied ${words.length} words.`, 'success'); }
        catch (error) { say('Copying is blocked here. Use the Vocabulary page to download the list.', 'error'); }
      });
      document.getElementById('print').addEventListener('click', () => window.ZsPrint.print({ prepare: () => Promise.all(pageLoads.map((start) => start())) }).catch(() => window.print()));
    } catch (error) { N.fail(app, error); }
  });
})();
