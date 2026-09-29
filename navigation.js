// Content data loaded from JSON files
let contentData = {};

// Function to process LaTeX equations in text
function processLatex(text) {
    // Process display math ($$...$$) first to avoid conflicts with inline math
    text = text.replace(/\$\$(.*?)\$\$/g, (match, equation) => {
        try {
            return katex.renderToString(equation.trim(), {
                displayMode: true,
                throwOnError: false
            });
        } catch (e) {
            console.error('KaTeX error:', e);
            return match; // Return original if there's an error
        }
    });

    // Process inline math ($...$)
    text = text.replace(/\$(.*?)\$/g, (match, equation) => {
        try {
            return katex.renderToString(equation.trim(), {
                displayMode: false,
                throwOnError: false
            });
        } catch (e) {
            console.error('KaTeX error:', e);
            return match; // Return original if there's an error
        }
    });

    return text;
}

// Build the research interest tab widget HTML
function buildResearchTabWidget(shortText, longText) {
    return `<div class="research-tabs">
        <div class="research-tab-buttons">
            <button class="research-tab-btn active" data-tab="short">Short</button>
            <button class="research-tab-btn" data-tab="long">Long</button>
        </div>
        <div class="research-tab-content">
            <div class="research-tab-panel active" data-panel="short">
                <p class="card-text">${shortText}</p>
            </div>
            <div class="research-tab-panel" data-panel="long">
                <p class="card-text">${longText}</p>
            </div>
        </div>
    </div>`;
}

// Wire up research tab click handlers after about section renders
function initResearchTabs(container) {
    container.querySelectorAll('.research-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-tab');
            const widget = btn.closest('.research-tabs');
            widget.querySelectorAll('.research-tab-btn').forEach(b => b.classList.remove('active'));
            widget.querySelectorAll('.research-tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            widget.querySelector(`.research-tab-panel[data-panel="${tab}"]`).classList.add('active');
        });
    });
}

// Function to convert paragraphs array to HTML
function paragraphsToHTML(paragraphs) {
    const result = [];
    let i = 0;

    while (i < paragraphs.length) {
        const p = paragraphs[i];

        // Check if this is the start of a code block
        if (p === '```') {
            // Collect all lines until we find the closing ```
            const codeLines = [];
            i++; // Move past the opening ```

            while (i < paragraphs.length && paragraphs[i] !== '```') {
                codeLines.push(paragraphs[i]);
                i++;
            }

            // Add the code block HTML
            const codeContent = codeLines.join('\n');
            result.push(`<pre style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto;"><code>${codeContent}</code></pre>`);

            i++; // Move past the closing ```
            continue;
        }

        // If it's an array, treat it as a bulleted list
        if (Array.isArray(p)) {
            const listItems = p.map(item => `<li class="card-text">${processLatex(item)}</li>`).join('\n                        ');
            result.push(`<ul style="list-style-type: disc; padding-left: 20px;">\n                        ${listItems}\n                    </ul>`);
        }
        // If paragraph contains HTML tags already (like <b>, <a>, <ul>, <img>, etc.), use as is
        else if (p.includes('<') && p.includes('>')) {
            result.push(processLatex(p));
        }
        // Otherwise, wrap in <p> tag
        else {
            result.push(`<p class="card-text">${processLatex(p)}</p>`);
        }

        i++;
    }

    return result.join('\n                    ');
}

// Function to render PDF viewer using iframe (simpler and more reliable)
function renderPDFViewer(pdfUrl, downloadLabel = 'Download PDF') {
    return `
        <div class="pdf-viewer-container">
            <div class="pdf-iframe-container">
                <iframe src="${pdfUrl}" class="pdf-iframe" type="application/pdf"></iframe>
            </div>
            <div class="pdf-download">
                <a href="${pdfUrl}" download class="btn btn-primary">${downloadLabel}</a>
            </div>
        </div>
    `;
}

