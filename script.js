/* ==========================================================================
   BAKE N FROST — script.js (vanilla JavaScript, no dependencies)
   Sections: 1 router · 2 navigation · 3 header & back-to-top · 4 hero slideshow + status
             5 testimonials · 6 menu filter & order prefill · 7 lightbox
             8 FAQ accordion · 9 contact form · 9b cart (WhatsApp) · 9c scroll animations · 10 init

   Performance notes
   - No scroll listeners: header style and back-to-top use IntersectionObserver.
   - Slideshows only run while they are on screen (and the tab is visible).
   - Scroll animations use one IntersectionObserver (reveal once) + CSS scroll-driven
     animations for the progress bar / parallax; nothing runs on every scroll event.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- Helpers ---------- */
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasIO = 'IntersectionObserver' in window;

  /* Time-aware greeting + WhatsApp message templates */
  function timeGreeting() {
    try {
      const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour: 'numeric', hour12: false }).format(new Date()));
      if (h < 12) return 'Good morning';
      if (h < 17) return 'Good afternoon';
      return 'Good evening';
    } catch (e) { return 'Hello'; }
  }
  function politeOpen(suffix) {
    return timeGreeting() + ' Bake N Frost' + (suffix != null ? suffix : '!');
  }
  const WA = {
    cartOrder(linesItems, details) {
      const L = [politeOpen('! 👋'), 'I would like to place an order from your menu:', '', ...linesItems, ''];
      if (details.name) L.push('Name: ' + details.name);
      L.push('Pickup / delivery: to be confirmed on WhatsApp');
      if (details.note) L.push('Note: ' + details.note);
      L.push('', 'Please confirm availability, pricing and the next steps for pickup or delivery. Thank you!', '', 'Sent from the Bake N Frost website');
      return L.join('\n');
    },
    formByTopic(topic, fields) {
      const key = (topic || '').toLowerCase();
      let intent = 'I sent an enquiry from the website.';
      let closing = 'Looking forward to your reply.';
      if (/custom cake/.test(key)) {
        intent = "I'd like to order a custom cake.";
        closing = 'Please confirm availability, design options and pricing. Thank you!';
      } else if (/bread|pastry/.test(key)) {
        intent = "I'd like to place a bread and pastry order.";
        closing = 'Please confirm availability and pricing. Thank you!';
      } else if (/catering/.test(key)) {
        intent = "I'd like to enquire about catering for an event.";
        closing = 'Please share packages, lead time and how to book a tasting if available. Thank you!';
      } else if (/wholesale/.test(key)) {
        intent = "I'd like to discuss wholesale supply partnership.";
        closing = 'Please share your catalogue, minimum orders and delivery schedule. Thank you!';
      } else if (/academy|course|class|training/.test(key)) {
        intent = "I'd like to enquire about your Baking Academy.";
        closing = 'Please share upcoming start dates, fees and how to enrol. Thank you!';
      } else if (/general/.test(key)) {
        intent = 'I have a quick question.';
        closing = 'Thank you for your time.';
      }
      const lines = [politeOpen('!'), intent, '', 'Name: ' + fields.name, 'Email: ' + fields.email, 'Topic: ' + topic];
      if (fields.date) lines.push('Date needed: ' + fields.date);
      lines.push('', 'Message:', fields.message || '—', '', closing, 'Sent from the Bake N Frost website');
      return lines.join('\n');
    },
    courseEnquire(course) {
      return [
        timeGreeting() + '!',
        '',
        "I'd like to enquire about this Baking Academy course:",
        '',
        'Course: ' + (course.name || 'Academy course'),
        course.duration ? 'Duration: ' + course.duration : '',
        course.price ? 'Listed from: ' + course.price : '',
        course.desc ? 'About: ' + course.desc : '',
        '',
        'Please share availability, upcoming start dates and how to enrol. Thank you!'
      ].filter(Boolean).join('\n');
    },
    productOrder(itemName) {
      return [
        timeGreeting() + '!',
        '',
        "I'd like to order: " + itemName + '.',
        'Quantity / size: ',
        'Date needed: ',
        '',
        'Please let me know availability and pricing. Thank you!'
      ].join('\n');
    },
    topicSeed(topic) {
      const key = (topic || '').toLowerCase();
      let body = 'Please tell me more about this.';
      if (/academy/.test(key)) body = "I'd like to learn more about the Baking Academy — courses, schedules and enrolment.";
      else if (/catering/.test(key)) body = "I'd like to enquire about catering.\nEvent date:\nGuest count:\nMenu ideas: ";
      else if (/wholesale/.test(key)) body = "I'm interested in wholesale supply. Please share your catalogue and minimum order details.";
      else if (/cake/.test(key)) body = "I'd like to order a custom cake.\nOccasion:\nSize / servings:\nFlavour ideas: ";
      else if (/bread|pastry|menu/.test(key)) body = "I'd like to order from the bakery menu.\nItems and quantities: ";
      return [timeGreeting() + '!', '', body, '', 'Thank you!'].join('\n');
    },
    generalChat() {
      return politeOpen('!') + "\n\nI'd like to make an enquiry.\n\nThank you!";
    },
    cateringQuote() {
      return [
        politeOpen('!'),
        '',
        "I'd like to request a catering quote.",
        'Event date:',
        'Venue / area:',
        'Guest count:',
        'Menu preferences or dietary needs:',
        '',
        'Please share options and pricing. Thank you!'
      ].join('\n');
    }
  };



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

      /* Assign later slideshow photos only when needed; warm one frame ahead. */
      const currentSlide = slides[active];
      if (currentSlide && !currentSlide.style.getPropertyValue('--img') && currentSlide.dataset.image) {
        currentSlide.style.setProperty('--img', `url("${currentSlide.dataset.image}")`);
      }
      const nextSlide = slides[(active + 1) % n];
      if (nextSlide && nextSlide.dataset.image && !nextSlide.dataset.warmed) {
        nextSlide.dataset.warmed = '1';
        const warmImage = new Image();
        warmImage.decoding = 'async';
        warmImage.src = nextSlide.dataset.image;
      }

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
  const HOURS = [[13 * 60 + 20, 18 * 60], [8 * 60, 18 * 60], [8 * 60, 18 * 60], [8 * 60, 18 * 60], [8 * 60, 18 * 60], [8 * 60, 18 * 60], [13 * 60 + 20, 18 * 60]];   // Sun … Sat: [open, close] in minutes after midnight (Mon–Fri 8:00–18:00, Sat–Sun 13:20–18:00)
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const TZ = 'Africa/Lagos';
  const label = m => { const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0'); return ((h % 12) || 12) + ':' + mm + ' ' + (h < 12 ? 'AM' : 'PM'); };

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
      const isOpen = mins >= open && mins < close;

      greetEl.textContent = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      if (isOpen) {
        stateEl.innerHTML = 'Open<span class="hero-status-more"> for orders</span>';
      } else {
        const next = mins < open ? open : HOURS[(day + 1) % 7][0];     // today's opening, or tomorrow's
        stateEl.textContent = 'Opens ' + label(next);
      }
      box.classList.toggle('is-closed', !isOpen);
      timeEl.textContent = 'Lagos · ' + clock.format(now) + ' WAT';
    }
    update();
    setInterval(update, 30000);
  })();


  

  /* ==========================================================================
     4c. ROUTE-AWARE IMAGE PRIORITY
     - Hero LCP stays on <link rel="preload"> + first slide --img
     - When a page becomes active, warm its above-the-fold and near-viewport images
       so they are ready before the visitor scrolls to them.
     ========================================================================== */
  (function routeImageWarm() {
    const ROOT_MARGIN = '1200px 0px';

    function warmImg(img) {
      if (!img || img.dataset.warmed === '1') return;
      img.dataset.warmed = '1';
      if (img.loading === 'lazy') img.loading = 'eager';
      img.decoding = 'async';
      if ('fetchPriority' in img) img.fetchPriority = 'low';
      /* Kick network without waiting for layout */
      if (img.complete && img.naturalWidth) {
        if (img.decode) img.decode().catch(() => {});
      } else {
        const probe = new Image();
        probe.decoding = 'async';
        probe.src = img.currentSrc || img.src;
      }
    }

    function warmGalleryBg(btn) {
      const full = btn && btn.dataset && btn.dataset.full;
      if (!full || btn.dataset.bgWarmed === '1') return;
      btn.dataset.bgWarmed = '1';
      const probe = new Image();
      probe.decoding = 'async';
      probe.src = full;
    }

    function warmPage(page) {
      if (!page) return;
      /* Only the big banner photos at the top of a page are fetched up front.
         Everything else loads as the visitor scrolls: the observer below starts each image
         about 1200px before it comes into view, so nothing pops in late. */
      $$('.page-hero img, .menu-hero-media img, .craft-media img', page).forEach(warmImg);
    }

    /* On first paint: warm active page */
    const active = $('.page.active') || $('#page-home');
    warmPage(active);

    /* When route changes, warm the new page immediately */
    window.addEventListener('hashchange', () => {
      const { route } = (function () {
        const parts = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
        return { route: parts[0] || 'home' };
      })();
      const page = document.getElementById('page-' + route);
      warmPage(page);
    });

    /* Also keep a generous IO for any remaining lazy images site-wide */
    if (!hasIO) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const t = entry.target;
        if (t.tagName === 'IMG') warmImg(t);
        if (t.classList && t.classList.contains('g-item')) {
          warmImg($('img', t));
          warmGalleryBg(t);
        }
        io.unobserve(t);
      });
    }, { rootMargin: ROOT_MARGIN, threshold: 0.01 });

    $$('img[loading="lazy"]').forEach(img => io.observe(img));
    $$('.g-item[data-full]').forEach(btn => io.observe(btn));
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
    document.dispatchEvent(new CustomEvent('menu:filtered'));
  }
  filterBtns.forEach(b => b.addEventListener('click', () => applyMenuFilter(b.dataset.filter)));

  /* "Order" buttons jump to the contact form with the item pre-filled */
  const topicSel = $('#cf-topic'), msgBox = $('#cf-message');
  document.addEventListener('click', e => {
    const orderBtn = e.target.closest('[data-order]');
    if (orderBtn) {
      const item = orderBtn.dataset.order;
      topicSel.value = /cake/i.test(item) ? 'Custom cake order' : 'Bread & pastry order';
      msgBox.value = WA.productOrder(item);
      location.hash = '#/contact/enquiry';
    }
    const topicLink = e.target.closest('[data-topic]');
    if (topicLink) {
      const t = topicLink.dataset.topic;
      topicSel.value = t;
      if (msgBox && !msgBox.value.trim()) msgBox.value = WA.topicSeed(t);
    }
  });

  /* ==========================================================================
     7. LIGHTBOX GALLERY (focus-managed, keyboard accessible)
     ========================================================================== */
  (function lightbox() {
    const items = $$('.gallery .g-item'), box = $('#lightbox'), img = $('#lbImg'), cap = $('#lbCap');
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
    const WA_NUMBER = '2348140147001';
    const rules = {
      name:    v => (v.trim().length >= 2 ? '' : 'Please enter your full name.'),
      email:   v => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Please enter a valid email address.'),
      topic:   v => (v ? '' : 'Please choose what you are enquiring about.'),
      message: v => (v.trim().length >= 10 ? '' : 'Please tell us a little more (at least 10 characters).'),
      consent: (v, el) => (el.checked ? '' : 'Please tick the box so we can contact you.')
    };
    function validate(el) {
      const rule = rules[el.name];
      if (!rule) return true;
      const msg = rule(el.value, el), wrap = el.closest('.field'), err = $('#err-' + el.name);
      if (!wrap) return !msg;
      wrap.classList.toggle('invalid', !!msg);
      wrap.classList.toggle('valid', !msg && el.type !== 'checkbox' && el.value.trim() !== '');
      el.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (err) err.textContent = msg;
      return !msg;
    }
    $$('input, select, textarea', f).forEach(el => {
      el.addEventListener('blur', () => validate(el));
      el.addEventListener('input', () => { if (el.closest('.field') && el.closest('.field').classList.contains('invalid')) validate(el); });
      el.addEventListener('change', () => validate(el));
    });

    function buildWhatsAppMessage() {
      const name = (f.elements.name && f.elements.name.value || '').trim();
      const email = (f.elements.email && f.elements.email.value || '').trim();
      const topic = (f.elements.topic && f.elements.topic.value || '').trim();
      const date = (f.elements.date && f.elements.date.value || '').trim();
      const message = (f.elements.message && f.elements.message.value || '').trim();
      return WA.formByTopic(topic, {
        name: name,
        email: email,
        message: message,
        date: date ? (function(){ const d = new Date(date + 'T12:00:00'); return isNaN(d) ? date : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }); })() : ''
      });
    }

    f.addEventListener('submit', e => {
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
      btn.disabled = true;
      const url = 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(buildWhatsAppMessage());
      status.textContent = 'Opening WhatsApp with your enquiry…';
      status.className = 'form-status show ok';
      window.open(url, '_blank', 'noopener');
      f.reset();
      $$('.field', f).forEach(w => w.classList.remove('valid', 'invalid'));
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = 'Send message <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>';
      }, 600);
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
     9b. CART + PRODUCT MODAL — no prices anywhere; orders go out through WhatsApp only
         • Change the number below to change where orders are sent (international
           format, digits only: 234 + number without the leading 0).
         • Products are the <article class="item-card"> cards in index.html. Nothing is
           duplicated in this file: the name, photo and description are read straight from
           the card (<h3>, <img>, <p>), so editing a card is the only edit you ever make.
         • Clicking a card's photo, title or "View details" opens the product modal
           (photo, description, quantity, special instructions, Add to cart).
     ========================================================================== */
  const WHATSAPP_NUMBER = '2348140147001';          // 0814 014 7001
  (function cart() {
    const STORE = 'bnf-cart-v2';
    const MAX_QTY = 99;
    const btn = $('#cartBtn'), count = $('#cartCount');
    const drawer = $('#cartDrawer'), overlay = $('#cartOverlay');
    if (!btn || !drawer) return;
    const list = $('#cartList'), empty = $('#cartEmpty'), details = $('#cartDetails'), foot = $('#cartFoot');
    const headCount = $('#cartHeadCount');
    const checkout = $('#cartCheckout'), clearBtn = $('#cartClear'), closeBtn = $('#cartClose');
    const toast = $('#toast'), toastMsg = $('#toastMsg'), toastAction = $('#toastAction');

    /* ----- state (items + order details), persisted in localStorage ----- */
    let items = [];
    let info = { name: '', note: '' };

    function load() {
      try {
        const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
        if (!raw) return;
        items = (Array.isArray(raw.items) ? raw.items : []).map(i => ({
          id: String(i.id || '').slice(0, 160), name: String(i.name || '').slice(0, 120),
          note: String(i.note || '').slice(0, 300),
          img: typeof i.img === 'string' && /^(https?|file):/.test(i.img) ? i.img : '',
          src: typeof i.src === 'string' && /^(https?|file):/.test(i.src) ? i.src : '',
          full: typeof i.full === 'string' && /^https?:/.test(i.full) ? i.full : '',
          qty: Math.min(MAX_QTY, Math.max(1, parseInt(i.qty, 10) || 1))
        })).filter(i => i.id && i.name);
        if (raw.info) info = Object.assign(info, {
          name: String(raw.info.name || '').slice(0, 60), 
          note: String(raw.info.note || '').slice(0, 300)
        });
      } catch (e) { /* storage blocked or corrupt: start empty */ }
    }
    function save() { try { localStorage.setItem(STORE, JSON.stringify({ items, info })); } catch (e) {} }
    const totalQty = () => items.reduce((n, i) => n + i.qty, 0);

    /* ----- rendering ----- */
    let lastFocus = null, enteringId = null;
    function render() {
      const q = totalQty();
      count.textContent = q > 99 ? '99+' : q;
      btn.classList.toggle('has-items', q > 0);
      btn.setAttribute('aria-label', q ? 'Open cart, ' + q + (q === 1 ? ' item' : ' items') : 'Open cart, empty');
      headCount.textContent = q ? '(' + q + ')' : '';
      const has = items.length > 0;
      empty.hidden = has; list.hidden = !has; details.hidden = !has; if (foot) foot.hidden = !has;
      drawer.classList.toggle('is-empty', !has);
      list.textContent = '';
      items.forEach(it => {
        const li = document.createElement('li');
        li.className = 'cart-line' + (it.id === enteringId ? ' is-new' : '');
        li.dataset.id = it.id;
        const img = document.createElement('img');
        img.alt = ''; img.width = 64; img.height = 64; img.loading = 'lazy'; if (it.img) img.src = it.img;
        const mid = document.createElement('div'); mid.className = 'cl-main';
        const nm = document.createElement('span'); nm.className = 'cl-name'; nm.textContent = it.name;
        mid.appendChild(nm);
        if (it.note) { const nt = document.createElement('span'); nt.className = 'cl-unit'; nt.textContent = '“' + it.note + '”'; mid.appendChild(nt); }
        const qty = document.createElement('div'); qty.className = 'cl-qty'; qty.setAttribute('role', 'group'); qty.setAttribute('aria-label', 'Quantity for ' + it.name);
        qty.innerHTML = '<button type="button" data-act="dec" aria-label="Decrease quantity"><i class="fa-solid fa-minus" aria-hidden="true"></i></button>' +
                        '<output aria-live="polite"></output>' +
                        '<button type="button" data-act="inc" aria-label="Increase quantity"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>';
        $('output', qty).textContent = it.qty;
        mid.appendChild(qty);
        const end = document.createElement('div'); end.className = 'cl-end';
        const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'cl-remove'; rm.dataset.act = 'rm';
        rm.setAttribute('aria-label', 'Remove ' + it.name); rm.innerHTML = '<i class="fa-regular fa-trash-can" aria-hidden="true"></i>';
        end.appendChild(rm);
        li.append(img, mid, end);
        list.appendChild(li);
      });
      enteringId = null;
      if (lastFocus) {
        const el = $('.cart-line[data-id="' + CSS.escape(lastFocus.id) + '"] [data-act="' + lastFocus.act + '"]', list);
        if (el) el.focus();
        lastFocus = null;
      }
      const f = details.elements;
      if (f.name && document.activeElement !== f.name) f.name.value = info.name;
      if (f.note && document.activeElement !== f.note) f.note.value = info.note;
      updateLink();
      warmPhotos();
    }

    /* ----- WhatsApp message + link ----- */
    /* linkFor(item) decides whether an item gets a "Photo: https://…" line.
       No argument = every item (the plain link message). */
    function buildMessage(linkFor) {
      const linesItems = [];
      items.forEach((it, n) => {
        linesItems.push((n + 1) + '. ' + it.name + ' × ' + it.qty);
        if (it.note) linesItems.push('    Note: ' + it.note);
        if (it.full && (!linkFor || linkFor(it))) linesItems.push('    Photo: ' + it.full);
      });
      return WA.cartOrder(linesItems, { name: (info.name || '').trim(), note: (info.note || '').trim() });
    }
    function updateLink() {
      const on = items.length > 0;
      checkout.setAttribute('aria-disabled', String(!on));
      checkout.href = on ? 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(buildMessage()) : '#';
    }

    /* ==========================================================================
       ORDER BUTTON — one button, photos always included
       A web page cannot attach files to a wa.me link, so the button picks the best route itself:
         • Phones / tablets (share sheet supports files): the real product photos are attached
           to the order message. The customer picks WhatsApp → Bake N Frost → send.
           Photos are downloaded in the background as soon as an item is added, so the sheet
           opens instantly on tap (phones require the share to start right after the tap).
         • Desktop, or any browser that can't share files: the normal WhatsApp link opens
           with a "Photo:" link under every product.
         • If anything goes wrong (a photo can't load, the share fails) the order still goes
           out as the link message, so an order is never lost.
       ========================================================================== */
    const ATTACH_PHOTOS = true;          // set to false to always send the link-only message
    const MAX_PHOTOS = 10;               // at most this many photos per order (the rest go as links)
    const PHOTO_WAIT_MS = 8000;          // how long a tap waits for photos that are still downloading
    const useShare = (() => {
      try {
        return ATTACH_PHOTOS && !!navigator.share && !!navigator.canShare &&
          navigator.canShare({ files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] }) &&
          window.matchMedia('(pointer: coarse)').matches;          // touch devices only; desktops use WhatsApp Web
      } catch (e) { return false; }
    })();
    const checkoutHTML = checkout.innerHTML;
    const statusEl = $('#cartStatus'), fineEl = $('#cartFine');
    if (useShare && fineEl) {
      fineEl.textContent = 'Availability, pricing, and pickup or delivery are confirmed with you on WhatsApp. ' +
        'Tap the button, choose WhatsApp, then Bake N Frost (+234 814 014 7001) and send: your product photos go with the order.';
    }

    let statusTimer = null;
    function setStatus(msg) {                                       // visible inside the drawer, unlike the toast
      if (!statusEl) return;
      clearTimeout(statusTimer);
      statusEl.textContent = msg || ''; statusEl.hidden = !msg;
      if (msg) statusTimer = setTimeout(() => { statusEl.hidden = true; }, 7000);
    }
    function setBusy(on) {
      checkout.classList.toggle('is-busy', on);
      checkout.setAttribute('aria-busy', String(on));
      checkout.innerHTML = on ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Preparing photos…' : checkoutHTML;
    }

    /* photo cache: address → { state: 'loading' | 'ready' | 'failed', blob, promise } */
    const photos = new Map();
    const photoKey = it => it.src || it.full || it.img || '';
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    /* Any image format → a JPEG of at most 1280px (small, and WhatsApp accepts it everywhere) */
    async function toJpeg(blob) {
      try {
        const bmp = await createImageBitmap(blob);
        const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
        if (bmp.close) bmp.close();
        const out = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.86));
        if (out && out.size) return out;
      } catch (e) { /* fall through */ }
      return /^image\/(jpeg|png|webp)$/.test(blob.type) ? blob : null;
    }
    function preparePhoto(url) {
      let p = photos.get(url);
      if (p) return p;
      p = { state: 'loading', blob: null, promise: null };
      photos.set(url, p);
      p.promise = (async () => {
        try {
          const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
          if (!r.ok) throw new Error('http ' + r.status);
          const raw = await r.blob();
          if (!raw || !raw.size) throw new Error('empty');
          p.blob = await toJpeg(raw);
          p.state = p.blob ? 'ready' : 'failed';
        } catch (e) { p.state = 'failed'; }          // blocked, missing or not an image: this one goes as a link
      })();
      return p;
    }
    /* one entry per distinct photo in the cart (same product with two notes = one photo) */
    function photoList() {
      const seen = new Set(), out = [];
      items.forEach(it => { const u = photoKey(it); if (u && !seen.has(u)) { seen.add(u); out.push({ url: u, name: it.name }); } });
      return out;
    }
    function warmPhotos() { if (useShare) photoList().forEach(w => preparePhoto(w.url)); }

    function openLink(msg) {                                         // the always-works route
      updateLink();
      setStatus(msg || 'Opening WhatsApp… your cart is saved until you clear it.');
      const w = window.open(checkout.href, '_blank');
      if (w) { try { w.opener = null; } catch (e) {} } else { location.href = checkout.href; }
    }

    let sending = false;
    async function sendWithPhotos() {
      const want = photoList();
      want.forEach(w => preparePhoto(w.url));
      let waited = false;
      if (want.some(w => photos.get(w.url).state === 'loading')) {   // photos still downloading: wait a moment
        sending = true; waited = true; setBusy(true);
        await Promise.race([Promise.all(want.map(w => photos.get(w.url).promise)), sleep(PHOTO_WAIT_MS)]);
        setBusy(false); sending = false;
      }
      const ok = want.filter(w => photos.get(w.url).state === 'ready').slice(0, MAX_PHOTOS);
      if (!ok.length) return openLink('Opening WhatsApp… the photos are included as links.');
      const files = ok.map((w, i) => {
        const b = photos.get(w.url).blob, ext = (b.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        return new File([b], (i + 1) + '-' + (slug(w.name) || 'photo') + '.' + ext, { type: b.type });
      });
      if (!navigator.canShare({ files })) return openLink('Opening WhatsApp… the photos are included as links.');
      const sent = new Set(ok.map(w => w.url));
      const text = buildMessage(it => !sent.has(photoKey(it)));      // photos that couldn't attach still get a link
      try {
        await navigator.share({ files, text, title: 'Bake N Frost order' });
        setStatus('Almost there: pick Bake N Frost in WhatsApp and tap send. Your cart is saved.');
      } catch (err) {
        if (err && err.name === 'AbortError') return;                // customer closed the sheet: nothing to do
        if (err && err.name === 'NotAllowedError' && waited) {       // the wait outlasted the tap; photos are ready now
          setStatus('Your photos are ready. Tap “Order via WhatsApp” once more to send.');
          return;
        }
        openLink('Opening WhatsApp… the photos are included as links.');
      }
    }
    checkout.addEventListener('click', e => {
      if (!items.length) { e.preventDefault(); return; }
      if (!useShare) { updateLink(); setStatus('Opening WhatsApp… your cart is saved until you clear it.'); return; }   // normal link opens
      e.preventDefault();
      if (!sending) sendWithPhotos();
    });

    /* ----- mutations ----- */
    const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
    function add(data, source, qty) {
      qty = Math.min(MAX_QTY, Math.max(1, qty || 1));
      const note = (data.note || '').trim();
      const id = slug(data.name) + (note ? '--' + slug(note) : '');       // same product + different note = separate line
      const found = items.find(i => i.id === id);
      if (found) found.qty = Math.min(MAX_QTY, found.qty + qty);
      else items.push({ id, name: data.name, note, img: data.img, src: data.src || '', full: data.full || '', qty });
      if (found && !found.full && data.full) found.full = data.full;
      if (found && !found.src && data.src) found.src = data.src;
      enteringId = found ? null : id;
      save(); render(); bump();
      fly(source, data.img);
      showToast(data.name + ' added to your cart');
    }
    function setQty(id, q) {
      const it = items.find(i => i.id === id); if (!it) return;
      if (q < 1) return remove(id);
      it.qty = Math.min(MAX_QTY, q); save(); render();
    }
    function remove(id) {
      const li = $('.cart-line[data-id="' + CSS.escape(id) + '"]', list);
      const done = () => { items = items.filter(i => i.id !== id); save(); render(); };
      if (li && !reduceMotion) { li.classList.add('is-leaving'); setTimeout(done, 240); } else done();
    }
    function clearAll() { items = []; save(); render(); }

    /* ----- reading a product from its card (the card is the single source of truth) ----- */
    /* Full address of the card's photo, whatever the path looks like (images/x.jpg, spaces, https…) */
    function photoSrc(card) {
      const im = card && $('.item-media img', card);
      if (!im) return '';
      try { return new URL(im.currentSrc || im.src, location.href).href; } catch (e) { return ''; }
    }
    /* WhatsApp can only open public web addresses, so the "Photo:" link needs http(s) */
    const webUrl = u => (/^https?:/.test(u) ? u : '');
    /* Small version for the cart thumbnail (Unsplash placeholders get a 160px crop; your own images are used as they are) */
    const thumbUrl = u => (u.startsWith('data:') ? '' : u.replace('w=640&h=480', 'w=160&h=160'));
    function productFromCard(card) {
      const h3 = $('h3', card), p = $('.item-body p', card), tag = $('.tag', card);
      const src = photoSrc(card), im = $('.item-media img', card);
      return {
        name: h3 ? h3.textContent.trim() : 'Product',
        desc: p ? p.textContent.trim() : '',
        tag: tag ? tag.textContent.trim() : '',
        alt: im ? im.alt : '',
        src,                          // shown large in the popup
        img: thumbUrl(src),           // small thumbnail in the cart
        full: webUrl(src)             // link sent in the WhatsApp message
      };
    }
    /* Keep each "View details" button's screen-reader label in step with the card's title */
    function labelCards() {
      $$('.item-card').forEach(card => {
        const h3 = $('h3', card); if (!h3) return;
        $$('[data-view]', card).forEach(b => b.setAttribute('aria-label', 'View details of ' + h3.textContent.trim()));
      });
    }
    labelCards();

    /* ----- product modal ----- */
    const pm = $('#productModal');
    if (pm) {
      const pmImg = $('#pmImg'), pmName = $('#pmName'), pmDesc = $('#pmDesc'), pmTag = $('#pmTag');
      const pmQty = $('#pmQty'), pmNote = $('#pmNote'), pmAdd = $('#pmAdd'), pmClose = $('#pmClose');
      let cur = null, q = 1, pmOpener = null;
      const setQ = v => { q = Math.min(MAX_QTY, Math.max(1, v)); pmQty.textContent = q; };
      function openPm(card, opener) {
        if (!card || !$('.item-media img', card)) return;
        cur = productFromCard(card);
        pmImg.src = cur.src; pmImg.alt = cur.alt;
        pm.style.setProperty('--pm-img', 'url("' + cur.src + '")');
        pmName.textContent = cur.name;
        pmDesc.textContent = cur.desc;
        pmTag.textContent = cur.tag; pmTag.hidden = !cur.tag;
        pmNote.value = ''; setQ(1);
        pmOpener = opener || document.activeElement;
        pm.inert = false; pm.classList.add('open'); pm.setAttribute('aria-hidden', 'false');
        document.body.classList.add('no-scroll');
        setTimeout(() => pmClose.focus(), 60);
      }
      function closePm() {
        if (!pm.classList.contains('open')) return;
        pm.classList.remove('open'); pm.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('no-scroll');
        setTimeout(() => { if (!pm.classList.contains('open')) pm.inert = true; }, 420);
        if (pmOpener && document.contains(pmOpener)) pmOpener.focus();
      }
      document.addEventListener('click', e => {
        const v = e.target.closest('[data-view]');
        const h3 = !v && e.target.closest('.item-card h3');
        if (v || h3) openPm((v || h3).closest('.item-card'), v || h3);
      });
      $('#pmInc').addEventListener('click', () => setQ(q + 1));
      $('#pmDec').addEventListener('click', () => setQ(q - 1));
      pmAdd.addEventListener('click', () => {
        add({ name: cur.name, img: cur.img, src: cur.src, full: cur.full, note: pmNote.value }, pmAdd, q);
        closePm();
      });
      pmClose.addEventListener('click', closePm);
      $$('[data-pm-close]', pm).forEach(x => x.addEventListener('click', closePm));
      window.addEventListener('hashchange', closePm);
      document.addEventListener('keydown', e => {
        if (!pm.classList.contains('open')) return;
        if (e.key === 'Escape') { e.stopPropagation(); closePm(); }
        if (e.key === 'Tab') {
          const f = $$('button, textarea', pm).filter(x => x.offsetParent !== null);
          const first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      });
    }

    /* ----- drawer controls ----- */
    list.addEventListener('click', e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const id = a.closest('.cart-line').dataset.id, it = items.find(i => i.id === id);
      lastFocus = { id, act: a.dataset.act === 'rm' ? 'inc' : a.dataset.act };
      if (a.dataset.act === 'inc') setQty(id, it.qty + 1);
      if (a.dataset.act === 'dec') setQty(id, it.qty - 1);
      if (a.dataset.act === 'rm') { lastFocus = null; remove(id); }
    });
    let clearArmed = null;
    clearBtn.addEventListener('click', () => {           // two-step confirm, no browser dialog
      if (clearArmed) { clearTimeout(clearArmed); clearArmed = null; clearBtn.classList.remove('armed'); clearBtn.textContent = 'Clear Cart'; clearAll(); return; }
      clearBtn.classList.add('armed'); clearBtn.textContent = 'Tap again to clear everything';
      clearArmed = setTimeout(() => { clearArmed = null; clearBtn.classList.remove('armed'); clearBtn.textContent = 'Clear Cart'; }, 3000);
    });
    details && details.addEventListener('input', () => {
      const f = details.elements;
      info.name = f.name ? f.name.value : ''; info.note = f.note ? f.note.value : '';
      save(); updateLink();
    });
    details && details.addEventListener('submit', e => e.preventDefault());

    /* ----- open / close (focus managed, Esc closes) ----- */
    let opener = null;
    function open() {
      opener = document.activeElement;
      toast.classList.remove('show');
      drawer.inert = false; drawer.classList.add('open'); overlay.classList.add('open');
      drawer.setAttribute('aria-hidden', 'false'); overlay.setAttribute('aria-hidden', 'false');
      btn.setAttribute('aria-expanded', 'true');
      document.body.classList.add('no-scroll');
      setTimeout(() => closeBtn.focus(), 60);
    }
    function close() {
      if (!drawer.classList.contains('open')) return;
      drawer.classList.remove('open'); overlay.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true'); overlay.setAttribute('aria-hidden', 'true');
      btn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('no-scroll');
      setTimeout(() => { if (!drawer.classList.contains('open')) drawer.inert = true; }, 450);
      if (opener && document.contains(opener)) opener.focus();
    }
    btn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', close);
    $$('[data-close-cart]').forEach(a => a.addEventListener('click', close));
    window.addEventListener('hashchange', close);
    document.addEventListener('keydown', e => {
      if (!drawer.classList.contains('open')) return;
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      if (e.key === 'Tab') {                              // focus trap
        const f = $$('button:not([disabled]), a[href]:not([aria-disabled="true"]), input:not([disabled]), textarea:not([disabled])', drawer).filter(x => x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    window.addEventListener('storage', e => { if (e.key === STORE) { load(); render(); } });

    /* ----- feedback: badge bump, flying thumbnail, toast ----- */
    function bump() { btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump'); }
    function fly(src, img) {
      if (reduceMotion || !src || !btn.animate) return;
      const a = src.getBoundingClientRect(), b = btn.getBoundingClientRect();
      if (!b.width || !a.width) return;
      const size = 46, dot = document.createElement('span');
      dot.className = 'fly-dot'; dot.setAttribute('aria-hidden', 'true');
      if (img) dot.style.backgroundImage = 'url("' + img + '")';
      dot.style.left = (a.left + a.width / 2 - size / 2) + 'px';
      dot.style.top = (a.top + a.height / 2 - size / 2) + 'px';
      document.body.appendChild(dot);
      const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
      dot.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: 'translate(' + dx * .45 + 'px,' + (dy * .45 - 70) + 'px) scale(.8)', opacity: 1, offset: .5 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.25)', opacity: .35 }
      ], { duration: 800, easing: 'cubic-bezier(.4,.1,.3,1)' }).onfinish = () => dot.remove();
    }
    let toastTimer = null;
    function showToast(msg) {
      toastMsg.textContent = msg;
      if (drawer.classList.contains('open')) { toast.classList.remove('show'); return; }
      toast.classList.add('show');
      toastAction.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
    }
    toastAction.addEventListener('click', () => { toast.classList.remove('show'); open(); });

    load(); render();
  })();

  /* ==========================================================================
     9c. SCROLL ANIMATIONS — subtle reveal-on-scroll, staggered, plus a progress bar.
         • Elements are tagged here (no extra markup needed) and fade/slide in once,
           the first time they enter the viewport (IntersectionObserver, no scroll loop).
         • Parallax / hero fade use CSS scroll-driven animations where the browser
           supports them (see styles.css) and simply stay still elsewhere.
         • Skipped entirely when the visitor prefers reduced motion.
     ========================================================================== */
  (function scrollFx() {
    const bar = $('#scrollProgress');
    /* progress bar: CSS handles it in modern browsers, tiny rAF fallback elsewhere */
    if (bar && !(window.CSS && CSS.supports && CSS.supports('animation-timeline: scroll()')) && !reduceMotion) {
      let ticking = false;
      const paint = () => {
        const h = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, window.scrollY / h) : 0) + ')';
        ticking = false;
      };
      window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(paint); } }, { passive: true });
    }
    /* Warm product photos before the visitor reaches the menu cards.
       The generous root margin gives the browser a head start without eagerly
       downloading every image on the page at initial load. */
    (function preloadProductImages() {
      const cards = $$('.item-card');
      if (!cards.length) return;

      function warm(card) {
        const img = $('img', card);
        if (!img || img.dataset.preloadStarted === '1') return;
        img.dataset.preloadStarted = '1';
        img.loading = 'eager';
        img.decoding = 'async';
        if ('fetchPriority' in img) img.fetchPriority = 'low';
        if (img.complete && img.naturalWidth > 0 && img.decode) {
          img.decode().catch(() => {});
        }
      }

      if (!hasIO) {
        cards.slice(0, 6).forEach(warm);
        return;
      }

      const imageObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          warm(entry.target);
          imageObserver.unobserve(entry.target);
        });
      }, { rootMargin: '1000px 0px', threshold: 0.01 });

      cards.forEach(card => imageObserver.observe(card));
    })();

    if (reduceMotion || !hasIO) {
      document.documentElement.classList.remove('reveal-capable');
      return;
    }

    const RULES = [
      ['.section-head > *', 'up'],
      ['.menu-hero-copy > *', 'up'],
      ['.menu-hero-media', 'zoom'],
      ['.item-card', 'product'],
      ['.grid > .card:not(.item-card)', 'up'],
      ['.container.split > :first-child', 'left'],
      ['.container.split > :last-child', 'right'],
      ['.how-step, .stepper-item, .stat', 'up'],
      ['.g-item', 'zoom'],
      ['.quote-band blockquote', 'zoom'],
      ['.filter-btn', 'up'],
      ['.visit-card, .visit-facts, .visit-intro, .map-wrap, .table-wrap, #contactForm, .accordion', 'up'],
      ['.cta .container > *', 'up'],
      ['.footer-grid > *', 'up'],
      ['.btn-row', 'up']
    ];
    const tagged = new Set();
    RULES.forEach(([sel, kind]) => $$(sel).forEach(el => {
      if (el.closest('#hero') || el.closest('.stats-band') || el.closest('.timeline')) return;   // these have their own animation
      el.dataset.rv = kind; tagged.add(el);
    }));
    /* never animate a parent and its child together */
    tagged.forEach(el => { let p = el.parentElement; while (p) { if (tagged.has(p)) { delete el.dataset.rv; tagged.delete(el); break; } p = p.parentElement; } });
    tagged.forEach(el => el.classList.add('rv'));

    const io = new IntersectionObserver(entries => {
      const vis = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
      vis.forEach((e, i) => {
        e.target.style.setProperty('--rv-d', Math.min(i, 6) * 85 + 'ms');
        e.target.classList.add('rv-in');
        io.unobserve(e.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
    tagged.forEach(el => io.observe(el));

    /* menu filter: replay a quick staggered entrance on the items that appear */
    document.addEventListener('menu:filtered', () => {
      $$('.menu-item:not([hidden])').forEach((el, i) => {
        el.classList.remove('rv-in'); void el.offsetWidth;
        el.style.setProperty('--rv-d', Math.min(i, 8) * 55 + 'ms');
        el.classList.add('rv-in');
      });
    });
  })();

  
  /* Academy course card switcher */
  $$('[data-course-switch]').forEach(card => {
    const panels = $$('.course-panel', card);
    const dots = $$('.course-dot', card);
    if (panels.length < 2) return;
    let i = 0;
    function show(n) {
      i = (n + panels.length) % panels.length;
      panels.forEach((p, k) => {
        const on = k === i;
        p.hidden = !on;
        p.classList.toggle('is-active', on);
      });
      dots.forEach((d, k) => d.classList.toggle('is-on', k === i));
    }
    $$('.course-arrow', card).forEach(btn => {
      btn.addEventListener('click', () => show(i + Number(btn.dataset.dir)));
    });
  });

  /* Academy course filter */
  (function courseFilter() {
    const btns = $$('.course-filter');
    if (!btns.length) return;
    const gridCards = $$('[data-course-cat]');
    btns.forEach(btn => btn.addEventListener('click', () => {
      const f = btn.dataset.courseFilter;
      btns.forEach(b => {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      gridCards.forEach(card => {
        const cat = card.dataset.courseCat || '';
        card.hidden = !(f === 'all' || cat === f || cat === 'both' || cat.split(/\s+/).includes(f));
      });
    }));
  })();

  /* Course enquire → contact form message (topic stays Baking Academy) */
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-enquire-course]');
    if (!btn) return;
    const topicSel = $('#cf-topic');
    const msgBox = $('#cf-message');
    if (topicSel) topicSel.value = 'Baking Academy';
    if (msgBox) {
      msgBox.value = WA.courseEnquire({
        name: btn.dataset.courseName || 'Academy course',
        duration: btn.dataset.courseDuration || '',
        price: btn.dataset.coursePrice || '',
        desc: btn.dataset.courseDesc || ''
      });
    }
    location.hash = '#/contact/enquiry';
  });

  /* Live WhatsApp deep-link text for FAB and quote buttons */
  (function refreshWaLinks() {
    const fab = $('#waFab');
    if (fab) fab.href = 'https://wa.me/2348140147001?text=' + encodeURIComponent(WA.generalChat());
    $$('a.btn-whatsapp-quote').forEach(a => {
      a.href = 'https://wa.me/2348140147001?text=' + encodeURIComponent(WA.cateringQuote());
    });
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
  /* the router now owns which page is shown: drop the first-paint classes set in <head> */
  ROUTES.forEach(r => document.documentElement.classList.remove('r-' + r));
  window.addEventListener('load', () => moveIndicator());
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => moveIndicator());
})();
