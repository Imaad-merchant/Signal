# Adding Google-Docs-level configurability to the Tasks workspace

This is a plan plus ready-to-paste prompts for Claude Code, grounded in how your
Signal app is actually built today. Goal: add full toolbars, buttons, options,
and right-click context menus to **both** the whiteboard canvas and the document
editor in the `/tasks` section.

**Configurability target (state this to Claude Code explicitly):** the file
editors should have the configurability of *both a canvas and a word document* —
deliberately copying **Google Docs** (rich text: fonts, headings, lists, tables,
colors, alignment, link, full right-click formatting menu) and **PowerPoint /
Google Slides** a little (canvas object manipulation: shapes, text boxes,
fill/outline, layering with bring-to-front/send-to-back, align & distribute,
grouping, snapping, duplicate). The whiteboard should feel like a slide canvas;
the document editor should feel like Google Docs.

---

## 1. What you have today (so we don't reinvent it)

Your `/tasks` page (`src/pages/Tasks.jsx`) routes a "page" to one of three editors
based on `page.type`:

- `type: "whiteboard"` -> `src/components/tasks/Whiteboard.jsx` (1366 lines, SVG-based infinite canvas)
- `type: "notion"` -> `src/components/tasks/NotionPageView.jsx` (title + plain `<textarea>` + properties + comments)
- `type: "document"` -> `src/components/tasks/DocumentView.jsx` (markdown `<textarea>` + react-markdown preview)

New pages are created from `src/components/tasks/TemplatePicker.jsx`, which sets the
`type`. Everything persists through `base44.entities.Page.update(id, patch)` with a
**600ms debounced save** — the whiteboard saves `JSON.stringify(objects)` to
`page.whiteboard`; the doc editors save a string to `page.content`.

Critically:
- The whiteboard is **SVG**, not `<canvas>`. Shapes are SVG elements; text is a
  `<foreignObject>` with `contentEditable`. Undo/redo is a 50-deep ref stack.
  There is **no right-click menu** today — line ~1060 just does
  `onContextMenu={(e) => e.preventDefault()}`.
- The doc editors have **no formatting toolbar** and **no rich text** — just plain
  text / markdown.
- You already have the right building blocks installed:
  - `@radix-ui/react-context-menu` with a shadcn wrapper at
    `src/components/ui/context-menu.jsx` (already used in the Dashboard, so the
    pattern exists in your repo).
  - `react-quill` (installed but unused).

This is a strong starting point. We are *extending* these files, not rewriting them.

---

## 2. Strategy: how to drive Claude Code

Do **not** paste one giant "make it like Google Docs" prompt — you'll get a sprawling
rewrite that breaks persistence. Instead:

1. **Work in phases** (below). Run one phase, review, test, then do the next.
2. **Always give Claude Code the context block** (Section 3) at the start of a session
   so it knows the data model and the rules. Then paste the phase prompt.
3. **Test between phases.** On your Intel Mac:
   ```bash
   cd /usr/local/var/www/Signal   # <-- replace with your actual Signal path
   npm run dev
   ```
   (Your project uses Vite. If `npm run dev` errors about a missing binary, run
   `npm install` first — your `node_modules` may be from a different machine.)
   Then run `npm run lint` before committing.
4. **Commit after each phase** so you can roll back: `git add -A && git commit -m "..."`.
5. **One editor's behavior at a time.** Whiteboard context menu, then whiteboard
   toolbar, then doc rich-text, then doc context menu.

A senior-engineer note on the doc editor: `react-quill@2` is installed but is
effectively unmaintained and calls the deprecated `findDOMNode`, which throws
warnings under React 18 StrictMode. For *true* Google-Docs configurability
(custom toolbar, slash menus, bubble menus, tables, comments) **Tiptap**
(ProseMirror) is the better foundation. Phase 3 below gives you both options —
pick Tiptap if you want it done right, Quill if you want it fast.

---

## 3. Context block — paste this FIRST in every Claude Code session

