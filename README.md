# Canvy

A hand-drawn diagram canvas that runs entirely in the browser. There is no account, no server and no build step.

- `index.html` is the landing page
- `app/index.html` is the editor

### Sharing and presenting (phase 3)
- **View-only links**: tick "View only" in Share, and the link (`?view=1#d=…`) opens read-only with pan/zoom and an "Edit a copy" button. Nothing is saved on the viewer's side.
- **Embed**: "Copy embed code" gives an `<iframe>` (`?embed=1`) for blogs and Notion.
- **QR code** for the share link (long diagrams may be too big; share a `.canvy` file instead).
- **PDF**: one page per frame, built in the browser.
- **Speaker notes**: right-click a frame → Speaker notes. While presenting, `N` shows the notes and `L` turns on the laser pointer.
- **Excalidraw import**: open or drop a `.excalidraw` file.
- **Ctrl/⌘ K** command palette: tools, actions, templates, looks, exports, and "go to" any labelled shape.
- New Thai templates: ผังองค์กร, เส้นทางลูกค้า, ขั้นตอนอนุมัติเอกสาร, วิเคราะห์ SWOT, แผนงานรายไตรมาส.

## What the editor does

- **Hand-drawn canvas:** 12 shapes plus tables (box, pill, ellipse, decision, database, hexagon, in/out, document, cloud, sticky, person), 35 icons, arrows, lines, pen, highlighter, text and frames
- **Right-click menus:** right-click, long-press or tap Space on empty canvas for tools, zoom and view. Right-clicking a shape opens its own menu
- **Smooth editing:**
  - shapes snap to their neighbours' edges and centres, with guide lines (hold Ctrl/⌘ to place freely)
  - long labels wrap inside their shape, Thai at word boundaries
  - group (Ctrl/⌘ G), ungroup (Ctrl/⌘ Shift G) and lock (Ctrl/⌘ Shift L)
  - hover a shape and drag or click a + to add a connected shape
  - paste or drop pictures
  - two-finger pinch zoom on touch screens
  - an overview map when the diagram is bigger than the window
  - Ctrl/⌘ F to find a shape by name
  - drag the ◇ in the middle of an arrow to bend it, or the ○ above a shape to rotate it (Shift for 15° steps)
  - cards with a title and bullet points, and tables (type `| Task | Owner | Status |`, Tab moves between cells)
- **Floating toolbar** above the selection:
  - change shape, fill, line, width, text size
  - bold, numbered badge, ✓ ✗ ⚠ marks, paper-shadow lift, pencil shading, stack ×N
  - arrow ends (→ ↔ — crow's foot), dashed, elbow routing
  - align and distribute
- **Insert panel (I):** blocks with live previews in Sections, Systems, Data & APIs, Notes, Patterns, Icons and Thai, plus templates
- **Text to diagram:** `user:Customer -> API -(SQL)-> db:Orders`, `a -- b`, `a <-> b`, `a ..> b`, self-loops, `## Heading`, left-to-right or top-to-bottom layout, and typing an existing name flies to it
- **Mermaid:** paste a `graph` or `flowchart` to import it; use Share → Copy as Mermaid to export
- **Tidy (Shift T):** re-lays out each connected group of shapes
- **Look (Shift L):** six skins (Pencil, Chalkboard, Whiteboard, Blueprint, Clean ink, Neon), four papers (Plain, Dots, Grid, Ruled) and three stroke modes (Sketch, Clean, Marker)
- **Frames and presenting:** frames become slides in Present (Shift P). Keys 1–9 fly to a frame, 0 fits everything and Shift 2 zooms to the selection
- **Thai support:** Playpen Sans Thai for the hand-drawn skins and IBM Plex Sans Thai for the clean ones
- **Storage:** diagrams live in IndexedDB with autosave and up to 30 versions each. Older `localStorage` data moves over automatically, and open tabs stay in sync
- **Files:** save and open `.canvy` files (Ctrl/⌘ Shift S, Ctrl/⌘ O), or drop one onto the canvas. Ctrl/⌘ S writes back to the same file once it has been saved
- **Offline:** a service worker (`sw.js`) caches the app. Pages are fetched fresh when online, so a new deploy shows up right away
- **SEO:** meta tags, Open Graph and Twitter cards, JSON-LD, `sitemap.xml`, and an `og-image.png` drawn by Canvy itself
- **Sharing:** the whole diagram is compressed into the URL hash (`#d=…`) and never sent to a server
- **Export:** PNG, SVG and JSON, plus JSON import

### Text-to-diagram syntax

| Input | Result |
| --- | --- |
| `a -> b -> c` | Boxes joined by arrows |
| `a -(HTTPS)-> b` or `a -> b: label` | Label on an arrow |
| `a -- b` · `a <-> b` · `a ..> b` | Plain line · both ways · dashed |
| `db:` `queue:` `user:` `note:` `cloud:` `doc:` `io:` `hex:` `start:` `end:` | Pick a shape by name |
| `[(db)]` `(round)` `{Decision?}` `{{hex}}` `[/io/]` `([pill])` | Pick a shape with brackets |
| `## Heading` | Section title above the new shapes |
| `, ; or new line` | Separate chains |

## Run locally

Open `index.html` directly, or serve the folder:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy to GitHub Pages

1. Push this folder to the `main` branch of a GitHub repository.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, then pick `main` and `/ (root)`.
4. The site appears at `https://<user>.github.io/<repo>/` after a minute. The editor is at `/app/`.

All paths are relative, so the site also works from a project subpath or a custom domain. The empty `.nojekyll` file tells GitHub Pages to serve the files as they are.

## Tests

```sh
pip install playwright && playwright install chromium
python tests/smoke.py
```

The smoke tests serve the repo locally and drive the editor in headless Chromium: typed diagrams, drawing, Thai labels, undo, reload persistence, share links, the right-click menu, the Thai interface and Mermaid export.

## Storage notes

- Diagrams belong to one browser on one device. Clearing site data deletes them, so save a `.canvy` file to keep a copy or move diagrams to another device.
- IndexedDB allows far more space than `localStorage` (usually hundreds of MB), and Canvy asks the browser to keep it persistent.
- Very large diagrams make long share links. Some chat apps cut links at a few thousand characters, so send a JSON export instead.

Fonts load from Google Fonts: Kalam for the hand-drawn text and Instrument Sans for the interface.
