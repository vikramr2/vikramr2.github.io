// Which section is shown: loading sections and entries into the page, hash
// routing, and navigating by nav links, dots, arrow keys, the side arrows and
// swipes. The background (background.js) follows along via 'sectionchange'.

import { state, reducedMotion } from './state.js';
import { initResearchTabs } from './content.js';
import { LIST_SECTIONS, renderCard, renderEntryList, renderEntryDetail, findEntryIndex } from './render.js';
import { getCurrentDefaultTitle, showNavigationHint } from './title.js';
import { renderCorporateLayout, saveCorporateScroll, restoreCorporateScroll } from './corporate.js';

// Lets the background (background.js) react, e.g. by moving its camera
function announceSection(section) {
    window.dispatchEvent(new CustomEvent('sectionchange', { detail: { section } }));
}

// Load content for a section
export function loadSection(section, skipAnimation = false, updateHash = true) {
    // The CV page is gone; the CV is only shown in corporate mode
    if (section === 'experience') {
        section = 'about';
        updateHash = true;
    }
    // Corporate mode is a single page built from About
    if (state.corporateMode) {
        section = 'about';
    }

    state.currentSection = section;

    const container = document.querySelector('.card-container-home');
    const data = state.contentData[section];

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

    container.classList.toggle('instant-cards', state.instantCards);

    if (state.corporateMode) {
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
        fadeInContent(container);
    }
}

// Fading the content column. This uses the Web Animations API because the
// column's CSS entrance animation (fill-mode forwards) pins its opacity, so
// opacity styles and transitions have no effect on it; script animations
// take precedence over CSS ones.
function fadeInContent(container) {
    if (reducedMotion.matches || !container.animate) return;
    container.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
}

// Fade the column out, run update() to swap its content, then fade it back in
function fadeSwapContent(container, update) {
    if (reducedMotion.matches || !container.animate) {
        update();
        return;
    }
    const fadeOut = container.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease-in', fill: 'forwards' });
    fadeOut.finished.then(() => {
        update();
        fadeOut.cancel();
        fadeInContent(container);
    });
}

// Section order for arrow key navigation
// const sectionOrder = ['about', 'research', 'projects', 'experience', 'journal'];
// const sectionOrder = ['about', 'research', 'experience', 'journal'];
const sectionOrder = ['about', 'research', 'journal'];

// Navigate to next/previous section. Corporate mode is a single page, so
// there is nowhere to go.
function navigateSection(direction) {
    if (state.corporateMode) return;
    const order = sectionOrder;
    const currentIndex = order.indexOf(state.currentSection);
    let newIndex = currentIndex + direction;

    // Wrap around
    if (newIndex < 0) newIndex = order.length - 1;
    if (newIndex >= order.length) newIndex = 0;

    loadSection(order[newIndex]);
}

// Load a section's list view into container (by default the main column)
export function loadEntryList(section, updateHash = true, container = document.querySelector('.card-container-home')) {
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
            if (state.corporateMode) {
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

// Load an entry's detail view into container (by default the main column).
// With animate, the old content fades out and the entry fades in; startup
// and hash routing pass false, since the page's entrance animation covers it.
export function loadEntryDetail(section, slug, updateHash = true, container = document.querySelector('.card-container-home'), animate = true) {

    // Update the URL hash
    if (updateHash) {
        window.history.replaceState(null, null, `#${section}/${slug}`);
    }

    const showEntry = () => {
        container.innerHTML = renderEntryDetail(section, slug);
        container.scrollTop = 0;

        // Add click handler to back button
        const backButton = container.querySelector('.entry-back-button');
        if (backButton) {
            backButton.addEventListener('click', () => {
                fadeSwapContent(container, () => {
                    if (state.corporateMode) {
                        // Back to the corporate layout, scrolled to where it was
                        state.instantCards = true;
                        loadSection('about', true, true);
                        state.instantCards = false;
                        restoreCorporateScroll();
                    } else {
                        loadEntryList(section, true, container);
                    }
                });
            });
        }
    };

    if (animate) {
        fadeSwapContent(container, showEntry);
    } else {
        showEntry();
    }
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

// Wire up navigation and show the section in the URL. Expects the content to
// be loaded already (main.js does that first).
export function initNavigation() {
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
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || state.corporateMode) {
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
        if (state.corporateMode) {
            const [section, slug] = hash.split('/');
            const paper = section === 'research' && slug !== undefined && findEntryIndex('research', slug) !== -1;
            loadSection('about', true, !paper);
            if (paper) loadEntryDetail('research', slug, false, undefined, false);
            return;
        }

        if (hash) {
            // An entry's detail view, e.g. journal/grain-of-rice-black-hole or research/knight
            const [section, slug] = hash.split('/');

            if (slug !== undefined && LIST_SECTIONS[section]) {
                loadSection(section, true, false);
                if (findEntryIndex(section, slug) !== -1) {
                    loadEntryDetail(section, slug, false, undefined, false);
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

    showNavigationHint();
}
