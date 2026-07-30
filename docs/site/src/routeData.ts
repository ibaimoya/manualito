import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

export const onRequest = defineRouteMiddleware(({ locals }) => {
  if (locals.starlightRoute.id === '') {
    locals.starlightRoute.siteTitleHref = 'https://manualito.dev/';
  }
});
