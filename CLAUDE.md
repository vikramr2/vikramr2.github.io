# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Personal academic website served by GitHub Pages at `vikramramavarapu.org` (see `CNAME`). It is plain static HTML/CSS/JS: there is no build step, package manager, linter, or test suite. Third-party libraries (KaTeX, MDB UI Kit CSS, PDF.js, and three.js and cannon-es through an import map) come from CDNs in `index.html`.

## Running locally

Content is loaded with `fetch()`, so opening `index.html` via `file://` won't work. Serve the repo root instead:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

Deploying means pushing to `main`.

## Architecture

- `index.html` holds the page shell: the nav links (one element `id` per section), the mobile dot nav, the title `<h1 id="title">`, and the empty `.card-container-home` that all content is rendered into. It also includes an inline script that swaps the title text on hover over nav and footer icons.
- `navigation.js` does everything else. On load it fetches every `content/<section>.json` into `contentData`, then renders one section at a time into `.card-container-home`. Section ids are `about`, `research`, `projects` (labelled "software"), `experience` (labelled "cv"), and `journal`. They appear in `sectionOrder`, `loadAllContent`, `sectionTitles`/`sectionTitlesMobile`, the `navLinks` map in `initNavigation`, and the `index.html` nav and dots. Adding or renaming a section means updating all of those places.
- Each section has its own rendering mode:
  - `about`: a stacked card with a left image (`renderCard(..., true)`). If a card has `research_short` and `research_long`, a Short/Long tab widget replaces the **first empty-string paragraph**.
  - `research` and `projects`: an expandable grid (`renderGrid`/`initGridCards`) that uses each card's `emoji` and `header`.
  - `experience`: a card with `pdfUrl` becomes an iframe PDF viewer. The CV PDF lives in `assets/`, and its filename is dated, so update `pdfUrl` whenever the CV is replaced.
  - `journal`: a list/detail view. Entries are addressed by `#journal/<index>`, where `index` is the card's slug field (falling back to its array position). The list's date is taken from the first paragraph when it contains `<b>`.
- `glass.js` is an ES module that draws the liquid glass theme on a fixed WebGL canvas. The background is a three.js scene of wireframe convex polyhedra, simulated as rigid bodies by cannon-es. The pointer acts as a kinematic sphere that pushes them, and nearby bodies are joined by links. There are two scenes. The default, `fall`, drops the shapes onto a grid floor, and each section is viewed from its own camera angle (`SECTION_VIEWS`). `navigation.js` dispatches a `sectionchange` event on `window`, and the camera eases to that section's view. `?scene=drift` switches to zero gravity, with invisible walls that match the viewport. The scene renders to an offscreen texture; a blurred copy is made, and the glass shaders composite both to the screen as full-screen passes. For the glass to refract the background, the background must stay in that same WebGL context, not on a separate canvas. It turns every element with a `data-glass` attribute into a glass panel by reading its bounding rect, border radius and opacity each frame. Panels come in three kinds: `clear` for controls, `frosted` for cards and `drop` for the nav's active-link indicator. At most 24 panels are drawn at once (`MAX_PANES`). The DOM stays in charge of layout: to make something glass, add `data-glass` and give it a `border-radius`. Panels inside `.card-container-home` are clipped to it, and their fades must match its CSS `mask-image` (24px at the top, 48px at the bottom). When WebGL2 works, `<html>` gets the `glass-gl` class and `[data-glass]` elements become transparent. Otherwise the CSS `backdrop-filter` fallback in `style.css` is what visitors see. The palette hex values are duplicated between the `:root` tokens in `style.css` and the constants at the top of `glass.js`.
- Routing is hash-based (`#section` or `#journal/<slug>`) and uses `history.replaceState` plus a `hashchange` listener. Arrow keys, swipes, and the side arrows cycle through `sectionOrder`.

## Content JSON (`content/*.json`)

`content/README.md` documents the format. It is partly out of date: it still mentions a carousel, which has been replaced by the grid. The key rules are implemented in `paragraphsToHTML`:
- A string containing both `<` and `>` is inserted as raw HTML. Any other string is wrapped in `<p class="card-text">`.
- A nested array becomes a bulleted list.
- A run of strings delimited by `"```"` entries becomes a `<pre><code>` block.
- `$...$` and `$$...$$` are rendered with KaTeX.
- The card-level image fields are `image` (a string or an array for a gallery), `imageAlt`, `imageWidth`/`imageHeight`, and `imageScale` (a percentage, which takes precedence).

## Cache busting

- `index.html` loads `navigation.js?v=N`, `glass.js?v=N` and `style.css?v=N`. Increment the relevant `N` whenever you change one of these files, since past commits do this on every change.
- JSON is fetched with `cache: 'no-store'`.
- Local image URLs get a `?v=<timestamp>` appended at runtime by `bustAssetCache`.
