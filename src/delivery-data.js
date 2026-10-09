export const DELIVERY_COLA = Object.freeze({id:'cup-cola',name:'杯装可乐',desc:'杯装冰可乐',price:18,emoji:'🥤',catQuote:'贵是贵了点，但喝着舒服，不烧心'});
export const DELIVERY_KEY = 'world_phone_lingqi_delivery_demo_v1';
export const DEMO_MERCHANTS = Object.freeze([{"id":"lingqi-kitchen","name":"Echo小馆","category":"中式","emoji":"🍱","tone":"coral","subtitle":"热乎家常饭 · 演示菜单","fee":3,"minimum":18,"menu":[{"id":"chicken-rice","name":"照烧鸡腿饭","desc":"鸡腿、米饭与蔬菜","price":26,"emoji":"🍗"},{"id":"tomato-egg","name":"番茄鸡蛋盖饭","desc":"酸甜番茄与鸡蛋","price":19,"emoji":"🍅"},{"id":"soup","name":"海带豆腐汤","desc":"清爽热汤","price":8,"emoji":"🥣"},DELIVERY_COLA]},{"id":"moon-noodle","name":"月见面屋","category":"中式","emoji":"🍜","tone":"gold","subtitle":"一碗面，慢慢吃 · 演示菜单","fee":3,"minimum":20,"menu":[{"id":"beef-noodle","name":"红烧牛肉面","desc":"牛肉与浓汤","price":29,"emoji":"🍜"},{"id":"mushroom-noodle","name":"菌菇清汤面","desc":"香菇、青菜与细面","price":23,"emoji":"🍄"},{"id":"egg","name":"溏心蛋","desc":"单点加料","price":5,"emoji":"🥚"}]},{"id":"cloud-bakery","name":"云朵烘焙","category":"甜品","emoji":"🥐","tone":"lilac","subtitle":"奶油香气刚刚好 · 演示菜单","fee":4,"minimum":18,"menu":[{"id":"croissant","name":"黄油可颂","desc":"外酥内软","price":15,"emoji":"🥐"},{"id":"cake","name":"草莓奶油蛋糕","desc":"单人份","price":28,"emoji":"🍰"},{"id":"pudding","name":"焦糖布丁","desc":"微苦焦糖","price":16,"emoji":"🍮"}]},{"id":"seventeen-tea","name":"十七茶事","category":"饮品","emoji":"🧋","tone":"mint","subtitle":"一杯饮品，一点好心情 · 演示菜单","fee":2,"minimum":16,"menu":[{"id":"milk-tea","name":"桂花奶茶","desc":"桂花与奶香","price":19,"emoji":"🧋"},{"id":"lemon-tea","name":"柠檬茶","desc":"清爽低甜","price":20,"emoji":"🍋"},{"id":"coffee","name":"冰拿铁","desc":"浓缩与牛奶","price":22,"emoji":"☕"}]}]);

function deliveryText(value,max=120){return String(value??"").trim().slice(0,max)}

function deliveryEsc(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]))}

function deliveryMoney(value){return `¥${Number(value||0).toFixed(2)}`}

function deliveryMerchant(id){return DEMO_MERCHANTS.find(x=>x.id===id)||null}

function deliveryMenuItem(merchant,id){return merchant?.menu.find(x=>x.id===id)||null}

function sanitizeDeliveryState(input){
 const s=input&&typeof input==="object"&&!Array.isArray(input)?input:{},raw=s.cart&&typeof s.cart==="object"?s.cart:{};
 const merchant=deliveryMerchant(deliveryText(raw.merchantId,64)),items={};
 if(merchant&&raw.items&&typeof raw.items==="object"&&!Array.isArray(raw.items))for(const item of merchant.menu){
  const n=Number(raw.items[item.id]);if(Number.isInteger(n)&&n>0)items[item.id]=Math.min(20,n);
 }
 const cart=Object.keys(items).length?{merchantId:merchant.id,items}:{merchantId:"",items:{}};
 const orders=(Array.isArray(s.orders)?s.orders:[]).slice(-30).flatMap(record=>{
  if(!record||typeof record!=="object")return [];
  const id=deliveryText(record.id,80),merchantName=deliveryText(record.merchantName,60),address=deliveryText(record.address,100),createdAt=deliveryText(record.createdAt,40);
  const lines=(Array.isArray(record.lines)?record.lines:[]).slice(0,32).flatMap(line=>{
   const name=deliveryText(line?.name,64),quantity=Number(line?.quantity),unitPrice=Number(line?.unitPrice);
   return name&&Number.isInteger(quantity)&&quantity>0&&quantity<=20&&Number.isInteger(unitPrice)&&unitPrice>=0&&unitPrice<=2000?[{name,quantity,unitPrice}]:[];
  });
  if(!id||!merchantName||!address||!lines.length)return [];
  const subtotal=lines.reduce((n,line)=>n+line.quantity*line.unitPrice,0),fee=Number(record.deliveryFee);
  const deliveryFee=Number.isInteger(fee)&&fee>=0&&fee<=30?fee:0;
  return [{id,merchantId:deliveryText(record.merchantId,64),merchantName,address,createdAt,note:deliveryText(record.note,160),lines,subtotal,deliveryFee,total:subtotal+deliveryFee,status:"local-demo"}];
 });
 return {cart,orders};
}

