// Task player: one task answered fully on the page.
// Typed answers save on this device at once and sync a moment later; uploaded files are sent as soon as they
// are chosen. Submitting is deliberate and final; feedback appears only when released.
// Print-first (2026-10-24): every task can be printed ("Print questions / PDF"), done on paper and handed in as a
// PDF and/or photos in the "Hand in on paper" panel, or answered on this page. Either route is enough; uploading
// only saves the pages, and "Submit" hands them in. The pages travel in one task-level envelope, `__paper`.
// Blocks may name an outer section (`sec`, e.g. "Exercise 2") and an inner group (`fold`, e.g. "Questions 7(a)–(i)");
// each becomes a remembered toggle. Recordings stay above the toggles so they keep playing while you answer.
(() => {
  const N = window.Zs, A = N.A, app = document.getElementById('app');
  const taskId = new URLSearchParams(location.search).get('id') || '';
  const S = { task: null, control: null, env: '', responses: {}, files: {}, submission: null, saveId: '', submissionId: '', clientUpdatedAt: '', secondsUsed: 0,
    dirty: false, saving: false, syncedSeconds: -1, blocked: '', uploads: 0, batches: 0, uploadErrors: {}, submitting: false, timer: null, retryDelay: 4000, pageLoads: [] };
  const PAPER = '__paper';
  const paperMode = () => Boolean(S.responses[PAPER] && S.responses[PAPER].mode === 'paper');
  const paperAllowed = () => Boolean(S.task.paperUpload && S.task.paperUpload.paperMode);
  const maxFiles = () => (S.task && ((S.task.paperUpload && S.task.paperUpload.maxFiles) || S.task.maxFiles)) || 20;
  const paperFiles = () => ((S.responses[PAPER] || {}).files || []);
  const storeKey = () => `zs-ig-task:${S.env}:${taskId}:v${S.control.resetVersion}`;
  const items = () => S.task.blocks.filter((b) => b.type === 'q');
  const hasAnswer = (v) => v != null && (typeof v === 'string' ? v.trim() !== '' : Boolean(v.file) || Boolean(v.files && v.files.length));
  const units = () => {
    const grouped = {};
    (S.task.requireAny || []).forEach((g) => g.forEach((id) => { grouped[id] = true; }));
    return items().filter((q) => !grouped[q.id] && !q.optional).map((q) => [q.id]).concat(S.task.requireAny || []);
  };
  const answered = () => units().filter((u) => u.some((id) => hasAnswer(S.responses[id]))).length;
  const readOnly = () => Boolean(S.submission) || Boolean(S.blocked) || S.submitting;

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(storeKey()) || 'null'); } catch (error) { return null; }
  }
  function writeLocal() {
    try {
      localStorage.setItem(storeKey(), JSON.stringify({ saveId: S.saveId, submissionId: S.submissionId, responses: S.responses, files: S.files, clientUpdatedAt: S.clientUpdatedAt, secondsUsed: S.secondsUsed, uploadErrors: S.uploadErrors }));
    } catch (error) { /* private mode: the server copy still saves */ }
  }

  async function load() {
    const data = await A.request('getTask', { taskId });
    S.task = data.task; S.control = data.control; S.env = data.env; S.submission = data.submission; S.files = data.files || {};
    S.blocked = '';
    N.previewNote(S.env);
    document.title = S.task.label + ' · Zishen · IG English';
    const local = readLocal() || {};
    S.saveId = local.saveId || N.newId('save');
    S.submissionId = local.submissionId || '';
    S.uploadErrors = S.submission ? {} : local.uploadErrors || {};
    if (S.submission) {
      S.responses = S.submission.responses || {};
      S.secondsUsed = S.submission.secondsUsed || 0;
    } else {
      const server = data.draft;
      const localNewer = local.responses && (!server || String(local.clientUpdatedAt || '') >= String(server.clientUpdatedAt || ''));
      S.responses = localNewer ? local.responses : server ? server.responses : {};
      S.clientUpdatedAt = localNewer ? local.clientUpdatedAt || '' : server ? server.clientUpdatedAt || '' : '';
      S.secondsUsed = Math.max(Number(local.secondsUsed) || 0, server ? server.secondsUsed || 0 : 0);
      if (localNewer) { S.files = Object.assign({}, local.files || {}, S.files); S.dirty = !server || local.clientUpdatedAt !== server.clientUpdatedAt; }
      if (!S.control.receiving) S.blocked = 'This task is closed. New answers are not being accepted.';
      // A photo or PDF chosen earlier in a question's own upload box (e.g. the writing tasks) moves into the
      // paper hand-in panel unchanged, so there is one place for paper pages.
      if (!S.responses[PAPER] && paperAllowed()) {
        const older = items().filter((q) => q.kind === 'file').flatMap((q) => ((S.responses[q.id] || {}).files || []));
        if (older.length) {
          S.responses[PAPER] = { mode: 'paper', files: [...new Set(older)] };
          items().filter((q) => q.kind === 'file').forEach((q) => { delete S.responses[q.id]; });
          S.dirty = true;
        }
      }
    }
    render();
    if (S.dirty && !readOnly()) schedule(800);
  }

  // ---------- rendering ----------

  const optionalTag = (q) => (q.optional ? '<span class="zp-optional">(optional)</span>' : '');
  const number = (q) => (q.n ? `<span class="zp-n">${N.esc(q.n)}</span>` : '');
  const text = (id) => (!paperMode() && typeof S.responses[id] === 'string' ? S.responses[id] : '');
  const off = () => (readOnly() || paperMode() ? ' disabled' : '');
  const plain = ' autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"';

  function questionHtml(q) {
    if (q.kind === 'mc') {
      // `inline`: letters in one row (picture options, matching with the statements listed above).
      return `<fieldset class="zp-q${q.inline ? ' zp-inline' : ''}" data-q="${q.id}"><legend>${number(q)}${q.prompt}</legend><div class="zp-opts">${q.options.map((option, i) => {
        const letter = 'ABCDEFGH'.charAt(i);
        return `<label class="zp-opt"><input type="radio" name="q-${q.id}" value="${letter}"${!paperMode() && S.responses[q.id] === letter ? ' checked' : ''}${off()}><span class="zp-letter">${letter}</span>${option ? `<span>${option}</span>` : ''}</label>`;
      }).join('')}</div></fieldset>`;
    }
    if (q.kind === 'gap') {
      const input = `<input type="text" data-input="${q.id}" value="${N.esc(text(q.id))}" aria-label="Answer ${N.esc(q.n)}"${plain}${off()}>`;
      const parts = q.prompt.split(/_{4,}/);
      const line = parts.length > 1 ? parts[0] + input + parts.slice(1).join('') : q.prompt + ' ' + input;
      return `<div class="zp-q zp-gap" data-q="${q.id}">${number(q)}<span class="zp-gap-line">${line}</span></div>`;
    }
    if (q.kind === 'short' || q.kind === 'long') {
      const rows = q.rows || (q.kind === 'short' ? 2 : 12);
      const guide = q.wordGuide ? ` data-min="${q.wordGuide[0]}" data-max="${q.wordGuide[1]}"` : '';
      return `<div class="zp-q" data-q="${q.id}"><div class="zp-prompt-line">${number(q)}${q.prompt}${optionalTag(q)}</div><textarea rows="${rows}" data-input="${q.id}"${plain}${off()}>${N.esc(text(q.id))}</textarea>${q.kind === 'long' ? `<p class="zp-count" data-count="${q.id}"${guide}></p>` : ''}</div>`;
    }
    if (q.kind === 'file') {
      return `<div class="zp-q zp-file" data-q="${q.id}" data-no-print><div class="zp-prompt-line">${number(q)}${q.prompt}${optionalTag(q)}</div><ul class="zp-files" data-files="${q.id}"></ul>${readOnly() ? '' : `<label class="zp-drop"><input type="file" multiple accept="image/*,application/pdf,.pdf,.heic,.heif" data-pick="${q.id}"><strong>Choose photos or a PDF</strong><span>Up to ${maxFiles()} files · 12 MB per file</span></label><div class="zp-progress" hidden><i></i></div>`}<p class="zp-msg" data-filemsg="${q.id}" role="status"></p></div>`;
    }
    return `<div class="zp-q" data-q="${q.id}"><p class="zp-note">This question type is not available on this page yet.</p></div>`;
  }

  function blockHtml(b) {
    if (b.type === 'html' && b.title) return `<details class="zp-block zp-doc zp-fold" data-fold="${N.esc('doc:' + b.title)}"><summary>${N.esc(b.title)}</summary><div class="zp-rich zp-doc-body">${b.html}</div></details>`;
    if (b.type === 'html') return `<div class="zp-block ${b.sheet ? 'zp-sheet ' : ''}zp-rich">${b.html}</div>`;
    if (b.type === 'audio' && b.missing) return `<div class="zp-block zp-audio"><div class="zp-audio-head">🎧 <span>${N.esc(b.label || 'Recording')}</span></div><p class="zp-note">Your teacher will add this recording soon.</p></div>`;
    if (b.type === 'pages' && b.missing) return `<div class="zp-block zp-figure-box"><p class="zp-note">${N.esc(b.label || 'Picture')}: your teacher will add this soon.</p></div>`;
    if (b.type === 'audio') return `<div class="zp-block zp-audio" data-audio="${N.esc(b.media)}" data-no-print><div class="zp-audio-head">🎧 <span>${N.esc(b.label || 'Recording')}</span></div><div data-audio-body></div><p class="zp-msg" role="status"></p></div>`;
    if (b.type === 'pages') return `<div class="zp-block zp-figure-box" data-pages="${N.esc(b.media.join(','))}"><div class="zp-pages-body"><p class="zp-note">Loading the pictures…</p></div></div>`;
    if (b.type === 'q') return questionHtml(b);
    return '';
  }

  // Blocks in order; consecutive blocks with the same `sec` share an outer toggle and, inside it, consecutive
  // blocks with the same `fold` share an inner toggle.
  function blocksHtml(blocks) {
    const groups = t => (t.requireAny || []);
    let html = '', i = 0;
    const isSecond = (b) => b.type === 'q' && groups(S.task).some((g) => g.indexOf(b.id) > 0);
    // New work hands in paper pages through the one task-level panel; a question's own upload box shows only
    // on work submitted that way before (its files stay part of that receipt).
    // (Only when the backend offers the panel, so the site and the backend can be released in either order.)
    const hidden = (b) => b.type === 'q' && b.kind === 'file' && Boolean(S.task.paperUpload) && !(S.submission && hasAnswer(S.responses[b.id]));
    const one = (b) => (hidden(b) ? '' : (isSecond(b) ? '<p class="zp-or">— OR —</p>' : '') + blockHtml(b));
    const inner = (list) => {
      let out = '', k = 0;
      while (k < list.length) {
        const fold = list[k].fold;
        if (!fold) { out += one(list[k]); k += 1; continue; }
        const run = [];
        while (k < list.length && list[k].fold === fold) { run.push(list[k]); k += 1; }
        out += `<details class="zp-group zp-fold" data-fold="${N.esc((run[0].sec || '') + '›' + fold)}"><summary>${N.esc(fold)}</summary><div class="zp-group-body">${run.map(one).join('')}</div></details>`;
      }
      return out;
    };
    while (i < blocks.length) {
      const sec = blocks[i].sec;
      if (!sec) {
        const run = [];
        while (i < blocks.length && !blocks[i].sec) { run.push(blocks[i]); i += 1; }
        html += inner(run);
        continue;
      }
      const run = [];
      while (i < blocks.length && blocks[i].sec === sec) { run.push(blocks[i]); i += 1; }
      html += `<details class="zp-sec zp-fold" data-fold="${N.esc('sec›' + sec)}"><summary><h2>${N.esc(sec)}</h2></summary><div class="zp-sec-body">${inner(run)}</div></details>`;
    }
    return html;
  }

  function render() {
    const t = S.task;
    // Recordings first, outside the toggles.
    const audio = t.blocks.filter((b) => b.type === 'audio');
    const rest = t.blocks.filter((b) => b.type !== 'audio');
    const back = t.classId ? `<a href="${N.root}class/?id=${encodeURIComponent(t.classId)}">← Class</a> · ` : '';
    const kind = t.group === 'mock' ? 'Full mock exam' : t.group === 'homework' ? 'Homework' : t.setId ? 'Practice by paper' : 'Practice by question type';
    app.innerHTML = `
      <p class="zp-back">${back}<a href="${N.root}extra-practice/">← Extra Practice</a></p>
      <p class="zp-kicker">${N.esc(kind)} · ${t.source && t.source.indexOf(t.paperLabel) === 0 ? N.esc(t.source) : N.esc(t.paperLabel) + (t.source ? ' · ' + N.esc(t.source) : '')}</p>
      <h1>${N.esc(t.label)}</h1>
      <div class="zp-taskbar"><span data-time></span><span data-progress></span><span class="grow"></span><span data-status role="status"></span><button class="zp-linkbtn" type="button" data-print="blank">Print questions / PDF</button>${S.submission ? '<button class="zp-linkbtn" type="button" data-print="review">Print my work / PDF</button>' : ''}</div>
      <div data-top></div>
      ${audio.map(blockHtml).join('')}
      ${N.foldBar()}
      <div data-blocks>${blocksHtml(rest)}</div>
      <div data-handin></div><div class="zp-submit" data-submit></div>`;
    app.classList.toggle('zp-paper-mode', paperMode());
    // Native question tables keep their column relationships and use the standard answer controls.
    app.querySelectorAll('[data-answer-slot]').forEach((slot) => {
      const id = slot.dataset.answerSlot;
      const field = Array.from(app.querySelectorAll('[data-q]')).find((node) => node.dataset.q === id);
      if (field) slot.append(field);
    });
    // As on the paper: the question first, then its pictures, then the letters.
    app.querySelectorAll('.zp-figure-box').forEach((figure) => {
      const next = figure.nextElementSibling;
      if (next && next.matches('fieldset.zp-inline')) next.querySelector('legend').after(figure);
    });
    N.folds(app, 'task:' + t.id);
    renderTop();
    renderHandin();
    renderSubmit();
    items().forEach((q) => {
      if (q.kind === 'long') updateCount(q.id);
      if (q.kind === 'file') drawFiles(q.id);
    });
    mountAudio();
    mountPages();
    if (S.submission) showFeedback();
    updateBar();
  }

  function renderTop() {
    const top = app.querySelector('[data-top]');
    if (S.submission) {
      const r = S.submission.result || {};
      let html = `<p class="zp-banner" data-print-feedback>Submitted · ${N.esc(N.when(S.submission.submittedAt))}<small>${r.released ? (r.pending ? 'Some answers are still waiting for your teacher. Your other results are below.' : 'Your feedback is below.') : 'Your teacher will check this.'}</small></p>`;
      if (paperMode()) {
        const names = paperFiles().map((f, i) => `${i + 1}. ${(S.files[f] || {}).name || 'File'}`).join(' · ');
        html += `<p class="zp-paper-receipt" data-print-feedback>Handed in on paper · ${paperFiles().length} file${paperFiles().length === 1 ? '' : 's'}: ${N.esc(names)}</p>`;
      }
      if (r.released && (r.outOf !== '' || r.overall)) {
        html += `<div class="zp-result"><h2>Feedback</h2>${r.outOf !== '' ? `<p class="zp-score">${N.esc(r.score)} / ${N.esc(r.outOf)}${r.pending ? ' <small>so far</small>' : ''}</p>` : ''}${r.overall ? `<p class="zp-pre">${N.esc(r.overall)}</p>` : ''}</div>`;
      }
      // Listening: the original script, closed on every visit; only its own toggle opens it (not Open all), and it prints only while open.
      if (S.submission.transcriptHtml) html += `<details class="zp-fold zp-script" data-print-feedback data-print-if-open><summary>Listening script</summary><div class="zp-fold-body zp-rich">${S.submission.transcriptHtml}</div></details>`;
      top.innerHTML = html;
    } else if (S.blocked) top.innerHTML = `<p class="zp-banner warn">${N.esc(S.blocked)}</p>`;
    else if (paperAllowed()) top.innerHTML = `<p class="zp-handin-hint" data-no-print>Two ways to hand in: answer on this page, or press <b>Print questions / PDF</b>, write your answers on paper and upload photos or a PDF under <a href="#handin">Hand in on paper</a>. Either one is enough.</p>`;
    else top.innerHTML = '';
  }

  // The paper route: choose how to hand in, upload the pages in order, then press Submit. After submission the
  // same panel is the receipt: the files that belong to this attempt, in order, each one can be opened.
  function renderHandin() {
    const area = app.querySelector('[data-handin]');
    if (!S.task.paperUpload || (S.submission && !paperFiles().length) || (S.blocked && !paperFiles().length)) { area.innerHTML = ''; return; }
    const fileBox = questionHtml({ id: PAPER, kind: 'file', prompt: 'Your paper pages, in order (photos or one PDF):', optional: false });
    const choice = paperAllowed()
      ? `<div class="zp-method" role="radiogroup" aria-label="How to hand in"><label><input type="radio" name="answer-method" value="online"${paperMode() ? '' : ' checked'}${readOnly() ? ' disabled' : ''}> Answer on this page</label><label><input type="radio" name="answer-method" value="paper"${paperMode() ? ' checked' : ''}${readOnly() ? ' disabled' : ''}> Hand in on paper</label></div><p class="zp-note">Print the questions with <b>Print questions / PDF</b>, write on the paper, then take a clear photo of each page (or scan them into one PDF). You do not need to type your answers again.</p>`
      : '<p class="zp-note">You may attach photos or a PDF of your notes.</p>';
    area.innerHTML = `<details class="zp-fold zp-handin" id="handin" data-no-print${paperMode() || S.submission ? ' open' : ''}><summary>${S.submission ? 'Submitted paper pages' : 'Hand in on paper'}</summary><div class="zp-fold-body">${S.submission ? '' : choice}${fileBox}${S.submission ? '<p class="zp-note">These files belong to this submitted attempt. Your teacher checks them and types your answers into the questions above.</p>' : '<p class="zp-note">Uploading saves the pages. Press <b>Submit answers</b> below to hand them in.</p>'}</div></details>`;
    drawFiles(PAPER);
  }

  function renderSubmit() {
    const area = app.querySelector('[data-submit]');
    if (S.submission || S.blocked) { area.innerHTML = ''; return; }
    area.innerHTML = `<div class="zp-actions"><button class="zp-btn" type="button" data-send>Submit answers<small>You cannot change them afterwards</small></button></div><p class="zp-msg" data-sendmsg role="status"></p>`;
  }

  function showFeedback() {
    const r = S.submission.result || {};
    if (!r.released) return;
    const labels = { correct: '✓ Correct', evaluated: '◎ Marked', wrong: '✗ Not correct', partial: '◐ Partly correct', blank: '✗ Not answered', pending: 'Waiting for your teacher', skipped: '' };
    (r.items || []).forEach((i) => {
      const box = app.querySelector(`[data-q="${i.id}"]`);
      if (!box || !labels[i.verdict]) return;
      const extra = [];
      if (Object.prototype.hasOwnProperty.call(i, 'original')) {
        // Paper work: the teacher's faithful copy of what was written, with wrong words marked; the receipt is unchanged.
        box.classList.add('zp-paper-reviewed');
        const input = box.querySelector('textarea, input[type=text]');
        if (input) { input.value = i.original; input.dataset.paperOriginal = '1'; }
        // A letter answer from the paper is shown ticked, as it would be online (display only; the receipt is the pages).
        const letter = String(i.original || '').trim().toUpperCase();
        const option = /^[A-H]$/.test(letter) ? box.querySelector(`input[type=radio][value="${letter}"]`) : null;
        if (option) option.checked = true;
        extra.push(`<div class="zp-pre zp-original"><span class="label">Your answer (from your paper):</span> ${annotatedOriginal(i.original, i.spans) || '<i>(blank)</i>'}${i.uncertain ? '<small> [?] Your teacher could not read part of this.</small>' : ''}</div>`);
      }
      if (i.correct) extra.push(`<p class="zp-pre"><span class="label">Correction:</span> ${N.esc(i.correct)}</p>`);
      if (i.comment) extra.push(`<p class="zp-pre"><span class="label">Comment:</span> ${N.esc(i.comment)}</p>`);
      if (i.key) extra.push(`<p><span class="label">Answer:</span> ${N.esc(i.key)}</p>`);
      if (i.accept) extra.push(`<p><span class="label">Answer:</span> ${i.accept.map(N.esc).join(' &nbsp;/&nbsp; ')}</p>`);
      if (i.points) extra.push(`<div><span class="label">Acceptable points (one mark each):</span><ul>${i.points.map((p) => `<li>${N.esc(p)}</li>`).join('')}</ul></div>`);
      if (i.explain) extra.push(`<p>${i.explain}</p>`);
      if (i.model) extra.push(`<details><summary>Model answer</summary><div class="zp-rich">${i.model}</div></details>`);
      box.insertAdjacentHTML('beforeend', `<div class="zp-verdict ${i.verdict}" data-print-feedback><p class="label">${labels[i.verdict]}</p>${extra.join('')}</div>`);
    });
  }

  function annotatedOriginal(original, spans) {
    const value = String(original || ''); let cursor = 0, html = '';
    (spans || []).forEach((span) => {
      if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < cursor || span.end <= span.start || span.end > value.length) return;
      html += N.esc(value.slice(cursor, span.start)) + `<span class="zp-error-span">${N.esc(value.slice(span.start, span.end))}</span><span class="zp-fix-span"> [${N.esc(span.replacement || '')}]</span>`;
      cursor = span.end;
    });
    return html + N.esc(value.slice(cursor));
  }

  // ---------- status bar and timing ----------

  function updateBar() {
    const t = S.task;
    const timeEl = app.querySelector('[data-time]');
    if (!timeEl) return;
    // Time is counted and kept, never enforced: no task locks when the time is up.
    const guide = t.minutes ? (t.strictTime ? ` · exam time ${t.minutes} min` : ` · suggested ${t.minutes} min`) : '';
    timeEl.innerHTML = `Time used <b>${N.clock(S.secondsUsed)}</b>${guide}`;
    app.querySelector('[data-progress]').innerHTML = paperMode() ? `On paper · <b>${paperFiles().length}</b> file${paperFiles().length === 1 ? '' : 's'} attached` : `<b>${answered()}</b> / ${units().length} answered`;
  }

  function setStatus(message) {
    const el = app.querySelector('[data-status]');
    if (el) el.textContent = message;
  }

  setInterval(() => {
    if (!S.task || readOnly() || document.hidden) return;
    S.secondsUsed += 1;
    if (S.secondsUsed % 15 === 0) writeLocal();
    // Once a minute the time used is saved with the draft, so the work can be continued anywhere.
    if (S.secondsUsed % 60 === 0 && S.secondsUsed !== S.syncedSeconds && !S.submission && !S.blocked) { S.dirty = true; schedule(500); }
    updateBar();
  }, 1000);

  // ---------- saving ----------

  function changed() {
    S.clientUpdatedAt = new Date().toISOString();
    S.dirty = true;
    writeLocal();
    updateBar();
    setStatus('Saved on this device');
    schedule(1500);
  }

  function schedule(delay) {
    clearTimeout(S.timer);
    S.timer = setTimeout(sync, delay);
  }

  // Leaving the page (closing it, switching app, locking the phone): send what is not yet saved.
  function flush() {
    if (!S.task || S.submission || S.blocked || !S.saveId) return;
    if (!S.dirty && S.secondsUsed === S.syncedSeconds) return;
    writeLocal();
    A.fire('saveDraft', { taskId, saveId: S.saveId, responses: S.responses, clientUpdatedAt: S.clientUpdatedAt, secondsUsed: S.secondsUsed });
    S.syncedSeconds = S.secondsUsed;
  }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

  async function sync() {
    if (S.saving || S.submitting || !S.dirty || S.submission || S.blocked) return;
    S.saving = true; S.dirty = false;
    try {
      const seconds = S.secondsUsed;
      await A.post('saveDraft', { taskId, saveId: S.saveId, responses: S.responses, clientUpdatedAt: S.clientUpdatedAt, secondsUsed: seconds });
      S.syncedSeconds = seconds;
      S.retryDelay = 4000;
      if (!S.dirty) setStatus('Saved · ' + new Date().toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' }));
    } catch (error) {
      const message = (error && error.message) || '';
      if (/closed|already submitted|not open|reopened/i.test(message)) {
        S.blocked = /already submitted/i.test(message) ? '' : message;
        S.saving = false;
        if (!S.blocked) { await load(); return; }
        render();
        return;
      }
      S.dirty = true;
      setStatus('Saved on this device · not sent yet');
      S.retryDelay = Math.min(60000, S.retryDelay * 2);
    }
    S.saving = false;
    if (S.dirty) schedule(S.retryDelay);
  }

  async function waitForSave() {
    clearTimeout(S.timer);
    for (let i = 0; i < 60 && S.saving; i += 1) await N.sleep(250);
  }

  async function submit() {
    const message = app.querySelector('[data-sendmsg]');
    const button = app.querySelector('[data-send]');
    if (S.submitting) return;
    if (S.uploads || S.batches) { message.textContent = 'Wait for the upload to finish first.'; message.className = 'zp-msg error'; return; }
    if (Object.keys(S.uploadErrors).length) { message.textContent = 'Some selected files were not uploaded. Retry them or keep only the files listed.'; message.className = 'zp-msg error'; return; }
    const onPaper = paperMode();
    const missing = onPaper ? 0 : units().length - answered();
    if (onPaper ? !paperFiles().length : !items().some((q) => hasAnswer(S.responses[q.id]))) {
      message.textContent = onPaper ? 'There is nothing to submit yet: upload your paper pages first.' : 'There is nothing to submit yet.'; message.className = 'zp-msg error'; return;
    }
    const question = onPaper
      ? `Hand in these ${paperFiles().length} file${paperFiles().length === 1 ? '' : 's'}? Check that every page is there and in order. You cannot change them afterwards.`
      : missing
        ? `${missing} answer${missing === 1 ? ' is' : 's are'} still empty. Submit anyway? You cannot change your answers afterwards.`
        : 'Submit your answers? You cannot change them afterwards.';
    if (!window.confirm(question)) return;
    S.submitting = true;
    button.disabled = true;
    message.textContent = 'Submitting…'; message.className = 'zp-msg';
    await waitForSave();
    if (!S.submissionId) { S.submissionId = N.newId('sub'); writeLocal(); }
    try {
      const submissionOrigin = await N.origin();
      // A paper hand-in is the pages only; answers typed before switching to paper stay in the draft, not the receipt.
      const sent = JSON.parse(JSON.stringify(onPaper ? { [PAPER]: S.responses[PAPER] } : S.responses));
      const receipt = await A.post('submitTask', { taskId, saveId: S.saveId, submissionId: S.submissionId, resetVersion: S.control.resetVersion, responses: sent, secondsUsed: S.secondsUsed, submissionOrigin });
      for (const [id, value] of Object.entries(sent)) {
        if (value && value.files && JSON.stringify(value.files) !== JSON.stringify(((receipt.responses || {})[id] || {}).files || [])) throw new Error('The receipt did not confirm every attachment. Reload to check the submitted version before retrying.');
      }
      S.dirty = false;
      S.submitting = false;
      await load();
      window.scrollTo({ top: 0 });
    } catch (error) {
      S.submitting = false;
      message.textContent = (error && error.message) || 'The answers could not be submitted. Please try again.';
      message.className = 'zp-msg error';
      button.disabled = false;
    }
  }

  // ---------- typed answers ----------

  function updateCount(id) {
    const el = app.querySelector(`[data-count="${id}"]`);
    if (!el) return;
    const count = N.words(text(id));
    const min = Number(el.dataset.min || 0), max = Number(el.dataset.max || 0);
    el.textContent = `${count} word${count === 1 ? '' : 's'}${max ? ` · write about ${min}–${max}` : ''}`;
    el.classList.toggle('ok', Boolean(max) && count >= min && count <= max);
  }

  app.addEventListener('input', (event) => {
    const input = event.target.closest('[data-input]');
    if (!input || readOnly()) return;
    const id = input.dataset.input;
    if (input.value.trim()) S.responses[id] = input.value; else delete S.responses[id];
    updateCount(id);
    changed();
  });
  app.addEventListener('change', (event) => {
    if (readOnly()) return;
    const radio = event.target.closest('input[type=radio]');
    if (radio && radio.name === 'answer-method') {
      if (S.batches) return;
      S.responses[PAPER] = { mode: radio.value, files: paperFiles() };
      changed(); render();
      const panel = app.querySelector('[data-handin] details');
      if (panel) panel.open = true;
      return;
    }
    if (radio && radio.name.indexOf('q-') === 0) { S.responses[radio.name.slice(2)] = radio.value; changed(); return; }
    const pick = event.target.closest('[data-pick]');
    if (pick && pick.files.length) uploadFiles(pick.dataset.pick, Array.from(pick.files), pick);
  });
  app.addEventListener('click', (event) => {
    // "Hand in on paper" link in the top note: open the panel even when the address already ends in #handin.
    if (event.target.closest('a[href="#handin"]')) { const panel = app.querySelector('#handin'); if (panel) panel.open = true; }
    if (event.target.closest('[data-send]')) submit();
    else if (event.target.closest('[data-print]')) {
      const button = event.target.closest('[data-print]'); button.disabled = true;
      window.ZsPrint.print({ blank: button.dataset.print === 'blank', prepare: async () => { await Promise.all(S.pageLoads.map((start) => start())); } })
        .catch((e) => { setStatus(e.message || 'Printing could not start.'); }).finally(() => { button.disabled = false; });
    }
    const acceptFiles = event.target.closest('[data-keep-uploaded]');
    if (acceptFiles && !readOnly()) { delete S.uploadErrors[acceptFiles.dataset.keepUploaded]; writeLocal(); drawFiles(acceptFiles.dataset.keepUploaded); }
    const viewFile = event.target.closest('[data-open-file]');
    if (viewFile) openFile(viewFile.dataset.openFile, viewFile);
    const move = event.target.closest('[data-file-move]');
    if (move && !readOnly() && !S.batches) {
      const id = move.dataset.item, files = ((S.responses[id] || {}).files || []).slice(), from = files.indexOf(move.dataset.file), to = from + Number(move.dataset.fileMove);
      if (from >= 0 && to >= 0 && to < files.length) { [files[from], files[to]] = [files[to], files[from]]; S.responses[id] = Object.assign({}, S.responses[id], { files }); changed(); drawFiles(id); }
    }
    const remove = event.target.closest('[data-remove]');
    if (remove && !readOnly() && !S.batches) {
      const id = remove.dataset.item;
      const left = ((S.responses[id] || {}).files || []).filter((f) => f !== remove.dataset.remove);
      if (id === PAPER) S.responses[id] = Object.assign({}, S.responses[id], { files: left });
      else if (left.length) S.responses[id] = { files: left }; else delete S.responses[id];
      drawFiles(id);
      changed();
    }
  });
  window.addEventListener('beforeunload', (event) => {
    if (S.uploads || S.batches) { event.preventDefault(); event.returnValue = ''; }
  });

  // ---------- photos and PDF of handwritten work ----------

  async function sendFile(itemId, blob, type, name) {
    const fileId = N.newId('file');
    S.uploads += 1;
    try {
      const data = await N.toBase64(blob), submissionOrigin = await N.origin();
      const result = await A.post('uploadFile', { taskId, itemId, fileId, type, name, kind: 'uploaded', seconds: 0, data, submissionOrigin });
      S.files[fileId] = { name: result.name || name, mime: type, bytes: result.bytes || blob.size, kind: 'uploaded' };
      return { fileId };
    } finally { S.uploads -= 1; }
  }

  function drawFiles(id) {
    const list = app.querySelector(`[data-files="${id}"]`);
    if (!list) return;
    const files = (S.responses[id] || {}).files || [];
    list.innerHTML = files.map((f, index) => {
      const meta = S.files[f] || {};
      return `<li><span>${index + 1}. ✓ ${N.esc(meta.name || 'File')}${meta.bytes ? ' · ' + N.size(meta.bytes) : ''}</span><button class="zp-linkbtn" type="button" data-open-file="${f}">View</button>${readOnly() ? '' : `<button class="zp-linkbtn" type="button" data-file-move="-1" data-file="${f}" data-item="${id}"${index ? '' : ' disabled'}>↑</button><button class="zp-linkbtn" type="button" data-file-move="1" data-file="${f}" data-item="${id}"${index < files.length - 1 ? '' : ' disabled'}>↓</button><button class="zp-linkbtn" type="button" data-remove="${f}" data-item="${id}">Remove</button>`}</li>`;
    }).join('');
    const message = app.querySelector(`[data-filemsg="${id}"]`);
    if (message && S.uploadErrors[id]) message.innerHTML = `${N.esc(S.uploadErrors[id])} <button type="button" class="zp-linkbtn" data-keep-uploaded="${id}">Keep only the files listed above</button>`;
    else if (message) message.textContent = '';
  }

  async function openFile(id, button) {
    button.disabled = true;
    try { await N.viewUpload(id, S.files[id]); }
    catch (e) { setStatus(e.message || 'The file could not be opened.'); }
    finally { button.disabled = false; }
  }

  const prepare = N.preparePage;

  async function uploadFiles(id, files, input) {
    if (S.batches || readOnly()) { input.value = ''; return; }
    const message = app.querySelector(`[data-filemsg="${id}"]`);
    const bar = input.closest('.zp-q').querySelector('.zp-progress');
    const say = (textValue, kind) => { message.textContent = textValue; message.className = 'zp-msg' + (kind ? ' ' + kind : ''); };
    const bad = files.find((f) => !/^image\//.test(f.type) && f.type !== 'application/pdf' && !/\.(pdf|heic|heif|jpe?g|png|webp)$/i.test(f.name));
    const failSelection = (textValue) => { S.uploadErrors[id] = textValue; writeLocal(); drawFiles(id); input.value = ''; };
    if (bad) { failSelection(`${bad.name} is not a photo or PDF.`); return; }
    if ((((S.responses[id] || {}).files || []).length + files.length) > maxFiles()) { failSelection(`Choose no more than ${maxFiles()} files in total. No files from this selection were added.`); return; }
    if (id === PAPER) {
      // Choosing pages means handing in on paper: the on-page answers are set aside (kept in the draft, not sent).
      S.responses[PAPER] = Object.assign({ files: [] }, S.responses[PAPER] || {}, { mode: paperAllowed() ? 'paper' : 'online' });
      app.querySelectorAll('[name=answer-method]').forEach((r) => { r.checked = r.value === S.responses[PAPER].mode; });
      if (paperMode()) app.querySelectorAll('[data-blocks] [data-input], [data-blocks] input[type=radio]').forEach((el) => {
        el.disabled = true;
        if (el.type === 'radio') el.checked = false;
        else el.value = '';
      });
      app.classList.toggle('zp-paper-mode', paperMode());
    }
    S.batches += 1; input.disabled = true;
    bar.hidden = false;
    const fill = bar.querySelector('i');
    fill.style.width = '5%';
    try {
      for (let i = 0; i < files.length; i += 1) {
        say(`Sending ${i + 1} of ${files.length}… Keep this page open.`);
        const ready = await prepare(files[i]);
        if (ready.blob.size > 12 * 1024 * 1024) throw new Error(`${files[i].name} is larger than 12 MB. Take the photo again at a smaller size.`);
        const sent = await sendFile(id, ready.blob, ready.type, ready.name);
        S.responses[id] = Object.assign({}, S.responses[id] || {}, { files: ((S.responses[id] || {}).files || []).concat(sent.fileId) });
        drawFiles(id);
        changed();
        fill.style.width = Math.round(((i + 1) / files.length) * 100) + '%';
      }
      if (S.uploadErrors[id]) drawFiles(id);
      else say(`Uploaded ${files.length} file${files.length === 1 ? '' : 's'}. Check the list and the order, then press Submit answers.`, 'success');
    } catch (error) {
      S.uploadErrors[id] = (error && error.message) || 'The upload did not finish. Please try again.';
      writeLocal(); drawFiles(id); message.classList.add('error');
    } finally {
      S.batches -= 1; input.disabled = readOnly();
      input.value = '';
      setTimeout(() => { bar.hidden = true; }, 1200);
    }
  }

  // ---------- private audio and pictures ----------

  function mountAudio() {
    app.querySelectorAll('[data-audio]').forEach((box) => {
      const mediaId = box.dataset.audio;
      const body = box.querySelector('[data-audio-body]'), message = box.querySelector('.zp-msg');
      body.innerHTML = '<div class="zp-actions"><button class="zp-btn" type="button" data-load>Load the recording</button></div><div class="zp-progress" hidden><i></i></div>';
      body.querySelector('[data-load]').addEventListener('click', async (event) => {
        const button = event.currentTarget, bar = body.querySelector('.zp-progress'), fill = bar.querySelector('i');
        button.disabled = true; bar.hidden = false; message.textContent = 'Loading…'; message.className = 'zp-msg';
        try {
          const blob = await N.loadMedia(mediaId, (fraction) => { fill.style.width = Math.round(fraction * 100) + '%'; });
          message.textContent = '';
          body.innerHTML = `<audio controls preload="auto" src="${URL.createObjectURL(blob)}"></audio>`;
        } catch (error) {
          button.disabled = false; bar.hidden = true;
          message.textContent = (error && error.message) || 'The recording could not be loaded.'; message.className = 'zp-msg error';
        }
      });
    });
  }

  function mountPages() {
    S.pageLoads = [];
    app.querySelectorAll('[data-pages]').forEach((box) => {
      const body = box.querySelector('.zp-pages-body');
      let loading = null;
      const start = () => {
        if (loading) return loading;
        loading = (async () => {
          const urls = [];
          for (const mediaId of box.dataset.pages.split(',')) urls.push(URL.createObjectURL(await N.loadMedia(mediaId)));
          body.innerHTML = urls.map((url, i) => `<img src="${url}" alt="Answer options, picture ${i + 1}">`).join('');
          await Promise.all(Array.from(body.querySelectorAll('img')).map((img) => img.decode()));
        })().catch((error) => {
          loading = null;
          body.innerHTML = `<p class="zp-msg error">${N.esc((error && error.message) || 'The pictures could not be loaded.')}</p>`;
          throw error;
        });
        return loading;
      };
      S.pageLoads.push(start);
      // Pictures load when their toggle is opened, and all of them before printing.
      const fold = box.closest('details');
      if (!fold || fold.open) start().catch(() => {});
      if (fold) fold.addEventListener('toggle', () => { if (fold.open) start().catch(() => {}); });
    });
  }

  A.ready.then(() => { N.warmOrigin(); return load(); }).catch((error) => N.fail(app, error));
})();
