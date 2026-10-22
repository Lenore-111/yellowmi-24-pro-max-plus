import {FARM_STORAGE_KEY,FARM_CROPS,FARM_FERTILIZER,FARM_ANIMALS,FARM_ANIMAL_LIMIT,FARM_FEED_PRICE,readFarm,farmCrop,farmPlotStatus,selectFarmCrop,buyFarmSeeds,buyFarmFertilizer,plantFarm,harvestFarm,fertilizeFarm,subscribeFarm,farmAnimal,farmAnimalStatus,buyFarmAnimal,buyFarmFeed,feedFarmAnimals,collectFarmProducts} from './echo-farm.js';
import {farmSprite} from './echo-farm-art.js';
import {FARM_MAP_WIDTH,FARM_MAP_HEIGHT,farmMapLandscape,farmSoil,farmPlotPosition,farmAnimalPosition,farmAnimalSprite} from './echo-farm-map-art.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>Number(value).toLocaleString('zh-CN');
const time=seconds=>seconds>=60?Math.floor(seconds/60)+'分'+(seconds%60?seconds%60+'秒':''):seconds+'秒';
const CAMERA_KEY='echo_farm_camera_v1';
const icon=name=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="square" stroke-linejoin="miter">'+({field:'<path d="M3 9l9-5 9 5v9l-9 4-9-4zM3 9l9 4 9-4M12 13v9M7 7l10 5M7 16l4 2"/>',pasture:'<path d="M4 10l3-4h10l3 4v9H4zM8 4v4m8-4v4M8 13h1m6 0h1M9 19v-3h6v3"/>',shop:'<path d="M3 9l2-5h14l2 5v4H3zM5 13v8h14v-8M9 21v-5h6v5M8 4v9m8-9v9"/>',bag:'<path d="M7 8V6a5 5 0 0110 0v2M4 8h16l1 14H3zM8 13h8m-8 4h8"/>',seed:'<path d="M12 21V10M12 15C4 15 4 9 4 9c7 0 8 6 8 6zM12 11c0-7 8-8 8-8s0 8-8 8z"/>',basket:'<path d="M3 10h18l-3 11H6zM7 10l5-8 5 8M9 13v5m6-5v5"/>',feed:'<path d="M5 8h14l2 13H3zM8 8L6 3h12l-2 5M12 12v6m-3-4l3 2 3-2"/>',home:'<path d="M3 11l9-8 9 8M5 10v11h14V10M10 21v-7h4v7"/>'}[name]||'')+'</svg>';

