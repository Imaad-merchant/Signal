# Whiteboard Research & Improvement Plan

Research into how leading canvas/drawing apps work, what makes them *feel right*, and how
our whiteboard (`src/components/tasks/Whiteboard.jsx`) compares — with a prioritized plan to
make shapes, text, and the board itself more configurable and bug-free, on both phone and
desktop.

## 1. Reference apps — what they do well

### TradingView (drawing layer over charts)
- Left toolbar grouped into categories (cursors, trend lines, shapes, text, annotations, icons).
- Every drawing has a **settings dialog**: color, line thickness, **line style (solid/dashed/dotted)**, text font/size/bold/italic, background.
- **Style templates**: save a shape's style and reuse it; each tool remembers its last style.
- **Magnet/snap mode**: weak (snap when near) / strong (always) / off.
- Lots of **keyboard shortcuts**; drawings are individually selectable and editable after creation.

### PowerPoint (shapes + text boxes)
- **Format Shape** pane: fill (none/solid/gradient), **outline color + weight + dash + arrows**, shadow/glow/3-D effects.
- **Size/position numeric inputs**, rotation, **vertical alignment** in box, **wrap text in shape**, text margins.
- Align / distribute / group / lock / z-order, duplicate, format painter (copy style).
- Corner / edge resize handles with **Shift = keep aspect ratio**; rotation handle on top.

### Microsoft Paint (raster, but instructive)
- Simple, discoverable tool set: pencil, brush, line, shapes, fill (bucket), text, color picker, eraser.
- 2023+ added layers, transparency, background removal — i.e. even "simple" apps grew structure.

### Excalidraw / tldraw (the open-source gold standard for SVG/vector whiteboards)
- Selection bbox with **8 resize handles + a rotate handle (circle above the box)**.
- **Shift = lock aspect ratio**, **Alt/Option = resize symmetrically from center**, **Shift during rotate = snap to 15°**.
- **Marquee (rubber-band) selection** by dragging on empty canvas.
- Robust rotated-resize math (rotation "drift" is a famous, deliberately-solved problem — Steve Ruiz's writeup).
- Installable as a **PWA** that works offline; same code runs as web app and "desktop app".

**Sources:** [TradingView drawings](https://www.tradingview.com/charting-library-docs/latest/ui_elements/drawings/),
[TradingView text tool](https://www.tradingview.com/support/solutions/43000516983-text-drawing-tool/),
[PowerPoint shape lines/borders](https://www.officetooltips.com/powerpoint_365/tips/change_shape__diagram__text_box_and_chart_lines_and_borders_in_powerpoint),
[PowerPoint text/vertical align](https://support.microsoft.com/en-us/office/set-text-direction-and-position-in-a-shape-or-text-box-in-powerpoint-64d887b8-91b2-4293-8104-9d4a92a10fc8),
[Microsoft Paint](https://www.microsoft.com/en-us/windows/paint),
[Rotation drift (Steve Ruiz)](https://www.steveruiz.me/posts/rotating-shapes),
[Excalidraw PWA](https://pwa.directory/directory/excalidraw).

## 2. Using it as an app and on computer
- The app is already a Vite SPA deployed on Vercel and works on mobile browsers. To make it a
  proper **installable app (PWA)** on phone and desktop: add a web app manifest + icons + a
  service worker (offline shell). This gives an installable "Signal" app on iOS/Android/desktop
  with no app store. (The whiteboard data already persists per page via `base44`.)
- Desktop ergonomics to add: **trackpad two-finger pan** (today all wheel = zoom), **Space-to-pan**,
  **⌘/Ctrl +/− zoom**, **arrow-key nudge**, **Esc to deselect**.

## 3. Current whiteboard — confirmed bugs ("weird things")
From a full code audit of `Whiteboard.jsx` (2,380 lines):

1. **Dragging triangle / diamond / roundedRect / star does nothing** — the move handler's switch
   has no case for them (`default: return o`). Real, reproducible bug.
2. **Undo-stack spam** — a plain select-click pushes a history snapshot even with no move.
3. **AI generation undo is unreliable** — snapshot uses a stale `objects` closure, not `prev`.
4. **No marquee/rubber-band selection** — dragging empty canvas pans instead of selecting a region.
5. **Hit slop not zoom-relative** — thin lines/small shapes are hard to tap when zoomed out (bad on touch).
6. **Trackpad pan zooms instead of panning** — every wheel event is treated as zoom.
7. **Eraser**: drag-erase can lose history if the first press missed; erases via bounding-box (near, not over).
8. **z-order leapfrog** for multi-selection in bring-forward/send-backward.
9. **Text**: object-level font vs inline `execCommand` formatting conflict; stored HTML is rendered
   unsanitized (`dangerouslySetInnerHTML`); text box doesn't auto-grow / clips.
10. **Saves can thrash** — the persistence effect depends on a non-memoized `onUpdate` from `Tasks.jsx`.
11. **snap-to-grid** state exists but is **never applied** anywhere (dead feature).
12. **Ellipse/triangle/diamond/star** hit-test against their rectangle, not their actual outline.

## 4. Configurability gaps vs PowerPoint / Figma
- **Shapes**: no dashed/dotted stroke, no separate fill/stroke opacity, no real corner-radius control,
  no numeric X/Y/W/H/rotation, no aspect-lock resize, no arrowhead options, **no endpoint handles for
  lines/arrows after creation**, only 4 preset stroke widths.
- **Text**: no line-height, no vertical align, no highlight/bg, no links, no auto-grow, no font weight beyond bold.
- **Canvas**: background color hardcoded, viewport/zoom not persisted, export includes UI chrome (PNG)
  and is zoom-dependent (SVG), export hidden unless something is selected, no system clipboard.

## 5. Structure (why this matters for the work)
~60% of the file is **self-contained UI** (`Toolbar`, `SelectionBar`, `TextRibbon`,
`WhiteboardContextMenu`, `MoreShapesDropdown`, `Minimap`) + **pure helpers** (`objectBounds`,
`hitTest`, `rotatePt`, `pointInBounds`, `distToSegment`, constants). These extract cleanly.
The **hard core** (pointer handlers, transforms, history, the inline per-object SVG renderer) all
closes over the main component's state, so changes there **cannot be parallelized safely** without a
prior refactor (extract a shared `geometry.js` + `worldToScreen`, lift the SVG object into a
`<CanvasObject>` component).

## 6. Prioritized work units (proposed)
**A. Foundation refactor (must land first):** extract pure helpers + constants to `whiteboard/geometry.js`,
add a single `worldToScreen`, pull UI sub-components and the per-object renderer into `whiteboard/*` files.
**B. Bug-fix batch:** drag-move for all shapes, history spam, AI undo, z-order leapfrog, eraser history,
zoom-relative hit slop, save thrash. **C. Selection/navigation:** marquee select, trackpad pan, Space-pan,
arrow nudge, Esc/zoom shortcuts. **D. Shape config:** dashed strokes, fill/stroke opacity, corner radius,
numeric inputs, aspect-lock, arrow/line endpoint handles + arrowheads. **E. Text config:** line-height,
vertical align, highlight, auto-grow, sanitize HTML. **F. Canvas:** snap-to-grid, persist viewport,
background color, robust export. **G. PWA:** manifest + icons + service worker for install on phone/desktop.