```
You are working in my existing React + Vite app (JavaScript, not TypeScript;
Tailwind; shadcn/ui; @base44 backend).

Overall goal: my /tasks file editors should have the configurability of BOTH a
canvas AND a word document. Deliberately copy Google Docs (rich text editing:
fonts, headings, lists, tables, text color, alignment, links, and a full
right-click formatting menu) and copy PowerPoint / Google Slides a little
(canvas object editing: shapes, text boxes, fill + outline, layering with
bring-to-front / send-to-back, align & distribute, grouping, snapping,
duplicate). The whiteboard should feel like a slide canvas; the document editor
should feel like Google Docs.

Read these files before changing anything:

- src/pages/Tasks.jsx                      (routes page.type to an editor)
- src/components/tasks/Whiteboard.jsx      (SVG infinite-canvas editor)
- src/components/tasks/NotionPageView.jsx  (title + textarea + properties)
- src/components/tasks/DocumentView.jsx    (markdown textarea + preview)
- src/components/tasks/TemplatePicker.jsx  (page creation + type)
- src/components/ui/context-menu.jsx       (shadcn radix context-menu wrapper)

Hard rules — do not violate:
1. Persistence must keep working. The whiteboard saves via the existing
   onUpdate({ whiteboard: JSON.stringify(objects) }) debounced ~600ms; the doc
   editors save via onUpdate({ content }) debounced ~600ms. Do NOT change the
   save signature or the page data model. Any new per-element fields you add to
   whiteboard objects must serialize into the same JSON array and round-trip on
   load.
2. The whiteboard is SVG-based (not <canvas>). Keep it SVG. Text objects are
   foreignObject + contentEditable.
3. Undo/redo already exists (ref-based 50-deep stack). Every new mutating action
   you add MUST push onto the existing undo stack the same way current actions do.
4. Reuse the existing shadcn context-menu wrapper (src/components/ui/context-menu.jsx)
   and the existing toolbar styling/classes already in Whiteboard.jsx. Match the
   current dark UI (bg-[#252628], white/10 borders, lucide-react icons).
5. Keep it JavaScript/JSX. No TypeScript. No new global state libraries.
6. Make changes incrementally and keep each file working/lintable after each step.
   Run `npm run lint` and report results. Do not commit.

After reading, summarize the current data model for a whiteboard object and the
current toolbar structure back to me, then wait for my "go" before editing.
```

---

## 4. Phase prompts

### Phase 1 — Whiteboard right-click context menu

```
Add a full right-click context menu to the whiteboard canvas in
src/components/tasks/Whiteboard.jsx, using the existing shadcn context-menu
wrapper (src/components/ui/context-menu.jsx) so styling matches the app.

Two context menus:

A) Right-clicking ON a selected object (or objects) shows:
   - Cut, Copy, Paste, Duplicate  (Cmd+X/C/V/D)
   - Delete  (Del)
   - Bring to Front / Bring Forward / Send Backward / Send to Back
   - Lock / Unlock  (add a `locked: boolean` field on the object; locked objects
     can't be selected/dragged/edited until unlocked)
   - Group / Ungroup  (add a `groupId` field; moving/selecting one selects the group)
   - A submenu "Color" with the existing COLORS palette
   - A submenu "Stroke width" with the existing STROKE_WIDTHS
   - For text objects only: "Edit text"

B) Right-clicking on EMPTY canvas shows:
   - Paste (if clipboard has objects)
   - Select all  (Cmd+A)
   - Toggle grid
   - Reset zoom / Zoom to fit
   - "Add" submenu: Sticky note, Text, Rectangle, Ellipse at the cursor position

Implementation notes:
- Keep using onContextMenu but route it through radix ContextMenu so positioning
  is handled for you. Right-click must first select the object under the cursor if
  it isn't already selected.
- Reordering (front/back) = reordering the objects array (render order = z-order).
- Implement an in-memory clipboard (useRef) holding deep-cloned objects; Paste
  offsets them by ~16px so they don't overlap exactly.
- Every action that mutates objects must push the previous state onto the existing
  undo stack, exactly like the current create/move/delete actions do.
- New fields (locked, groupId) must serialize into the existing whiteboard JSON
  and be respected on load.

Run npm run lint and show me the diff per file. Do not commit.
```

### Phase 2 — Whiteboard toolbar expansion

```
Extend the existing Toolbar in src/components/tasks/Whiteboard.jsx (do not replace
it — add to it, matching current button styling) with these Google-Docs/Figma-style
controls. Each control acts on the current selection (or sets the default for the
next drawn object when nothing is selected):

- Fill color (separate from stroke color) for rect/ellipse, with "none" option
- Opacity slider (0-100) -> per-object `opacity` field
- A "More shapes" dropdown: triangle, diamond, rounded-rect, star
- Alignment buttons for multi-selection: align left/center/right, top/middle/bottom
- Distribute horizontally / vertically (for 3+ selected)
- A text formatting group that ENABLES when a text object is selected: font family
  dropdown, font size, bold/italic/underline, text color, align left/center/right
  (apply to the contentEditable of the selected text object)
- Snap-to-grid toggle and snap-to-object toggle
- An "Export" dropdown: export the canvas as PNG (use the installed html2canvas)
  and as SVG

Keep the toolbar responsive — group controls and collapse less-used ones into a
"..." overflow dropdown if it overflows. All new per-object fields (fill, opacity,
shape variants) must round-trip through the existing whiteboard JSON, and every
mutation must use the existing undo stack.

Run npm run lint and show me the diff. Do not commit.
```

