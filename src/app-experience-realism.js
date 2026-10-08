const FORWARD_SELECTOR = [
  '[data-social-detail]',
  '[data-utility-gallery-open]',
  '[data-utility-browser-open]',
  '[data-store-detail]',
  '[data-wx-chat]',
].join(',');

const BACK_SELECTOR = [
  '[data-social-detail-back]',
  '[data-utility-gallery-back]',
  '[data-utility-browser-back]',
  '[data-store-detail-back]',
].join(',');

const STATE_SELECTOR = [
  '[data-social-like]',
  '[data-social-save]',
  '[data-utility-gallery-fav]',
  '[data-utility-browser-bookmark]',
  '[data-store-action]',
].join(',');

const TAB_SELECTOR = [
  '[data-social-tab]',
  '[data-utility-gallery-tab]',
  '[data-utility-browser-tab]',
  '[data-wx-tab]',
].join(',');

const SEARCH_SELECTOR = [
  '[data-social-search]',
  '[data-utility-browser-search]',
  '[data-store-search]',
].join(',');

function nativeSection(target) {
  return target?.closest?.('#world-phone-stage .wp-native-app') || null;
}

function routeKey(phone, section) {
  const current = String(phone?.current?.() || '').trim();
  if (current) return current;
  return String(section?.querySelector('.wp-app-header b')?.textContent || 'app').trim();
}

function scrollSignature(node) {
  if (!node?.classList) return '';
  const preferred = [...node.classList].find((name) => /^wp-/.test(name) && /(shell|content|feed|list|grid|page|detail)/.test(name));
  const fallback = [...node.classList].find((name) => /^wp-/.test(name));
  const name = preferred || fallback;
  return name ? `.${CSS.escape(name)}` : '';
}

function findScrollable(target, section) {
  let node = target?.nodeType === 1 ? target : target?.parentElement;
  while (node && node !== section) {
    if (node.scrollHeight > node.clientHeight + 2) {
      return { selector: scrollSignature(node), top: node.scrollTop };
    }
    node = node.parentElement;
  }

  const candidates = section?.querySelectorAll?.('.wp-social-shell, .wp-utility-shell, .wp-wx-content, .wp-store-shell, [class*="-shell"], [class*="-content"]') || [];
  for (const candidate of candidates) {
    if (candidate.scrollHeight > candidate.clientHeight + 2) {
      return { selector: scrollSignature(candidate), top: candidate.scrollTop };
    }
  }
  return { selector: '', top: 0 };
}

function restoreScroll(section, snapshot) {
  if (!section || !snapshot?.selector) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const current = document.querySelector('#world-phone-stage .wp-native-app');
    if (!current) return;
    const host = current.querySelector(snapshot.selector);
    if (host) host.scrollTop = snapshot.top;
  }));
}

function markMotion(section, motion) {
  if (!section) return;
  section.dataset.appExperienceMotion = motion;
  window.setTimeout(() => {
    if (section.dataset.appExperienceMotion === motion) delete section.dataset.appExperienceMotion;
  }, 280);
}

export function mountAppExperienceRealism({ phone } = {}) {
  const history = new Map();
  let destroyed = false;
  let feedbackTimer = 0;

  const clickHandler = (event) => {
    if (destroyed) return;
    const target = event.target?.closest?.(`${FORWARD_SELECTOR},${BACK_SELECTOR},${STATE_SELECTOR},${TAB_SELECTOR}`);
    if (!target) return;
    const section = nativeSection(target);
    if (!section) return;
    const key = routeKey(phone, section);

    if (target.matches(FORWARD_SELECTOR)) {
      const stack = history.get(key) || [];
      stack.push(findScrollable(target, section));
      if (stack.length > 8) stack.shift();
      history.set(key, stack);
      markMotion(section, 'forward');
      return;
    }

    if (target.matches(BACK_SELECTOR)) {
      const stack = history.get(key) || [];
      const snapshot = stack.pop();
      history.set(key, stack);
      markMotion(section, 'back');
      restoreScroll(section, snapshot);
      return;
    }

    if (target.matches(TAB_SELECTOR)) {
      markMotion(section, 'tab');
      return;
    }

    if (target.matches(STATE_SELECTOR)) {
      const snapshot = findScrollable(target, section);
      section.classList.add('is-app-experience-feedback');
      window.clearTimeout(feedbackTimer);
      feedbackTimer = window.setTimeout(() => section.classList.remove('is-app-experience-feedback'), 190);
      restoreScroll(section, snapshot);
    }
  };

  const submitHandler = (event) => {
    if (destroyed || !event.target?.matches?.(SEARCH_SELECTOR)) return;
    const section = nativeSection(event.target);
    if (!section) return;
    markMotion(section, 'search');
  };

  document.addEventListener('click', clickHandler, true);
  document.addEventListener('submit', submitHandler, true);

  return () => {
    destroyed = true;
    window.clearTimeout(feedbackTimer);
    document.removeEventListener('click', clickHandler, true);
    document.removeEventListener('submit', submitHandler, true);
    history.clear();
    document.querySelectorAll('#world-phone-stage .wp-native-app').forEach((section) => {
      delete section.dataset.appExperienceMotion;
      section.classList.remove('is-app-experience-feedback');
    });
  };
}