// Function to load JSON content for a section
async function loadSectionContent(section) {
    try {
        const response = await fetch(`content/${section}.json`, {
            cache: 'no-store'
        });
        const data = await response.json();

        // Transform the JSON data into the format expected by the existing code
        return {
            cards: data.cards.map(card => {
                let body = '';

                // If there's a PDF URL, render PDF viewer
                if (card.pdfUrl) {
                    body = renderPDFViewer(card.pdfUrl);
                }
                // If there are paragraphs, convert them to HTML
                else if (card.paragraphs) {
                    // Inject research tab widget if this card has research_short/research_long
                    if (card.research_short && card.research_long) {
                        const tabWidget = buildResearchTabWidget(card.research_short, card.research_long);
                        // Replace the first empty string after "Research Interests" with the widget
                        const paragraphs = card.paragraphs.map(p => (p === '' ? null : p));
                        const firstEmpty = paragraphs.indexOf(null);
                        if (firstEmpty !== -1) paragraphs[firstEmpty] = tabWidget;
                        body = paragraphsToHTML(paragraphs.filter(p => p !== null));
                    } else {
                        body = paragraphsToHTML(card.paragraphs);
                    }
                }

                return {
                    index: card.index,
                    image: card.image,
                    imageAlt: card.imageAlt,
                    imageWidth: card.imageWidth,
                    imageHeight: card.imageHeight,
                    imageScale: card.imageScale,
                    header: card.header,
                    pdfUrl: card.pdfUrl,
                    hideInCorporate: card.hideInCorporate || false,
                    corporateSection: card.corporateSection || null,
                    interests: card.interests || [],
                    body: body,
                    paragraphs: card.paragraphs // Preserve original paragraphs for metadata extraction
                };
            }),
            // Emoji and color for each interest tag, e.g. { "Network Science": { "emoji": "🕸️", "color": "#2DD4BF" } }
            interests: data.interests || {}
        };
    } catch (error) {
        console.error(`Error loading content for ${section}:`, error);
        return { cards: [] };
    }
}

// Load all content on initialization
async function loadAllContent() {
    const sections = ['about', 'research', 'projects', 'experience', 'journal'];

    for (const section of sections) {
        contentData[section] = await loadSectionContent(section);
    }
}

// Current state
let currentSection = 'about';

// Corporate mode: About, research and the CV on one page, without the journal
// or the pets card. Set on <html> by the early script in index.html.
let corporateMode = document.documentElement.classList.contains('corporate-mode');
// Skip the cards' fade-in when a view transition is already animating them
let instantCards = false;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let currentCardIndex = 0;

// Default title text for each section
const sectionTitles = {
    'about': 'Vikram R.',
    'research': 'My Research',
    'projects': 'My showcase!',
    'experience': 'Work experience',
    'journal': 'Random thoughts n stuff'
};

// Mobile-specific shorter titles
const sectionTitlesMobile = {
    'about': 'Vikram R.',
    'research': 'My Research',
    'projects': 'My showcase!',
    'experience': 'Work experience',
    'journal': 'Random thoughts'
};

// Check if mobile device
function isMobile() {
    return window.innerWidth <= 768;
}

// Function to get the current default title
function getCurrentDefaultTitle() {
    const titles = isMobile() ? sectionTitlesMobile : sectionTitles;
    return titles[currentSection] || 'Vikram R.';
}

// Make it globally accessible
window.getCurrentDefaultTitle = getCurrentDefaultTitle;

// Also expose currentSection for debugging
window.getCurrentSection = function() { return currentSection; };

// Sections shown as a list of entries, each opening into a detail view
// addressed as #<section>/<slug>. The list shows each entry's title plus any
// meta lines pulled from its content.
const LIST_SECTIONS = {
    research: {
        backLabel: 'Back to Research',
        // Venues, one per publication: the italic line right after each author
        // line, e.g. "<em>RECOMB (2025)</em>". Other italic text, like image
        // captions, doesn't follow an author line and is skipped.
        meta: card => {
            const paragraphs = card.paragraphs || [];
            const venues = [];
            paragraphs.forEach((p, i) => {
                const next = paragraphs[i + 1];
                if (typeof p !== 'string' || !p.includes('Ramavarapu') || typeof next !== 'string') return;
                const match = next.match(/^\s*<em>(.*?)<\/em>/);
                if (match) venues.push(match[1].trim());
            });
            return venues;
        }
    },
    projects: {
        backLabel: 'Back to Software',
        meta: () => []
    },
    journal: {
        backLabel: 'Back to Journal List',
        // Byline and date: a bold first paragraph
        meta: card => {
            const first = card.paragraphs && card.paragraphs[0];
            return typeof first === 'string' && first.includes('<b>') ? [first.replace(/<\/?b>/g, '')] : [];
        }
    }
};

