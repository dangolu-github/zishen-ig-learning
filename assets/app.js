// Shared helpers for the learner pages: header, formatting, task cards, toggles and private media.
// Each page sets <body data-root="../" data-page="practice"> and has <main id="app">.
window.Zs = (() => {
  const A = window.ZsAccess;
  const root = document.body.dataset.root || './';
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const newId = (prefix) => A.randomId(prefix);
  const when = (value) => {
    const d = new Date(value);
    return isNaN(d) ? '' : d.toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
  const longDate = (ymd) => {
    const d = new Date(String(ymd) + 'T12:00:00');
    return isNaN(d) ? String(ymd || '') : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  };
  const clock = (seconds) => {
    const s = Math.max(0, Math.round(seconds));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s % 60).padStart(2, '0');
  };
  const size = (bytes) => bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + ' KB' : (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  // Words as a word processor counts them: "6:40", "p.m." and "dog-friendly" are one word each.
  const words = (text) => String(text || '').split(/\s+/).filter((w) => /[A-Za-z0-9À-ɏ]/.test(w)).length;

  const pages = [['home', '', 'Home'], ['practice', 'extra-practice/', 'Extra Practice'], ['mistakes', 'mistake-log/', 'Mistake Log'], ['vocabulary', 'vocabulary/', 'Vocabulary']];
  function header() {
    const active = document.body.dataset.page || '';
    const top = document.createElement('header');
    top.className = 'zp-top';
    top.innerHTML = `<div class="zp-top-inner"><a class="zp-brand" href="${root}">Zishen <span>· IG English</span></a><nav class="zp-nav" aria-label="Sections">${
      pages.map((p) => `<a href="${root}${p[1]}"${p[0] === active ? ' aria-current="page"' : ''}>${p[2]}</a>`).join('')}</nav></div>`;
    document.body.prepend(top);
  }

  // Shown only in the teacher's preview browser.
  function previewNote(env) {
    if (env !== 'test' || document.querySelector('.zp-preview')) return;
    const note = document.createElement('p');
    note.className = 'zp-preview';
    note.textContent = 'Teacher preview · anything saved from this browser is a test record.';
    document.querySelector('.zp-top').after(note);
  }

  const taskHref = (id) => `${root}extra-practice/task/?id=${encodeURIComponent(id)}`;
  const stateText = {
    locked: ['Not open yet', ''], new: ['Not started', ''], draft: ['In progress', 'warn'], submitted: ['Submitted', 'good'], checked: ['Checked', 'good']
  };
  function taskCard(card) {
    const state = stateText[card.state] || stateText.new;
    const facts = [card.source || card.paperLabel];
    if (card.count) facts.push(card.count + (card.count === 1 ? ' answer' : ' answers'));
    if (card.minutes) facts.push(card.minutes + ' min');
    let detail = '';
    if (card.state === 'draft') detail = `${card.answered || 0} / ${card.count} answered`;
    if (card.state === 'submitted') detail = when(card.submittedAt);
    if (card.state === 'checked') detail = card.outOf !== undefined && card.outOf !== '' ? `${card.score} / ${card.outOf}` : when(card.submittedAt);
    const action = card.state === 'locked' ? '' : card.state === 'new' ? 'Start' : card.state === 'draft' ? 'Continue' : card.state === 'checked' ? 'See feedback' : 'View';
    const closed = card.receiving === false && (card.state === 'new' || card.state === 'draft') ? '<span class="zp-pill">Closed</span>' : '';
    const hidden = card.released === false && card.state !== 'locked' ? '<span class="zp-pill warn">Not released</span>' : '';
    const body = `<div class="zp-card-kind">${esc(facts.filter(Boolean).join(' · '))}</div><h3>${esc(card.label)}</h3>
      <p class="zp-meta"><span class="zp-pill ${state[1]}">${state[0]}</span>${closed}${hidden}${detail ? ' <span>' + esc(detail) + '</span>' : ''}</p>`;
    return card.state === 'locked'
      ? `<article class="zp-card is-locked">${body}</article>`
      : `<a class="zp-card zp-card-link" href="${taskHref(card.id)}">${body}<span class="zp-go">${action} →</span></a>`;
  }

  // ---------- toggles ----------
  // Every section is a <details data-fold="key">, closed unless the learner opened it before in this browser.
  // The choice is a UI preference only. Open all / Close all sit above long pages; printing opens everything.
  const readFolds = (page) => { try { return JSON.parse(localStorage.getItem('zs-ig-folds:' + page) || '{}'); } catch (error) { return {}; } };
  const writeFolds = (page, value) => { try { localStorage.setItem('zs-ig-folds:' + page, JSON.stringify(value)); } catch (error) { /* not remembered */ } };
  function folds(container, page) {
    const saved = readFolds(page);
    container.querySelectorAll('details[data-fold]').forEach((fold) => {
      if (Object.prototype.hasOwnProperty.call(saved, fold.dataset.fold)) fold.open = saved[fold.dataset.fold] === true;
    });
    if (container.dataset.foldsBound === page) return;
    container.dataset.foldsBound = page;
    container.addEventListener('toggle', (event) => {
      const fold = event.target;
      if (!fold.matches || !fold.matches('details[data-fold]') || document.body.classList.contains('zp-printing')) return;
      const current = readFolds(page);
      current[fold.dataset.fold] = fold.open;
      writeFolds(page, current);
    }, true);
    container.addEventListener('click', (event) => {
      const all = event.target.closest('[data-folds]');
      if (!all) return;
      const open = all.dataset.folds === 'open';
      const current = readFolds(page);
      container.querySelectorAll('details[data-fold]').forEach((fold) => { fold.open = open; current[fold.dataset.fold] = open; });
      writeFolds(page, current);
    });
  }
  const foldBar = () => '<div class="zp-foldbar" data-no-print><button class="zp-linkbtn" type="button" data-folds="open">Open all</button><button class="zp-linkbtn" type="button" data-folds="close">Close all</button></div>';
  // A link to #id opens the toggles around its target.
  function openTarget() {
    const id = decodeURIComponent(location.hash.replace(/^#/, ''));
    const target = id && document.getElementById(id);
    if (!target) return;
    for (let node = target; node; node = node.parentElement) if (node.tagName === 'DETAILS') node.open = true;
    target.scrollIntoView({ block: 'start' });
  }
  window.addEventListener('hashchange', openTarget);

  const b64ToBytes = (b64) => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  };
  const mediaCache = new Map();
  // Private audio and pictures arrive in parts after the access check and are joined here.
  function loadMedia(mediaId, onProgress) {
    if (mediaCache.has(mediaId)) return mediaCache.get(mediaId);
    // Google occasionally answers one part with something that is not the part; fetch and decode each part up to
    // three times before giving up, so a single bad answer does not fail the whole recording (2026-10-24).
    const fetchPart = async (part) => {
      for (let attempt = 1; ; attempt += 1) {
        try { const r = await A.request('getMedia', { mediaId, part }, 90000); return { r, bytes: b64ToBytes(r.data) }; }
        catch (error) { if (attempt >= 3) throw error; await sleep(1500 * attempt); }
      }
    };
    const job = (async () => {
      const first = await fetchPart(0);
      const parts = [first.bytes];
      if (onProgress) onProgress(1 / first.r.parts);
      for (let i = 1; i < first.r.parts; i += 1) {
        parts.push((await fetchPart(i)).bytes);
        if (onProgress) onProgress((i + 1) / first.r.parts);
      }
      return new Blob(parts, { type: first.r.mime });
    })();
    mediaCache.set(mediaId, job);
    job.catch(() => mediaCache.delete(mediaId));
    return job;
  }

  const toBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  // Where and on which device work is handed in (assets/submission-origin.js), sent with each submission,
  // upload and retry for the teacher only. Nothing of it is shown on these pages; a slow or failed lookup
  // never stops the hand-in.
  const origin = () => (window.PortalSubmissionOrigin ? window.PortalSubmissionOrigin.collect().catch(() => null) : Promise.resolve(null));
  const warmOrigin = () => { if (window.PortalSubmissionOrigin) window.PortalSubmissionOrigin.warm(); };

  function fail(container, error) {
    container.innerHTML = `<p class="zp-empty" role="alert">${esc((error && error.message) || 'This page could not be loaded. Please try again.')}</p>`;
  }

  header();
  return { A, root, esc, sleep, newId, when, longDate, clock, size, words, taskHref, taskCard, folds, foldBar, openTarget, loadMedia, toBase64, fail, previewNote, origin, warmOrigin };
})();
