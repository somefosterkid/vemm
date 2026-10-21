"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");
var thisYear = new Date().getFullYear();
var added = Date.UTC(2021, 2, 4, 12, 0, 0) / 1000;
var SORTS = [
    { key: "titleSort", title: "Title" }, { key: "originallyAvailableAt", title: "Release Date" },
    { key: "rating", title: "Critic Rating" }, { key: "audienceRating", title: "Audience Rating" },
    { key: "duration", title: "Duration" }, { key: "addedAt", title: "Date Added" },
    { key: "lastViewedAt", title: "Date Viewed" }, { key: "mediaHeight", title: "Resolution" },
    { key: "random", title: "Randomly" }, { key: "unviewedLeafCount", title: "Unwatched" }
];

function item(index, extra) {
    return Object.assign({
        ratingKey: String(index + 10), type: "movie", title: "Movie " + index, year: 1999,
        originallyAvailableAt: "2019-05-24", rating: 8.5, ratingImage: "rottentomatoes://image.rating.ripe",
        audienceRating: 7.84, audienceRatingImage: "imdb://image.rating.imdb", duration: 8040000,
        addedAt: added, lastViewedAt: added, unviewedLeafCount: 3,
        Media: [{ videoResolution: "4k", height: 2160, bitrate: 24300 }]
    }, extra || {});
}

