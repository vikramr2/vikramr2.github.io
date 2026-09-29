// HTML for cards, entry lists (research, software, journal), detail views and
// interest tags. Pure rendering: the loaders in router.js put it on the page.

import { state } from './state.js';
import { paragraphsToHTML } from './content.js';

// Sections shown as a list of entries, each opening into a detail view
// addressed as #<section>/<slug>. The list shows each entry's title plus any
// meta lines pulled from its content.
export const LIST_SECTIONS = {
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
    const table = state.contentData[section].interests || {};
    const chips = card.interests.map(name => {
        const style = table[name] || {};
        return `<span class="interest-chip" style="--chip-color: ${style.color || '#9e9e9e'}">${style.emoji ? `${style.emoji} ` : ''}${name}</span>`;
    }).join('');
    return `<div class="entry-interests">${chips}</div>`;
}

// The interest a section's list is filtered to (none means show everything)
export const activeInterest = {};

// Filter bar above a list: "All" plus every interest that at least one entry uses
export function renderInterestFilter(section) {
    const data = state.contentData[section];
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
export function applyInterestFilter(section, container) {
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
export function renderEntryList(section) {
    const data = state.contentData[section];
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
export function findEntryIndex(section, slug) {
    const data = state.contentData[section];
    if (!data || !data.cards) return -1;

    const bySlug = data.cards.findIndex(card => card.index === slug);
    if (bySlug !== -1) return bySlug;

    const numeric = parseInt(slug);
    if (!isNaN(numeric) && data.cards[numeric]) return numeric;

    return -1;
}

// Detail view renderer: the entry's full card, research with its image on the left
export function renderEntryDetail(section, slug) {
    const data = state.contentData[section];
    const arrIndex = findEntryIndex(section, slug);
    if (!data || !data.cards || arrIndex === -1) return '';

    const card = data.cards[arrIndex];
    const cardHTML = section === 'research'
        ? renderStackedDetailCard(section, card)
        : renderCard({ ...card, body: renderInterestChips(section, card) + card.body });

    return `
        <div class="entry-detail">
            <button class="entry-back-button">${state.corporateMode ? 'Back to Home' : LIST_SECTIONS[section].backLabel}</button>
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

// Render a single card
export function renderCard(card, isAboutStyle = false) {
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
