"use strict";
var assert = require("assert");
var fs = require("fs");
var JSDOM = require("jsdom").JSDOM;
var css = fs.readFileSync(require.resolve("../../samsung/Vemm/css/style.css"), "utf8");
// The stylesheet as the TV paints it: style.css, then the colours of the (default) Blue theme.
var painted = css + "\n" + require("../../samsung/Vemm/js/theme.js").css(require("../../samsung/Vemm/js/theme-rules.js"), "blue");
var white = /rgb\(255, ?255, ?255\)/;

function rule(selector) {
    var escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    var match = new RegExp("(?:^|[},])\\s*" + escaped + "\\s*(?:,[^{]*)?\\{([^}]*)\\}", "m").exec(css);
    return match ? match[1] : "";
}

function finalRule(selector) {
    var start = css.lastIndexOf(selector);
    var open = css.indexOf("{", start);
    var close = css.indexOf("}", open);
    return start >= 0 && open >= 0 && close >= 0 ? css.slice(open + 1, close) : "";
}

// Library posters must keep the 2:3 artwork aspect so server-side corner overlays are not cropped.
var dom = new JSDOM("<style>" + css + "</style><section class='screen screen-library'>" +
    "<div class='item-list'><button class='media-card'><span class='poster'></span></button></div></section>");
try {
    var poster = dom.window.getComputedStyle(dom.window.document.querySelector(".poster"));
    assert(["calc((90vw - 156px) / 4)", "calc(0.25 * (90vw - 156px))"].indexOf(poster.height) >= 0,
        "Library poster height must be 1.5x the six-column card width (2:3) so poster overlays are not cropped");
} finally { dom.window.close(); }

// The account avatar covers its own button background, so focus needs a ring outside it.
assert(/box-shadow:\s*0 0 0 4px \$focus-ring/.test(finalRule(".browse-header .account-control:focus")),
    "Focused account/avatar control needs a visible ring that the avatar image cannot cover");

// One focus look for every card: Home, library and search results lift by 6% and ring only the artwork in white;
// the progress bar follows the poster, so it never lands on the title whatever the poster's height.
["screen-home", "screen-library", "screen-search"].forEach(function (kind) {
    var lookDom = new JSDOM("<style>" + painted + "</style><section class='screen " + kind + "'><div class='" +
        (kind === "screen-library" ? "item-list" : "shelf-row") + "'><button class='media-card'><img class='poster'>" +
        "<span class='card-progress'></span><span class='card-title'>T</span><span class='card-meta'>M</span>" +
        "</button><button class='media-card'><img class='poster'></button></div></section>");
    try {
        var w = lookDom.window;
        var focused = w.document.querySelector(".media-card");
        focused.focus();
        var look = w.getComputedStyle(focused);
        assert.strictEqual(look.getPropertyValue("transform"), "scale(1.06)", kind + ": the focused card lifts like everywhere else");
        assert(/^0 0 0 4px rgb\(255, ?255, ?255\)/.test(w.getComputedStyle(w.document.querySelector(".poster")).getPropertyValue("box-shadow")),
            kind + ": a white ring frames the focused artwork");
        assert(!white.test(look.getPropertyValue("box-shadow")) && !/solid/.test(look.getPropertyValue("outline")),
            kind + ": the ring never frames the whole poster and caption");
        assert(!/0 0 0 4px/.test(w.getComputedStyle(w.document.querySelectorAll(".poster")[1]).getPropertyValue("box-shadow")),
            kind + ": only the focused card is ringed");
        var bar = w.getComputedStyle(w.document.querySelector(".card-progress"));
        assert(bar.getPropertyValue("position") !== "absolute" && /^-4px/.test(bar.getPropertyValue("margin-top")),
            kind + ": the progress bar sits on the poster's bottom edge, not at a fixed offset");
        if (kind === "screen-home") {
            var title = w.getComputedStyle(w.document.querySelector(".card-title"));
            assert(!/rgba|px/.test(title.getPropertyValue("box-shadow")), "No halo around the focused Home caption");
            assert(/^(?:|transparent|rgba\(0, 0, 0, 0\))$/.test(title.getPropertyValue("background-color")),
                "No plate or backdrop behind the focused Home caption: " + title.getPropertyValue("background-color"));
            assert.strictEqual(w.getComputedStyle(w.document.querySelector(".card-meta")).getPropertyValue("width"), "200%",
                "The Home year, episode or time-left line is as wide as the title above it");
        }
    } finally { lookDom.window.close(); }
});

