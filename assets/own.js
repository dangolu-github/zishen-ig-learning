// Your own practice: questions from your own books or school worksheets, handed in as photos or a PDF.
// Without ?id= the page is the hand-in form: each page uploads as soon as it is chosen (bound to this hand-in) and
// "Hand in" sends the list. With ?id= it shows one hand-in: the pages, and the checked result once the teacher has
// released it. The form is kept on this device until it is handed in, so a closed tab loses nothing.
(() => {
  const N = window.Zs, A = N.A, app = document.getElementById('app');
  const viewId = new URLSearchParams(location.search).get('id') || '';
  const STORE = 'zs-ig-own:new';
  const S = { env: '', limits: { maxFiles: 20, maxBytes: 12 * 1024 * 1024, skills: ['Reading', 'Listening', 'Writing', 'Other'] }, form: null, own: null, batches: 0, sending: false };
  const back = `<p class="zp-back"><a href="${N.root}extra-practice/">← Extra Practice</a></p>`;

  const readLocal = () => { try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (error) { return null; } };
  const writeLocal = () => { try { localStorage.setItem(STORE, JSON.stringify(Object.assign({ env: S.env }, S.form))); } catch (error) { /* the pages are on the server already */ } };
  const clearLocal = () => { try { localStorage.removeItem(STORE); } catch (error) { /* nothing kept */ } };
  // pending: the upload ID of each page that has not been confirmed yet, so choosing the same page again
  // after a failure is a retry of that upload and the course reuses the file it already saved.
  const fresh = () => ({ ownId: N.newId('own'), title: '', skill: 'Reading', hasKey: false, note: '', files: [], meta: {}, pending: {} });
  // One chosen file, named by what the browser knows about it.
  const fileSlot = (file) => `${file.name}|${file.size}|${file.lastModified || 0}|${file.type || ''}`;
  // A retry must send the same bytes, so the prepared blob of an unconfirmed page is kept for this page's life.
  const prepared = new Map();

  function filesHtml(ids, meta, editable) {
    return `<ul class="zp-files">${ids.map((f, index) => {
      const m = meta[f] || {};
      return `<li><span>${index + 1}. ✓ ${N.esc(m.name || 'File')}${m.bytes ? ' · ' + N.size(m.bytes) : ''}</span><button class="zp-linkbtn" type="button" data-view="${N.esc(f)}">View</button>${editable ? `<button class="zp-linkbtn" type="button" data-move="-1" data-file="${N.esc(f)}"${index ? '' : ' disabled'}>↑</button><button class="zp-linkbtn" type="button" data-move="1" data-file="${N.esc(f)}"${index < ids.length - 1 ? '' : ' disabled'}>↓</button><button class="zp-linkbtn" type="button" data-remove="${N.esc(f)}">Remove</button>` : ''}</li>`;
    }).join('')}</ul>`;
  }

  // ---------- the hand-in form ----------

  function renderForm() {
    const f = S.form;
    app.innerHTML = `${back}
      <p class="zp-kicker">Extra Practice · Your own practice</p>
      <h1>Submit your own practice</h1>
      <p class="zp-lead">Done some questions from your own book or a school worksheet? Hand them in here and your teacher will check them. Upload clear photos or a PDF of the text and questions, your answers, and the answer key if you have one.</p>
      <div class="zp-form">
        <label class="zp-field wide">What is it?<input data-f="title" maxlength="120" value="${N.esc(f.title)}" placeholder="e.g. School worksheet: Reading Exercise 2, Ocean plastic"></label>
        <label class="zp-field">Skill<select data-f="skill">${S.limits.skills.map((s) => `<option${s === f.skill ? ' selected' : ''}>${N.esc(s)}</option>`).join('')}</select></label>
        <label class="zp-own-check"><input type="checkbox" data-f="hasKey"${f.hasKey ? ' checked' : ''}> The answer key is in my files</label>
        <div class="wide zp-file"><p class="zp-field">Your pages, in order (photos or a PDF)</p><div data-files></div>
          <label class="zp-drop"><input type="file" multiple accept="image/*,application/pdf,.pdf,.heic,.heif" data-pick><strong>Choose photos or a PDF</strong><span>Up to ${S.limits.maxFiles} files · 12 MB per file</span></label><div class="zp-progress" hidden><i></i></div><p class="zp-msg" data-filemsg role="status"></p></div>
        <label class="zp-field wide">Anything your teacher should know? (optional)<textarea data-f="note" rows="3" maxlength="1500" placeholder="e.g. I did not have time for question 6.">${N.esc(f.note)}</textarea></label>
      </div>
      <div class="zp-actions"><button class="zp-btn" type="button" data-send>Hand in<small>You cannot change it afterwards</small></button></div><p class="zp-msg" data-sendmsg role="status"></p>`;
    drawFiles();
  }

  function drawFiles() {
    const box = app.querySelector('[data-files]');
    if (box) box.innerHTML = S.form.files.length ? filesHtml(S.form.files, S.form.meta, !S.sending) : '<p class="zp-note">No pages yet.</p>';
  }

  async function upload(files, input) {
    const message = app.querySelector('[data-filemsg]'), bar = app.querySelector('.zp-progress'), fill = bar.querySelector('i');
    const say = (text, kind) => { message.textContent = text; message.className = 'zp-msg' + (kind ? ' ' + kind : ''); };
    const bad = files.find((f) => !/^image\//.test(f.type) && f.type !== 'application/pdf' && !/\.(pdf|heic|heif|jpe?g|png|webp)$/i.test(f.name));
    if (bad) { say(`${bad.name} is not a photo or PDF.`, 'error'); input.value = ''; return; }
    if (!S.form.pending) S.form.pending = {};
    // Retrying a part-finished selection sends its already-listed pages again. Those are the same pages,
    // not extra ones, so they are not counted against the limit twice - otherwise a hand-in that filled
    // the limit could never be retried.
    const adding = files.filter((f) => {
      const known = S.form.pending[fileSlot(f)];
      return !known || S.form.files.indexOf(known) < 0;
    }).length;
    if (S.form.files.length + adding > S.limits.maxFiles) { say(`Choose no more than ${S.limits.maxFiles} files in total. No files from this selection were added.`, 'error'); input.value = ''; return; }
    S.batches += 1; input.disabled = true; bar.hidden = false; fill.style.width = '5%';
    // Each page's upload ID is released only when the whole selection has gone through: a page that
    // arrived must keep its ID while a later page of the same selection is still failing, or the next
    // press would ask for a second copy of a page that is already saved.
    const done = [];
    try {
      for (let i = 0; i < files.length; i += 1) {
        say(`Sending ${i + 1} of ${files.length}… Keep this page open.`);
        const slot = fileSlot(files[i]);
        const ready = prepared.get(slot) || await N.preparePage(files[i]);
        prepared.set(slot, ready);
        if (ready.blob.size > S.limits.maxBytes) throw new Error(`${files[i].name} is larger than 12 MB. Take the photo again at a smaller size.`);
        // The same page sent again keeps its upload ID, so the course reuses its file instead of saving a
        // second copy. An upload that failed never gives its ID up: an unknown outcome is exactly when a
        // new ID would make that second copy.
        const fileId = S.form.pending[slot] || N.newId('file');
        if (S.form.pending[slot] !== fileId) { S.form.pending[slot] = fileId; writeLocal(); }
        const result = await A.post('uploadOwnFile', { ownId: S.form.ownId, fileId, type: ready.type, name: ready.name, data: await N.toBase64(ready.blob), submissionOrigin: await N.origin() });
        // A retried page comes back as the same file; it is listed once, in its original place.
        if (S.form.files.indexOf(fileId) < 0) S.form.files.push(fileId);
        S.form.meta[fileId] = { name: result.name || ready.name, mime: ready.type, bytes: result.bytes || ready.blob.size };
        writeLocal(); drawFiles();
        done.push(slot);
        fill.style.width = Math.round(((i + 1) / files.length) * 100) + '%';
      }
      // Every page of this selection is listed and saved on this device, so the IDs have done their work.
      done.forEach((slot) => { delete S.form.pending[slot]; prepared.delete(slot); });
      writeLocal();
      say(`Uploaded ${files.length} file${files.length === 1 ? '' : 's'}. Check the list and the order, then press Hand in.`, 'success');
    } catch (error) {
      say(((error && error.message) || 'The upload did not finish.')
        + ' Choose the same files and press again to finish this upload.', 'error');
    } finally {
      S.batches -= 1; input.disabled = false; input.value = '';
      setTimeout(() => { bar.hidden = true; }, 1200);
    }
  }

  async function handIn() {
    const message = app.querySelector('[data-sendmsg]'), button = app.querySelector('[data-send]');
    const say = (text, kind) => { message.textContent = text; message.className = 'zp-msg' + (kind ? ' ' + kind : ''); };
    if (S.sending) return;
    if (S.batches) { say('Wait for the upload to finish first.', 'error'); return; }
    if (!S.form.title.trim()) { say('Write what this practice is first.', 'error'); app.querySelector('[data-f=title]').focus(); return; }
    if (!S.form.files.length) { say('Upload your pages first.', 'error'); return; }
    if (!window.confirm(`Hand in these ${S.form.files.length} file${S.form.files.length === 1 ? '' : 's'}? Check that every page is there and in order. You cannot change them afterwards.`)) return;
    S.sending = true; button.disabled = true; drawFiles(); say('Handing in…');
    try {
      const f = S.form;
      await A.post('submitOwnPractice', { ownId: f.ownId, title: f.title, skill: f.skill, hasKey: f.hasKey, note: f.note, files: f.files, submissionOrigin: await N.origin() });
      clearLocal();
      location.replace(`${N.root}extra-practice/own/?id=${encodeURIComponent(f.ownId)}`);
    } catch (error) {
      S.sending = false; button.disabled = false; drawFiles();
      say((error && error.message) || 'This could not be handed in. Please try again.', 'error');
    }
  }

  // ---------- one hand-in ----------

  const LABELS = { correct: '✓ Correct', evaluated: '◎ Marked', wrong: '✗ Not correct', partial: '◐ Partly correct', blank: '✗ Not answered' };
  function renderOwn() {
    const o = S.own, r = o.result;
    document.title = o.title + ' · Zishen · IG English';
    const items = r ? r.items.map((i) => `<div class="zp-q"><div class="zp-prompt-line">${i.n ? `<span class="zp-n">${N.esc(i.n)}</span>` : ''}${N.esc(i.question)}</div>
      <div class="zp-verdict ${N.esc(i.verdict)}" data-print-feedback><p class="label">${LABELS[i.verdict] || ''}${i.outOf ? ` <small>${N.esc(i.score)} / ${N.esc(i.outOf)}</small>` : ''}</p>
      <p class="zp-pre"><span class="label">Your answer:</span> ${N.esc(i.original) || '<i>(blank)</i>'}</p>${i.correct ? `<p class="zp-pre"><span class="label">Correct answer:</span> ${N.esc(i.correct)}</p>` : ''}</div></div>`).join('') : '';
    app.innerHTML = `${back}
      <p class="zp-kicker">Your own practice · ${N.esc(o.skill)}</p>
      <h1>${N.esc(o.title)}</h1>
      <div class="zp-taskbar"><span>${o.files.length} file${o.files.length === 1 ? '' : 's'}${o.hasKey ? ' · answer key included' : ''}</span><span class="grow"></span>${r ? '<button class="zp-linkbtn" type="button" data-print>Print my work / PDF</button>' : ''}</div>
      <p class="zp-banner${r ? '' : ' warn'}" data-print-feedback>Handed in · ${N.esc(N.when(o.submittedAt))}<small>${r ? 'Your teacher has checked it. Your results are below.' : 'Your teacher will check this. The results will appear here.'}</small></p>
      ${r ? `<div class="zp-result"><h2>Feedback</h2>${r.outOf ? `<p class="zp-score">${N.esc(r.score)} / ${N.esc(r.outOf)}</p>` : ''}${r.overall ? `<p class="zp-pre">${N.esc(r.overall)}</p>` : ''}</div>` : ''}
      ${o.note ? `<p class="zp-note">Your note: ${N.esc(o.note)}</p>` : ''}
      <details class="zp-fold zp-handin" data-fold="pages" data-no-print${r ? '' : ' open'}><summary>Your pages</summary><div class="zp-fold-body">${filesHtml(o.files, o.fileMeta, false)}</div></details>
      ${items ? `<div class="zp-own-items">${items}</div>` : ''}`;
    N.folds(app, 'own:' + o.id);
  }

  // ---------- events ----------

  app.addEventListener('input', (event) => {
    const field = event.target.closest('[data-f]');
    if (!field || !S.form || S.sending) return;
    S.form[field.dataset.f] = field.type === 'checkbox' ? field.checked : field.value;
    writeLocal();
  });
  app.addEventListener('change', (event) => {
    const field = event.target.closest('[data-f]');
    if (field && S.form && !S.sending) { S.form[field.dataset.f] = field.type === 'checkbox' ? field.checked : field.value; writeLocal(); return; }
    const pick = event.target.closest('[data-pick]');
    if (pick && pick.files.length && !S.batches && !S.sending) upload(Array.from(pick.files), pick);
  });
  app.addEventListener('click', async (event) => {
    if (event.target.closest('[data-send]')) { handIn(); return; }
    const view = event.target.closest('[data-view]');
    if (view) {
      view.disabled = true;
      try { await N.viewUpload(view.dataset.view, (S.form ? S.form.meta : S.own.fileMeta)[view.dataset.view]); }
      catch (error) { window.alert((error && error.message) || 'The file could not be opened.'); }
      finally { view.disabled = false; }
      return;
    }
    if (event.target.closest('[data-print]')) {
      const button = event.target.closest('[data-print]'); button.disabled = true;
      window.ZsPrint.print({ blank: false }).catch(() => {}).finally(() => { button.disabled = false; });
      return;
    }
    if (!S.form || S.batches || S.sending) return;
    const move = event.target.closest('[data-move]');
    if (move) {
      const files = S.form.files, from = files.indexOf(move.dataset.file), to = from + Number(move.dataset.move);
      if (from >= 0 && to >= 0 && to < files.length) { [files[from], files[to]] = [files[to], files[from]]; writeLocal(); drawFiles(); }
      return;
    }
    const remove = event.target.closest('[data-remove]');
    if (remove) { S.form.files = S.form.files.filter((f) => f !== remove.dataset.remove); writeLocal(); drawFiles(); }
  });
  window.addEventListener('beforeunload', (event) => { if (S.batches) { event.preventDefault(); event.returnValue = ''; } });

  A.ready.then(async () => {
    N.warmOrigin();
    if (viewId) {
      const data = await A.request('getOwnPractice', { ownId: viewId });
      N.previewNote(data.env);
      if (!data.own) { app.innerHTML = `${back}<p class="zp-empty" role="alert">This hand-in was not found.</p>`; return; }
      S.env = data.env; S.own = data.own;
      renderOwn();
      return;
    }
    let local = readLocal();
    const data = await A.request('getOwnPractice', { ownId: local && local.ownId ? local.ownId : N.newId('own') });
    S.env = data.env; S.limits = data.limits || S.limits;
    N.previewNote(data.env);
    // Handed in already (the answer was lost on the way back): show it instead of the form.
    if (data.own) { clearLocal(); location.replace(`${N.root}extra-practice/own/?id=${encodeURIComponent(data.own.id)}`); return; }
    if (!local || !local.ownId || local.env !== data.env) local = null;
    S.form = Object.assign(fresh(), local || {});
    delete S.form.env;
    renderForm();
  }).catch((error) => N.fail(app, error));
})();
