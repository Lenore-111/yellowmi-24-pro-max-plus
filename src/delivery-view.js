import {DELIVERY_COLA,deliveryEsc,deliveryMoney,deliveryMerchant,deliveryCartTotals,searchDeliveryMerchants} from './delivery-data.js';

function dCatQuote(message){
 return `<aside class="phone-cat-quote" aria-label="小猫的话"><span aria-hidden="true">🐱</span><div><b>小猫</b><p>${deliveryEsc(message)}</p></div></aside>`;
}

function dMerchantCards(items){
 if(!items.length)return `<div class="wpdelivery-empty"><span>🔍</span><b>没找到演示商家</b><p>试试别的关键词或分类。</p></div>`;
 return items.map(m=>`<button type="button" class="wpdelivery-shop-card" data-dshop="${deliveryEsc(m.id)}"><span class="wpdelivery-shop-art is-${deliveryEsc(m.tone)}">${m.emoji}</span><span class="wpdelivery-shop-copy"><b>${deliveryEsc(m.name)}</b><small>${deliveryEsc(m.subtitle)}</small><em>起送${deliveryMoney(m.minimum)} · 配送费${deliveryMoney(m.fee)}</em></span><i>›</i></button>`).join("");
}

function dCartDock(state){
 const t=deliveryCartTotals(state.cart);
 return t.count?`<button type="button" class="wpdelivery-cart-dock" data-dgo="cart"><span class="wpdelivery-cart-icon">🛍️<i>${t.count}</i></span><span><b>${deliveryMoney(t.total)}</b><small>含演示配送费 · 不扣钱包</small></span><strong>购物车 ›</strong></button>`:"";
}

function dHome(ui,state){
 const found=searchDeliveryMerchants(ui.query,ui.category);
 return `<div class="wpdelivery-scroll"><div class="wpdelivery-hero"><small>LINGQI DELIVERY · LOCAL DEMO</small><h1>好好吃饭，<br>今天也有好味道。</h1><p>玲七快送 · 本机演示</p><span aria-hidden="true">🥡</span></div>
 <div class="wpdelivery-address-tip"><span>📍</span><div><b>虚构收餐地点</b><small>结算时填写 · 不读取现实定位</small></div><i>›</i></div>
 <label class="wpdelivery-search"><span>⌕</span><input data-dsearch maxlength="70" autocomplete="off" value="${deliveryEsc(ui.query)}" placeholder="搜索商家、餐品"></label>
 <div class="wpdelivery-title"><b>今天想吃点什么？</b><small>演示菜单</small></div><nav class="wpdelivery-categories">${["全部","中式","甜品","饮品"].map(x=>`<button type="button" data-dcategory="${x}" class="${ui.category===x?"is-active":""}">${x}</button>`).join("")}</nav>
 <div class="wpdelivery-title"><b>附近好味道</b><small data-dcount>${found.length} 家</small></div><div class="wpdelivery-shops" data-dshops>${dMerchantCards(found)}</div>
 <p class="wpdelivery-disclaimer">商家和菜单为虚构演示，不代表世界背面已发生的剧情。</p></div>${dCartDock(state)}
 <nav class="wpdelivery-bottom-nav"><button type="button" class="is-active" data-dgo="home"><span>⌂</span><b>首页</b></button><button type="button" data-dgo="orders"><span>▤</span><b>订单</b></button></nav>`;
}

function dShop(ui,state){
 const m=deliveryMerchant(ui.merchantId);
 if(!m)return `<div class="wpdelivery-empty"><b>商家不存在</b><button type="button" data-dgo="home">返回首页</button></div>`;
 return `<div class="wpdelivery-scroll"><button type="button" class="wpdelivery-shop-back" data-dgo="home" aria-label="返回商家列表">‹ <span>返回</span></button><div class="wpdelivery-shop-hero is-${deliveryEsc(m.tone)}"><span>${m.emoji}</span><div><small>本机演示商家</small><h1>${deliveryEsc(m.name)}</h1><p>${deliveryEsc(m.subtitle)}</p></div></div><div class="wpdelivery-shop-meta"><span>起送 ${deliveryMoney(m.minimum)}</span><span>配送费 ${deliveryMoney(m.fee)}</span></div><div class="wpdelivery-title"><b>店内菜单</b><small>演示价格</small></div>
 <div class="wpdelivery-menu">${m.menu.map(item=>{const quantity=state.cart.merchantId===m.id?Number(state.cart.items?.[item.id]||0):0;return `<div class="wpdelivery-food"><span class="wpdelivery-food-art is-${deliveryEsc(m.tone)}">${item.emoji}</span><div><b>${deliveryEsc(item.name)}</b><small>${deliveryEsc(item.desc)}</small><strong>${deliveryMoney(item.price)}</strong></div>${quantity?`<div class="wpdelivery-quantity"><button type="button" data-dqty="${deliveryEsc(item.id)}" data-ddelta="-1" aria-label="减少${deliveryEsc(item.name)}">−</button><b>${quantity}</b><button type="button" data-dqty="${deliveryEsc(item.id)}" data-ddelta="1" aria-label="增加${deliveryEsc(item.name)}" ${quantity>=20?"disabled":""}>＋</button></div>`:`<button type="button" data-dadd="${deliveryEsc(item.id)}" aria-label="添加${deliveryEsc(item.name)}">＋</button>`}</div>`}).join("")}</div><p class="wpdelivery-disclaimer">加入购物车不会扣款，也不会生成真实世界订单。</p></div>${dCartDock(state)}`;
}

