// Content data loaded from JSON files
let contentData = {};

// Cache-busting token so edited image assets show up without a hard refresh
const ASSET_CACHE_BUST = Date.now();

// Append a cache-busting query param to an asset URL (skips absolute/external URLs)
function bustAssetCache(src) {
    if (!src || /^(https?:)?\/\//.test(src) || src.startsWith('data:')) {
        return src;
    }
    const separator = src.includes('?') ? '&' : '?';
    return `${src}${separator}v=${ASSET_CACHE_BUST}`;
}

// Cache-bust any <img src="..."> occurrences inside a raw HTML string
function bustInlineImageSrcs(html) {
    return html.replace(/(<img\s+[^>]*src=["'])([^"']+)(["'])/gi, (match, prefix, src, suffix) => {
        return `${prefix}${bustAssetCache(src)}${suffix}`;
    });
}

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
            result.push(`<pre class="code-block"><code>${codeContent}</code></pre>`);

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
            result.push(bustInlineImageSrcs(processLatex(p)));
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
function renderPDFViewer(pdfUrl) {
    return `
        <div class="pdf-viewer-container">
            <div class="pdf-iframe-container">
                <iframe src="${pdfUrl}" class="pdf-iframe" type="application/pdf"></iframe>
            </div>
            <div class="pdf-download">
                <a href="${pdfUrl}" download class="btn btn-primary">Download PDF</a>
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
                    shortTitle: card.shortTitle,
                    emoji: card.emoji,
                    body: body,
                    paragraphs: card.paragraphs // Preserve original paragraphs for metadata extraction
                };
            })
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
let currentCardIndex = 0;
let journalView = 'list'; // 'list' or 'detail'
let currentJournalIndex = null;

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

// Journal list view renderer
function renderJournalList() {
    const data = contentData['journal'];
    if (!data || !data.cards) return '';

    const listItems = data.cards.map((card, index) => {
        // Extract the date from the first paragraph if it exists
        let date = '';
        if (card.paragraphs && card.paragraphs.length > 0) {
            const firstPara = card.paragraphs[0];
            // Check if it's a date (contains <b> tags)
            if (typeof firstPara === 'string' && firstPara.includes('<b>')) {
                date = firstPara.replace(/<\/?b>/g, '');
            }
        }

        const slug = card.index || index;

        return `
            <div class="journal-list-item" data-index="${slug}" data-glass="frosted">
                <h3>${card.header}</h3>
                ${date ? `<div class="journal-date">${date}</div>` : ''}
            </div>
        `;
    }).join('');

    return `<div class="journal-list">${listItems}</div>`;
}

// Find a journal card by its slug (index field), falling back to numeric array index
function findJournalCardIndex(slug) {
    const data = contentData['journal'];
    if (!data || !data.cards) return -1;

    const bySlug = data.cards.findIndex(card => card.index === slug);
    if (bySlug !== -1) return bySlug;

    const numeric = parseInt(slug);
    if (!isNaN(numeric) && data.cards[numeric]) return numeric;

    return -1;
}

// Journal detail view renderer
function renderJournalDetail(slug) {
    const data = contentData['journal'];
    const arrIndex = findJournalCardIndex(slug);
    if (!data || !data.cards || arrIndex === -1) return '';

    const card = data.cards[arrIndex];

    return `
        <div class="journal-detail">
            <button class="journal-back-button" data-glass="clear">Back to Journal List</button>
            <div class="card" data-glass="frosted">
                <h5 class="card-header">${card.header}</h5>
                <div class="card-body">
                    ${card.body}
                </div>
            </div>
        </div>
    `;
}

// Load journal list view
function loadJournalList(updateHash = true) {
    journalView = 'list';
    currentJournalIndex = null;
    const container = document.querySelector('.card-container-home');
    container.innerHTML = renderJournalList();

    // Update the URL hash
    if (updateHash) {
        window.history.replaceState(null, null, '#journal');
    }

    // Add click handlers to list items
    container.querySelectorAll('.journal-list-item').forEach(item => {
        item.addEventListener('click', () => {
            const slug = item.getAttribute('data-index');
            loadJournalDetail(slug);
        });
    });
}

// Load journal detail view
function loadJournalDetail(slug, updateHash = true) {
    journalView = 'detail';
    currentJournalIndex = slug;
    const container = document.querySelector('.card-container-home');

    // Update the URL hash
    if (updateHash) {
        window.history.replaceState(null, null, `#journal/${slug}`);
    }

    // Fade out
    container.style.opacity = '0';

    setTimeout(() => {
        container.innerHTML = renderJournalDetail(slug);

        // Add click handler to back button
        const backButton = container.querySelector('.journal-back-button');
        if (backButton) {
            backButton.addEventListener('click', () => {
                container.style.opacity = '0';
                setTimeout(() => {
                    loadJournalList();
                    container.style.opacity = '1';
                }, 150);
            });
        }

        // Fade in
        container.style.opacity = '1';
    }, 150);
}

// Build the image HTML for a card (single image or gallery of images)
function buildCardImageHTML(card) {
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
            return `<img src="${bustAssetCache(img)}" class="card-img-gallery" alt="${alt}" ${styleAttr}>`;
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
        imageHTML = `<img src="${bustAssetCache(card.image)}" class="card-img-top" alt="${card.imageAlt || ''}" ${styleAttr}>`;
    }

    return imageHTML;
}

