# DESIGN.md — Refinery Truck Queue ("Ember")

The visual and interaction specification for the web app. Direction F on the
design canvas. Everything in `apps/web` follows this file; when code and this
file disagree, this file is wrong until it is updated, so change it first.

---

## 1. Visual theme and atmosphere

**Warm dark, plainly spoken.**

The system's whole purpose is to state facts nobody can argue with: this truck
returned at 03:01, that officer confirmed at 03:07, this ATC came off the
workbook. The design should feel like a considered instrument rather than an
internal tool: warm charcoal instead of blue-grey, a copper accent instead of a
safety colour, and headlines that say the situation in words.

- **Atmosphere:** calm, warm, low-glare, readable for a whole night shift.
- **Voice:** declarative sentences over labels. "Twenty trucks waiting", not
  "Queue count: 20".
- **One line:** *a quiet room with a copper lamp, not a control panel.*

Dark is the only theme. Staff work nights, and a single theme is one set of
contrast decisions to get right rather than two.

---

## 2. Colour palette and roles

Define every colour as a variable in `apps/web/app/globals.css`. Never write a
hex value anywhere else.

```css
:root {
  color-scheme: dark;

  /* Ground */
  --bg: #171412;              /* app background */
  --bg-rgb: 23, 20, 18;
  --surface: #1a1613;         /* panels, tables */
  --surface-raised: #1c1815;  /* cards inside panels, inputs */
  --surface-sunken: #100e0c;  /* sidebar, page chrome */
  --overlay: rgb(8 6 5 / 72%);/* dialog backdrop */

  /* Lines */
  --border: #2a2520;          /* default hairline */
  --border-strong: #3a332c;   /* input outlines, dividers that must read */

  /* Text */
  --text: #f0ebe4;            /* primary */
  --text-muted: #a89d90;      /* secondary, still 7:1 on --bg */
  --text-faint: #8f8478;      /* tertiary; minimum for 11px text */
  --text-on-accent: #1a1512;  /* text on copper */

  /* Accent */
  --accent: #e0793a;          /* copper: primary action, current position */
  --accent-rgb: 224, 121, 58;
  --accent-hover: #ef8a4b;
  --accent-press: #c96729;
  --accent-soft: rgb(224 121 58 / 12%);
  --accent-line: #4a2f1c;

  /* State */
  --ok: #7fd6a3;      --ok-soft: rgb(127 214 163 / 12%);   --ok-line: #2c5340;
  --warn: #e8c15c;    --warn-soft: rgb(232 193 92 / 12%);  --warn-line: #4a4018;
  --danger: #e8766c;  --danger-soft: rgb(232 118 108 / 12%); --danger-line: #452a28;
  --info: #8fb8e8;    --info-soft: rgb(143 184 232 / 12%);
}
```

**Role rules**

- **Copper is for the user's next action and the current position, nothing
  else.** One copper button per screen. When everything is copper, nothing is.
- **State colours mean state, never decoration.** Green = valid insurance or a
  confirmed step. Amber = a window still open, cover expiring. Red = blocked or
  failed. Never colour a row purely to stripe it.
- **Hue carries no meaning on its own**: every coloured status also carries
  words ("Valid", "Cover ends 4 Oct"), for colour-blind readers and for print.
- Minimum contrast: 4.5:1 for text under 24px, 3:1 at 24px and above.
  `--text-faint` is the floor; anything lighter fails.

---

## 3. Typography

```css
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700;800&family=Azeret+Mono:wght@400;500&display=swap');

--font-display: 'Instrument Serif', 'Iowan Old Style', Georgia, serif;
--font-ui: Manrope, system-ui, -apple-system, 'Segoe UI', sans-serif;
--font-mono: 'Azeret Mono', ui-monospace, 'SF Mono', Menlo, monospace;
```

| Token | Family | Size / line | Weight | Used for |
| --- | --- | --- | --- | --- |
| `display-xl` | display | 52 / 0.98 | 400 | One page-defining headline (queue) |
| `display-l` | display | 36 / 1.05 | 400 | Page titles |
| `display-m` | display | 26 / 1.15 | 400 | Panel headings, hero figures |
| `title` | ui | 15 / 1.3 | 700 | Section and dialog titles |
| `body` | ui | 13.5 / 1.55 | 400 | Prose, descriptions |
| `ui` | ui | 12.5 / 1.4 | 500 | Table cells, controls |
| `ui-strong` | ui | 12.5 / 1.4 | 700 | Registrations, key cells |
| `label` | mono | 9.5 / 1.2, 0.14em | 400 | Eyebrows, column heads, uppercase |
| `figure` | mono | 13 / 1.2 | 500 | Times, counts, ATCs in rows |
| `figure-l` | display | 36 / 1 | 400 | Metric numbers |

Rules:

- **Every number a person compares is mono or tabular.** Times, counts,
  durations, ATC numbers, positions. Columns of figures must line up.
- **Display serif is for headlines and metric figures only.** Never for table
  cells, buttons, inputs or labels.
- Italic display is allowed once per page, to stress one word in a headline.
- Uppercase only in `label`, always with its letter-spacing; never uppercase a
  sentence.
