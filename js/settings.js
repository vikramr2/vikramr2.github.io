// The settings panel behind the gear in the footer, and its mode switches.

import { state } from './state.js';
import { setCorporateMode } from './corporate.js';

// Settings panel: the gear in the footer opens it. Bright mode switches the
// cards back to white; corporate mode switches to the one-page layout.
export function initSettings() {
    const button = document.getElementById('settings-button');
    const panel = document.getElementById('settings-panel');
    if (!button || !panel) return;

    const root = document.documentElement;

    // A switch for a mode that is kept in localStorage and, when it differs
    // from the default, in the URL (so a reload or a shared link opens in the
    // same mode while the default link stays clean). The defaults must match
    // the early script in index.html.
    function modeSwitch(switchId, param, onValue, offValue, defaultOn, storageKey, isOn, apply) {
        const el = document.getElementById(switchId);
        if (!el) return;

        function syncParam(on) {
            const url = new URL(location.href);
            if (on === defaultOn) url.searchParams.delete(param);
            else url.searchParams.set(param, on ? onValue : offValue);
            if (url.href !== location.href) history.replaceState(history.state, '', url);
        }

        el.setAttribute('aria-checked', String(isOn()));
        syncParam(isOn());

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

    // Bright mode: white cards. On by default; ?theme=dark turns it off.
    modeSwitch('bright-mode-switch', 'theme', 'bright', 'dark', true, 'brightMode',
        () => root.classList.contains('bright-mode'),
        on => root.classList.toggle('bright-mode', on));

    // Corporate mode: one-page layout. On by default; ?layout=standard turns it off.
    modeSwitch('corporate-mode-switch', 'layout', 'corporate', 'standard', true, 'corporateMode',
        () => state.corporateMode,
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

    showSettingsHint(button);
}

// A speech bubble over the gear, shown briefly after the page loads (like the
// arrow-key hint in the title) to point visitors at the settings. Opening the
// settings dismisses it early.
const SETTINGS_HINT = 'click me to switch appearance modes';

function showSettingsHint(button) {
    const hint = document.createElement('span');
    hint.className = 'settings-hint';
    hint.id = 'settings-hint';
    hint.setAttribute('role', 'tooltip');
    hint.textContent = SETTINGS_HINT;
    button.appendChild(hint);
    button.setAttribute('aria-describedby', hint.id);

    let showTimer, hideTimer;
    const dismiss = () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
        hint.classList.remove('settings-hint-visible');
        button.removeAttribute('aria-describedby');
        setTimeout(() => hint.remove(), 400);
    };

    // Appear once the page has faded in (about a second), stay a few seconds
    showTimer = setTimeout(() => hint.classList.add('settings-hint-visible'), 1000);
    hideTimer = setTimeout(dismiss, 4500);
    button.addEventListener('click', dismiss, { once: true });
}
