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

    // A switch for a mode that is kept in the URL (param=value while on, so a
    // reload or a shared link opens in the same mode) and in localStorage
    function modeSwitch(switchId, param, value, storageKey, isOn, apply) {
        const el = document.getElementById(switchId);
        if (!el) return;

        function syncParam(on) {
            const url = new URL(location.href);
            if (on) url.searchParams.set(param, value);
            else url.searchParams.delete(param);
            if (url.href !== location.href) history.replaceState(history.state, '', url);
        }

        el.setAttribute('aria-checked', String(isOn()));
        if (isOn()) syncParam(true);

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

    // Bright mode: white cards (?theme=bright)
    modeSwitch('bright-mode-switch', 'theme', 'bright', 'brightMode',
        () => root.classList.contains('bright-mode'),
        on => root.classList.toggle('bright-mode', on));

    // Corporate mode: one-page layout (?layout=corporate)
    modeSwitch('corporate-mode-switch', 'layout', 'corporate', 'corporateMode',
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
}
