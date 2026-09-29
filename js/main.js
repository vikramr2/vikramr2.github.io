// Entry point, loaded by index.html. The settings panel works right away;
// navigation starts once the content JSON has loaded.
import { initSettings } from './settings.js';
import { loadAllContent } from './content.js';
import { initNavigation } from './router.js';

initSettings();
await loadAllContent();
initNavigation();
