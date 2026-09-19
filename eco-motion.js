/* EcoBite — shared motion behaviours: reveals, count-up, typing, page fades. */
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* stagger groups: children inherit --d */
  $$('[data-stagger]').forEach(group => {
    [...group.children].forEach((child, i) => child.style.setProperty('--d', `${i * 75}ms`));
  });

  /* scroll reveals */
  function reveal(root) {
    const els = $$('[data-reveal],.eco-reveal', root || document).filter(el => !el.classList.contains('is-in'));
    if (reduced || !('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('is-in')); return; }
    const io = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    }), { threshold: .12, rootMargin: '0px 0px -8% 0px' });
    els.forEach(el => io.observe(el));
  }

  /* count-up stats */
  function countUp(el) {
    if (el.dataset.counted) return;
    el.dataset.counted = '1';
    const raw = el.dataset.count, target = parseFloat(raw);
    const dec = (raw.split('.')[1] || '').length;
    const suffix = el.dataset.suffix || '';
    const fmt = v => (target < 2 && dec ? v.toFixed(dec).replace(/0+$/, '').replace(/\.$/, '') : Math.round(v).toString()) + suffix;
    if (reduced) { el.textContent = fmt(target); return; }
    const t0 = performance.now(), dur = 950;
    const tick = t => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(target * e);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  const counters = $$('[data-count]');
  if (reduced || !('IntersectionObserver' in window)) counters.forEach(countUp);
  else {
    const cio = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { countUp(en.target); cio.unobserve(en.target); } }), { threshold: .35 });
    counters.forEach(el => cio.observe(el));
  }

  /* typewriter for [data-type] elements */
  function type(el, text, speed = 26) {
    if (reduced) { el.textContent = text; return Promise.resolve(); }
    el.textContent = '';
    return new Promise(resolve => {
      let i = 0;
      const step = () => {
        if (i < text.length) { el.textContent += text[i++]; setTimeout(step, speed + Math.random() * 20); }
        else resolve();
      };
      step();
    });
  }
  function armTyping(root) {
    $$('[data-type]:not([data-typed])', root || document).forEach(el => {
      el.dataset.typed = '1';
      const text = el.textContent.trim();
      const cursor = document.createElement('span');
      cursor.className = 'typing-cursor';
      cursor.setAttribute('aria-hidden', 'true');
      el.after(cursor);
      type(el, text);
    });
  }

  /* cross-fade page transitions between internal pages */
  if (!reduced) {
    document.addEventListener('click', event => {
      const a = event.target.closest('a[href]');
      if (!a || a.target === '_blank' || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      if (/^https?:/i.test(href) && !href.startsWith(location.origin)) return;
      if (!href.includes('.html') && !href.includes('?view=')) return;
      event.preventDefault();
      document.body.classList.add('eco-page-out');
      setTimeout(() => { location.href = href; }, 220);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { reveal(); armTyping(); });
  else { reveal(); armTyping(); }

  window.EcoMotion = { reduced, reveal, type, armTyping, countUp };
})();
