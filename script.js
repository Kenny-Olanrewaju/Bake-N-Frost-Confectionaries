/* ==========================================================================
   BAKE N FROST — script.js (vanilla JavaScript, no dependencies)
   Sections: 1 router · 2 navigation · 3 header & back-to-top · 4 hero slideshow + status
             5 testimonials · 6 menu filter & order prefill · 7 lightbox
             8 FAQ accordion · 9 contact form · 10 init

   Performance notes
   - No scroll listeners: header style and back-to-top use IntersectionObserver.
   - Slideshows only run while they are on screen (and the tab is visible).
   - No scroll-triggered animations or parallax.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- Helpers ---------- */
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasIO = 'IntersectionObserver' in window;

  /* Set to your Formspree / Getform / backend URL to receive real submissions.
     Example: 'https://formspree.io/f/yourFormId'. Empty = demo mode. */
  const FORM_ENDPOINT = ''; // PLACEHOLDER

  /* ==========================================================================
     1. ROUTER — hash-based, e.g. #/menu or #/menu/custom (jumps to #custom)
     ========================================================================== */
  const ROUTES = ['home', 'about', 'menu', 'catering', 'wholesale', 'academy', 'contact'];
  const pages = {};
  ROUTES.forEach(r => { pages[r] = $('#page-' + r); });
  const announcer = $('#route-announcer');
  let currentRoute = null;

  /* Shortcuts used in links like #/menu/cakes */
  const SECTION_ALIAS = { cakes: 'menuGrid', bread: 'menuGrid', custom: 'custom', enquiry: 'enquiry' };

  function parseHash() {
    const parts = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
    const route = ROUTES.includes(parts[0]) ? parts[0] : 'home';
    return { route, section: parts[1] || '' };
  }

  function navigate() {
    const { route, section } = parseHash();
    const changed = route !== currentRoute;

    if (changed) {
      if (currentRoute) pages[currentRoute].classList.remove('active');
      pages[route].classList.add('active');
      currentRoute = route;
      document.title = pages[route].dataset.title;
      announcer.textContent = 'Navigated to ' + pages[route].dataset.title.split('|')[0].trim();
      $$('[data-route]').forEach(a => {
        const on = a.dataset.route === route;
        a.classList.toggle('active', on);
        on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
      });
      moveIndicator();
      closeMenu();
      if (section === 'cakes' || section === 'bread') applyMenuFilter(section);
    }

    const targetId = SECTION_ALIAS[section] || section;
    const target = targetId && document.getElementById(targetId);
    if (target) {
      // New page: jump straight to the section. Same page: glide there.
      target.scrollIntoView({ behavior: changed || reduceMotion ? 'instant' : 'smooth', block: 'start' });
    } else if (changed) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      const h1 = $('h1', pages[route]);
      if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
    }
  }
  window.addEventListener('hashchange', navigate);

  /* ==========================================================================
     2. NAVIGATION — sliding indicator + mobile menu
     ========================================================================== */
  const header = $('#siteHeader');
  const toggle = $('#navToggle');
  const mobileMenu = $('#mobileMenu');
  const indicator = $('#navIndicator');
  const navLinks = $('#navLinks');

  /* `instant` re-syncs the pill without animating (used when the nav itself resizes,
     so the pill never trails behind the links). */
  function moveIndicator(el, instant) {
    const target = el || $('.nav-links a.active');
    if (!target) { indicator.style.opacity = 0; return; }
    if (instant) indicator.style.transition = 'none';
    indicator.style.opacity = 1;
    indicator.style.width = target.offsetWidth + 'px';
    indicator.style.transform = 'translateX(' + target.offsetLeft + 'px)';
    if (instant) { void indicator.offsetWidth; indicator.style.transition = ''; }
  }
  if ('ResizeObserver' in window) new ResizeObserver(() => moveIndicator(undefined, true)).observe(navLinks);
  $$('.nav-links a').forEach(a => {
    a.addEventListener('mouseenter', () => moveIndicator(a));
    a.addEventListener('focus', () => moveIndicator(a));
  });
  navLinks.addEventListener('mouseleave', () => moveIndicator());
  navLinks.addEventListener('focusout', () => moveIndicator());
  window.addEventListener('resize', () => { moveIndicator(); if (window.innerWidth > 1024) closeMenu(); });

  function openMenu() {
    mobileMenu.classList.add('open'); mobileMenu.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true'); toggle.setAttribute('aria-label', 'Close menu');
    document.body.classList.add('no-scroll');
  }
  function closeMenu() {
    mobileMenu.classList.remove('open'); mobileMenu.setAttribute('aria-hidden', 'true');
    toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Open menu');
    document.body.classList.remove('no-scroll');
  }
  toggle.addEventListener('click', () => (mobileMenu.classList.contains('open') ? closeMenu() : openMenu()));
  const mobileClose = $('#mobileClose');
  if (mobileClose) mobileClose.addEventListener('click', closeMenu);
  $$('a', mobileMenu).forEach(a => a.addEventListener('click', closeMenu));
  mobileMenu.addEventListener('click', e => { if (e.target === mobileMenu) closeMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

  /* ==========================================================================
     3. HEADER SCROLL STATE + BACK-TO-TOP (IntersectionObserver, no scroll events)
      Scrolling past the top marker adds .scrolled; CSS animates the nav pill.
     ========================================================================== */
  const toTop = $('#toTop');
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduceMotion ? 'instant' : 'smooth' }));
  if (hasIO) {
    new IntersectionObserver(([e]) => header.classList.toggle('scrolled', !e.isIntersecting))
      .observe($('#sentinelTop'));
    new IntersectionObserver(([e]) => toTop.classList.toggle('show', !e.isIntersecting && e.boundingClientRect.top < 0))
      .observe($('#sentinelFab'));
  }

  /* ==========================================================================
     4. HERO — full-bleed background image slideshow
     ========================================================================== */
  (function heroBgSlideshow() {
    const slides = $$('.hero-bg-slide');
    if (!slides.length) return;
    const hero = $('#hero') || $('.hero-cream');
    const prevBtn = $('#stagePrev');
    const nextBtn = $('#stageNext');
    const dotsWrap = $('#stageDots');
    const n = slides.length;
    const INTERVAL = 5500;                       // ms each photo stays on screen
    /* The CSS zoom-out lasts as long as the slide is visible (plus its fade-out) */
    if (hero) hero.style.setProperty('--hero-zoom', (INTERVAL + 1300) + 'ms');
    let active = 0;
    let timer = null;
    let inView = !hasIO;

    if (dotsWrap) {
      dotsWrap.innerHTML = '';
      slides.forEach((_, k) => {
        const d = document.createElement('button');
        d.className = 'dot';
        d.type = 'button';
        d.setAttribute('aria-label', 'Show background ' + (k + 1));
        d.addEventListener('click', () => { show(k); start(); });
        dotsWrap.appendChild(d);
      });
    }

    function show(i) {
      active = (i + n) % n;
      slides.forEach((s, idx) => s.classList.toggle('is-active', idx === active));
      if (dotsWrap) {
        $$('.dot', dotsWrap).forEach((d, idx) =>
          d.setAttribute('aria-current', idx === active ? 'true' : 'false')
        );
      }
    }
    function stop() { clearInterval(timer); timer = null; }
    function start() {
      stop();
      if (reduceMotion || document.hidden || !inView) return;
      timer = setInterval(() => show(active + 1), INTERVAL);
    }

    if (prevBtn) prevBtn.addEventListener('click', () => { show(active - 1); start(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { show(active + 1); start(); });

    /* Touch swipe on hero */
    let x0 = null;
    if (hero) {
      hero.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
      hero.addEventListener('touchend', e => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 50) { show(active + (dx < 0 ? 1 : -1)); start(); }
        x0 = null;
      });
    }

    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    if (hasIO && hero) {
      new IntersectionObserver(([e]) => {
        inView = e.isIntersecting;
        inView ? start() : stop();
      }).observe(hero);
    }
    show(0);
    start();
  })();

  /* ==========================================================================
     4a. OPENING HOURS (shared) — used by the hero status pill and the Home "Visit us" strip.
         Keep in sync with the hours printed on the Contact page.
     ========================================================================== */
  const HOURS = [[10, 16], [7, 19], [7, 19], [7, 19], [7, 19], [7, 19], [7, 19]];   // Sun … Sat: [open, close] (24h)
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const TZ = 'Africa/Lagos';
  const label = h => ((h % 12) || 12) + ':00 ' + (h < 12 ? 'AM' : 'PM');

  /* "Today" line in the Home visit strip */
  (function todayHours() {
    const el = $('#todayHours');
    if (!el) return;
    const day = DAYS.indexOf(new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(new Date()));
    el.textContent = label(HOURS[day][0]) + ' – ' + label(HOURS[day][1]);
  })();

  /* ==========================================================================
     4b. HERO STATUS PILL — greeting, open/closed and live Lagos time
         Opening hours match the Contact page (edit HOURS below if they change).
     ========================================================================== */
  (function heroStatus() {
    const box = $('#heroStatus');
    if (!box) return;
    const greetEl = $('#heroGreeting'), stateEl = $('#heroState'), timeEl = $('#heroTime');
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false });
    const clock = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });

    function update() {
      const now = new Date(), p = {};
      parts.formatToParts(now).forEach(x => { p[x.type] = x.value; });
      const day = DAYS.indexOf(p.weekday), hour = (+p.hour) % 24, mins = hour * 60 + (+p.minute);
      const [open, close] = HOURS[day];
      const isOpen = mins >= open * 60 && mins < close * 60;

      greetEl.textContent = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      if (isOpen) {
        stateEl.innerHTML = 'Open<span class="hero-status-more"> for orders</span>';
      } else {
        const next = mins < open * 60 ? open : HOURS[(day + 1) % 7][0];     // today's opening, or tomorrow's
        stateEl.textContent = 'Opens ' + label(next);
      }
      box.classList.toggle('is-closed', !isOpen);
      timeEl.textContent = 'Lagos · ' + clock.format(now) + ' WAT';
    }
    update();
    setInterval(update, 30000);
  })();


  
  /* ==========================================================================
     5. TESTIMONIAL CAROUSEL (auto-advances only while visible)
     ========================================================================== */
  (function testimonials() {
    const track = $('#tTrack');
    if (!track) return;
    const slides = Array.from(track.children), dotsWrap = $('#tDots'), box = $('#testimonials');
    let i = 0, timer = null, inView = !hasIO;

    slides.forEach((_, k) => {
      const d = document.createElement('button');
      d.className = 'dot'; d.type = 'button'; d.setAttribute('aria-label', 'Show testimonial ' + (k + 1));
      d.addEventListener('click', () => { show(k); restart(); });
      dotsWrap.appendChild(d);
    });
    function show(k) {
      i = (k + slides.length) % slides.length;
      track.style.transform = 'translateX(' + (-100 * i) + '%)';
      slides.forEach((s, idx) => s.setAttribute('aria-hidden', idx === i ? 'false' : 'true'));
      $$('.dot', dotsWrap).forEach((d, idx) => d.setAttribute('aria-current', idx === i ? 'true' : 'false'));
    }
    function pause() { clearInterval(timer); timer = null; }
    function restart() {
      pause();
      if (!reduceMotion && inView && !document.hidden) timer = setInterval(() => show(i + 1), 6500);
    }
    $('#tPrev').addEventListener('click', () => { show(i - 1); restart(); });
    $('#tNext').addEventListener('click', () => { show(i + 1); restart(); });
    box.addEventListener('mouseenter', pause);
    box.addEventListener('mouseleave', restart);
    box.addEventListener('focusin', pause);
    box.addEventListener('keydown', e => { if (e.key === 'ArrowRight') show(i + 1); if (e.key === 'ArrowLeft') show(i - 1); });
    document.addEventListener('visibilitychange', () => (document.hidden ? pause() : restart()));
    if (hasIO) new IntersectionObserver(([e]) => { inView = e.isIntersecting; inView ? restart() : pause(); }).observe(box);
    show(0); restart();
  })();

  /* ==========================================================================
     6. MENU FILTER + "ORDER" PREFILL
     ========================================================================== */
  const filterBtns = $$('.filter-btn');
  function applyMenuFilter(cat) {
    if (!cat) return;
    filterBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === cat)));
    $$('.menu-item').forEach(it => { it.hidden = !(cat === 'all' || it.dataset.cat === cat); });
  }
  filterBtns.forEach(b => b.addEventListener('click', () => applyMenuFilter(b.dataset.filter)));

  /* "Order" buttons jump to the contact form with the item pre-filled */
  const topicSel = $('#cf-topic'), msgBox = $('#cf-message');
  document.addEventListener('click', e => {
    const orderBtn = e.target.closest('[data-order]');
    if (orderBtn) {
      const item = orderBtn.dataset.order;
      topicSel.value = /cake/i.test(item) ? 'Custom cake order' : 'Bread & pastry order';
      msgBox.value = "Hello! I'd like to order: " + item + '.\nQuantity / size: \nDate needed: ';
      location.hash = '#/contact/enquiry';
    }
    const topicLink = e.target.closest('[data-topic]');
    if (topicLink) topicSel.value = topicLink.dataset.topic;
  });

  /* ==========================================================================
     7. LIGHTBOX GALLERY (focus-managed, keyboard accessible)
     ========================================================================== */
  (function lightbox() {
    const items = $$('#gallery .g-item'), box = $('#lightbox'), img = $('#lbImg'), cap = $('#lbCap');
    if (!items.length) return;
    let idx = 0, opener = null;

    function render() {
      const it = items[idx];
      img.src = it.dataset.full; img.alt = it.dataset.caption;
      cap.textContent = it.dataset.caption + '  (' + (idx + 1) + ' / ' + items.length + ')';
    }
    function open(i) {
      idx = i; opener = document.activeElement; render();
      box.classList.add('open'); box.setAttribute('aria-hidden', 'false'); document.body.classList.add('no-scroll');
      $('#lbClose').focus();
    }
    function close() {
      box.classList.remove('open'); box.setAttribute('aria-hidden', 'true'); document.body.classList.remove('no-scroll');
      if (opener) opener.focus();
    }
    function step(d) { idx = (idx + d + items.length) % items.length; render(); }

    items.forEach((it, i) => it.addEventListener('click', () => open(i)));
    $('#lbClose').addEventListener('click', close);
    $('#lbPrev').addEventListener('click', () => step(-1));
    $('#lbNext').addEventListener('click', () => step(1));
    box.addEventListener('click', e => { if (e.target === box) close(); });
    document.addEventListener('keydown', e => {
      if (!box.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'Tab') {                                   // simple focus trap
        const f = $$('button', box), first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  })();

  /* ==========================================================================
     8. FAQ ACCORDION (one open at a time per accordion)
     ========================================================================== */
  $$('.accordion').forEach(acc => {
    const btns = $$('.acc-btn', acc);
    btns.forEach(btn => btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btns.forEach(b => {
        b.setAttribute('aria-expanded', 'false');
        b.closest('.acc-item').classList.remove('open');
      });
      btn.setAttribute('aria-expanded', String(!open));
      btn.closest('.acc-item').classList.toggle('open', !open);   // CSS opens the answer from this class
    }));
  });

  /* ==========================================================================
     9. CONTACT FORM — client-side validation with accessible messages
     ========================================================================== */
  (function form() {
    const f = $('#contactForm');
    if (!f) return;
    const status = $('#formStatus');
    const rules = {
      name:    v => (v.trim().length >= 2 ? '' : 'Please enter your full name.'),
      email:   v => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Please enter a valid email address.'),
      phone:   v => (/^\+?[0-9\s\-()]{7,18}$/.test(v.trim()) ? '' : 'Please enter a valid phone number (digits, spaces, + allowed).'),
      topic:   v => (v ? '' : 'Please choose what you are enquiring about.'),
      message: v => (v.trim().length >= 10 ? '' : 'Please tell us a little more (at least 10 characters).'),
      consent: (v, el) => (el.checked ? '' : 'Please tick the box so we can contact you.')
    };
    function validate(el) {
      const rule = rules[el.name];
      if (!rule) return true;
      const msg = rule(el.value, el), wrap = el.closest('.field'), err = $('#err-' + el.name);
      wrap.classList.toggle('invalid', !!msg);
      wrap.classList.toggle('valid', !msg && el.type !== 'checkbox' && el.value.trim() !== '');
      el.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (err) err.textContent = msg;
      return !msg;
    }
    $$('input, select, textarea', f).forEach(el => {
      el.addEventListener('blur', () => validate(el));
      el.addEventListener('input', () => { if (el.closest('.field').classList.contains('invalid')) validate(el); });
      el.addEventListener('change', () => validate(el));
    });

    f.addEventListener('submit', async e => {
      e.preventDefault();
      status.className = 'form-status';
      const fields = $$('input, select, textarea', f).filter(el => rules[el.name]);
      if (fields.map(validate).includes(false)) {
        const bad = fields.find(el => el.getAttribute('aria-invalid') === 'true');
        if (bad) bad.focus();
        status.textContent = 'Please fix the highlighted fields and try again.';
        status.className = 'form-status show fail';
        return;
      }
      const btn = $('#cf-submit');
      btn.disabled = true; btn.textContent = 'Sending…';
      try {
        if (FORM_ENDPOINT) {
          const res = await fetch(FORM_ENDPOINT, { method: 'POST', headers: { Accept: 'application/json' }, body: new FormData(f) });
          if (!res.ok) throw new Error('Request failed');
        } else {
          await new Promise(r => setTimeout(r, 700));          // demo mode: simulate a network call
        }
        status.textContent = 'Thank you! Your message has been received. We will reply within one working day.';
        status.className = 'form-status show ok';
        f.reset(); $$('.field', f).forEach(w => w.classList.remove('valid', 'invalid'));
      } catch (err) {
        status.textContent = 'Sorry, something went wrong. Please try again or message us on WhatsApp.';
        status.className = 'form-status show fail';
      } finally {
        btn.disabled = false;
        btn.innerHTML = 'Send message <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>';
      }
    });
  })();


  /* ==========================================================================
     Timeline — How we grew (line + dots animate when scrolled into view)
     ========================================================================== */
  (function growthTimeline() {
    const tl = $('#growthTimeline');
    if (!tl) return;
    function startLoop() {
      tl.classList.add('is-looping');
    }
    function reveal() {
      tl.classList.add('is-inview');
      /* After dots finish fading in, start the infinite line + circle loops */
      window.setTimeout(startLoop, reduceMotion ? 0 : 1600);
    }
    if (reduceMotion || !hasIO) { reveal(); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        reveal();
        io.disconnect();
      }
    }, { threshold: 0.25, rootMargin: '0px 0px -6% 0px' });
    io.observe(tl);
  })();


  /* ==========================================================================
     Stats band — fade-in + smooth count-up when scrolled into view
     ========================================================================== */
  (function statsBands() {
    const bands = $$('.stats-band');
    if (!bands.length) return;

    function formatNum(n, useComma) {
      const rounded = Math.round(n);
      return useComma ? rounded.toLocaleString('en-US') : String(rounded);
    }

    function animateBand(band) {
      if (band.dataset.counted === '1') return;
      band.dataset.counted = '1';
      band.classList.add('is-inview');
      const nums = $$('.stat-num', band);
      const duration = reduceMotion ? 0 : 1600;

      nums.forEach(el => {
        const target = parseFloat(el.dataset.target) || 0;
        const suffix = el.dataset.suffix || '';
        const useComma = el.dataset.format === 'comma';
        if (duration === 0) {
          el.textContent = formatNum(target, useComma) + suffix;
          return;
        }
        const start = performance.now();
        function tick(now) {
          const t = Math.min(1, (now - start) / duration);
          /* easeOutCubic */
          const eased = 1 - Math.pow(1 - t, 3);
          el.textContent = formatNum(target * eased, useComma) + suffix;
          if (t < 1) requestAnimationFrame(tick);
          else el.textContent = formatNum(target, useComma) + suffix;
        }
        requestAnimationFrame(tick);
      });
    }

    if (!hasIO) {
      bands.forEach(animateBand);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          animateBand(e.target);
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.35, rootMargin: '0px 0px -8% 0px' });
    bands.forEach(b => io.observe(b));
  })();


    /* ==========================================================================
     10. INIT
     ========================================================================== */
  $('#year').textContent = new Date().getFullYear();

  /* Placeholder image failed to load? Show a branded tile instead of a broken icon. */
  document.addEventListener('error', e => {
    const t = e.target;
    if (t.tagName === 'IMG' && !t.dataset.failed) {
      t.dataset.failed = '1';
      t.src = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B2150"/><stop offset="1" stop-color="#1E0F26"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><text x="400" y="320" text-anchor="middle" font-family="Georgia,serif" font-size="64" fill="#F59E0B">B</text></svg>');
    }
  }, true);

  if (!location.hash) history.replaceState(null, '', '#/home');
  navigate();
  window.addEventListener('load', () => moveIndicator());
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => moveIndicator());
})();
