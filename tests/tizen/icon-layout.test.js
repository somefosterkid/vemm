"use strict";
var assert = require("assert");
var fs = require("fs");
var css = fs.readFileSync(require.resolve("../../samsung/Vemm/css/style.css"), "utf8");
assert(/\.menu-control::before\s*\{\s*display:\s*none;/.test(css),
    "Text-first controls must not render decorative menu glyphs");
assert(/\.playback-controls \.menu-control::before\s*\{\s*display:\s*block;/.test(css),
    "Playback keeps functional transport glyphs where the controls intentionally hide text");
assert(/\.browse-header \.account-control\s*\{[^}]*width:\s*6vh[^}]*font-size:\s*0/s.test(css),
    "The account button is always a compact round identity control, never an Account oval");
assert(/\.browse-header \.account-control::before\s*\{[^}]*display:\s*block/s.test(css),
    "Without a profile the account button shows a person icon");
var shelf = /\.screen-home\s+\.shelf-row\s*\{([^}]+)\}/.exec(css);
assert(shelf && /margin-left:\s*-1vw/.test(shelf[1]) && /padding:\s*2vh\s+1vw\s+1vh/.test(shelf[1]),
    "Home shelves need overscan (left, and above for the lift and ring) for a scaled first poster/caption without moving the 5vw inset");
console.log("Tizen text-first controls, functional playback glyphs and profile identity regression: passed");
