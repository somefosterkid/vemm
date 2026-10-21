"use strict";
// Library listings: cached title lists render at once and reconcile quietly, pages load as focus nears the end,
// and only rows near the viewport hold artwork.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");
var SORTS = [
    { key: "titleSort", title: "Title" }, { key: "originallyAvailableAt", title: "Release Date" },
    { key: "rating", title: "Critic Rating" }, { key: "audienceRating", title: "Audience Rating" },
    { key: "duration", title: "Duration" }, { key: "addedAt", title: "Date Added" },
    { key: "lastViewedAt", title: "Date Viewed" }, { key: "mediaHeight", title: "Resolution" },
    { key: "random", title: "Randomly" }, { key: "unviewedLeafCount", title: "Unwatched" }
];

function item(index, extra) {
    return Object.assign({
        ratingKey: String(index + 10), type: "movie", title: "Movie " + index, year: 1999, thumb: "/library/metadata/" + index + "/thumb",
        originallyAvailableAt: "2019-05-24", rating: 8.5, ratingImage: "rottentomatoes://image.rating.ripe",
        duration: 8040000, addedAt: 1614859200, unviewedLeafCount: 3,
        Media: [{ videoResolution: "4k", height: 2160, bitrate: 24300 }]
    }, extra || {});
}
function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

