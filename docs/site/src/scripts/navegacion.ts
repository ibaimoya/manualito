document.addEventListener('astro:before-swap', (evento) => {
  const raiz = document.documentElement;
  for (const atributo of ['style', 'data-laterales-preparados', 'data-transiciones-listas']) {
    const valor = raiz.getAttribute(atributo);
    if (valor !== null) evento.newDocument.documentElement.setAttribute(atributo, valor);
  }
});

document.addEventListener('astro:page-load', () => {
  document.documentElement.setAttribute('data-transiciones-listas', '');
});
