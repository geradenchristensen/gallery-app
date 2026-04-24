/**
 * @jest-environment jsdom
 *
 * Tests that actually load script.js and exercise the real DOMContentLoaded
 * handler + all other module-level code.
 *
 * Architecture
 * ------------
 * setup.js `beforeEach` runs `document.body.innerHTML = ''` before every test.
 * So we MUST call buildFullDOM() + loadScript() in each test's beforeEach.
 *
 * But script.js registers a DOMContentLoaded listener on `document` (which
 * persists for the entire test file). Calling loadScript() N times accumulates
 * N DOMContentLoaded handlers. When DOMContentLoaded fires in the Nth test,
 * all N handlers execute and all N try to attach click/scroll/etc. listeners
 * to the CURRENT DOM elements — resulting in double/triple/... invocations.
 *
 * Fix: track the previously registered DOMContentLoaded handler in a module-
 * level variable and remove it before registering the new one.
 */

// ---------------------------------------------------------------------------
// Track registered document-level handlers so we can remove them before each
// loadScript() call, preventing accumulation across tests.
// ---------------------------------------------------------------------------
let _domReadyHandler = null;
const _documentKeydownHandlers = [];

function mockIntersectionObserver() {
  global.IntersectionObserver = jest.fn().mockImplementation((callback) => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
    _trigger: (entries) => callback(entries),
  }));
}

function buildFullDOM() {
  document.head.innerHTML = '';
  document.body.innerHTML = `
    <nav class="navbar">
      <div class="nav-container">
        <div class="nav-logo"><h1>Peak Moments</h1></div>
        <ul class="nav-menu">
          <li class="nav-item"><a href="#home"    class="nav-link">Home</a></li>
          <li class="nav-item"><a href="#gallery" class="nav-link">Gallery</a></li>
          <li class="nav-item"><a href="#about"   class="nav-link">About</a></li>
          <li class="nav-item"><a href="#contact" class="nav-link">Contact</a></li>
        </ul>
        <div class="hamburger">
          <span class="bar"></span><span class="bar"></span><span class="bar"></span>
        </div>
      </div>
    </nav>

    <section id="home" class="hero">
      <div class="hero-content">
        <h1>Capturing the Summit</h1>
        <a href="#gallery" class="cta-button">Explore My Work</a>
      </div>
    </section>

    <section id="featured">
      <div class="featured-item">Featured 1</div>
      <div class="featured-item">Featured 2</div>
    </section>

    <section id="gallery" class="gallery">
      <h2 class="section-title">Gallery</h2>
      <div class="gallery-filters">
        <button class="filter-btn active" data-filter="all">All</button>
        <button class="filter-btn" data-filter="peaks">Peaks</button>
        <button class="filter-btn" data-filter="climbing">Climbing</button>
        <button class="filter-btn" data-filter="landscape">Landscape</button>
      </div>
      <div class="gallery-grid">
        <div class="gallery-item" data-category="peaks">
          <img src="peak1.jpg" alt="Mountain Peak 1">
        </div>
        <div class="gallery-item" data-category="climbing">
          <img src="climb1.jpg" alt="Climbing Photo 1">
        </div>
        <div class="gallery-item" data-category="landscape">
          <img src="landscape1.jpg" alt="Landscape Photo 1">
        </div>
        <div class="gallery-item" data-category="peaks">
          <img src="peak2.jpg" alt="Mountain Peak 2">
        </div>
      </div>
    </section>

    <section id="about" class="about">
      <h2 class="section-title">About</h2>
      <div class="about-content">
        <span class="stat-number">150</span>
        <span class="stat-number">50</span>
        <span class="stat-number">1000</span>
      </div>
    </section>

    <section id="contact" class="contact">
      <h2 class="section-title">Contact</h2>
      <div class="contact-content">
        <form class="contact-form">
          <div class="form-group">
            <label for="name">Name</label>
            <input type="text" id="name" name="name" required>
          </div>
          <div class="form-group">
            <label for="email">Email</label>
            <input type="email" id="email" name="email" required>
          </div>
          <div class="form-group">
            <label for="message">Message</label>
            <textarea id="message" name="message" required></textarea>
          </div>
          <button type="submit" class="submit-btn">Send Message</button>
        </form>
      </div>
    </section>

    <img class="lazy" data-src="lazy1.jpg" alt="Lazy image 1">
    <img class="lazy" data-src="lazy2.jpg" alt="Lazy image 2">
  `;
}

