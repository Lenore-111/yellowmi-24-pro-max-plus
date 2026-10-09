import {readSocialBucket,writeSocialBucket} from './social-storage.js';
import {DELIVERY_KEY,deliveryEsc,deliveryCartTotals,addDeliveryItem,changeDeliveryQuantity,searchDeliveryMerchants,createDeliveryOrder,sanitizeDeliveryState} from './delivery-data.js';
import {deliveryView,dMerchantCards} from './delivery-view.js';

function renderDeliveryApp(screen,{goHome}={}){
 if(!screen||typeof goHome!=="function")return;
 let state=sanitizeDeliveryState(readSocialBucket(DELIVERY_KEY));
 const ui={view:"home",query:"",category:"全部",merchantId:"",orderId:"",address:"",note:"",pending:null,error:""};
 screen.innerHTML='<section class="wp-view wp-native-app wp-delivery-app"></section>';
 const section=screen.querySelector(".wp-delivery-app");
 function save(){state=sanitizeDeliveryState(state);writeSocialBucket(DELIVERY_KEY,state)}
 function paint(){
  const title={home:"Echo快送",merchant:"商家菜单",cart:"购物车",checkout:"确认订单",orders:"我的订单",order:"订单详情"}[ui.view]||"Echo快送";
  section.innerHTML=`<header class="wp-app-header wpdelivery-header"><button type="button" data-dback aria-label="返回">‹</button><div><b>${title}</b><small>本机演示 · 不扣钱包</small></div><button type="button" class="wpdelivery-header-cart" data-dgo="cart" aria-label="查看购物车">🛍️</button></header><div class="wpdelivery-shell">${deliveryView(ui,state)}</div>${ui.error?`<div class="wpdelivery-error" role="alert">${deliveryEsc(ui.error)}</div>`:""}`;
 }
 function navigate(next){ui.view=next;ui.error="";paint()}
 function back(){
  if(ui.pending){ui.pending=null;paint();return}
  if(ui.view==="home"){goHome();return}
  if(ui.view==="checkout"){navigate("cart");return}
  if(ui.view==="cart"){navigate(ui.merchantId?"merchant":"home");return}
  if(ui.view==="order"){navigate("orders");return}
  navigate("home");
 }
 section.addEventListener("click",event=>{
  const el=event.target?.closest?.("[data-dback],[data-dswitch],[data-dcategory],[data-dshop],[data-dadd],[data-dqty],[data-dorder],[data-dgo]");
  if(!el||!section.contains(el))return;
  if(el.hasAttribute("data-dback")){back();return}
  if(el.hasAttribute("data-dswitch")){
   const pending=ui.pending;ui.pending=null;
   if(el.dataset.dswitch==="confirm"&&pending){
    state.cart=addDeliveryItem({merchantId:"",items:{}},pending.merchantId,pending.itemId);
    save();ui.merchantId=pending.merchantId;
   }
   paint();return;
  }
  if(ui.pending)return;
  if(el.hasAttribute("data-dcategory")){ui.category=el.dataset.dcategory;paint();return}
  if(el.hasAttribute("data-dshop")){ui.merchantId=el.dataset.dshop;navigate("merchant");return}
  if(el.hasAttribute("data-dadd")){
   try{
    const total=deliveryCartTotals(state.cart);
    if(total.count&&state.cart.merchantId!==ui.merchantId){ui.pending={merchantId:ui.merchantId,itemId:el.dataset.dadd};paint();return}
    state.cart=addDeliveryItem(state.cart,ui.merchantId,el.dataset.dadd);
    save();paint();
   }catch(err){ui.error=String(err.message||err);paint()}
   return;
  }
  if(el.hasAttribute("data-dqty")){
   state.cart=changeDeliveryQuantity(state.cart,el.dataset.dqty,Number(el.dataset.ddelta));
   save();paint();return;
  }
  if(el.hasAttribute("data-dorder")){ui.orderId=el.dataset.dorder;navigate("order");return}
  if(el.hasAttribute("data-dgo")){
   const next=el.dataset.dgo;
   if(next==="checkout"&&!deliveryCartTotals(state.cart).eligible)return;
   if(next==="cart"&&!deliveryCartTotals(state.cart).count){navigate("cart");return}
   if(["home","cart","checkout","orders"].includes(next))navigate(next);
  }
 });
 section.addEventListener("input",event=>{
  const input=event.target;
  if(input.matches?.("[data-dsearch]")){
   ui.query=String(input.value||"").slice(0,70);
   const results=searchDeliveryMerchants(ui.query,ui.category);
   const holder=section.querySelector("[data-dshops]"),count=section.querySelector("[data-dcount]");
   if(holder)holder.innerHTML=dMerchantCards(results);
   if(count)count.textContent=`${results.length} 家`;
  }
  if(input.matches?.("[data-daddress]"))ui.address=String(input.value||"").slice(0,100);
  if(input.matches?.("[data-dnote]"))ui.note=String(input.value||"").slice(0,160);
 });
 section.addEventListener("submit",event=>{
  if(!event.target?.matches?.("[data-dcheckout]"))return;
  event.preventDefault();
  ui.address=String(event.target.querySelector("[data-daddress]")?.value||"").slice(0,100);
  ui.note=String(event.target.querySelector("[data-dnote]")?.value||"").slice(0,160);
  try{
   const result=createDeliveryOrder(state,{
    id:`wpdelivery-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    createdAt:new Date().toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}),
    address:ui.address,note:ui.note
   });
   state=result.state;save();ui.orderId=result.order.id;ui.address="";ui.note="";navigate("order");
  }catch(err){ui.error=String(err.message||err);paint()}
 });
 paint();
}

export {renderDeliveryApp};