// An entry's title: its header, or else its first paragraph without tags
function entryTitle(card) {
    if (card.header) return card.header;
    const first = card.paragraphs && card.paragraphs[0];
    return typeof first === 'string' ? first.replace(/<[^>]+>/g, '') : '';
}

// Interest tags: a colored chip per tag, styled from the section's interests table
function renderInterestChips(section, card) {
    if (!card.interests || card.interests.length === 0) return '';
    const table = contentData[section].interests || {};
    const chips = card.interests.map(name => {
        const style = table[name] || {};
        return `<span class="interest-chip" style="--chip-color: ${style.color || '#9e9e9e'}">${style.emoji ? `${style.emoji} ` : ''}${name}</span>`;
    }).join('');
    return `<div class="entry-interests">${chips}</div>`;
}

// The interest a section's list is filtered to (none means show everything)
const activeInterest = {};

// Filter bar above a list: "All" plus every interest that at least one entry uses
function renderInterestFilter(section) {
    const data = contentData[section];
    const table = data.interests || {};
    const names = Object.keys(table).filter(name => data.cards.some(card => card.interests.includes(name)));
    if (names.length === 0) return '';

    const active = activeInterest[section] || null;
    const button = (name, label, color) => `
        <button class="interest-filter-button" data-interest="${name || ''}" aria-pressed="${active === name}"
            ${color ? `style="--chip-color: ${color}"` : ''}>${label}</button>`;

    return `
        <div class="interest-filter" role="group" aria-label="Filter by interest">
            ${button(null, 'All', '')}
            ${names.map(name => {
                const count = data.cards.filter(card => card.interests.includes(name)).length;
                return button(name, `${table[name].emoji ? `${table[name].emoji} ` : ''}${name} <span class="interest-count">${count}</span>`, table[name].color);
            }).join('')}
        </div>
    `;
}

// Show only the entries tagged with the active interest
function applyInterestFilter(section, container) {
    const active = activeInterest[section] || null;
    container.querySelectorAll('.interest-filter-button').forEach(button => {
        button.setAttribute('aria-pressed', String((button.dataset.interest || null) === active));
    });
    container.querySelectorAll('.entry-list-item').forEach(item => {
        const interests = JSON.parse(item.dataset.interests || '[]');
        item.hidden = active !== null && !interests.includes(active);
    });
}

// List view renderer
function renderEntryList(section) {
    const data = contentData[section];
    if (!data || !data.cards) return '';

    const listItems = data.cards.map((card, index) => {
        const slug = card.index || index;
        const meta = LIST_SECTIONS[section].meta(card);
        // The card's picture (the first one of a gallery) as a thumbnail
        const thumbnail = Array.isArray(card.image) ? card.image[0] : card.image;

        return `
            <div class="entry-list-item${thumbnail ? ' has-thumbnail' : ''}" data-index="${slug}" data-vt="entry-${section}-${slug}"
                data-interests='${JSON.stringify(card.interests).replace(/'/g, '&#39;')}'>
                ${thumbnail ? `<img class="entry-thumbnail" src="${thumbnail}" alt="">` : ''}
                <div class="entry-text">
                    <h3>${entryTitle(card)}</h3>
                    ${meta.map(line => `<div class="entry-meta">${line}</div>`).join('')}
                    ${renderInterestChips(section, card)}
                </div>
            </div>
        `;
    }).join('');

    // The interest filter bar is hidden for now: with only a few papers it isn't
    // needed yet. To bring it back, swap in the commented-out line below.
    // return `${renderInterestFilter(section)}<div class="entry-list">${listItems}</div>`;
    return `<div class="entry-list">${listItems}</div>`;
}

// Find an entry by its slug (index field), falling back to numeric array index
function findEntryIndex(section, slug) {
    const data = contentData[section];
    if (!data || !data.cards) return -1;

    const bySlug = data.cards.findIndex(card => card.index === slug);
    if (bySlug !== -1) return bySlug;

    const numeric = parseInt(slug);
    if (!isNaN(numeric) && data.cards[numeric]) return numeric;

    return -1;
}

