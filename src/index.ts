import './card';
import { FullscreenNotificationCard } from './card';

const VERSION = '__VERSION__';

window.customCards = window.customCards ?? [];
window.customCards.push({
  type: 'fullscreen-notification-card',
  name: 'Fullscreen Notification',
  description:
    'Fullscreen or pill notifications with animated success, warning and progress icons.',
  preview: true,
  documentationURL: 'https://github.com/fwhitten/ha-fullscreen-notification-card',
});

// eslint-disable-next-line no-console
console.info(
  `%c FULLSCREEN-NOTIFICATION-CARD %c ${VERSION} `,
  'color:#fff;background:#03a9f4;font-weight:700;border-radius:3px 0 0 3px',
  'color:#03a9f4;background:#222;border-radius:0 3px 3px 0',
);

export { FullscreenNotificationCard };
