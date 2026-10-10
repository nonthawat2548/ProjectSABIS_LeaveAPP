import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Check the authored palette, not a copy of its hex values. This does not replace
// browser checks for computed styles, opacity, images, layout or visual comfort.
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
type Declarations = Record<string, string>;
type Color = readonly [number, number, number, number];

function declarations(selector: string): Declarations {
    const result: Declarations = {};
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selectors = rule[1].replace(/\/\*[\s\S]*?\*\//g, '').trim().split(',').map(value => value.trim());
        if (!selectors.includes(selector)) continue;
        for (const item of rule[2].split(';')) {
            const colon = item.indexOf(':');
            if (colon !== -1) result[item.slice(0, colon).trim()] = item.slice(colon + 1).trim();
        }
    }
    assert(Object.keys(result).length, `Missing CSS rule: ${selector}`);
    return result;
}

function color(value: string, palette: Declarations): Color {
    if (value.startsWith('var(')) {
        const name = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
        assert(name && palette[name], `Unknown color token: ${value}`);
        return color(palette[name], palette);
    }
    if (value === 'white') return [1, 1, 1, 1];
    if (value === 'black') return [0, 0, 0, 1];
    if (value === 'transparent') return [0, 0, 0, 0];
    assert(/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value), `Unsupported color: ${value}`);
    const hex = value.length <= 5 ? [...value.slice(1)].map(channel => channel.repeat(2)).join('') : value.slice(1);
    return [parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255, hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1];
}

function composite(foreground: Color, background: Color): Color {
    const opacity = foreground[3] + background[3] * (1 - foreground[3]);
    assert(opacity > 0, 'Contrast requires a visible background');
    const channels = [0, 1, 2].map(index => (foreground[index] * foreground[3] + background[index] * background[3] * (1 - foreground[3])) / opacity);
    return [channels[0], channels[1], channels[2], opacity];
}

function luminance(value: Color): number {
    const linear = value.slice(0, 3).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
    return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
}

function contrast(palette: Declarations, foreground: string, background: string, minimum = 4.5, underlay?: string) {
    let backdrop = color(background, palette);
    if (backdrop[3] !== 1) {
        assert(underlay, `Missing underlay for translucent background: ${background}`);
        backdrop = composite(backdrop, color(underlay, palette));
    }
    const ink = luminance(composite(color(foreground, palette), backdrop)), paper = luminance(backdrop);
    const ratio = (Math.max(ink, paper) + .05) / (Math.min(ink, paper) + .05);
    assert(ratio >= minimum, `${foreground} on ${background}${underlay ? ` over ${underlay}` : ''}: ${ratio.toFixed(2)}:1, expected at least ${minimum}:1`);
}

function ruleContrast(palette: Declarations, selector: string, fallbackBackground?: string, underlay?: string) {
    const rule = declarations(selector);
    assert(rule.color, `Missing foreground for ${selector}`);
    const background = rule.background ?? fallbackBackground;
    assert(background, `Missing background for ${selector}`);
    contrast(palette, rule.color, background, 4.5, underlay);
}