// Detail view renderer: the entry's full card, research with its image on the left
function renderEntryDetail(section, slug) {
    const data = contentData[section];
    const arrIndex = findEntryIndex(section, slug);
    if (!data || !data.cards || arrIndex === -1) return '';

    const card = data.cards[arrIndex];
    const cardHTML = section === 'research'
        ? renderStackedDetailCard(section, card)
        : renderCard({ ...card, body: renderInterestChips(section, card) + card.body });

    return `
        <div class="entry-detail">
            <button class="entry-back-button">${corporateMode ? 'Back to Home' : LIST_SECTIONS[section].backLabel}</button>
            ${cardHTML}
        </div>
    `;
}

// Research detail: centered title with its tags under it, a large image,
// then the body
function renderStackedDetailCard(section, card) {
    // Without a header, the first paragraph is the title, which is shown at
    // the top instead; drop it and any blank lines that follow it
    let paragraphs = card.paragraphs || [];
    if (!card.header) paragraphs = paragraphs.slice(1);
    while (paragraphs.length && paragraphs[0] === '') paragraphs = paragraphs.slice(1);

    const images = (Array.isArray(card.image) ? card.image : [card.image]).filter(Boolean);
    const alts = Array.isArray(card.imageAlt) ? card.imageAlt : [card.imageAlt];
    const imageHTML = images.length === 0 ? '' : `
        <div class="entry-detail-images">
            ${images.map((src, i) => `<img src="${src}" alt="${alts[i] || alts[0] || ''}">`).join('')}
        </div>`;

    return `
        <div class="card entry-detail-card">
            <div class="card-body">
                <h2 class="entry-detail-title">${entryTitle(card)}</h2>
                ${renderInterestChips(section, card)}
                ${imageHTML}
                ${paragraphsToHTML(paragraphs)}
            </div>
        </div>
    `;
}

// Load a section's list view into container (by default the main column)
function loadEntryList(section, updateHash = true, container = document.querySelector('.card-container-home')) {
    container.innerHTML = renderEntryList(section);

    // Update the URL hash
    if (updateHash) {
        window.history.replaceState(null, null, `#${section}`);
    }

    // Add click handlers to list items. In corporate mode the paper opens
    // full-page, replacing the whole layout, as it does on the regular site.
    container.querySelectorAll('.entry-list-item').forEach(item => {
        item.addEventListener('click', () => {
            const slug = item.getAttribute('data-index');
            if (corporateMode) {
                saveCorporateScroll();
                loadEntryDetail(section, slug, true);
            } else {
                loadEntryDetail(section, slug, true, container);
            }
        });
    });

    // Filter by interest; clicking the active interest again clears it.
    // Hidden for now along with the filter bar (see renderEntryList).
    // container.querySelectorAll('.interest-filter-button').forEach(button => {
    //     button.addEventListener('click', () => {
    //         const interest = button.dataset.interest || null;
    //         activeInterest[section] = activeInterest[section] === interest ? null : interest;
    //         applyInterestFilter(section, container);
    //     });
    // });
    // applyInterestFilter(section, container);
}

// Load an entry's detail view into container (by default the main column)
function loadEntryDetail(section, slug, updateHash = true, container = document.querySelector('.card-container-home')) {

    // Update the URL hash
    if (updateHash) {
        window.history.replaceState(null, null, `#${section}/${slug}`);
    }

    // Fade out
    container.style.opacity = '0';

    setTimeout(() => {
        container.innerHTML = renderEntryDetail(section, slug);
        container.scrollTop = 0;

        // Add click handler to back button
        const backButton = container.querySelector('.entry-back-button');
        if (backButton) {
            backButton.addEventListener('click', () => {
                container.style.opacity = '0';
                setTimeout(() => {
                    if (corporateMode) {
                        // Back to the corporate layout, scrolled to where it was
                        instantCards = true;
                        loadSection('about', true, true);
                        instantCards = false;
                        restoreCorporateScroll();
                    } else {
                        loadEntryList(section, true, container);
                    }
                    container.style.opacity = '1';
                }, 150);
            });
        }

        // Fade in
        container.style.opacity = '1';
    }, 150);
}

