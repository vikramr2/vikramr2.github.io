// Turning content/<section>.json into HTML: paragraphs (with KaTeX math),
// the PDF viewer, and the research-interests tab widget.

import { state } from './state.js';

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
export function initResearchTabs(container) {
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
export function paragraphsToHTML(paragraphs) {
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
export function renderPDFViewer(pdfUrl, downloadLabel = 'Download PDF') {
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

// A card's body HTML: the PDF viewer for a card with a PDF, or else its
// paragraphs, with the research-interests tab widget in place of the first
// empty paragraph when the card has research_short/research_long
function buildCardBody(card, paragraphs) {
    if (card.pdfUrl) {
        return renderPDFViewer(card.pdfUrl);
    }
    if (!paragraphs) {
        return '';
    }
    if (card.research_short && card.research_long) {
        const tabWidget = buildResearchTabWidget(card.research_short, card.research_long);
        const withWidget = paragraphs.map(p => (p === '' ? null : p));
        const firstEmpty = withWidget.indexOf(null);
        if (firstEmpty !== -1) withWidget[firstEmpty] = tabWidget;
        return paragraphsToHTML(withWidget.filter(p => p !== null));
    }
    return paragraphsToHTML(paragraphs);
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
                const body = buildCardBody(card, card.paragraphs);

                // Corporate mode's version of the card, where corporateParagraphs
                // replaces paragraphs by position, e.g. { "0": "<b>Hey Guys!</b>" },
                // and null removes one
                let corporate = null;
                if (card.corporateParagraphs && card.paragraphs) {
                    const overrides = card.corporateParagraphs;
                    const paragraphs = card.paragraphs
                        .map((p, i) => (String(i) in overrides ? overrides[i] : p))
                        .filter(p => p !== null);
                    corporate = { paragraphs, body: buildCardBody(card, paragraphs) };
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
                    corporate: corporate,
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
export async function loadAllContent() {
    const sections = ['about', 'research', 'projects', 'experience', 'journal'];

    for (const section of sections) {
        state.contentData[section] = await loadSectionContent(section);
    }
}
