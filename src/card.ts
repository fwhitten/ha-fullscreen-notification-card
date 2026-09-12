import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import './overlay';
import type { FsnOverlay, Presentation } from './overlay';
import { checkNotification, collectTemplates } from './conditions';
import { TemplateSubscriber } from './templates';
import {
  DEFAULTS,
  isDarkMode,
  notificationKey,
  prefersReducedMotion,
  resolveNotification,
} from './resolve';
import type {
  ActionConfig,
  FullscreenNotificationCardConfig,
  HomeAssistant,
  NotificationConfig,
  ResolvedNotification,
} from './types';

interface TriggerState {
  /** Result of the previous evaluation; undefined until the first one. */
  last?: boolean;
  lastFiredAt: number;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

@customElement('fullscreen-notification-card')
export class FullscreenNotificationCard extends LitElement {
  @property({ attribute: false }) public preview = false;

  @state() private _config?: FullscreenNotificationCardConfig;
  @state() private _editMode = false;

  private _hass?: HomeAssistant;
  private _overlay?: FsnOverlay;
  private _templates = new TemplateSubscriber(() => this._evaluate());
  private _triggers = new Map<string, TriggerState>();
  private _queue: ResolvedNotification[] = [];
  private _running = false;
  private _current?: { key: string; presentation: Presentation };

  public static async getConfigElement(): Promise<HTMLElement> {
    await import('./editor');
    return document.createElement('fullscreen-notification-card-editor');
  }

  public static getStubConfig(): FullscreenNotificationCardConfig {
    return {
      type: 'custom:fullscreen-notification-card',
      style: 'fullscreen',
      duration: 5,
      notifications: [],
    };
  }

  public setConfig(config: FullscreenNotificationCardConfig): void {
    if (!config) {
      throw new Error('Invalid configuration');
    }
    const notifications = config.notifications ?? [];
    if (!Array.isArray(notifications)) {
      throw new Error('`notifications` must be a list');
    }
    notifications.forEach((notification, index) => {
      if (!notification || typeof notification !== 'object') {
        throw new Error(`Notification ${index + 1} is not a mapping`);
      }
      if (!['success', 'warning', 'progress'].includes(notification.type)) {
        throw new Error(
          `Notification ${index + 1} needs a \`type\` of success, warning or progress`,
        );
      }
      if (!notification.title) {
        throw new Error(`Notification ${index + 1} needs a \`title\``);
      }
    });

    this._config = { ...config, notifications };
    this._triggers.clear();
    this._syncTemplates();
  }

  public set hass(hass: HomeAssistant) {
    this._hass = hass;
    this._templates.setHass(hass);
    this._evaluate();
  }

  public get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  public getCardSize(): number {
    return 1;
  }

  public getGridOptions(): Record<string, unknown> {
    return { rows: 1, columns: 12, min_rows: 1 };
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._editMode = this._detectEditMode();
    if (!this._overlay) {
      this._overlay = document.createElement('fsn-overlay');
    }
    // Portalled out of the dashboard so `position: fixed` is measured against
    // the viewport rather than a transformed Sections container.
    document.body.appendChild(this._overlay);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._current?.presentation.dismiss();
    this._queue = [];
    this._running = false;
    this._templates.destroy();
    this._overlay?.abort();
    this._overlay?.remove();
  }

  // --- triggering --------------------------------------------------------

  private _syncTemplates(): void {
    const templates = (this._config?.notifications ?? []).flatMap(collectTemplates);
    this._templates.sync(templates);
  }

  private _evaluate(): void {
    const config = this._config;
    const hass = this._hass;
    if (!config || !hass || this._editMode || this.preview) {
      return;
    }
    // Hold off until every template has reported once, otherwise a
    // half-resolved condition can fire a spurious notification on page load.
    if (!this._templates.isReady()) {
      return;
    }

    const ctx = {
      hass,
      template: (template: string) => this._templates.get(template),
    };

    (config.notifications ?? []).forEach((notification, index) => {
      const key = notificationKey(notification, index);
      const trigger = this._triggers.get(key) ?? { lastFiredAt: 0 };
      const now = checkNotification(notification, ctx);
      const first = trigger.last === undefined;

      const rising = first
        ? now && notification.trigger_on_load === true
        : now && !trigger.last;

      trigger.last = now;
      this._triggers.set(key, trigger);

      if (config.debug) {
        // eslint-disable-next-line no-console
        console.debug('[fullscreen-notification-card]', key, { now, first, rising });
      }

      if (rising) {
        this._fire(notification, key, trigger);
      } else if (
        !now &&
        notification.cancel_if_condition_clears &&
        this._current?.key === key
      ) {
        this._current.presentation.dismiss();
      }
    });
  }

  private _fire(
    notification: NotificationConfig,
    key: string,
    trigger: TriggerState,
  ): void {
    const cooldown = (notification.cooldown ?? 0) * 1000;
    if (cooldown && Date.now() - trigger.lastFiredAt < cooldown) {
      return;
    }
    // Already on screen or waiting its turn: don't stack duplicates.
    if (this._current?.key === key || this._queue.some((q) => q.key === key)) {
      return;
    }
    trigger.lastFiredAt = Date.now();
    this.enqueue(notification, key);
  }

