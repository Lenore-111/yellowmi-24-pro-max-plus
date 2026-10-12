export const world_info = {};
export const selected_world_info = [];
export async function loadWorldInfo(name) { return typeof globalThis.__phoneWorldbookLoader === 'function' ? globalThis.__phoneWorldbookLoader(name) : globalThis.__phoneWorldbooks?.[name] || null; }
