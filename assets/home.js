// Home: the sections of the portal, what to do next and the Class Logbook.
(() => {
  const N = window.Zs, app = document.getElementById('app');
  N.A.ready.then(async () => {
    try {
      const data = await N.A.request('getHome', {});
      N.previewNote(data.env);
      const todo = data.todo.length
        ? `<div class="zp-cards">${data.todo.map(N.taskCard).join('')}</div>`
        : '<p class="zp-empty">No homework is waiting.</p>';
      const classes = data.classes.length
        ? `<ol class="zp-log">${data.classes.map((c) => `<li><a href="class/?id=${encodeURIComponent(c.id)}"><span class="num">${N.esc(c.number)}</span><span><strong>${N.esc(c.title)}</strong><span class="date">Class ${N.esc(c.number)} · ${N.esc(N.longDate(c.date))}${c.focus ? ' · ' + N.esc(c.focus) : ''}</span></span><span class="go">Open →</span></a></li>`).join('')}</ol>`
        : '<p class="zp-empty">Class records will appear here after each class.</p>';
      app.innerHTML = `
        <p class="zp-kicker">Cambridge IGCSE (9–1) English as a Second Language · 0993</p>
        <h1>Welcome, Zishen</h1>
        <p class="zp-lead">Your class records, exam practice, mistakes to review and your word log, all in one place.</p>
        <div class="zp-tiles">
          <a class="zp-tile" href="extra-practice/"><b>${data.counts.practice}</b><strong>Extra Practice</strong><span>Practice by question type · full mock exams</span></a>
          <a class="zp-tile" href="mistake-log/"><b>${data.counts.mistakesOpen}</b><strong>Mistake Log</strong><span>Mistakes to review</span></a>
          <a class="zp-tile" href="vocabulary/"><b>${data.counts.words}</b><strong>Vocabulary</strong><span>Word lists and my words</span></a>
        </div>
        ${N.foldBar()}
        <details class="zp-section zp-fold" data-fold="todo"><summary><h2>To do <small>${data.todo.length}</small></h2></summary>${todo}</details>
        <details class="zp-section zp-fold" data-fold="classes"><summary><h2>Class Logbook <small>${data.classes.length}</small></h2></summary>${classes}</details>`;
      N.folds(app, 'home');
    } catch (error) { N.fail(app, error); }
  });
})();
