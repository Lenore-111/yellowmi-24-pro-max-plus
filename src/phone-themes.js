import {hasSkinServer,serverSkinSelection,saveServerSkinSelection} from './phone-skin-storage.js';
import {customThemes,loadCustomThemes,CUSTOM_THEME_EVENT} from './custom-phone-themes.js';
import {customThemeMarkup,bindCustomThemeUI} from './custom-phone-theme-ui.js';
export const THEME_CHANGE_EVENT = 'world-phone:theme-change';
export const THEME_STORAGE_KEY = 'world_phone_theme_v1';
let pendingSelection, selectionRevision=0, selectionSave=Promise.resolve();
export const BLUE_FISH_THEME = {
  id: 'blue-fish', name: '蓝色大肥鱼',
  wallpaper: new URL('../assets/themes/blue-fish/wallpaper.png', import.meta.url).href,
  icons: new URL('../assets/themes/blue-fish/icons-png/00.png', import.meta.url).href,
};
export const PINK_THEME = {
  id: 'pink', name: '粉色心动',
  wallpaper: new URL('../assets/themes/pink/wallpaper.jpg', import.meta.url).href,
  icons: new URL('../assets/themes/pink/icons-png/00.png', import.meta.url).href,
};
for (const theme of [BLUE_FISH_THEME, PINK_THEME]) {
  theme.iconFiles = Array.from({length:16},(_,cell)=>new URL(`../assets/themes/${theme.id}/icons-png/${String(cell).padStart(2,'0')}.png`, import.meta.url).href);
}
export const PHONE_THEMES = [BLUE_FISH_THEME, PINK_THEME];
export function getPhoneTheme(id) { return [...PHONE_THEMES,...customThemes()].find(theme => theme.id === id) || null; }
export const THEME_ICON_CELLS = {wechat:0,news:1,wallet:2,delivery:3,gallery:4,music:5,casino:6,puzzle:7,settings:8,appstore:9,'werewolf-local':10,weibo:11,rednote:12,phone:13,messages:14,browser:15,backstage:15};
export function normalizePhoneTheme(value) {
  if (!getPhoneTheme(value?.id) && !(typeof value?.id==='string' && /^custom:[a-zA-Z0-9-]+$/.test(value.id))) return null;
  return {id:value.id,home:value.home===true,lock:value.lock===true,icons:value.icons===true};
}
export function readPhoneTheme(storage = globalThis.localStorage) {
  try {
    const saved=storage===globalThis.localStorage ? (pendingSelection!==undefined?pendingSelection:serverSkinSelection()) : undefined;
    return normalizePhoneTheme(saved!==undefined?saved:JSON.parse(storage?.getItem(THEME_STORAGE_KEY)||'null'));
  } catch { return null; }
}
export function writePhoneTheme(value, storage = globalThis.localStorage) {
  const next=normalizePhoneTheme(value);
  const server=storage===globalThis.localStorage&&hasSkinServer();
  try{if(next) storage.setItem(THEME_STORAGE_KEY,JSON.stringify(next)); else storage.removeItem(THEME_STORAGE_KEY);}catch(error){if(!server)throw error;}
  if(server){
    pendingSelection=next;const revision=++selectionRevision;
    selectionSave=saveServerSkinSelection(next).then(()=>{if(revision===selectionRevision)pendingSelection=undefined;});
    selectionSave.catch(()=>{});
  }
  if(globalThis.dispatchEvent) globalThis.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT));
  return next;
}
export function disableThemeWallpaper(target) {
  const value=readPhoneTheme(); if(!value)return;
  if(target==='both'||target==='home') value.home=false;
  if(target==='both'||target==='lock') value.lock=false;
  writePhoneTheme(value);return selectionSave;
}
export function themeWallpaper(target) { const value=readPhoneTheme(); return value?.[target] ? (getPhoneTheme(value.id)?.[target] || getPhoneTheme(value.id)?.wallpaper || '') : ''; }
export function themeIconPosition(id) {
  const cell=THEME_ICON_CELLS[id];
  return cell===undefined ? '' : `${(cell%4)*100/3}% ${Math.floor(cell/4)*100/3}%`;
}
export function applyThemeIcons(root=document) {
  const value=readPhoneTheme(); const theme=getPhoneTheme(value?.id); const enabled=value?.icons;
  for(const button of root.querySelectorAll('#world-phone-stage .wp-home .wp-app[data-app]')) {
    const icon=button.querySelector('.wp-app-icon'); if(!icon)continue;
    const position=themeIconPosition(button.dataset.app);
    const source=theme?.custom?theme.iconMap[button.dataset.app]:theme?.iconFiles[THEME_ICON_CELLS[button.dataset.app]];
    if(enabled&&position&&source) {
      if(icon.dataset.phoneTheme===theme.id&&icon.style.getPropertyValue('--phone-theme-atlas')===`url("${source}")`)continue;
      icon.dataset.phoneTheme=theme.id;
      icon.style.setProperty('--phone-theme-atlas',`url("${source}")`);
      icon.style.setProperty('--phone-theme-position',position);
    } else if(icon.dataset.phoneTheme) {
      delete icon.dataset.phoneTheme; icon.style.removeProperty('--phone-theme-atlas');icon.style.removeProperty('--phone-theme-position');
    }
  }
}
function preload(url) {
  return new Promise((resolve,reject)=>{const img=new Image();img.onload=resolve;img.onerror=()=>reject(new Error('主题图片加载失败，请重试。'));img.src=url;});
}
export async function applyPhoneTheme(id, parts) {
  if(id?.startsWith('custom:'))await loadCustomThemes();
  const theme=getPhoneTheme(id);
  if(!theme)throw new Error('主题不存在。');
  if(!parts.home&&!parts.lock&&!parts.icons)throw new Error('请至少选择一项。');
  const images=theme.custom?[...(parts.home?[theme.home]:[]),...(parts.lock?[theme.lock]:[]),...(parts.icons?Object.values(theme.iconMap):[])]:[...(parts.home||parts.lock?[theme.wallpaper]:[]),...(parts.icons?theme.iconFiles:[])];
  if(images.some(url=>!url))throw new Error('所选壁纸还没有上传。');
  if(parts.icons&&theme.custom&&!Object.keys(theme.iconMap).length)throw new Error('这套皮肤还没有应用图标。');
  await Promise.all(images.map(preload));
  const next=writePhoneTheme({id,home:parts.home,lock:parts.lock,icons:parts.icons});
  await selectionSave;return next;
}
export function applyBlueFishTheme(parts) { return applyPhoneTheme(BLUE_FISH_THEME.id, parts); }
export function phoneThemeStoreMarkup() {
  const value=readPhoneTheme();
  return customThemeMarkup()+PHONE_THEMES.map(theme=>`<section class="wp-theme-store" data-theme-id="${theme.id}"><h2>${theme.name}</h2><p>锁屏、桌面与透明萌版应用图标，配成一整套。</p><div class="wp-theme-previews"><figure><img src="${theme.wallpaper}" alt="${theme.name}壁纸预览"><figcaption>锁屏与桌面壁纸</figcaption></figure><figure><div class="wp-theme-icon-preview">${theme.iconFiles.map((src,cell)=>`<img src="${src}" alt="${theme.name}应用图标${cell+1}">`).join('')}</div><figcaption>透明萌版应用图标</figcaption></figure></div><div class="wp-theme-parts">${[['lock','锁屏'],['home','桌面'],['icons','应用图标']].map(([key,label])=>`<label><input type="checkbox" data-theme-part="${key}" checked>${label}</label>`).join('')}</div><p data-theme-status role="status">${value?.id===theme.id?'当前已应用：'+[['lock','锁屏'],['home','桌面'],['icons','图标']].filter(([k])=>value[k]).map(([,v])=>v).join('、'):'尚未应用'}</p><div class="wp-theme-actions"><button type="button" data-theme-apply>应用所选主题</button><button type="button" data-theme-reset>恢复原有外观</button></div></section>`).join('');
}
export function bindPhoneThemeStore(section, repaint) {
  bindCustomThemeUI(section,{apply:applyPhoneTheme,reset:async()=>{writePhoneTheme(null);await selectionSave;},changed:()=>globalThis.dispatchEvent?.(new CustomEvent(THEME_CHANGE_EVENT)),readTheme:readPhoneTheme});
  for(const card of section.querySelectorAll('[data-theme-id]')) {
    const apply=card.querySelector('[data-theme-apply]');
    apply?.addEventListener('click',async()=>{
      const parts={};card.querySelectorAll('[data-theme-part]').forEach(n=>parts[n.dataset.themePart]=n.checked);
      apply.disabled=true; const status=card.querySelector('[data-theme-status]');status.textContent='正在应用…';
      try{await applyPhoneTheme(card.dataset.themeId,parts);repaint();}catch(error){status.textContent=error.message;apply.disabled=false;}
    });
    card.querySelector('[data-theme-reset]')?.addEventListener('click',async()=>{try{writePhoneTheme(null);await selectionSave;repaint();}catch(error){card.querySelector('[data-theme-status]').textContent=error.message;}});
  }
}
export function syncPhoneThemeStoreStatus(section) {
 const value=readPhoneTheme();
 for(const card of section.querySelectorAll('[data-theme-id]')){
  const status=card.querySelector('[data-theme-status]');
  const text=value?.id===card.dataset.themeId?'当前已应用：'+[['lock','锁屏'],['home','桌面'],['icons','图标']].filter(([key])=>value[key]).map(([,label])=>label).join('、'):'尚未应用';
  if(status&&status.textContent!==text)status.textContent=text;
 }
}

// Restore account/browser assets before announcing the saved skin to existing views.
globalThis.addEventListener?.(CUSTOM_THEME_EVENT,()=>globalThis.dispatchEvent?.(new CustomEvent(THEME_CHANGE_EVENT)));
if(globalThis.indexedDB||hasSkinServer()){
 loadCustomThemes().catch(()=>{});
}