### Phase 3 — Document editor: real rich text with a Google-Docs toolbar

Pick ONE option.

**Option A (recommended) — Tiptap.** Best for true configurability.

```
Upgrade src/components/tasks/DocumentView.jsx to a rich-text editor using Tiptap.

Install: @tiptap/react @tiptap/starter-kit @tiptap/extension-underline
@tiptap/extension-text-align @tiptap/extension-link @tiptap/extension-color
@tiptap/extension-text-style @tiptap/extension-task-list @tiptap/extension-task-item
@tiptap/extension-placeholder @tiptap/extension-table @tiptap/extension-table-row
@tiptap/extension-table-cell @tiptap/extension-table-header

Build a sticky toolbar above the editor (match the app's dark UI, lucide icons):
- Undo/redo
- Paragraph/Heading 1/2/3 dropdown
- Bold, italic, underline, strikethrough, inline code
- Text color + highlight
- Bullet list, numbered list, task (checkbox) list
- Block quote, code block, horizontal rule
- Link (add/edit/remove)
- Align left/center/right/justify
- Insert table
- Clear formatting

Persistence: the page currently stores plain text/markdown in page.content via a
600ms debounced onUpdate({ content }). KEEP that exact save call, but store the
editor's HTML string instead. On load, if page.content looks like HTML use it
directly; if it's plain text/markdown, render it as paragraphs so old documents
still open. Do not change the onUpdate signature or the Tasks.jsx routing.

Keep the Edit/Preview toggle if practical, but the Tiptap editor can be the single
WYSIWYG surface. Run npm run lint and show me the diff. Do not commit.
```

> Intel-Mac note: the Tiptap install is a normal `npm install` — no native
> compilation, so no Apple-Silicon/Intel issues. If install is slow or fails,
> it's almost always a stale `node_modules`; delete it and reinstall.

**Option B — react-quill (already installed, faster, less configurable).**

```
Upgrade src/components/tasks/DocumentView.jsx to use react-quill (already in
package.json) as a rich text editor with a custom toolbar (headers, bold/italic/
underline/strike, color, background, ordered/bullet lists, blockquote, code block,
link, align, clean). Store the Quill HTML in page.content via the existing 600ms
debounced onUpdate({ content }); render old plain-text/markdown docs gracefully on
load. Note: react-quill calls deprecated findDOMNode, so suppress its StrictMode
warning or wrap it accordingly. Keep Tasks.jsx routing unchanged. Run npm run lint
and show the diff. Do not commit.
```

### Phase 4 — Document editor right-click context menu

```
Add a right-click context menu to the document editor (the editor from Phase 3)
using the existing shadcn context-menu wrapper. Items:
- Cut, Copy, Paste, Paste without formatting
- Bold, Italic, Underline (toggles, reflecting current selection state)
- A "Format" submenu: Heading 1/2/3, Paragraph, Bullet list, Numbered list,
  Block quote, Code block
- Insert link, Insert table
- Clear formatting
- Select all

Wire each item to the editor's command API (Tiptap editor.chain()... or Quill
format calls). Match the app's dark styling. Run npm run lint and show the diff.
Do not commit.
```

### Optional Phase 5 — Rich text for the Notion-style page

```
In src/components/tasks/NotionPageView.jsx, replace the plain content <textarea>
with the same rich-text editor component built in Phase 3 (extract it into a
shared component, e.g. src/components/tasks/RichTextEditor.jsx, and reuse it in
both NotionPageView and DocumentView). Preserve the existing properties panel,
comments, icon picker, and the 600ms debounced save of the content field. Run
npm run lint and show the diff. Do not commit.
```

---

## 5. Suggested order & commits

1. Phase 1 -> test right-click on shapes -> `git commit -m "whiteboard: context menu"`
2. Phase 2 -> test toolbar controls -> `git commit -m "whiteboard: expanded toolbar"`
3. Phase 3 (Tiptap) -> test a new Document page -> `git commit -m "docs: rich text editor"`
4. Phase 4 -> test right-click in a doc -> `git commit -m "docs: context menu"`
5. Phase 5 (optional) -> `git commit -m "notion page: rich text"`

Each phase is self-contained and reversible. If a phase goes sideways, you can
`git checkout -- <file>` to discard that file's changes without losing earlier phases.
