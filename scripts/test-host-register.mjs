import { registerHooks } from 'node:module';
registerHooks({resolve(specifier, context, nextResolve) {
  if (specifier === '/script.js') return {url:new URL('../tests/helpers/tavern-host.mjs',import.meta.url).href,shortCircuit:true};
  if (specifier === '/scripts/group-chats.js') return {url:new URL('../tests/helpers/group-host.mjs',import.meta.url).href,shortCircuit:true};
  const result=nextResolve(specifier,context);
  if(result.url.startsWith(new URL('../src/phone-game',import.meta.url).href)) {
    const url=new URL(result.url);url.search='';return {...result,url:url.href};
  }
  return result;
}});