function dCart(state){
 const t=deliveryCartTotals(state.cart);
 if(!t.count)return `<div class="wpdelivery-scroll"><div class="wpdelivery-empty"><span>🛍️</span><b>购物车空空的</b><p>去挑些想吃的吧。</p><button type="button" data-dgo="home">逛逛演示商家</button></div></div>`;
 return `<div class="wpdelivery-scroll"><div class="wpdelivery-cart-title"><b>${deliveryEsc(t.merchant.name)}</b><small>一笔订单只支持一家商家</small><button type="button" data-dshop="${deliveryEsc(t.merchant.id)}" aria-label="继续选购${deliveryEsc(t.merchant.name)}">继续选购</button></div><div class="wpdelivery-cart-list">${t.lines.map(line=>`<div class="wpdelivery-cart-item"><span>${line.emoji}</span><div><b>${deliveryEsc(line.name)}</b><small>${deliveryMoney(line.unitPrice)} / 份</small></div><div class="wpdelivery-quantity"><button type="button" data-dqty="${deliveryEsc(line.id)}" data-ddelta="-1" aria-label="减少${deliveryEsc(line.name)}">−</button><b>${line.quantity}</b><button type="button" data-dqty="${deliveryEsc(line.id)}" data-ddelta="1" aria-label="增加${deliveryEsc(line.name)}" ${line.quantity>=20?"disabled":""}>＋</button></div></div>`).join("")}</div>
 <div class="wpdelivery-bill"><div><span>餐品小计</span><b>${deliveryMoney(t.subtotal)}</b></div><div><span>演示配送费</span><b>${deliveryMoney(t.deliveryFee)}</b></div><div class="is-total"><span>合计</span><b>${deliveryMoney(t.total)}</b></div></div>${t.eligible?"":`<p class="wpdelivery-hint">还差 ${deliveryMoney(t.minimum-t.subtotal)} 达到起送价</p>`}<p class="wpdelivery-disclaimer">金额仅供演示，不会扣除小手机钱包余额。</p></div><div class="wpdelivery-cart-checkout"><span><small>合计</small><b>${deliveryMoney(t.total)}</b></span><button type="button" data-dgo="checkout" ${t.eligible?"":"disabled"}>去结算</button></div>`;
}

function dCheckout(ui,state){
 const t=deliveryCartTotals(state.cart);
 if(!t.eligible)return dCart(state);
 return `<div class="wpdelivery-scroll"><button type="button" class="wpdelivery-shop-back" data-dgo="cart" aria-label="返回购物车">‹ <span>返回购物车</span></button><form data-dcheckout><div class="wpdelivery-form-card"><label for="wpdelivery-address"><b>📍 剧情里的收餐地点</b><small>只写虚构地址，不要填现实住址</small></label><input id="wpdelivery-address" data-daddress maxlength="100" required placeholder="例：星港公寓 301 室" value="${deliveryEsc(ui.address)}"></div><div class="wpdelivery-form-card"><label for="wpdelivery-note"><b>订单备注</b><small>可留空 · 当前聊天保存</small></label><textarea id="wpdelivery-note" data-dnote maxlength="160" placeholder="例：不要香菜">${deliveryEsc(ui.note)}</textarea></div>
 <div class="wpdelivery-cart-title"><b>${deliveryEsc(t.merchant.name)}</b><small>本机演示订单</small></div><div class="wpdelivery-bill">${t.lines.map(line=>`<div><span>${deliveryEsc(line.name)} × ${line.quantity}</span><b>${deliveryMoney(line.unitPrice*line.quantity)}</b></div>`).join("")}<div><span>演示配送费</span><b>${deliveryMoney(t.deliveryFee)}</b></div><div class="is-total"><span>合计</span><b>${deliveryMoney(t.total)}</b></div></div><p class="wpdelivery-disclaimer">保存订单不会扣款、派骑手或推进世界剧情。</p><button class="wpdelivery-submit" type="submit">保存演示订单 · ${deliveryMoney(t.total)}</button></form></div>`;
}

