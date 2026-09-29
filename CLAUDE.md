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

## Files

- `index.html`: the page shell. It holds the nav links (one element `id` per section), the mobile dot nav, the title `<h1 id="title">`, the settings panel, the footer icons (inline Font Awesome SVGs), and the empty `.card-container-home` that all content is rendered into. It also has an early inline script that applies bright/corporate mode before first paint, the import map, and an inline script that swaps the title text on hover over nav and footer icons (it calls `window.getCurrentDefaultTitle`).
- `js/`: ES modules, no bundler. `index.html` loads `js/main.js` and `js/background.js`.
  - `main.js`: entry point. Starts the settings panel, loads the content, then starts navigation.
  - `state.js`: state shared across modules (`state.contentData`, `state.currentSection`, `state.corporateMode`, `state.instantCards`), plus the `reducedMotion` and `phoneLayout` media queries. Modules can't reassign each other's variables, so shared mutable state goes on `state`.
  - `content.js`: fetching `content/<section>.json` (`loadAllContent`) and turning it into HTML (`paragraphsToHTML`, KaTeX, `renderPDFViewer`, the research-interests tab widget).
  - `render.js`: pure HTML for cards (`renderCard`), entry lists and detail views, and interest tags; `LIST_SECTIONS` configures the list sections.
  - `router.js`: `loadSection`, `loadEntryList`/`loadEntryDetail`, hash routing, and navigation by nav links, dots, arrow keys, side arrows and swipes (`initNavigation`).
  - `title.js`: each section's default title (`getCurrentDefaultTitle`) and the arrow-key hint shown on desktop at startup.
  - `corporate.js`: corporate mode's layout, scroll save/restore, and the view transition for switching modes.
  - `settings.js`: the settings panel and its mode switches.
  - `background.js`: the animated WebGL background (independent of the other modules).
- `css/`: linked from `index.html` in cascade order, so later files win ties. `mobile.css` (the main phone overrides) is first on purpose; feature files keep their own phone rules, sometimes with extra specificity to beat the later desktop rules. Then `layout.css` (page, title, nav, footer, side arrows), `cards.css`, `content.css` (entry lists, detail views, tags, tabs), `themes.css` (dark/bright cards), `corporate.css` (plus view transitions) and `settings.css`.
- `content/*.json`: the site's text (see below). `assets/`: images and the CV PDF.

## Architecture

- On load, all of `content/<section>.json` is fetched into `state.contentData`, then one section at a time is rendered into `.card-container-home`. Section ids are `about`, `research`, `projects` (labelled "software"), `experience` (the old CV page), and `journal`. They appear in `sectionOrder` and `initNavigation` (`router.js`), `loadAllContent` (`content.js`), `sectionTitles`/`sectionTitlesMobile` (`title.js`), and the `index.html` nav and dots. Adding or renaming a section means updating all of those places. `projects` and `experience` are currently switched off: their nav links, dots and hover handlers are commented out in `index.html`, and they're left out of `sectionOrder`.
- Each section has its own rendering mode:
  - `about`: stacked cards with an image on the left (`renderCard(..., true)`). A card with `research_short` and `research_long` gets a Short/Long tab widget in place of its **first empty-string paragraph**.
  - `research`, `projects` and `journal` (configured in `LIST_SECTIONS`): a list of translucent tiles; clicking one opens a detail view with a back button. A tile's title is the card's `header`, or else its first paragraph with tags stripped. The lines underneath come from the section's `meta` function: for research, every venue (the italic line right after each author line containing "Ramavarapu"); for journal, the bold first paragraph (byline and date); nothing for projects. Research detail views use `renderStackedDetailCard`: a centered monospace title with its tags under it, the image large and centered, then the body (minus the first paragraph, which is the title). Other detail views render the full card with `renderCard`. Entries are addressed by `#<section>/<index>`, for example `#research/knight`, where `index` is the card's slug field (falling back to its array position).
  - `experience`: no longer a page; `#experience` redirects to `#about`. Its JSON still holds the CV (`pdfUrl`), which is only shown in corporate mode. The CV PDF lives in `assets/`, and its filename is dated, so update `pdfUrl` whenever the CV is replaced.
