import type { ParseKeys } from 'i18next';

export type TourId =
  | 'chat'
  | 'conversations'
  | 'explore'
  | 'game'
  | 'library'
  | 'processing'
  | 'profile'
  | 'security'
  | 'settings'
  | 'upload'
  | 'viewer'
  | 'welcome';

export type TutorialView = 'games' | 'manuals' | 'text' | 'original' | 'compare';

export type TourTarget =
  | 'chat-composer'
  | 'chat-messages'
  | 'chat-new'
  | 'chat-sources'
  | 'chat-suggestions'
  | 'conversations-filter'
  | 'conversations-header'
  | 'conversations-list'
  | 'conversations-new'
  | 'conversations-row-menu'
  | 'explore-hints'
  | 'explore-search'
  | 'explore-suggestions'
  | 'game-follow'
  | 'game-rating'
  | 'game-composer'
  | 'game-conversations'
  | 'game-explanation'
  | 'game-manuals'
  | 'home-activity'
  | 'library-empty'
  | 'library-game-card'
  | 'library-manual-card'
  | 'library-search'
  | 'library-tabs'
  | 'nav-explore'
  | 'nav-help'
  | 'nav-library'
  | 'nav-new-manual'
  | 'processing-actions'
  | 'processing-info'
  | 'processing-progress'
  | 'processing-status'
  | 'profile-actions'
  | 'profile-activity'
  | 'profile-identity'
  | 'security-delete'
  | 'security-last-access'
  | 'security-password'
  | 'settings-accent'
  | 'settings-account'
  | 'settings-language'
  | 'settings-privacy'
  | 'settings-theme'
  | 'upload-game'
  | 'upload-name'
  | 'upload-pages'
  | 'upload-share'
  | 'upload-share-options'
  | 'upload-sources'
  | 'upload-submit'
  | 'viewer-edit'
  | 'viewer-manage'
  | 'viewer-pages'
  | 'viewer-search'
  | 'viewer-text'
  | 'viewer-original'
  | 'viewer-compare';

export type TourSide = 'top' | 'right' | 'bottom' | 'left';
export type TourAlign = 'start' | 'center' | 'end';
export type TutorialKey = ParseKeys<'tutorial'>;

export interface TourStepSpec {
  readonly target: TourTarget;
  readonly view?: TutorialView;
  readonly title: TutorialKey;
  readonly description: TutorialKey;
  /** Se omite si el contenido no está disponible. */
  readonly optional?: boolean;
  readonly side?: TourSide;
  readonly align?: TourAlign;
}

export interface TourSpec {
  readonly id: TourId;
  readonly matches: (pathname: string) => boolean;
  readonly steps: readonly TourStepSpec[];
}
