import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

export const onRequest = defineRouteMiddleware(({ locals }) => {
  const route = locals.starlightRoute;
  if (route.id === '') route.siteTitleHref = 'https://manualito.dev/';

  const { toc } = route;
  if (!toc) return;
  toc.items = toc.items.filter(({ slug }) => slug !== '_top');
  if (toc.items.length === 0) route.toc = undefined;
});