- Background (`js/background.js`): a three.js scene of wireframe convex polyhedra, simulated as rigid bodies by cannon-es. The pointer acts as a kinematic sphere that pushes them, and nearby bodies are joined by links. The default scene, `fall`, drops the shapes onto a grid floor, and each section is viewed from its own camera angle (`SECTION_VIEWS`): `router.js` dispatches a `sectionchange` event on `window` (`announceSection`), and the camera eases to that section's view. `?scene=drift` switches to zero gravity, with invisible walls that match the viewport.
- Theme: cards are dark and translucent by default (`css/themes.css`, scoped to `html:not(.bright-mode)`). The gear button in the footer dock opens the settings panel, whose "Bright mode" switch adds `.bright-mode` to `<html>`, turning dark cards off and bringing back white cards and white list tiles. While it's on, `?theme=bright` is kept in the URL (hash navigation preserves the query string), so reloads and shared links keep the mode; `?theme=dark` forces dark. The choice is also saved in `localStorage` (`brightMode`) as a fallback when the URL has no `theme`.
- Corporate mode (second switch in the settings panel, `?layout=corporate` or `?layout=standard`, `localStorage` key `corporateMode`, class `corporate-mode` on `<html>`): a one-page layout built by `renderCorporateLayout`.
  - The left sidebar holds About's cards, except any marked `hideInCorporate` (the pets card) or `corporateSection` in `about.json`.
  - The right column (`.corporate-main`) scrolls through titled sections: cards marked `corporateSection` (News, with the card's own bold title line dropped), the research list (`.corporate-research`), and a CV card with the PDF viewer (on phones, only its download button). `loadEntryList` and `loadEntryDetail` take the container to render into.
  - Clicking a paper opens it full-page, replacing the whole layout; its back button reads "Back to Home" and re-renders the layout at the saved scroll positions (`saveCorporateScroll`/`restoreCorporateScroll`).
  - The journal, section nav, dots and arrows are hidden, and arrow keys scroll instead of navigating.
  - The browser tab title switches too: `<title>` in `index.html` holds both versions in `data-standard` and `data-corporate`, applied by the early inline script on load and by `updateTabTitle` (`corporate.js`) when switching.
  - Switching uses the View Transitions API (`setCorporateMode`): elements with a `data-vt` attribute get a `view-transition-name` while visible, so matching cards glide between layouts and the rest fade out or in. The page root isn't captured (`:root { view-transition-name: none }`), so the WebGL background keeps animating.
- Routing is hash-based (`#section` or `#section/<slug>`) and uses `history.replaceState` plus a `hashchange` listener. Arrow keys, swipes, and the side arrows cycle through `sectionOrder`.

## Content JSON (`content/*.json`)

`content/README.md` documents the format. It is partly out of date: it still mentions carousel navigation, but cards are now stacked vertically. The key rules are implemented in `paragraphsToHTML`:
- A string containing both `<` and `>` is inserted as raw HTML. Any other string is wrapped in `<p class="card-text">`.
- A nested array becomes a bulleted list.
- A run of strings delimited by `"```"` entries becomes a `<pre><code>` block.
- `$...$` and `$$...$$` are rendered with KaTeX.
- The card-level image fields are `image` (a string, or an array for a gallery), `imageAlt`, `imageWidth`/`imageHeight`, and `imageScale` (a percentage, which takes precedence).
- `index` is a card's URL slug in list sections.
- `interests` on a card is a list of tag names. A section's JSON can define them in a top-level `interests` table (name to `emoji` and `color`, as in `research.json`). Tags then show as colored chips on the list tiles and detail cards, and a filter bar above the list lets visitors show one interest at a time (`renderInterestChips`, `renderInterestFilter`, `applyInterestFilter` in `render.js`). The filter bar is currently switched off: its rendering in `renderEntryList` and its click handling in `loadEntryList` are commented out, to be restored once there are enough papers to need it. A tag missing from the table still shows, in gray, with no emoji.
- In `about.json`, `hideInCorporate: true` hides a card in corporate mode, and `corporateSection: "<Title>"` moves it into corporate mode's right column under that heading. `corporateParagraphs` replaces paragraphs by position in corporate mode only, e.g. `{ "0": "<b>Hey Guys!</b>" }` (built as `card.corporate` in `loadSectionContent`). For a fragment inside a paragraph, wrap it in `class="hide-in-corporate"` instead (hidden by `css/corporate.css`), as with the pets card's "(scroll to see them!)" note.

## Cache busting

- CSS: each `<link>` in `index.html` has its own `?v=N`. Bump it on the file you change.
- JS: `js/main.js` and `js/background.js` are versioned on their `<script>` tags; the other modules are versioned in the import map (`"./js/router.js": "./js/router.js?v=N"`). Modules import each other with plain relative paths, and the import map adds the version, so bump the module's entry there when you change it.
- JSON is fetched with `cache: 'no-store'`.
- Images aren't cache-busted automatically. When you replace an image in `assets/` without renaming it, add or bump a `?v=N` on its path in the content JSON (for example `assets/reccs.jpeg?v=2`); otherwise browsers keep showing the cached copy.
