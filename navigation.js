// Content data loaded from JSON files
let contentData = {};

// Function to convert paragraphs array to HTML
function paragraphsToHTML(paragraphs) {
    return paragraphs.map(p => {
        // If it's an array, treat it as a bulleted list
        if (Array.isArray(p)) {
            const listItems = p.map(item => `<li class="card-text">${item}</li>`).join('\n                        ');
            return `<ul style="list-style-type: disc; padding-left: 20px;">\n                        ${listItems}\n                    </ul>`;
        }
        // If paragraph contains HTML tags already (like <b>, <a>, <ul>, <img>, etc.), use as is
        if (p.includes('<') && p.includes('>')) {
            return p;
        }
        // Otherwise, wrap in <p> tag
        return `<p class="card-text">${p}</p>`;
    }).join('\n                    ');
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
        const response = await fetch(`content/${section}.json`);
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
                    body: body
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
function loadSection(section, skipAnimation = false) {
    currentSection = section;
    currentCardIndex = 0;

    const container = document.querySelector('.card-container-home');
    const data = contentData[section];

    if (!data) return;

    // Update the title to the section's default text
    const titleElement = document.getElementById('title');
    if (titleElement) {
        titleElement.innerHTML = getCurrentDefaultTitle();
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

    // Load the about section on initial page load (skip animation since CSS handles it)
    loadSection('about', true);
}

// Load on page ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavigation);
} else {
    initNavigation();
}
