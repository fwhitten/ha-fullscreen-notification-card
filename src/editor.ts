import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import './overlay';
import type { FsnOverlay } from './overlay';
import { collectTemplates } from './conditions';
import { TemplateSubscriber } from './templates';
import {
  DEFAULTS,
  isDarkMode,
  notificationKey,
  prefersReducedMotion,
  resolveNotification,
} from './resolve';
import type {
  FullscreenNotificationCardConfig,
  HomeAssistant,
  NotificationConfig,
} from './types';

const LABELS: Record<string, string> = {
  style: 'Notification style',
  theme: 'Colour scheme',
  duration: 'Visible for',
  gap: 'Gap between notifications',
  backdrop_blur: 'Backdrop blur',
  backdrop_opacity: 'Backdrop opacity',
  pill_backdrop: 'Show backdrop behind pill notifications',
  dismiss_on_tap: 'Dismiss when tapped',
  respect_reduced_motion: 'Respect "reduce motion"',
  debug: 'Log trigger evaluation to the console',
  type: 'Type',
  title: 'Title',
  message: 'Message',
  entity: 'Entity',
  icon: 'Icon',
  color: 'Colour',
  state: 'Trigger when the entity state is',
  cooldown: 'Minimum time between repeats',
  trigger_on_load: 'Also trigger if already true when the page loads',
  cancel_if_condition_clears: 'Hide early if the condition stops being true',
  progress: 'Progress value',
  progress_max: 'Value that means 100%',
  tint: 'Tint the backdrop with the notification colour',
  tap_action: 'Tap action',
};

const HELPERS: Record<string, string> = {
  duration: 'Seconds each notification stays on screen.',
  entity: 'Used for the icon, and as the subject of the simple trigger below.',
  icon: 'Leave empty to use the entity icon.',
  state: 'Leave empty if you are using the advanced conditions below.',
  progress: 'A number, an entity id, or a template. Defaults to the entity state.',
  progress_max: 'Defaults to the entity max attribute, or 100.',
};

