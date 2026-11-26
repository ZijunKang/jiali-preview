const contact = document.querySelector('.contact');
const introFocus = document.querySelector('.intro-focus');
const cursor = document.querySelector('.character-cursor');
const cursorTrail = document.querySelector('.cursor-trail');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const localParticleImages = location.protocol === 'file:' ? loadLocalParticleImages() : null;
const moveBrushes = Array.from(document.querySelectorAll('[data-particle-art]'), setupParticleBrush);

let pointer = null;
let pointerFrame = 0;
let trailOrigin = null;
let activeCharacter = null;
let charactersPrepared = false;
let focusGlyphs = [];

if (matchMedia('(any-pointer: fine)').matches) prepareCharacters();
setupThemeToggle();
setupSectionScroll();
setupHeroParallax();
setupPaperReveal();

reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) {
    cursorTrail.replaceChildren();
    moveIntroFocus(null);
  }
});

document.addEventListener('pointermove', (event) => {
  if (event.pointerType !== 'mouse') {
    if (pointer) clearPointer();
    return;
  }
  if (!charactersPrepared) prepareCharacters();
  pointer = { x: event.clientX, y: event.clientY };
  schedulePointerUpdate();
}, { passive: true });

document.addEventListener('pointerout', (event) => {
  if (!event.relatedTarget) clearPointer();
});
window.addEventListener('blur', clearPointer);
window.addEventListener('scroll', schedulePointerUpdate, { passive: true });
window.addEventListener('resize', schedulePointerUpdate, { passive: true });

document.addEventListener('pointerdown', (event) => {
  if (contact.open && !contact.contains(event.target)) contact.open = false;
});

contact.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !contact.open) return;
  contact.open = false;
  contact.querySelector('summary').focus();
});

function setupThemeToggle() {
  const root = document.documentElement;
  const button = document.querySelector('.theme-toggle');
  button.setAttribute('aria-pressed', String(root.dataset.theme === 'dark'));

  button.addEventListener('click', () => {
    const dark = root.dataset.theme !== 'dark';
    const theme = dark ? 'dark' : 'light';
    root.dataset.theme = theme;
    button.setAttribute('aria-pressed', String(dark));

    try {
      localStorage.setItem('jiali-theme', theme);
    } catch {}
  });
}

