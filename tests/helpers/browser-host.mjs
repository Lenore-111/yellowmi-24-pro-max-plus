import { readFile } from 'node:fs/promises';

const modules = {
  '/script.js': 'tavern-host.mjs',
  '/scripts/group-chats.js': 'group-host.mjs',
  '/scripts/world-info.js': 'world-info-host.mjs',
};

export async function serveBrowserHost(req, res) {
  const name = modules[new URL(req.url, 'http://localhost').pathname];
  if (!name) return false;
  res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
  res.end(await readFile(new URL(name, import.meta.url)));
  return true;
}