// Render a single card
function renderCard(card, isAboutStyle = false) {
    if (isAboutStyle) {
        // Only render image if card.image is not empty
        let imageHTML = '';

        // Check if image is an array (multiple images)
        if (Array.isArray(card.image) && card.image.length > 0) {
            const images = card.image.map((img, index) => {
                let styleAttr = '';
                if (card.imageScale) {
                    const scalePercent = card.imageScale;
                    styleAttr = `style="width: ${scalePercent}% !important; height: auto !important; max-width: ${scalePercent}%;"`;
                } else if (card.imageWidth || card.imageHeight) {
                    styleAttr = `${card.imageWidth ? `width="${card.imageWidth}"` : ''} ${card.imageHeight ? `height="${card.imageHeight}"` : ''}`;
                }
                const alt = Array.isArray(card.imageAlt) ? (card.imageAlt[index] || '') : (card.imageAlt || '');
                return `<img src="${img}" class="card-img-gallery" alt="${alt}" ${styleAttr}>`;
            }).join('\n                ');

            imageHTML = `<div class="card-img-gallery-container">\n                ${images}\n            </div>`;
        } else if (card.image && typeof card.image === 'string' && card.image.trim() !== '') {
            // Single image
            let styleAttr = '';
            if (card.imageScale) {
                const scalePercent = card.imageScale;
                styleAttr = `style="width: ${scalePercent}% !important; height: auto !important; max-width: ${scalePercent}%;"`;
            } else if (card.imageWidth || card.imageHeight) {
                styleAttr = `${card.imageWidth ? `width="${card.imageWidth}"` : ''} ${card.imageHeight ? `height="${card.imageHeight}"` : ''}`;
            }
            imageHTML = `<img src="${card.image}" class="card-img-top" alt="${card.imageAlt || ''}" ${styleAttr}>`;
        }

        return `
            <div class="card mb-3 about about-home"${card.vt ? ` data-vt="${card.vt}"` : ''}>
                ${imageHTML}
                <div class="card-body">
                    ${card.body}
                </div>
            </div>
        `;
    } else {
        return `
            <div class="card"${card.vt ? ` data-vt="${card.vt}"` : ''}>
                ${card.header ? `<h5 class="card-header">${card.header}</h5>` : ''}
                <div class="card-body">
                    ${card.body}
                </div>
            </div>
        `;
    }
}

// Corporate mode's single page. The left sidebar holds About's cards, minus
// any marked hideInCorporate (the pets card) or corporateSection. The right
// column scrolls through sections, each under its own heading: cards marked
// corporateSection (News), the research list, and the CV. On phones the PDF
// viewer shows only its download button (style.css).
function renderCorporateLayout(container) {
    const about = contentData.about ? contentData.about.cards : [];
    const cv = contentData.experience && contentData.experience.cards.find(card => card.pdfUrl);

    const sidebar = about
        .map((card, i) => (card.hideInCorporate || card.corporateSection) ? '' : renderCard({ ...card, vt: `about-card-${i}` }, true))
        .join('');

    // The heading replaces the card's own bold title line, e.g. "<b>News</b>"
    const cardSections = about
        .map((card, i) => {
            if (!card.corporateSection || card.hideInCorporate) return '';
            let paragraphs = card.paragraphs || [];
            if (typeof paragraphs[0] === 'string' && paragraphs[0].replace(/<[^>]+>/g, '').trim() === card.corporateSection) {
                paragraphs = paragraphs.slice(1);
            }
            const body = paragraphsToHTML(paragraphs);
            return corporateSection(card.corporateSection, renderCard({ ...card, body, vt: `about-card-${i}` }, false));
        })
        .join('');

    container.innerHTML = `
        <div class="corporate-layout">
            <aside class="corporate-sidebar" aria-label="About">${sidebar}</aside>
            <div class="corporate-main">
                ${cardSections}
                ${corporateSection('Research', '<div class="corporate-research"></div>')}
                ${cv ? corporateSection('CV', `
                    <div class="card corporate-cv" data-vt="cv">
                        <div class="card-body">${renderPDFViewer(cv.pdfUrl, 'Download CV')}</div>
                    </div>`) : ''}
            </div>
        </div>
    `;
    container.scrollTop = 0;
    loadEntryList('research', false, container.querySelector('.corporate-research'));
}

