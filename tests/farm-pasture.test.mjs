import test from 'node:test';
import assert from 'node:assert/strict';
import {FARM_STORAGE_KEY,FARM_ANIMALS,createFarmState,readFarm,plantFarm,buyFarmAnimal,buyFarmFeed,feedFarmAnimals,collectFarmProducts,farmAnimalStatus,subscribeFarm} from '../src/echo-farm.js';
const start=100000;
function store(){const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),data};}
function funded(coins=10000){const storage=store(),s=createFarmState();s.coins=coins;storage.setItem(FARM_STORAGE_KEY,JSON.stringify(s));return storage;}

test('原版v1金币、种子、生长时间和账单原样保留，首次牧场写入才升级存档',()=>{
 const storage=store(),old=createFarmState();old.version=1;delete old.animals;delete old.feed;delete old.nextAnimalId;delete old.animalStats;
 old.coins=834;old.seeds.pumpkin=3;old.fertilizer=8;old.plots[2]={cropId:'carrot',plantedAt:start,readyAt:start+35000};old.stats.spent=166;old.ledger=[{text:'原来的买卖',amount:-166,at:start}];
 const raw=JSON.stringify(old);storage.setItem(FARM_STORAGE_KEY,raw);const s=readFarm(storage);
 for(const key of ['coins','seeds','fertilizer','plots','selectedCrop','stats','ledger'])assert.deepEqual(s[key],old[key]);
 assert.equal(storage.getItem(FARM_STORAGE_KEY),raw);assert.deepEqual(s.animals,[]);
 buyFarmAnimal('chicken',storage,start);assert.equal(readFarm(storage).coins,714);assert.equal(readFarm(storage).version,2);assert.deepEqual(readFarm(storage).plots,old.plots);assert.equal(readFarm(storage).seeds.pumpkin,3);
});
test('鸡羊牛分别产出，离线一天也只结算已喂养的那一轮，收取不重复发钱',()=>{
 const storage=funded();for(const kind of FARM_ANIMALS)buyFarmAnimal(kind.id,storage,start);
 buyFarmFeed(3,storage,start);const fed=feedFarmAnimals(null,storage,start);assert.equal(fed.count,3);assert.equal(fed.state.feed,0);
 assert.throws(()=>collectFarmProducts(null,storage,start+59000),/暂时没有/);
 const egg=collectFarmProducts(null,storage,start+60000);assert.deepEqual(egg.products,['鸡蛋']);assert.equal(egg.income,80);
 const wool=collectFarmProducts(null,storage,start+90000);assert.deepEqual(wool.products,['羊毛']);
 const offline=store();offline.setItem(FARM_STORAGE_KEY,storage.getItem(FARM_STORAGE_KEY));const milk=collectFarmProducts(null,offline,start+86400000);assert.deepEqual(milk.products,['牛奶']);assert.equal(milk.income,240);
 assert.ok(readFarm(offline).animals.every(a=>a.readyAt===null));const before=offline.getItem(FARM_STORAGE_KEY);assert.throws(()=>collectFarmProducts(null,offline,start+86400000),/暂时没有/);assert.equal(offline.getItem(FARM_STORAGE_KEY),before);
});
test('饲料不足只喂已有份数，生长中和未收产物不重复吃饲料',()=>{
 const storage=funded();for(let i=0;i<3;i++)buyFarmAnimal('chicken',storage,start);buyFarmFeed(1,storage,start);
 const ids=readFarm(storage).animals.map(a=>a.id);assert.equal(feedFarmAnimals(null,storage,start).count,1);assert.equal(farmAnimalStatus(readFarm(storage).animals[0],start).kind,'growing');
 buyFarmFeed(4,storage,start);assert.throws(()=>feedFarmAnimals([ids[0]],storage,start+60000),/吃饱/);assert.equal(readFarm(storage).feed,4);
 assert.equal(feedFarmAnimals([ids[1],ids[1]],storage,start).count,1);assert.equal(readFarm(storage).feed,3);
 const saved=storage.getItem(FARM_STORAGE_KEY);assert.throws(()=>feedFarmAnimals([999],storage,start),/不在牧场/);assert.equal(storage.getItem(FARM_STORAGE_KEY),saved);
});
test('收取再喂开启新一轮，不重置其他动物的绝对成熟时间',()=>{
 const storage=funded();buyFarmAnimal('cow',storage,start);buyFarmAnimal('sheep',storage,start);buyFarmFeed(4,storage,start);feedFarmAnimals(null,storage,start);
 const [cow,sheep]=readFarm(storage).animals;collectFarmProducts([sheep.id],storage,start+90000);feedFarmAnimals([sheep.id],storage,start+90000);
 assert.equal(readFarm(storage).animals[0].readyAt,start+120000);assert.equal(readFarm(storage).animals[1].readyAt,start+180000);
 assert.equal(collectFarmProducts([cow.id],storage,start+120000).income,240);assert.equal(farmAnimalStatus(readFarm(storage).animals[1],start+120000).remaining,60);
});
test('满12只、余额不足和非法购买均不扣款，不产生重号动物',()=>{
 const storage=funded();for(let i=0;i<12;i++)buyFarmAnimal('chicken',storage,start);const s=readFarm(storage);assert.equal(new Set(s.animals.map(a=>a.id)).size,12);
 const raw=storage.getItem(FARM_STORAGE_KEY);assert.throws(()=>buyFarmAnimal('cow',storage,start),/住满/);assert.throws(()=>buyFarmAnimal('dragon',storage,start),/没有这种/);assert.equal(storage.getItem(FARM_STORAGE_KEY),raw);
 const poor=funded(0),before=poor.getItem(FARM_STORAGE_KEY);assert.throws(()=>buyFarmAnimal('chicken',poor,start),/金币不够/);assert.throws(()=>buyFarmFeed(1,poor,start),/金币不够/);assert.equal(poor.getItem(FARM_STORAGE_KEY),before);
 for(const value of [0,-1,1.2,NaN,10000])assert.throws(()=>buyFarmFeed(value,storage,start),/数量/);
});
test('保存失败不发布购买或收取成功，重试只结算一次',()=>{
 const storage=funded();buyFarmAnimal('chicken',storage,start);buyFarmFeed(1,storage,start);feedFarmAnimals(null,storage,start);
 const before=storage.getItem(FARM_STORAGE_KEY),save=storage.setItem;let notifications=0;const stop=subscribeFarm(()=>notifications++);
 try{storage.setItem=()=>{throw Error('空间不足');};assert.throws(()=>collectFarmProducts(null,storage,start+60000),/空间不足/);assert.throws(()=>buyFarmAnimal('cow',storage,start),/空间不足/);assert.equal(notifications,0);assert.equal(storage.getItem(FARM_STORAGE_KEY),before);
 storage.setItem=save;const result=collectFarmProducts(null,storage,start+60000);assert.equal(result.income,80);assert.equal(notifications,1);}finally{stop();}
});
test('损坏或未知版本的牧场不静默删除动物和覆盖原文',()=>{
 for(const mutate of [s=>s.version=9,s=>s.animals=null,s=>s.animals=[{id:1,kind:'unknown',readyAt:null}],s=>s.animals=[{id:1,kind:'cow',readyAt:'bad'}],s=>s.animals=[{id:1,kind:'cow',readyAt:null},{id:1,kind:'sheep',readyAt:null}],s=>s.animals=Array.from({length:13},(_,i)=>({id:i+1,kind:'cow',readyAt:null}))]){
  const storage=store(),s=createFarmState();mutate(s);const raw=JSON.stringify(s);storage.setItem(FARM_STORAGE_KEY,raw);assert.throws(()=>readFarm(storage),/原存档未被覆盖/);assert.equal(storage.getItem(FARM_STORAGE_KEY),raw);
 }
});
test('农田和牧场共用农场金币，其他钱包与世界存档没有写入',()=>{
 const storage=funded();storage.setItem('world_phone_game_v1','手机');storage.setItem('world_backstage_v1','世界');storage.setItem('wallet','钱包');plantFarm('carrot',[0],storage,start);buyFarmAnimal('chicken',storage,start);buyFarmFeed(1,storage,start);feedFarmAnimals(null,storage,start);
 collectFarmProducts(null,storage,start+60000);const s=readFarm(storage);assert.equal(s.coins,9950);assert.ok(s.plots[0]);assert.equal(s.stats.earned,80);assert.equal(s.stats.spent,130);for(const [key,value]of [['world_phone_game_v1','手机'],['world_backstage_v1','世界'],['wallet','钱包']])assert.equal(storage.getItem(key),value);
});