function setupSectionScroll() {
  const root = document.documentElement;
  const hero = document.querySelector('#top');
  const publications = document.querySelector('#publications');
  const enabled = matchMedia('(any-pointer: fine) and (prefers-reduced-motion: no-preference)');
  const landingTolerance = 8;
  let lastWheelAt = -Infinity;
  let lastWheelAmount = 0;
  let transition = null;

  function syncLayout() {
    root.classList.toggle('has-section-scroll', enabled.matches);
    transition = null;
  }

  enabled.addEventListener('change', syncLayout);
  syncLayout();

  window.addEventListener('wheel', (event) => {
    if (!enabled.matches || event.defaultPrevented || !event.cancelable ||
        event.ctrlKey || event.metaKey || event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

    const now = performance.now();
    const gap = now - lastWheelAt;
    const wheelAmount = Math.abs(event.deltaY) * (event.deltaMode === 0 ? 1 : 16);
    const startsGesture = gap >= 105 || wheelAmount >= Math.max(7, lastWheelAmount * 1.8);
    lastWheelAt = now;
    lastWheelAmount = wheelAmount;
    const direction = Math.sign(event.deltaY);
    const scrollY = window.scrollY;
    const publicationsOffset = parseFloat(getComputedStyle(publications).scrollMarginTop) || 0;
    const publicationsTop = Math.round(scrollY + publications.getBoundingClientRect().top - publicationsOffset);
    const heroEnd = Math.max(0, Math.round(scrollY + hero.getBoundingClientRect().bottom - root.clientHeight));

    let destination = null;
    if (transition) {
      const arriving = Math.abs(scrollY - transition.to) > landingTolerance && now - transition.startedAt < 1200;
      const sameDirection = direction === transition.direction;
      if (sameDirection && (arriving || !startsGesture)) {
        event.preventDefault();
        return;
      }
      if (!sameDirection && arriving) destination = transition.from;
      transition = null;
    }

    if (destination === null) {
      if (direction > 0 && scrollY >= heroEnd - landingTolerance && scrollY < publicationsTop - landingTolerance) {
        destination = publicationsTop;
      } else if (direction < 0 && scrollY > heroEnd + landingTolerance && scrollY <= publicationsTop + landingTolerance) {
        destination = heroEnd;
      }
    }

    if (destination === null) return;
    event.preventDefault();
    transition = { from: scrollY, to: destination, direction, startedAt: now };
    window.scrollTo({ top: destination, behavior: 'smooth' });
  }, { passive: false });
}

function setupHeroParallax() {
  const hero = document.querySelector('.hero');
  const identity = { element: hero.querySelector('.identity'), offset: 0, opacity: 1 };
  const quote = { element: hero.querySelector('.quote'), offset: 0, opacity: 1 };
  let frame = 0;

  function setMotion(item, offset, opacity) {
    if (item.offset === offset && item.opacity === opacity) return;
    item.offset = offset;
    item.opacity = opacity;

    if (offset) item.element.style.setProperty('--scroll-translate', `0 ${offset}px`);
    else item.element.style.removeProperty('--scroll-translate');

    if (opacity < 1) item.element.style.setProperty('--scroll-opacity', opacity);
    else item.element.style.removeProperty('--scroll-opacity');
  }

  function update() {
    frame = 0;
    if (reducedMotion.matches) {
      setMotion(identity, 0, 1);
      setMotion(quote, 0, 1);
      return;
    }

    const heroProgress = smoothstep(window.scrollY / hero.offsetHeight);
    setMotion(identity, 24 * heroProgress, 1);
    setMotion(quote, 54 * heroProgress, 1 - .22 * heroProgress);
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('pageshow', schedule);
  reducedMotion.addEventListener('change', schedule);
  document.fonts?.ready.then(schedule);
  update();
}

function setupPaperReveal() {
  const papers = [...document.querySelectorAll('.paper')].map((element) => ({ element, progress: null }));
  let frame = 0;

  function update() {
    frame = 0;
    if (reducedMotion.matches) return;

    const viewportBottom = document.documentElement.clientHeight;
    const progressValues = papers.map(({ element }) => {
      const { top, height } = element.getBoundingClientRect();
      const entranceDistance = Math.min(220, Math.max(144, height * .75));
      return smoothstep((viewportBottom - top) / entranceDistance).toFixed(3);
    });

    for (const [index, paper] of papers.entries()) {
      const progress = progressValues[index];
      if (paper.progress === progress) continue;
      paper.progress = progress;
      paper.element.style.setProperty('--paper-reveal', progress);
    }
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('pageshow', schedule);
  reducedMotion.addEventListener('change', schedule);
  document.fonts?.ready.then(schedule);
  update();
}

function schedulePointerUpdate() {
  if (!pointer || pointerFrame) return;
  pointerFrame = requestAnimationFrame(() => {
    pointerFrame = 0;
    if (pointer) updatePointer(pointer);
  });
}

function clearPointer() {
  pointer = null;
  trailOrigin = null;
  cursor.hidden = true;
  document.body.classList.remove('has-character-cursor');
  setActiveCharacter(null);
  moveIntroFocus(null);
  for (const moveBrush of moveBrushes) moveBrush(null);
}

function updatePointer(position) {
  const { x, y } = position;
  const [target, ...layers] = document.elementsFromPoint(x, y);
  if (!target) {
    clearPointer();
    return;
  }

  const paper = target.matches('.paper h4 a') ? target.closest('.paper') : null;
  const character = target.closest('.interactive-character') ?? (paper
    ? layers.find((element) => element.matches('.interactive-character') && paper.contains(element))
    : null);
  const overFocusPhrase = introFocus.contains(target);
  moveIntroFocus(overFocusPhrase && !reducedMotion.matches ? position : null);
  cursor.hidden = false;
  cursor.toggleAttribute('data-over-text', Boolean(character));
  document.body.classList.add('has-character-cursor');
  cursor.style.setProperty('--cursor-x', `${x}px`);
  cursor.style.setProperty('--cursor-y', `${y}px`);
  setActiveCharacter(overFocusPhrase ? null : character ?? null);
  drawCursorTrail(position);
  for (const moveBrush of moveBrushes) moveBrush(position);
}

function moveIntroFocus(position) {
  if (!position && !introFocus.hasAttribute('data-focusing')) return;

  const radius = position ? parseFloat(getComputedStyle(introFocus).fontSize) * 1.4 : 0;
  const scales = focusGlyphs.map((glyph) => {
    if (!position) return '';
    const rect = glyph.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    if (Math.abs(position.y - centerY) > glyph.offsetHeight / 2) return '';

    const centerX = rect.left + rect.width / 2;
    const strength = smoothstep(1 - Math.abs(position.x - centerX) / radius);
    return strength > .01 ? (1 + .12 * strength).toFixed(3) : '';
  });

  introFocus.toggleAttribute('data-focusing', Boolean(position));
  for (const [index, glyph] of focusGlyphs.entries()) {
    const scale = scales[index];
    if (scale === glyph.style.getPropertyValue('--focus-scale')) continue;
    if (scale) glyph.style.setProperty('--focus-scale', scale);
    else glyph.style.removeProperty('--focus-scale');
  }
}

function setActiveCharacter(character) {
  if (activeCharacter === character) return;
  activeCharacter?.removeAttribute('data-active');
  activeCharacter = character;
  activeCharacter?.setAttribute('data-active', '');
}

function drawCursorTrail(position) {
  const origin = trailOrigin;
  trailOrigin = position;
  if (!origin || reducedMotion.matches || typeof cursorTrail.animate !== 'function') return;

  const dx = position.x - origin.x;
  const dy = position.y - origin.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 2) return;

  const directionX = dx / distance;
  const directionY = dy / distance;
  const segmentLength = Math.min(distance, 50);
  const count = Math.ceil(segmentLength / 9);
  const initialOpacity = document.documentElement.dataset.theme === 'dark' ? 1 : .52;

  for (let index = 0; index < count; index++) {
    if (cursorTrail.childElementCount >= 64) cursorTrail.firstElementChild.remove();

    const distanceBehind = (index + .65) * segmentLength / count;
    const size = 1 + Math.random() * 1.5;
    const spread = (Math.random() - .5) * 5;
    const x = position.x - directionX * distanceBehind - directionY * spread - size / 2;
    const y = position.y - directionY * distanceBehind + directionX * spread - size / 2;
    const particle = document.createElement('span');
    particle.style.setProperty('--particle-size', `${size}px`);
    cursorTrail.append(particle);

    const drift = 3 + Math.random() * 6;
    const animation = particle.animate([
      { transform: `translate3d(${x}px, ${y}px, 0)`, opacity: initialOpacity },
      { transform: `translate3d(${x - directionX * drift}px, ${y - directionY * drift}px, 0) scale(.5)`, opacity: 0 },
    ], { duration: 180 + Math.random() * 70, easing: 'ease-out', fill: 'both' });
    animation.onfinish = () => particle.remove();
  }
}

function prepareCharacters() {
  charactersPrepared = true;
  const selector = 'h1, h2, h3, h4, p, li, a, summary, span, strong, small, figcaption';
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null;

  for (const element of document.querySelectorAll('h1, h2, h3, h4, a, summary')) {
    if (element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby')) continue;
    const label = element.textContent.trim().replace(/\s+/g, ' ');
    if (label) element.setAttribute('aria-label', label);
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.data.trim() && node.parentElement.matches(selector)) textNodes.push(node);
  }

  for (const node of textNodes) {
    const fragment = document.createDocumentFragment();
    for (const token of node.data.split(/(\s+)/u)) {
      if (!token) continue;
      if (!token.trim()) {
        fragment.append(token);
        continue;
      }

      const word = document.createElement('span');
      word.className = 'interactive-word';
      const graphemes = segmenter ? Array.from(segmenter.segment(token), ({ segment }) => segment) : Array.from(token);
      for (const grapheme of graphemes) {
        const character = document.createElement('span');
        character.className = 'interactive-character';
        const glyph = document.createElement('span');
        glyph.setAttribute('aria-hidden', 'true');
        glyph.textContent = grapheme;
        character.append(grapheme, glyph);
        word.append(character);
      }
      fragment.append(word);
    }
    node.replaceWith(fragment);
  }
  focusGlyphs = [...introFocus.querySelectorAll('.interactive-character')];
}

function loadLocalParticleImages() {
  return new Promise((resolve) => {
    // Classic scripts can bundle image bytes for file URLs without reading a local image through Canvas.
    const script = document.createElement('script');
    script.src = './local-particle-images.js';
    script.onload = () => resolve(window.localParticleImageSources);
    script.onerror = () => resolve(null);
    document.head.append(script);
  });
}

function setupParticleBrush(wrapper) {
  const image = wrapper.querySelector('img');
  const canvas = wrapper.querySelector('canvas');
  const context = canvas.getContext('2d');
  if (!context) return () => {};

  const isPortrait = wrapper.dataset.particleArt === 'portrait';
  const padding = isPortrait ? 0 : 64;
  const angle = (parseFloat(getComputedStyle(wrapper).getPropertyValue('--art-angle')) || 0) * Math.PI / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const samplingScale = isPortrait ? .7 : 1;
  const sourceWidth = Math.round(Number(image.getAttribute('width')) * samplingScale);
  const sourceHeight = Math.round(Number(image.getAttribute('height')) * samplingScale);
  const artWidth = sourceWidth + padding * 2;
  const artHeight = sourceHeight + padding * 2;
  let particles = [];
  let frame = 0;
  let brush = null;
  let previousTime = 0;
  let restingInk = null;
  let displayWidth = 0;
  let displayHeight = 0;
  let touchId = null;
  let releaseTimer = 0;

  function paint(dirty, atRest = false) {
    const scaleX = canvas.width / artWidth;
    const scaleY = canvas.height / artHeight;
    context.setTransform(scaleX, 0, 0, scaleY, 0, 0);

    let left = 0;
    let top = 0;
    let right = artWidth;
    let bottom = artHeight;
    if (dirty) {
      left = Math.floor((dirty.left - 1) * scaleX) / scaleX;
      top = Math.floor((dirty.top - 1) * scaleY) / scaleY;
      right = Math.ceil((dirty.right + 1) * scaleX) / scaleX;
      bottom = Math.ceil((dirty.bottom + 1) * scaleY) / scaleY;
      context.save();
      context.beginPath();
      context.rect(left, top, right - left, bottom - top);
      context.clip();
    }

    context.clearRect(left, top, right - left, bottom - top);
    context.fillStyle = '#000';

    for (const dot of particles) {
      const x = dot.x + (atRest ? 0 : dot.offsetX);
      const y = dot.y + (atRest ? 0 : dot.offsetY);
      if (x + dot.size < left || x > right || y + dot.size < top || y > bottom) continue;
      context.globalAlpha = dot.opacity * (1 - (atRest ? 0 : dot.fade));
      context.fillRect(x, y, dot.size, dot.size);
    }
    if (dirty) context.restore();
    context.globalAlpha = 1;
  }

  function sizeCanvas() {
    displayWidth = wrapper.clientWidth;
    displayHeight = wrapper.clientHeight;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(displayWidth * scale));
    canvas.height = Math.max(1, Math.round(displayHeight * scale));
    paint(null, true);
    restingInk = context.getImageData(0, 0, canvas.width, canvas.height);
    if (brush || frame) paint();
  }

  function readSource(particleImage) {
    if (!particleImage.naturalWidth) return;
    const source = document.createElement('canvas');
    source.width = artWidth;
    source.height = artHeight;
    const sourceContext = source.getContext('2d');
    if (!sourceContext) return;
    sourceContext.drawImage(particleImage, padding, padding, sourceWidth, sourceHeight);
    if (!isPortrait) drawChalkFrame(sourceContext, artWidth, artHeight);
    let pixels;
    try {
      pixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
    } catch (error) {
      if (error.name !== 'SecurityError') throw error;
      return;
    }
    particles = sampleInk(pixels, source.width, source.height, isPortrait);
    if (!particles.length) return;

    sizeCanvas();
    wrapper.setAttribute('data-rendered', '');
    new ResizeObserver(sizeCanvas).observe(wrapper);
  }

  function prepareSource(particleImage) {
    if (particleImage.complete) readSource(particleImage);
    else particleImage.addEventListener('load', () => readSource(particleImage), { once: true });
  }

  if (localParticleImages) {
    localParticleImages.then((sources) => {
      const dataUrl = sources?.[image.getAttribute('src')];
      if (!dataUrl) return;
      const embeddedImage = new Image();
      embeddedImage.src = dataUrl;
      prepareSource(embeddedImage);
    });
  } else {
    prepareSource(image);
  }

  function tick(now) {
    const elapsed = Math.min(48, Math.max(1, now - previousTime));
    previousTime = now;
    const approach = 1 - Math.exp(-elapsed / 70);
    const settle = 1 - Math.exp(-elapsed / 125);
    const radiusSquared = brush ? brush.radius ** 2 : 0;
    let brushingInk = false;
    let moving = false;
    let dirty = null;

    for (const dot of particles) {
      let offsetX = 0;
      let offsetY = 0;
      let fade = 0;
      if (brush) {
        const dx = dot.x - brush.x;
        const dy = dot.y - brush.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < radiusSquared) {
          brushingInk = true;
          const distance = Math.sqrt(distanceSquared);
          const influence = smoothstep(1 - distance / brush.radius);
          const push = brush.radius * .62 / (distance + 8);
          offsetX = (dx * push + dot.driftX) * influence;
          offsetY = (dy * push + dot.driftY) * influence;
          fade = influence * .87;
        }
      }

      const rate = fade > dot.fade ? approach : settle;
      const oldX = dot.offsetX;
      const oldY = dot.offsetY;
      const oldFade = dot.fade;
      dot.offsetX = approachValue(dot.offsetX, offsetX, rate, .12);
      dot.offsetY = approachValue(dot.offsetY, offsetY, rate, .12);
      dot.fade = approachValue(dot.fade, fade, rate, .006);

      if (oldX !== dot.offsetX || oldY !== dot.offsetY || oldFade !== dot.fade) {
        dirty ??= { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
        dirty.left = Math.min(dirty.left, dot.x + Math.min(oldX, dot.offsetX));
        dirty.top = Math.min(dirty.top, dot.y + Math.min(oldY, dot.offsetY));
        dirty.right = Math.max(dirty.right, dot.x + Math.max(oldX, dot.offsetX) + dot.size);
        dirty.bottom = Math.max(dirty.bottom, dot.y + Math.max(oldY, dot.offsetY) + dot.size);
      }
      if (dot.offsetX !== offsetX || dot.offsetY !== offsetY || dot.fade !== fade) moving = true;
    }
    if (dirty) {
      if (!brushingInk && !moving) context.putImageData(restingInk, 0, 0);
      else paint(dirty);
    }
    frame = moving ? requestAnimationFrame(tick) : 0;
  }

  function moveBrush(position, fromTouch = false) {
    if (reducedMotion.matches || (!fromTouch && touchId !== null) || !particles.length || !displayWidth || !displayHeight) return;
    let nextBrush = null;
    if (position) {
      const rect = wrapper.getBoundingClientRect();
      const width = displayWidth;
      const height = displayHeight;
      const dx = position.x - rect.left - rect.width / 2;
      const dy = position.y - rect.top - rect.height / 2;
      const x = dx * cosine + dy * sine + width / 2;
      const y = -dx * sine + dy * cosine + height / 2;
      if (x >= 0 && x <= width && y >= 0 && y <= height) {
        const mouseRadius = Math.min(26, width * (isPortrait ? .18 : .065));
        const radius = fromTouch ? Math.min(24, width * .2) : mouseRadius;
        nextBrush = {
          x: x * artWidth / width,
          y: y * artHeight / height,
          radius: radius * artWidth / width,
        };
      }
    }
    if (!nextBrush && !brush) return;
    brush = nextBrush;
    if (!frame) {
      previousTime = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }

  wrapper.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' || !event.isPrimary || reducedMotion.matches) return;
    clearTimeout(releaseTimer);
    touchId = event.pointerId;
    moveBrush({ x: event.clientX, y: event.clientY }, true);
  });

  wrapper.addEventListener('pointermove', (event) => {
    if (event.pointerId === touchId) moveBrush({ x: event.clientX, y: event.clientY }, true);
  });

  function endTouch(event) {
    if (event.pointerId !== touchId) return;
    touchId = null;
    if (event.type === 'pointerup') {
      // Keep a quick tap visible long enough for the first few animation frames.
      releaseTimer = setTimeout(() => moveBrush(null, true), 90);
    } else {
      moveBrush(null, true);
    }
  }

  wrapper.addEventListener('pointerup', endTouch);
  wrapper.addEventListener('pointercancel', endTouch);
  wrapper.addEventListener('lostpointercapture', endTouch);

  reducedMotion.addEventListener('change', () => {
    if (!reducedMotion.matches) return;
    clearTimeout(releaseTimer);
    touchId = null;
    cancelAnimationFrame(frame);
    frame = 0;
    brush = null;
    for (const dot of particles) {
      dot.offsetX = 0;
      dot.offsetY = 0;
      dot.fade = 0;
    }
    if (restingInk) context.putImageData(restingInk, 0, 0);
  });
  return moveBrush;
}