const GLOBAL_SCHEMA = [
  {
    type: 'grid',
    name: '',
    schema: [
      {
        name: 'style',
        selector: {
          select: {
            mode: 'dropdown',
            options: [
              { value: 'fullscreen', label: 'Fullscreen' },
              { value: 'pill', label: 'Pill' },
            ],
          },
        },
      },
      {
        name: 'theme',
        selector: {
          select: {
            mode: 'dropdown',
            options: [
              { value: 'auto', label: 'Match Home Assistant' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ],
          },
        },
      },
    ],
  },
  {
    type: 'grid',
    name: '',
    schema: [
      {
        name: 'duration',
        selector: { number: { min: 0.5, step: 0.5, mode: 'box', unit_of_measurement: 's' } },
      },
      {
        name: 'gap',
        selector: { number: { min: 0, step: 0.1, mode: 'box', unit_of_measurement: 's' } },
      },
    ],
  },
  {
    type: 'expandable',
    name: '',
    title: 'Backdrop',
    icon: 'mdi:blur',
    schema: [
      { name: 'backdrop_blur', selector: { number: { min: 0, max: 60, step: 1, mode: 'slider' } } },
      {
        name: 'backdrop_opacity',
        selector: { number: { min: 0, max: 1, step: 0.05, mode: 'slider' } },
      },
      { name: 'pill_backdrop', selector: { boolean: {} } },
    ],
  },
  {
    type: 'expandable',
    name: '',
    title: 'Behaviour',
    icon: 'mdi:tune',
    schema: [
      { name: 'dismiss_on_tap', selector: { boolean: {} } },
      { name: 'respect_reduced_motion', selector: { boolean: {} } },
      { name: 'debug', selector: { boolean: {} } },
    ],
  },
];

const NOTIFICATION_SCHEMA = [
  {
    name: 'type',
    required: true,
    selector: {
      select: {
        mode: 'dropdown',
        options: [
          { value: 'success', label: 'Success' },
          { value: 'warning', label: 'Warning' },
          { value: 'progress', label: 'Progress' },
        ],
      },
    },
  },
  { name: 'title', required: true, selector: { text: {} } },
  { name: 'message', selector: { text: { multiline: true } } },
  {
    type: 'grid',
    name: '',
    schema: [
      { name: 'entity', selector: { entity: {} } },
      { name: 'icon', selector: { icon: {} } },
    ],
  },
  { name: 'color', selector: { ui_color: {} } },
  {
    type: 'expandable',
    name: '',
    title: 'Trigger',
    icon: 'mdi:flash-outline',
    schema: [
      { name: 'state', selector: { text: {} } },
      {
        type: 'grid',
        name: '',
        schema: [
          {
            name: 'cooldown',
            selector: { number: { min: 0, step: 1, mode: 'box', unit_of_measurement: 's' } },
          },
          {
            name: 'duration',
            selector: { number: { min: 0, step: 0.5, mode: 'box', unit_of_measurement: 's' } },
          },
        ],
      },
      { name: 'trigger_on_load', selector: { boolean: {} } },
      { name: 'cancel_if_condition_clears', selector: { boolean: {} } },
    ],
  },
  {
    type: 'expandable',
    name: '',
    title: 'Progress ring',
    icon: 'mdi:progress-helper',
    schema: [
      { name: 'progress', selector: { text: {} } },
      { name: 'progress_max', selector: { text: {} } },
    ],
  },
  {
    type: 'expandable',
    name: '',
    title: 'Extras',
    icon: 'mdi:dots-horizontal',
    schema: [
      { name: 'tint', selector: { boolean: {} } },
      { name: 'tap_action', selector: { ui_action: {} } },
    ],
  },
];

const fireConfigChanged = (element: HTMLElement, config: unknown): void => {
  element.dispatchEvent(
    new CustomEvent('config-changed', {
      detail: { config },
      bubbles: true,
      composed: true,
    }),
  );
};

@customElement('fullscreen-notification-card-editor')
export class FullscreenNotificationCardEditor extends LitElement {
  @state() private _config?: FullscreenNotificationCardConfig;
  @state() private _expanded = new Set<number>();

  private _hass?: HomeAssistant;
  private _overlay?: FsnOverlay;
  private _templates = new TemplateSubscriber(() => undefined);

  public setConfig(config: FullscreenNotificationCardConfig): void {
    this._config = { ...config, notifications: config.notifications ?? [] };
    this._templates.sync((this._config.notifications ?? []).flatMap(collectTemplates));
  }

  public set hass(hass: HomeAssistant) {
    this._hass = hass;
    this._templates.setHass(hass);
    this.requestUpdate();
  }

  public get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._templates.destroy();
    this._overlay?.abort();
    this._overlay?.remove();
    this._overlay = undefined;
  }

  private _label = (schema: { name: string; title?: string }): string =>
    LABELS[schema.name] ?? schema.title ?? schema.name;

  private _helper = (schema: { name: string }): string | undefined => HELPERS[schema.name];

  protected render(): TemplateResult | typeof nothing {
    const config = this._config;
    if (!config || !this._hass) {
      return nothing;
    }

    const globals = {
      style: config.style ?? DEFAULTS.style,
      theme: config.theme ?? DEFAULTS.theme,
      duration: config.duration ?? DEFAULTS.duration,
      gap: config.gap ?? DEFAULTS.gap,
      backdrop_blur: config.backdrop_blur ?? DEFAULTS.backdrop_blur,
      backdrop_opacity: config.backdrop_opacity ?? DEFAULTS.backdrop_opacity,
      pill_backdrop: config.pill_backdrop ?? DEFAULTS.pill_backdrop,
      dismiss_on_tap: config.dismiss_on_tap ?? DEFAULTS.dismiss_on_tap,
      respect_reduced_motion:
        config.respect_reduced_motion ?? DEFAULTS.respect_reduced_motion,
      debug: config.debug ?? false,
    };

    return html`
      <ha-form
        .hass=${this._hass}
        .data=${globals}
        .schema=${GLOBAL_SCHEMA}
        .computeLabel=${this._label}
        .computeHelper=${this._helper}
        @value-changed=${this._globalsChanged}
      ></ha-form>

      <div class="section-title">Notifications</div>
      ${(config.notifications ?? []).map((notification, index) =>
        this._renderNotification(notification, index),
      )}

      <button class="add" @click=${this._add}>
        <ha-icon icon="mdi:plus"></ha-icon> Add notification
      </button>
    `;
  }

  private _renderNotification(
    notification: NotificationConfig,
    index: number,
  ): TemplateResult {
    const data = {
      ...notification,
      // `tint` also accepts an explicit colour in YAML; the toggle only says
      // whether tinting is on, and an existing colour is preserved on change.
      tint: notification.tint !== undefined && notification.tint !== false,
    };

    return html`
      <ha-expansion-panel
        outlined
        .expanded=${this._expanded.has(index)}
        @expanded-changed=${(ev: CustomEvent) => this._toggle(index, ev.detail.expanded)}
      >
        <div slot="header" class="header">
          <ha-icon class=${notification.type} icon=${this._headerIcon(notification)}></ha-icon>
          <span class="header-title">${notification.title || 'Untitled notification'}</span>
        </div>

        <div class="row toolbar">
          <button title="Preview" @click=${() => this._preview(notification, index)}>
            <ha-icon icon="mdi:play-circle-outline"></ha-icon>
          </button>
          <span class="spacer"></span>
          <button title="Move up" ?disabled=${index === 0} @click=${() => this._move(index, -1)}>
            <ha-icon icon="mdi:arrow-up"></ha-icon>
          </button>
          <button
            title="Move down"
            ?disabled=${index === (this._config?.notifications?.length ?? 1) - 1}
            @click=${() => this._move(index, 1)}
          >
            <ha-icon icon="mdi:arrow-down"></ha-icon>
          </button>
          <button title="Delete" class="danger" @click=${() => this._remove(index)}>
            <ha-icon icon="mdi:delete-outline"></ha-icon>
          </button>
        </div>

        <ha-form
          .hass=${this._hass}
          .data=${data}
          .schema=${NOTIFICATION_SCHEMA}
          .computeLabel=${this._label}
          .computeHelper=${this._helper}
          @value-changed=${(ev: CustomEvent) => this._notificationChanged(index, ev)}
        ></ha-form>

        <div class="yaml-label">
          Advanced conditions
          <span class="yaml-hint">
            Home Assistant condition syntax. ANDed with the simple trigger above.
          </span>
        </div>
        <ha-yaml-editor
          .hass=${this._hass}
          .defaultValue=${notification.condition ?? []}
          @value-changed=${(ev: CustomEvent) => this._conditionChanged(index, ev)}
        ></ha-yaml-editor>
      </ha-expansion-panel>
    `;
  }

  private _headerIcon(notification: NotificationConfig): string {
    switch (notification.type) {
      case 'warning':
        return 'mdi:alert-outline';
      case 'progress':
        return 'mdi:progress-helper';
      default:
        return 'mdi:check-circle-outline';
    }
  }

  private _toggle(index: number, expanded: boolean): void {
    const next = new Set(this._expanded);
    if (expanded) {
      next.add(index);
    } else {
      next.delete(index);
    }
    this._expanded = next;
  }

  // --- config mutation ---------------------------------------------------

  private _emit(notifications: NotificationConfig[], globals?: Partial<FullscreenNotificationCardConfig>): void {
    const config = { ...this._config, ...globals, notifications } as FullscreenNotificationCardConfig;
    this._config = config;
    fireConfigChanged(this, config);
  }

  private _globalsChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    this._emit(this._config?.notifications ?? [], ev.detail.value);
  }

  private _notificationChanged(index: number, ev: CustomEvent): void {
    ev.stopPropagation();
    const notifications = [...(this._config?.notifications ?? [])];
    const previous = notifications[index];
    const value = { ...ev.detail.value } as NotificationConfig;

    // Restore the richer `tint` forms the toggle cannot express.
    if (value.tint === true && typeof previous.tint === 'string') {
      value.tint = previous.tint;
    } else if (value.tint === false) {
      delete value.tint;
    }
    value.condition = previous.condition;

    for (const key of Object.keys(value) as (keyof NotificationConfig)[]) {
      if (value[key] === '' || value[key] === undefined) {
        delete value[key];
      }
    }

    notifications[index] = value;
    this._emit(notifications);
  }

  private _conditionChanged(index: number, ev: CustomEvent): void {
    ev.stopPropagation();
    if (ev.detail.isValid === false) {
      return;
    }
    const notifications = [...(this._config?.notifications ?? [])];
    const value = ev.detail.value;
    const next = { ...notifications[index] };
    if (!value || (Array.isArray(value) && value.length === 0)) {
      delete next.condition;
    } else {
      next.condition = value;
    }
    notifications[index] = next;
    this._emit(notifications);
  }

  private _add(): void {
    const notifications = [
      ...(this._config?.notifications ?? []),
      { type: 'success', title: 'New notification' } as NotificationConfig,
    ];
    this._toggle(notifications.length - 1, true);
    this._emit(notifications);
  }

  private _remove(index: number): void {
    const notifications = [...(this._config?.notifications ?? [])];
    notifications.splice(index, 1);
    this._expanded = new Set();
    this._emit(notifications);
  }

  private _move(index: number, delta: number): void {
    const notifications = [...(this._config?.notifications ?? [])];
    const target = index + delta;
    if (target < 0 || target >= notifications.length) {
      return;
    }
    [notifications[index], notifications[target]] = [
      notifications[target],
      notifications[index],
    ];
    this._expanded = new Set();
    this._emit(notifications);
  }

  // --- preview -----------------------------------------------------------

  private _preview(notification: NotificationConfig, index: number): void {
    const config = this._config;
    if (!config) {
      return;
    }
    if (!this._overlay) {
      this._overlay = document.createElement('fsn-overlay');
      document.body.appendChild(this._overlay);
    }

    const resolved = resolveNotification(
      notification,
      notificationKey(notification, index),
      config,
      this._hass,
      (template) => this._templates.get(template) ?? template,
    );

    this._overlay.present(resolved, {
      hass: this._hass,
      style: config.style ?? DEFAULTS.style,
      dark: isDarkMode(config.theme ?? DEFAULTS.theme, this._hass),
      backdrop: config.pill_backdrop ?? DEFAULTS.pill_backdrop,
      blur: config.backdrop_blur ?? DEFAULTS.backdrop_blur,
      opacity: config.backdrop_opacity ?? DEFAULTS.backdrop_opacity,
      reduced:
        (config.respect_reduced_motion ?? DEFAULTS.respect_reduced_motion) &&
        prefersReducedMotion(),
      dismissOnTap: true,
    });
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .section-title {
      font-weight: 500;
      margin-top: 4px;
    }

    ha-expansion-panel {
      --expansion-panel-summary-padding: 0 12px;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .header-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .header ha-icon.success {
      color: var(--success-color, #43a047);
    }

    .header ha-icon.warning {
      color: var(--warning-color, #ffa600);
    }

    .header ha-icon.progress {
      color: var(--primary-color, #03a9f4);
    }

    .row {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .toolbar {
      padding: 4px 8px 8px;
    }

    .spacer {
      flex: 1;
    }

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: none;
      border: none;
      border-radius: 50%;
      padding: 8px;
      cursor: pointer;
      color: var(--secondary-text-color);
      font: inherit;
    }

    button:hover:not([disabled]) {
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
    }

    button[disabled] {
      opacity: 0.35;
      cursor: default;
    }

    button.danger:hover {
      color: var(--error-color, #db4437);
    }

    button.add {
      align-self: flex-start;
      border-radius: 8px;
      padding: 10px 14px;
      color: var(--primary-color);
    }

    ha-form,
    ha-yaml-editor {
      display: block;
      padding: 0 8px 8px;
    }

    .yaml-label {
      padding: 4px 8px;
      font-size: 13px;
      font-weight: 500;
    }

    .yaml-hint {
      display: block;
      font-weight: 400;
      color: var(--secondary-text-color);
      font-size: 12px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'fullscreen-notification-card-editor': FullscreenNotificationCardEditor;
  }
}