export function renderEchoFarm(screen,{goHome,storage=globalThis.localStorage,now=()=>Date.now()}={}) {
 const root=document.createElement('section');root.className='wp-view wp-native-app echo-farm-app';root.dataset.echoFarm='2';screen.replaceChildren(root);
 let state,failed=false,disposed=false,performing=false,mode='field',sheet='',shopTab='seeds',selectedPlot=null,selectedAnimal=null,notice='',noticeError=false;
 let camera={zoom:.74,x:443,y:450},drag=null,suppressClickUntil=0,cameraTimer,paintedSelection='';
 try{const saved=JSON.parse(storage?.getItem(CAMERA_KEY)||'null');if(saved&&[saved.zoom,saved.x,saved.y].every(Number.isFinite))camera={zoom:Math.min(1.25,Math.max(.55,saved.zoom)),x:Math.min(FARM_MAP_WIDTH,Math.max(0,saved.x)),y:Math.min(FARM_MAP_HEIGHT,Math.max(0,saved.y))};}catch{}
 try{state=readFarm(storage);}catch(error){failed=true;notice=error.message;}
 const current=()=>!disposed&&root.parentElement===screen;
 const landscape=farmMapLandscape();
 const summary=()=>({empty:state.plots.filter(p=>!p).length,ready:state.plots.filter(p=>farmPlotStatus(p,now()).kind==='ready').length,products:state.animals.filter(a=>farmAnimalStatus(a,now()).kind==='ready').length});
 function captureCamera(){const v=root.querySelector('.farm-map-viewport');if(v){camera.x=(v.scrollLeft+v.clientWidth/2)/camera.zoom;camera.y=(v.scrollTop+v.clientHeight/2)/camera.zoom;}}
 function saveCamera(){captureCamera();try{storage.setItem(CAMERA_KEY,JSON.stringify(camera));}catch{}}
 function placeCamera(){const v=root.querySelector('.farm-map-viewport');if(v){v.scrollLeft=camera.x*camera.zoom-v.clientWidth/2;v.scrollTop=camera.y*camera.zoom-v.clientHeight/2;}}
 function plotContent(index){
  const plot=state.plots[index],status=farmPlotStatus(plot,now()),crop=farmCrop(plot?.cropId);
  const spots=[[30,34],[54,46],[78,58],[54,22],[78,34],[102,46]];
  return '<button type="button" class="farm-plot" data-farm-action="plot" data-farm-plot="'+index+'" data-farm-kind="'+status.kind+'" data-farm-stage="'+status.stage+'" aria-label="'+esc((index+1)+'号地，'+(crop?crop.name+'，'+(status.kind==='ready'?'可以收获':time(status.remaining)+'后成熟'):'空地，点击播种'+farmCrop(state.selectedCrop).name))+'">'+farmSoil(selectedPlot===index)+'</button><span class="farm-crops" aria-hidden="true">'+(crop?spots.map(([x,y])=>'<span style="left:'+x+'px;top:'+y+'px">'+farmSprite(crop.id,status.stage)+'</span>').join(''):'')+'</span><span class="farm-plot-label" aria-hidden="true">'+(status.kind==='ready'?'<i class="farm-ready-star">✦</i>':selectedPlot===index?esc(crop?time(status.remaining):'空地'):String(index+1).padStart(2,'0'))+'</span>';
 }
 function animalContent(animal){
  const kind=farmAnimal(animal.kind),status=farmAnimalStatus(animal,now());
  return '<button type="button" class="farm-animal is-'+animal.kind+'" data-farm-action="animal" data-farm-animal="'+animal.id+'" aria-label="'+esc(kind.name+' '+animal.id+'号，'+(status.kind==='ready'?kind.product+'可以收取':status.kind==='hungry'?'可以喂养':time(status.remaining)+'后可收取'+kind.product))+'"><span class="farm-animal-walk">'+farmAnimalSprite(animal.kind)+'</span><span class="farm-animal-status" aria-hidden="true">'+(status.kind==='ready'?'✦':status.kind==='hungry'?'♡':'')+'</span></button>';
 }
 function world(){
  const animalIndices={chicken:0,pasture:0};
  return '<div class="farm-map-space" style="width:'+FARM_MAP_WIDTH*camera.zoom+'px;height:'+FARM_MAP_HEIGHT*camera.zoom+'px"><div class="farm-world" style="transform:scale('+camera.zoom+')">'+landscape+
   '<div class="farm-world-sign" style="left:284px;top:125px">晴日谷仓</div><div class="farm-world-sign" style="left:609px;top:268px">牛羊牧场</div><div class="farm-world-sign" style="left:211px;top:527px">小鸡的家</div>'+
   state.plots.map((_,index)=>{const p=farmPlotPosition(index);return '<div class="farm-tile" style="left:'+(p.x-64)+'px;top:'+(p.y-40)+'px;z-index:'+Math.round(p.y)+'" data-farm-tile="'+index+'">'+plotContent(index)+'</div>';}).join('')+
   state.animals.map(animal=>{const group=animal.kind==='chicken'?'chicken':'pasture',n=animalIndices[group]++,p=farmAnimalPosition(animal,n);return '<div class="farm-animal-slot" style="left:'+p.x+'px;top:'+p.y+'px;z-index:'+Math.round(p.y+50)+';--wander:'+(n%2?-1:1)+';--delay:-'+(n*1.3+animal.id%5)+'s">'+animalContent(animal)+'</div>';}).join('')+
   (!state.animals.some(a=>a.kind!=='chicken')?'<button class="farm-pen-empty" style="left:613px;top:377px" data-farm-action="animals-shop">＋ 接牛羊回家</button>':'')+
   (!state.animals.some(a=>a.kind==='chicken')?'<button class="farm-pen-empty" style="left:227px;top:618px" data-farm-action="animals-shop">＋ 养几只小鸡</button>':'')+'</div></div>';
 }
 function selection(){
  if(selectedAnimal!==null){const animal=state.animals.find(a=>a.id===selectedAnimal);if(!animal)return '';const status=farmAnimalStatus(animal,now()),kind=farmAnimal(animal.kind);
   return '<aside class="farm-selection" aria-label="选中的动物"><span class="farm-selection-icon">'+farmAnimalSprite(animal.kind)+'</span><div><b>'+kind.name+' · '+animal.id+'号</b><small data-farm-animal-countdown>'+ (status.kind==='ready'?kind.product+'好了，收下来吧':status.kind==='hungry'?'吃饱后产出'+kind.product:time(status.remaining)+'后可收取'+kind.product)+'</small></div>'+(status.kind==='hungry'?'<button data-farm-action="feed-one" '+(!state.feed?'disabled':'')+'>喂养</button>':status.kind==='ready'?'<button data-farm-action="collect-one">收取</button>':'')+'<button class="farm-selection-close" data-farm-action="deselect" aria-label="关闭动物信息">×</button></aside>';
  }
  if(selectedPlot!==null){const plot=state.plots[selectedPlot],status=farmPlotStatus(plot,now()),crop=farmCrop(plot?.cropId);return '<aside class="farm-selection" aria-label="选中的田地"><span class="farm-selection-icon">'+farmSprite(crop?.id||state.selectedCrop,status.kind==='empty'?'crop':status.stage)+'</span><div><b>'+(selectedPlot+1)+'号地 · '+esc(crop?.name||'空地')+'</b><small data-farm-plot-countdown>'+(crop?(status.kind==='ready'?'作物成熟啦':time(status.remaining)+'后成熟'):'点一下就能播种')+'</small></div>'+(status.kind==='growing'?'<button data-farm-action="fertilize-one" '+(!state.fertilizer?'disabled':'')+'>施肥 '+state.fertilizer+'</button>':'')+'<button class="farm-selection-close" data-farm-action="deselect" aria-label="关闭田地信息">×</button></aside>';}
  return '';
 }
 function dock(){
  const s=summary(),crop=farmCrop(state.selectedCrop),hungry=state.animals.some(a=>a.readyAt===null);
  return '<footer class="farm-dock"><div class="farm-tool-summary">'+(mode==='field'?'<label class="farm-crop-picker">'+farmSprite(crop.id)+'<select data-farm-select aria-label="选择播种的种子">'+FARM_CROPS.map(c=>'<option value="'+c.id+'" '+(c.id===crop.id?'selected':'')+'>'+c.name+' × '+state.seeds[c.id]+'</option>').join('')+'</select></label><button data-farm-action="supplies-shop" class="farm-supply">快生肥 × '+state.fertilizer+' ＋</button>':'<span class="farm-feed-summary">'+icon('feed')+'饲料 × '+state.feed+'</span><button data-farm-action="animals-shop" class="farm-supply">动物 '+state.animals.length+'/'+FARM_ANIMAL_LIMIT+' ＋</button>')+'</div><div class="farm-batch">'+(mode==='field'?'<button data-farm-action="plant-all" '+(!s.empty||!state.seeds[crop.id]?'disabled':'')+'>'+icon('seed')+'一键播种</button><button data-farm-action="harvest-all" '+(!s.ready?'disabled':'')+'>'+icon('basket')+'收获'+(s.ready?' · '+s.ready:'')+'</button>':'<button data-farm-action="feed-all" '+(!hungry||!state.feed?'disabled':'')+'>'+icon('feed')+'喂养全部</button><button data-farm-action="collect-all" '+(!s.products?'disabled':'')+'>'+icon('basket')+'收取'+(s.products?' · '+s.products:'产物')+'</button>')+'</div><nav class="farm-nav" aria-label="农场导航">'+[['field','field','田地'],['pasture','pasture','牧场'],['shop','shop','商店'],['records','bag','仓库']].map(([action,symbol,label])=>'<button data-farm-action="'+action+'" aria-current="'+((sheet||mode)===action?'page':'false')+'">'+icon(symbol)+'<span>'+label+'</span></button>').join('')+'</nav></footer>';
 }
 function shop(){
  return '<div class="farm-shop-tabs" role="group" aria-label="商店分类">'+[['seeds','种子'],['animals','动物'],['supplies','补给']].map(([id,label])=>'<button data-farm-action="shop-tab" data-farm-shop-tab="'+id+'" aria-pressed="'+(shopTab===id)+'">'+label+'</button>').join('')+'</div>'+(shopTab==='seeds'?'<p class="farm-sheet-intro">种子 10～50 金币 · 收成自动卖出</p><div class="farm-shop-grid">'+FARM_CROPS.map(crop=>'<article class="farm-shop-card"><div class="farm-shop-art">'+farmSprite(crop.id)+'</div><b>'+crop.name+'</b><small>'+time(crop.seconds)+'成熟 · 库存 '+state.seeds[crop.id]+'</small><span>收成 '+crop.sale+' 金币</span><div class="farm-buy-buttons"><button data-farm-action="buy-seed" data-farm-crop="'+crop.id+'" data-farm-quantity="1" '+(state.coins<crop.price?'disabled':'')+'>'+crop.price+' / 1颗</button><button data-farm-action="buy-seed" data-farm-crop="'+crop.id+'" data-farm-quantity="16" '+(state.coins<crop.price*16?'disabled':'')+'>'+crop.price*16+' / 16颗</button></div><button class="farm-use-seed" data-farm-action="choose-seed" data-farm-crop="'+crop.id+'">选择播种 →</button></article>').join('')+'</div>':shopTab==='animals'?'<p class="farm-sheet-intro">每只吃 1 份饲料，产出后点击收取。最多养 12 只。</p><div class="farm-animal-shop">'+FARM_ANIMALS.map(kind=>'<article class="farm-shop-card"><div class="farm-shop-art">'+farmAnimalSprite(kind.id)+'</div><div><b>'+kind.name+'</b><small>'+time(kind.seconds)+'产出'+kind.product+'</small><span>每份卖 '+kind.sale+' 金币</span></div><button data-farm-action="buy-animal" data-farm-kind="'+kind.id+'" '+(state.coins<kind.price||state.animals.length>=12?'disabled':'')+'>'+kind.price+' 金币接回</button></article>').join('')+'</div><button class="farm-feed-purchase" data-farm-action="buy-feed" data-farm-quantity="12" '+(state.coins<120?'disabled':'')+'>'+icon('feed')+'饲料 12 份 · 120 金币</button><p class="farm-sheet-intro">吃过饭的动物会在牧区慢慢走，不需要一直在线守着。产物收下后再喂下一轮，不会饿死。</p>':'<div class="farm-supplies">'+[['feed','饲料','每只动物每轮吃 1 份',state.feed,FARM_FEED_PRICE],['fertilizer','快生肥','每袋给一块地加速 30 秒',state.fertilizer,FARM_FERTILIZER.price]].map(([id,label,description,count,price])=>'<article class="farm-shop-card"><b>'+label+' × '+count+'</b><small>'+description+'</small><div class="farm-buy-buttons">'+[1,16].map(q=>'<button data-farm-action="buy-'+id+'" data-farm-quantity="'+q+'" '+(state.coins<q*price?'disabled':'')+'>'+q+' 份 · '+q*price+' 金币</button>').join('')+'</div></article>').join('')+'<button class="farm-feed-purchase" data-farm-action="fertilize-all" '+(!state.fertilizer||!state.plots.some(p=>farmPlotStatus(p,now()).kind==='growing')?'disabled':'')+'>给生长中的田地一键施肥</button></div>');
 }
 function records(){return '<p class="farm-sheet-intro">农场金币单独保存，关闭页面也会继续生长。</p><div class="farm-record-stats">'+[['收获蔬菜',state.stats.harvested],['收取产物',state.animalStats.collected],['累计收入',state.stats.earned],['累计花费',state.stats.spent]].map(([label,n])=>'<div><small>'+label+'</small><b>'+number(n)+'</b></div>').join('')+'</div><h3>我的种子袋</h3><div class="farm-inventory">'+FARM_CROPS.map(c=>'<div>'+farmSprite(c.id)+'<span>'+c.name+'</span><b>× '+state.seeds[c.id]+'</b></div>').join('')+'</div><h3>最近的买卖</h3><div class="farm-ledger">'+(state.ledger.length?[...state.ledger].reverse().map(item=>'<div><span>'+esc(item.text)+'</span><b>'+ (item.amount>0?'+':'')+number(item.amount)+'</b></div>').join(''):'<p>先播下第一颗种子吧。</p>')+'</div>';}
 function modal(){return sheet?'<div class="farm-modal-shade" data-farm-action="close-sheet"></div><section class="farm-sheet" role="dialog" aria-modal="true" aria-label="'+(sheet==='shop'?'农场商店':'我的仓库')+'" tabindex="-1"><header><div><small>'+ (sheet==='shop'?'种下新的期待':'一点一滴，都是收获')+'</small><h2>'+(sheet==='shop'?'农场商店':'我的仓库')+'</h2></div><button data-farm-action="close-sheet" aria-label="关闭'+(sheet==='shop'?'商店':'仓库')+'">×</button></header><div class="farm-sheet-scroll">'+(sheet==='shop'?shop():records())+'</div></section>':'';}
 function selectionKey(){return selectedAnimal!==null?'animal:'+selectedAnimal+':'+farmAnimalStatus(state.animals.find(a=>a.id===selectedAnimal),now()).kind:selectedPlot!==null?'plot:'+selectedPlot+':'+farmPlotStatus(state.plots[selectedPlot],now()).kind:'';}
 function paint(preserveCamera=true){
  if(!current())return;if(preserveCamera)captureCamera();
  const scroll=root.querySelector('.farm-sheet-scroll')?.scrollTop||0,active=document.activeElement,focusKey=active&&root.contains(active)?JSON.stringify(active.dataset):null;
  const s=state?summary():null;
  root.innerHTML='<header class="farm-header"><button data-farm-action="back" aria-label="返回手机桌面">‹</button><div><small>一方小田 · 一群伙伴</small><h1>Echo 农场</h1></div><span class="farm-coins" aria-label="农场金币"><i>●</i><b>'+ (state?number(state.coins):'—')+'</b></span></header>'+(failed?'<div class="farm-storage-error" role="alert"><h2>农场暂时打不开</h2><p>'+esc(notice)+'</p><button data-farm-action="reload">重新读取存档</button></div>':'<div class="farm-notice '+(notice?'is-visible ':'')+(noticeError?'is-error':'')+'" role="status" aria-live="polite">'+esc(notice)+'</div><div class="farm-map-wrap" '+(sheet?'inert':'')+'><div class="farm-map-viewport" role="region" aria-label="可以拖动的农场地图" tabindex="0">'+world()+'</div><div class="farm-map-summary"><span data-farm-summary>'+ (mode==='field'?'空地 '+s.empty+' · 待收 '+s.ready:'动物 '+state.animals.length+' · 产物 '+s.products)+'</span><small>拖动地图，逛逛农场</small></div><div class="farm-map-controls" aria-label="地图视角"><button data-farm-action="zoom-in" aria-label="放大地图">＋</button><button data-farm-action="center" aria-label="回到'+(mode==='field'?'田地':'牧场')+'">'+icon('home')+'</button><button data-farm-action="zoom-out" aria-label="缩小地图">－</button></div><div class="farm-selection-host">'+selection()+'</div></div><div class="farm-dock-host" '+(sheet?'inert':'')+'>'+dock()+'</div>'+modal());
  placeCamera();paintedSelection=state&&!failed?selectionKey():'';const scroller=root.querySelector('.farm-sheet-scroll');if(scroller)scroller.scrollTop=scroll;
  if(focusKey){const target=[...root.querySelectorAll('button,select')].find(b=>JSON.stringify(b.dataset)===focusKey);target?.focus({preventScroll:true});}
 }
 function run(fn,message){performing=true;try{const result=fn();state=result.state;notice=typeof message==='function'?message(result):message;noticeError=false;}catch(error){notice=error.message;noticeError=true;}finally{performing=false;paint();}}
 function openSheet(name,category=shopTab){sheet=name;shopTab=category;notice='';paint();root.querySelector('.farm-sheet button')?.focus({preventScroll:true});}
 function moveTo(next){sheet='';mode=next;selectedAnimal=null;selectedPlot=null;notice='';paint();camera.x=next==='field'?443:620;camera.y=next==='field'?450:413;placeCamera();saveCamera();}
 const click=event=>{
  const button=event.target.closest?.('[data-farm-action]');if(!current()||!button||!root.contains(button)||button.disabled)return;
  if(performance.now()<suppressClickUntil&&button.closest('.farm-map-viewport')){event.preventDefault();return;}
  const action=button.dataset.farmAction,crop=button.dataset.farmCrop,count=Number(button.dataset.farmQuantity);
  if(action==='back'){saveCamera();goHome?.();return;}
  if(action==='reload'){try{state=readFarm(storage);failed=false;notice='存档已恢复。';noticeError=false;}catch(error){notice=error.message;}paint();return;}
  if(failed)return;
  if(action==='close-sheet'){sheet='';paint();root.querySelector('[data-farm-action="shop"]')?.focus({preventScroll:true});return;}
  if(action==='shop'||action==='records'){openSheet(action);return;}
  if(action==='animals-shop'||action==='supplies-shop'){openSheet('shop',action==='animals-shop'?'animals':'supplies');return;}
  if(action==='shop-tab'){shopTab=button.dataset.farmShopTab;paint();root.querySelector('.farm-sheet-scroll').scrollTop=0;return;}
  if(action==='field'||action==='pasture'){moveTo(action);return;}
  if(action==='deselect'){selectedPlot=null;selectedAnimal=null;paint();return;}
  if(action.startsWith('zoom-')){captureCamera();camera.zoom=Math.min(1.25,Math.max(.55,Math.round((camera.zoom+(action==='zoom-in'?.1:-.1))*100)/100));paint(false);placeCamera();saveCamera();return;}
  if(action==='center'){moveTo(mode);return;}
  if(action==='choose-seed'){sheet='';mode='field';run(()=>selectFarmCrop(crop,storage),'种子选好了，点空地就能播种。');return;}
  if(action==='buy-seed')run(()=>buyFarmSeeds(crop,count,storage,now()),r=>'装好了 '+r.count+' 颗'+farmCrop(crop).name+'种子。');
  else if(action==='buy-fertilizer')run(()=>buyFarmFertilizer(count,storage,now()),r=>'补充了 '+r.count+' 袋快生肥。');
  else if(action==='buy-feed')run(()=>buyFarmFeed(count,storage,now()),r=>'装好了 '+r.count+' 份饲料。');
  else if(action==='buy-animal')run(()=>buyFarmAnimal(button.dataset.farmKind,storage,now()),r=>farmAnimal(r.animal.kind).name+'到家啦！去牧场喂一份饲料吧。');
  else if(action==='plant-all')run(()=>plantFarm(state.selectedCrop,null,storage,now()),r=>'播下了 '+r.count+' 块地，等一会儿就好。');
  else if(action==='harvest-all')run(()=>harvestFarm(null,storage,now()),r=>'收获 '+r.count+' 份蔬菜，赚到 '+number(r.income)+' 金币！');
  else if(action==='fertilize-all')run(()=>fertilizeFarm(null,storage,now()),r=>'给 '+r.count+' 块地施了肥，每块加速30秒。');
  else if(action==='fertilize-one')run(()=>fertilizeFarm([selectedPlot],storage,now()),'这块田地加速了30秒。');
  else if(action==='feed-all'||action==='feed-one')run(()=>feedFarmAnimals(action==='feed-one'?[selectedAnimal]:null,storage,now()),r=>'喂好了 '+r.count+' 只动物，等它们慢慢吃。');
  else if(action==='collect-all'||action==='collect-one')run(()=>collectFarmProducts(action==='collect-one'?[selectedAnimal]:null,storage,now()),r=>'收取 '+r.count+' 份产物，赚到 '+number(r.income)+' 金币！');
  else if(action==='animal'){selectedAnimal=Number(button.dataset.farmAnimal);selectedPlot=null;mode='pasture';paint();}
  else if(action==='plot'){
   const index=Number(button.dataset.farmPlot);selectedPlot=index;selectedAnimal=null;mode='field';
   try{state=readFarm(storage);}catch(error){failed=true;notice=error.message;paint();return;}
   const status=farmPlotStatus(state.plots[index],now());
   if(status.kind==='empty')run(()=>plantFarm(state.selectedCrop,[index],storage,now()),'种下了'+farmCrop(state.selectedCrop).name+'。');
   else if(status.kind==='ready')run(()=>harvestFarm([index],storage,now()),r=>'收获啦，+'+r.income+' 金币！');
   else{notice='';paint();}
  }
 };
 const change=event=>{if(current()&&event.target.matches('[data-farm-select]'))run(()=>selectFarmCrop(event.target.value,storage),'换好了种子。');};
 const down=event=>{const v=event.target.closest?.('.farm-map-viewport');if(!v||sheet||event.pointerType==='touch'||event.button!==0)return;drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:v.scrollLeft,top:v.scrollTop,viewport:v,moved:false};};
 const move=event=>{if(!drag||event.pointerId!==drag.id)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(!drag.moved&&Math.hypot(dx,dy)<7)return;drag.moved=true;drag.viewport.setPointerCapture?.(event.pointerId);drag.viewport.scrollLeft=drag.left-dx;drag.viewport.scrollTop=drag.top-dy;root.classList.add('is-dragging');event.preventDefault();};
 const up=event=>{if(!drag||event.pointerId!==drag.id)return;if(drag.moved){suppressClickUntil=performance.now()+350;saveCamera();}drag=null;root.classList.remove('is-dragging');};
 const scroll=event=>{if(!event.target.matches?.('.farm-map-viewport'))return;clearTimeout(cameraTimer);cameraTimer=setTimeout(saveCamera,180);};
 const keydown=event=>{if(!sheet)return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();sheet='';paint();root.querySelector('[data-farm-action="shop"]')?.focus();}else if(event.key==='Tab'){const nodes=[...root.querySelectorAll('.farm-sheet button:not(:disabled),.farm-sheet select')];if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}};
 function update(){
  if(!current()||failed||document.hidden)return;
  let changed=false;
  for(let i=0;i<state.plots.length;i++){const status=farmPlotStatus(state.plots[i],now()),b=root.querySelector('[data-farm-plot="'+i+'"]');if(b&&(b.dataset.farmKind!==status.kind||b.dataset.farmStage!==status.stage)){root.querySelector('[data-farm-tile="'+i+'"]').innerHTML=plotContent(i);changed=true;}}
  for(const animal of state.animals){const b=root.querySelector('[data-farm-animal="'+animal.id+'"]');if(!b)continue;const s=farmAnimalStatus(animal,now()),marker=s.kind==='ready'?'✦':s.kind==='hungry'?'♡':'';if(b.querySelector('.farm-animal-status').textContent!==marker){b.parentElement.innerHTML=animalContent(animal);changed=true;}}
  const info=root.querySelector('.farm-selection-host'),key=selectionKey();if(info&&key!==paintedSelection){info.innerHTML=selection();paintedSelection=key;}else if(info){
   const animal=state.animals.find(a=>a.id===selectedAnimal),text=info.querySelector('[data-farm-animal-countdown]');if(animal&&text){const status=farmAnimalStatus(animal,now()),kind=farmAnimal(animal.kind);text.textContent=status.kind==='ready'?kind.product+'好了，收下来吧':status.kind==='hungry'?'吃饱后产出'+kind.product:time(status.remaining)+'后可收取'+kind.product;}
   const plot=state.plots[selectedPlot],ptext=info.querySelector('[data-farm-plot-countdown]');if(plot&&ptext){const status=farmPlotStatus(plot,now());ptext.textContent=status.kind==='ready'?'作物成熟啦':time(status.remaining)+'后成熟';}
  }
  if(changed){const s=summary();const text=root.querySelector('[data-farm-summary]');if(text)text.textContent=mode==='field'?'空地 '+s.empty+' · 待收 '+s.ready:'动物 '+state.animals.length+' · 产物 '+s.products;const d=root.querySelector('.farm-dock-host');if(d)d.innerHTML=dock();}
 }
 const onStorage=event=>{if(current()&&(!event.storageArea||event.storageArea===storage)&&(event.key===FARM_STORAGE_KEY||event.key===null)){try{state=readFarm(storage);failed=false;}catch(error){failed=true;notice=error.message;}paint();}};
 const unsubscribe=subscribeFarm((next,area)=>{if(current()&&area===storage){state=next;if(!performing)paint();}});
 root.addEventListener('click',click);root.addEventListener('change',change);root.addEventListener('pointerdown',down);root.addEventListener('pointermove',move);root.addEventListener('pointerup',up);root.addEventListener('pointercancel',up);root.addEventListener('scroll',scroll,true);root.addEventListener('keydown',keydown);
 globalThis.addEventListener?.('storage',onStorage);document.addEventListener('visibilitychange',update);
 const timer=setInterval(update,1000);paint();
 return ()=>{if(disposed)return;saveCamera();disposed=true;clearInterval(timer);clearTimeout(cameraTimer);unsubscribe();for(const [type,fn]of [['click',click],['change',change],['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up],['keydown',keydown]])root.removeEventListener(type,fn);root.removeEventListener('scroll',scroll,true);globalThis.removeEventListener?.('storage',onStorage);document.removeEventListener('visibilitychange',update);};
}