// Render a single card
function renderCard(card, isAboutStyle = false) {
    if (isAboutStyle) {
        const imageHTML = buildCardImageHTML(card);

        return `
            <div class="card mb-3 about about-home" data-glass="frosted">
                ${imageHTML}
                <div class="card-body">
                    ${card.body}
                </div>
            </div>
        `;
    } else {
        return `
            <div class="card" data-glass="frosted">
                ${card.header ? `<h5 class="card-header">${card.header}</h5>` : ''}
                <div class="card-body">
                    ${card.body}
                </div>
            </div>
        `;
    }
}

// Render a grid of expandable cards (used for research and projects)
function renderGridCard(card, index) {
    const emoji = card.emoji || '';
    const title = card.header || '';
    const imageHTML = buildCardImageHTML(card);

    return `
        <div class="grid-card" data-grid-index="${index}" data-glass="frosted">
            <div class="grid-card-summary">
                <span class="grid-card-emoji">${emoji}</span>
                <h3 class="grid-card-title">${title}</h3>
            </div>
            <div class="grid-card-detail">
                <button class="grid-card-close" aria-label="Close">&times;</button>
                ${imageHTML ? `<div class="grid-card-image">${imageHTML}</div>` : ''}
                <div class="card-body">
                    ${card.body}
                </div>
            </div>
        </div>
    `;
}

function renderGrid(data) {
    const items = data.cards.map((card, index) => renderGridCard(card, index)).join('');
    return `<div class="card-grid">${items}</div>`;
}

// Wire up click-to-expand behavior for grid cards
function initGridCards(container) {
    const grid = container.querySelector('.card-grid');

    function collapseAll() {
        container.querySelectorAll('.grid-card.expanded').forEach(other => {
            other.classList.remove('expanded');
        });
        if (grid) grid.classList.remove('has-expanded');
    }

    container.querySelectorAll('.grid-card').forEach(gridCard => {
        const summary = gridCard.querySelector('.grid-card-summary');
        summary.addEventListener('click', () => {
            const wasExpanded = gridCard.classList.contains('expanded');
            collapseAll();
            if (!wasExpanded) {
                gridCard.classList.add('expanded');
                if (grid) grid.classList.add('has-expanded');
            }
        });

        const closeBtn = gridCard.querySelector('.grid-card-close');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            collapseAll();
        });
    });
}

// Slide the glass droplet in the nav bar under the active section's link
function moveNavDroplet(section) {
    const droplet = document.querySelector('.nav-droplet');
    const link = document.getElementById(section);
    if (!droplet || !link) return;
    droplet.style.width = `${link.offsetWidth}px`;
    droplet.style.transform = `translateX(${link.offsetLeft}px)`;
    droplet.classList.add('nav-droplet-ready');
}

// Mark a section as active in both the text nav and the mobile dot nav
function setActiveNav(section) {
    document.querySelectorAll('.nav-link-typewriter').forEach(link => {
        link.classList.toggle('nav-link-active', link.id === section);
    });
    document.querySelectorAll('.nav-dot').forEach(dot => {
        dot.classList.toggle('active', dot.getAttribute('data-section') === section);
    });
    moveNavDroplet(section);
}

// Load content for a section
function loadSection(section, skipAnimation = false, updateHash = true) {
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

    setActiveNav(section);

    // Handle journal section with list/detail view
    if (section === 'journal') {
        loadJournalList();
        return;
    }

    const isGridStyle = (section === 'research' || section === 'projects');
    const isAboutStyle = (section === 'about');

    if (isGridStyle) {
        // Render cards as an expandable grid
        container.innerHTML = renderGrid(data);
        initGridCards(container);
    } else {
        // Render all cards stacked vertically
        container.innerHTML = data.cards.map(card => renderCard(card, isAboutStyle)).join('');
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
const sectionOrder = ['about', 'research', 'projects', 'experience', 'journal'];

// Navigate to next/previous section
function navigateSection(direction) {
    const currentIndex = sectionOrder.indexOf(currentSection);
    let newIndex = currentIndex + direction;

    // Wrap around
    if (newIndex < 0) newIndex = sectionOrder.length - 1;
    if (newIndex >= sectionOrder.length) newIndex = 0;

    loadSection(sectionOrder[newIndex]);
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
        // Ignore if user is typing in an input field
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
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

        if (hash) {
            // Check if it's a journal detail view (e.g., journal/grain-of-rice-black-hole)
            if (hash.startsWith('journal/')) {
                const parts = hash.split('/');
                const journalSlug = parts[1];
                const journalArrIndex = findJournalCardIndex(journalSlug);

                if (journalArrIndex !== -1) {
                    // Load journal section first, then load the detail
                    currentSection = 'journal';
                    const titleElement = document.getElementById('title');
                    if (titleElement) {
                        titleElement.innerHTML = getCurrentDefaultTitle();
                    }

                    setActiveNav('journal');

                    loadJournalDetail(journalSlug, false);
                } else {
                    loadSection('journal', true, false);
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

        // Arriving at #about etc. focuses the nav link with that id, which
        // would show a keyboard focus ring nobody asked for
        const focused = document.activeElement;
        if (focused && focused.classList.contains('nav-link-typewriter')) {
            focused.blur();
        }
    }

    // Listen for hash changes (back/forward navigation)
    window.addEventListener('hashchange', () => {
        loadFromHash();
    });

    // Load initial section from hash
    loadFromHash();

    // Link widths change once the web fonts arrive and on resize
    const realignDroplet = () => moveNavDroplet(currentSection);
    if (document.fonts) document.fonts.ready.then(realignDroplet);
    window.addEventListener('resize', realignDroplet);
}

// Load on page ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavigation);
} else {
    initNavigation();
}
