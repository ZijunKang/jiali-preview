const contact = document.querySelector('.contact');
const cursor = document.querySelector('.character-cursor');
const cursorTrail = document.querySelector('.cursor-trail');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const moveChalk = setupHandwriting();

let pointer = null;
let pointerFrame = 0;
let trailOrigin = null;
let activeCharacter = null;
let charactersPrepared = false;

if (matchMedia('(any-pointer: fine)').matches) prepareCharacters();

reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) cursorTrail.replaceChildren();
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
  moveChalk(null);
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
  cursor.hidden = false;
  cursor.toggleAttribute('data-over-text', Boolean(character));
  document.body.classList.add('has-character-cursor');
  cursor.style.setProperty('--cursor-x', `${x}px`);
  cursor.style.setProperty('--cursor-y', `${y}px`);
  setActiveCharacter(character ?? null);
  drawCursorTrail(position);
  moveChalk(position);
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
      { transform: `translate3d(${x}px, ${y}px, 0)`, opacity: .52 },
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
}

function setupHandwriting() {
  const wrapper = document.querySelector('.handwriting');
  const image = wrapper.querySelector('img');
  const canvas = wrapper.querySelector('canvas');
  const context = canvas.getContext('2d');
  if (!context) return () => {};

  const padding = 12;
  const sourceWidth = Number(image.getAttribute('width'));
  const sourceHeight = Number(image.getAttribute('height'));
  const artWidth = sourceWidth + padding * 2;
  const artHeight = sourceHeight + padding * 2;
  let particles = [];
  let frame = 0;
  let brush = null;
  let previousTime = 0;
  let restingInk = null;

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
    const rect = wrapper.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.max(1, Math.round(rect.height * scale));
    paint(null, true);
    restingInk = context.getImageData(0, 0, canvas.width, canvas.height);
    if (brush || frame) paint();
  }

  function readSource() {
    if (!image.naturalWidth) return;
    const source = document.createElement('canvas');
    source.width = sourceWidth;
    source.height = sourceHeight;
    const sourceContext = source.getContext('2d');
    if (!sourceContext) return;
    sourceContext.drawImage(image, 0, 0, source.width, source.height);
    const pixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
    particles = sampleChalk(pixels, source.width, source.height, padding);
    if (!particles.length) return;

    sizeCanvas();
    wrapper.setAttribute('data-rendered', '');
    new ResizeObserver(sizeCanvas).observe(wrapper);
  }

  if (image.complete) readSource();
  else image.addEventListener('load', readSource, { once: true });

  function tick(now) {
    const elapsed = Math.min(48, Math.max(1, now - previousTime));
    previousTime = now;
    const approach = 1 - Math.exp(-elapsed / 70);
    const settle = 1 - Math.exp(-elapsed / 125);
    const radiusSquared = brush ? brush.radius ** 2 : 0;
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
      if (!brush && !moving) context.putImageData(restingInk, 0, 0);
      else paint(dirty);
    }
    frame = moving ? requestAnimationFrame(tick) : 0;
  }

  function moveBrush(position) {
    if (reducedMotion.matches || !particles.length) return;
    const rect = wrapper.getBoundingClientRect();
    const inside = position && position.x >= rect.left && position.x <= rect.right && position.y >= rect.top && position.y <= rect.bottom;
    if (!inside && !brush) return;

    brush = inside ? {
      x: (position.x - rect.left) * artWidth / rect.width,
      y: (position.y - rect.top) * artHeight / rect.height,
      radius: Math.min(26, rect.width * .065) * artWidth / rect.width,
    } : null;
    if (!frame) {
      previousTime = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }

  reducedMotion.addEventListener('change', () => {
    if (!reducedMotion.matches) return;
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

function sampleChalk(pixels, width, height, padding) {
  const particles = [];
  let seed = 31;

  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const index = (y * width + x) * 4;
      const light = pixels[index] * pixels[index + 3] / 255;
      if (light < 34) continue;

      particles.push({
        x: x + padding + (random() - .5) * .7,
        y: y + padding + (random() - .5) * .7,
        size: 1.6 + random() * .9,
        opacity: Math.min(1, ((light - 34) / 103) ** .69),
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
