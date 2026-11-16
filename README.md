# Canvy

A hand-drawn diagram canvas that runs entirely in the browser. There is no account, no server and no build step.

- `index.html` is the landing page
- `app/index.html` is the editor

## What the editor does

- **Hand-drawn canvas:** 11 shapes (box, pill, ellipse, decision, database, hexagon, in/out, document, cloud, sticky, person), 35 icons, arrows, lines, pen, highlighter, text and frames
- **Right-click tool dial:** right-click, long-press or tap Space on empty canvas, then flick toward a tool and release. Right-clicking a shape opens a context menu
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
- **Storage:** diagrams live in `localStorage` with autosave and up to 30 versions each
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

## Storage notes

- Diagrams belong to one browser on one device. Clearing site data deletes them, so use **Share → JSON backup** to keep a copy or to move diagrams to another device.
- Browsers allow roughly 5 MB of `localStorage` per site. That holds thousands of shapes, and Canvy warns you when it runs out.
- Very large diagrams make long share links. Some chat apps cut links at a few thousand characters, so send a JSON export instead.

Fonts load from Google Fonts: Kalam for the hand-drawn text and Instrument Sans for the interface.
