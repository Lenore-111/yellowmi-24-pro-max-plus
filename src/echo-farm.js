export const FARM_STORAGE_KEY = 'echo_farm_v1';
export const FARM_PLOT_COUNT = 16;
export const FARM_FERTILIZER = Object.freeze({price:20,seconds:30});
export const FARM_FEED_PRICE = 10;
export const FARM_ANIMAL_LIMIT = 12;
export const FARM_ANIMALS = Object.freeze([
  {id:'chicken',name:'小鸡',price:120,seconds:60,product:'鸡蛋',sale:80},
  {id:'sheep',name:'绵羊',price:350,seconds:90,product:'羊毛',sale:180},
  {id:'cow',name:'奶牛',price:700,seconds:120,product:'牛奶',sale:240},
].map(animal=>Object.freeze(animal)));
export const farmAnimal = id=>FARM_ANIMALS.find(animal=>animal.id===id)||null;
export const FARM_CROPS = Object.freeze([
  {id:'carrot',name:'胡萝卜',price:10,multiplier:10,seconds:35},
  {id:'potato',name:'土豆',price:12,multiplier:11,seconds:45},
  {id:'lettuce',name:'生菜',price:15,multiplier:12,seconds:55},
  {id:'tomato',name:'番茄',price:18,multiplier:13,seconds:65},
  {id:'cucumber',name:'黄瓜',price:20,multiplier:14,seconds:75},
  {id:'corn',name:'玉米',price:25,multiplier:15,seconds:85},
  {id:'eggplant',name:'茄子',price:30,multiplier:16,seconds:95},
  {id:'pepper',name:'甜椒',price:35,multiplier:17,seconds:105},
  {id:'broccoli',name:'西兰花',price:40,multiplier:18,seconds:120},
  {id:'pumpkin',name:'南瓜',price:50,multiplier:20,seconds:150},
].map(crop=>Object.freeze({...crop,sale:crop.price*crop.multiplier})));
const byId = new Map(FARM_CROPS.map(crop=>[crop.id,crop]));
const listeners = new Set();
const integer = (value,fallback=0,max=1e12)=>Number.isFinite(Number(value))?Math.min(max,Math.max(0,Math.floor(Number(value)))):fallback;
const copy = value=>JSON.parse(JSON.stringify(value));
export const farmCrop = id=>byId.get(id) || null;

