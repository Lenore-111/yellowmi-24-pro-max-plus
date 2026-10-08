// Persist assets in the signed-in Tavern account, outside chat/world data.
const LIBRARY_NAME = 'world-phone-skins-v1.json';
const LIBRARY_URL = '/user/files/' + LIBRARY_NAME;
let library, loading, queue = Promise.resolve();
function context() { try { return globalThis.SillyTavern?.getContext?.(); } catch { return null; } }
export function hasSkinServer() { return typeof context()?.getRequestHeaders === 'function'; }
function emptyLibrary() { return {version:1, themes:[], selection:undefined}; }
function safePath(path) { return typeof path === 'string' && /^\/?user\/files\/world-phone-skin-[a-zA-Z0-9-]+\.json$/.test(path); }
async function upload(name, blob) {
 const data = await new Promise((resolve,reject)=>{
  const reader = new FileReader(); reader.onload=()=>resolve(reader.result.split(',')[1]); reader.onerror=reject; reader.readAsDataURL(blob);
 });
 const response = await fetch('/api/files/upload', {method:'POST',headers:context().getRequestHeaders(),body:JSON.stringify({name,data})});
 if(!response.ok) throw new Error('酒馆未能保存皮肤，请检查连接和设备空间，再重试。');
 const result=await response.json();
 if(typeof result.path!=='string') throw new Error('酒馆返回的皮肤文件地址无效。');
 return result.path;
}
export async function loadServerSkinLibrary() {
 if(!hasSkinServer())return null;
 if(!loading)loading=(async()=>{
  const response=await fetch(LIBRARY_URL,{cache:'no-store'});
  if(response.status===404){library=emptyLibrary();return library;}
  if(!response.ok)throw new Error('酒馆皮肤暂时无法读取，请检查连接后重试。');
  const value=await response.json();
  if(value?.version!==1||!Array.isArray(value.themes)||value.themes.length>20||value.themes.some(t=>!/^custom:[a-zA-Z0-9-]+$/.test(t?.id)||!Number.isFinite(t.updatedAt)||!safePath(t.path)))throw new Error('酒馆皮肤目录损坏，原文件已保留，请勿重复保存。');
  library=value;return library;
 })().catch(error=>{loading=null;throw error;});
 return loading;
}
export function serverSkinSelection() { return library?.selection; }
export async function readServerSkin(entry) {
 if(!safePath(entry.path))throw new Error('皮肤文件地址无效。');
 const response=await fetch('/'+entry.path.replace(/^\//,''),{cache:'no-store'});
 if(!response.ok)throw new Error('已保存的皮肤素材无法读取，请检查酒馆连接。');
 return response.json();
}
function mutate(task) {
 if(!hasSkinServer())return Promise.resolve(null);
 const result=queue.catch(()=>{}).then(async()=>{await loadServerSkinLibrary();return task();});
 queue=result;return result;
}
async function commit(next) {
 await upload(LIBRARY_NAME,new Blob([JSON.stringify(next)],{type:'application/json'}));
 library=next;loading=Promise.resolve(next);
}
async function removeAsset(path) {
 if(!safePath(path))return;
 try { await fetch('/api/files/delete',{method:'POST',headers:context().getRequestHeaders(),body:JSON.stringify({path})}); } catch {}
}
export function saveServerSkin(record, value) { return mutate(async()=>{
 const old=library.themes.find(t=>t.id===record.id);
 const name='world-phone-skin-'+record.id.slice(7)+'-'+record.updatedAt+'.json';
 const path=await upload(name,new Blob([JSON.stringify(value)],{type:'application/json'}));
 if(!safePath(path))throw new Error('酒馆返回的皮肤文件地址无效。');
 const next={...library,themes:[...library.themes.filter(t=>t.id!==record.id),{id:record.id,name:record.name,updatedAt:record.updatedAt,path}]};
 await commit(next);
 if(old&&old.path!==path)await removeAsset(old.path);
 return path;
 }); }
export function deleteServerSkin(id) { return mutate(async()=>{
 const old=library.themes.find(t=>t.id===id);
 await commit({...library,themes:library.themes.filter(t=>t.id!==id),selection:library.selection?.id===id?null:library.selection});
 if(old)await removeAsset(old.path);
 }); }
export function saveServerSkinSelection(selection) { return mutate(()=>commit({...library,selection})); }
