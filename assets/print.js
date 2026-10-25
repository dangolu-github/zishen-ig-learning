// Print only content already present in the authorised learner page.
// Answer values are copied to temporary text nodes; the editable controls and fold choices are restored.
(() => {
  let state = null;
  let printing = false;
  // Only WebKit (Safari, every iPad/iPhone browser) knows Apple's system font keywords.
  const webkit = Boolean(window.CSS && CSS.supports && CSS.supports('font', '-apple-system-body'));
  const root = () => document.getElementById('app') || document.querySelector('main') || document.body;

  function prepare(options = {}) {
    if (state) return;
    const app = root();
    state = { details: [], controls: [], added: [], classes: [], labels: [], lineFits: [], blank: Boolean(options.blank) };
    document.body.classList.add('zp-printing');
    document.body.classList.toggle('zp-print-blank', state.blank);
    app.querySelectorAll('details').forEach((node) => {
      state.details.push([node, node.open]);
      node.open = true;
    });

    // Reading passages keep the paper's printed lines (one <li> per line). Record each passage's
    // widest line in em; print.css then shrinks that passage so every paper line prints on one line.
    // System fonts change letter spacing with size, so measure near the printed size: first at 12px,
    // then at the size that width gives on A4 (about 685px of text beside the line numbers).
    app.querySelectorAll('ol.zp-lines').forEach((list) => {
      const lines = Array.from(list.children).filter((node) => node.tagName === 'LI');
      if (!lines.length) return;
      list.classList.add('zp-measure-lines');
      const widestAt = (px) => {
        list.style.setProperty('--zp-measure-size', px + 'px');
        return Math.max(...lines.map((line) => {
          const range = document.createRange();
          range.selectNodeContents(line);
          return range.getBoundingClientRect().width / px;
        }));
      };
      let widest = widestAt(12);
      if (widest > 0) widest = Math.max(widest, widestAt(Math.min(13.6, 685 / widest)));
      list.classList.remove('zp-measure-lines');
      list.style.removeProperty('--zp-measure-size');
      // Above 72em even the 7pt floor would overflow A4; such a passage keeps wrapping.
      if (widest > 0 && widest <= 72) {
        list.style.setProperty('--zp-line-em', widest.toFixed(2));
        list.classList.add('zp-fit-lines');
        state.lineFits.push(list);
      }
    });

    app.querySelectorAll('textarea[data-input], input[type="text"][data-input], .zp-q input[type="radio"], .zp-q input[type="checkbox"]').forEach((control) => {
      // Checked paper work already has its faithful original (with error spans) in the feedback.
      // Do not print a second copy from the hidden form value. A clean question sheet still needs space.
      if (!state.blank && control.hasAttribute('data-paper-original')) {
        control.classList.add('zp-print-control');
        state.controls.push(control);
        return;
      }
      const mark = control.type === 'radio' || control.type === 'checkbox';
      const node = document.createElement(control.tagName === 'TEXTAREA' ? 'div' : 'span');
      node.className = 'zp-print-value' + (mark ? ' zp-print-mark' : control.tagName === 'TEXTAREA' ? ' zp-print-answer' : ' zp-print-inline');
      if (mark) {
        node.textContent = !state.blank && control.checked ? '●' : '○';
        node.setAttribute('aria-hidden', 'true');
      } else {
        node.textContent = state.blank ? '' : control.value;
        if (!node.textContent.trim()) {
          node.classList.add('zp-print-empty');
          // Supply bounded working room, not a full mostly blank essay page.
          if (control.tagName === 'TEXTAREA') node.classList.add(Number(control.rows) > 3 ? 'zp-print-long-space' : 'zp-print-short-space');
          else node.textContent = '\u00a0';
        }
      }
      control.classList.add('zp-print-control');
      control.insertAdjacentElement('afterend', node);
      state.controls.push(control);
      state.added.push(node);
    });

    // A mistake-log entry still to review gets a blank line to try it again on paper.
    app.querySelectorAll('.zp-retry').forEach((retry) => {
      const line = document.createElement('p');
      line.className = 'zp-print-value zp-print-retry';
      line.textContent = 'Try again:';
      retry.insertAdjacentElement('afterend', line);
      state.added.push(line);
    });

    // The live counter is UI; its authored word-range guidance belongs on paper.
    app.querySelectorAll('.zp-count[data-min][data-max]').forEach((counter) => {
      const min = Number(counter.dataset.min), max = Number(counter.dataset.max);
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= 0) return;
      const guide = document.createElement('p');
      guide.className = 'zp-print-value zp-print-guide';
      guide.textContent = `Suggested length: ${min}–${max} words`;
      counter.insertAdjacentElement('afterend', guide);
      state.added.push(guide);
    });

    // Measure the text that will actually print: full answer surrogates and released
    // feedback count; hidden controls and blank-print corrections do not.
    if (state.blank && app.classList.contains('zp-extra-task')) {
      app.querySelectorAll('.zp-prompt-line').forEach(prompt => {
        prompt.childNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE && /^\s*Answer:\s*$/.test(node.textContent)) {
            state.labels.push([node, node.textContent]); node.textContent = '';
          }
        });
      });
    }
    const questions = Array.from(app.querySelectorAll('.zp-q'));
    const shortQuestions = new Set();
    questions.forEach((question) => {
      const copy = question.cloneNode(true);
      copy.querySelectorAll('[hidden], [data-no-print], .no-print, .zp-print-control, .zp-count, .zp-msg').forEach(node => node.remove());
      if (state.blank) copy.querySelectorAll('.zp-verdict, [data-print-feedback], .zp-paper-review, .zp-review').forEach(node => node.remove());
      const text = copy.textContent;
      const longAnswer = Array.from(question.querySelectorAll('textarea')).some(node => Number(node.rows) > 3);
      if (question.querySelector('textarea') && !longAnswer) {
        question.classList.add('zp-print-short-answer');
        state.classes.push([question, 'zp-print-short-answer']);
      }
      if (text.length < 1000 && text.split('\n').length < 18 && !copy.querySelector('table, img') && !longAnswer) {
        question.classList.add('zp-print-short');
        state.classes.push([question, 'zp-print-short']);
        if (text.length < 700) shortQuestions.add(question);
      }
    });
    const blocks = app.querySelector('[data-blocks]');
    const blockQuestions = blocks ? Array.from(blocks.querySelectorAll('.zp-q')) : [];
    // A passage with the paper's own lines needs the full page width, so it never goes into columns.
    // Safari and every iPad/iPhone browser (WebKit) print the column block as one column and then cut a
    // line across the page break, so there each question prints whole in one column (2026-10-25).
    if (!webkit && blocks && !blocks.querySelector('.zp-doc, .zp-pages, ol.zp-lines, table, img') &&
        blockQuestions.length >= 6 && blockQuestions.every(question => shortQuestions.has(question))) {
      blocks.classList.add('zp-print-columns');
      state.classes.push([blocks, 'zp-print-columns']);
    }
    document.dispatchEvent(new CustomEvent('zs:print-prepared', { detail: { blank: state.blank } }));
  }

  function restore() {
    if (!state) return;
    const previous = state;
    state = null;
    previous.labels.forEach(([node, text]) => { node.textContent = text; });
    previous.added.forEach((node) => node.remove());
    previous.controls.forEach((node) => node.classList.remove('zp-print-control'));
    previous.classes.forEach(([node, name]) => node.classList.remove(name));
    previous.lineFits.forEach((list) => { list.classList.remove('zp-fit-lines'); list.style.removeProperty('--zp-line-em'); });
    previous.details.forEach(([node, open]) => { node.open = open; });
    document.body.classList.remove('zp-printing', 'zp-print-blank');
    document.dispatchEvent(new CustomEvent('zs:print-restored'));
  }

  async function readyImages() {
    const images = Array.from(root().querySelectorAll('img')).filter((image) =>
      !image.closest('[hidden], [data-no-print]') &&
      !(state && state.blank && image.closest('.zp-verdict, .zp-result, .zp-banner, [data-print-feedback], .zp-paper-review, .zp-review')));
    await Promise.all(images.map(async (image) => {
      if (image.decode) {
        try { await image.decode(); } catch (error) { throw new Error('A picture could not be loaded. Please reload it before printing.'); }
      } else if (!image.complete) {
        await new Promise((resolve, reject) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', () => reject(new Error('A picture could not be loaded.')), { once: true });
        });
      }
      if (!image.naturalWidth) throw new Error('A picture could not be loaded. Please reload it before printing.');
    }));
  }

  async function print(options = {}) {
    if (printing) return;
    printing = true;
    try {
      prepare(options);
      // The task renderer supplies its private figure-loading promise here.
      if (typeof options.prepare === 'function') await options.prepare();
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      await readyImages();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.print();
    } catch (error) {
      restore();
      throw error;
    } finally {
      printing = false;
      // Standard print dialogs fire afterprint on close. A focus fallback covers browsers that omit it.
    }
  }

  window.addEventListener('beforeprint', () => prepare());
  window.addEventListener('afterprint', restore);
  window.addEventListener('focus', () => {
    if (state && !printing && !window.matchMedia('print').matches) restore();
  });
  window.ZsPrint = { print, prepare, restore, get active() { return Boolean(state); } };
})();
