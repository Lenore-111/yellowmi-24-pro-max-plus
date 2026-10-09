import {hasSkinServer,loadServerSkinLibrary,readServerSkin,saveServerSkin,deleteServerSkin,saveServerSkinSelection} from './phone-skin-storage.js';
// Skin assets belong to the device/account, never to chat/world metadata.
export const CUSTOM_THEME_EVENT = 'world-phone:custom-themes-ready';
export const SKIN_FORMAT = 'world-phone-skin';
export const MAX_SKIN_BYTES = 40 * 1024 * 1024;
const IMAGE_LIMIT = 20 * 1024 * 1024;
export const SKIN_APPS = [
 ['wechat','微信'],['news','世界新闻'],['wallet','钱包'],['delivery','Echo快送'],
 ['gallery','相册'],['music','音乐'],['casino','Echo 赌场'],['puzzle','数字花园'],
 ['settings','设置'],['appstore','应用商店'],['werewolf-local','狼人杀'],
 ['weibo','微博'],['rednote','小红书'],['phone','电话'],['messages','短信'],
 ['browser','浏览器'],['backstage','世界背面'],
];
const appIds = new Set(SKIN_APPS.map(([id])=>id));
// Android file pickers may return an empty/generic MIME or image/jpg.
// Identify supported images by their content and save a canonical MIME.
export function skinImageType(bytes) {
 if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((value,n)=>bytes[n]===value))return 'image/png';
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
 return '';
}
export async function normalizeSkinImage(file) {
 if(!(file instanceof Blob)||!file.size||file.size>IMAGE_LIMIT)throw new Error('请选择20MB以内的PNG、JPG/JPEG或WebP图片。');
 const type=skinImageType(new Uint8Array(await file.slice(0,12).arrayBuffer()));
 if(!type)throw new Error('图片损坏或格式不支持，请选择PNG或JPG/JPEG图片。');
 return file.type===type?file:file.slice(0,file.size,type);
}
let database, cache=[], loading, loadedServer=false;
const liveUrls = new Map();
export function customThemes() { return cache; }
export function guessSkinApp(filename) {
 const name=String(filename).replace(/\.[^.]+$/,'').trim().toLowerCase();
 return SKIN_APPS.find(([id,label])=>name===id||name===label)?.[0]||null;
}
function validName(name) {
 if(typeof name!=='string'||!name.trim()||name.trim().length>40)throw new Error('皮肤名称请填写1—40个字。');
 return name.trim();
}
export function validateSkinPackage(value) {
 if(!value||value.format!==SKIN_FORMAT||value.version!==1)throw new Error('不是小手机皮肤包，或版本暂不支持。');
 const name=validName(value.name), assets={};let bytes=0;
 const accept=(key,data)=>{
  if(typeof data!=='string')throw new Error('皮肤包图片内容无效。');
  const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if(!match||match[2].length%4)throw new Error('皮肤包只支持PNG、JPEG和WebP图片。');
  const size=match[2].length/4*3-(match[2].endsWith('==')?2:match[2].endsWith('=')?1:0);
  if(!size||size>IMAGE_LIMIT)throw new Error('单张图片不能超过20MB。');
  bytes+=size;if(bytes>MAX_SKIN_BYTES)throw new Error('整套皮肤不能超过40MB。');
  assets[key]={type:match[1],base64:match[2]};
 };
 for(const key of ['home','lock'])if(value.wallpapers?.[key]!=null)accept(key,value.wallpapers[key]);
 if(value.icons!=null&&(typeof value.icons!=='object'||Array.isArray(value.icons)))throw new Error('图标列表无效。');
 for(const [id,data] of Object.entries(value.icons||{})){
  if(!appIds.has(id))throw new Error('皮肤包中有无法识别的应用：'+id);
  accept('icon:'+id,data);
 }
 if(!Object.keys(assets).length)throw new Error('皮肤包里没有壁纸或图标。');
 return {name,assets};
}
function openDatabase() {
 if(!globalThis.indexedDB)return Promise.reject(new Error('当前浏览器无法保存皮肤，请检查存储权限。'));
 if(!database)database=new Promise((resolve,reject)=>{
  const request=indexedDB.open('world_phone_custom_themes_v1',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('themes',{keyPath:'id'});
  request.onsuccess=()=>resolve(request.result);
  request.onerror=request.onblocked=()=>{database=null;reject(new Error('皮肤存储暂时无法打开。'));};
 });return database;
}
async function transaction(mode,run) {
 const db=await openDatabase();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('themes',mode);let request;
  try{request=run(tx.objectStore('themes'));}catch(error){tx.abort();reject(error);return;}
  tx.oncomplete=()=>resolve(request?.result);
  tx.onerror=tx.onabort=()=>reject(new Error('皮肤保存失败，可能是设备空间不足。原来的皮肤没有改变。'));
 });
}
function refreshCache(records) {
 const used=new Set();
 const url=(record,key,blob)=>{
  const token=record.id+':'+record.updatedAt+':'+key;used.add(token);
  if(!liveUrls.has(token))liveUrls.set(token,URL.createObjectURL(blob));return liveUrls.get(token);
 };
 cache=records.sort((a,b)=>b.updatedAt-a.updatedAt).map(record=>{
  const iconMap={};for(const [id,blob] of Object.entries(record.icons))iconMap[id]=url(record,'icon:'+id,blob);
  return {id:record.id,name:record.name,custom:true,home:record.home?url(record,'home',record.home):'',
   lock:record.lock?url(record,'lock',record.lock):'',iconMap,record};
 });
 for(const [key,value] of liveUrls)if(!used.has(key)){URL.revokeObjectURL(value);liveUrls.delete(key);}
}
function packageInput(value) {
 const parsed=validateSkinPackage(value),input={name:parsed.name,icons:{}};
 for(const [key,asset] of Object.entries(parsed.assets)){
  let raw;try{raw=atob(asset.base64);}catch{throw new Error('皮肤包图片内容损坏。');}
  const blob=new Blob([Uint8Array.from(raw,c=>c.charCodeAt(0))],{type:asset.type});
  if(key.startsWith('icon:'))input.icons[key.slice(5)]=blob;else input[key]=blob;
 }
 return input;
}
export async function loadCustomThemes() {
 if(loading&&hasSkinServer()&&!loadedServer)await loading;
 if(!loading||(hasSkinServer()&&!loadedServer))loading=(async()=>{
  let records;
  try{records=await transaction('readonly',store=>store.getAll());}
  catch(error){if(!hasSkinServer())throw error;records=[];}
  // Keep existing browser skins visible if the account server is temporarily unavailable.
  refreshCache(records);
  const server=await loadServerSkinLibrary();
  if(server){
   if(server.selection===undefined){
    // First upgrade: migrate the existing local collection without replacing it.
    for(const record of records)await saveServerSkin(record,await recordPackage(record));
    let selection=null;try{selection=JSON.parse(localStorage.getItem('world_phone_theme_v1')||'null');}catch{}
    await saveServerSkinSelection(selection);
   }else{
    const local=new Map(records.map(record=>[record.id,record]));
    records=await Promise.all(server.themes.map(async entry=>{
     const existing=local.get(entry.id);
     if(existing?.updatedAt===entry.updatedAt)return existing;
     const input=packageInput(await readServerSkin(entry));
     return {...input,id:entry.id,updatedAt:entry.updatedAt,home:input.home||null,lock:input.lock||null};
    }));
   }
   // IndexedDB is a mirror; the confirmed server copy survives browser data loss.
   try{await transaction('readwrite',store=>{store.clear();for(const record of records)store.put(record);});}catch{}
   loadedServer=true;
  }
  refreshCache(records);globalThis.dispatchEvent?.(new CustomEvent(CUSTOM_THEME_EVENT));return cache;
 })().catch(error=>{loading=null;throw error;});
 return loading;
}
export async function validateSkinImage(blob) {
 blob=await normalizeSkinImage(blob);
 const url=URL.createObjectURL(blob);
 try{await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{
  if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40_000_000)reject(new Error('图片尺寸太大，请缩小后上传。'));else resolve();
 };image.onerror=()=>reject(new Error('图片损坏或浏览器无法显示，请转为PNG后重试。'));image.src=url;});}
 finally{URL.revokeObjectURL(url);}
 return blob;
}
export async function saveCustomTheme(input) {
 await loadCustomThemes();const name=validName(input.name);
 const icons={};for(const [id,blob] of Object.entries(input.icons||{})){
  if(!appIds.has(id))throw new Error('无法识别的应用图标。');if(blob)icons[id]=blob;
 }
 const assets=[input.home,input.lock,...Object.values(icons)].filter(Boolean);
 if(!assets.length)throw new Error('请至少上传一张壁纸或应用图标。');
 if(assets.reduce((sum,blob)=>sum+blob.size,0)>MAX_SKIN_BYTES)throw new Error('整套皮肤不能超过40MB。');
 const home=input.home?await validateSkinImage(input.home):null;
 const lock=input.lock?input.lock===input.home?home:await validateSkinImage(input.lock):null;
 for(const id of Object.keys(icons))icons[id]=await validateSkinImage(icons[id]);
 const old=cache.find(theme=>theme.id===input.id);
 if(input.id&&!old)throw new Error('这套皮肤已经不存在，请重新打开。');
 if(!old&&cache.length>=20)throw new Error('最多保存20套自定义皮肤，请先删除不用的皮肤。');
 const record={id:old?.id||'custom:'+crypto.randomUUID(),name,home,lock,icons,updatedAt:Math.max(Date.now(),(old?.record.updatedAt||0)+1)};
 const server=hasSkinServer();
 if(server)await saveServerSkin(record,await recordPackage(record));
 try{await transaction('readwrite',store=>store.put(record));}catch(error){if(!server)throw error;}
 refreshCache([...cache.filter(theme=>theme.id!==record.id).map(theme=>theme.record),record]);
 return cache.find(theme=>theme.id===record.id);
}
export async function deleteCustomTheme(id) {
 await loadCustomThemes();const server=hasSkinServer();
 if(server)await deleteServerSkin(id);
 try{await transaction('readwrite',store=>store.delete(id));}catch(error){if(!server)throw error;}
 refreshCache(cache.filter(theme=>theme.id!==id).map(theme=>theme.record));
}
function dataUrl(blob) {return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('图片导出失败。'));reader.readAsDataURL(blob);});}
export async function exportCustomTheme(id) {
 await loadCustomThemes();const record=cache.find(theme=>theme.id===id)?.record;
 if(!record)throw new Error('没有找到这套皮肤。');
 return recordPackage(record);
}
async function recordPackage(record) {
 const wallpapers={},icons={};for(const key of ['home','lock'])if(record[key])wallpapers[key]=await dataUrl(record[key]);
 for(const [key,blob] of Object.entries(record.icons))icons[key]=await dataUrl(blob);
 return {format:SKIN_FORMAT,version:1,name:record.name,wallpapers,icons};
}
export async function importCustomTheme(file) {
 if(!file||!file.size||file.size>MAX_SKIN_BYTES*1.4)throw new Error('请选择56MB以内的小手机皮肤包。');
 let value;try{value=JSON.parse(await file.text());}catch{throw new Error('皮肤包无法读取，请重新选择导出的皮肤文件。');}
 const input=packageInput(value);
 return saveCustomTheme(input);
}