function dOrders(state){
 const orders=[...state.orders].reverse();
 return `<div class="wpdelivery-scroll"><div class="wpdelivery-title"><b>我的演示订单</b><small>${orders.length} 笔 · 当前聊天</small></div>${orders.length?orders.map(o=>`<button type="button" class="wpdelivery-order-card" data-dorder="${deliveryEsc(o.id)}"><span>🥡</span><span><b>${deliveryEsc(o.merchantName)}</b><small>${deliveryEsc(o.createdAt)} · 本机演示已保存</small><em>${o.lines.map(l=>`${deliveryEsc(l.name)} × ${l.quantity}`).join("、")}</em></span><strong>${deliveryMoney(o.total)} ›</strong></button>`).join(""):`<div class="wpdelivery-empty"><span>🧾</span><b>还没有演示订单</b><p>点一份喜欢的，保存到当前聊天吧。</p><button type="button" data-dgo="home">去挑餐品</button></div>`}</div><nav class="wpdelivery-bottom-nav"><button type="button" data-dgo="home"><span>⌂</span><b>首页</b></button><button type="button" class="is-active" data-dgo="orders"><span>▤</span><b>订单</b></button></nav>`;
}

function dOrder(ui,state){
 const o=state.orders.find(x=>x.id===ui.orderId);
 if(!o)return `<div class="wpdelivery-empty"><b>订单不存在</b><button type="button" data-dgo="orders">返回订单</button></div>`;
 return `<div class="wpdelivery-scroll"><div class="wpdelivery-detail-nav"><button type="button" data-dgo="orders" aria-label="返回订单列表">‹ 返回订单</button></div><div class="wpdelivery-order-status"><span>🧾</span><b>本机演示订单已保存</b><p>未连接商家接单及骑手配送。</p></div>${o.lines.some(line=>line.name===DELIVERY_COLA.name&&line.unitPrice===DELIVERY_COLA.price&&line.quantity>0)?dCatQuote(DELIVERY_COLA.catQuote):""}<div class="wpdelivery-timeline"><div class="is-done"><i>✓</i><span><b>保存订单</b><small>${deliveryEsc(o.createdAt)}</small></span></div><div><i>○</i><span><b>等待世界背面订单能力</b><small>尚未接入，不自动变更状态</small></span></div><div><i>○</i><span><b>配送进度</b><small>等待世界背面提供真实配送事件</small></span></div></div>
 <div class="wpdelivery-bill"><div class="is-total"><span>${deliveryEsc(o.merchantName)}</span><b>${deliveryMoney(o.total)}</b></div>${o.lines.map(l=>`<div><span>${deliveryEsc(l.name)} × ${l.quantity}</span><b>${deliveryMoney(l.unitPrice*l.quantity)}</b></div>`).join("")}<div><span>演示配送费</span><b>${deliveryMoney(o.deliveryFee)}</b></div><div><span>虚构收餐地点</span><b class="wpdelivery-break">${deliveryEsc(o.address)}</b></div>${o.note?`<div><span>备注</span><b class="wpdelivery-break">${deliveryEsc(o.note)}</b></div>`:""}</div><p class="wpdelivery-disclaimer">仅保存在当前聊天的本机数据，不扣钱包、不写入世界正史。</p></div>`;
}

function dSwitch(ui){
 if(!ui.pending)return "";
 const m=deliveryMerchant(ui.pending.merchantId);
 return `<div class="wpdelivery-modal-backdrop" role="dialog" aria-modal="true" aria-label="切换商家"><div class="wpdelivery-modal"><span>🛍️</span><h2>切换到${deliveryEsc(m?.name||"新商家")}？</h2><p>一笔订单只能来自一家商家。切换会清空购物车，不影响已保存的演示订单。</p><div><button type="button" data-dswitch="cancel">继续选现在的</button><button type="button" data-dswitch="confirm">清空并切换</button></div></div></div>`;
}

function deliveryView(ui,state){
 const body=ui.view==="merchant"?dShop(ui,state):ui.view==="cart"?dCart(state):ui.view==="checkout"?dCheckout(ui,state):ui.view==="orders"?dOrders(state):ui.view==="order"?dOrder(ui,state):dHome(ui,state);
 return body+dSwitch(ui);
}

export {deliveryView,dMerchantCards,dCatQuote};