// Install a persistent addEventListener interceptor on `document` for the
// lifetime of this test file. This lets us track all DOMContentLoaded and
// keydown registrations so we can remove them before the next loadScript(),
// preventing handler accumulation across tests.
// (Direct property assignment is NOT affected by jest's restoreMocks:true.)
const _nativeAdd = document.addEventListener.bind(document);

document.addEventListener = function (type, handler, opts) {
  if (type === 'DOMContentLoaded' && !_domReadyHandler) {
    _domReadyHandler = handler;
  } else if (type === 'keydown') {
    _documentKeydownHandlers.push(handler);
  }
  _nativeAdd(type, handler, opts);
};

function loadScript() {
  // Remove the previous DOMContentLoaded handler
  if (_domReadyHandler) {
    document.removeEventListener('DOMContentLoaded', _domReadyHandler);
    _domReadyHandler = null;
  }

  // Remove accumulated keydown handlers (from previous gallery item clicks)
  while (_documentKeydownHandlers.length) {
    document.removeEventListener('keydown', _documentKeydownHandlers.pop());
  }

  jest.resetModules();
  require('../script.js');

  document.dispatchEvent(new Event('DOMContentLoaded'));
}

// ---------------------------------------------------------------------------
// Style injection (module-level code — runs immediately when script is required)
// ---------------------------------------------------------------------------
describe('Style injection (module-level)', () => {
  beforeEach(() => {
    mockIntersectionObserver();
    buildFullDOM();
    loadScript();
  });

  test('injects a <style> element into <head> with lightbox CSS', () => {
    const text = Array.from(document.head.querySelectorAll('style')).map(s => s.textContent).join('');
    expect(document.head.querySelectorAll('style').length).toBeGreaterThan(0);
    expect(text).toContain('.lightbox');
    expect(text).toContain('.scroll-progress');
    expect(text).toContain('@keyframes fadeIn');
  });

  test('injected styles contain lazy-load CSS', () => {
    const text = Array.from(document.head.querySelectorAll('style')).map(s => s.textContent).join('');
    expect(text).toContain('.lazy');
  });

  test('injected styles contain .lightbox-close rules', () => {
    const text = Array.from(document.head.querySelectorAll('style')).map(s => s.textContent).join('');
    expect(text).toContain('.lightbox-close');
  });

  test('injected styles contain .lightbox-content rules', () => {
    const text = Array.from(document.head.querySelectorAll('style')).map(s => s.textContent).join('');
    expect(text).toContain('.lightbox-content');
  });

  test('injected styles contain .lightbox-caption rules', () => {
    const text = Array.from(document.head.querySelectorAll('style')).map(s => s.textContent).join('');
    expect(text).toContain('.lightbox-caption');
  });
});

// ---------------------------------------------------------------------------
// Scroll progress indicator
// ---------------------------------------------------------------------------
describe('Scroll progress indicator', () => {
  beforeEach(() => {
    mockIntersectionObserver();
    buildFullDOM();
    loadScript();
  });

  test('appends a .scroll-progress div to <body>', () => {
    expect(document.querySelector('.scroll-progress')).not.toBeNull();
  });

  test('scroll event updates scroll progress to 50%', () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 2000, writable: true, configurable: true });
    window.innerHeight  = 1000;
    window.pageYOffset  = 500;
    window.dispatchEvent(new Event('scroll'));
    expect(document.querySelector('.scroll-progress').style.width).toBe('50%');
  });

  test('scroll progress is 0% at the top', () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 2000, writable: true, configurable: true });
    window.innerHeight  = 1000;
    window.pageYOffset  = 0;
    window.dispatchEvent(new Event('scroll'));
    expect(document.querySelector('.scroll-progress').style.width).toBe('0%');
  });

  test('scroll progress is 100% at the bottom', () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 2000, writable: true, configurable: true });
    window.innerHeight  = 1000;
    window.pageYOffset  = 1000;
    window.dispatchEvent(new Event('scroll'));
    expect(document.querySelector('.scroll-progress').style.width).toBe('100%');
  });
});