- Never Inter, Roboto, Arial, or the system stack as a visible choice.

---

## 4. Components

### Buttons

```css
.button { font: 700 12.5px/1 var(--font-ui); min-height: 44px; padding: 12px 20px;
  border-radius: 10px; display: inline-flex; align-items: center; gap: 8px;
  cursor: pointer; transition: background .12s ease, border-color .12s ease; }

.button--primary { background: var(--accent); border: 1px solid var(--accent); color: var(--text-on-accent); }
.button--primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
.button--primary:active { background: var(--accent-press); }

.button--secondary { background: var(--surface-raised); border: 1px solid var(--border-strong); color: var(--text); }
.button--secondary:hover { border-color: #4a423a; background: #221d19; }

.button--ghost { background: transparent; border: 0; color: var(--text-muted); }
.button--ghost:hover { color: var(--text); }

.button--danger { background: transparent; border: 1px solid var(--danger-line); color: var(--danger); }
.button--danger:hover { background: var(--danger-soft); }

.button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.button:disabled { opacity: .45; cursor: not-allowed; }
.button[data-busy="true"] { cursor: progress; }
```

One primary per screen region. A destructive action is never primary.

### Panels

```css
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; }
.panel__head { display: flex; align-items: center; justify-content: space-between;
  gap: 16px; padding: 16px 22px; border-bottom: 1px solid var(--border); }
.panel__body { padding: 22px; }
```

A panel head holds a `title` on the left and at most one control or one
`label`-styled note on the right.

### Tables

```css
.table { width: 100%; border-collapse: collapse; font: var(--ui); }
.table th { font: var(--label); text-transform: uppercase; color: var(--text-faint);
  text-align: left; padding: 10px 12px; }
.table td { padding: 13px 12px; border-top: 1px solid #241f1b; vertical-align: middle; }
.table tr[data-current="true"] { background: var(--accent-soft); }
.table tr:hover td { background: rgb(255 255 255 / 2.5%); }
```

- First and last cell take the panel's 22px side padding.
- Text columns left, figures right, status left, actions right.
- Row height stays constant: 48px minimum. Never let one row grow because of a
  longer status.

### Status

```css
.status { font: 600 10.5px/1 var(--font-ui); border-radius: 999px; padding: 5px 10px; white-space: nowrap; }
.status--ok { color: var(--ok); background: var(--ok-soft); }
.status--warn { color: var(--warn); background: var(--warn-soft); }
.status--danger { color: var(--danger); background: var(--danger-soft); }
.status--neutral { color: var(--text-muted); background: rgb(255 255 255 / 6%); }
```

Sentence case, never SHOUTING: "Valid", "Cover ends 4 Oct", "Awaiting driver".

### Navigation

Sidebar on `--surface-sunken`, 252px. Items 11px/12px padding, 10px radius,
`ui` type. Active item is solid `--accent` with `--text-on-accent`, and carries
its count on the right in `figure` type. Only one item is ever active.

### Inputs and dialogs

```css
.field label { font: var(--label); text-transform: uppercase; color: var(--text-faint); }
.field input, .field select, .field textarea { background: var(--surface-raised);
  border: 1px solid var(--border-strong); border-radius: 10px; color: var(--text);
  font: var(--ui); min-height: 44px; padding: 11px 13px; width: 100%; }
.field input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent); }
.field input[aria-invalid="true"] { border-color: var(--danger-line); }

.dialog { background: var(--surface); border: 1px solid var(--border-strong);
  border-radius: 18px; padding: 24px; width: min(520px, calc(100vw - 32px)); }
.dialog__backdrop { background: var(--overlay); }
```

**A dialog's messages belong inside the dialog**, above its fields. A message
rendered on the page behind a dialog is invisible to the person using it: that
exact bug cost an evening of testing.

---

## 5. Layout and alignment

This section is a contract, not a preference. Alignment drift between screens
is the main thing that makes the app feel unfinished.

- **Grid:** 4px base. Use 4, 8, 12, 16, 22, 32, 44, 64. Nothing in between.
- **Shell:** sidebar 252px, content `minmax(0, 1fr)`.
- **Page padding:** 32px top, 38px sides, 44px bottom. Identical on every page.
- **Page header block**, identical on every page, in this order:
  1. eyebrow (`label`, `--accent`)
  2. title (`display-l`)
  3. one sentence of description (`body`, `--text-muted`, max 560px)
  4. actions, right-aligned, baseline-aligned with the title
- **Stat row:** 4 equal columns, 12px gap, directly under the header, 26px below it.
- **Panels:** 22px below the stat row, 16px between stacked panels.
- **Column widths are shared across screens.** Truck 180px, driver 160px,
  officer 160px, time 96px, status 150px, actions auto-right. A column that
  means the same thing on two pages is the same width on both.
- **Right edge discipline:** every panel, stat card and table shares one right
  edge. Nothing is inset "a little bit more".
- **Numbers align right; their headers align right too.**
- Icons are 16px, optically centred, never larger than the text beside them.

### Grouping by status