function drawChalkFrame(context, width, height) {
  context.strokeStyle = 'rgba(255,255,255,.52)';
  context.lineWidth = 2.8;
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(14, 16);
  context.lineTo(width * .32, 12);
  context.lineTo(width - 13, 15);
  context.lineTo(width - 12, height - 14);
  context.lineTo(width * .62, height - 11);
  context.lineTo(12, height - 15);
  context.closePath();
  context.stroke();
}

function sampleInk(pixels, width, height, darkInk) {
  const particles = [];
  const spacing = 2;
  let seed = 31;

  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  for (let y = 0; y < height; y += spacing) {
    for (let x = 0; x < width; x += spacing) {
      const index = (y * width + x) * 4;
      const contrast = darkInk ? 255 - pixels[index] : pixels[index];
      const coverage = contrast * pixels[index + 3] / 255;
      if (coverage < 34) continue;

      particles.push({
        x: x + (random() - .5) * .7,
        y: y + (random() - .5) * .7,
        size: 1.6 + random() * .9,
        opacity: Math.min(1, ((coverage - 34) / 103) ** .69),
        driftX: (random() - .5) * 38,
        driftY: (random() - .5) * 27,
        offsetX: 0,
        offsetY: 0,
        fade: 0,
      });
    }
  }
  return particles;
}

function smoothstep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function approachValue(value, target, rate, tolerance) {
  return Math.abs(target - value) < tolerance ? target : value + (target - value) * rate;
}
