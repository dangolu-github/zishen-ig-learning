// Extra Practice: homework first, then the learner's own practice (her own questions, handed in and checked by the teacher),
// then practice by question type (paper → exercise), then practice by paper (set → listening / reading / writing), then full mock exams.
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
      // Your own practice: the hand-in button, then each hand-in with its state (open by default until the learner closes it).
      const own = data.own || [];
      const ownCard = (o) => `<a class="zp-card zp-card-link" href="${N.root}extra-practice/own/?id=${encodeURIComponent(o.id)}"><div class="zp-card-kind">${N.esc(o.skill)} · ${o.files} file${o.files === 1 ? '' : 's'}</div><h3>${N.esc(o.title)}</h3>
        <p class="zp-meta"><span class="zp-pill ${o.state === 'checked' ? 'good' : ''}">${o.state === 'checked' ? 'Checked' : 'Waiting for your teacher'}</span> <span>${N.esc(o.state === 'checked' && o.outOf !== '' ? o.score + ' / ' + o.outOf : N.when(o.submittedAt))}</span></p><span class="zp-go">${o.state === 'checked' ? 'See feedback' : 'View'} →</span></a>`;
      app.innerHTML = `
        <p class="zp-kicker">Cambridge IGCSE (9–1) English as a Second Language · 0993</p>
        <h1>Extra Practice</h1>
        <p class="zp-lead">Exam questions to answer on the page, or to print and do on paper (upload photos or a PDF to hand them in). Your answers save as you go, so you can continue on another device. Reading and listening answers are checked when you submit; your teacher marks the writing and paper work.</p>
        ${N.foldBar()}
        ${homework.length ? `<details class="zp-section zp-fold" data-fold="homework"><summary><h2>Homework <small>${homework.length}</small></h2></summary>${cards(homework)}</details>` : ''}
        <details class="zp-section zp-fold" data-fold="own" open><summary><h2>Your own practice <small>${own.length}</small></h2></summary>
          <p class="zp-note">Questions from your own books or school worksheets. Do them, then hand them in here as photos or a PDF; your teacher checks them and the results appear here.</p>
          <div class="zp-actions"><a class="zp-btn" href="${N.root}extra-practice/own/">Submit your own practice<small>Photos or a PDF of the questions and your answers</small></a></div>
          ${own.length ? `<div class="zp-cards zp-own-list">${own.map(ownCard).join('')}</div>` : ''}</details>
        <details class="zp-section zp-fold" data-fold="practice"><summary><h2>Practice by question type <small>${practice.length}</small></h2></summary>
          <p class="zp-note">Each set is one exercise, so you can train one question type at a time.</p>
          ${byPaper || '<p class="zp-empty">Practice sets will appear here.</p>'}</details>
        <details class="zp-section zp-fold" data-fold="sets"><summary><h2>Practice by paper <small>${paperSets.length}</small></h2></summary>
          <p class="zp-note">One full paper per set, split into Listening, Reading and Writing, so you can choose the paper you need. Each exercise is answered on its own page.</p>
          ${byPaperSets || '<p class="zp-empty">Practice sets by paper will appear here.</p>'}</details>
        <details class="zp-section zp-fold" data-fold="mocks"><summary><h2>Full mock exams <small>${sets.length}</small></h2></summary>
          <p class="zp-note">A complete exam: Paper 1 Reading and Writing (2 hours) and Paper 2 Listening (about 50 minutes). The timer shows how long you take; nothing closes when the exam time is up.</p>
          ${mocks || '<p class="zp-empty">Mock exams will appear here.</p>'}</details>`;
      N.folds(app, 'extra-practice');
      N.openTarget();
    } catch (error) { N.fail(app, error); }
  });
})();