// A titled section of corporate mode's right column
function corporateSection(title, content) {
    const id = `corporate-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-heading`;
    return `
        <section class="corporate-section" aria-labelledby="${id}">
            <h3 class="corporate-heading" id="${id}">${title}</h3>
            ${content}
        </section>
    `;
}

// Where corporate mode's page, sidebar and right column were scrolled to when
// a paper was opened, so "Back to Home" returns to the same spot
let corporateScroll = null;

function saveCorporateScroll() {
    const top = selector => { const el = document.querySelector(selector); return el ? el.scrollTop : 0; };
    corporateScroll = {
        page: top('.card-container-home'),
        sidebar: top('.corporate-sidebar'),
        main: top('.corporate-main')
    };
}

function restoreCorporateScroll() {
    if (!corporateScroll) return;
    const set = (selector, value) => { const el = document.querySelector(selector); if (el) el.scrollTop = value; };
    set('.card-container-home', corporateScroll.page);
    set('.corporate-sidebar', corporateScroll.sidebar);
    set('.corporate-main', corporateScroll.main);
    corporateScroll = null;
}

// View transitions: give each visible [data-vt] element its name, so cards in
// both layouts glide between them, cards only in the old one fade out, and
// cards only in the new one fade in. Elements scrolled out of sight stay
// unnamed, so they don't fly in from outside their panel.
function nameTransitionElements() {
    document.querySelectorAll('[data-vt]').forEach(el => {
        const clip = el.parentElement.closest('.corporate-sidebar, .corporate-main, .card-container-home');
        const r = el.getBoundingClientRect();
        const c = clip ? clip.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
        const visible = r.height > 0 && r.bottom > c.top && r.top < c.bottom;
        el.style.viewTransitionName = visible ? el.dataset.vt : 'none';
    });
}

function clearTransitionNames() {
    document.querySelectorAll('[data-vt]').forEach(el => { el.style.viewTransitionName = ''; });
}

// Switch corporate mode on or off, animating between the layouts where the
// browser supports view transitions (instantly otherwise)
function setCorporateMode(on) {
    if (on === corporateMode) return;

    const update = () => {
        corporateMode = on;
        document.documentElement.classList.toggle('corporate-mode', on);
        instantCards = true;
        loadSection('about', true, true);
        instantCards = false;
    };

    if (!document.startViewTransition || reducedMotion.matches) {
        update();
        return;
    }
    nameTransitionElements();
    const transition = document.startViewTransition(() => {
        update();
        nameTransitionElements();
    });
    transition.finished.finally(clearTransitionNames);
}

// Lets the background (background.js) react, e.g. by moving its camera
function announceSection(section) {
    window.dispatchEvent(new CustomEvent('sectionchange', { detail: { section } }));
}

// Load content for a section
function loadSection(section, skipAnimation = false, updateHash = true) {
    // The CV page is gone; the CV is only shown in corporate mode
    if (section === 'experience') {
        section = 'about';
        updateHash = true;
    }
    // Corporate mode is a single page built from About
    if (corporateMode) {
        section = 'about';
    }

    currentSection = section;
    currentCardIndex = 0;

    const container = document.querySelector('.card-container-home');
    const data = contentData[section];

    if (!data) return;

    // Update the URL hash
    if (updateHash) {
        window.history.replaceState(null, null, `#${section}`);
    }

    // Update the title to the section's default text
    const titleElement = document.getElementById('title');
    if (titleElement) {
        titleElement.innerHTML = getCurrentDefaultTitle();
    }

    // Update active navigation link
    document.querySelectorAll('.nav-link-typewriter').forEach(link => {
        link.classList.remove('nav-link-active');
    });
    const activeLink = document.getElementById(section);
    if (activeLink) {
        activeLink.classList.add('nav-link-active');
    }

    // Update active dot for mobile navigation
    document.querySelectorAll('.nav-dot').forEach(dot => {
        dot.classList.remove('active');
    });
    const activeDot = document.querySelector(`.nav-dot[data-section="${section}"]`);
    if (activeDot) {
        activeDot.classList.add('active');
    }

    announceSection(section);

    container.classList.toggle('instant-cards', instantCards);

    if (corporateMode) {
        renderCorporateLayout(container);
    } else if (LIST_SECTIONS[section]) {
        // Research, software and journal start as a list of entries
        loadEntryList(section, false);
    } else {
        // Render all cards stacked vertically. About's cards are named so they
        // can glide to their corporate-mode spots (see setCorporateMode).
        container.innerHTML = data.cards
            .map((card, i) => renderCard(section === 'about' ? { ...card, vt: `about-card-${i}` } : card, section === 'about'))
            .join('');
    }

    // Wire up research tab widget if present
    if (section === 'about') {
        initResearchTabs(container);
    }

    // Only trigger fade-in animation if not initial load (CSS handles initial load)
    if (!skipAnimation) {
        container.style.opacity = '0';
        setTimeout(() => {
            container.style.opacity = '1';
        }, 50);
    }
}