**A list never interleaves statuses.** Rows are grouped, each group under a
sticky header carrying its name and count, and the groups always appear in the
same order across the whole app:

1. **Awaiting availability** — someone must answer now
2. **Ready for programming** — confirmed, waiting on the programming officer
3. **In the line** — queued, ordered by queue-entry time
4. **Programmed** — carrying an ATC, waiting to load
5. **On trip** — out, nothing to do
6. **Insurance hold** — blocked, needs an administrator
7. **Inactive** — retired from operations

Rules:

- Within a group, order by the column that matters for that group: queue-entry
  time for the line, remaining time for anything on a deadline, registration
  everywhere else.
- A group with no rows is not rendered; its absence is the information.
- The group header is `label` type on `--surface-sunken`, sticky to the top of
  its scroll area, with the count on the right in `figure` type.
- Filtering to one status hides the headers, since they would then say only one
  thing.
- Sorting by a column sorts **within** groups, never across them. A person
  sorting by wait time still wants held trucks kept out of the queue.
- The Live Queue is the exception: it is a single group by definition, and its
  rows carry their position instead.

---

## 6. Depth

Dark interfaces separate with ground and line, not shadow.

```css
--shadow-dialog: 0 24px 60px -24px rgb(0 0 0 / 70%);
--shadow-raised: 0 10px 24px -18px rgb(0 0 0 / 60%);
```

Only dialogs and the focused card of a smart list may carry shadow. Panels
never do: they separate by `--surface` against `--bg` plus a hairline.

---

## 7. Motion and the smart list

Interaction level **L1**: purposeful, short, never decorative. Durations 120ms
(state), 200ms (movement), 260ms (a row leaving a list). Easing
`cubic-bezier(.2, .7, .3, 1)`.

```css
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
```

### The smart list

Any list whose rows carry a primary action is a **work list**: the person
should be able to work top to bottom without hunting, and the list should stay
true to what is left to do.

Rules:

1. **The top item is the focus card.** It is taller, carries the full detail and
   its action as a `button--primary`. Every other row is compact with a
   `button--secondary`.
2. **Acting on an item removes it from the list.** On success the row fades and
   collapses (260ms), the list closes the gap, and the next item is promoted to
   the focus card. The person's pointer is already where the next action will
   be, so the action button keeps its position on screen.
3. **The count in the header updates with the list**, never on reload.
4. **The person's place is never lost.** After acting, focus moves to the new
   focus card's action button, so Enter can be pressed repeatedly.
5. **Failure re-inserts the row** in its original position, with the reason
   shown on that row, not in a page-level banner.
6. **Nothing reorders without cause.** Order comes from the server. A row leaves
   because it was acted on, or because live data moved it. When live data
   changes an order, show a quiet line ("Two trucks joined the line") rather
   than shuffling silently under someone's hands.
7. **No undo where the server cannot undo it.** Reporting a return creates a
   queue entry with a server timestamp. Confirm instead of offering a false undo:
   say what happened ("KTU 482 XA joined the line at position 20").

Applies to: report-return lists, availability confirmation, dispatch
confirmation, bypass approvals, order and ATC assignment. It does not apply to
read-only registers (Live Queue, Programmed, Audit Log), which stay plain tables.

---

## 8. Do's and don'ts

**Do**

1. State the situation in words in the page headline; put the number in it.
2. Keep one copper action per region, always the thing to do next.
3. Use mono or tabular figures for anything a person compares.
4. Put a dialog's errors inside the dialog, above the fields.
5. Show a deadline as a live countdown, and say what happens when it ends.
6. Say why something is blocked, and who can unblock it.
7. Keep every status word plus colour, never colour alone.
8. Keep shared columns the same width on every screen.

**Don't**

1. Don't use copper for anything decorative, or for more than one action.
2. Don't shout in uppercase outside `label` type.
3. Don't set table cells in the display serif.
4. Don't stripe rows with colour that also means state.
5. Don't put a message where the person is not looking.
6. Don't animate anything that carries no information.
7. Don't invent a status the backend cannot produce.
8. Don't offer undo for something the server records permanently.
9. Don't let a longer status or a wrapped name change a row's height.
10. Don't add a second theme "for daytime". Fix contrast instead.

---

## 9. Responsive behaviour

| Breakpoint | Behaviour |
| --- | --- |
| ≥ 1280px | Full shell: sidebar plus content. Stat rows at 4 columns. |
| 1024–1279px | Sidebar 208px. Stat rows at 2×2. Table drops the officer column. |
| 768–1023px | Sidebar collapses to icons (56px), labels on hover and focus. Panels full width. |
| < 768px | Sidebar becomes a bottom bar of 5 items. Tables become stacked cards: registration and driver on the first line, figures on the second, status and action on the third. Smart-list focus card keeps its full form. |

Everywhere: touch targets at least 44×44px, side gutter at least 16px, no
horizontal page scroll, and `display-xl` steps down to 36px below 1024px.

A fleet officer is the most likely phone user: My Fleet and My Bypasses must be
fully usable at 390px wide, including the countdown and the confirm action.
