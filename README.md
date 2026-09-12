# Fullscreen Notification Card

[![hacs][hacs-badge]][hacs-url]
[![release][release-badge]][release-url]
[![license][license-badge]](LICENSE)

A Home Assistant dashboard card that stays completely invisible until something
happens — then takes over the screen with an animated notification.

Two presentation styles, three notification types, each with its own drawn-on
icon animation. The entity's own icon is **cut out of** the coloured shape, so
every MDI icon and every custom icon pack works without any extra setup.

| | |
|---|---|
| **Success** | The icon sits in a filled circle and a tick is drawn across it. |
| **Warning** | The icon sits in a rounded triangle, then fades out and is replaced by an `!`. |
| **Progress** | The icon sits inside a round-capped ring that sweeps from 0% up to your value. |

| | |
|---|---|
| **Fullscreen** | A blurred, dimmed, optionally tinted overlay across the whole viewport. Large centred icon, centred title and message. |
| **Pill** | A pill that slides in from the top with a solid tinted background. Icon on the left, text stacked to its right. Backdrop optional. |

---

## Install

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.][hacs-button]][hacs-url]

**With HACS (recommended)**

1. Click the button above, or in HACS search for **Fullscreen Notification Card**.
2. Install, then reload your browser.
3. Add the card to any dashboard view — **Add card → Fullscreen Notification**.

**Manually**

1. Download `fullscreen-notification-card.js` from the [latest release][release-url].
2. Copy it to `<config>/www/community/ha-fullscreen-notification-card/`.
3. Add it as a dashboard resource (`Settings → Dashboards → ⋮ → Resources`):

   ```
   URL:  /local/community/ha-fullscreen-notification-card/fullscreen-notification-card.js
   Type: JavaScript module
   ```

> **Add the card once per dashboard.** It has no visible body of its own — one
> card handles every notification you configure, and it hides itself completely
> whenever nothing is showing.

---

## Quick start

```yaml
type: custom:fullscreen-notification-card
style: fullscreen
theme: auto
duration: 5
notifications:
  - type: success
    title: Washing finished
    message: Time to hang it out.
    entity: sensor.washing_machine_status
    state: complete
    tint: true

  - type: warning
    title: Bathroom is damp
    message: Humidity has been over 70% for a while.
    entity: sensor.bathroom_humidity
    condition:
      - condition: numeric_state
        entity: sensor.bathroom_humidity
        above: 70

  - type: progress
    title: Car charging
    entity: sensor.car_battery
    progress: sensor.car_battery
    condition:
      - condition: state
        entity: binary_sensor.car_charging
        state: "on"
```

There is a full visual editor — everything below can be set without touching
YAML, and each notification has a **play** button that previews it immediately.

---

## Card options

These apply to every notification on the card.

| Option | Type | Default | Description |
|---|---|---|---|
| `style` | `fullscreen` \| `pill` | `fullscreen` | How notifications are presented. |
| `theme` | `auto` \| `light` \| `dark` | `auto` | Near-black or near-white overlay. `auto` follows Home Assistant, falling back to the OS setting. |
| `duration` | number | `5` | Seconds a notification stays on screen, after its animation finishes. |
| `gap` | number | `0.4` | Seconds of quiet between queued notifications. |
| `backdrop_blur` | number | `14` | Backdrop blur radius, in pixels. |
| `backdrop_opacity` | number | `0.6` | Backdrop opacity, `0`–`1`. |
| `pill_backdrop` | boolean | `false` | Show the blurred, dimmed backdrop behind **pill** notifications too. |
| `dismiss_on_tap` | boolean | `true` | Tapping the notification ends it early. |
| `respect_reduced_motion` | boolean | `true` | Drop the slide and rise animations when the OS asks for reduced motion. |
| `debug` | boolean | `false` | Log every trigger evaluation to the browser console. |
| `notifications` | list | `[]` | The notifications themselves. |

## Notification options

