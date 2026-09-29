(() => {
  if (!window.petApi.mirrorHost) return;
  const keys = new WeakMap(), elements = new Map();
  let next = 1, sent = new Set(), busy = false;
  const keyFor = el => { if (!keys.has(el)) keys.set(el, next++); const key = keys.get(el); elements.set(key, el); return key; };
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const nodes = [], images = [], used = new Set(), alive = new Set();
      async function walk(el, parent) {
        if (!['DIV', 'IMG', 'BUTTON'].includes(el.tagName)) return;
        const key = keyFor(el); alive.add(key);
        const node = { key, parent, tag: el.tagName, id: el.id, classes: el.className, style: el.style.cssText, hidden: el.hidden };
        if (el.tagName === 'IMG' && (el.src.startsWith('blob:') || el.src.startsWith('file:'))) {
          node.image = el.src; used.add(el.src);
          if (!sent.has(el.src)) images.push([el.src, new Uint8Array(await (await fetch(el.src)).arrayBuffer())]);
        } else if (!el.children.length) node.text = el.textContent;
        nodes.push(node);
        for (const child of el.children) await walk(child, key);
      }
      for (const el of document.body.children) await walk(el, 0);
      for (const key of elements.keys()) if (!alive.has(key)) elements.delete(key);
      window.petApi.mirrorFrame({ nodes, images }); sent = used;
    } catch { /* An animation URL may have been revoked while taking a frame. Retry next tick. */ }
    finally { busy = false; }
  }, 33);
  window.petApi.onMirrorInput(data => {
    const el = elements.get(data.key);
    if (!el) return;
    const init = { bubbles: true, cancelable: true, clientX: data.x, clientY: data.y, button: data.button, buttons: data.buttons, pointerId: data.pointerId };
    const event = data.type.startsWith('pointer') ? new PointerEvent(data.type, init) : new MouseEvent(data.type, init);
    el.dispatchEvent(event);
    if (data.type === 'pointermove') window.dispatchEvent(new MouseEvent('mousemove', init));
  });
})();
