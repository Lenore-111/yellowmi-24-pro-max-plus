const KEY = 'world_phone_social_ui_v2';
function context() { try { return globalThis.SillyTavern?.getContext?.(); } catch { return null; } }
export function socialScope() { const ctx = context(); return ctx?.chatMetadata ?? ctx?.chat_metadata ?? null; }
export function readSocialBucket(key) {
  const scope = socialScope();
  try { return structuredClone(scope ? scope[KEY]?.[key] : JSON.parse(globalThis.localStorage?.getItem(`${KEY}:offline:${key}`) || 'null')); } catch { return null; }
}
export function writeSocialBucket(key, value) {
  const ctx = context(); const scope = socialScope();
  if (scope) {
    if (!scope[KEY] || typeof scope[KEY] !== 'object' || Array.isArray(scope[KEY])) scope[KEY] = {};
    scope[KEY][key] = structuredClone(value);
    try {
      if (ctx.saveMetadataDebounced) ctx.saveMetadataDebounced();
      else Promise.resolve(ctx.saveMetadata?.()).catch(() => {});
    } catch {}
  } else { try { globalThis.localStorage?.setItem(`${KEY}:offline:${key}`, JSON.stringify(value)); } catch {} }
}