function heroBackgrounds(selector: string): string[] {
    const background = declarations(selector).background;
    assert(background, `Missing hero background for ${selector}`);
    if (!background.startsWith('linear-gradient(')) return [background];
    // Read the authored gradient stops. This checks each endpoint, not rendered
    // pixels under the illustration or every intermediate gradient color.
    const stops = [...background.matchAll(/var\(--[\w-]+\)|#[\da-f]+/gi)].map(match => match[0]);
    assert(stops.length >= 2, `Missing gradient color stops for ${selector}`);
    return stops;
}

for (const theme of ['light', 'dark'] as const) {
    const palette = { ...declarations(':root'), ...(theme === 'dark' ? declarations(":root[data-theme='dark']") : {}) };

    test(`${theme}: normal and secondary text stay readable on shared surfaces`, () => {
        for (const foreground of ['--ink', '--muted', '--subtle']) {
            for (const background of ['--bg', '--surface', '--surface-soft', '--surface-inset', '--soft']) {
                contrast(palette, `var(${foreground})`, `var(${background})`);
            }
        }
        // Links and selected demo account labels use primary as foreground.
        for (const background of ['--bg', '--surface', '--surface-soft', '--soft']) {
            contrast(palette, 'var(--primary)', `var(${background})`);
        }
    });

    test(`${theme}: small status labels have readable semantic color pairs`, () => {
        for (const selector of ['.badge.pending', '.badge.approved', '.badge.rejected', '.badge.withdrawn', '.avatar', ...[0, 1, 2, 3, 4].map(index => `.avatar-color-${index}`), '.work-badge', '.work-badge.leave', '.art-note', '.bell>span']) {
            ruleContrast(palette, selector);
        }
        for (const family of ['mint', 'purple', 'peach', 'sky']) {
            contrast(palette, `var(--${family}-ink)`, `var(--${family})`);
            // Stat accents have local --tone tokens. Their icons use these
            // colors; the figures and descriptions use the normal card palette.
            ruleContrast({ ...palette, ...declarations(`.tone-${family}`) }, '.stat-icon');
            // A corner decoration can reach behind copy. Check the full accent
            // color too, which is stricter than its translucent authored fill.
            for (const foreground of ['--ink', '--muted', '--subtle']) {
                contrast(palette, `var(${foreground})`, `var(--${family})`);
            }
        }
        contrast(palette, 'var(--red)', 'var(--red-bg)');
        const statBackground = declarations('.stat').background;
        for (const selector of ['.stat-head', '.stat-value small', '.stat>p']) {
            ruleContrast(palette, selector, statBackground);
        }
    });

    test(`${theme}: primary buttons remain readable in their default and hover states`, () => {
        ruleContrast(palette, '.btn.primary');
        const button = declarations('.btn.primary'), hover = declarations('.btn.primary:hover:not(:disabled)');
        contrast(palette, hover.color ?? button.color, hover.background);
        ruleContrast(palette, '.hero-actions>.btn');
        const heroButton = declarations('.hero-actions>.btn'), heroHover = declarations('.hero-actions>.btn:hover');
        contrast(palette, heroHover.color ?? heroButton.color, heroHover.background);
        ruleContrast(palette, '.btn.danger');
        contrast(palette, declarations('.btn.danger').color, declarations('.btn.danger:hover:not(:disabled)').background);
    });

    test(`${theme}: dashboard and login hero copy stays readable`, () => {
        for (const background of heroBackgrounds('.welcome-hero')) {
            for (const selector of ['.hero-eyebrow', '.welcome-copy h1', '.welcome-copy>p', '.hero-date']) {
                ruleContrast(palette, selector, background);
            }
        }
        for (const introBackground of heroBackgrounds('.login-intro')) {
            for (const selector of ['.intro-brand', '.login-story .eyebrow', '.login-story h1', '.login-story h1>span:not(.story-star)', '.login-story>p', '.login-benefits']) {
                ruleContrast(palette, selector, introBackground);
            }
        }
    });

    test(`${theme}: sidebar text stays readable in panels and navigation states`, () => {
        const background = declarations('.sidebar').background;
        contrast(palette, 'var(--sidebar-ink)', background);
        for (const selector of ['.brand small', '.sidebar-label', '.nav-link', '.sidebar-person small', '.logout']) {
            ruleContrast(palette, selector, background, background);
        }
        ruleContrast(palette, '.brand>span');
        ruleContrast(palette, '.nav-link b');
        ruleContrast(palette, '.nav-link.active');
        const active = declarations('.nav-link.active'), activeBadge = declarations('.nav-link.active b');
        contrast(palette, activeBadge.color === 'inherit' ? active.color : activeBadge.color, activeBadge.background);
        ruleContrast(palette, '.nav-link:hover', undefined, background);
        ruleContrast(palette, '.logout:hover', undefined, background);
        const panel = declarations('.workspace-card').background;
        contrast(palette, 'var(--sidebar-ink)', panel, 4.5, background);
        ruleContrast(palette, '.workspace-card small', panel, background);
        ruleContrast(palette, '.workspace-icon', undefined, background);
        const note = declarations('.sidebar-note').background;
        ruleContrast(palette, '.sidebar-note>span', note, background);
        ruleContrast(palette, '.sidebar-note>p', note, background);
        ruleContrast(palette, '.sidebar-note>a', note, background);
    });

    test(`${theme}: keyboard focus colors are visible against their surrounding surfaces`, () => {
        const focus = declarations('button:focus-visible');
        const focusColor = focus['outline-color'] ?? focus.outline.replace(/^\S+\s+\S+\s+/, '');
        for (const surface of ['--bg', '--surface', '--surface-soft', '--hero', '--hero-glow']) {
            contrast(palette, focusColor, `var(${surface})`, 3);
        }
        const input = declarations('input:focus');
        contrast(palette, input['border-color'], input.background, 3);
        const control = declarations('input');
        const controlBorder = control['border-color'] ?? control.border.replace(/^\S+\s+\S+\s+/, '');
        for (const surface of ['--surface-soft', '--surface', '--bg']) {
            contrast(palette, controlBorder, `var(${surface})`, 3);
        }
        const sidebarFocus = declarations('.sidebar a:focus-visible');
        const sidebarColor = sidebarFocus['outline-color'] ?? sidebarFocus.outline.replace(/^\S+\s+\S+\s+/, '');
        for (const surface of ['--sidebar', '--sidebar-panel', '--sidebar-hover']) {
            contrast(palette, sidebarColor, `var(${surface})`, 3);
        }
    });
}

test('Dark background surfaces remain dimmer than light while cards keep their hierarchy', () => {
    const light = declarations(':root'), dark = { ...light, ...declarations(":root[data-theme='dark']") };
    const brightness = (palette: Declarations, token: string) => luminance(color(`var(${token})`, palette));
    // This guards the theme's relative surface hierarchy, not a claimed comfort
    // threshold. Local accents/buttons may be brighter than the large surfaces.
    for (const token of ['--bg', '--surface', '--surface-soft', '--surface-inset', '--hero', '--hero-glow', '--sidebar', '--sidebar-panel']) {
        assert(brightness(dark, token) < brightness(light, token), `${token} must be dimmer in dark mode than light mode`);
    }
    assert(brightness(dark, '--bg') < brightness(dark, '--surface'), 'Dark cards must remain distinct from the page background');
    assert(brightness(dark, '--surface') <= brightness(dark, '--surface-soft'), 'Dark raised controls must not become darker than their card surface');
});
