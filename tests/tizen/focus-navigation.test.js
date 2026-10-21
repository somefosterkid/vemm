"use strict";
// Shared focus behaviours: lists keep the focused row centred (Home moves its track the same way), vertical menus
// wrap, rows stop at their ends, the A-Z bar never scrolls the grid, and titles put in front after a letter jump
// leave the focused title where it was on screen.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");
var css = fs.readFileSync(path.join(app, "css/style.css"), "utf8");

function movie(index, extra) {
    return Object.assign({ ratingKey: String(index + 10), type: "movie", title: "Title " + index, year: 2001 }, extra || {});
}

async function run() {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    window.TextDecoder = TextDecoder;
    var requests = [];
    window.fetch = function (target) {
        var url = new URL(target);
        requests.push({ path: url.pathname, query: url.searchParams });
        var container;
        if (url.pathname === "/library/sections") {
            container = { size: 1, Directory: [{ key: "1", type: "movie", title: "Movies" }] };
        } else if (url.pathname === "/hubs/promoted") {
            container = { Hub: [0, 1, 2, 3].map(function (shelf) {
                return { title: "Shelf " + shelf, hubIdentifier: "synthetic." + shelf, Metadata: [0, 1, 2, 3, 4, 5].map(function (n) {
                    return movie(100 * (shelf + 1) + n);
                }) };
            }) };
        } else if (url.pathname === "/hubs/continueWatching") {
            container = { Hub: [] };
        } else if (url.pathname === "/library/sections/1/all") {
            if (url.searchParams.get("includeMeta")) {
                container = { Meta: { Type: [{ active: true, type: "movie", Filter: [],
                    Sort: [{ key: "titleSort", title: "Title" }, { key: "year", title: "Year" }, { key: "addedAt", title: "Date Added" }] }] } };
            } else {
                var start = Number(url.searchParams.get("X-Plex-Container-Start"));
                var size = Number(url.searchParams.get("X-Plex-Container-Size"));
                container = { offset: start, totalSize: 300, Metadata: [] };
                for (var i = start; i < Math.min(300, start + size); i += 1) { container.Metadata.push(movie(i)); }
            }
        } else if (url.pathname === "/library/sections/1/firstCharacter") {
            container = { Directory: [{ key: "#", title: "#", size: 10 }, { key: "a", title: "A", size: 140 },
                { key: "m", title: "M", size: 150 }] };
        } else if (url.pathname === "/hubs/search") {
            container = { Hub: [{ type: "movie", Metadata: [0, 1, 2, 3, 4].map(function (n) { return movie(n, { title: "Star " + n }); }) },
                { type: "actor", Directory: [{ id: 1, tag: "Star Actor" }, { id: 2, tag: "Star Director" }] },
                { type: "episode", Metadata: [0, 1, 2].map(function (n) {
                    return movie(50 + n, { type: "episode", title: "Episode " + n, grandparentTitle: "Star Show", parentIndex: 1, index: n + 1 });
                }) }] };
        } else { return Promise.resolve({ ok: false, status: 404 }); }
        return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ MediaContainer: container }); } });
    };
    ["js/plex-api.js", "js/preferences.js", "js/session.js", "js/recents.js", "js/home-hero.js", "js/item-menu.js",
        "js/search-ui.js", "js/i18n.js", "main.js"].forEach(function (file) {
        window.eval(fs.readFileSync(path.join(app, file), "utf8"));
    });
    var doc = window.document;
    var screen = doc.getElementById("screen");

    // Layout model of a 1920x1080 TV: a fixed 100px header; the library grid starts 200px down the scrolling screen
    // with six 400px rows; Home shelves are 520px tall, 550px apart, on a track moved by its transform; the A-Z bar
    // is fixed; a dropdown list scrolls inside itself.
    Object.defineProperty(window, "innerHeight", { value: 1080 });
    var scroll = 0;
    function rows() { return Math.ceil(doc.querySelectorAll("#item-list .media-card").length / 6); }
    Object.defineProperty(screen, "scrollTop", { configurable: true, get: function () { return scroll; },
        set: function (value) { scroll = Math.max(0, Math.min(Math.max(0, 300 + rows() * 400 - 1080), Math.round(value))); } });
    function homeY() {
        var track = doc.querySelector(".home-track");
        var moved = track && /translate3d\(0,\s*(-?[\d.]+)px/.exec(track.style.transform);
        return moved ? -Number(moved[1]) : 0;
    }
    function rect(left, top, width, height) {
        return { left: left, top: top, right: left + width, bottom: top + height, width: width, height: height };
    }
    function at(node) { return Array.prototype.indexOf.call(node.parentNode.children, node); }
    function has(node, name) { return node.classList && node.classList.contains(name); }
    window.HTMLElement.prototype.getBoundingClientRect = function () {
        if (has(this, "browse-header")) { return rect(0, 0, 1920, 100); }
        if (this === screen) { return rect(0, 0, 1920, 1080); }
        if (has(this, "home-track")) { return rect(0, -homeY(), 1920, 300 + 4 * 550 + 40); }
        if (has(this, "shelf") && this.parentNode && has(this.parentNode, "home-shelves")) {
            return rect(0, 300 + at(this) * 550 - homeY(), 1920, 520);
        }
        if (has(this, "media-card") && this.parentNode && this.parentNode.id === "item-list") {
            return rect(100 + at(this) % 6 * 280, 200 + Math.floor(at(this) / 6) * 400 - scroll, 250, 380);
        }
        if (has(this, "media-card") && doc.querySelector(".screen-home") && this.parentNode.parentNode.parentNode &&
                has(this.parentNode.parentNode.parentNode, "home-shelves")) {
            return rect(100 + at(this) * 300, this.parentNode.parentNode.getBoundingClientRect().top + 60, 250, 380);
        }
        if (this.parentNode && has(this.parentNode, "letter-bar")) { return rect(1850, 90 + at(this) * 36, 60, 30); }
        return rect(0, 0, 0, 0);
    };
    Object.defineProperty(window.HTMLElement.prototype, "offsetTop", { get: function () {
        return has(this, "media-card") && this.parentNode && this.parentNode.id === "item-list" ? 200 + Math.floor(at(this) / 6) * 400 : 0;
    } });
    function press(keyCode) { doc.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: keyCode, bubbles: true, cancelable: true })); }
    async function settle() {
        for (var i = 0; i < 40; i += 1) { await Promise.resolve(); }
        await new Promise(function (resolve) { setTimeout(resolve, 0); });
    }
    function click(text) {
        var control = Array.from(doc.querySelectorAll("button")).find(function (node) { return node.textContent === text; });
        assert(control, "Missing control: " + text);
        control.click();
    }
    function middle(node) { var box = node.getBoundingClientRect(); return (box.top + box.bottom) / 2; }
    // The visible height below the header: 112 (header and margin) to 1072.
    var CENTRE = (112 + 1072) / 2;

    try {
        doc.querySelector('input[name="server"]').value = "https://pms.synthetic.invalid";
        click("Connect");
        await settle();

        // Home: the focused shelf is centred; the first stops under the header and the last at the window's bottom.
        var shelves = Array.from(doc.querySelectorAll(".home-shelves .shelf"));
        assert.strictEqual(shelves.length, 4);
        shelves[0].querySelector(".media-card").focus();
        assert.strictEqual(shelves[0].getBoundingClientRect().top, 112, "The first shelf sits right under the header");
        press(40);
        assert.strictEqual(doc.activeElement, shelves[1].querySelector(".media-card"));
        assert.strictEqual(middle(shelves[1]), CENTRE, "A middle shelf is centred");
        press(40);
        assert.strictEqual(middle(shelves[2]), CENTRE, "...every one of them");
        var centred = homeY();
        press(39);
        assert.strictEqual(doc.activeElement, shelves[2].querySelectorAll(".media-card")[1]);
        assert.strictEqual(homeY(), centred, "Left/Right keep the shelves still");
        press(40);
        assert.strictEqual(doc.querySelector(".home-track").getBoundingClientRect().bottom, 1080,
            "The last shelf stops at the bottom instead of leaving a gap below it");
        press(38);
        assert.strictEqual(middle(shelves[2]), CENTRE, "Up centres the shelf too");
        assert.strictEqual(screen.scrollTop, 0, "Home never scrolls natively");

        // Library grid: Up and Down keep the focused row in the middle, the same place in both directions.
        click("Movies");
        await settle();
        var cards = function () { return Array.from(doc.querySelectorAll("#item-list .media-card")); };
        cards()[0].focus();
        assert.strictEqual(screen.scrollTop, 0, "The first row cannot be centred; the list stops at its top");
        var down = [];
        for (var step = 1; step <= 4; step += 1) {
            press(40);
            assert.strictEqual(doc.activeElement, cards()[step * 6], "Down steps a whole row");
            down.push(screen.scrollTop);
            assert.strictEqual(middle(doc.activeElement), CENTRE, "Down " + step + " keeps the focused row centred");
        }
        press(38);
        assert.strictEqual(doc.activeElement, cards()[18], "Up steps a whole row");
        assert.strictEqual(middle(doc.activeElement), CENTRE, "Up keeps it centred too, not at the top edge");
        assert.strictEqual(screen.scrollTop, down[2], "...at the same place Down left it");

        // The A-Z bar is fixed: moving along it never scrolls the grid.
        cards()[23].focus();
        var before = screen.scrollTop;
        press(39);
        assert(doc.activeElement.parentNode.classList.contains("letter-bar"), "Right from the row's end enters the A-Z bar");
        press(38);
        press(38);
        press(40);
        assert.strictEqual(screen.scrollTop, before, "Moving along the A-Z bar does not scroll the grid");
        press(37);

        // Dropdown lists wrap.
        doc.querySelector(".page-toolbar .sort-dropdown").click();
        await settle();
        var choices = Array.from(doc.querySelectorAll(".dropdown-list button"));
        assert.strictEqual(doc.activeElement, choices[0]);
        press(38);
        assert.strictEqual(doc.activeElement, choices[choices.length - 1], "Up on the first choice goes to the last");
        press(40);
        assert.strictEqual(doc.activeElement, choices[0], "Down on the last choice goes to the first");
        press(27);

        // The hold/Tools menu of a card (a player-style menu) wraps as well.
        cards()[0].focus();
        press(10135);
        var menuItems = Array.from(doc.querySelectorAll("#player-menu button"));
        assert(menuItems.length > 1 && doc.activeElement === menuItems[0], "Tools opens the card menu");
        press(38);
        assert.strictEqual(doc.activeElement, menuItems[menuItems.length - 1], "Up on the first menu item goes to the last");
        press(40);
        assert.strictEqual(doc.activeElement, menuItems[0], "Down on the last menu item goes to the first");
        press(27);

        // A letter beyond what is loaded reloads around it; the titles put in front keep the focused title in place.
        click("M");
        await settle();
        assert.strictEqual(doc.activeElement.vemmCard.item.title, "Title 150", "M focuses its first title");
        assert.strictEqual(cards()[0].vemmCard.item.title, "Title 84", "The 48 titles before the jump were put in front");
        assert.strictEqual(middle(doc.activeElement), CENTRE, "...without moving the focused title off the centre");

        // Search: Right at the end of a results row stays there instead of jumping to the next section.
        click("Search");
        click("S");
        click("T");
        await new Promise(function (resolve) { setTimeout(resolve, 450); });
        await settle();
        var resultRows = Array.from(doc.querySelectorAll(".search-results .shelf-row"));
        assert.strictEqual(resultRows.length, 2, "Titles and episodes");
        var titles = resultRows[0].querySelectorAll(".media-card");
        titles[titles.length - 1].focus();
        press(39);
        assert.strictEqual(doc.activeElement, titles[titles.length - 1], "Right at a row's end stays on its last card");
        press(37);
        assert.strictEqual(doc.activeElement, titles[titles.length - 2], "Left still steps along the row");
        var episodes = resultRows[1].querySelectorAll(".media-card");
        episodes[episodes.length - 1].focus();
        press(39);
        assert.strictEqual(doc.activeElement, episodes[episodes.length - 1], "...on every row");
        var people = doc.querySelectorAll(".search-results .people-results button");
        people[people.length - 1].focus();
        press(39);
        assert.strictEqual(doc.activeElement, people[people.length - 1], "...including the cast and crew row");
    } finally { window.close(); }

    // The A-Z bar animates only its lift: a fading fill would linger, bar-wide, on the letter focus just left.
    var barDom = new JSDOM("<style>" + css + "</style><div class='letter-bar'><button class='menu-control'>A</button></div>");
    try {
        var letter = barDom.window.getComputedStyle(barDom.window.document.querySelector("button"));
        assert.strictEqual(letter.getPropertyValue("transition"), "transform 120ms ease", "Only the letter's lift animates");
    } finally { barDom.window.close(); }
    console.log("Focus navigation: centred lists and Home shelves, wrapping menus, row ends, A-Z bar and jump: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
