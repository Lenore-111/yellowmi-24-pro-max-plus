import test from 'node:test';
import assert from 'node:assert/strict';
import {phoneDom} from './helpers/phone-dom.mjs';
import {renderPhoneGameApp} from '../src/phone-game-view.js';
import {readPhoneGameState} from '../src/phone-game.js';
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('快送默认收礼人可支付，保存和生成期间禁用重试，失败重试显示送达且不重复扣款',async t=>{
 const f=phoneDom(t),ctx={name1:'玩家',characterId:0,chatId:'ui-order',characters:[{name:'阿青',avatar:'a.png'}],chat:[],chatMetadata:{},saveMetadataDebounced(){}};
 f.set('SillyTavern',{getContext:()=>ctx});f.set('worldBackstageHost',undefined);
 const stop=renderPhoneGameApp(f.screen,{app:'delivery',goHome(){},openApp(){}});f.cleanup.push(stop);
 const get=s=>{const n=f.screen.querySelector(s);assert.ok(n,s);return n;};
 get('[data-pg-delivery-merchant="drinks"]').click();get('[data-pg-delivery-add="cup-cola"]').click();get('[data-pg-delivery-go="checkout"]').click();
 let releaseSave,calls=0;const save=new Promise(resolve=>releaseSave=resolve);
 ctx.saveMetadata=()=>save;ctx.generateRaw=async()=>{calls++;return calls===1?'broken':JSON.stringify({text:'已收到饮料',affinityDelta:1});};
 get('[data-pg-delivery-confirm]').click();assert.equal(get('[data-pg-retry]').disabled,true);get('[data-pg-retry]').click();
 assert.equal(calls,0);assert.equal(readPhoneGameState().events.length,1);
 releaseSave();await settle();await settle();assert.match(f.screen.textContent,/模型没有返回有效内容/);assert.equal(get('[data-pg-retry]').disabled,false);
 get('[data-pg-retry]').click();assert.equal(get('[data-pg-retry]').disabled,true);await settle();await settle();
 assert.match(f.screen.textContent,/已送达/);assert.match(f.screen.textContent,/已收到饮料/);assert.equal(f.screen.querySelector('.wpg-error'),null);
 const state=readPhoneGameState();assert.equal(state.balance,82);assert.equal(state.events.filter(e=>e.kind==='gift').length,1);assert.equal(state.ledger.length,1);assert.equal(calls,2);
});
