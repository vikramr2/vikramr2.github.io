// Corporate mode: the one-page layout (About sidebar; News, research and CV
// column), remembering scroll positions while a paper is open, and the view
// transition used when switching the mode on or off.

import { state, reducedMotion } from './state.js';
import { paragraphsToHTML, renderPDFViewer } from './content.js';
import { renderCard } from './render.js';
import { loadSection, loadEntryList } from './router.js';

// Corporate mode's single page. The left sidebar holds About's cards, minus
// any marked hideInCorporate (the pets card) or corporateSection. The right
// column scrolls through sections, each under its own heading: cards marked
// corporateSection (News), the research list, and the CV. On phones the PDF
// viewer shows only its download button (style.css).
export function renderCorporateLayout(container) {
    const about = state.contentData.about ? state.contentData.about.cards : [];
    const cv = state.contentData.experience && state.contentData.experience.cards.find(card => card.pdfUrl);

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

export function saveCorporateScroll() {
    const top = selector => { const el = document.querySelector(selector); return el ? el.scrollTop : 0; };
    corporateScroll = {
        page: top('.card-container-home'),
        sidebar: top('.corporate-sidebar'),
        main: top('.corporate-main')
    };
}

export function restoreCorporateScroll() {
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
export function setCorporateMode(on) {
    if (on === state.corporateMode) return;

    const update = () => {
        state.corporateMode = on;
        document.documentElement.classList.toggle('corporate-mode', on);
        state.instantCards = true;
        loadSection('about', true, true);
        state.instantCards = false;
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
