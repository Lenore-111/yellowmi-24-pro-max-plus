import {SKIN_APPS,MAX_SKIN_BYTES,customThemes,loadCustomThemes,saveCustomTheme,deleteCustomTheme,importCustomTheme,exportCustomTheme,guessSkinApp,validateSkinImage} from './custom-phone-themes.js';
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function customThemeMarkup() {
 return `<section class="wp-theme-store wp-custom-skins" data-custom-skins>
 <h2>自定义</h2><p>自己制作一套，或导入朋友分享的小手机皮肤包。保存后随酒馆保留，重新进入会恢复。</p>
 <div class="wp-theme-actions"><button type="button" data-skin-new>制作皮肤</button><button type="button" data-skin-upload-icons>上传图标（PNG/JPG）</button><label class="wp-skin-file-button">导入整套皮肤<input type="file" data-skin-import accept=".json,.phone-theme.json,application/json"></label></div>
 <p data-skin-status role="status" aria-live="polite"></p>
 <form data-skin-editor hidden>
 <label class="wp-skin-name">皮肤名称<input data-skin-name maxlength="40" required placeholder="给这套皮肤起个名字"></label>
 <div class="wp-skin-wallpapers">${[['home','桌面壁纸'],['lock','锁屏壁纸']].map(([key,label])=>`<div data-skin-wallpaper="${key}"><label>${label}<span class="wp-skin-preview" data-skin-preview="${key}">未选择</span><span class="wp-skin-file-button">选择图片<input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/jpg,image/webp" data-skin-file="${key}"></span></label><button type="button" data-skin-clear="${key}">清除</button></div>`).join('')}</div>
 <label class="wp-skin-check"><input type="checkbox" data-skin-same checked>锁屏使用同一张壁纸</label>
 <div class="wp-theme-actions"><label class="wp-skin-file-button">批量选择图标（PNG/JPG）<input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/jpg,image/webp" multiple data-skin-bulk></label></div>
 <p class="wp-skin-hint">同一张图片可以勾选多个应用，也能一键用于全部应用。多张图片可按应用顺序分配，无需改文件名。支持PNG和JPG/JPEG，推荐透明PNG。</p>
 <section class="wp-skin-bulk-panel" data-skin-bulk-panel hidden><h3>分配本次图标</h3><p>核对图片和应用后点“添加所选图标”。已有图标只在对应应用被选中时替换。</p><div data-skin-bulk-list></div><p data-skin-bulk-status></p><div class="wp-theme-actions"><button type="button" data-skin-bulk-fill>按下方应用顺序填充</button><button type="button" data-skin-bulk-confirm>添加所选图标</button><button type="button" data-skin-bulk-cancel>取消本次选择</button></div></section>
 <div class="wp-skin-icons">${SKIN_APPS.map(([id,label])=>`<div><label><span class="wp-skin-icon-preview" data-skin-preview="icon:${id}">＋</span><span>${label}</span><input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/jpg,image/webp" data-skin-file="icon:${id}" aria-label="${label}图标"></label><button type="button" data-skin-clear="icon:${id}" aria-label="清除${label}图标">清除</button></div>`).join('')}</div>
 <div class="wp-theme-parts">${[['home','桌面'],['lock','锁屏'],['icons','图标']].map(([key,label])=>`<label><input type="checkbox" data-skin-part="${key}" checked>${label}</label>`).join('')}</div>
 <div class="wp-theme-actions"><button type="submit" data-skin-save>保存并应用</button><button type="button" data-skin-cancel>取消</button></div></form>
 <div data-skin-list></div></section>`;
}
export function bindCustomThemeUI(section,{apply,reset,changed,readTheme}) {
 const root=section.querySelector('[data-custom-skins]');if(!root)return;
 const editor=root.querySelector('[data-skin-editor]'),status=root.querySelector('[data-skin-status]');
 let draft={name:'',icons:{}},pending=[],busy=false;const urls=new Map();
 const message=text=>{status.textContent=text;root.querySelector('[data-skin-bulk-status]').textContent=pending.length?text:'';};
 const release=()=>{for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();};
 const observer=new MutationObserver(()=>{if(!root.isConnected){release();observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});
 function bulkPreview(){
  const panel=root.querySelector('[data-skin-bulk-panel]');panel.hidden=!pending.length;
  root.querySelector('[data-skin-bulk-fill]').textContent=pending.length===1?'一张图片用于全部应用':'按下方应用顺序填充空项';
  root.querySelector('[data-skin-bulk-list]').innerHTML=pending.map((item,n)=>{
   const url=URL.createObjectURL(item.blob);urls.set('bulk:'+n,url);
   return `<div class="wp-skin-bulk-row"><img src="${url}" alt="待分配图标"><div class="wp-skin-bulk-choice"><span class="wp-skin-bulk-filename">${escapeHtml(item.name)}</span><details data-skin-bulk-target="${n}"><summary>选择应用（已选${item.targets.length}个，可多选）</summary><div class="wp-skin-app-options">${SKIN_APPS.map(([id,label])=>`<label><input type="checkbox" data-skin-bulk-app="${id}" data-skin-bulk-index="${n}"${item.targets.includes(id)?' checked':''}><span>${label}${draft.icons[id]?'（替换）':''}</span></label>`).join('')}</div></details><p data-skin-bulk-selection="${n}">${selectionText(item)}</p><div class="wp-theme-actions"><button type="button" data-skin-bulk-all="${n}">全选应用</button><button type="button" data-skin-bulk-none="${n}">清空选择</button><button type="button" data-skin-bulk-skip="${n}">跳过本张</button></div></div><button type="button" data-skin-bulk-remove="${n}" aria-label="移除${escapeHtml(item.name)}">移除图片</button></div>`;
  }).join('');
 }
 function selectionText(item){return item.skip?'已跳过本张':item.targets.length===SKIN_APPS.length?'已选全部17个应用':item.targets.length?SKIN_APPS.filter(([id])=>item.targets.includes(id)).map(([,label])=>label).join('、'):'尚未选择应用，点上方展开勾选。';}
 function list(){root.querySelector('[data-skin-list]').innerHTML=customThemes().map(theme=>{
  const active=readTheme()?.id===theme.id;const picture=theme.home||theme.lock;
  return `<article class="wp-skin-saved" data-skin-id="${theme.id}"><h3>${escapeHtml(theme.name)}${active?' · 使用中':''}</h3><div class="wp-skin-saved-preview">${picture?`<img src="${picture}" alt="壁纸">`:''}<div>${Object.entries(theme.iconMap).slice(0,8).map(([id,url])=>`<img src="${url}" alt="${escapeHtml(SKIN_APPS.find(([key])=>key===id)?.[1]||id)}">`).join('')}</div></div><div class="wp-theme-actions"><button type="button" data-skin-use>应用</button><button type="button" data-skin-edit>编辑</button><button type="button" data-skin-export>导出分享</button><button type="button" data-skin-delete>删除</button></div></article>`;
 }).join('')||'<p>还没有自定义皮肤。制作后可以导出成一个文件分享。</p>';}
 function previews(){
  release();const same=root.querySelector('[data-skin-same]').checked;
  root.querySelector('[data-skin-wallpaper="lock"]').hidden=same;
  const available={home:!!draft.home,lock:!!(same?draft.home:draft.lock),icons:!!Object.keys(draft.icons).length};
  for(const box of root.querySelectorAll('[data-skin-part]'))if(!box.dataset.manual)box.checked=available[box.dataset.skinPart];
  for(const node of root.querySelectorAll('[data-skin-preview]')){
   const key=node.dataset.skinPreview;const blob=key.startsWith('icon:')?draft.icons[key.slice(5)]:draft[key];
   if(blob){const url=URL.createObjectURL(blob);urls.set(key,url);node.innerHTML=`<img src="${url}" alt="已选择">`;}
   else node.textContent=key.startsWith('icon:')?'＋':'未选择';
  }
  bulkPreview();
 }
 function open(theme){
  pending=[];
  draft=theme?{...theme.record,icons:{...theme.record.icons}}:{name:'',icons:{}};
  root.querySelector('[data-skin-name]').value=draft.name;
  root.querySelector('[data-skin-same]').checked=!theme||draft.home===draft.lock;
  for(const box of root.querySelectorAll('[data-skin-part]'))delete box.dataset.manual;
  editor.hidden=false;previews();editor.scrollIntoView?.({block:'nearest'});
 }
 async function work(task){
  if(busy)return;busy=true;root.setAttribute('aria-busy','true');
  const controls=[...root.querySelectorAll('button,input,select')];const disabled=controls.map(node=>node.disabled);controls.forEach(node=>node.disabled=true);
  try{await task();}catch(error){message(error.message||'操作失败，请重试。');}
  finally{busy=false;root.removeAttribute('aria-busy');controls.forEach((node,n)=>node.disabled=disabled[n]);}
 }
 root.querySelector('[data-skin-new]').addEventListener('click',()=>{open();message('先选壁纸和图标，保存后就能使用。');});
 root.querySelector('[data-skin-upload-icons]').addEventListener('click',()=>{
  if(editor.hidden)open();root.querySelector('[data-skin-bulk]').click();
 });
 root.querySelector('[data-skin-cancel]').addEventListener('click',()=>{pending=[];editor.hidden=true;release();message('已取消编辑。');});
 root.querySelector('[data-skin-same]').addEventListener('change',previews);
 for(const box of root.querySelectorAll('[data-skin-part]'))box.addEventListener('change',()=>box.dataset.manual='true');
 for(const input of root.querySelectorAll('[data-skin-file]'))input.addEventListener('change',()=>work(async()=>{
  const file=input.files?.[0];if(!file)return;const image=await validateSkinImage(file);
  const key=input.dataset.skinFile;if(key.startsWith('icon:'))draft.icons[key.slice(5)]=image;else draft[key]=image;
  input.value='';previews();message('图片已选好，保存后生效。');
 }));
 root.querySelector('[data-skin-bulk]').addEventListener('change',event=>work(async()=>{
  const files=[...event.target.files];event.target.value='';if(!files.length)return;
  if(files.length+pending.length>SKIN_APPS.length)throw new Error('待分配图标最多17张，请先添加或移除当前图片。');
  const rejected=[];let added=0;
  for(const file of files){
   try{const blob=await validateSkinImage(file);
    if(pending.reduce((sum,item)=>sum+item.blob.size,0)+blob.size>MAX_SKIN_BYTES)throw new Error('待分配图片总大小不能超过40MB。');
    const target=guessSkinApp(file.name);pending.push({name:file.name,blob,targets:target?[target]:[],skip:false});added++;}
   catch(error){rejected.push(file.name+'：'+error.message);}
  }
  previews();message(`已读入${added}张图片，请核对应用后添加。${rejected.length?'未读入：'+rejected.join('；'):''}`);
  if(pending.length)root.querySelector('[data-skin-bulk-panel]').scrollIntoView?.({block:'start'});
 }));
 root.addEventListener('change',event=>{
  const checkbox=event.target.closest('[data-skin-bulk-app]'),n=Number(checkbox?.dataset.skinBulkIndex),item=pending[n];
  if(checkbox&&item){
   const id=checkbox.dataset.skinBulkApp;item.targets=item.targets.filter(value=>value!==id);if(checkbox.checked)item.targets.push(id);item.skip=false;
   root.querySelector(`[data-skin-bulk-target="${n}"] summary`).textContent=`选择应用（已选${item.targets.length}个，可多选）`;
   root.querySelector(`[data-skin-bulk-selection="${n}"]`).textContent=selectionText(item);message('已调整应用对应，请核对后添加。');
  }
 });
 root.querySelector('[data-skin-bulk-fill]').addEventListener('click',()=>{
  if(pending.length===1){pending[0].targets=SKIN_APPS.map(([id])=>id);pending[0].skip=false;previews();message('已选全部17个应用，添加后将用这张图片替换这些应用的图标。');return;}
  const used=new Set([...Object.keys(draft.icons),...pending.flatMap(item=>item.targets)]);
  const available=SKIN_APPS.map(([id])=>id).filter(id=>!used.has(id));
  let filled=0;for(const item of pending)if(!item.skip&&!item.targets.length&&available.length){item.targets=[available.shift()];filled++;}
  previews();message(filled?`已按顺序分配${filled}张图片，保留已有分配。请核对后添加。`:'没有可填充的空项。每张图片可展开勾选多个应用，或先清空选择。');
 });
 root.querySelector('[data-skin-bulk-confirm]').addEventListener('click',()=>work(async()=>{
  const selected=pending.filter(item=>!item.skip),seen=new Set();
  for(const item of selected){
   if(!item.targets.length)throw new Error('还有图片未选择应用，请勾选应用或点“跳过本张”。');
   for(const id of item.targets){if(!SKIN_APPS.some(([app])=>app===id))throw new Error('无法识别的应用。');
    if(seen.has(id))throw new Error('同一应用对应了多张图片，请调整后再添加。');seen.add(id);}
  }
  for(const item of selected)for(const id of item.targets)draft.icons[id]=item.blob;
  pending=[];previews();message(`已添加${seen.size}个应用图标，点“保存并应用”后生效。`);
 }));
 root.querySelector('[data-skin-bulk-cancel]').addEventListener('click',()=>{pending=[];previews();message('已取消本次选择，之前的图标保留。');});
 root.querySelector('[data-skin-import]').addEventListener('change',event=>work(async()=>{
  const file=event.target.files?.[0];if(!file)return;message('正在导入皮肤…');const theme=await importCustomTheme(file);
  event.target.value='';open(theme);list();message('导入成功。可以预览或调整，再点“保存并应用”。');changed();
 }));
 editor.addEventListener('submit',event=>{event.preventDefault();work(async()=>{
  if(pending.length)throw new Error('还有待分配图片，请先添加所选图标或取消本次选择。');
  const parts=Object.fromEntries([...root.querySelectorAll('[data-skin-part]')].map(node=>[node.dataset.skinPart,node.checked]));
  if(!Object.values(parts).some(Boolean))throw new Error('请至少勾选一项。');
  const lock=root.querySelector('[data-skin-same]').checked?draft.home:draft.lock;
  if(parts.home&&!draft.home||parts.lock&&!lock||parts.icons&&!Object.keys(draft.icons).length)throw new Error('勾选的位置还没有图片，请上传或取消勾选。');
  const theme=await saveCustomTheme({...draft,name:root.querySelector('[data-skin-name]').value,lock});
  await apply(theme.id,parts);draft={...theme.record,icons:{...theme.record.icons}};editor.hidden=true;release();list();message('皮肤已保存并应用。');changed();
 });});
 root.addEventListener('click',event=>{
  const choice=event.target.closest('[data-skin-bulk-all],[data-skin-bulk-none],[data-skin-bulk-skip]');
  if(choice){const n=Number(choice.dataset.skinBulkAll??choice.dataset.skinBulkNone??choice.dataset.skinBulkSkip),item=pending[n];if(!item)return;
   item.targets=choice.hasAttribute('data-skin-bulk-all')?SKIN_APPS.map(([id])=>id):[];item.skip=choice.hasAttribute('data-skin-bulk-skip');
   previews();message(item.skip?'已跳过本张图片。':item.targets.length?'已选全部17个应用，核对后添加。':'已清空这张图片的应用选择，可以重新勾选。');return;
  }
  const remove=event.target.closest('[data-skin-bulk-remove]');if(remove){pending.splice(Number(remove.dataset.skinBulkRemove),1);previews();message('已移除待分配图片。');return;}
  const clear=event.target.closest('[data-skin-clear]');if(clear){const key=clear.dataset.skinClear;if(key.startsWith('icon:'))delete draft.icons[key.slice(5)];else delete draft[key];previews();return;}
  const card=event.target.closest('[data-skin-id]');if(!card)return;const id=card.dataset.skinId;
  if(event.target.closest('[data-skin-edit]')){open(customThemes().find(theme=>theme.id===id));message('调整后保存即可更新这套皮肤。');return;}
  if(event.target.closest('[data-skin-use]'))work(async()=>{const t=customThemes().find(theme=>theme.id===id);await apply(id,{home:!!t.home,lock:!!t.lock,icons:!!Object.keys(t.iconMap).length});list();message('已应用这套皮肤。');changed();});
  if(event.target.closest('[data-skin-export]'))work(async()=>{
   const value=await exportCustomTheme(id),blob=new Blob([JSON.stringify(value)],{type:'application/json'}),url=URL.createObjectURL(blob);
   const a=document.createElement('a');a.href=url;a.download=value.name.replace(/[\\/:*?"<>|]/g,'_')+'.phone-theme.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30_000);message('已导出整套皮肤，可以把这个文件分享给朋友。');
  });
  if(event.target.closest('[data-skin-delete]'))work(async()=>{
   if(!confirm('删除这套自定义皮肤？已导出的分享文件不受影响。'))return;
   const active=readTheme()?.id===id;await deleteCustomTheme(id);if(active)await reset();if(draft.id===id){editor.hidden=true;release();}list();message('皮肤已删除。');changed();
  });
 });
 loadCustomThemes().then(list).catch(error=>{list();message(error.message);});
}