// Children listings (Seasons, Episodes, Collection items) measured 270x350 season posters and
// 564x214 episode stills on a 1920-wide TV: posters must be 2:3 and stills 16:9 of their card width.
assert.strictEqual(rule(".screen-listing .item-list .poster").replace(/\s+/g, " ").trim(),
    "height: calc((100vw - 300px) / 4);", "Listing posters are 1.5x the (100vw - 300px) / 6 card width (2:3)");
assert.strictEqual(rule(".screen-listing .item-list .media-card[data-shape=\"landscape\"] .poster").replace(/\s+/g, " ").trim(),
    "height: calc((100vw - 228px) * 3 / 16); min-height: 0;", "Listing stills are 9/16 of the (100vw - 228px) / 3 card width");
assert(/height:\s*240px/.test(rule(".screen-listing .item-list .media-card[data-shape=\"square\"] .poster")),
    "Square listing covers keep their fixed 240px size");

// Home focus and the hero must stay compositor-only: on a 2017 UE55MU6172 a focus box-shadow,
// brightness filter or colour/opacity transition re-rastered posters in software every frame
// (44 missed frames over 10 shelf moves), and visibility-toggling the hero repainted it.
var homeDom = new JSDOM("<style>" + css + "</style><section class='screen screen-home shelves-focused'>" +
    "<div class='home-track'><section class='home-hero'></section><div class='shelf-row'>" +
    "<button class='media-card'><span class='poster'></span><p class='card-title'>T</p></button></div></div></section>");
try {
    var w = homeDom.window;
    var homeCard = w.getComputedStyle(w.document.querySelector(".media-card"));
    assert.notStrictEqual(homeCard.getPropertyValue("will-change"), "transform", "Home cards are not permanent layers");
    ["will-change", "-webkit-backface-visibility", "backface-visibility", "-webkit-transform", "transform"].forEach(function (name) {
        var value = homeCard.getPropertyValue(name);
        assert(!value || value === "auto" || value === "none" || value === "visible", "Idle Home cards carry no " + name + ": " + value);
    });
    // No selector that targets a card or poster may promote it to a layer.
    var promoting = /will-change|translateZ|translate3d|backface-visibility/;
    var cardRulesWithLayer = Array.prototype.filter.call(w.document.styleSheets[0].cssRules, function (r) {
        return /media-card|.poster/.test(r.selectorText || "") && promoting.test(r.cssText);
    });
    assert.deepStrictEqual(cardRulesWithLayer.map(function (r) { return r.selectorText; }), [], "No card rule promotes a layer");
    var cardRules = Array.prototype.filter.call(w.document.styleSheets[0].cssRules, function (r) {
        return r.selectorText === ".media-card";
    });
    assert(cardRules.some(function (r) { return r.style.getPropertyValue("transition") === "transform 120ms ease"; }),
        "Cards animate only their transform");
    w.document.querySelector(".media-card").focus();
    var focusedPoster = w.getComputedStyle(w.document.querySelector(".poster"));
    assert(!/brightness|blur/.test(focusedPoster.getPropertyValue("filter")), "No filter on a focused Home poster");
    assert.notStrictEqual(w.getComputedStyle(w.document.querySelector(".card-title")).getPropertyValue("transition-property"),
        "opacity", "The Home caption does not fade, which would re-raster the card layer");
    var hiddenHero = w.getComputedStyle(w.document.querySelector(".home-hero"));
    assert.strictEqual(hiddenHero.opacity, "0", "The hero hides by opacity on its own layer");
    assert.notStrictEqual(hiddenHero.visibility, "hidden", "The hero is not hidden by visibility, which repaints it");
    assert.strictEqual(w.getComputedStyle(w.document.querySelector(".screen-home")).overflowY, "hidden",
        "Home never scrolls natively; .home-track moves by transform");
} finally { homeDom.window.close(); }
console.log("Tizen card/avatar focus and library poster aspect: passed");
