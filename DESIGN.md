# Design context

## Product

Bahia Homes Analytics is a Portuguese-language workspace for managing a real-estate brand's social channels. Users review audience and content performance, plan and publish posts, manage messages and accounts, and approve content.

The interface should make frequent operational tasks and performance data easy to scan. Favor clarity, trust, and speed over decorative or marketing-oriented presentation.

## Audience and usage

- Social media and marketing operators working across multiple channels.
- Content approvers who need to review a post and make a clear decision.
- Users switching between dashboards, calendars, inboxes, catalogs, and account settings.

Design for dense, information-rich screens and repeat use. Keep navigation, current context, and primary actions easy to locate.

## Visual direction

Build a calm, precise operations workspace: neutral surfaces keep dense analytics readable, while Bahia Homes' plum and lime provide a recognizable accent. Favor clear structure and purposeful contrast over decoration.

### Foundation tokens

The shared Tailwind theme in `src/app/globals.css` is the source for these foundational tokens:

| Role | Token | Value | Use |
|---|---|---|---|
| Brand primary | `brand-plum` | `#231b2d` | Primary actions and selected emphasis |
| Brand hover | `brand-plum-hover` | `#352a42` | Hover state for primary actions |
| Brand highlight | `brand-lime` | `#ccf600` | Small, high-visibility highlights; avoid for long text |
| Page canvas | `canvas` | `#f7f5f0` | App-level warm neutral background |
| Surface | `surface` | `#fffefa` | Cards, menus, and dialogs |
| Muted surface | `surface-muted` | `#f3f0e9` | Subtle grouped and selected surfaces |
| Primary text | `ink` | `#302d34` | Readable interface content |
| Muted text | `ink-muted` | `#746e68` | Supporting labels and metadata |
| Borders | `border` / `border-strong` | `#e8e4dc` / `#d9d2c8` | Quiet surface separation and stronger control outlines |
| Success status | `status-success` / `status-success-soft` / `status-success-border` | `#17633b` / `#eaf6ee` / `#b8ddc4` | Approved, completed, or healthy states |
| Warning status | `status-warning` / `status-warning-soft` / `status-warning-border` | `#825310` / `#fff5dc` / `#f0d99f` | Pending review or attention states |
| Danger status | `status-danger` / `status-danger-soft` / `status-danger-border` | `#a52626` / `#fff0ef` / `#f0c4c0` | Rejected, destructive, or error states |
| Information status | `status-info` / `status-info-soft` / `status-info-border` | `#40556f` / `#edf2f8` / `#ccd7e4` | Neutral informational feedback |
| Instagram identity | `platform-instagram` | `#c13584` | Instagram-specific iconography only |
| Chart secondary | `chart-secondary` | `#8e877d` | Secondary data series, paired with labels |
| UI easing | `ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Short feedback and entrance transitions |
| UI movement easing | `ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | On-screen repositioning |
| Drawer easing | `ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | Navigation drawer movement |
| Panel radius | `panel` | `1rem` | Large cards and grouped surfaces |
| Control radius | `control` | `0.75rem` | Buttons, inputs, and compact controls |

Use Geist Sans for interface text and Geist Mono only for genuinely tabular or technical values. Lucide React is the icon set. Keep UI copy in Portuguese and terminology consistent within a surface.

Use semantic status tokens rather than raw palette utilities for approval, scheduling, and feedback states. Keep platform identity colors confined to platform marks, and pair chart colors with labels so meaning never depends on color alone. Do not use status or platform colors as alternate brand primaries.

The analytics dashboard currently uses demonstrative growth figures. Keep its chart labels aligned to the displayed reporting period and make the sample-data status explicit until live metrics are connected.

### Community dashboard composition

- Use a compact four-metric summary before the charts; prefer the existing growth figures and avoid duplicating them inside chart panels.
- Arrange the community trend and follower balance as a responsive analytical grid, then pair the content table with a compact audience profile.
- Keep the dashboard dense but scannable: thin borders and dividers separate groups; avoid nested card surfaces and decorative shadows.
- On narrow screens, stack panels and keep wide data tables in their own horizontal scroll region so the page itself does not overflow.

## Design principles

1. **Make data legible.** Prioritize clear labels, comparison, and hierarchy over ornamental chart styling.
2. **Keep workflows predictable.** Use consistent placement and styling for primary, secondary, and destructive actions across modules.
3. **Show state explicitly.** Distinguish loading, empty, selected, disabled, success, and error states; do not rely on color alone.
4. **Respect content density.** Group related information and use spacing consistently without wasting the dashboard's working area.
5. **Be responsive and accessible.** Support keyboard use, visible focus, sufficient contrast, readable text, and layouts that work on narrower viewports.
6. **Preserve user context.** In modals and multi-step tasks, make the purpose, consequences, and exit path clear.

## Interaction guidance

- Use clear, action-oriented labels in Portuguese.
- Reserve the strongest visual emphasis for the main action in a view or dialog.
- Confirm destructive or irreversible actions and provide useful feedback after changes.
- Keep filters, tabs, and selected navigation visibly distinct.
- Provide understandable empty and error states with a useful next step where possible.

## Motion

- Use the shared easing tokens in `src/app/globals.css`; avoid repeating raw Bézier values in components.
- Button press feedback is subtle and brief. Section entrances use opacity and a small vertical offset; centered dialogs use opacity and a restrained scale.
- Keep transitions under 200 ms for routine interactions. Use longer movement only when a drawer needs to communicate spatial direction.
- Under reduced-motion preferences, retain a short opacity cue while removing positional and scale movement. Stop decorative loading pulses and spinner rotations.
- Keep charts and data proportions static; motion must not make values harder to read.

## Avoid

- Introducing gradients, glass effects, or prominent animation without a product need.
- Using brand lime for large text or broad surfaces where it harms readability.
- Treating chart colors as brand colors or assigning colors without consistent meaning.
- Adding visual complexity that competes with metrics, schedules, messages, or approval decisions.
- Replacing existing interaction patterns without checking related screens and states.

## Open design-system work

- Continue migrating remaining, less frequently used screens to the shared color and radius tokens.
- Keep new motion patterns aligned with the shared easing and reduced-motion behavior.
