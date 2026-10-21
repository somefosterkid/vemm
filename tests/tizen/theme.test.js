"use strict";
// The theme engine: the generated template is fresh, every theme and accent defines every token, key colour pairs meet
// WCAG 2.2 contrast in every combination, no colour is hard-coded outside the tokens, the saved theme applies before
// the first paint, and a choice in Settings applies at once and persists.
var assert = require("assert");
var child = require("child_process");
var fs = require("fs");
var path = require("path");
var acorn = require("acorn");
var JSDOM = require("jsdom").JSDOM;
var root = path.resolve(__dirname, "../..");
var app = path.join(root, "samsung/Vemm");
var theme = require(path.join(app, "js/theme.js"));
var rules = require(path.join(app, "js/theme-rules.js"));
var prefs = require(path.join(app, "js/preferences.js"));

var fresh = child.spawnSync(process.execPath, [path.join(root, "tools/tizen/build-theme.js")], { encoding: "utf8" });
assert.strictEqual(fresh.status, 0, "js/theme-rules.js must match css/style.css: run node tools/tizen/build-theme.js --write\n" +
    fresh.stderr);

// Every theme and accent is complete, and Settings offers exactly what the engine defines.
var themes = Object.keys(theme.themes);
var accents = Object.keys(theme.accents);
assert.deepStrictEqual(prefs.themes, themes, "Saved themes are the engine's themes");
assert.deepStrictEqual(prefs.accents, ["theme"].concat(accents), "Saved accents are the engine's accents or the theme's own");
assert(["blue", "grey", "black", "pure_black"].every(function (id) { return themes.indexOf(id) !== -1; }));
function roleNames(set) { return Object.keys(set.roles).sort(); }
themes.forEach(function (id) {
    assert.deepStrictEqual(roleNames(theme.themes[id]), roleNames(theme.themes.blue), id + " defines every theme role");
    assert(theme.accents[theme.themes[id].accent], id + " names a real accent");
});
accents.forEach(function (id) {
    assert.deepStrictEqual(roleNames(theme.accents[id]), roleNames(theme.accents.blue), id + " accent defines every accent role");
});
var roles = theme.roles();
var used = {};
rules.replace(/\$([a-z][a-z0-9-]*)/g, function (match, name) { used[name] = true; return match; });
Object.keys(used).forEach(function (name) { assert(roles.indexOf(name) !== -1, "style.css names an unknown token: " + name); });
themes.forEach(function (id) {
    ["theme"].concat(accents).forEach(function (accent) {
        var values = theme.values(id, accent);
        assert.deepStrictEqual(Object.keys(values).sort(), roles.slice().sort(), id + "/" + accent + " resolves every token");
        Object.keys(values).forEach(function (name) {
            assert(values[name].slice(0, 3).every(function (part) { return part >= 0 && part <= 255 && part === Math.round(part); }) &&
                values[name][3] > 0 && values[name][3] <= 1, id + "/" + accent + " " + name + " is a colour");
        });
        assert.strictEqual(theme.css(rules, id, accent).indexOf("$"), -1, id + "/" + accent + " leaves no token unresolved");
    });
});

