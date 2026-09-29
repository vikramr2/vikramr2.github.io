// State shared across modules. Modules can't reassign each other's
// variables, so anything more than one module changes lives on this object.
export const state = {
    // Content from content/<section>.json, by section id
    contentData: {},
    // The section currently shown
    currentSection: 'about',
    // Corporate mode: About, research and the CV on one page, without the
    // journal or the pets card. Set on <html> by the early script in index.html.
    corporateMode: document.documentElement.classList.contains('corporate-mode'),
    // Skip the cards' fade-in when a view transition is already animating them
    instantCards: false
};

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// Phones: the same test as the phone-only rules in css/
export const phoneLayout = window.matchMedia('only screen and (max-device-width: 768px)');