// Section order for arrow key navigation
// const sectionOrder = ['about', 'research', 'projects', 'experience', 'journal'];
// const sectionOrder = ['about', 'research', 'experience', 'journal'];
const sectionOrder = ['about', 'research', 'journal'];

// Navigate to next/previous section. Corporate mode is a single page, so
// there is nowhere to go.
function navigateSection(direction) {
    if (corporateMode) return;
    const order = sectionOrder;
    const currentIndex = order.indexOf(currentSection);
    let newIndex = currentIndex + direction;

    // Wrap around
    if (newIndex < 0) newIndex = order.length - 1;
    if (newIndex >= order.length) newIndex = 0;

    loadSection(order[newIndex]);
}

// Function to replay initial animations
function replayInitialAnimations() {
    const logo = document.querySelector('.telugu-logo');
    const logoChar = document.querySelector('.telugu-char');
    const title = document.getElementById('title');
    const cardContainer = document.querySelector('.card-container-home');

    // Remove animations
    logo.style.animation = 'none';
    logoChar.style.animation = 'none';
    if (title) title.style.animation = 'none';
    cardContainer.style.animation = 'none';

    // Force reflow
    void logo.offsetWidth;
    void logoChar.offsetWidth;
    if (title) void title.offsetWidth;
    void cardContainer.offsetWidth;

    // Re-apply animations
    logo.style.animation = 'moveToCorner 1.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards';
    logoChar.style.animation = 'drawOnStartup 2s ease-in-out forwards';
    if (title) {
        title.style.opacity = '0';
        title.style.animation = 'fadeIn 1s 0.75s forwards';
    }
    cardContainer.style.opacity = '0';
    cardContainer.style.animation = 'fadeIn 1s ease-in-out 0.75s forwards';

    // Clear inline styles after animations complete so CSS hover works again
    const clearInlineStyles = () => {
        logo.style.animation = '';
        logoChar.style.animation = '';
    };

    // Listen for the logo animation to end (longest animation is 2s for logoChar)
    logoChar.addEventListener('animationend', clearInlineStyles, { once: true });
}

