// jsdom no implementa checkVisibility ni calcula geometría. Esta adaptación limita el doble de prueba a esa frontera del navegador.

function hiddenByStyle(element: Element, options?: CheckVisibilityOptions): boolean {
  const style = getComputedStyle(element);
  if (style.display === 'none') return true;
  return options?.visibilityProperty === true && style.visibility === 'hidden';
}

function revealed(element: Element, options?: CheckVisibilityOptions): boolean {
  if (!element.isConnected) return false;
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    if (hiddenByStyle(node, options)) return false;
  }
  return true;
}

if (typeof Element.prototype.checkVisibility !== 'function') {
  Object.defineProperty(Element.prototype, 'checkVisibility', {
    configurable: true,
    writable: true,
    value(this: Element, options?: CheckVisibilityOptions): boolean {
      return revealed(this, options);
    },
  });
}