export function createFarmState() {
  return {version:2,coins:1000,seeds:Object.fromEntries(FARM_CROPS.map(crop=>[crop.id,crop.id==='carrot'?16:0])),fertilizer:0,
    animals:[],feed:0,nextAnimalId:1,animalStats:{bought:0,fed:0,collected:0},
    plots:Array(FARM_PLOT_COUNT).fill(null),selectedCrop:'carrot',stats:{planted:0,harvested:0,earned:0,spent:0,fertilized:0},ledger:[]};
}
export function normalizeFarmState(raw) {
  if (!raw || ![1,2].includes(raw.version)) throw new Error('农场存档无法读取，原存档未被覆盖。');
  if(raw.version===2&&(!Array.isArray(raw.animals)||raw.animals.length>FARM_ANIMAL_LIMIT))throw new Error('牧场存档无法读取，原存档未被覆盖。');
  const seen=new Set();
  const animals=(raw.version===1?[]:raw.animals).map(animal=>{
    const kind=farmAnimal(animal?.kind),id=integer(animal?.id,0,Number.MAX_SAFE_INTEGER);
    if(!kind||!id||seen.has(id)||(animal.readyAt!==null&&(!Number.isSafeInteger(animal.readyAt)||animal.readyAt<0)))throw new Error('牧场存档无法读取，原存档未被覆盖。');
    seen.add(id);
    return {id,kind:kind.id,readyAt:animal.readyAt===null?null:integer(animal.readyAt,0,Number.MAX_SAFE_INTEGER)};
  });
  return {version:2,coins:integer(raw.coins),seeds:Object.fromEntries(FARM_CROPS.map(crop=>[crop.id,integer(raw.seeds?.[crop.id],0,999999)])),
    animals,feed:integer(raw.feed,0,999999),nextAnimalId:Math.max(integer(raw.nextAnimalId,1,Number.MAX_SAFE_INTEGER),1,...animals.map(animal=>animal.id+1)),
    animalStats:Object.fromEntries(['bought','fed','collected'].map(key=>[key,integer(raw.animalStats?.[key])])),
    fertilizer:integer(raw.fertilizer,0,999999),selectedCrop:byId.has(raw.selectedCrop)?raw.selectedCrop:'carrot',
    plots:Array.from({length:FARM_PLOT_COUNT},(_,index)=>{
      const plot=raw.plots?.[index],crop=farmCrop(plot?.cropId);
      if (!crop) return null;
      const plantedAt=integer(plot.plantedAt,0,Number.MAX_SAFE_INTEGER);
      return {cropId:crop.id,plantedAt,readyAt:Math.min(plantedAt+crop.seconds*1000,Math.max(plantedAt,integer(plot.readyAt,plantedAt,Number.MAX_SAFE_INTEGER)))};
    }),
    stats:Object.fromEntries(['planted','harvested','earned','spent','fertilized'].map(key=>[key,integer(raw.stats?.[key])])),
    ledger:(Array.isArray(raw.ledger)?raw.ledger:[]).slice(-30).map(item=>({text:String(item.text||'').slice(0,100),amount:Number.isFinite(Number(item.amount))?Math.trunc(Number(item.amount)):0,at:integer(item.at,0,Number.MAX_SAFE_INTEGER)}))};
}
export function readFarm(storage=globalThis.localStorage) {
  if (!storage?.getItem || !storage?.setItem) throw new Error('当前浏览器无法保存农场，请检查站点存储设置。');
  const raw=storage.getItem(FARM_STORAGE_KEY);
  if (raw!==null) { try { return normalizeFarmState(JSON.parse(raw)); } catch(error) { throw new Error('农场存档无法读取，原存档未被覆盖。'); } }
  const state=createFarmState();
  storage.setItem(FARM_STORAGE_KEY,JSON.stringify(state));
  return state;
}
export function farmPlotStatus(plot,now=Date.now()) {
  if (!plot) return {kind:'empty',remaining:0,progress:0,stage:'empty'};
  const crop=farmCrop(plot.cropId),remaining=Math.max(0,plot.readyAt-now),progress=Math.min(1,Math.max(0,1-remaining/(crop.seconds*1000)));
  return {kind:remaining?'growing':'ready',remaining:Math.ceil(remaining/1000),progress,stage:remaining?(progress<.35?'sprout':progress<.7?'leaf':'crop'):'crop'};
}
function targets(indices) {
  const values=indices??Array.from({length:FARM_PLOT_COUNT},(_,index)=>index);
  if (!Array.isArray(values)||values.some(index=>!Number.isInteger(index)||index<0||index>=FARM_PLOT_COUNT)) throw new Error('这块土地不存在。');
  return [...new Set(values)];
}
function quantity(value) {if(!Number.isInteger(value)||value<1||value>9999)throw new Error('购买数量不正确。');return value;}
function record(state,text,amount,now) {state.ledger=[...state.ledger,{text,amount,at:now}].slice(-30);}
function transaction(storage,action,now=Date.now()) {
  const state=readFarm(storage),result=action(state,now),saved=normalizeFarmState(state);
  // No UI success or in-memory balance is published until storage accepts it.
  storage.setItem(FARM_STORAGE_KEY,JSON.stringify(saved));
  for (const listener of listeners) {try{listener(copy(saved),storage);}catch{}}
  return {...result,state:copy(saved)};
}
export function selectFarmCrop(cropId,storage=globalThis.localStorage) {
  return transaction(storage,state=>{if(!farmCrop(cropId))throw new Error('这种种子不存在。');state.selectedCrop=cropId;return{};});
}
export function buyFarmSeeds(cropId,count=1,storage=globalThis.localStorage,now=Date.now()) {
  return transaction(storage,state=>{
    const crop=farmCrop(cropId);if(!crop)throw new Error('这种种子不存在。');quantity(count);
    if(state.seeds[cropId]+count>999999)throw new Error('种子袋已经装满了。');
    const cost=crop.price*count;if(state.coins<cost)throw new Error('农场金币不够，先收一轮菜吧。');
    state.coins-=cost;state.seeds[cropId]+=count;state.stats.spent+=cost;record(state,`买入${count}颗${crop.name}种子`,-cost,now);
    return{count,cost};
  },now);
}
export function buyFarmFertilizer(count=1,storage=globalThis.localStorage,now=Date.now()) {
  return transaction(storage,state=>{
    quantity(count);if(state.fertilizer+count>999999)throw new Error('肥料仓已经装满了。');
    const cost=FARM_FERTILIZER.price*count;if(state.coins<cost)throw new Error('农场金币不够，先收一轮菜吧。');
    state.coins-=cost;state.fertilizer+=count;state.stats.spent+=cost;record(state,`买入${count}袋快生肥`,-cost,now);return{count,cost};
  },now);
}
export function plantFarm(cropId,indices=null,storage=globalThis.localStorage,now=Date.now()) {
  return transaction(storage,state=>{
    const crop=farmCrop(cropId);if(!crop)throw new Error('这种种子不存在。');
    const empty=targets(indices).filter(index=>!state.plots[index]);if(!empty.length)throw new Error('没有空地可以播种。');
    const count=Math.min(empty.length,state.seeds[cropId]);if(!count)throw new Error('种子用完了，去种子商店补一袋吧。');
    for(const index of empty.slice(0,count))state.plots[index]={cropId,plantedAt:now,readyAt:now+crop.seconds*1000};
    state.seeds[cropId]-=count;state.stats.planted+=count;state.selectedCrop=cropId;return{count};
  },now);
}
export function harvestFarm(indices=null,storage=globalThis.localStorage,now=Date.now()) {
  return transaction(storage,state=>{
    const ready=targets(indices).filter(index=>state.plots[index]&&farmPlotStatus(state.plots[index],now).kind==='ready');
    if(!ready.length)throw new Error('还没有成熟的菜，再等一小会儿。');
    const income=ready.reduce((sum,index)=>sum+farmCrop(state.plots[index].cropId).sale,0);
    if(state.coins+income>1e12)throw new Error('农场金币已达到存档上限。');
    for(const index of ready)state.plots[index]=null;
    state.coins+=income;state.stats.earned+=income;state.stats.harvested+=ready.length;record(state,`收获并卖出${ready.length}份蔬菜`,income,now);return{count:ready.length,income};
  },now);
}
export function fertilizeFarm(indices=null,storage=globalThis.localStorage,now=Date.now()) {
  return transaction(storage,state=>{
    const growing=targets(indices).filter(index=>state.plots[index]&&farmPlotStatus(state.plots[index],now).kind==='growing');
    if(!growing.length)throw new Error('目前没有需要加速的作物。');
    const count=Math.min(growing.length,state.fertilizer);if(!count)throw new Error('肥料用完了，去商店买几袋吧。');
    for(const index of growing.slice(0,count))state.plots[index].readyAt=Math.max(now,state.plots[index].readyAt-FARM_FERTILIZER.seconds*1000);
    state.fertilizer-=count;state.stats.fertilized+=count;return{count};
  },now);
}
export function subscribeFarm(listener) {listeners.add(listener);return()=>listeners.delete(listener);}


