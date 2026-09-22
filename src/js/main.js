/**
 * iPhone 18 — CS409 MP1
 *
 * Four independent modules, each initialised on DOMContentLoaded:
 *   navbar()   sticky resizing bar, section indicator, progress line
 *   carousel() the gallery slider
 *   modals()   the tech-spec dialogs
 *   film()     hover-to-play video
 *   swatches() the finish picker in the order section
 */

/* ------------------------------------------------------------------ *
 * Navbar: resize on scroll, highlight the current section
 * ------------------------------------------------------------------ */
function initNavbar() {
  const navbar = document.getElementById('navbar');
  const progress = document.getElementById('navProgress');
  const toggle = document.getElementById('navToggle');
  const menu = document.getElementById('navMenu');
  const links = Array.from(document.querySelectorAll('.navbar__link'));

  if (!navbar) return;

  // Pair every link with the section it points at, dropping any that
  // reference an id which is not on the page.
  const targets = links
    .map((link) => ({ link, section: document.querySelector(link.hash) }))
    .filter((entry) => entry.section);

  const SHRINK_AT = 60;
  let ticking = false;

  function navHeight() {
    return navbar.getBoundingClientRect().height;
  }

  function setActive(activeLink) {
    targets.forEach(({ link }) => {
      link.classList.toggle('is-active', link === activeLink);
    });
  }

  function updateIndicator() {
    if (!targets.length) return;

    const scrollY = window.scrollY;
    const viewport = window.innerHeight;
    const docHeight = document.documentElement.scrollHeight;

    // At the very bottom the last section may be shorter than the
    // viewport and can never reach the probe line, so highlight it
    // explicitly instead.
    if (scrollY + viewport >= docHeight - 2) {
      setActive(targets[targets.length - 1].link);
      return;
    }

    // Otherwise the current section is the last one whose top edge has
    // passed just under the navigation bar.
    const probe = navHeight() + 1;
    let current = null;

    targets.forEach(({ link, section }) => {
      if (section.getBoundingClientRect().top <= probe) current = link;
    });

    setActive(current);
  }

  function updateProgress() {
    if (!progress) return;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = scrollable > 0 ? window.scrollY / scrollable : 0;
    progress.style.width = `${Math.min(ratio, 1) * 100}%`;
  }

  function onScroll() {
    navbar.classList.toggle('is-scrolled', window.scrollY > SHRINK_AT);
    updateIndicator();
    updateProgress();
    ticking = false;
  }

  // Scroll fires far more often than the screen repaints, so the work is
  // deferred to the next animation frame.
  function requestUpdate() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(onScroll);
  }

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);

  // --- Small-screen menu ---
  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      const open = menu.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });

    // Collapse the menu once a destination has been chosen.
    links.forEach((link) => {
      link.addEventListener('click', () => {
        menu.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  onScroll();
}

/* ------------------------------------------------------------------ *
 * Carousel: arrows, dots, keyboard, wrap-around
 * ------------------------------------------------------------------ */
function initCarousel() {
  const root = document.getElementById('carousel');
  const track = document.getElementById('carouselTrack');
  const dotsHost = document.getElementById('carouselDots');
  const prev = document.getElementById('carouselPrev');
  const next = document.getElementById('carouselNext');

  if (!root || !track) return;

  const slides = Array.from(track.children);
  if (slides.length === 0) return;

  let index = 0;
  let dots = [];

  function render() {
    track.style.transform = `translate3d(-${index * 100}%, 0, 0)`;

    slides.forEach((slide, i) => {
      // Keep off-screen slides out of the tab order and the a11y tree.
      slide.setAttribute('aria-hidden', String(i !== index));
    });

    dots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === index);
      dot.setAttribute('aria-selected', String(i === index));
      dot.tabIndex = i === index ? 0 : -1;
    });
  }

  function goTo(target) {
    // Modulo keeps the index in range in both directions.
    index = (target + slides.length) % slides.length;
    render();
  }

  // Build the dots from the slide count rather than hard-coding them.
  if (dotsHost) {
    dots = slides.map((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'carousel__dot';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
      dot.addEventListener('click', () => goTo(i));
      dotsHost.appendChild(dot);
      return dot;
    });
  }

  if (prev) prev.addEventListener('click', () => goTo(index - 1));
  if (next) next.addEventListener('click', () => goTo(index + 1));

  root.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      goTo(index - 1);
    } else if (event.key === 'ArrowRight') {
      goTo(index + 1);
    }
  });

  render();
}

/* ------------------------------------------------------------------ *
 * Modals: open, close, restore focus
 * ------------------------------------------------------------------ */
function initModals() {
  const triggers = Array.from(document.querySelectorAll('[data-modal]'));
  let openModal = null;
  let lastFocused = null;

  function close() {
    if (!openModal) return;
    openModal.hidden = true;
    openModal = null;
    document.body.classList.remove('is-locked');
    if (lastFocused) lastFocused.focus();
  }

  function open(modal, trigger) {
    close();
    openModal = modal;
    lastFocused = trigger;
    modal.hidden = false;
    document.body.classList.add('is-locked');

    const closeButton = modal.querySelector('.modal__close');
    if (closeButton) closeButton.focus();
  }

  triggers.forEach((trigger) => {
    const modal = document.getElementById(trigger.dataset.modal);
    if (!modal) return;

    trigger.addEventListener('click', () => open(modal, trigger));

    // The backdrop and the × button both carry data-modal-close.
    modal.querySelectorAll('[data-modal-close]').forEach((control) => {
      control.addEventListener('click', close);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
}

/* ------------------------------------------------------------------ *
 * Film: play on hover, on focus, or on tap
 * ------------------------------------------------------------------ */
function initFilm() {
  const frame = document.getElementById('filmFrame');
  if (!frame) return;

  const video = frame.querySelector('video');
  if (!video) return;

  function play() {
    // A muted clip is allowed to start on its own, but the promise still
    // rejects if the browser declines, so it has to be handled.
    const started = video.play();
    if (started) started.catch(() => {});
    frame.classList.add('is-playing');
  }

  function pause() {
    video.pause();
    frame.classList.remove('is-playing');
  }

  function toggle() {
    if (video.paused) {
      play();
    } else {
      pause();
    }
  }

  frame.addEventListener('mouseenter', play);
  frame.addEventListener('mouseleave', pause);

  // Keyboard users get the same behaviour through focus.
  frame.addEventListener('focus', play);
  frame.addEventListener('blur', pause);

  // Touch screens have no hover state, so a tap toggles playback.
  frame.addEventListener('click', toggle);
  frame.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
    }
  });
}

/* ------------------------------------------------------------------ *
 * Finish picker: retints the order section
 * ------------------------------------------------------------------ */
function initSwatches() {
  const section = document.getElementById('order');
  const label = document.getElementById('orderFinish');
  const swatches = Array.from(document.querySelectorAll('.swatch'));

  if (!section || swatches.length === 0) return;

  function select(chosen) {
    swatches.forEach((swatch) => {
      const active = swatch === chosen;
      swatch.classList.toggle('is-active', active);
      swatch.setAttribute('aria-pressed', String(active));
    });

    // Switching one data attribute is enough: the stylesheet maps each
    // finish to its own background and halo colour, so no colour value
    // is ever written from here.
    section.dataset.finish = chosen.dataset.finish;
    if (label) label.textContent = chosen.dataset.name;
  }

  swatches.forEach((swatch) => {
    swatch.addEventListener('click', () => select(swatch));
  });
}

/* ------------------------------------------------------------------ */
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initCarousel();
  initModals();
  initFilm();
  initSwatches();
});