  /** Queue a notification for display. Also used by the editor's preview. */
  public enqueue(notification: NotificationConfig, key: string): void {
    if (!this._config) {
      return;
    }
    this._queue.push(
      resolveNotification(notification, key, this._config, this._hass, (template) =>
        this._templates.get(template),
      ),
    );
    void this._pump();
  }

  // --- presentation ------------------------------------------------------

  private async _pump(): Promise<void> {
    if (this._running) {
      return;
    }
    this._running = true;
    try {
      while (this._queue.length) {
        const next = this._queue.shift()!;
        await this._present(next);
        if (this._queue.length) {
          await sleep((this._config?.gap ?? DEFAULTS.gap) * 1000);
        }
      }
    } finally {
      this._running = false;
      this._current = undefined;
    }
  }

  private async _present(notification: ResolvedNotification): Promise<void> {
    const overlay = this._overlay;
    const config = this._config;
    if (!overlay || !config) {
      return;
    }

    const reduced =
      (config.respect_reduced_motion ?? DEFAULTS.respect_reduced_motion) &&
      prefersReducedMotion();

    const presentation = overlay.present(notification, {
      hass: this._hass,
      style: config.style ?? DEFAULTS.style,
      dark: isDarkMode(config.theme ?? DEFAULTS.theme, this._hass),
      backdrop: config.pill_backdrop ?? DEFAULTS.pill_backdrop,
      blur: config.backdrop_blur ?? DEFAULTS.backdrop_blur,
      opacity: config.backdrop_opacity ?? DEFAULTS.backdrop_opacity,
      reduced,
      dismissOnTap: config.dismiss_on_tap ?? DEFAULTS.dismiss_on_tap,
      onTap: notification.config.tap_action
        ? () => this._runAction(notification.config.tap_action!, notification)
        : undefined,
    });

    this._current = { key: notification.key, presentation };
    await presentation.done;
    this._current = undefined;
  }

  // --- tap actions -------------------------------------------------------

  private _runAction(action: ActionConfig, notification: ResolvedNotification): void {
    const hass = this._hass;
    const entityId = action.entity ?? notification.config.entity;

    switch (action.action) {
      case 'navigate':
        if (action.navigation_path) {
          history.pushState(null, '', action.navigation_path);
          this.dispatchEvent(
            new CustomEvent('location-changed', { bubbles: true, composed: true }),
          );
        }
        break;

      case 'url':
        if (action.url_path) {
          window.open(action.url_path, '_blank', 'noreferrer');
        }
        break;

      case 'toggle':
        if (hass && entityId) {
          void hass.callService('homeassistant', 'toggle', { entity_id: entityId });
        }
        break;

      case 'more-info':
        if (entityId) {
          // Fired from the card, which still sits inside <home-assistant>; the
          // portalled overlay is a sibling of it and would not be heard.
          this.dispatchEvent(
            new CustomEvent('hass-more-info', {
              detail: { entityId },
              bubbles: true,
              composed: true,
            }),
          );
        }
        break;

      case 'call-service':
      case 'perform-action': {
        const target = action.perform_action ?? action.service;
        if (hass && target?.includes('.')) {
          const [domain, service] = target.split('.', 2);
          void hass.callService(
            domain,
            service,
            action.data ?? action.service_data ?? {},
            action.target,
          );
        }
        break;
      }

      default:
        break;
    }
  }

  // --- edit mode ---------------------------------------------------------

  /**
   * The card is invisible in normal use, which makes it impossible to select
   * while editing a dashboard. `hui-card-options` only wraps cards in edit
   * mode, so its presence up the (shadow-crossing) tree is a reliable signal.
   */
  private _detectEditMode(): boolean {
    let node: Node | null = this;
    for (let depth = 0; node && depth < 20; depth++) {
      const name = (node as HTMLElement).localName;
      if (name === 'hui-card-options' || name === 'hui-card-edit-mode') {
        return true;
      }
      node =
        (node as HTMLElement).parentElement ??
        ((node.getRootNode() as ShadowRoot).host as Node | undefined) ??
        null;
    }
    return false;
  }

  protected updated(): void {
    // `hidden` is how the built-in conditional card disappears, and both the
    // masonry and sections layouts already collapse a hidden card's slot.
    this.hidden = !this._editMode && !this.preview;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._editMode && !this.preview) {
      return nothing;
    }

    const count = this._config?.notifications?.length ?? 0;
    return html`
      <ha-card>
        <div class="placeholder">
          <ha-icon icon="mdi:bell-badge-outline"></ha-icon>
          <div>
            <div class="name">Fullscreen Notification</div>
            <div class="hint">
              ${count} notification${count === 1 ? '' : 's'} &middot; hidden on the live
              dashboard
            </div>
          </div>
        </div>
      </ha-card>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }

    :host([hidden]) {
      display: none !important;
    }

    .placeholder {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
    }

    .placeholder ha-icon {
      color: var(--secondary-text-color);
      --mdc-icon-size: 26px;
    }

    .name {
      font-weight: 500;
    }

    .hint {
      font-size: 12px;
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'fullscreen-notification-card': FullscreenNotificationCard;
  }
}
