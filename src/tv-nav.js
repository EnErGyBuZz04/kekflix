// ─── TV Remote / D-pad Spatial Navigation ─────────────
// Arrow-key navigation for TV remotes. No mouse needed.

const FOCUSABLE = [
  '.card',
  '.btn-play',
  '.btn-info',
  '.btn-trailer',
  '.btn-load-more',
  '.genre-pill',
  '.company-pill',
  '.season-tab',
  '.episode-card',
  '.navbar-nav a',
  '.modal-close',
  '.trailer-play-overlay',
  '.player-focus-target',
].join(', ');

let currentFocus = null;
let tvMode = false;
let iframeFocused = false;

function getActiveContainer() {
  const modal = document.querySelector('.modal-overlay.active');
  return modal || document;
}

function getFocusables() {
  const container = getActiveContainer();
  return [...container.querySelectorAll(FOCUSABLE)].filter((el) => {
    if (el.offsetParent === null && !el.closest('.navbar')) return false;
    if (el.closest('.hidden')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

function getRect(el) {
  return el.getBoundingClientRect();
}

// For cards in a slider: use DOM order (next/prev sibling), not spatial
function getSliderSibling(el, direction) {
  const slider = el.closest('.row-slider');
  if (!slider) return null;
  const cards = [...slider.querySelectorAll('.card')];
  const idx = cards.indexOf(el);
  if (idx === -1) return null;
  if (direction === 'right' && idx < cards.length - 1) return cards[idx + 1];
  if (direction === 'left' && idx > 0) return cards[idx - 1];
  return null; // at the edge → do nothing
}

function findNext(from, direction) {
  // If in a slider and going left/right → use DOM siblings only
  const slider = from.closest('.row-slider');
  if (slider && (direction === 'left' || direction === 'right')) {
    return getSliderSibling(from, direction);
  }

  // Grid navigation: when pressing UP from the FIRST DOM row of grid → jump to pills
  const grid = from.closest('.genre-results-grid');
  if (grid && direction === 'up') {
    const firstCard = grid.querySelector('.card');
    // Only if we're in the actual first row (same vertical position as the first card)
    if (firstCard && Math.abs(from.offsetTop - firstCard.offsetTop) < 5) {
      const all = getFocusables();
      let best = null, bestScore = Infinity;
      const fromRect = getRect(from);
      const fcx = fromRect.left + fromRect.width / 2;
      const fcy = fromRect.top + fromRect.height / 2;
      for (const el of all) {
        if (el.closest('.genre-results-grid')) continue;
        const er = getRect(el);
        const ecy = er.top + er.height / 2;
        if (ecy < fcy - 5) {
          const dy = fcy - ecy;
          const dx = Math.abs((er.left + er.width / 2) - fcx);
          const score = dy + dx;
          if (score < bestScore) { bestScore = score; best = el; }
        }
      }
      if (best) return best;
    }
  }

  // Spatial navigation for everything else
  const all = getFocusables();
  const fr = getRect(from);
  const fcx = fr.left + fr.width / 2;
  const fcy = fr.top + fr.height / 2;

  let best = null;
  let bestScore = Infinity;

  for (const el of all) {
    if (el === from) continue;
    const er = getRect(el);
    const ecx = er.left + er.width / 2;
    const ecy = er.top + er.height / 2;

    let valid = false;
    let score = Infinity;

    switch (direction) {
      case 'right': {
        if (ecx > fcx + 5) {
          const dx = ecx - fcx;
          const dy = Math.abs(ecy - fcy);
          score = dx + dy * 5;
          valid = true;
        }
        break;
      }
      case 'left': {
        if (ecx < fcx - 5) {
          const dx = fcx - ecx;
          const dy = Math.abs(ecy - fcy);
          score = dx + dy * 5;
          valid = true;
        }
        break;
      }
      case 'down': {
        if (ecy > fcy + 5) {
          const dy = ecy - fcy;
          const dx = Math.abs(ecx - fcx);
          score = dy * 2 + dx;
          valid = true;
        }
        break;
      }
      case 'up': {
        if (ecy < fcy - 5) {
          const dy = fcy - ecy;
          const dx = Math.abs(ecx - fcx);
          score = dy * 2 + dx;
          valid = true;
        }
        break;
      }
    }

    if (valid && score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  // When moving up/down into a slider row, always land on the first card
  if (best && (direction === 'up' || direction === 'down')) {
    const targetSlider = best.closest('.row-slider');
    if (targetSlider) {
      const firstCard = targetSlider.querySelector('.card');
      if (firstCard) return firstCard;
    }
  }

  return best;
}

function setFocus(el) {
  // Reset previous focus
  if (currentFocus) {
    currentFocus.classList.remove('tv-focused');
    currentFocus.style.removeProperty('--tv-origin');
  }
  currentFocus = el;
  if (el) {
    el.classList.add('tv-focused');
    el.focus({ preventScroll: true });

    // Set smart transform-origin for cards based on viewport position
    if (el.classList.contains('card')) {
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      if (rect.left < vw * 0.08) el.style.setProperty('--tv-origin', 'left center');
      else if (rect.right > vw * 0.92) el.style.setProperty('--tv-origin', 'right center');
      else el.style.setProperty('--tv-origin', 'center center');
    }

    // 1) Horizontal scroll
    const slider = el.closest('.row-slider');
    if (slider) {
      const sliderRect = slider.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const pad = 40;

      if (elRect.right > sliderRect.right - pad) {
        slider.scrollBy({ left: elRect.right - sliderRect.right + pad + elRect.width, behavior: 'smooth' });
      } else if (elRect.left < sliderRect.left + pad) {
        slider.scrollBy({ left: elRect.left - sliderRect.left - pad - elRect.width, behavior: 'smooth' });
      }
    }

    // 2) Vertical scroll: modal or page
    const modal = document.querySelector('.modal-overlay.active');
    const r = el.getBoundingClientRect();
    const navH = modal ? 0 : 80;

    if (modal) {
      if (r.top < 20) {
        modal.scrollBy({ top: r.top - 40, behavior: 'smooth' });
      } else if (r.bottom > window.innerHeight - 20) {
        modal.scrollBy({ top: r.bottom - window.innerHeight + 40, behavior: 'smooth' });
      }
    } else {
      if (r.top < navH) {
        window.scrollBy({ top: r.top - navH - 20, behavior: 'smooth' });
      } else if (r.bottom > window.innerHeight - 20) {
        window.scrollBy({ top: r.bottom - window.innerHeight + 40, behavior: 'smooth' });
      }
    }
  }
}

function enableTvMode() {
  if (!tvMode) {
    tvMode = true;
    document.body.classList.add('tv-mode');
  }
}

function disableTvMode() {
  if (tvMode) {
    tvMode = false;
    document.body.classList.remove('tv-mode');
    if (currentFocus) {
      currentFocus.classList.remove('tv-focused');
      currentFocus.style.removeProperty('--tv-origin');
      currentFocus = null;
    }
  }
}

function enterIframeFocus(target) {
  const container = target.closest('.player-container') || target.parentElement;
  const iframe = container?.querySelector('iframe');
  if (iframe) {
    iframeFocused = true;
    iframe.focus();
    // Visual indicator
    target.classList.add('player-active');
  }
}

function exitIframeFocus() {
  iframeFocused = false;
  document.querySelectorAll('.player-active').forEach(el => el.classList.remove('player-active'));
  const iframe = document.querySelector('iframe:focus');
  if (iframe) iframe.blur();
  // Return focus to player target
  enableTvMode();
  const target = document.querySelector('.player-focus-target');
  if (target) setFocus(target);
}

function handleBack() {
  // If iframe focused, exit it first
  if (iframeFocused) {
    exitIframeFocus();
    return true;
  }
  // If cinema player is open, close it and return to modal
  const cinema = document.querySelector('.cinema-overlay');
  if (cinema) {
    document.dispatchEvent(new CustomEvent('close-player'));
    return true;
  }
  const modal = document.querySelector('.modal-overlay.active');
  if (modal) {
    document.getElementById('modal-close')?.click();
    return true;
  }
  const search = document.querySelector('.search-overlay.active');
  if (search) {
    const input = document.getElementById('search-input');
    if (input) { input.value = ''; input.dispatchEvent(new Event('input')); }
    return true;
  }
  return false;
}

export function initTvNavigation() {
  document.addEventListener('keydown', (e) => {
    const key = e.key;

    // Cinema mode: block all parent keys, only Back closes
    const cinema = document.querySelector('.cinema-overlay');
    if (cinema) {
      e.preventDefault();
      e.stopPropagation();
      if (key === 'Escape' || key === 'Backspace' || key === 'GoBack') {
        history.back();
      }
      return;
    }

    // Don't intercept input fields
    if (document.activeElement?.tagName === 'INPUT') {
      if (key === 'Escape') { document.activeElement.blur(); e.preventDefault(); }
      return;
    }

    const dirMap = {
      ArrowLeft: 'left', ArrowRight: 'right',
      ArrowUp: 'up', ArrowDown: 'down',
    };

    if (dirMap[key]) {
      e.preventDefault();
      enableTvMode();

      if (!currentFocus) {
        // Start focus on first visible element
        const first = getFocusables()[0];
        if (first) setFocus(first);
        return;
      }

      const next = findNext(currentFocus, dirMap[key]);
      if (next) {
        setFocus(next);
      } else {
        // No element found — scroll in that direction
        const modal = document.querySelector('.modal-overlay.active');
        const scroller = modal || window;
        if (dirMap[key] === 'up') {
          scroller.scrollBy({ top: -300, behavior: 'smooth' });
          setTimeout(() => {
            const retry = findNext(currentFocus, 'up');
            if (retry) setFocus(retry);
          }, 350);
        } else if (dirMap[key] === 'down') {
          scroller.scrollBy({ top: 300, behavior: 'smooth' });
          setTimeout(() => {
            const retry = findNext(currentFocus, 'down');
            if (retry) setFocus(retry);
          }, 350);
        }
      }
      return;
    }

    // Enter / OK — check if we're on a player target
    if (key === 'Enter' || key === ' ') {
      if (currentFocus) {
        e.preventDefault();
        if (currentFocus.classList.contains('player-focus-target')) {
          enterIframeFocus(currentFocus);
        } else {
          currentFocus.click();
        }
      }
      return;
    }

    // Back
    if (key === 'Escape' || key === 'Backspace' || key === 'GoBack') {
      e.preventDefault();
      handleBack();
    }
  });

  // Mouse → disable TV mode
  document.addEventListener('mousemove', disableTvMode, { passive: true });

  // Watch for DOM changes (new content loaded)
  const observer = new MutationObserver(() => {
    if (tvMode && currentFocus && !document.body.contains(currentFocus)) {
      const first = getFocusables()[0];
      if (first) setFocus(first);
    }
  });
  observer.observe(document.getElementById('app') || document.body, {
    childList: true, subtree: true,
  });
}
