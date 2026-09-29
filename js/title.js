// The big title under the logo: each section's default text, and the
// arrow-key hint shown on desktop when the page starts.

import { state, reducedMotion, phoneLayout } from './state.js';

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
export function getCurrentDefaultTitle() {
    const titles = isMobile() ? sectionTitlesMobile : sectionTitles;
    return titles[state.currentSection] || 'Vikram R.';
}

// On desktop, the title first says how to get around, then switches to the
// section's title: it fades in with the page (0.75s delay, 1s fade), stays
// about a second, then crossfades. Phones swipe instead, and corporate mode
// has no sections to move between.
const NAVIGATION_HINT = 'Use arrow keys to navigate ←→';

export function showNavigationHint() {
    const phone = phoneLayout.matches;
    const title = document.getElementById('title');
    if (phone || state.corporateMode || !title) return;

    title.textContent = NAVIGATION_HINT;

    setTimeout(() => {
        // Skip if the title changed meanwhile (a hover, or another section)
        const current = document.getElementById('title');
        if (!current || current.textContent !== NAVIGATION_HINT) return;

        const showDefault = () => {
            current.innerHTML = getCurrentDefaultTitle();
        };
        if (reducedMotion.matches || !current.animate) {
            showDefault();
            return;
        }
        current.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).finished.then(() => {
            if (current.textContent !== NAVIGATION_HINT) return;
            showDefault();
            current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, fill: 'forwards' });
        });
    }, 2750);
}

// The hover script in index.html swaps the title and calls this to restore it
window.getCurrentDefaultTitle = getCurrentDefaultTitle;

// For debugging
window.getCurrentSection = () => state.currentSection;
