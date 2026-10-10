import { subscribePhoneGameModeChange } from './phone-game.js?v=0.3.0-alpha.27';

export function mountPhoneAcceptanceGuards({ phone } = {}) {
  const stage = document.querySelector('#world-phone-stage');
  const launcher = document.querySelector('#world-phone-launcher');
  const screen = stage?.querySelector('[data-screen]');
  if (!stage || !launcher || !screen) return () => {};

  // The real joint-browser acceptance found that host-side floating controls can
  // be mounted after the phone and then intercept taps. Keep an opened phone at
  // the top of the host stacking context without changing the current shell UI.
  const style = document.createElement('style');
  style.dataset.echoAcceptanceGuards = '1';
  style.textContent = '#world-phone-stage.wp-stage.is-open{z-index:2147483647}';
  document.head.append(style);

  const bringStageForward = () => {
    if (stage.parentElement === document.body) document.body.append(stage);
  };
  launcher.addEventListener('click', bringStageForward, true);

  // Mode changes are local phone state, so World Backstage subscriptions do not
  // necessarily fire. Refresh immediately rather than leaving the previous app
  // surface alive until the next unrelated host update.
  const unsubscribeMode = subscribePhoneGameModeChange(() => phone?.refresh?.());

  // Preserve the same real-browser fix as ed03deff without replacing the newer
  // world-phone renderer: a direct WeChat repaint must not destroy an already
  // open social/contact/share sheet. Ordinary sheet closes do not repaint the
  // entire WeChat root, so they are left alone.
  let lastFocused = null;
  const onFocus = event => {
    const sheet = event.target?.closest?.('.wp-social-sheet, .wp-wxr-contact-sheet, .wp-share-sheet');
    if (sheet) lastFocused = { sheet, node: event.target };
  };
  screen.addEventListener('focusin', onFocus, true);

  let restoring = false;
  const observer = new MutationObserver(records => {
    if (restoring) return;
    const rootRepainted = records.some(record => record.target === screen && (
      [...record.addedNodes].some(node => node.nodeType === 1 && node.matches?.('.wp-wx-app')) ||
      [...record.removedNodes].some(node => node.nodeType === 1 && node.matches?.('.wp-wx-app'))
    ));
    if (!rootRepainted) return;

    let removedSheet = null;
    for (const record of records) {
      for (const node of record.removedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.('.wp-social-sheet, .wp-wxr-contact-sheet, .wp-share-sheet')) removedSheet = node;
        else removedSheet ||= node.querySelector?.('.wp-social-sheet, .wp-wxr-contact-sheet, .wp-share-sheet');
        if (removedSheet) break;
      }
      if (removedSheet) break;
    }
    if (!removedSheet || removedSheet.isConnected) return;
    restoring = true;
    screen.append(removedSheet);
    const focusNode = lastFocused?.sheet === removedSheet && removedSheet.contains(lastFocused.node) ? lastFocused.node : null;
    focusNode?.focus?.({ preventScroll: true });
    queueMicrotask(() => { restoring = false; });
  });
  observer.observe(screen, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    unsubscribeMode?.();
    screen.removeEventListener('focusin', onFocus, true);
    launcher.removeEventListener('click', bringStageForward, true);
    style.remove();
  };
}