| Option | Type | Default | Description |
|---|---|---|---|
| `type` | `success` \| `warning` \| `progress` | **required** | Picks the shape and the icon animation. |
| `title` | string | **required** | Supports templates. |
| `message` | string | — | Supports templates. |
| `entity` | entity id | — | Used for the icon, and as the subject of the `state` shorthand. |
| `icon` | icon | entity icon | Overrides the entity icon. Supports templates. |
| `color` | colour | per type | Any CSS colour, a `var(...)`, or a Home Assistant colour name such as `green`. Defaults to `--success-color` / `--warning-color` / `--primary-color`. |
| `tint` | boolean \| colour | — | `true` tints the backdrop with `color`; a colour tints it with that instead. |
| `duration` | number | card `duration` | Override the visible time for this one notification. |
| `state` | string \| list | — | Shorthand trigger: fire when `entity` enters this state. |
| `condition` | condition \| list | — | Full [Home Assistant conditions](#conditions). ANDed with `state`. |
| `cooldown` | number | `0` | Minimum seconds between two showings of this notification. |
| `trigger_on_load` | boolean | `false` | Also fire if the condition is *already* true when the dashboard opens. |
| `cancel_if_condition_clears` | boolean | `false` | End the notification early if its condition stops being true while it is showing. |
| `progress` | number \| entity id \| template | entity state | `progress` type only: the value to sweep to. |
| `progress_max` | number \| entity id \| template | entity `max`, else `100` | The value that represents 100%. |
| `tap_action` | action | — | `navigate`, `url`, `perform-action`, `more-info`, `toggle` or `none`. |
| `id` | string | — | A stable key. Worth setting if you reorder notifications and want cooldowns to survive. |

---

## How triggering works

Notifications fire on the **rising edge** of their condition — the moment it
goes from false to true. They do not re-fire while it stays true, so a sensor
that updates every ten seconds will not spam you.

That has two consequences worth knowing:

- A condition that is already true when you open the dashboard will **not**
  fire, because there was no transition to observe. Set `trigger_on_load: true`
  if you want it to.
- Use `cooldown` for conditions that flap. `cooldown: 300` means "at most once
  every five minutes, however often it flips".

Evaluation happens in the browser, so a notification appears on every screen
currently looking at that dashboard, and nowhere else. Notifications that
trigger together are shown one after another, in the order they are listed.

### Conditions

`condition` accepts the same syntax as Home Assistant's built-in Conditional
card, plus `template`:

```yaml
condition:
  - condition: state
    entity: binary_sensor.front_door
    state: "on"
  - condition: or
    conditions:
      - condition: numeric_state
        entity: sensor.outside_temperature
        below: 2
      - condition: template
        value_template: "{{ is_state('weather.home', 'snowy') }}"
```

Supported: `state` (with `attribute`, `state`, `state_not`), `numeric_state`
(with `above`, `below`, either a number or an entity id holding one), `screen`
(`media_query`), `user` (`users`), `template` (`value_template`), and the
`and` / `or` / `not` groups.

### Templates

`title`, `message`, `icon`, `progress` and `progress_max` all accept Jinja, and
re-render live:

```yaml
- type: progress
  title: Charging
  message: "{{ states('sensor.car_battery') }}% - {{ states('sensor.car_charge_eta') }} remaining"
  progress: "{{ states('sensor.car_battery') | float }}"
  entity: sensor.car_battery
```

---

## Recipes

**A quiet pill for routine things, with no backdrop**

```yaml
type: custom:fullscreen-notification-card
style: pill
pill_backdrop: false
duration: 4
notifications:
  - type: success
    title: Front door locked
    entity: lock.front_door
    state: locked
    color: green
```

**A demanding fullscreen alert you have to dismiss**

```yaml
type: custom:fullscreen-notification-card
style: fullscreen
duration: 3600
dismiss_on_tap: true
notifications:
  - type: warning
    title: Water leak detected
    message: Under the kitchen sink.
    entity: binary_sensor.kitchen_leak
    state: "on"
    tint: true
    color: red
    cancel_if_condition_clears: true
    tap_action:
      action: more-info
```

**Tap through to a dashboard**

```yaml
- type: progress
  title: Dishwasher
  entity: sensor.dishwasher_progress
  progress: sensor.dishwasher_progress
  condition:
    - condition: state
      entity: sensor.dishwasher_status
      state: running
  tap_action:
    action: navigate
    navigation_path: /lovelace/kitchen
```

---

## Notes and limitations

- The overlay is rendered into `document.body` rather than inside the
  dashboard, so it genuinely covers the viewport — header and sidebar included
  — instead of being clipped by a transformed layout container.
- Triggering is per browser. This is a dashboard card, not a server-side
  notification service; nothing fires on a screen that is not showing the
  dashboard.
- In a dashboard's edit mode the card shows a small placeholder so you can
  select it. On a live dashboard it occupies no space at all.
- `backdrop-filter` and `color-mix()` need a reasonably current browser.
  Firefox, Chrome, Edge and Safari have all supported both since 2023.

## Development

```bash
npm install
npm run build     # -> dist/fullscreen-notification-card.js
npm run watch     # rebuild on change
npm run lint      # type-check only
```

## License

MIT — see [LICENSE](LICENSE).

[hacs-badge]: https://img.shields.io/badge/HACS-Custom-41BDF5.svg?style=flat-square
[hacs-button]: https://my.home-assistant.io/badges/hacs_repository.svg
[hacs-url]: https://my.home-assistant.io/redirect/hacs_repository/?owner=fwhitten&repository=ha-fullscreen-notification-card&category=dashboard
[release-badge]: https://img.shields.io/github/v/release/fwhitten/ha-fullscreen-notification-card?style=flat-square
[release-url]: https://github.com/fwhitten/ha-fullscreen-notification-card/releases/latest
[license-badge]: https://img.shields.io/github/license/fwhitten/ha-fullscreen-notification-card?style=flat-square
