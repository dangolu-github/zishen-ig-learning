// Speaking answers (2026-11-17): record in the browser with the microphone, or upload an audio file.
// A finished take is sent at once and replaces the earlier take for that question; the audio is kept in the
// page until it is confirmed, so a failed upload can be retried without recording again.
// Loaded after app.js and before task.js; task.js mounts one recorder per speaking question.
window.ZsRecorder = (() => {
  const MAX_BYTES = 12 * 1024 * 1024;
  const EXT_TYPES = { m4a: 'audio/mp4', mp4: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', webm: 'audio/webm', '3gp': 'audio/3gpp', amr: 'audio/amr', caf: 'audio/x-caf', flac: 'audio/flac' };
  // The audio types the course accepts for a speaking answer.
  const KNOWN = ['audio/webm', 'video/webm', 'audio/ogg', 'audio/mp4', 'video/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/3gpp', 'audio/amr', 'audio/x-caf', 'audio/flac'];
  const ACCEPT = 'audio/*,.m4a,.mp3,.wav,.aac,.ogg,.webm,.mp4,.3gp,.amr,.caf,.flac';
  const canRecord = () => Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  // Chrome, Edge and Firefox record webm/ogg; Safari on Mac, iPhone and iPad records audio/mp4.
  const pickType = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
  // One microphone at a time: starting a recording stops any other one on the page.
  let active = null;

  const duration = (blob) => new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(blob);
    const done = (value) => { clearTimeout(timer); URL.revokeObjectURL(url); resolve(value); };
    const timer = setTimeout(() => done(0), 3000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(isFinite(audio.duration) ? Math.round(audio.duration) : 0);
    audio.onerror = () => done(0);
    audio.src = url;
  });

  // o: { item, value, meta, disabled, locked() → true while the page takes no changes,
  //      upload({blob,type,name,kind,seconds,takeId}) → {fileId, meta, release}, onChange(value, meta, release),
  //      playback(fileId) → Blob }
  function mount(box, o) {
    const N = window.Zs;
    const item = o.item;
    const max = item.maxSeconds || 180;
    const locked = () => Boolean(o.disabled || (o.locked && o.locked()));
    const st = { value: o.value || null, meta: o.meta || null, url: '', mode: 'idle', revealed: !item.revealOnStart || Boolean(o.value) || Boolean(o.disabled), message: '', error: false, pending: null };
    let recorder = null, stream = null, ticker = null, meter = null, context = null, prepTimer = null, asked = 0, dead = false;
    // The prompt prints; the panel (buttons, player, messages) never does.
    box.innerHTML = `<div class="zp-prompt-line">${item.n ? `<span class="zp-n">${N.esc(item.n)}</span>` : ''}<span data-prompt></span>${item.optional ? '<span class="zp-optional">(optional)</span>' : ''}</div><div class="zp-speak-panel" data-no-print></div>`;
    const promptEl = box.querySelector('[data-prompt]'), panel = box.querySelector('.zp-speak-panel');

    const note = (text, error) => { st.message = text || ''; st.error = Boolean(error); };

    function draw() {
      if (dead) return;
      promptEl.innerHTML = st.revealed ? item.prompt : '<span class="zp-speak-hidden">The question appears when you start.</span>';
      let html = '';
      if (st.mode === 'prep') {
        html = `<div class="zp-prep"><span>Preparation time</span><span class="zp-rec-time" data-prep></span>${canRecord() ? '<button class="zp-btn" type="button" data-act="record">● Start recording now</button>' : ''}<button class="zp-btn quiet" type="button" data-act="cancel">Cancel</button></div>`;
      } else if (st.mode === 'recording') {
        html = `<div class="zp-rec" role="status"><span class="zp-rec-dot"></span><span class="zp-rec-time" data-time>0:00 / ${N.clock(max)}</span><span class="zp-level"><i></i></span><button class="zp-btn danger" type="button" data-act="stop">■ Stop<small>and save this answer</small></button></div>`;
      } else if (st.mode === 'asking') {
        html = '<div class="zp-prep"><span>Allow the microphone when your browser asks.</span><button class="zp-btn quiet" type="button" data-act="cancel">Cancel</button></div>';
      } else if (st.mode === 'uploading') {
        html = '<p class="zp-msg">Saving your answer… Keep this page open.</p><div class="zp-progress"><i style="width:65%"></i></div>';
      } else {
        if (st.pending) {
          html += `<audio controls preload="metadata" src="${st.pending.url}"></audio><div class="zp-actions"><button class="zp-btn" type="button" data-act="retry">Save this answer again</button></div>`;
        } else if (st.value) {
          const meta = st.meta || {};
          const facts = [meta.kind === 'uploaded' ? 'Audio file saved' : 'Recording saved', meta.seconds ? N.clock(meta.seconds) : '', meta.bytes ? N.size(meta.bytes) : ''].filter(Boolean).join(' · ');
          html += `<div class="zp-saved"><span class="zp-pill good">✓</span><span>${N.esc(facts)}</span></div>`;
          html += st.url ? `<audio controls preload="metadata" src="${st.url}"></audio>` : '<div class="zp-actions"><button class="zp-btn quiet" type="button" data-act="play">▶ Listen to my answer</button></div>';
        } else if (o.disabled) {
          html += '<p class="zp-note">No answer was recorded for this question.</p>';
        }
        if (!o.disabled) {
          const again = Boolean(st.value) || Boolean(st.pending);
          html += '<div class="zp-actions">'
            + (item.prepSeconds && !again ? `<button class="zp-btn alt" type="button" data-act="prep">Start preparation (${N.clock(item.prepSeconds)})</button>` : '')
            + (canRecord() ? `<button class="zp-btn${again ? ' alt' : ''}" type="button" data-act="record">● ${again ? 'Record again' : 'Record'}<small>Up to ${N.clock(max)}${again ? ' · replaces this answer' : ''}</small></button>` : '')
            + `<label class="zp-btn alt zp-filepick">Upload an audio file<small>m4a, mp3 or wav · up to 12 MB</small><input type="file" accept="${ACCEPT}" data-file></label></div>`
            + (canRecord() ? '' : '<p class="zp-note">This browser cannot record. Upload an audio file instead.</p>');
        }
      }
      panel.innerHTML = html + `<p class="zp-msg${st.error ? ' error' : ''}" role="status">${N.esc(st.message)}</p>`;
    }

    function release() {
      clearInterval(ticker); ticker = null;
      if (meter) cancelAnimationFrame(meter); meter = null;
      if (stream) stream.getTracks().forEach((track) => track.stop()); stream = null;
      if (context) { try { context.close(); } catch (error) { /* already closed */ } } context = null;
      if (active === api) active = null;
    }

    function clearPrep() { clearInterval(prepTimer); prepTimer = null; }

    function startPrep() {
      st.mode = 'prep'; st.revealed = true; note('');
      draw();
      const end = Date.now() + item.prepSeconds * 1000;
      const tick = () => {
        const left = Math.max(0, Math.round((end - Date.now()) / 1000));
        const el = panel.querySelector('[data-prep]');
        if (el) el.textContent = N.clock(left);
        if (left <= 0 && st.mode === 'prep') { clearPrep(); st.mode = 'idle'; note('Preparation time is up. Start recording.'); draw(); }
      };
      tick();
      prepTimer = setInterval(tick, 500);
    }

    async function startRecording() {
      if (active && active !== api) active.stop();
      clearPrep();
      const request = ++asked;
      st.mode = 'asking'; st.revealed = true; note('');
      draw();
      let granted = null;
      try { granted = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
      catch (error) {
        if (request !== asked || st.mode !== 'asking') return;
        st.mode = 'idle';
        note('The microphone is blocked. Allow the microphone for this site in your browser, or upload an audio file instead.', true);
        draw();
        return;
      }
      // Cancelled (or the page moved on) while the browser was still asking: let the microphone go again.
      if (dead || request !== asked || st.mode !== 'asking') { granted.getTracks().forEach((track) => track.stop()); return; }
      stream = granted;
      const type = pickType();
      try { recorder = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream); }
      catch (error) { release(); st.mode = 'idle'; note('Recording is not available in this browser. Upload an audio file instead.', true); draw(); return; }
      active = api;
      const chunks = [];
      const started = performance.now();
      recorder.ondataavailable = (event) => { if (event.data && event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        // A take that ran to the limit is reported as the limit, not a moment over it.
        const seconds = Math.min(max, Math.round((performance.now() - started) / 1000));
        const blob = new Blob(chunks, { type: (recorder.mimeType || type || 'audio/webm').split(';')[0] });
        recorder = null;
        release();
        if (dead) return;
        if (!blob.size || seconds < 1) { st.mode = 'idle'; note('Nothing was recorded. Try again.', true); draw(); return; }
        save(blob, blob.type, 'recording', 'recorded', seconds);
      };
      recorder.start();
      st.mode = 'recording'; st.revealed = true; note('');
      draw();
      ticker = setInterval(() => {
        const elapsed = (performance.now() - started) / 1000;
        const el = panel.querySelector('[data-time]');
        if (el) el.textContent = `${N.clock(elapsed)} / ${N.clock(max)}`;
        if (elapsed >= max) stop();
      }, 250);
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        context = new Ctx();
        if (context.state === 'suspended' && context.resume) context.resume().catch(() => {});
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        context.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const loop = () => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (let i = 0; i < data.length; i += 1) peak = Math.max(peak, Math.abs(data[i] - 128));
          const bar = panel.querySelector('.zp-level i');
          if (bar) bar.style.width = Math.min(100, Math.round(peak / 128 * 160)) + '%';
          meter = requestAnimationFrame(loop);
        };
        loop();
      } catch (error) { /* the level meter is optional */ }
    }

    function stop() {
      clearInterval(ticker); ticker = null;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    }

    // One take, one ID, for as long as it takes to save it. "Save this answer again" repeats the same take
    // with the same takeId, so the course reuses the file it already made instead of keeping a second copy
    // of the same answer; recording again, or choosing another audio file, is a new take with a new ID.
    async function save(blob, type, name, kind, seconds, takeId) {
      const take = takeId || N.newId('take');
      if (blob.size > MAX_BYTES) {
        st.mode = 'idle';
        note(`This audio is ${N.size(blob.size)}; the limit is 12 MB. Record a shorter answer, or save the file as m4a or mp3.`, true);
        draw();
        return;
      }
      st.mode = 'uploading'; note('');
      draw();
      try {
        const result = await o.upload({ blob, type, name, kind, seconds, takeId: take });
        if (st.url) URL.revokeObjectURL(st.url);
        if (st.pending && st.pending.url) URL.revokeObjectURL(st.pending.url);
        st.pending = null;
        st.url = URL.createObjectURL(blob);
        st.value = { file: result.fileId }; st.meta = result.meta || null;
        st.mode = 'idle'; note('');
        // The take is attached to the answers and written to this device first; only then is its upload ID let go.
        o.onChange(st.value, st.meta, result.release);
      } catch (error) {
        if (st.pending && st.pending.url) URL.revokeObjectURL(st.pending.url);
        // The take and its ID are both kept, so the retry below is the same upload, not another one.
        st.pending = { blob, type, name, kind, seconds, takeId: take, url: URL.createObjectURL(blob) };
        st.mode = 'idle';
        note(((error && error.message) || 'The answer could not be saved.') + ' Your audio is still here: press “Save this answer again”.', true);
      }
      draw();
    }

    async function pickFile(file) {
      const extension = (file.name.split('.').pop() || '').toLowerCase();
      let type = String(file.type || '').toLowerCase().split(';')[0];
      if (KNOWN.indexOf(type) < 0) type = EXT_TYPES[extension] || type;
      if (KNOWN.indexOf(type) < 0) { note('Choose an audio file: m4a, mp3, wav, aac, ogg or webm.', true); draw(); return; }
      clearPrep();
      st.revealed = true;
      await save(file, type, file.name, 'uploaded', await duration(file));
    }

    async function play() {
      note('Loading your answer…');
      draw();
      try {
        const blob = await o.playback(st.value.file);
        st.url = URL.createObjectURL(blob);
        note('');
      } catch (error) { note((error && error.message) || 'The audio could not be loaded.', true); }
      draw();
    }

    panel.addEventListener('click', (event) => {
      const button = event.target.closest('[data-act]');
      if (!button) return;
      const act = button.dataset.act;
      if (act === 'stop') stop();
      else if (act === 'cancel') { clearPrep(); asked += 1; st.mode = 'idle'; note(''); draw(); }
      else if (act === 'play') play();
      // Nothing new is started while the page takes no changes (submitting, closed, handed in).
      else if (locked()) return;
      else if (act === 'prep') startPrep();
      else if (act === 'record') startRecording();
      else if (act === 'retry' && st.pending) save(st.pending.blob, st.pending.type, st.pending.name, st.pending.kind, st.pending.seconds, st.pending.takeId);
    });
    panel.addEventListener('change', (event) => {
      const input = event.target.closest('[data-file]');
      if (!input || !input.files || !input.files[0]) return;
      const file = input.files[0];
      input.value = '';
      if (!locked()) pickFile(file);
    });

    // The page is drawn again (closed, reloaded after submitting): let the microphone and timers go. A take still
    // being recorded is dropped, not saved: the page that would hold it is gone.
    function destroy() {
      dead = true; asked += 1;
      clearPrep();
      if (recorder) { recorder.onstop = null; try { if (recorder.state !== 'inactive') recorder.stop(); } catch (error) { /* already stopped */ } recorder = null; }
      release();
    }

    const api = {
      stop, destroy,
      isBusy: () => st.mode === 'recording' || st.mode === 'uploading' || st.mode === 'asking',
      hasUnsaved: () => Boolean(st.pending)
    };
    draw();
    return api;
  }

  return { mount, canRecord };
})();
