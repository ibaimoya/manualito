import type tutorial from '@/locales/es/tutorial.json';
import type { TourId, TourSpec, TourStepSpec, TourTarget, TutorialKey } from './types';

type StepKey<T extends TourId> = keyof (typeof tutorial)['tours'][T]['steps'] & string;

type StepOptions = Pick<TourStepSpec, 'optional' | 'side' | 'align' | 'view'>;

function step<T extends TourId>(
  tour: T,
  key: StepKey<T>,
  target: TourTarget,
  options: StepOptions = {},
): TourStepSpec {
  // StepKey valida la clave antes de componer la ruta de traducción.
  return {
    target,
    title: `tours.${tour}.steps.${key}.title` as TutorialKey,
    description: `tours.${tour}.steps.${key}.description` as TutorialKey,
    ...options,
  };
}

function define(
  id: TourId,
  matches: (pathname: string) => boolean,
  steps: readonly TourStepSpec[],
): TourSpec {
  return {
    id,
    matches,
    steps,
  };
}

const exact = (route: string) => (pathname: string) => pathname === route;
const under = (prefix: string) => (pathname: string) => pathname.startsWith(prefix);

export const TOURS: Readonly<Record<TourId, TourSpec>> = {
  welcome: define('welcome', exact('/home'), [
    step('welcome', 'activity', 'home-activity', { side: 'top' }),
    step('welcome', 'suggestions', 'explore-suggestions', { side: 'top', optional: true }),
    step('welcome', 'library', 'nav-library', { side: 'right' }),
    step('welcome', 'explore', 'nav-explore', { side: 'right' }),
    step('welcome', 'newManual', 'nav-new-manual', { side: 'right' }),
    step('welcome', 'help', 'nav-help', { side: 'right' }),
  ]),
  explore: define('explore', exact('/explore'), [
    step('explore', 'search', 'explore-search', { side: 'bottom' }),
    step('explore', 'hints', 'explore-hints', { side: 'top', optional: true }),
    step('explore', 'suggestions', 'explore-suggestions', { side: 'top', optional: true }),
  ]),
  library: define('library', exact('/history'), [
    step('library', 'games', 'library-tabs', { view: 'games', side: 'bottom' }),
    step('library', 'gameSearch', 'library-search', {
      view: 'games',
      side: 'bottom',
      optional: true,
    }),
    step('library', 'gameCard', 'library-game-card', {
      view: 'games',
      side: 'right',
      optional: true,
    }),
    step('library', 'empty', 'library-empty', { view: 'games', side: 'top', optional: true }),
    step('library', 'manuals', 'library-tabs', { view: 'manuals', side: 'bottom' }),
    step('library', 'search', 'library-search', {
      view: 'manuals',
      side: 'bottom',
      optional: true,
    }),
    step('library', 'manualCard', 'library-manual-card', {
      view: 'manuals',
      side: 'bottom',
      optional: true,
    }),
    step('library', 'empty', 'library-empty', { view: 'manuals', side: 'top', optional: true }),
  ]),
  upload: define('upload', exact('/capture/source'), [
    step('upload', 'game', 'upload-game', { side: 'bottom' }),
    step('upload', 'name', 'upload-name', { side: 'bottom', optional: true }),
    step('upload', 'sources', 'upload-sources', { side: 'bottom' }),
    step('upload', 'pages', 'upload-pages', { side: 'top', optional: true }),
    step('upload', 'share', 'upload-share', { side: 'top' }),
    step('upload', 'shareOptions', 'upload-share-options', { side: 'top', optional: true }),
    step('upload', 'submit', 'upload-submit', { side: 'top' }),
  ]),
  game: define('game', under('/game/'), [
    step('game', 'explanation', 'game-explanation', { side: 'top' }),
    step('game', 'follow', 'game-follow', { side: 'bottom' }),
    step('game', 'rating', 'game-rating', { side: 'bottom' }),
    step('game', 'manuals', 'game-manuals', { side: 'top' }),
    step('game', 'conversations', 'game-conversations', { side: 'top', optional: true }),
    step('game', 'composer', 'game-composer', { side: 'top', optional: true }),
  ]),
  chat: define('chat', under('/chat/'), [
    step('chat', 'suggestions', 'chat-suggestions', { side: 'top', optional: true }),
    step('chat', 'messages', 'chat-messages', { side: 'top', optional: true }),
    step('chat', 'sources', 'chat-sources', { side: 'top', optional: true }),
    step('chat', 'composer', 'chat-composer', { side: 'top' }),
    step('chat', 'new', 'chat-new', { side: 'bottom', align: 'end', optional: true }),
  ]),
  conversations: define('conversations', under('/conversations/'), [
    step('conversations', 'header', 'conversations-header', { side: 'bottom' }),
    step('conversations', 'filter', 'conversations-filter', { side: 'bottom', optional: true }),
    step('conversations', 'list', 'conversations-list', { side: 'top', optional: true }),
    step('conversations', 'menu', 'conversations-row-menu', {
      side: 'left',
      align: 'center',
      optional: true,
    }),
    step('conversations', 'new', 'conversations-new', {
      side: 'top',
      align: 'end',
      optional: true,
    }),
  ]),
  viewer: define('viewer', under('/manual/'), [
    step('viewer', 'pages', 'viewer-pages', { side: 'right' }),
    step('viewer', 'search', 'viewer-search', { side: 'bottom', align: 'end' }),
    step('viewer', 'text', 'viewer-text', { view: 'text', side: 'bottom' }),
    step('viewer', 'edit', 'viewer-edit', {
      view: 'text',
      side: 'bottom',
      align: 'end',
      optional: true,
    }),
    step('viewer', 'original', 'viewer-original', { view: 'original', side: 'bottom' }),
    step('viewer', 'compare', 'viewer-compare', {
      view: 'compare',
      side: 'bottom',
      optional: true,
    }),
    step('viewer', 'manage', 'viewer-manage', { side: 'bottom', align: 'end', optional: true }),
  ]),
  // El procesamiento y el fallo muestran controles distintos.
  processing: define('processing', under('/processing/'), [
    step('processing', 'status', 'processing-status', { side: 'bottom', optional: true }),
    step('processing', 'progress', 'processing-progress', { side: 'bottom', optional: true }),
    step('processing', 'info', 'processing-info', { side: 'top', optional: true }),
    step('processing', 'actions', 'processing-actions', { side: 'top', optional: true }),
  ]),
  settings: define('settings', exact('/settings'), [
    step('settings', 'account', 'settings-account', { side: 'bottom' }),
    step('settings', 'theme', 'settings-theme', { side: 'top' }),
    step('settings', 'accent', 'settings-accent', { side: 'top' }),
    step('settings', 'language', 'settings-language', { side: 'top' }),
    step('settings', 'privacy', 'settings-privacy', { side: 'top' }),
  ]),
  profile: define('profile', exact('/profile'), [
    step('profile', 'identity', 'profile-identity', { side: 'bottom' }),
    step('profile', 'actions', 'profile-actions', { side: 'top' }),
    step('profile', 'activity', 'profile-activity', { side: 'top' }),
  ]),
  security: define('security', exact('/security'), [
    step('security', 'lastAccess', 'security-last-access', { side: 'bottom', optional: true }),
    step('security', 'password', 'security-password', { side: 'top' }),
    step('security', 'delete', 'security-delete', { side: 'top' }),
  ]),
};

export function tourForPathname(pathname: string): TourSpec | null {
  return Object.values(TOURS).find((spec) => spec.matches(pathname)) ?? null;
}