// ---------------------------------------------------------------------------
// Hamburger / mobile menu
// ---------------------------------------------------------------------------
describe('Hamburger menu – real event listener', () => {
  beforeEach(() => {
    mockIntersectionObserver();
    buildFullDOM();
    loadScript();
  });

  test('clicking hamburger toggles "active" on hamburger and nav-menu', () => {
    const hamburger = document.querySelector('.hamburger');
    const navMenu   = document.querySelector('.nav-menu');

    hamburger.click();
    expect(hamburger.classList.contains('active')).toBe(true);
    expect(navMenu.classList.contains('active')).toBe(true);

    hamburger.click();
    expect(hamburger.classList.contains('active')).toBe(false);
    expect(navMenu.classList.contains('active')).toBe(false);
  });

  test('clicking a nav-link closes the mobile menu', () => {
    const hamburger = document.querySelector('.hamburger');
    const navMenu   = document.querySelector('.nav-menu');

    hamburger.click(); // open
    expect(hamburger.classList.contains('active')).toBe(true);

    document.querySelector('.nav-link').click(); // close
    expect(hamburger.classList.contains('active')).toBe(false);
    expect(navMenu.classList.contains('active')).toBe(false);
  });

  test('each nav-link click closes the mobile menu', () => {
    const hamburger = document.querySelector('.hamburger');
    const navMenu   = document.querySelector('.nav-menu');

    document.querySelectorAll('.nav-link').forEach(link => {
      hamburger.classList.add('active');
      navMenu.classList.add('active');
      link.click();
      expect(hamburger.classList.contains('active')).toBe(false);
      expect(navMenu.classList.contains('active')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Navbar scroll effect
// ---------------------------------------------------------------------------
describe('Navbar scroll effect – real event listener', () => {
  beforeEach(() => {
    mockIntersectionObserver();
    buildFullDOM();
    loadScript();
  });

  test('navbar background changes when scrolled past 100 px', () => {
    window.scrollY = 150;
    window.dispatchEvent(new Event('scroll'));
    const navbar = document.querySelector('.navbar');
    expect(navbar.style.background).toBe('rgba(255, 255, 255, 0.98)');
    expect(navbar.style.boxShadow).toBe('0 2px 20px rgba(0,0,0,0.1)');
  });

  test('navbar background resets when scrolled below 100 px', () => {
    window.scrollY = 150;
    window.dispatchEvent(new Event('scroll'));
    window.scrollY = 50;
    window.dispatchEvent(new Event('scroll'));
    const navbar = document.querySelector('.navbar');
    expect(navbar.style.background).toBe('rgba(255, 255, 255, 0.95)');
    expect(navbar.style.boxShadow).toBe('none');
  });

  test('navbar style is semi-transparent at scrollY = 0', () => {
    window.scrollY = 0;
    window.dispatchEvent(new Event('scroll'));
    expect(document.querySelector('.navbar').style.background).toBe('rgba(255, 255, 255, 0.95)');
  });

  test('navbar changes at scrollY = 101 (just over threshold)', () => {
    window.scrollY = 101;
    window.dispatchEvent(new Event('scroll'));
    expect(document.querySelector('.navbar').style.background).toBe('rgba(255, 255, 255, 0.98)');
  });
});

// ---------------------------------------------------------------------------
// Parallax scroll effect
// ---------------------------------------------------------------------------
describe('Parallax scroll effect – real event listener', () => {
  beforeEach(() => {
    mockIntersectionObserver();
    buildFullDOM();
    loadScript();
  });

  test('hero transform is translateY(-50px) at scrollY=100', () => {
    window.pageYOffset = 100;
    window.dispatchEvent(new Event('scroll'));
    expect(document.querySelector('.hero').style.transform).toBe('translateY(-50px)');
  });

  test('hero transform is translateY(0px) at scrollY=0', () => {
    window.pageYOffset = 0;
    window.dispatchEvent(new Event('scroll'));
    expect(document.querySelector('.hero').style.transform).toBe('translateY(0px)');
  });

  test('hero parallax rate is -0.5 × scrollY', () => {
    window.pageYOffset = 300;
    window.dispatchEvent(new Event('scroll'));
    expect(document.querySelector('.hero').style.transform).toBe('translateY(-150px)');
  });
});

// ---------------------------------------------------------------------------
// Gallery filtering (including setTimeout hide path)
// ---------------------------------------------------------------------------
describe('Gallery filtering – real event listener', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockIntersectionObserver();
    buildFullDOM();
    loadScript();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('"peaks" filter makes only peaks items visible immediately', () => {
    document.querySelector('[data-filter="peaks"]').click();

    document.querySelectorAll('[data-category="peaks"]').forEach(item => {
      expect(item.classList.contains('show')).toBe(true);
      expect(item.style.display).toBe('block');
    });
    document.querySelectorAll('[data-category]:not([data-category="peaks"])').forEach(item => {
      expect(item.classList.contains('hide')).toBe(true);
    });
  });

  test('hidden items get display:none after 300 ms', () => {
    document.querySelector('[data-filter="peaks"]').click();
    jest.advanceTimersByTime(300);

    document.querySelectorAll('[data-category]:not([data-category="peaks"])').forEach(item => {
      expect(item.style.display).toBe('none');
    });
  });

  test('"all" filter shows every gallery item', () => {
    document.querySelector('[data-filter="peaks"]').click();
    jest.advanceTimersByTime(300);
    document.querySelector('[data-filter="all"]').click();

    document.querySelectorAll('.gallery-item').forEach(item => {
      expect(item.classList.contains('show')).toBe(true);
      expect(item.style.display).toBe('block');
    });
  });

  test('clicking a filter sets it as "active" and deactivates others', () => {
    const allBtn   = document.querySelector('[data-filter="all"]');
    const peaksBtn = document.querySelector('[data-filter="peaks"]');

    expect(allBtn.classList.contains('active')).toBe(true);
    peaksBtn.click();
    expect(allBtn.classList.contains('active')).toBe(false);
    expect(peaksBtn.classList.contains('active')).toBe(true);
  });

  test('"climbing" filter shows only climbing items', () => {
    document.querySelector('[data-filter="climbing"]').click();

    document.querySelectorAll('[data-category="climbing"]').forEach(item => {
      expect(item.style.display).toBe('block');
    });
    document.querySelectorAll('[data-category]:not([data-category="climbing"])').forEach(item => {
      expect(item.classList.contains('hide')).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Smooth scrolling anchor links
// ---------------------------------------------------------------------------
describe('Smooth scroll anchor links – real event listener', () => {
  beforeEach(() => {
    mockIntersectionObserver();
    buildFullDOM();
    loadScript();
  });

  test('anchor link calls window.scrollTo with smooth behavior', () => {
    const gallerySection = document.querySelector('#gallery');
    Object.defineProperty(gallerySection, 'offsetTop', { value: 600, writable: true, configurable: true });

    document.querySelector('a[href="#gallery"]').click();

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 520, behavior: 'smooth' });
  });

  test('anchor click calls scrollTo accounting for 80 px navbar offset', () => {
    const aboutSection = document.querySelector('#about');
    Object.defineProperty(aboutSection, 'offsetTop', { value: 1000, writable: true, configurable: true });

    document.querySelector('a[href="#about"]').click();

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 920, behavior: 'smooth' });
  });

  test('anchor click prevents default browser navigation', () => {
    let prevented = false;
    const link = document.querySelector('a[href="#home"]');
    // Use bubble phase (false) so our listener fires AFTER the script's handler
    // has already called e.preventDefault().
    link.addEventListener('click', e => { prevented = e.defaultPrevented; }, false);
    link.click();
    expect(prevented).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Contact form submission
// ---------------------------------------------------------------------------
describe('Contact form submission – real event listener', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockIntersectionObserver();
    buildFullDOM();
    loadScript();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('submit disables button and changes text to "Sending..."', () => {
    const form      = document.querySelector('.contact-form');
    const submitBtn = document.querySelector('.submit-btn');

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(submitBtn.textContent).toBe('Sending...');
    expect(submitBtn.disabled).toBe(true);
  });

  test('after 2 s alert fires, form resets, button is re-enabled', () => {
    const form      = document.querySelector('.contact-form');
    const nameInput = document.querySelector('#name');
    const submitBtn = document.querySelector('.submit-btn');

    nameInput.value = 'Tester';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    jest.advanceTimersByTime(2000);

    expect(global.alert).toHaveBeenCalledWith(
      "Thank you for your message! I'll get back to you soon."
    );
    expect(nameInput.value).toBe('');
    expect(submitBtn.textContent).toBe('Send Message');
    expect(submitBtn.disabled).toBe(false);
  });

  test('form submit prevents default browser action', () => {
    const form = document.querySelector('.contact-form');
    let prevented = false;
    // Bubble phase so our listener fires AFTER the script's handler has called
    // e.preventDefault() on the submit event.
    form.addEventListener('submit', e => { prevented = e.defaultPrevented; }, false);
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(prevented).toBe(true);
  });

  test('button text is restored to original after submission', () => {
    const form      = document.querySelector('.contact-form');
    const submitBtn = document.querySelector('.submit-btn');
    const original  = submitBtn.textContent;

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    jest.advanceTimersByTime(2000);

    expect(submitBtn.textContent).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// Lightbox – creation and structure
// ---------------------------------------------------------------------------
describe('Lightbox – creation and structure', () => {
  beforeEach(() => {
    mockIntersectionObserver();
    buildFullDOM();
    loadScript();
  });

  afterEach(() => {
    const lb = document.querySelector('.lightbox');
    if (lb && document.body.contains(lb)) {
      document.body.removeChild(lb);
      document.body.style.overflow = '';
    }
  });

  test('clicking a gallery item creates a .lightbox element', () => {
    document.querySelector('.gallery-item').click();
    expect(document.querySelector('.lightbox')).not.toBeNull();
  });

  test('lightbox image alt matches the gallery item image', () => {
    const img = document.querySelector('.gallery-item img');
    document.querySelector('.gallery-item').click();
    expect(document.querySelector('.lightbox img').alt).toBe(img.alt);
  });

  test('lightbox image src matches the gallery item image', () => {
    document.querySelector('.gallery-item').click();
    expect(document.querySelector('.lightbox img').src).toContain('peak1.jpg');
  });

  test('opening lightbox sets body overflow to hidden', () => {
    document.querySelector('.gallery-item').click();
    expect(document.body.style.overflow).toBe('hidden');
  });

  test('lightbox contains a .lightbox-close button', () => {
    document.querySelector('.gallery-item').click();
    expect(document.querySelector('.lightbox .lightbox-close')).not.toBeNull();
  });

  test('lightbox caption matches the gallery image alt', () => {
    const img = document.querySelector('.gallery-item img');
    document.querySelector('.gallery-item').click();
    expect(document.querySelector('.lightbox .lightbox-caption').textContent).toBe(img.alt);
  });
});

// ---------------------------------------------------------------------------
// Lightbox – close via close button
// ---------------------------------------------------------------------------
describe('Lightbox – close via close button', () => {
  beforeEach(() => {
    mockIntersectionObserver();
    buildFullDOM();
    loadScript();
    document.querySelector('.gallery-item').click(); // open lightbox
  });

  afterEach(() => {
    const lb = document.querySelector('.lightbox');
    if (lb && document.body.contains(lb)) {
      document.body.removeChild(lb);
      document.body.style.overflow = '';
    }
  });

  test('clicking the close button removes the lightbox', () => {
    document.querySelector('.lightbox-close').click();
    expect(document.querySelector('.lightbox')).toBeNull();
  });

  test('clicking the close button restores body overflow to auto', () => {
    document.querySelector('.lightbox-close').click();
    expect(document.body.style.overflow).toBe('auto');
  });
});

// ---------------------------------------------------------------------------
// Lightbox – close via Escape key
// The keydown handler is attached to `document` inside script.js and persists
// as long as the lightbox closure has a reference to the lightbox node. Since
// loadScript() removes the old DOMContentLoaded handler, only ONE set of
// event listeners is active per test. The keydown handler created by each
// gallery item click call remains on `document`, but only the most recent
// lightbox reference is valid (older lightboxes were already removed).
// ---------------------------------------------------------------------------
describe('Lightbox – close via Escape key', () => {
  beforeEach(() => {
    mockIntersectionObserver();
    buildFullDOM();
    loadScript();
    document.querySelector('.gallery-item').click(); // open lightbox
  });

  afterEach(() => {
    const lb = document.querySelector('.lightbox');
    if (lb && document.body.contains(lb)) {
      document.body.removeChild(lb);
      document.body.style.overflow = '';
    }
  });

  test('pressing Escape key removes the lightbox', () => {
    expect(document.querySelector('.lightbox')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.lightbox')).toBeNull();
    expect(document.body.style.overflow).toBe('auto');
  });

  test('pressing non-Escape key does NOT close the lightbox', () => {
    expect(document.querySelector('.lightbox')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.querySelector('.lightbox')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Lightbox – close via backdrop click
// ---------------------------------------------------------------------------
describe('Lightbox – close via backdrop click', () => {
  beforeEach(() => {
    mockIntersectionObserver();
    buildFullDOM();
    loadScript();
    document.querySelector('.gallery-item').click(); // open lightbox
  });

  afterEach(() => {
    const lb = document.querySelector('.lightbox');
    if (lb && document.body.contains(lb)) {
      document.body.removeChild(lb);
      document.body.style.overflow = '';
    }
  });

  test('clicking the lightbox element itself (backdrop) closes it', () => {
    // script.js: lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); })
    // lightbox.click() sets e.target = lightbox in jsdom, satisfying the guard.
    const lightbox = document.querySelector('.lightbox');
    lightbox.click();
    expect(document.querySelector('.lightbox')).toBeNull();
    expect(document.body.style.overflow).toBe('auto');
  });

  test('clicking a child element does NOT close the lightbox', () => {
    // e.target is the child, not lightbox → guard fails → no close
    const content = document.querySelector('.lightbox-content');
    content.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelector('.lightbox')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Lazy image loading (IntersectionObserver on img[data-src])
// ---------------------------------------------------------------------------
describe('Lazy image loading – IntersectionObserver', () => {
  let imageObserverCallback;
  let imageObserverInstance;

  beforeEach(() => {
    mockIntersectionObserver();
    buildFullDOM();
    loadScript();

    // script.js creates IntersectionObservers in this order in DOMContentLoaded:
    //   0: animation observer, 1: statsObserver, 2: imageObserver
    const calls = global.IntersectionObserver.mock.calls;
    imageObserverCallback = calls[2][0];
    imageObserverInstance = global.IntersectionObserver.mock.results[2].value;
  });

  test('image src is set from data-src when intersecting', () => {
    const lazyImg = document.querySelector('img[data-src]');
    imageObserverCallback([{ isIntersecting: true, target: lazyImg }]);
    expect(lazyImg.src).toContain('lazy1.jpg');
  });

  test('loading a lazy image removes the "lazy" class', () => {
    const lazyImg = document.querySelector('img[data-src]');
    imageObserverCallback([{ isIntersecting: true, target: lazyImg }]);
    expect(lazyImg.classList.contains('lazy')).toBe(false);
  });

  test('lazy image is unobserved after loading', () => {
    const lazyImg = document.querySelector('img[data-src]');
    imageObserverCallback([{ isIntersecting: true, target: lazyImg }]);
    expect(imageObserverInstance.unobserve).toHaveBeenCalledWith(lazyImg);
  });

  test('non-intersecting lazy image keeps placeholder src', () => {
    const lazyImg = document.querySelector('img[data-src]');
    imageObserverCallback([{ isIntersecting: false, target: lazyImg }]);
    expect(lazyImg.getAttribute('src')).toBeFalsy();
    expect(lazyImg.classList.contains('lazy')).toBe(true);
  });

  test('second lazy image loads when it enters the viewport', () => {
    const second = document.querySelectorAll('img[data-src]')[1];
    imageObserverCallback([{ isIntersecting: true, target: second }]);
    expect(second.src).toContain('lazy2.jpg');
  });
});

// ---------------------------------------------------------------------------
// Intersection Observer animation
// ---------------------------------------------------------------------------
describe('Intersection Observer animation – real setup', () => {
  let animationObserverCallback;

  beforeEach(() => {
    mockIntersectionObserver();
    buildFullDOM();
    loadScript();
    animationObserverCallback = global.IntersectionObserver.mock.calls[0][0];
  });

  test('animated elements start with opacity:0', () => {
    document.querySelectorAll('.featured-item, .gallery-item, .about-content, .contact-content').forEach(el => {
      expect(el.style.opacity).toBe('0');
    });
  });

  test('animated elements start with translateY(50px)', () => {
    document.querySelectorAll('.featured-item, .gallery-item, .about-content, .contact-content').forEach(el => {
      expect(el.style.transform).toBe('translateY(50px)');
    });
  });

  test('element becomes visible when isIntersecting=true', () => {
    const target = document.querySelector('.featured-item');
    animationObserverCallback([{ isIntersecting: true, target }]);
    expect(target.style.opacity).toBe('1');
    expect(target.style.transform).toBe('translateY(0)');
  });

  test('element stays hidden when isIntersecting=false', () => {
    const target = document.querySelector('.featured-item');
    animationObserverCallback([{ isIntersecting: false, target }]);
    expect(target.style.opacity).toBe('0');
  });

  test('section titles start with opacity:0 and translateY(30px)', () => {
    document.querySelectorAll('.section-title').forEach(t => {
      expect(t.style.opacity).toBe('0');
      expect(t.style.transform).toBe('translateY(30px)');
    });
  });

  test('section titles have 0.8s transition', () => {
    document.querySelectorAll('.section-title').forEach(t => {
      expect(t.style.transition).toBe('opacity 0.8s ease, transform 0.8s ease');
    });
  });
});

// ---------------------------------------------------------------------------
// Featured item hover effects
// ---------------------------------------------------------------------------
describe('Featured item hover effects – real event listener', () => {
  beforeEach(() => {
    mockIntersectionObserver();
    buildFullDOM();
    loadScript();
  });

  test('mouseenter sets z-index to 10', () => {
    const item = document.querySelector('.featured-item');
    item.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(item.style.zIndex).toBe('10');
  });

  test('mouseleave resets z-index to 1', () => {
    const item = document.querySelector('.featured-item');
    item.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    item.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    expect(item.style.zIndex).toBe('1');
  });

  test('all featured items respond to hover events', () => {
    document.querySelectorAll('.featured-item').forEach(item => {
      item.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      expect(item.style.zIndex).toBe('10');
      item.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      expect(item.style.zIndex).toBe('1');
    });
  });
});

// ---------------------------------------------------------------------------
// Stats counter (setInterval-based countUp)
// ---------------------------------------------------------------------------
describe('Stats counter – setInterval animation', () => {
  let statsObserverCallback;
  let statsObserverInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    mockIntersectionObserver();
    buildFullDOM();
    loadScript();
    statsObserverCallback = global.IntersectionObserver.mock.calls[1][0];
    statsObserverInstance = global.IntersectionObserver.mock.results[1].value;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('stat counter animates to target value', () => {
    const stat = document.querySelector('.stat-number');
    stat.textContent = '100';
    statsObserverCallback([{ isIntersecting: true, target: stat }]);
    jest.advanceTimersByTime(3000);
    expect(stat.textContent).toBe('100');
  });

  test('stat counter handles non-numeric suffix ("50+")', () => {
    const stat = document.querySelector('.stat-number');
    stat.textContent = '50+';
    statsObserverCallback([{ isIntersecting: true, target: stat }]);
    jest.advanceTimersByTime(3000);
    expect(stat.textContent).toBe('50');
  });

  test('statsObserver unobserves the element after counting starts', () => {
    const stat = document.querySelector('.stat-number');
    stat.textContent = '100';
    statsObserverCallback([{ isIntersecting: true, target: stat }]);
    expect(statsObserverInstance.unobserve).toHaveBeenCalledWith(stat);
  });

  test('non-intersecting entry does not start the counter', () => {
    const stat = document.querySelector('.stat-number');
    const original = stat.textContent;
    statsObserverCallback([{ isIntersecting: false, target: stat }]);
    jest.advanceTimersByTime(3000);
    expect(stat.textContent).toBe(original);
  });

  test('counter progresses through intermediate values before reaching target', () => {
    const stat = document.querySelector('.stat-number');
    stat.textContent = '100';
    statsObserverCallback([{ isIntersecting: true, target: stat }]);
    jest.advanceTimersByTime(20); // one interval tick (20 ms)
    const intermediate = parseInt(stat.textContent);
    expect(intermediate).toBeGreaterThanOrEqual(0);
    expect(intermediate).toBeLessThanOrEqual(100);
  });
});
