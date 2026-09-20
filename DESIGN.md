# DESIGN.md — structure and interaction rules

How screens in `apps/web` are laid out and how lists behave. This file says
nothing about colour or typeface: the app keeps its current look. These are the
rules that were missing, and the ones worth enforcing.

---

## 1. Alignment

Alignment drift between screens is the main thing that makes the app feel
unfinished. This section is a contract, not a preference.

- **Grid:** 4px base. Use 4, 8, 12, 16, 20, 24, 32, 44. Nothing in between.
- **Page padding:** identical on every page, including the fleet officer views.
- **Page header block**, same order and spacing on every page:
  1. eyebrow
  2. title
  3. one sentence of description, one maximum, capped at 560px
  4. actions, right-aligned, aligned to the title's baseline
- **Stat row:** equal columns, one gap value, directly under the header.
- **Panels:** one gap value between stacked panels, the same on every page.
- **Shared columns keep one width across the app.** A column that means the
  same thing on two screens is the same width on both: truck, driver, fleet
  officer, time, status, actions.
- **One right edge.** Every panel, stat card and table lines up on it. Nothing
  is inset "a little bit more".
- **Numbers align right, and so do their headers.** Figures use tabular
  numerals so digits line up down a column.
- **Row height is constant.** A longer status or a wrapped name must never make
  one row taller than its neighbours.
- Icons are the same size as the text beside them, never larger.

There are currently eight near-identical page-header classes
(`trucksCommandHeader`, `queueCommandHeader`, `fleetCommandHeader` and so on).
They should be one class. Each new screen that copies another one's header is
how the drift happened.

---

## 2. Grouping by status

**A list never interleaves statuses.** Rows are grouped, each group under a
sticky header with its name and count, and groups appear in the same order
everywhere in the app:

1. **Awaiting availability** — someone must answer now
2. **Ready for programming** — confirmed, waiting on the programming officer
3. **In the line** — queued, ordered by queue-entry time
4. **Programmed** — carrying an ATC, waiting to load
5. **On trip** — out, nothing to do
6. **Insurance hold** — blocked, needs an administrator
7. **Inactive** — retired from operations

Rules:

- Within a group, order by what matters for that group: queue-entry time for
  the line, remaining time for anything on a deadline, registration otherwise.
- A group with no rows is not rendered; its absence is the information.
- Filtering to a single status hides the headers.
- Sorting a column sorts **within** groups, never across them. Someone sorting
  by wait time still wants held trucks kept out of the queue.
- The Live Queue is the exception: one status by definition, and its rows carry
  positions instead.

---

## 3. Smart lists

Any list whose rows carry a primary action is a **work list**: a person should
work top to bottom without hunting, and the list should always reflect what is
left to do.

1. **The top item is the focus card.** Larger, with the full detail and the
   primary action. Every other row is compact with a secondary action.
2. **Acting on an item removes it from the list.** On success the row collapses
   away, the list closes the gap, and the next item becomes the focus card. The
   action button keeps its position on screen, so repeated actions need no
   mouse movement.
3. **The header count updates with the list**, never only on reload.
4. **Focus follows the work.** After acting, keyboard focus moves to the new
   focus card's action, so Enter can be pressed repeatedly.
5. **Failure puts the row back** where it was, with the reason on that row, not
   in a page-level banner.
6. **Nothing reorders without cause.** Order comes from the server. When live
   data changes the order, say so in a quiet line ("Two trucks joined the
   line") rather than shuffling under someone's hands.
7. **No undo where the server cannot undo.** Reporting a return writes a
   server-timestamped queue entry. Confirm what happened instead: "KTU 482 XA
   joined the line at position 20."

Applies to: report-return lists, availability confirmation, dispatch
confirmation, bypass approvals, and order/ATC assignment. It does not apply to
read-only registers (Live Queue, Programmed, Audit Log), which stay plain
tables.

---

## 4. Messages

- **A dialog's messages belong inside the dialog**, above its fields. A message
  rendered on the page behind an open dialog is invisible to the person using
  it. That exact bug cost an evening of testing.
- A row-level failure belongs on the row.
- A page-level banner is only for something affecting the whole page, such as
  live data being unavailable.
- Say what happened and what to do next, in plain words, never a raw error.

---

## 5. Density and responsive behaviour

- Tables are for reading; work lists are for doing. Do not turn a work list
  into a dense table to fit more rows.
- Twenty rows is the normal case, not the exception. Every list must stay
  readable and navigable at that length without scrolling past its own header.
- Touch targets at least 44×44px everywhere.
- A fleet officer is the most likely phone user: My Fleet and My Bypasses must
  be fully usable at 390px wide, including countdowns and the confirm action.
- Below 768px, tables become stacked rows rather than horizontal scrolling.
