// 解析页面实际生成的 HTML，并模拟事件捕获、冒泡与控件默认点击。
const decode = value => String(value).replace(/&(amp|lt|gt|quot|#39);/g, (_, key) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[key]));
const dataKey = name => name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
const voidTags = new Set(['input', 'img', 'br', 'hr', 'meta', 'link']);
export class PhoneNode {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.nodeType = 1; this.attributes = new Map(); this.children = []; this.dataset = {}; this.listeners = new Map();
    this.scrollTop = 0; this.scrollHeight = 1800; this.clientHeight = 600; this.hidden = false; this.disabled = false; this.value = ''; this.checked = false; this.open = false;
    this.style = { setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; } };
    this.classList = { contains: name => this.className.split(/\s+/).includes(name), add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); }, remove: (...names) => { this.className = this.className.split(/\s+/).filter(n => !names.includes(n)).join(' '); }, toggle:(name,force)=>{const wanted=force ?? !this.classList.contains(name);if(wanted)this.classList.add(name);else this.classList.remove(name);return wanted;} };
  }
  get id() { return this.attributes.get('id') || ''; }
  set id(value) { this.attributes.set('id',value); }
  get className() { return this.attributes.get('class') || ''; }
  set className(value) { this.attributes.set('class', value); }
  setAttribute(name, value) { value = String(value); this.attributes.set(name, value); if (name.startsWith('data-')) this.dataset[dataKey(name)] = value; if (['disabled', 'checked', 'hidden', 'open'].includes(name)) this[name] = true; if (name === 'value') this.value = value; }
  getAttribute(name) { return name.startsWith('data-') ? this.dataset[dataKey(name)] ?? null : this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); if (name.startsWith('data-')) delete this.dataset[dataKey(name)]; if (['disabled', 'checked', 'hidden', 'open'].includes(name)) this[name] = false; }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); } }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this); this.parentElement = null; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  get innerHTML() { return this.html || ''; }
  set innerHTML(html) {
    this.html = html; this.children.forEach(node => { node.parentElement = null; }); this.children = []; const stack = [this];
    for (const token of html.match(/<[^>]*>|[^<]+/g) || []) {
      if (token.startsWith('</')) { const tag=token.match(/^<\/([\w-]+)/)?.[1]?.toUpperCase(); while(stack.length>1){const closed=stack.pop();if(closed.tagName===tag)break;} continue; }
      if (token.startsWith('<')) {
        const parts = token.match(/^<([\w-]+)([\s\S]*?)\/?\s*>$/); if (!parts) continue;
        const node = new PhoneNode(parts[1]);
        for (const match of parts[2].matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) node.setAttribute(match[1], decode(match[2] ?? match[3] ?? match[4] ?? ''));
        stack.at(-1).append(node); if (!voidTags.has(parts[1]) && !/\/\s*>$/.test(token)) stack.push(node);
      } else { const parent = stack.at(-1); parent._text = (parent._text || '') + decode(token); if (parent.tagName === 'TEXTAREA') parent.value += decode(token); }
    }
    for (const select of this.querySelectorAll('select')) select.value = (select.querySelector('[selected]') || select.querySelector('option'))?.value || '';
  }
  get textContent() { return (this._text || '') + this.children.map(node => node.textContent).join(''); }
  set textContent(value) { this.children = []; this._text = String(value); }
  matches(selector) {
    return selector.split(',').some(part => {
      const tokens = part.trim().replace(/\s*>\s*/g, ' > ').split(/\s+/); let node = this;
      const matchSimple = (node, simple) => {
        if (!node) return false;
        if (simple.endsWith(':checked') && !node.checked) return false;
        simple = simple.replace(/:checked$/, '');
        const tag = simple.match(/^[\w-]+/); if (tag && node.tagName !== tag[0].toUpperCase()) return false;
        const id = simple.match(/#([\w-]+)/); if (id && node.getAttribute('id') !== id[1]) return false;
        for (const cl of simple.matchAll(/\.([\w-]+)/g)) if (!node.classList.contains(cl[1])) return false;
        for (const attr of simple.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) if (node.getAttribute(attr[1]) === null || (attr[2] !== undefined && node.getAttribute(attr[1]) !== attr[2])) return false;
        return true;
      };
      if (!matchSimple(node, tokens.pop())) return false;
      while (tokens.length) {
        const direct = tokens.at(-1) === '>'; if (direct) tokens.pop(); const next = tokens.pop(); node = node.parentElement;
        if (!direct) while (node && !matchSimple(node, next)) node = node.parentElement;
        if (!matchSimple(node, next)) return false;
      }
      return true;
    });
  }
  closest(selector) { let node = this; while (node && !node.matches(selector)) node = node.parentElement; return node; }
  querySelectorAll(selector) { return this.children.flatMap(node => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(type, fn, options) { const list = this.listeners.get(type) || []; list.push({ fn, capture: options === true || options?.capture }); this.listeners.set(type, list); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item.fn !== fn)); }
  dispatchEvent(event) { this.fire(event.type, { ...event, bubbles: event.bubbles }); return true; }
  fire(type, values = {}) {
    const event = { type, target: this, bubbles: true, button: 0, pointerId: 1, isTrusted: false, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, stopImmediatePropagation() { this.stopped = true; this.immediate = true; }, ...values };
    const path = []; for (let node = this; node; node = node.parentElement) path.push(node);
    const invoke = (node, capture) => { event.currentTarget = node; for (const listener of node.listeners.get(type) || []) { if (Boolean(listener.capture) === capture) listener.fn(event); if (event.immediate) break; } if (!capture && !event.immediate) node[`on${type}`]?.(event); };
    for (const node of path.slice().reverse()) { invoke(node, true); if (event.stopped) return event; }
    for (const node of path) { invoke(node, false); if (event.stopped || !event.bubbles) break; }
    return event;
  }
  click() {
    if (this.disabled) return;
    if (this.tagName === 'INPUT' && this.getAttribute('type') === 'checkbox') { this.checked = !this.checked; const event = this.fire('click'); if (event.defaultPrevented) this.checked = !this.checked; else this.fire('change'); return; }
    const event = this.fire('click');
    if (event.defaultPrevented) return;
    if (this.tagName === 'SUMMARY') this.parentElement.open = !this.parentElement.open;
    if (this.tagName === 'BUTTON' && this.getAttribute('type') === 'submit') this.closest('form')?.fire('submit');
  }
  focus() { if (globalThis.document) document.activeElement = this; }
  select() { this.selected = true; }
  scrollTo(_x, top) { this.scrollTop = top; }
  getBoundingClientRect() { return this.rect || { left: 0, top: 0, width: 390, height: 844, right: 390, bottom: 844 }; }
  setPointerCapture(id) { this.capture = id; }
  releasePointerCapture() { this.capture = null; }
}
export function phoneDom(t) {
  const originals = new Map(); const cleanup = [];
  const set = (name, value) => { if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { configurable: true, writable: true, value }); };
  const doc = new PhoneNode('document'); doc.createElement = tag => new PhoneNode(tag); doc.documentElement = new PhoneNode('html'); doc.activeElement = null;
  doc.body = new PhoneNode('body');doc.head=new PhoneNode('head');doc.append(doc.head,doc.body);doc.getElementById=id=>doc.querySelector(`#${id}`);
  const stage = new PhoneNode(); stage.setAttribute('id', 'world-phone-stage');
  const glass = new PhoneNode(); glass.className = 'wp-screen-glass'; const screen = new PhoneNode(); screen.setAttribute('data-screen', '');
  doc.body.append(stage); stage.append(glass); glass.append(screen);
  set('document', doc); set('window', Object.assign(new PhoneNode('window'), { setTimeout, clearTimeout, setInterval, clearInterval }));
  set('MutationObserver', class { observe() {} disconnect() {} }); set('getComputedStyle', () => ({ overflowY: 'auto' }));
  t.after(() => { for (const stop of cleanup.reverse()) stop(); for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
  return { doc, stage, glass, screen, set, cleanup };
}