async function run() {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    window.TextDecoder = TextDecoder;
    var requests = [];
    var catalog = [];
    for (var n = 0; n < 281; n += 1) { catalog.push(item(n)); }
    var gate = null;
    var bigTitle = 0;
    window.fetch = function (target) {
        var url = new URL(target);
        requests.push({ path: url.pathname, query: url.searchParams });
        var container;
        if (url.pathname === "/library/sections") {
            container = { size: 1, Directory: [{ key: "1", type: "movie", title: "Movies" }] };
        } else if (url.pathname === "/hubs/promoted") {
            container = { size: 0, Hub: [] };
        } else if (url.pathname === "/library/sections/1/all") {
            if (url.searchParams.get("includeMeta")) {
                container = { Meta: { Type: [{ active: true, type: "movie", Sort: SORTS, Filter: [] }] } };
            } else {
                var start = Number(url.searchParams.get("X-Plex-Container-Start"));
                var size = Number(url.searchParams.get("X-Plex-Container-Size"));
                var answer = function () {
                    return { ok: true, status: 200, json: function () { return Promise.resolve({ MediaContainer: {
                        offset: start, totalSize: catalog.length, Metadata: catalog.slice(start, start + size).map(function (entry) {
                            return bigTitle ? Object.assign({}, entry, { title: entry.title + new Array(bigTitle + 1).join("x") }) : entry;
                        }) } }); } };
                };
                return gate ? gate.then(answer) : Promise.resolve(answer());
            }
        } else if (url.pathname === "/library/sections/1/firstCharacter") {
            container = { Directory: [{ key: "#", title: "#", size: 10 }, { key: "a", title: "A", size: 40 },
                { key: "c", title: "C", size: 30 }, { key: "m", title: "M", size: 150 }, { key: "s", title: "S", size: 50 }] };
        } else { return Promise.resolve({ ok: false, status: 404 }); }
        return Promise.resolve({ ok: true, status: 200,
            json: function () { return Promise.resolve({ MediaContainer: container }); } });
    };
    ["js/plex-api.js", "js/avplay.js", "js/playback.js", "js/subtitles.js", "js/preferences.js",
        "js/session.js", "js/recents.js", "js/home-hero.js", "js/item-menu.js", "js/skip-markers.js",
        "js/account-preferences.js", "js/file-info.js", "js/i18n.js", "main.js"].forEach(function (file) {
        window.eval(fs.readFileSync(path.join(app, file), "utf8"));
    });
    // A manually entered server has no id; listings are remembered per server id.
    var createClient = window.PlexApi.createClient;
    window.PlexApi.createClient = function (options) {
        var client = createClient(options);
        client.serverId = "synthetic-server";
        return client;
    };
    var doc = window.document;
    var scrollY = 0;
    // Six cards per row, 300px tall, 720px screen.
    window.HTMLElement.prototype.getBoundingClientRect = function () {
        var top = 0;
        if (this.classList && this.classList.contains("media-card") && this.parentNode) {
            top = Math.floor(Array.prototype.indexOf.call(this.parentNode.children, this) / 6) * 300 - scrollY;
        }
        return { top: top, bottom: top + 300, left: 0, right: 100, width: 100, height: 300 };
    };
    Object.defineProperty(window.HTMLElement.prototype, "offsetTop", { get: function () {
        return this.classList.contains("media-card") && this.parentNode ?
            Math.floor(Array.prototype.indexOf.call(this.parentNode.children, this) / 6) * 300 : 0;
    } });
    Object.defineProperty(window, "innerHeight", { value: 720 });
    function click(text) {
        var control = Array.from(doc.querySelectorAll("button")).find(function (node) { return node.textContent === text; });
        assert(control, "Missing control: " + text);
        control.click();
    }
    function has(text) {
        return Array.from(doc.querySelectorAll("button")).some(function (node) { return node.textContent === text; });
    }
    function press(keyCode) { doc.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: keyCode, bubbles: true })); }
    async function settle() {
        for (var i = 0; i < 30; i += 1) { await Promise.resolve(); }
        await sleep(0);
    }
    function art(card) { return card.querySelector("img").getAttribute("data-artwork-state"); }
    function cards() { return Array.from(doc.querySelectorAll("#item-list .media-card")); }
    function keys() { return cards().map(function (node) { return node.vemmCard.item.ratingKey; }); }
    function pages() {
        return requests.filter(function (request) {
            return request.path === "/library/sections/1/all" && !request.query.get("includeMeta"); });
    }
    function startingAt(offset) {
        return pages().filter(function (r) { return r.query.get("X-Plex-Container-Start") === String(offset); });
    }
    function listingKeys() {
        var found = [];
        for (var i = 0; i < window.localStorage.length; i += 1) {
            var key = window.localStorage.key(i);
            if (key.indexOf("vemm-tizen-listing-") === 0 && key !== "vemm-tizen-listing-index") { found.push(key); }
        }
        return found;
    }
    function stored() {
        return listingKeys().reduce(function (sum, key) { return sum + window.localStorage.getItem(key).length; }, 0);
    }
    async function pickSort(label) {
        doc.querySelector(".page-toolbar .sort-dropdown").click();
        await settle();
        var choice = Array.from(doc.querySelectorAll(".dropdown-list button")).find(function (node) {
            return node.textContent === label || node.textContent.indexOf(label + " ") === 0; });
        assert(choice, "Missing sort: " + label);
        choice.click();
        await settle();
    }
    async function scrollTo(y) {
        scrollY = y;
        doc.querySelector(".screen").dispatchEvent(new window.Event("scroll"));
        await sleep(200);
    }

    try {
        doc.querySelector('input[name="server"]').value = "https://pms.synthetic.invalid";
        click("Connect");
        await settle();
        click("Movies");
        await settle();
        assert.strictEqual(cards().length, 50);

        // No paging controls and no loaded-count status.
        ["Load more", "Previous page", "Back to Home"].forEach(function (label) {
            assert(!has(label), label + " is gone from the library");
        });
        assert(!/items loaded/.test(doc.body.textContent), "No loaded-count status");

        // Rows within three screens of the viewport get artwork ahead; rows more than ten screens away release it.
        var all = cards();
        assert(art(all[0]), "A visible row holds artwork");
        assert(art(all[49]), "A row three screens ahead is fetched early");
        await scrollTo(8000);
        assert(!art(cards()[0]), "A row more than ten screens away releases its artwork");
        assert(art(cards()[49]), "A row between three and ten screens away keeps its artwork");
        await scrollTo(0);
        assert(art(cards()[0]), "Scrolling back attaches it again");

        // The next page loads by itself when focus gets within three screens of the end.
        cards()[1].focus();
        await settle();
        assert.strictEqual(startingAt(50).length, 0, "More than three screens from the end waits");
        var focused = cards()[6];
        focused.focus();
        await settle();
        assert.strictEqual(startingAt(50).length, 1, "Within three screens of the end loads the next page");
        assert.strictEqual(cards().length, 100);
        assert(!art(cards()[99]), "A row more than three screens ahead waits");
        assert.strictEqual(doc.activeElement, focused, "Appending keeps the focused card");
        assert.strictEqual(listingKeys().length, 1, "The loaded list is remembered");

        // Reopening shows the remembered list before the server answers, then reconciles.
        press(27);
        await settle();
        var before = pages().length;
        var release;
        gate = new Promise(function (resolve) { release = resolve; });
        click("Movies");
        await settle();
        assert.strictEqual(cards().length, 100, "The cached list is drawn without waiting");
        assert(!/Loading/.test(doc.body.textContent), "No loading wait");
        assert.strictEqual(pages().length, before + 1, "...while the server is asked in the background");
        var keep = cards()[12];
        keep.focus();
        // New first title, one deleted, two swapped, one renamed.
        catalog.splice(5, 1);
        catalog.splice(0, 0, item(500, { title: "New title" }));
        var swap = catalog[10]; catalog[10] = catalog[11]; catalog[11] = swap;
        catalog[20] = item(1000, { title: "Renamed" });
        var wanted = catalog.slice(0, 100).map(function (entry) { return entry.ratingKey; });
        release();
        gate = null;
        await settle();
        assert.deepStrictEqual(keys().slice(0, 100), wanted, "Adds, removes and reorders follow the server");
        assert.strictEqual(cards()[20].querySelector(".card-title").textContent, "Renamed", "Changed fields update");
        assert.strictEqual(doc.activeElement.vemmCard.item.ratingKey, keep.vemmCard.item.ratingKey, "Focus stays on the same title");

        // A deleted focused title hands focus to its neighbour.
        press(27);
        await settle();
        gate = new Promise(function (resolve) { release = resolve; });
        click("Movies");
        await settle();
        var doomed = cards()[30];
        var successor = cards()[31].vemmCard.item.ratingKey;
        doomed.focus();
        catalog = catalog.filter(function (entry) { return entry.ratingKey !== doomed.vemmCard.item.ratingKey; });
        release();
        gate = null;
        await settle();
        assert.strictEqual(doc.activeElement.vemmCard.item.ratingKey, successor, "Focus moves to the next title");

        // A-Z is a jump, not a filter. A letter inside what is loaded only moves focus to its first title.
        press(27);
        await settle();
        click("Movies");
        await settle();
        var requested = pages().length;
        click("M");
        await settle();
        assert.strictEqual(doc.activeElement.vemmCard.item.title, catalog[80].title, "M focuses its first title");
        assert(pages().slice(requested).every(function (r) { return Number(r.query.get("X-Plex-Container-Start")) >= 100; }),
            "...which is already loaded, so the list is not reloaded");
        // Beyond what is loaded, the list reloads from a row boundary above the letter, then puts the titles before
        // it in front, so the viewer can scroll up past the letter.
        var remembered = listingKeys().map(function (key) { return window.localStorage.getItem(key); });
        click("S");
        await settle();
        assert(startingAt(216).length >= 1, "S (title 230) loads from 216, a multiple of twelve, so grid columns stay put");
        assert(startingAt(168).length >= 1 && startingAt(168)[0].query.get("X-Plex-Container-Size") === "48",
            "...and the 48 titles before that are fetched");
        assert.deepStrictEqual(keys(), catalog.slice(168, 266).map(function (entry) { return entry.ratingKey; }),
            "They are put in front, in order");
        assert.strictEqual(doc.activeElement.vemmCard.item.title, catalog[230].title, "Focus stays on S's first title");
        press(38);
        assert.strictEqual(doc.activeElement.vemmCard.item.title, catalog[224].title, "Up reaches the titles above the letter");
        assert.deepStrictEqual(listingKeys().map(function (key) { return window.localStorage.getItem(key); }), remembered,
            "Only lists that start at the first title are remembered");

        // Size and count caps.
        var count = listingKeys().length;
        bigTitle = 10000;
        await pickSort("Release Date");
        assert.strictEqual(listingKeys().length, count, "A listing over 400 KB is not saved");
        bigTitle = 0;
        var labels = ["Critic Rating", "Audience Rating", "Duration", "Date Added", "Date Viewed", "Resolution", "Randomly",
            "Unwatched", "Release Date", "Critic Rating", "Duration", "Date Added", "Date Viewed", "Title"];
        for (var i = 0; i < labels.length; i += 1) { await pickSort(labels[i]); }
        assert(listingKeys().length >= 8 && listingKeys().length <= 12, "At most 12 listings are kept");
        bigTitle = 7000;
        for (i = 0; i < labels.length; i += 1) { await pickSort(labels[i]); }
        assert(stored() <= 2 * 1024 * 1024, "All listings stay under 2 MB");
        assert(listingKeys().length >= 1 && listingKeys().length < 12, "Older listings are dropped to make room");
        console.log("Library listing: cache, reconcile, auto-load, artwork windowing, caps passed");
    } finally { window.close(); }
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