export function farmAnimalStatus(animal,now=Date.now()) {
  if(animal.readyAt===null)return {kind:'hungry',remaining:0};
  const remaining=Math.max(0,animal.readyAt-now);
  return {kind:remaining?'growing':'ready',remaining:Math.ceil(remaining/1000)};
}
export function buyFarmAnimal(kind,storage=globalThis.localStorage,now=Date.now()) {
  return transaction(storage,state=>{
    const item=farmAnimal(kind);if(!item)throw new Error('没有这种动物。');
    if(state.animals.length>=FARM_ANIMAL_LIMIT)throw new Error('牧场住满了，最多养12只动物。');
    if(state.coins<item.price)throw new Error('农场金币不够，先收一轮菜吧。');
    state.coins-=item.price;state.stats.spent+=item.price;
    const animal={id:state.nextAnimalId++,kind,readyAt:null};state.animals.push(animal);state.animalStats.bought++;
    record(state,`接回一只${item.name}`,-item.price,now);return {animal:copy(animal)};
  },now);
}
export function buyFarmFeed(count=1,storage=globalThis.localStorage,now=Date.now()) {
  return transaction(storage,state=>{
    quantity(count);if(state.feed+count>999999)throw new Error('饲料仓已经装满了。');
    const cost=FARM_FEED_PRICE*count;if(state.coins<cost)throw new Error('农场金币不够，先收一轮菜吧。');
    state.coins-=cost;state.feed+=count;state.stats.spent+=cost;record(state,`买入${count}份饲料`,-cost,now);return {count,cost};
  },now);
}
function animalTargets(state,ids) {
  if(ids===null)return state.animals;
  if(!Array.isArray(ids)||ids.some(id=>!state.animals.some(animal=>animal.id===id)))throw new Error('这只动物不在牧场里。');
  return state.animals.filter(animal=>ids.includes(animal.id));
}
export function feedFarmAnimals(ids=null,storage=globalThis.localStorage,now=Date.now()) {
  return transaction(storage,state=>{
    const hungry=animalTargets(state,ids).filter(animal=>animal.readyAt===null);
    if(!hungry.length)throw new Error(state.animals.length?'大家都吃饱了，先等这一份产物吧。':'先去商店接一只动物回来吧。');
    const count=Math.min(hungry.length,state.feed);if(!count)throw new Error('饲料用完了，去商店补一些吧。');
    for(const animal of hungry.slice(0,count))animal.readyAt=now+farmAnimal(animal.kind).seconds*1000;
    state.feed-=count;state.animalStats.fed+=count;return {count};
  },now);
}
export function collectFarmProducts(ids=null,storage=globalThis.localStorage,now=Date.now()) {
  return transaction(storage,state=>{
    const ready=animalTargets(state,ids).filter(animal=>farmAnimalStatus(animal,now).kind==='ready');
    if(!ready.length)throw new Error('暂时没有可以收取的产物，再等一小会儿。');
    const income=ready.reduce((total,animal)=>total+farmAnimal(animal.kind).sale,0);
    if(state.coins+income>1e12)throw new Error('农场金币已达到存档上限。');
    const products=ready.map(animal=>farmAnimal(animal.kind).product);
    for(const animal of ready)animal.readyAt=null;
    state.coins+=income;state.stats.earned+=income;state.animalStats.collected+=ready.length;
    record(state,`收取并卖出${ready.length}份牧场产物`,income,now);return {count:ready.length,income,products};
  },now);
}
