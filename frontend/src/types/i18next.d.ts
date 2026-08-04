import 'i18next';
import type auth from '../locales/es/auth.json';
import type capture from '../locales/es/capture.json';
import type chat from '../locales/es/chat.json';
import type common from '../locales/es/common.json';
import type conversations from '../locales/es/conversations.json';
import type errors from '../locales/es/errors.json';
import type explore from '../locales/es/explore.json';
import type game from '../locales/es/game.json';
import type help from '../locales/es/help.json';
import type home from '../locales/es/home.json';
import type legal from '../locales/es/legal.json';
import type library from '../locales/es/library.json';
import type manual from '../locales/es/manual.json';
import type onboarding from '../locales/es/onboarding.json';
import type profile from '../locales/es/profile.json';
import type security from '../locales/es/security.json';
import type settings from '../locales/es/settings.json';
import type shell from '../locales/es/shell.json';

/* Claves tipadas desde los JSON en español, el idioma que manda */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      auth: typeof auth;
      capture: typeof capture;
      chat: typeof chat;
      common: typeof common;
      conversations: typeof conversations;
      errors: typeof errors;
      explore: typeof explore;
      game: typeof game;
      help: typeof help;
      home: typeof home;
      legal: typeof legal;
      library: typeof library;
      manual: typeof manual;
      onboarding: typeof onboarding;
      profile: typeof profile;
      security: typeof security;
      settings: typeof settings;
      shell: typeof shell;
    };
  }
}
