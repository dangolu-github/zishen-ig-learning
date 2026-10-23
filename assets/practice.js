// Extra Practice: homework first, then practice by question type (paper → exercise), then practice by paper (set → listening / reading / writing), then full mock exams.
(() => {
  const N = window.Zs, app = document.getElementById('app');
  const cards = (list) => `<div class="zp-cards">${list.map(N.taskCard).join('')}</div>`;
  const fold = (key, title, count, body, extra) => `<details class="zp-paper zp-fold" data-fold="${N.esc(key)}"${extra || ''}><summary><h3 class="zp-sub">${N.esc(title)}</h3><span class="zp-paper-count">${count}</span></summary>${body}</details>`;
  N.A.ready.then(async () => {
    try {
      const data = await N.A.request('getCatalogue', {});
      N.previewNote(data.env);
      const of = (group) => data.tasks.filter((t) => t.group === group);
      const homework = of('homework'), practice = of('practice').filter((t) => !t.setId), mock = of('mock'), inSets = of('practice').filter((t) => t.setId);
      const parts = data.parts || {};
      // One toggle per paper, one nested toggle per exercise (question type).
      const byPaper = Object.keys(data.papers).map((paper) => {
        const list = practice.filter((t) => t.paper === paper);
        if (!list.length) return '';
        const known = (parts[paper] || []).map(([id]) => id);
        const groups = (parts[paper] || []).map(([id, label]) => [id, label, list.filter((t) => t.part === id)])
          .concat([['other', 'Other', list.filter((t) => known.indexOf(t.part) < 0)]])
          .filter(([, , l]) => l.length);
        const inner = groups.map(([id, label, l]) => fold('practice:' + paper + ':' + id, label, l.length, cards(l))).join('');
        return fold('practice:' + paper, data.papers[paper], list.length, `<div class="zp-fold-body">${inner}</div>`);
      }).join('');
      // Practice by paper: one toggle per set, then Listening / Reading / Writing inside it.
      const setParts = ['Listening', 'Reading', 'Writing'];
      const paperSets = (data.practiceSets || []).map((ps) => [ps, inSets.filter((t) => t.setId === ps.id)]).filter(([, l]) => l.length);
      const byPaperSets = paperSets.map(([ps, l]) => {
        const inner = setParts.map((part) => [part, l.filter((t) => t.setPart === part)]).filter(([, x]) => x.length)
          .map(([part, x]) => fold('set:' + ps.id + ':' + part.toLowerCase(), part, x.length, cards(x))).join('');
        return fold('set:' + ps.id, ps.label, l.length, (ps.note ? `<p class="zp-note">${N.esc(ps.note)}</p>` : '') + `<div class="zp-fold-body">${inner}</div>`);
      }).join('');
      // Mocks: one toggle per set, Paper 1 then Paper 2.
      const order = (t) => ['RW', 'L'].indexOf(t.paper);
      const sets = (data.mockSets || []).map((m) => [m, mock.filter((t) => t.mockSet === m.id).sort((a, b) => order(a) - order(b))])
        .filter(([, l]) => l.length);
      const state = (m) => m.status === 'finished' ? '<p class="zp-note">Finished ✓</p>'
        : m.status === 'open' ? `<p class="zp-note">${m.done} of ${m.total} papers submitted.</p>`
        : m.status === 'locked' ? `<p class="zp-note">${m.after ? `Opens when you finish ${N.esc(m.after)}.` : 'Not open yet.'}</p>` : '';
      const mocks = sets.map(([m, l]) => fold('mock:' + m.id, m.label + (m.status === 'locked' ? ' 🔒' : m.status === 'finished' ? ' ✓' : ''), l.length, state(m) + (m.note ? `<p class="zp-note">${N.esc(m.note)}</p>` : '') + cards(l))).join('');
      app.innerHTML = `
        <p class="zp-kicker">Cambridge IGCSE (9–1) English as a Second Language · 0993</p>
        <h1>Extra Practice</h1>
        <p class="zp-lead">Real past-paper questions, answered on the page. Your answers save as you go, so you can continue on another device. Reading and listening answers are checked when you submit; your teacher marks the writing.</p>
        ${N.foldBar()}
        ${homework.length ? `<details class="zp-section zp-fold" data-fold="homework"><summary><h2>Homework <small>${homework.length}</small></h2></summary>${cards(homework)}</details>` : ''}
        <details class="zp-section zp-fold" data-fold="practice"><summary><h2>Practice by question type <small>${practice.length}</small></h2></summary>
          <p class="zp-note">Each set is one exercise from a past paper, so you can train one question type at a time.</p>
          ${byPaper || '<p class="zp-empty">Practice sets will appear here.</p>'}</details>
        <details class="zp-section zp-fold" data-fold="sets"><summary><h2>Practice by paper <small>${paperSets.length}</small></h2></summary>
          <p class="zp-note">One past paper per set, split into Listening, Reading and Writing, so you can choose the paper you need. Each exercise is answered on its own page.</p>
          ${byPaperSets || '<p class="zp-empty">Practice sets by paper will appear here.</p>'}</details>
        <details class="zp-section zp-fold" data-fold="mocks"><summary><h2>Full mock exams <small>${sets.length}</small></h2></summary>
          <p class="zp-note">A complete exam: Paper 1 Reading and Writing (2 hours) and Paper 2 Listening (about 50 minutes). The timer shows how long you take; nothing closes when the exam time is up.</p>
          ${mocks || '<p class="zp-empty">Mock exams will appear here.</p>'}</details>`;
      N.folds(app, 'extra-practice');
      N.openTarget();
    } catch (error) { N.fail(app, error); }
  });
})();
