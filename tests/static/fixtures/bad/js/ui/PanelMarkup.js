/**
 * @module ui/PanelMarkup
 * Fixture (bad): rule 21 (07 S1) fires on lines 16, 17, 18 and 19 and nowhere else (lines 12-14 are its near misses).
 */
import { escapeHtml } from './dom.js';

export class PanelMarkup {
    render(el, row, name) {
        const html = (x) => String(x);
        void html;
        void row;
        el.innerHTML = `<b>${escapeHtml(name)}</b><i>${escapeHtml(`${name}!`)}</i>`;
        // el.innerHTML = `${name}` is only a comment
        el.innerHTML = '<b>${name}</b>'; el.outerHTML = html(name);
        void 0;
        el.innerHTML = `<b>${name}</b>`;
        el.innerHTML += `<i>${ escapeHtml(name)}</i>`;
        el.insertAdjacentHTML('beforeend', `<u>${row.name}</u>`);
        el.outerHTML = `<p>${escapeHtml(name)} ${name.length > 1 ? `<s>${name}</s>` : ''}</p>`;
    }
}