function deliveryCartTotals(cart){
 const c=sanitizeDeliveryState({cart}).cart,merchant=deliveryMerchant(c.merchantId);
 const lines=merchant?merchant.menu.filter(item=>c.items[item.id]).map(item=>({id:item.id,name:item.name,emoji:item.emoji,unitPrice:item.price,quantity:c.items[item.id]})):[];
 const count=lines.reduce((n,item)=>n+item.quantity,0),subtotal=lines.reduce((n,item)=>n+item.quantity*item.unitPrice,0),deliveryFee=count?merchant.fee:0;
 return {merchant,lines,count,subtotal,deliveryFee,total:subtotal+deliveryFee,minimum:merchant?.minimum||0,eligible:count>0&&subtotal>=(merchant?.minimum||0)};
}

function addDeliveryItem(cart,merchantId,itemId){
 const item=deliveryMenuItem(deliveryMerchant(merchantId),itemId);
 if(!item)throw Error("没有找到餐品");
 const current=sanitizeDeliveryState({cart}).cart;
 if(current.merchantId&&current.merchantId!==merchantId)throw Error("更换商家需要先确认清空购物车");
 return {merchantId,items:{...current.items,[itemId]:Math.min(20,(current.items[itemId]||0)+1)}};
}

function changeDeliveryQuantity(cart,itemId,delta){
 const current=sanitizeDeliveryState({cart}).cart,merchant=deliveryMerchant(current.merchantId);
 if(!merchant||!deliveryMenuItem(merchant,itemId)||!Number.isInteger(delta))return current;
 const items={...current.items},n=Math.max(0,Math.min(20,(items[itemId]||0)+delta));
 if(n)items[itemId]=n;else delete items[itemId];
 return Object.keys(items).length?{merchantId:merchant.id,items}:{merchantId:"",items:{}};
}

function searchDeliveryMerchants(query="",category="全部"){
 const q=deliveryText(query,70).toLocaleLowerCase();
 return DEMO_MERCHANTS.filter(m=>(category==="全部"||category===m.category)&&(!q||[m.name,m.category,m.subtitle,...m.menu.map(x=>x.name)].join(" ").toLocaleLowerCase().includes(q)));
}

function createDeliveryOrder(value,{id,createdAt,address,note}={}){
 const state=sanitizeDeliveryState(value),total=deliveryCartTotals(state.cart);
 if(!total.eligible)throw Error(total.count?`还差${deliveryMoney(total.minimum-total.subtotal)}达到起送价`:"购物车还没有餐品");
 const a=deliveryText(address,100),key=deliveryText(id,80),time=deliveryText(createdAt,40);
 if(!a)throw Error("请填写剧情里的虚构收餐地点");
 if(!key||!time||state.orders.some(x=>x.id===key))throw Error("订单编号缺失或重复");
 const order={id:key,createdAt:time,merchantId:total.merchant.id,merchantName:total.merchant.name,address:a,note:deliveryText(note,160),lines:total.lines.map(x=>({name:x.name,quantity:x.quantity,unitPrice:x.unitPrice})),subtotal:total.subtotal,deliveryFee:total.deliveryFee,total:total.total,status:"local-demo"};
 return {order,state:{cart:{merchantId:"",items:{}},orders:[...state.orders,order].slice(-30)}};
}

export { deliveryText, deliveryEsc, deliveryMoney, deliveryMerchant, deliveryMenuItem, sanitizeDeliveryState, deliveryCartTotals, addDeliveryItem, changeDeliveryQuantity, searchDeliveryMerchants, createDeliveryOrder };
