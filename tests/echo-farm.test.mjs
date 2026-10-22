import test from 'node:test';
import assert from 'node:assert/strict';
import {FARM_STORAGE_KEY,FARM_CROPS,FARM_PLOT_COUNT,readFarm,farmPlotStatus,buyFarmSeeds,buyFarmFertilizer,plantFarm,harvestFarm,fertilizeFarm,selectFarmCrop} from '../src/echo-farm.js';
function store(){const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),data};}
const start=100000;

test('农场有十种短时作物、16块地，种子和收成价格满足约定',()=>{
 const storage=store(),s=readFarm(storage);assert.equal(s.plots.length,FARM_PLOT_COUNT);assert.equal(s.coins,1000);assert.equal(s.seeds.carrot,16);
 assert.equal(FARM_CROPS.length,10);assert.equal(new Set(FARM_CROPS.map(c=>c.id)).size,10);
 for(const c of FARM_CROPS){assert.ok(c.price>=10&&c.price<=50);assert.ok(c.multiplier>=10&&c.multiplier<=20);assert.equal(c.sale,c.price*c.multiplier);assert.ok(c.seconds>0&&c.seconds<=150);}
});
test('种子和肥料扣款原子，余额不足、无效数量及保存失败不改变存档',()=>{
 const storage=store();buyFarmSeeds('pumpkin',16,storage,start);buyFarmFertilizer(1,storage,start);assert.equal(readFarm(storage).coins,180);
 assert.equal(readFarm(storage).seeds.pumpkin,16);assert.equal(readFarm(storage).fertilizer,1);const before=storage.getItem(FARM_STORAGE_KEY);
 assert.throws(()=>buyFarmSeeds('pumpkin',16,storage),/金币不够/);assert.throws(()=>buyFarmSeeds('unknown',1,storage),/不存在/);
 assert.throws(()=>buyFarmFertilizer(0,storage),/数量/);assert.equal(storage.getItem(FARM_STORAGE_KEY),before);
 storage.setItem=()=>{throw Error('空间不足');};assert.throws(()=>buyFarmSeeds('carrot',1,storage),/空间不足/);assert.equal(storage.getItem(FARM_STORAGE_KEY),before);
});
test('一键种满16块地，未成熟不收；成熟结算一次，重复点击没有额外收入',()=>{
 const storage=store();assert.equal(plantFarm('carrot',null,storage,start).count,16);assert.equal(readFarm(storage).seeds.carrot,0);
 const before=storage.getItem(FARM_STORAGE_KEY);assert.throws(()=>plantFarm('carrot',null,storage,start),/没有空地/);
 assert.throws(()=>harvestFarm(null,storage,start+34999),/还没有成熟/);assert.equal(storage.getItem(FARM_STORAGE_KEY),before);
 const harvest=harvestFarm(null,storage,start+35000);assert.equal(harvest.income,1600);assert.equal(harvest.state.coins,2600);assert.equal(harvest.state.stats.harvested,16);
 assert.ok(harvest.state.plots.every(p=>p===null));assert.throws(()=>harvestFarm(null,storage,start+35000),/还没有成熟/);assert.equal(readFarm(storage).coins,2600);
});
test('种子不足时只种库存数量，指定土地去重，非法位置不扣种子',()=>{
 const storage=store();buyFarmSeeds('tomato',3,storage,start);selectFarmCrop('tomato',storage);
 assert.equal(plantFarm('tomato',[0,0,1,2,3],storage,start).count,3);assert.equal(readFarm(storage).selectedCrop,'tomato');assert.equal(readFarm(storage).seeds.tomato,0);
 assert.equal(readFarm(storage).plots.filter(Boolean).length,3);const before=storage.getItem(FARM_STORAGE_KEY);
 assert.throws(()=>plantFarm('carrot',[16],storage,start),/不存在/);assert.throws(()=>plantFarm('tomato',[4],storage,start),/种子用完/);assert.equal(storage.getItem(FARM_STORAGE_KEY),before);
});
test('每袋肥料只给一块生长中的地加速30秒，成熟作物不消耗肥料',()=>{
 const storage=store();plantFarm('carrot',[0,1],storage,start);buyFarmFertilizer(1,storage,start);
 const faster=fertilizeFarm(null,storage,start+15000);assert.equal(faster.count,1);assert.equal(faster.state.fertilizer,0);
 assert.equal(farmPlotStatus(faster.state.plots[0],start+15000).kind,'ready');assert.equal(farmPlotStatus(faster.state.plots[1],start+15000).remaining,20);
 buyFarmFertilizer(1,storage,start);assert.throws(()=>fertilizeFarm([0],storage,start+15000),/没有需要加速/);assert.equal(readFarm(storage).fertilizer,1);
 fertilizeFarm([1],storage,start+15000);assert.equal(readFarm(storage).fertilizer,0);assert.equal(harvestFarm(null,storage,start+15000).income,200);
});
test('十种混合种植在离线时间后恢复并按各自卖价结算，其他手机记录不受影响',()=>{
 const storage=store();storage.setItem('world_backstage_v1','世界记录');storage.setItem('world_phone_game_v1','手机记录');
 for(const [index,crop] of FARM_CROPS.entries()){if(crop.id!=='carrot')buyFarmSeeds(crop.id,1,storage,start);plantFarm(crop.id,[index],storage,start);}
 const saved=storage.getItem(FARM_STORAGE_KEY),reopened=store();reopened.setItem(FARM_STORAGE_KEY,saved);
 const result=harvestFarm(null,reopened,start+600000);assert.equal(result.count,10);assert.equal(result.income,FARM_CROPS.reduce((sum,c)=>sum+c.sale,0));
 assert.equal(storage.getItem('world_backstage_v1'),'世界记录');assert.equal(storage.getItem('world_phone_game_v1'),'手机记录');
 assert.equal(readFarm(storage).plots.filter(Boolean).length,10);assert.equal(readFarm(reopened).plots.filter(Boolean).length,0);
});
test('损坏存档不静默重置或覆盖',()=>{
 const storage=store();storage.setItem(FARM_STORAGE_KEY,'半截旧存档');assert.throws(()=>readFarm(storage),/原存档未被覆盖/);assert.equal(storage.getItem(FARM_STORAGE_KEY),'半截旧存档');
});
