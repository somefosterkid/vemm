"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");

var css = fs.readFileSync(path.resolve(__dirname, "../../samsung/Vemm/css/style.css"), "utf8");
var theme = require("../../samsung/Vemm/js/theme.js");

// Blue is the Blue Calm look: navy canvas, deep-navy selection, pale-sky focus on dark navy, stone copy, slate dividers.
var blue = theme.values("blue");
function hex(color) {
    return "#" + color.slice(0, 3).map(function (part) { return (part < 16 ? "0" : "") + part.toString(16); }).join("");
}
[
    ["canvas", "#081522"],
    ["focus", "#d6e6f5"],
    ["on-focus", "#0f2747"],
    ["text-secondary", "#d7dbe3"],
    ["border", "#4b5c63"]
].forEach(function (pair) {
    assert.strictEqual(hex(blue[pair[0]]), pair[1], "Blue Calm semantic colour is missing: " + pair[0]);
});
assert.strictEqual(theme.defaultTheme, "blue", "Blue Calm remains the default theme");

assert(/\/\* Theme roles:[\s\S]+canvas[\s\S]+focus[\s\S]+selection/.test(css),
    "The stylesheet keeps an explicit semantic-role map: CSS custom properties are unavailable on the oldest engine");
var selectedNavigation = /\.home-navigation \[aria-current="page"\]\s*\{([^}]+)\}/g;
var selectedRules = [];
var selectedMatch;
while ((selectedMatch = selectedNavigation.exec(css))) { selectedRules.push(selectedMatch[1]); }
assert(selectedRules.some(function (rule) {
    return /background:\s*\$surface-selected/.test(rule) && /border-bottom:\s*3px solid \$accent/.test(rule);
}),
    "Selected navigation needs both a selection colour and a non-color underline");
assert(/button:focus,[^{]*\{[^}]*background:\s*\$focus;[^}]*color:\s*\$on-focus;/.test(css),
    "Focused text controls must use the focus fill and its high-contrast text");
assert(/\.menu-control::before\s*\{\s*display:\s*none;/.test(css),
    "Decorative menu glyphs must be removed from the text-first interface");
assert(/\.browse-header \.home-navigation \.menu-control::before,[\s\S]+display:\s*none;/.test(css),
    "Specific header/icon rules must not restore decorative glyphs");
assert(/\.playback-controls \.menu-control::before\s*\{\s*display:\s*block;/.test(css),
    "Functional player controls must retain their transport glyphs");
var searchRules = Array.from(css.matchAll(/\.home-navigation \.menu-icon-search\s*\{([^}]+)\}/g));
assert(searchRules.length && /font-size:\s*2\.6vh\s*!important/.test(searchRules[searchRules.length - 1][1]),
    "Search must remain a visible text destination rather than an icon-only control");
assert(/\.home-feature-actions \.round-control,\s*\.detail-actions \.round-control,\s*\.detail-actions \.detail-pill-restart\s*\{[^}]*font-size:\s*2\.2vh/s.test(css),
    "Hero secondary actions must use readable labels instead of decorative round icons");
assert(/\.title-tile:focus\s*\{[^}]*border-color:\s*\$focus-ring;[^}]*outline:\s*2px solid \$focus-ring;[^}]*background:\s*\$surface-selected;[^}]*color:\s*\$text-strong;/s.test(css),
    "Title tiles need a selector-specific focus shape and contrast");
assert(/@media \(max-width:\s*1400px\)\s*\{[\s\S]*\.home-hero-meta,[\s\S]*\.detail-pill,[\s\S]*font-size:\s*24px;/s.test(css),
    "720p couch copy must not fall below the 24px living-room minimum");
var reducedMotion = Array.from(css.matchAll(/@media \(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/g));
assert(reducedMotion.length && /\.media-card,[\s\S]*\.detail-backdrop[\s\S]*transition:\s*none/.test(
    reducedMotion[reducedMotion.length - 1][1]),
    "The final cascade must disable card and detail transitions for reduced motion");

console.log("Vemm Blue Calm palette, focus, selection and icon-restraint contract: passed");
