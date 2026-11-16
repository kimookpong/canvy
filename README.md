# Canvy

A hand-drawn diagram canvas that runs entirely in the browser. There is no account, no server and no build step.

- `index.html` is the landing page
- `app/index.html` is the editor

## What the editor does

- Draws boxes, ellipses, decisions, databases, arrows, freehand lines and text in a hand-drawn look
- Builds diagrams from a typed line: `browser -> api -> [(postgres)], api -> (queue): async`
- Offers four drawing styles: Pencil, Chalk, Blueprint and Ink
- Saves diagrams in the browser's `localStorage`, with autosave and up to 30 versions per diagram
- Shares a diagram as a link: the whole diagram is compressed into the URL hash (`#d=…`) and never sent to a server
- Exports PNG, SVG and JSON, and imports JSON
- Has a full-screen present mode, undo/redo, copy/paste and keyboard shortcuts (press `?` in the editor)

### Text-to-diagram syntax

| Input | Result |
| --- | --- |
| `a -> b -> c` | Boxes joined by arrows |
| `a -> b, b -> c` | Commas or new lines separate chains |
| `a -> b: label` | Label on the last arrow |
| `[(name)]` `(name)` `{name}` | Database, ellipse, decision |
| `api -> cache` | Connects to an existing shape called "api" |

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
