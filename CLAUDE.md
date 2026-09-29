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
  - `about`: stacked cards with an image on the left (`renderCard(..., true)`). A card with `research_short` and `research_long` gets a Short/Long tab widget in place of its **first empty-string paragraph**.
  - `research`, `projects` and `journal` (configured in `LIST_SECTIONS`): a list of translucent tiles; clicking one opens a detail view with a back button. A tile's title is the card's `header`, or else its first paragraph with tags stripped. Its optional line underneath comes from the section's `meta` function: the venue (the first `<em>`) for research, the bold first paragraph (byline and date) for journal, and nothing for projects. Research detail views use `renderStackedDetailCard`: a centered monospace title with its tags under it, the image large and centered, then the body (minus the first paragraph, which is the title). Other detail views render the full card with `renderCard`. Entries are addressed by `#<section>/<index>`, for example `#research/knight`, where `index` is the card's slug field (falling back to its array position).
  - `experience`: a card with `pdfUrl` becomes an iframe PDF viewer. The CV PDF lives in `assets/`, and its filename is dated, so update `pdfUrl` whenever the CV is replaced.
- `background.js` is an ES module that draws the animated background on a fixed WebGL canvas. It's a three.js scene of wireframe convex polyhedra, simulated as rigid bodies by cannon-es. The pointer acts as a kinematic sphere that pushes them, and nearby bodies are joined by links. There are two scenes. The default, `fall`, drops the shapes onto a grid floor, and each section is viewed from its own camera angle (`SECTION_VIEWS`). `navigation.js` dispatches a `sectionchange` event on `window` (`announceSection`), and the camera eases to that section's view. `?scene=drift` switches to zero gravity, with invisible walls that match the viewport.
- Theme: cards are dark and translucent by default (a block at the end of `style.css`, scoped to `html:not(.bright-mode)`). The gear button in the footer dock opens a settings panel (`initSettings` in `navigation.js`) whose "Bright mode" switch adds `.bright-mode` to `<html>`, turning that block off and bringing back white cards; `html.bright-mode` rules also turn the collapsed list tiles white. While it's on, `?theme=bright` is kept in the URL (hash navigation preserves the query string), so reloads and shared links keep the mode; `?theme=dark` forces dark. The choice is also saved in `localStorage` (`brightMode`) as a fallback when the URL has no `theme`. An inline script in `<head>` applies it before first paint.
- Routing is hash-based (`#section` or `#section/<slug>`) and uses `history.replaceState` plus a `hashchange` listener. Arrow keys, swipes, and the side arrows cycle through `sectionOrder`.

## Content JSON (`content/*.json`)

`content/README.md` documents the format. It is partly out of date: it still mentions carousel navigation, but cards are now stacked vertically. The key rules are implemented in `paragraphsToHTML`:
- A string containing both `<` and `>` is inserted as raw HTML. Any other string is wrapped in `<p class="card-text">`.
- A nested array becomes a bulleted list.
- A run of strings delimited by `"```"` entries becomes a `<pre><code>` block.
- `$...$` and `$$...$$` are rendered with KaTeX.
- The card-level image fields are `image` (a string, or an array for a gallery), `imageAlt`, `imageWidth`/`imageHeight`, and `imageScale` (a percentage, which takes precedence).
- `index` is a card's URL slug in list sections.
- `interests` on a card is a list of tag names. A section's JSON can define them in a top-level `interests` table (name to `emoji` and `color`, as in `research.json`). Tags then show as colored chips on the list tiles and detail cards, and a filter bar above the list lets visitors show one interest at a time (`renderInterestChips`, `renderInterestFilter`, `applyInterestFilter`). The filter bar is currently switched off: its rendering in `renderEntryList` and its click handling in `loadEntryList` are commented out, to be restored once there are enough papers to need it. A tag missing from the table still shows, in gray, with no emoji.

## Cache busting

- `index.html` loads `navigation.js?v=N`, `background.js?v=N` and `style.css?v=N`. Increment the relevant `N` whenever you change one of these files, since past commits do this on every change.
- JSON is fetched with `cache: 'no-store'`.
- Images aren't cache-busted automatically. When you replace an image in `assets/` without renaming it, add or bump a `?v=N` on its path in the content JSON (for example `assets/reccs.jpeg?v=2`); otherwise browsers keep showing the cached copy.
