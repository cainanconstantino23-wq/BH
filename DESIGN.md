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
| Brand highlight | `brand-lime` | `#ccf600` | Small, high-visibility highlights; avoid for long text |
| Page canvas | `canvas` | `#f8faf8` | App-level background |
| Surface | `surface` | `#ffffff` | Cards, menus, and dialogs |
| Primary text | `ink` | `#1f2937` | Readable interface content |
| Muted text | `ink-muted` | `#6b7280` | Supporting labels and metadata |
| Borders | `border` | `#e5e7eb` | Quiet separation between surfaces |
| Panel radius | `panel` | `1rem` | Large cards and grouped surfaces |
| Control radius | `control` | `0.75rem` | Buttons, inputs, and compact controls |

Use Geist Sans for interface text and Geist Mono only for genuinely tabular or technical values. Lucide React is the icon set. Keep UI copy in Portuguese and terminology consistent within a surface.

The app still contains older one-off gray and accent utilities. Treat amber, pink, blue, green, and orange as semantic chart, platform, or status colors—not alternate brand primaries. Migrate existing UI incrementally; don't change interaction behavior as part of visual consistency work.

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

## Avoid

- Introducing gradients, glass effects, or prominent animation without a product need.
- Using brand lime for large text or broad surfaces where it harms readability.
- Treating chart colors as brand colors or assigning colors without consistent meaning.
- Adding visual complexity that competes with metrics, schedules, messages, or approval decisions.
- Replacing existing interaction patterns without checking related screens and states.

## Open design-system work

- Migrate repeated component colors and radii to shared tokens as those components are updated.
- Define shared semantic colors for content status, platform identity, charts, and feedback before expanding their use.
