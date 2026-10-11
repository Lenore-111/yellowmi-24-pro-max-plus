import { capturePhoneGameScope, isPhoneGameScopeCurrent, readPhoneGameMode, readPhoneGameState, attachPhoneGameImage, flushPhoneGameMetadata, subscribePhoneGameModeChange } from './phone-game.js?v=0.3.0-alpha.28';
import { readPhoneImageSettings, generatePhoneImage, savePhoneImageAsset, removePhoneImageAsset } from './phone-image-provider.js';

let task = null;
const listeners = new Set();
export function phonePostImageStatus() { return task ? { scope: task.scope, postId: task.postId, busy: true } : { busy: false }; }
export function subscribePhonePostImages(listener) { listeners.add(listener); return () => listeners.delete(listener); }
function notify(status) { for (const listener of listeners) listener(status); }
export function cancelPhonePostImage() { task?.controller.abort(); }
export function phonePostImagePrompt(state, post) {
  const actor = state.actors.find(x => x.id === post.actorId);
  const style = readPhoneImageSettings().style;
  if (post.imagePrompt) return [!post.imageUrl && style ? '画风：' + style : '', post.imagePrompt].filter(Boolean).join('\n');
  return [
    '为这条手机动态画一张配图，只画动态提到的场景或物品。只有动态涉及人物时才画人物，人物外貌遵循下方资料。不要绘制手机界面、聊天气泡、文字或水印。',
    style ? '画风：' + style : '',
    '动态：' + [post.title, post.text].filter(Boolean).join('。'),
    actor?.profile ? '人物资料（仅参考外貌）：' + actor.profile.slice(0, 2500) : '',
  ].filter(Boolean).join('\n').slice(0, 6000);
}
export async function generatePhonePostImage(postId, prompt, scope = capturePhoneGameScope()) {
  if (task) throw new Error('还有一张配图生成中，请完成或取消后再试。');
  const current = () => isPhoneGameScopeCurrent(scope) && readPhoneGameMode() === 'game';
  if (!current()) throw new Error('聊天或模式已切换，请重新打开这条动态。');
  if (!readPhoneGameState(scope).posts.some(x => x.id === postId)) throw new Error('这条动态已不存在。');
  const running = { scope, postId, controller: new AbortController() }; task = running;
  const cancelIfStale = () => { if (!current()) running.controller.abort(); };
  const timer = setInterval(cancelIfStale, 200);
  const unsubscribe = subscribePhoneGameModeChange(cancelIfStale);
  const events = scope.ctx?.eventSource;
  const changed = (scope.ctx?.eventTypes || scope.ctx?.event_types || {}).CHAT_CHANGED;
  const cancelOnChat = () => running.controller.abort();
  if (changed) events?.on?.(changed, cancelOnChat);
  let path = '', attached = false;
  try {
    notify(phonePostImageStatus());
    const blob = await generatePhoneImage(prompt, { signal: running.controller.signal });
    if (!current() || running.controller.signal.aborted) throw new Error('聊天或模式已切换，这次配图已取消。');
    path = await savePhoneImageAsset(blob, { signal: running.controller.signal });
    if (!current() || running.controller.signal.aborted) throw new Error('聊天或模式已切换，这次配图已取消。');
    attachPhoneGameImage(postId, path, prompt, scope); attached = true;
    await flushPhoneGameMetadata(scope);
    return path;
  } finally {
    clearInterval(timer); unsubscribe();
    if (changed) { if (events?.off) events.off(changed, cancelOnChat); else events?.removeListener?.(changed, cancelOnChat); }
    if (path && !attached) await removePhoneImageAsset(path);
    if (task === running) { task = null; notify({ scope, postId, busy: false }); }
  }
}
