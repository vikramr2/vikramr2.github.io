// Content data loaded from JSON files
let contentData = {};

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
            const listItems = p.map(item => `<li class="card-text">${item}</li>`).join('\n                        ');
            result.push(`<ul style="list-style-type: disc; padding-left: 20px;">\n                        ${listItems}\n                    </ul>`);
        }
        // If paragraph contains HTML tags already (like <b>, <a>, <ul>, <img>, etc.), use as is
        else if (p.includes('<') && p.includes('>')) {
            result.push(p);
        }
        // Otherwise, wrap in <p> tag
        else {
            result.push(`<p class="card-text">${p}</p>`);
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
                    body = paragraphsToHTML(card.paragraphs);
                }

                return {
                    image: card.image,
                    imageAlt: card.imageAlt,
                    imageWidth: card.imageWidth,
                    imageHeight: card.imageHeight,
                    imageScale: card.imageScale,
                    header: card.header,
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

// Function to get the current default title
function getCurrentDefaultTitle() {
    return sectionTitles[currentSection] || 'Vikram R.';
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

        return `
            <div class="journal-list-item" data-index="${index}">
                <h3>${card.header}</h3>
                ${date ? `<div class="journal-date">${date}</div>` : ''}
            </div>
        `;
    }).join('');

    return `<div class="journal-list">${listItems}</div>`;
}

// Journal detail view renderer
function renderJournalDetail(index) {
    const data = contentData['journal'];
    if (!data || !data.cards || !data.cards[index]) return '';

    const card = data.cards[index];

    return `
        <div class="journal-detail">
            <button class="journal-back-button">Back to Journal List</button>
            <div class="card">
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
            const index = parseInt(item.getAttribute('data-index'));
            loadJournalDetail(index);
        });
    });
}

// Load journal detail view
function loadJournalDetail(index, updateHash = true) {
    journalView = 'detail';
    currentJournalIndex = index;
    const container = document.querySelector('.card-container-home');

    // Update the URL hash
    if (updateHash) {
        window.history.replaceState(null, null, `#journal/${index}`);
    }

    // Fade out
    container.style.opacity = '0';

    setTimeout(() => {
        container.innerHTML = renderJournalDetail(index);

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
            <div class="card mb-3 about about-home">
                ${imageHTML}
                <div class="card-body">
                    ${card.body}
                </div>
            </div>
        `;
    } else {
        return `
            <div class="card">
                ${card.header ? `<h5 class="card-header">${card.header}</h5>` : ''}
                <div class="card-body">
                    ${card.body}
                </div>
            </div>
        `;
    }
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

    // Update active navigation link
    document.querySelectorAll('.nav-link-typewriter').forEach(link => {
        link.classList.remove('nav-link-active');
    });
    const activeLink = document.getElementById(section);
    if (activeLink) {
        activeLink.classList.add('nav-link-active');
    }

    // Handle journal section with list/detail view
    if (section === 'journal') {
        loadJournalList();
        return;
    }

    const isAboutStyle = (section === 'about' || section === 'research');

    // Render all cards stacked vertically
    container.innerHTML = data.cards.map(card => renderCard(card, isAboutStyle)).join('');

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
            // Check if it's a journal detail view (e.g., journal/0)
            if (hash.startsWith('journal/')) {
                const parts = hash.split('/');
                const journalIndex = parseInt(parts[1]);

                if (!isNaN(journalIndex)) {
                    // Load journal section first, then load the detail
                    currentSection = 'journal';
                    const titleElement = document.getElementById('title');
                    if (titleElement) {
                        titleElement.innerHTML = getCurrentDefaultTitle();
                    }

                    // Update active navigation link
                    document.querySelectorAll('.nav-link-typewriter').forEach(link => {
                        link.classList.remove('nav-link-active');
                    });
                    const activeLink = document.getElementById('journal');
                    if (activeLink) {
                        activeLink.classList.add('nav-link-active');
                    }

                    loadJournalDetail(journalIndex, false);
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
    }

    // Listen for hash changes (back/forward navigation)
    window.addEventListener('hashchange', () => {
        loadFromHash();
    });

    // Load initial section from hash
    loadFromHash();
}

// Load on page ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavigation);
} else {
    initNavigation();
}
