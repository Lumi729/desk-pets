(() => {
  const world = document.getElementById('world');
  const elements = new Map(), images = new Map();
  let captured = null;
  window.mirrorApi.frame(data => {
    for (const [key, bytes] of data.images) if (!images.has(key)) images.set(key, URL.createObjectURL(new Blob([bytes], { type: 'image/gif' })));
    const used = new Set(), ids = new Set();
    world.style.width = `${data.layout.width}px`; world.style.height = `${data.layout.height}px`;
    world.style.transform = `translate(${-data.layout.x}px, ${-data.layout.y}px)`;
    for (const node of data.nodes) {
      if (!['DIV', 'IMG', 'BUTTON'].includes(node.tag)) continue;
      ids.add(node.key);
      let el = elements.get(node.key);
      if (!el) { el = document.createElement(node.tag); el.dataset.key = node.key; elements.set(node.key, el); }
      const parent = elements.get(node.parent) || world;
      if (el.parentNode !== parent) parent.append(el);
      el.className = node.classes; el.style.cssText = node.style; el.hidden = node.hidden;
      if (node.id === 'stage') el.id = 'stage';
      if (node.text != null && el.textContent !== node.text) el.textContent = node.text;
      if (node.image) { used.add(node.image); const url = images.get(node.image); if (url && el.getAttribute('src') !== url) el.src = url; }
      if (node.tag === 'IMG') el.draggable = false;
    }
    for (const [key, el] of elements) if (!ids.has(key)) { el.remove(); elements.delete(key); }
    for (const [key, url] of images) if (!used.has(key)) { URL.revokeObjectURL(url); images.delete(key); }
  });
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'contextmenu', 'click', 'dblclick']) {
    window.addEventListener(type, event => {
      const target = captured || event.target.closest?.('[data-key]');
      if (!target) return;
      if (type === 'contextmenu' || type === 'pointerdown') event.preventDefault();
      if (type === 'pointerdown' && event.button === 0) { captured = target; target.setPointerCapture(event.pointerId); }
      window.mirrorApi.input({ type, key: Number(target.dataset.key), x: event.clientX, y: event.clientY, button: event.button, buttons: event.buttons });
      if (type === 'pointerup' || type === 'pointercancel') { if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId); captured = null; }
    });
  }
})();