async function run() {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    window.TextDecoder = TextDecoder;
    var requests = [];
    var sectionType = "movie";
    var extraFields = {};
    window.fetch = function (target, options) {
        var url = new URL(target);
        requests.push({ path: url.pathname, query: url.searchParams, raw: url.search });
        var container;
        if (url.pathname === "/library/sections") {
            container = { size: 1, Directory: [{ key: "1", type: sectionType, title: "Movies" }] };
        } else if (url.pathname === "/hubs/promoted") {
            container = { size: 0, Hub: [] };
        } else if (url.pathname === "/library/sections/1/all") {
            var start = Number(url.searchParams.get("X-Plex-Container-Start"));
            var size = Number(url.searchParams.get("X-Plex-Container-Size"));
            if (url.searchParams.get("includeMeta")) {
                container = { Meta: { Type: [{ active: true, type: sectionType, Sort: SORTS,
                    Filter: [{ filter: "genre", key: "/library/sections/1/genre", title: "Genre" }] }] } };
            } else {
                container = { offset: start, totalSize: 120, Metadata: [] };
                for (var i = start; i < Math.min(120, start + size); i += 1) {
                    container.Metadata.push(item(i, extraFields));
                }
            }
        } else if (url.pathname === "/library/sections/1/genre") {
            container = { Directory: [{ key: "28", title: "Comedy" }, { key: "18", title: "Drama" },
                { key: "27", title: "Horror" }] };
        } else if (url.pathname === "/library/sections/1/firstCharacter") {
            container = { Directory: [{ key: "#", title: "#", size: 10 }, { key: "a", title: "A", size: 40 },
                { key: "c", title: "C", size: 30 }, { key: "m", title: "M", size: 40 }] };
        } else { return Promise.resolve({ ok: false, status: 404 }); }
        return Promise.resolve({ ok: true, status: 200,
            json: function () { return Promise.resolve({ MediaContainer: container }); } });
    };
    ["js/plex-api.js", "js/avplay.js", "js/playback.js", "js/subtitles.js", "js/preferences.js",
        "js/session.js", "js/recents.js", "js/home-hero.js", "js/item-menu.js", "js/skip-markers.js",
        "js/account-preferences.js", "js/file-info.js", "js/i18n.js", "main.js"].forEach(function (file) {
        window.eval(fs.readFileSync(path.join(app, file), "utf8"));
    });
    var doc = window.document;
    function buttons() { return Array.from(doc.querySelectorAll("button")); }
    function click(text) {
        var control = buttons().find(function (node) { return node.textContent === text; });
        assert(control, "Missing control: " + text);
        assert(!control.disabled, "Disabled control: " + text);
        control.click();
    }
    function texts(selector) {
        return Array.from(doc.querySelectorAll(selector)).map(function (node) { return node.textContent; });
    }
    function press(keyCode) {
        doc.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: keyCode, bubbles: true }));
    }
    async function settle() {
        for (var i = 0; i < 30; i += 1) { await Promise.resolve(); }
        await new Promise(function (resolve) { window.setTimeout(resolve, 0); });
    }
    function lastItems() {
        return requests.filter(function (request) {
            return request.path === "/library/sections/1/all" && !request.query.get("includeMeta"); }).pop();
    }
    function lastLetters() {
        return requests.filter(function (request) { return request.path === "/library/sections/1/firstCharacter"; }).pop();
    }
    function control(name) { return doc.querySelector(".page-toolbar ." + name); }
    async function openList(name) {
        control(name).click();
        await settle();
        assert(doc.querySelector(".dropdown-list"), name + " opens a list");
    }
    async function pickSort(label) {
        await openList("sort-dropdown");
        var choice = Array.from(doc.querySelectorAll(".dropdown-list button")).find(function (node) {
            return node.textContent === label || node.textContent.indexOf(label + " ") === 0;
        });
        assert(choice, "Missing sort: " + label);
        choice.click();
        await settle();
    }
    function metas() { return texts(".item-list .card-meta"); }

    // CSS: the focused jump-bar letter uses the light focused-button look and is larger.
    var css = fs.readFileSync(path.join(app, "css/style.css"), "utf8");
    var focusRule = /\.letter-bar \.menu-control:focus\s*\{([^}]*)\}/.exec(css);
    assert(focusRule, "The focused jump-bar letter has its own rule");
    assert(/background:\s*\$focus;/.test(focusRule[1]) && /color:\s*\$on-focus;/.test(focusRule[1]),
        "Focused letter: the theme's focus fill and its text");
    assert(/transform:\s*(?:-webkit-)?scale\(/.test(focusRule[1]) || /scale\(/.test(focusRule[1]),
        "Focused letter is slightly larger");
    assert(/border-radius:\s*(?:[\d.]+vh|\d+px|50%)/.test(focusRule[1]) && /width:\s*[\d.]+vh/.test(focusRule[1]),
        "Focused letter is a compact pill, not the full bar width");
    function bodies(selector) {
        var found = [];
        css.replace(/([^{}]+){([^{}]*)}/g, function (all, selectors, body) {
            if (selectors.split(",").some(function (item) { return item.trim() === selector; })) { found.push(body); }
            return all;
        });
        return found;
    }
    bodies(".media-card:focus .card-title").concat(bodies(".item-list .media-card:focus .card-title")).forEach(function (body) {
        assert(!/underline/.test(body), "A focused library title is not underlined");
    });
    assert(bodies(".media-card:focus .card-title").some(function (body) { return /font-weight:\s*(?:bold|[789]00)/.test(body); }),
        "...it is bold");
    assert(bodies(".page-toolbar .menu-control.clear-filters").some(function (body) {
        return /background:\s*transparent/.test(body) && /border:\s*0|border-color:\s*transparent/.test(body); }), "Clear filters is link-like");
    assert(bodies(".page-toolbar .menu-control.clear-filters:focus").some(function (body) {
        return /underline/.test(body) && /font-weight:\s*bold/.test(body); }), "...with a clear focused state");

    try {
        doc.querySelector('input[name="server"]').value = "https://pms.synthetic.invalid";
        click("Connect");
        await settle();
        click("Movies");
        await settle();
        assert.strictEqual(doc.querySelectorAll(".media-card").length, 50);

        // Toolbar: separate Sort, Show, Genre and Year controls; no combined Filter.
        assert.strictEqual(control("sort-dropdown").textContent, "Sort: Title ↑ ▾");
        assert.strictEqual(control("watched-control").textContent, "Status: All");
        assert.strictEqual(control("genre-dropdown").textContent, "Genre: All ▾");
        assert.strictEqual(control("year-dropdown").textContent, "Year: Any ▾");
        assert(!control("filter-dropdown"), "The single Filter dropdown is replaced");

        // Clear filters appears only with a filter active, to the right of Collections.
        assert.strictEqual(control("clear-filters"), null, "No filters, no Clear filters");
        // Jump bar: only bar letters with titles are focusable, and Up/Down never lands on a dimmed one.
        var enabled = Array.from(doc.querySelectorAll(".letter-bar button")).filter(function (node) {
            return !node.disabled; }).map(function (node) { return node.textContent; });
        assert.deepStrictEqual(enabled, ["#", "A", "C", "M"]);
        Array.from(doc.querySelectorAll(".letter-bar button")).forEach(function (node) {
            assert.strictEqual(node.disabled, enabled.indexOf(node.textContent) === -1);
            assert.strictEqual(node.classList.contains("letter-empty"), node.disabled,
                "Empty letters are marked, not only disabled");
        });
        doc.querySelector(".media-card").focus();
        press(39);
        assert.strictEqual(doc.activeElement.textContent, "M");
        var visited = [doc.activeElement.textContent];
        for (var step = 0; step < 8; step += 1) { press(38); visited.push(doc.activeElement.textContent); }
        assert.deepStrictEqual(visited.slice(0, 5), ["M", "C", "A", "#", "#"], "Up skips dimmed letters");
        visited = [];
        for (step = 0; step < 8; step += 1) { press(40); visited.push(doc.activeElement.textContent); }
        assert.deepStrictEqual(visited.slice(0, 4), ["A", "C", "M", "M"], "Down skips dimmed letters");
        for (step = 0; step < 8; step += 1) {
            press(38);
            assert(doc.activeElement.classList.contains("menu-control") && !doc.activeElement.disabled &&
                !doc.activeElement.classList.contains("letter-empty"), "Up never focuses a dimmed letter");
        }
        assert.strictEqual(doc.activeElement.textContent, "#");

        // Sort list: one entry per sort, active shows its arrow and has focus.
        await openList("sort-dropdown");
        assert.deepStrictEqual(texts(".dropdown-list button"), ["Title ↑", "Release Date", "Critic Rating",
            "Audience Rating", "Duration", "Date Added", "Date Viewed", "Resolution", "Randomly", "Unwatched", "Bitrate"],
            "One entry per sort; Title first; Bitrate added for movies");
        assert.strictEqual(doc.activeElement.textContent, "Title ↑", "Focus starts on the active sort");
        press(27);
        // Re-selecting the active sort toggles direction.
        await pickSort("Title");
        assert.strictEqual(lastItems().query.get("sort"), "titleSort:desc");
        assert.strictEqual(control("sort-dropdown").textContent, "Sort: Title ↓ ▾");
        assert(doc.querySelector(".letter-bar").hidden, "The jump bar is only for Title ascending");
        assert.deepStrictEqual(Array.from(new Set(metas())), ["1999"], "Title sort keeps the year line");
        await pickSort("Title");
        assert.strictEqual(lastItems().query.get("sort"), "titleSort:asc");
        assert(!doc.querySelector(".letter-bar").hidden);

        // Another sort applies its natural default and shows its value under each card.
        var expectations = [
            ["Release Date", "originallyAvailableAt:desc", "2019-05-24"],
            ["Critic Rating", "rating:desc", "85%"],
            ["Audience Rating", "audienceRating:desc", "7.8"],
            ["Duration", "duration:desc", "2h 14m"],
            ["Date Added", "addedAt:desc", "2021-03-04"],
            ["Date Viewed", "lastViewedAt:desc", "2021-03-04"],
            ["Resolution", "mediaHeight:desc", "4K"],
            ["Unwatched", "unviewedLeafCount:desc", "3 unwatched"],
            ["Bitrate", "mediaBitrate:desc", "24.3 Mbps"]
        ];
        for (var e = 0; e < expectations.length; e += 1) {
            await pickSort(expectations[e][0]);
            assert.strictEqual(lastItems().query.get("sort"), expectations[e][1], expectations[e][0]);
            assert.deepStrictEqual(Array.from(new Set(metas())), [expectations[e][2]], expectations[e][0] + " value");
            assert.strictEqual(control("sort-dropdown").textContent,
                "Sort: " + expectations[e][0] + " ↓ ▾");
        }
        await pickSort("Bitrate");
        assert.strictEqual(lastItems().query.get("sort"), "mediaBitrate:asc", "Active sort toggles direction");
        await openList("sort-dropdown");
        assert.strictEqual(doc.activeElement.textContent, "Bitrate ↑", "Focus opens on the active sort");
        press(27);
        await pickSort("Randomly");
        assert.strictEqual(lastItems().query.get("sort"), "random",
            "Random has no direction");
        assert.strictEqual(control("sort-dropdown").textContent, "Sort: Randomly ▾");

        // Rating images: Rotten Tomatoes as percent, others as x.x; missing values leave the line blank.
        extraFields = { rating: 6.04, ratingImage: "imdb://image.rating", audienceRating: 9,
            audienceRatingImage: "rottentomatoes://image.rating.upright" };
        await pickSort("Critic Rating");
        assert.deepStrictEqual(Array.from(new Set(metas())), ["6.0"]);
        await pickSort("Audience Rating");
        assert.deepStrictEqual(Array.from(new Set(metas())), ["90%"]);
        extraFields = {};

        // Watched cycles All -> Unwatched -> Watched -> All and keeps the sort.
        await pickSort("Release Date");
        var sortValue = lastItems().query.get("sort");
        control("watched-control").click();
        await settle();
        assert.strictEqual(lastItems().query.get("unwatched"), "1");
        assert.strictEqual(lastItems().query.get("sort"), sortValue, "Filters keep the sort");
        assert.strictEqual(control("watched-control").textContent, "Status: Unwatched");
        control("watched-control").click();
        await settle();
        assert.strictEqual(lastItems().query.get("unwatched"), "0");
        assert.strictEqual(control("watched-control").textContent, "Status: Watched");
        control("watched-control").click();
        await settle();
        assert(!lastItems().query.has("unwatched"));
        assert.strictEqual(control("watched-control").textContent, "Status: All");
        assert.strictEqual(doc.activeElement, control("watched-control"), "Focus stays on the toolbar button");

        // Back to Title for the jump bar assertions that follow.
        await pickSort("Title");
        assert.strictEqual(lastItems().query.get("sort"), "titleSort:asc");

        // Genre: multi-select, OR via one comma-joined parameter, Clear on top.
        await openList("genre-dropdown");
        assert.deepStrictEqual(texts(".dropdown-list button"), ["Clear", "Comedy", "Drama", "Horror"]);
        var before = requests.length;
        Array.from(doc.querySelectorAll(".dropdown-list button")).filter(function (node) {
            return node.textContent === "Comedy"; })[0].click();
        await settle();
        assert.strictEqual(requests.length, before, "Toggling does not reload yet");
        assert.deepStrictEqual(texts(".dropdown-list button"), ["Clear", "✓ Comedy", "Drama", "Horror"]);
        click("Drama");
        assert.deepStrictEqual(texts(".dropdown-list button"), ["Clear", "✓ Comedy", "✓ Drama", "Horror"]);
        click("✓ Drama");
        assert.deepStrictEqual(texts(".dropdown-list button"), ["Clear", "✓ Comedy", "Drama", "Horror"],
            "OK toggles the checkmark off again");
        click("Horror");
        press(27);
        await settle();
        assert.strictEqual(lastItems().query.get("genre"), "28,27", "Genres match any via one comma-joined value");
        assert.strictEqual(lastItems().query.getAll("genre").length, 1);
        assert.strictEqual(lastItems().query.get("sort"), "titleSort:asc");
        assert.strictEqual(control("genre-dropdown").textContent, "Genre: Comedy +1 ▾");
        assert.strictEqual(lastLetters().query.get("genre"), "28,27", "The jump bar sees the same filters");
        await openList("genre-dropdown");
        assert.strictEqual(texts(".dropdown-list button")[1], "✓ Comedy", "Selection survives reopening");
        click("Drama");
        press(27);
        await settle();
        assert.strictEqual(control("genre-dropdown").textContent, "Genre: Comedy +2 ▾");
        await openList("genre-dropdown");
        click("Clear");
        await settle();
        assert(!lastItems().query.has("genre"));
        assert.strictEqual(control("genre-dropdown").textContent, "Genre: All ▾");
        await openList("genre-dropdown");
        click("Drama");
        press(27);
        await settle();
        assert.strictEqual(control("genre-dropdown").textContent, "Genre: Drama ▾");
        assert.strictEqual(lastItems().query.get("genre"), "18");

        // Year: presets, decades, custom range; range filters use year>>= and year<<=.
        await openList("year-dropdown");
        assert.deepStrictEqual(texts(".dropdown-list button"), ["Any", "Last 5 years", "Last 10 years", "Last 20 years",
            "2020s", "2010s", "2000s", "1990s", "1980s", "1970s", "1960s", "1950s", "Custom range…"]);
        click("Last 10 years");
        await settle();
        var query = lastItems().query;
        assert.strictEqual(query.get("year>>"), String(thisYear - 9));
        assert(!query.has("year<<"));
        assert(lastItems().raw.indexOf("year%3E%3E=" + (thisYear - 9)) !== -1, "Range keys are encoded");
        assert.strictEqual(query.get("genre"), "18", "Filters combine");
        assert.strictEqual(control("year-dropdown").textContent, "Year: Last 10 years ▾");
        assert.strictEqual(lastLetters().query.get("year>>"), String(thisYear - 9));
        await openList("year-dropdown");
        click("1990s");
        await settle();
        assert.strictEqual(lastItems().query.get("year>>"), "1990");
        assert.strictEqual(lastItems().query.get("year<<"), "1999");
        assert.strictEqual(control("year-dropdown").textContent, "Year: 1990s ▾");
        assert.strictEqual(lastLetters().query.get("year<<"), "1999");
        await openList("year-dropdown");
        click("Custom range…");
        assert.deepStrictEqual(texts(".dropdown-list button"), ["From: 1990", "To: 1999"],
            "The picker starts from the current range");
        assert.strictEqual(doc.activeElement.textContent, "From: 1990");
        press(38); press(38);
        assert.strictEqual(doc.activeElement.textContent, "From: 1992", "Up raises the year");
        press(40);
        assert.strictEqual(doc.activeElement.textContent, "From: 1991", "Down lowers the year");
        press(39);
        assert.strictEqual(doc.activeElement.textContent, "To: 1999", "Right moves to the other field");
        press(38);
        assert.strictEqual(doc.activeElement.textContent, "To: 2000");
        doc.activeElement.click();
        await settle();
        assert.strictEqual(lastItems().query.get("year>>"), "1991");
        assert.strictEqual(lastItems().query.get("year<<"), "2000");
        assert.strictEqual(control("year-dropdown").textContent, "Year: 1991–2000 ▾");
        await openList("year-dropdown");
        click("Any");
        await settle();
        assert(!lastItems().query.has("year>>") && !lastItems().query.has("year<<"));
        assert.strictEqual(control("year-dropdown").textContent, "Year: Any ▾");
        assert.strictEqual(lastItems().query.get("genre"), "18");

        // Clear filters: visible after Collections, resets every filter, keeps the sort, reloads.
        var toolbarButtons = Array.from(doc.querySelectorAll(".page-toolbar button"));
        assert.strictEqual(toolbarButtons.indexOf(control("clear-filters")), toolbarButtons.indexOf(
            toolbarButtons.filter(function (node) { return node.textContent === "Collections"; })[0]) + 1);
        assert.strictEqual(control("clear-filters").textContent, "Clear filters");
        await pickSort("Release Date");
        control("watched-control").click();
        await settle();
        assert(control("clear-filters"), "A status filter shows it");
        var beforeClear = requests.length;
        control("clear-filters").click();
        await settle();
        assert(requests.length > beforeClear, "Clearing reloads the grid");
        assert(!lastItems().query.has("genre") && !lastItems().query.has("unwatched"), "Filters are reset");
        assert.strictEqual(lastItems().query.get("sort"), "originallyAvailableAt:desc", "The sort is kept");
        assert.strictEqual(control("clear-filters"), null, "...and the control goes away");
        assert.strictEqual(doc.activeElement, control("sort-dropdown"), "Focus moves to Sort");
        await pickSort("Title");
        await openList("genre-dropdown");
        click("Drama");
        press(27);
        await settle();
        assert(control("clear-filters"), "A genre shows it");
        await openList("genre-dropdown");
        click("Clear");
        await settle();
        await openList("year-dropdown");
        click("Last 10 years");
        await settle();
        assert(control("clear-filters"), "A year shows it");
        control("clear-filters").click();
        await settle();
        assert.strictEqual(control("clear-filters"), null);

        // Back closes a list without leaving the library.
        await openList("year-dropdown");
        press(27);
        assert.strictEqual(doc.querySelector(".dropdown-list"), null);
        assert(doc.querySelector(".screen-library"));

        // Shows use the unwatchedLeaves filter and the Unwatched count.
        sectionType = "show";
        extraFields = { type: "show", unviewedLeafCount: 7 };
        press(27);
        await settle();
        click("Movies");
        await settle();
        control("watched-control").click();
        await settle();
        assert.strictEqual(lastItems().query.get("unwatchedLeaves"), "1");
        console.log("Library browse: A-Z focus, single sorts, card values, watched/genre/year filters passed");
    } finally { window.close(); }
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