// WCAG 2.2: text 4.5:1 (body copy and the focused label held to 7:1), focus indicators and UI parts 3:1.
function channel(value) { value /= 255; return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4); }
function luminance(color) { return 0.2126 * channel(color[0]) + 0.7152 * channel(color[1]) + 0.0722 * channel(color[2]); }
function over(top, bottom) {
    return [0, 1, 2].map(function (i) { return top[i] * top[3] + bottom[i] * (1 - top[3]); });
}
function contrast(a, b) {
    var x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
themes.forEach(function (id) {
    ["theme"].concat(accents).forEach(function (accent) {
        var c = theme.values(id, accent);
        var canvas = c.canvas;
        function solid(name) { return over(c[name], canvas); }
        function check(fore, back, minimum) {
            var ratio = contrast(solid(fore), solid(back));
            assert(ratio >= minimum, id + "/" + accent + ": " + fore + " on " + back + " is " + ratio.toFixed(2) + ":1, below " + minimum);
        }
        ["canvas", "surface", "surface-raised"].forEach(function (back) {
            check("text", back, 7);
            check("text-strong", back, 7);
            check("text-secondary", back, 4.5);
            check("text-muted", back, 4.5);
            check("text-accent", back, 4.5);
            check("text-danger", back, 4.5);
            check("focus", back, 3);
            check("focus-ring", back, 3);
            check("accent", back, 3);
        });
        check("text", "surface-high", 4.5);
        check("text", "surface-selected", 4.5);
        check("on-focus", "focus", 7);
        check("on-primary", "primary", 4.5);
        check("on-warning", "warning", 4.5);
        check("accent", "accent-track", 3);
        // Dark-theme elevation: each raised surface is lighter than the one below.
        assert(luminance(canvas) < luminance(c.surface) && luminance(c.surface) < luminance(c["surface-raised"]) &&
            luminance(c["surface-raised"]) < luminance(c["surface-high"]), id + " raises surfaces by lightness");
    });
    var values = theme.values(id);
    assert.deepStrictEqual(values["focus-ring"].slice(0, 3), [255, 255, 255], id + ": the card focus ring is white");
    // Icons are data-URI images, where a translucent colour is not reliable on old engines.
    assert.strictEqual(values.text[3], 1, id + ": icon colour is opaque");
    assert.strictEqual(values.border[3], 1, id + ": placeholder glyph colour is opaque");
});
assert.deepStrictEqual(theme.values("pure_black").canvas, [0, 0, 0, 1], "Pure black switches OLED pixels off");
assert(luminance(theme.values("black").canvas) > 0 && luminance(theme.values("black").canvas) < 0.005, "Black is near-black, not true black");
assert(luminance(theme.values("pure_black").text) < luminance([255, 255, 255]), "Pure black text is off-white, not glaring white");
assert(/\.media-card:focus \.poster\{box-shadow: 0 0 0 4px \$focus-ring/.test(rules), "Focused artwork is ringed in the focus-ring token");
assert(/\.identity-choice:focus > \.profile-avatar\{box-shadow: 0 0 0 3px \$canvas, 0 0 0 8px \$focus-ring/.test(rules),
    "A focused profile photo carries the same ring");
["blue", "grey", "black"].forEach(function (id) {
    assert.strictEqual(theme.values(id, "theme").accent.join(), theme.values(id, theme.themes[id].accent).accent.join(),
        id + ": Match theme uses the theme's own accent");
});
assert.notStrictEqual(theme.values("grey").accent.join(), theme.values("grey", "blue").accent.join(), "An accent overrides the theme's");

// No hard-coded colour outside the token system. Content keeps its colours: profile colours (data-color), rating
// logos (.rating-) and the viewer's subtitle colours (.subtitle-text).
var colorLiteral = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(|%23[0-9a-fA-F]{3,8}|(?:^|[\s:,'"(])(?:white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|silver|navy|teal)(?![-\w])/i;
var content = /\[data-color=|\.rating-|\.subtitle-text/;
var css = fs.readFileSync(path.join(app, "css/style.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
var contentLiterals = 0;
css.replace(/([^{}]+)\{([^{}]*)\}/g, function (match, selector, body) {
    body.split(";").forEach(function (declaration) {
        var value = declaration.slice(declaration.indexOf(":") + 1);
        if (declaration.indexOf(":") === -1 || !colorLiteral.test(value)) { return; }
        assert(content.test(selector), "Hard-coded colour outside the theme tokens: " + selector.trim() + " { " + declaration.trim() + " }");
        contentLiterals += 1;
    });
    return match;
});
assert(contentLiterals > 0 && contentLiterals < 50, "The content allow-list stays small: " + contentLiterals);
var codeColor = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(|%23[0-9a-fA-F]{3,8}/i;
var profileColors = ["#e5484d", "#f08a24", "#e0b72a", "#3fb868", "#27b5b0", "#4f8cff", "#9b6bf2", "#e866a8"];
["main.js"].concat(fs.readdirSync(path.join(app, "js")).map(function (name) { return "js/" + name; })).filter(function (file) {
    // The palette itself, the template generated from style.css (checked above) and generated translations.
    return /\.js$/.test(file) && ["js/theme.js", "js/theme-rules.js", "js/i18n.js"].indexOf(file) === -1;
}).forEach(function (file) {
    (function walk(node) {
        if (!node || typeof node !== "object") { return; }
        // Colour names in scripts are labels and preference values, never CSS, so only notations are checked.
        if (node.type === "Literal" && typeof node.value === "string" && codeColor.test(node.value)) {
            assert(file === "main.js" && profileColors.indexOf(node.value) !== -1,
                file + " hard-codes a colour outside the theme tokens: " + JSON.stringify(node.value).slice(0, 120));
        }
        Object.keys(node).forEach(function (key) {
            if (key !== "parent" && node[key] && typeof node[key] === "object") {
                if (Array.isArray(node[key])) { node[key].forEach(walk); } else { walk(node[key]); }
            }
        });
    }(acorn.parse(fs.readFileSync(path.join(app, file), "utf8"), { ecmaVersion: 5 })));
});

// The saved theme applies in <head>, before the body (and so before the first paint).
var html = fs.readFileSync(path.join(app, "index.html"), "utf8");
["js/preferences.js", "js/theme-rules.js", "js/theme.js"].forEach(function (file, index, list) {
    var at = html.indexOf("<script src=\"" + file + "\"></script>");
    assert(at > html.indexOf("css/style.css") && at < html.indexOf("</head>"), file + " loads in <head> after style.css");
    assert(index === 0 || at > html.indexOf("<script src=\"" + list[index - 1] + "\"></script>"), file + " loads in order");
    assert.strictEqual(html.indexOf("<script src=\"" + file + "\"></script>", at + 1), -1, file + " loads once");
});
function boot(saved) {
    var dom = new JSDOM(html, { url: "https://app.synthetic.invalid", runScripts: "outside-only" });
    var data = {};
    if (saved) { data["vemm-tizen-preferences"] = saved; }
    Object.defineProperty(dom.window, "localStorage", { value: {
        getItem: function (key) { return data[key] || null; },
        setItem: function (key, value) { data[key] = value; },
        removeItem: function (key) { delete data[key]; }
    } });
    ["js/preferences.js", "js/theme-rules.js", "js/theme.js"].forEach(function (file) {
        dom.window.eval(fs.readFileSync(path.join(app, file), "utf8"));
    });
    return { dom: dom, data: data, style: dom.window.document.getElementById("vemm-theme") };
}
var start = boot(JSON.stringify({ quality: "original", language: "en", theme: "pure_black", accent: "teal" }));
assert(start.style && start.style.parentNode === start.dom.window.document.head, "The theme style is in <head>");
assert.strictEqual(start.style.getAttribute("data-theme"), "pure_black teal", "The saved theme and accent apply at load");
assert(start.style.textContent.indexOf("html, body, .detail-mode .screen, .detail-section, .screen-home.shelves-focused .browse-header" +
    "{background: rgb(0,0,0);color: rgb(228,228,232)}") !== -1, "The saved theme colours the canvas and text");
assert.strictEqual(start.style.previousElementSibling && start.style.previousElementSibling.tagName, "SCRIPT");
start.dom.window.close();
var fallback = boot("{not json");
assert.strictEqual(fallback.style.getAttribute("data-theme"), "blue blue", "Unreadable preferences fall back to Blue");
fallback.dom.window.close();
var first = boot(null);
assert.strictEqual(first.style.getAttribute("data-theme"), "blue blue", "The first launch is Blue");
first.dom.window.close();

// A choice in Settings applies at once, in place, and persists; Reset preferences returns to Blue.
async function settings() {
    var dom = new JSDOM(html, { url: "https://app.synthetic.invalid", runScripts: "outside-only", pretendToBeVisual: true });
    var window = dom.window;
    var data = {};
    Object.defineProperty(window, "localStorage", { value: {
        getItem: function (key) { return data[key] || null; },
        setItem: function (key, value) { data[key] = value; },
        removeItem: function (key) { delete data[key]; }
    } });
    window.TextDecoder = TextDecoder;
    window.fetch = function (target) {
        var url = new URL(target);
        var container = url.pathname === "/hubs/promoted" ? { Hub: [] } : { Directory: [] };
        return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ MediaContainer: container }); } });
    };
    ["js/preferences.js", "js/theme-rules.js", "js/theme.js", "js/plex-api.js", "js/i18n.js", "js/home-hero.js", "main.js"].forEach(function (file) {
        window.eval(fs.readFileSync(path.join(app, file), "utf8"));
    });
    function find(pattern) {
        return Array.from(window.document.querySelectorAll("button")).find(function (node) { return pattern.test(node.textContent); });
    }
    function click(pattern) {
        var node = find(pattern);
        assert(node, "Missing control: " + pattern);
        node.focus();
        node.click();
        return node;
    }
    async function settle() {
        for (var i = 0; i < 40; i += 1) { await Promise.resolve(); }
        await new Promise(function (resolve) { setImmediate(resolve); });
    }
    function style() { return window.document.getElementById("vemm-theme"); }
    function saved() { return JSON.parse(data["vemm-tizen-preferences"]); }
    try {
        var applied = style();
        assert.strictEqual(applied.getAttribute("data-theme"), "blue blue");
        window.document.querySelector('input[name="server"]').value = "https://pms.synthetic.invalid";
        click(/^Connect$/);
        await settle();
        click(/^Account$/); click(/^Settings$/); click(/^Appearance$/);
        assert(find(/^Theme: Blue$/) && find(/^Accent: Match theme$/), "Appearance shows the current theme and accent");
        click(/^Theme: Blue$/);
        var choices = Array.from(window.document.querySelectorAll(".swatch-choice")).map(function (node) {
            return node.textContent + "=" + node.getAttribute("data-color") + "/" + node.getAttribute("aria-pressed");
        });
        assert.deepStrictEqual(choices, ["Blue=theme-blue/true", "Grey=theme-grey/false", "Black=theme-black/false",
            "Pure black (OLED)=theme-pure_black/false"], "Each theme is offered with its sample and the current one marked");
        assert(applied.textContent.indexOf("[data-color=\"theme-grey\"]::before{background:rgb(30,30,33)") !== -1,
            "Theme samples are painted from the theme tokens");
        click(/^Grey$/);
        assert.strictEqual(style(), applied, "The theme style is updated in place, keeping its place in the cascade");
        assert.strictEqual(applied.getAttribute("data-theme"), "grey white", "Grey applies at once, with its own neutral accent");
        assert(applied.textContent.indexOf("background: rgb(30,30,33)") !== -1, "Grey's canvas is painted");
        assert.strictEqual(saved().theme, "grey", "The theme is saved");
        assert(find(/^Theme: Grey$/), "Back on Appearance, the row names the new theme");
        click(/^Accent: Match theme$/);
        assert(find(/^Teal$/).getAttribute("data-color") === "accent-teal" &&
            find(/^Match theme$/).getAttribute("data-color") === "accent-white", "Accent samples, Match theme showing the theme's own");
        click(/^Teal$/);
        assert.strictEqual(applied.getAttribute("data-theme"), "grey teal");
        assert.strictEqual(saved().accent, "teal", "The accent is saved");
        var text = applied.textContent;
        click(/^Accent: Teal$/); click(/^Teal$/);
        assert.strictEqual(applied.textContent, text, "Choosing the applied theme again rewrites nothing");
        click(/^Back$/); click(/^Privacy and data$/); click(/^Reset preferences$/);
        assert.strictEqual(applied.getAttribute("data-theme"), "blue blue", "Reset preferences returns to Blue");
    } finally { window.close(); }
}

settings().then(function () {
    console.log("Vemm theme engine: complete themes and accents, WCAG contrast, token-only colours, startup and switching: passed");
}).catch(function (error) { console.error(error); process.exit(1); });