// Initialize navigation
async function initNavigation() {
    // Load all content from JSON files first
    await loadAllContent();

    const navLinks = {
        'about': document.getElementById('about'),
        'research': document.getElementById('research'),
        'projects': document.getElementById('projects'),
        'experience': document.getElementById('experience'),
        'journal': document.getElementById('journal')
    };

    Object.keys(navLinks).forEach(section => {
        const link = navLinks[section];
        if (link) {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                loadSection(section);
            });
        }
    });

    // Add click handlers to dot navigation
    document.querySelectorAll('.nav-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            const section = dot.getAttribute('data-section');
            if (section) {
                loadSection(section);
            }
        });
    });

    // Add arrow key navigation
    document.addEventListener('keydown', (e) => {
        // Ignore if user is typing in an input field, and in corporate mode,
        // where the arrow keys scroll the panels instead
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || corporateMode) {
            return;
        }

        // Always handle arrow keys for section navigation, even over PDF
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            navigateSection(1); // Next section
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            navigateSection(-1); // Previous section
        }
    });

    // Add click handlers to navigation arrows
    const navArrowLeft = document.getElementById('nav-arrow-left');
    const navArrowRight = document.getElementById('nav-arrow-right');

    if (navArrowLeft) {
        navArrowLeft.addEventListener('click', () => navigateSection(-1));
    }

    if (navArrowRight) {
        navArrowRight.addEventListener('click', () => navigateSection(1));
    }

    // Add touch/swipe navigation for mobile
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;

    const minSwipeDistance = 50; // Minimum distance for a swipe to register

    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }, { passive: true });

    function handleSwipe() {
        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;

        // Check if horizontal swipe is more significant than vertical
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            // Only register if swipe is long enough
            if (Math.abs(deltaX) > minSwipeDistance) {
                if (deltaX > 0) {
                    // Swipe right - go to previous section
                    navigateSection(-1);
                } else {
                    // Swipe left - go to next section
                    navigateSection(1);
                }
            }
        }
    }

    // Add click handler to logo
    const logo = document.querySelector('.telugu-logo');
    if (logo) {
        logo.addEventListener('click', () => {
            // Replay animations
            replayInitialAnimations();

            // Load about section after a short delay to ensure animation starts
            setTimeout(() => {
                loadSection('about', true, true);
            }, 50);
        });
    }

    // Function to load section from hash
    function loadFromHash() {
        const hash = window.location.hash.substring(1); // Remove the '#'

        // Corporate mode is one page; only an open paper (#research/<slug>),
        // shown full-page, is kept
        if (corporateMode) {
            const [section, slug] = hash.split('/');
            const paper = section === 'research' && slug !== undefined && findEntryIndex('research', slug) !== -1;
            loadSection('about', true, !paper);
            if (paper) loadEntryDetail('research', slug, false);
            return;
        }

        if (hash) {
            // An entry's detail view, e.g. journal/grain-of-rice-black-hole or research/knight
            const [section, slug] = hash.split('/');

            if (slug !== undefined && LIST_SECTIONS[section]) {
                loadSection(section, true, false);
                if (findEntryIndex(section, slug) !== -1) {
                    loadEntryDetail(section, slug, false);
                }
            } else if (sectionOrder.includes(hash)) {
                // Load the section from the hash
                loadSection(hash, true, false);
            } else {
                // Invalid hash, load about
                loadSection('about', true);
            }
        } else {
            // No hash, load about section
            loadSection('about', true);
        }
    }

    // Listen for hash changes (back/forward navigation)
    window.addEventListener('hashchange', () => {
        loadFromHash();
    });

    // Load initial section from hash
    loadFromHash();
}

// Settings panel: the gear in the footer opens it. Bright mode switches the
// cards back to white; corporate mode switches to the one-page layout.
function initSettings() {
    const button = document.getElementById('settings-button');
    const panel = document.getElementById('settings-panel');
    if (!button || !panel) return;

    const root = document.documentElement;

    // A switch for a mode that is kept in the URL (param=value while on, so a
    // reload or a shared link opens in the same mode) and in localStorage
    function modeSwitch(switchId, param, value, storageKey, isOn, apply) {
        const el = document.getElementById(switchId);
        if (!el) return;

        function syncParam(on) {
            const url = new URL(location.href);
            if (on) url.searchParams.set(param, value);
            else url.searchParams.delete(param);
            if (url.href !== location.href) history.replaceState(history.state, '', url);
        }

        el.setAttribute('aria-checked', String(isOn()));
        if (isOn()) syncParam(true);

        el.addEventListener('click', () => {
            const on = !isOn();
            apply(on);
            el.setAttribute('aria-checked', String(on));
            syncParam(on);
            try {
                localStorage.setItem(storageKey, on ? 'on' : 'off');
            } catch (e) {}
        });
    }

    // Bright mode: white cards (?theme=bright)
    modeSwitch('bright-mode-switch', 'theme', 'bright', 'brightMode',
        () => root.classList.contains('bright-mode'),
        on => root.classList.toggle('bright-mode', on));

    // Corporate mode: one-page layout (?layout=corporate)
    modeSwitch('corporate-mode-switch', 'layout', 'corporate', 'corporateMode',
        () => corporateMode,
        setCorporateMode);

    function setOpen(open) {
        panel.hidden = !open;
        button.setAttribute('aria-expanded', String(open));
    }

    button.addEventListener('click', (e) => {
        e.stopPropagation();
        setOpen(panel.hidden);
    });

    // Close on a click outside the panel, or on Escape
    document.addEventListener('click', (e) => {
        if (!panel.hidden && !panel.contains(e.target) && !button.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !panel.hidden) {
            setOpen(false);
            button.focus();
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettings);
} else {
    initSettings();
}

// Load on page ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavigation);
} else {
    initNavigation();
}
