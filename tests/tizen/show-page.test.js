"use strict";
// A show's details page: season tabs, the episode row, the suggested episode, the page's one background start and
// the Read more modal. Everything is synthetic; layout is a small stand-in for what the TV measures.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");

var media = [{ container: "mp4", videoCodec: "h264", audioCodec: "aac", videoResolution: "1080",
    Part: [{ id: "20", key: "/library/parts/20/file.mp4", Stream: [{ id: 1, streamType: 2, codec: "aac" }] }] }];
var metadata = {};
var children = {};
function add(item) { metadata[item.ratingKey] = item; return item; }
function episode(show, season, number, state) {
    var key = String(show.ratingKey * 1000 + season.index * 100000 + number);
    return add(Object.assign({ ratingKey: key, type: "episode", title: show.title + " episode " + number, index: number, parentIndex: season.index,
        parentRatingKey: season.ratingKey, grandparentRatingKey: show.ratingKey, grandparentTitle: show.title, duration: 1200000,
        thumb: "/thumb/" + key, summary: "Synthetic episode text", Media: media }, state || {}));
}
function fill(show, seasons) {
    children[show.ratingKey] = seasons.map(function (entry) {
        var season = add({ ratingKey: String(show.ratingKey * 10 + entry.index), type: "season", title: entry.index ? "Season " + entry.index : "Specials",
            index: entry.index, parentRatingKey: show.ratingKey, parentTitle: show.title, leafCount: entry.count, viewedLeafCount: entry.viewed || 0 });
        children[season.ratingKey] = [];
        for (var number = 1; number <= entry.count; number += 1) {
            children[season.ratingKey].push(episode(show, season, number, entry.state && entry.state(number)));
        }
        return season;
    });
    return show;
}
// In progress at S2 E3, with Specials and a season long enough for paging and artwork windowing.
var resuming = fill(add({ ratingKey: "10", type: "show", title: "Resuming Show", leafCount: 136, viewedLeafCount: 12, summary: "The whole text of a long synopsis.", art: "/art/10" }), [
    { index: 0, count: 2 },
    { index: 1, count: 10, viewed: 10, state: function () { return { viewCount: 1 }; } },
    { index: 2, count: 120, viewed: 2, state: function (number) { return number < 3 ? { viewCount: 1 } : number === 3 ? { viewOffset: 60000 } : null; } },
    { index: 3, count: 4 }
]);
resuming.OnDeck = { Metadata: metadata["10" * 1000 + 2 * 100000 + 3 + ""] };
var unwatched = fill(add({ ratingKey: "20", type: "show", title: "Unwatched Show", leafCount: 8, viewedLeafCount: 0, summary: "Text" }), [{ index: 1, count: 8 }]);
unwatched.OnDeck = { Metadata: children[children[20][0].ratingKey][0] };
var finished = fill(add({ ratingKey: "30", type: "show", title: "Finished Show", leafCount: 5, viewedLeafCount: 5, summary: "Text" }), [
    { index: 1, count: 3, viewed: 3, state: function () { return { viewCount: 1 }; } },
    { index: 2, count: 2, viewed: 2, state: function () { return { viewCount: 1 }; } }
]);
var outOfOrder = fill(add({ ratingKey: "40", type: "show", title: "Out Of Order Show", leafCount: 9, viewedLeafCount: 2, summary: "Text" }), [
    { index: 1, count: 3 },
    { index: 2, count: 6, viewed: 2, state: function (number) { return number === 2 || number === 4 ? { viewCount: 1 } : null; } }
]);
var longOne = fill(add({ ratingKey: "60", type: "show", title: "Long Season Show", leafCount: 70, viewedLeafCount: 59, summary: "Text" }), [{ index: 1, count: 70 }]);
longOne.OnDeck = { Metadata: children[children[60][0].ratingKey][59] };
var film = add({ ratingKey: "50", type: "movie", title: "Synthetic Film", duration: 100000, viewOffset: 25000, summary: "Film text", Media: media });
var instant = add({ ratingKey: "51", type: "movie", title: "Instant Film", duration: 100000, viewOffset: 25000, summary: "Instant text", art: "/art/51", Media: media, Extras: { Metadata: [] }, Role: [{ id: 981, tag: "Instant Actor", tagKey: "5d776827151a60001f24ab99" }], Chapter: [{ startTimeOffset: 0, tag: "One" }] });
var ahead = add({ ratingKey: "52", type: "movie", title: "Ahead Film", summary: "Ahead text", Media: media, Role: [{ id: 982, tag: "Ahead Actor", tagKey: "5d776827151a60001f24ab98" }] });
var farShow = fill(add({ ratingKey: "70", type: "show", title: "Far Show", leafCount: 2, viewedLeafCount: 0, summary: "Far text" }), [{ index: 1, count: 2 }]);
var farEpisode = children[children[70][0].ratingKey][0];
// What a library or Home list says of a title: no cast beyond the first, no extras, tracks or On Deck.
function asListed(item) {
    var listed = Object.assign({}, item);
    ["OnDeck", "Extras", "Chapter", "Media"].forEach(function (key) { delete listed[key]; });
    if (listed.Role) { listed.Role = listed.Role.slice(0, 1); }
    return listed;
}
var failing = fill(add({ ratingKey: "71", type: "show", title: "Failing Show", leafCount: 1, viewedLeafCount: 0, summary: "Fails first" }), [{ index: 1, count: 1 }]);
var aSeason = children[10][1];
var anEpisode = children[children[10][3].ratingKey][1];
var cast = { Role: [] };
for (var person = 1; person <= 20; person += 1) {
    cast.Role.push({ id: 900 + person, tag: "Actor " + person, tagKey: "5d776827151a60001f24ab" + (10 + person), role: "Role " + person, thumb: "/face/" + person });
}
Object.assign(unwatched, cast);

function key(code) { return { keyCode: code, bubbles: true, cancelable: true }; }

async function run() {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), { url: "https://app.synthetic.invalid", runScripts: "outside-only" });
    var window = dom.window;
    window.TextDecoder = TextDecoder;
    var document = window.document;
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    var requests = [];
    var natives = [];
    var delays = [];
    var state = "NONE";
    var listener = null;
    var sessionGone = false;
    var pageGate = null;
    var metadataGate = null;
    var childrenFail = false;
    var realSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = function (run, ms) { delays.push(ms); return realSetTimeout(run, ms); };
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1920 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1080 });
    Object.defineProperty(window.Element.prototype, "scrollWidth", { configurable: true, get: function () { return this.children.length * 400 - 1920; } });
    window.Element.prototype.getBoundingClientRect = function () {
        var parent = this.parentNode;
        var at = parent ? Array.prototype.indexOf.call(parent.children, this) : 0;
        function rect(left, top, width, height) { return { left: left, top: top, right: left + width, bottom: top + height, width: width, height: height }; }
        var name = this.className || "";
        if (this.vemmCard && /episode-row/.test(parent.className)) { return rect(100 + at * 400 - parent.scrollLeft, 800, 380, 300); }
        if (/season-tab/.test(name)) { return rect(100 + at * 200 - parent.scrollLeft, 720, 180, 50); }
        if (/detail-person/.test(name)) { return rect(100 + at * 200, 1300, 180, 250); }
        if (/detail-pill/.test(name) && /detail-actions/.test(parent.className)) { return rect(100 + at * 250, 600, 230, 60); }
        if (/detail-pill/.test(name)) { return rect(100, 680 + at * 60, 230, 50); }
        return rect(0, 0, 0, 0);
    };
    window.webapis = { avplay: {
        getState: function () { return state; },
        open: function () { natives.push("open"); state = "IDLE"; },
        close: function () { natives.push("close"); state = "NONE"; },
        stop: function () { natives.push("stop"); state = "IDLE"; },
        setDisplayRect: function () {}, setDisplayMethod: function () {},
        setListener: function (value) { listener = value; },
        prepareAsync: function (success) { state = "READY"; success(); },
        getDuration: function () { return 1200000; },
        getCurrentTime: function () { return 0; },
        play: function () { natives.push("play"); state = "PLAYING"; },
        pause: function () { natives.push("pause"); state = "PAUSED"; },
        seekTo: function (time, success) { success(); },
        setStreamingProperty: function (name, value) { natives.push(name + "=" + value); },
        getTotalTrackInfo: function () { return []; },
        setSelectTrack: function () {}, setSilentSubtitle: function () {}
    } };
    window.fetch = function (target, options) {
        var url = new URL(target);
        requests.push({ path: url.pathname, method: options.method });
        var container = null;
        var kids = /^\/library\/metadata\/(\d+)\/children$/.exec(url.pathname);
        var item = /^\/library\/metadata\/(\d+)$/.exec(url.pathname);
        if (kids && childrenFail) { return Promise.resolve({ ok: false, status: 500 }); }
        if (url.pathname === "/library/sections") {
            container = { size: 1, Directory: [{ key: "1", type: "show", title: "Shows" }] };
        } else if (url.pathname === "/hubs/promoted") {
            container = { size: 1, Hub: [{ title: "Recently Added", hubIdentifier: "synthetic", Metadata: [resuming, unwatched, finished, outOfOrder, longOne, film, aSeason, anEpisode, asListed(instant), asListed(ahead), farEpisode, asListed(failing)] }] };
        } else if (kids) {
            var start = Number(url.searchParams.get("X-Plex-Container-Start") || 0);
            var size = Number(url.searchParams.get("X-Plex-Container-Size") || 50);
            var list = children[kids[1]] || [];
            container = { offset: start, totalSize: list.length, Metadata: list.slice(start, start + size) };
            if (start && pageGate) {
                return pageGate.then(function () { return { ok: true, status: 200, json: function () { return Promise.resolve({ MediaContainer: container }); } }; });
            }
        } else if (item && metadata[item[1]]) {
            container = { Metadata: [metadata[item[1]]] };
            if (metadataGate) {
                return metadataGate.then(function () { return { ok: true, status: 200, json: function () { return Promise.resolve({ MediaContainer: container }); } }; });
            }
        } else if (/^\/library\/metadata\/\d+,[\d,]+$/.test(url.pathname)) {
            container = { Metadata: url.pathname.split("/").pop().split(",").map(function (id) { return metadata[id]; }) };
        } else if (/^\/library\/people\/\d+\/media$/.test(url.pathname)) {
            container = { totalSize: 2, Metadata: [film, finished] };
        } else if (/\/allLeaves$/.test(url.pathname)) {
            container = { totalSize: 0, Metadata: [] };
        } else if (url.pathname === "/video/:/transcode/universal/decision") {
            container = { generalDecisionCode: 1001 };
        } else if (/^\/transcode\/sessions\//.test(url.pathname)) {
            if (sessionGone) { return Promise.resolve({ ok: false, status: 404 }); }
            container = { TranscodeSession: [{ throttled: true }] };
        } else if (["/:/timeline", "/video/:/transcode/universal/stop", "/:/scrobble"].indexOf(url.pathname) !== -1) {
            container = {};
        } else { return Promise.resolve({ ok: false, status: 404 }); }
        return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ MediaContainer: container }); } });
    };
    ["js/plex-api.js", "js/avplay.js", "js/playback.js", "js/subtitles.js", "js/preferences.js", "js/session.js", "js/recents.js", "js/home-hero.js",
        "js/item-menu.js", "js/skip-markers.js", "js/account-preferences.js", "js/file-info.js", "js/search-ui.js", "js/people.js", "js/cast-ui.js", "js/preload.js", "js/episodes.js",
        "js/dev-mode.js", "js/reconnect.js", "js/track-memory.js", "js/ends-at.js", "js/i18n.js", "main.js"].forEach(function (file) {
        window.eval(fs.readFileSync(path.join(app, file), "utf8"));
    });
    async function settle() {
        for (var i = 0; i < 40; i += 1) { await Promise.resolve(); }
        await new Promise(function (resolve) { realSetTimeout(resolve, 0); });
        for (var j = 0; j < 40; j += 1) { await Promise.resolve(); }
        await new Promise(function (resolve) { realSetTimeout(resolve, 0); });
    }
    function wait(ms) { return new Promise(function (resolve) { realSetTimeout(resolve, ms); }); }
    function press(code) { (document.activeElement || document).dispatchEvent(new window.KeyboardEvent("keydown", key(code))); }
    var UP = 38, DOWN = 40, LEFT = 37, RIGHT = 39, BACK = 10009;
    function buttons() { return Array.from(document.querySelectorAll("#screen button")); }
    function control(text) {
        var found = buttons().find(function (node) { return node.textContent === text; });
        assert(found, "Missing control: " + text + " in " + buttons().slice(0, 12).map(function (node) { return node.textContent; }));
        return found;
    }
    function count(test) { return requests.filter(function (request) { return test.test(request.path); }).length; }
    function natively(name) { return natives.filter(function (call) { return call === name; }).length; }
    function writes() { return count(/^\/:\/timeline|playQueues|scrobble/); }
    function focusedItem() { return document.activeElement.vemmCard && document.activeElement.vemmCard.item; }
    function rowCards() { return Array.from(document.querySelectorAll(".episode-row .media-card")); }
    function cardFor(number) { return rowCards().filter(function (node) { return node.vemmCard.item.index === number; })[0]; }
    function tabs() { return Array.from(document.querySelectorAll(".season-tabs button")); }
    function selectedTab() { return document.querySelector('.season-tabs [aria-selected="true"]'); }
    async function openCard(item) {
        var found = Array.from(document.querySelectorAll(".media-card")).find(function (node) { return node.vemmCard.item.ratingKey === item.ratingKey; });
        assert(found, "No Home card for " + item.title);
        found.click();
        await settle();
    }
    async function goHome() {
        press(BACK);
        await settle();
        assert(document.querySelector(".screen-home"), "Back from the page reaches Home");
    }
    // The Stop key ignores a press within 150 ms of the last.
    async function stopPlaying() {
        await wait(170);
        press(413);
        await settle();
    }
    function connect() {
        document.querySelector('input[name="server"]').value = "https://pms.synthetic.invalid";
        buttons().find(function (node) { return node.textContent === "Connect"; }).click();
    }

    try {
        connect();
        await settle();

        // A row scrolled back to its start puts its first item at its own place, not where the browser's reveal stops.
        var homeRow = document.querySelector(".shelf-row");
        var homeFirst = homeRow.children[0];
        homeRow.children[1].focus();
        homeRow.scrollLeft = 11;
        homeFirst.focus();
        assert.strictEqual(homeRow.scrollLeft, 0, "Home's first card is back at the row's start");
        await openCard(unwatched);
        var castRow = document.querySelector(".detail-cast-row");
        var firstPerson = castRow.children[0];
        castRow.children[1].focus();
        castRow.scrollLeft = 96;
        firstPerson.focus();
        assert.strictEqual(castRow.scrollLeft, 0, "The cast's first person is back at the row's start");
        await goHome();

        // The page opens on the On Deck episode's season with the cursor on it, and its stream starts at once.
        var before = { writes: writes(), open: natively("open"), decisions: count(/decision$/) };
        await openCard(resuming);
        assert.deepStrictEqual(tabs().map(function (node) { return node.textContent; }), ["Season 1", "Season 2", "Season 3", "Specials"], "Specials go last");
        assert.strictEqual(selectedTab().textContent, "Season 2", "The suggested episode's season is selected");
        assert.strictEqual(rowCards().length, 120, "Every episode of the season, through the server's pages");
        assert.strictEqual(focusedItem().ratingKey, resuming.OnDeck.Metadata.ratingKey, "The cursor starts on the suggested episode");
        assert.strictEqual(state, "READY", "Its stream is prepared, with no wait");
        assert.strictEqual(delays.indexOf(600), -1, "No 0.6 s wait on a details page");
        assert.strictEqual(delays.indexOf(120000), -1, "and no lifetime");
        assert.strictEqual(natively("PREBUFFER_MODE=60000"), 1, "at its resume point");
        assert.strictEqual(natively("open"), before.open + 1);
        assert.strictEqual(count(/decision$/), before.decisions + 1);
        assert.strictEqual(writes(), before.writes, "Nothing is written to Plex");
        assert.strictEqual(document.body.className, "", "and no picture shows");
        // Caption, watched and progress states.
        var inProgress = cardFor(3);
        assert.strictEqual(inProgress.querySelector(".card-title").textContent, "Resuming Show episode 3");
        assert.strictEqual(inProgress.querySelector(".card-meta").textContent, "S2 E3 · 19 min left");
        assert(inProgress.querySelector(".card-progress"), "In progress shows its bar");
        assert(cardFor(1).querySelector(".card-watched"), "Watched shows its mark");
        assert.strictEqual(cardFor(5).querySelector(".card-meta").textContent, "S2 E5 · 20 min");
        // Artwork is fetched only near the screen.
        var drawn = rowCards().filter(function (node) { return node.vemmFar === false; }).length;
        assert(drawn > 0 && drawn < 30, "Artwork only near the screen, not " + drawn);

        // Moving along the row leaves the start alone; the row's ends stop there.
        var marks = { open: natively("open"), close: natively("close"), decisions: count(/decision$/), stops: count(/transcode\/universal\/stop$/) };
        press(LEFT); press(LEFT);
        assert.strictEqual(focusedItem().index, 1);
        press(LEFT);
        assert.strictEqual(focusedItem().index, 1, "Left stops at the first episode");
        press(RIGHT);
        assert.strictEqual(focusedItem().index, 2);
        cardFor(120).focus();
        press(RIGHT);
        assert.strictEqual(focusedItem().index, 120, "Right stops at the last episode");
        await wait(120);
        assert(cardFor(120).vemmFar === false, "Focus brings its artwork");
        assert(cardFor(1).vemmFar === true, "and far artwork is released");
        press(DOWN);
        assert.strictEqual(focusedItem().index, 120, "Nothing below the row: Down stays");
        press(UP);
        assert.strictEqual(document.activeElement, selectedTab(), "Up from the row goes to the selected season, however far along");
        press(DOWN);
        assert.strictEqual(focusedItem().index, 120, "Down returns to the same episode");
        cardFor(3).focus();
        press(UP);
        press(UP);
        assert.strictEqual(document.activeElement.textContent, "Resume", "Up from the tabs goes to Play");
        press(DOWN);
        assert.strictEqual(document.activeElement, selectedTab(), "Down from the Play row goes to the tabs");
        press(DOWN);
        assert.strictEqual(focusedItem().index, 3);
        // Focus leaving Play, or a stay of minutes, changes nothing.
        control("Read more").focus();
        control("Mark watched").focus();
        assert.deepStrictEqual({ open: natively("open"), close: natively("close"), decisions: count(/decision$/), stops: count(/transcode\/universal\/stop$/) }, marks,
            "Scrolling neither replaces nor clears it");
        assert.strictEqual(state, "READY");

        // Read more is a button on the Play row that opens the text in a modal; Back returns to it.
        var row = document.querySelector(".detail-actions");
        assert(row.contains(control("Read more")), "Read more sits on the Play row");
        assert(!document.querySelector(".detail-expand"), "The page has no expand control");
        var readMore = control("Read more");
        readMore.click();
        var modal = document.getElementById("player-menu");
        assert(modal && modal.classList.contains("overview-panel"), "It opens a modal");
        assert.strictEqual(modal.getAttribute("role"), "dialog");
        assert.strictEqual(modal.querySelector(".overview-text").textContent, resuming.summary, "with the whole text");
        assert(modal.contains(document.activeElement), "Focus is in the modal");
        var inside = document.activeElement;
        press(DOWN); press(UP); press(LEFT); press(RIGHT);
        assert.strictEqual(document.activeElement, inside, "and stays there");
        press(BACK);
        assert(!document.getElementById("player-menu"), "Back closes it");
        assert.strictEqual(document.activeElement, readMore, "and returns to the button");
        assert(document.querySelector(".screen-detail"), "without leaving the page");
        readMore.click();
        document.activeElement.click();
        assert(!document.getElementById("player-menu"), "Its own button closes it too");
        assert.strictEqual(document.activeElement, readMore);
        assert.strictEqual(state, "READY", "The modal leaves the start alone");

        // Pressing the suggested episode uses it.
        cardFor(3).click();
        await settle();
        assert.strictEqual(state, "PLAYING", "The suggested episode plays what was prepared");
        assert.strictEqual(count(/decision$/), marks.decisions, "with no second decision");
        assert.strictEqual(natively("open"), marks.open, "and no second open");
        assert(writes() > before.writes, "Progress is reported once it plays");
        // Stopping comes back to this page, with its suggestion fresh and its start prepared again.
        await stopPlaying();
        assert(document.querySelector(".episode-row"), "Stop returns to the show's page");
        assert.strictEqual(document.querySelector(".detail-title").textContent, "Resuming Show");
        assert.strictEqual(focusedItem().index, 3);
        assert.strictEqual(state, "READY", "and its start is prepared again");

        // Pressing another episode discards the start and starts that one.
        marks = { close: natively("close"), stops: count(/transcode\/universal\/stop$/), open: natively("open"), decisions: count(/decision$/) };
        var other = cardFor(7);
        other.focus();
        assert.strictEqual(state, "READY", "Focusing another episode does not disturb it");
        other.click();
        await settle();
        assert.strictEqual(natively("close") - marks.close >= 1, true, "Another episode closes the held start");
        assert.strictEqual(count(/transcode\/universal\/stop$/), marks.stops + 1, "and stops its conversion");
        assert.strictEqual(natively("open"), marks.open + 1, "then opens its own");
        assert.strictEqual(state, "PLAYING");
        await stopPlaying();
        assert(document.querySelector(".episode-row"));

        // Back leaves: closed, conversion stopped, no write. One page back is Home.
        marks = { close: natively("close"), stops: count(/transcode\/universal\/stop$/), writes: writes() };
        assert.strictEqual(state, "READY");
        await goHome();
        assert.strictEqual(state, "NONE", "Leaving closes the prepared player");
        assert.strictEqual(count(/transcode\/universal\/stop$/), marks.stops + 1, "and stops its conversion");
        assert.strictEqual(writes(), marks.writes, "without writing");

        // A season's tab: its episodes follow, the start stays, and the row's entry is that season's own.
        await openCard(resuming);
        marks = { close: natively("close"), open: natively("open") };
        cardFor(3).focus();
        press(UP);
        press(LEFT);
        assert.strictEqual(selectedTab().textContent, "Season 1", "Left moves to the previous season");
        assert.strictEqual(document.activeElement, selectedTab());
        press(LEFT);
        assert.strictEqual(selectedTab().textContent, "Season 1", "and stops at the first");
        assert.strictEqual(cardFor(100).vemmCard.item.parentIndex, 2, "The old episodes stay until the new arrive");
        press(DOWN);
        assert.strictEqual(document.activeElement, selectedTab(), "Down waits for them");
        await wait(280);
        await settle();
        assert.strictEqual(rowCards().length, 10, "Then the season's episodes show");
        assert.strictEqual(focusedItem().parentIndex, 1, "and the cursor enters them");
        assert.strictEqual(focusedItem().index, 1, "at the first episode of a finished season");
        assert.deepStrictEqual({ close: natively("close"), open: natively("open") }, marks, "The start is not disturbed");
        press(UP);
        press(RIGHT);
        press(RIGHT);
        press(RIGHT);
        assert.strictEqual(selectedTab().textContent, "Specials", "Quick moves select as they go");
        await wait(280);
        await settle();
        assert.strictEqual(rowCards().length, 2, "and only the last one is drawn");
        press(LEFT);
        press(LEFT);
        await wait(280);
        await settle();
        assert.strictEqual(cardFor(100).vemmCard.item.parentIndex, 2, "The suggested season again");
        selectedTab().click();
        assert.strictEqual(focusedItem().index, 3, "OK on its tab enters at the suggested episode");
        assert.deepStrictEqual({ close: natively("close"), open: natively("open") }, marks);
        // Going to a page and back keeps the season and the cursor.
        press(UP);
        press(LEFT);
        await wait(280);
        await settle();
        press(DOWN);
        press(RIGHT);
        assert.strictEqual(focusedItem().index, 2);
        var kept = document.activeElement.vemmCard.item.ratingKey;
        press(457);
        assert.deepStrictEqual(Array.from(document.querySelectorAll("#player-menu button")).map(function (node) { return node.textContent; }),
            ["Play", "Go to details", "Mark unwatched", "Cancel"], "A card's menu opens its details, since OK plays");
        var menuCard = cardFor(2);
        press(BACK);
        assert(!document.getElementById("player-menu"), "Back closes a card's menu");
        assert.strictEqual(document.activeElement, menuCard, "and returns to the card");
        press(457);
        marks = { close: natively("close"), stops: count(/transcode\/universal\/stop$/) };
        Array.from(document.querySelectorAll("#player-menu button")).find(function (node) { return node.textContent === "Go to details"; }).click();
        await settle();
        assert.strictEqual(natively("close"), marks.close + 1, "Another page discards the start");
        assert.strictEqual(count(/transcode\/universal\/stop$/), marks.stops + 1);
        assert.strictEqual(document.querySelector(".detail-title").textContent, "Resuming Show episode 2", "An episode's own page");
        assert.strictEqual(document.activeElement.textContent, "Play", "keeps the cursor on Play");
        assert.strictEqual(state, "READY", "and starts that episode");
        assert.strictEqual(selectedTab().textContent, "Season 1", "with its season below");
        assert.strictEqual(document.querySelector(".episode-row").vemmEntry.vemmCard.item.ratingKey, kept, "resting on it");
        press(BACK);
        await settle();
        assert.strictEqual(selectedTab().textContent, "Season 1", "Back returns to the season that was showing");
        assert.strictEqual(focusedItem().ratingKey, kept, "and to the same episode");
        await goHome();

        // The app going to the background discards it; returning starts it again.
        await openCard(resuming);
        assert.strictEqual(state, "READY");
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        document.dispatchEvent(new window.Event("visibilitychange"));
        await settle();
        assert.strictEqual(state, "NONE", "The background closes it");
        Object.defineProperty(document, "hidden", { configurable: true, value: false });
        document.dispatchEvent(new window.Event("visibilitychange"));
        await settle();
        assert.strictEqual(focusedItem().index, 3, "Returning restores the cursor");
        assert.strictEqual(state, "READY", "and starts it again");

        // AVPlay dropping it while it waits ends it, and coming back to the episode prepares it again.
        listener.onerror("PLAYER_ERROR_CONNECTION_FAILED");
        await settle();
        assert.strictEqual(state, "NONE", "AVPlay dropping it ends it");
        control("Read more").focus();
        cardFor(3).focus();
        await settle();
        assert.strictEqual(state, "READY", "and coming back to the episode prepares it again");
        // Pressing after a drop just starts normally.
        listener.onerror("PLAYER_ERROR_CONNECTION_FAILED");
        marks = { open: natively("open"), decisions: count(/decision$/) };
        cardFor(3).click();
        await settle();
        assert.strictEqual(natively("open"), marks.open + 1, "A dropped start opens afresh");
        assert.strictEqual(count(/decision$/), marks.decisions + 1);
        assert.strictEqual(state, "PLAYING");
        await stopPlaying();
        // Plex dropping it after a long wait: looked up at the press, and started normally.
        marks = { open: natively("open"), decisions: count(/decision$/), lookups: count(/^\/transcode\/sessions\//), plays: natively("play") };
        var realNow = window.Date.now;
        var later = realNow() + 600000;
        window.Date.now = function () { return later; };
        sessionGone = true;
        cardFor(3).click();
        await settle();
        sessionGone = false;
        window.Date.now = realNow;
        assert.strictEqual(count(/^\/transcode\/sessions\//), marks.lookups + 1, "A long-held conversion is looked up");
        assert.strictEqual(natively("open"), marks.open + 1, "and one that has gone opens afresh");
        assert.strictEqual(count(/decision$/), marks.decisions + 1);
        assert.strictEqual(state, "PLAYING");
        await stopPlaying();
        await goHome();

        // An unwatched show: one season, so no tabs, and it suggests its first episode.
        await openCard(unwatched);
        assert.strictEqual(document.querySelector(".season-tabs"), null, "One season needs no selector");
        assert.strictEqual(document.querySelector(".episode-browser .detail-section-title").textContent, "Episodes");
        assert.strictEqual(rowCards().length, 8);
        assert.strictEqual(focusedItem().index, 1, "An unwatched show suggests its first episode");
        assert.strictEqual(control("Play").className.indexOf("detail-primary") !== -1, true, "Its button just says Play");
        assert.strictEqual(state, "READY");
        press(UP);
        assert.strictEqual(document.activeElement.textContent, "Play", "With no tabs, Up from the row goes to Play");
        press(DOWN);
        assert.strictEqual(focusedItem().index, 1);
        // More is a list over the page: nothing moves, Back returns to it.
        var moreButton = document.querySelector('[aria-label="More"]');
        var pageBefore = document.getElementById("screen").children.length;
        moreButton.focus();
        moreButton.click();
        var moreMenu = document.getElementById("player-menu");
        assert(moreMenu && moreMenu.classList.contains("more-menu"), "More opens a menu");
        assert.strictEqual(moreMenu.parentNode, document.getElementById("screen"), "over the page, not in its flow");
        assert.strictEqual(document.querySelector(".detail-hero").contains(moreMenu), false);
        assert.strictEqual(moreMenu.querySelector(".menu-list").children.length > 0, true, "with the menu rows");
        assert.strictEqual(moreMenu.querySelector(".menu-view") !== null, true);
        assert.strictEqual(moreButton.getAttribute("aria-expanded"), "true");
        assert(moreMenu.contains(document.activeElement), "Focus is in it");
        var firstRow = document.activeElement;
        press(LEFT);
        press(RIGHT);
        assert.strictEqual(document.activeElement, firstRow, "Left and Right do nothing in a list");
        press(UP);
        assert.notStrictEqual(document.activeElement, firstRow, "Up wraps to the last row");
        press(BACK);
        assert(!document.getElementById("player-menu"), "Back closes it");
        assert.strictEqual(document.activeElement, moreButton, "and returns to More");
        assert.strictEqual(moreButton.getAttribute("aria-expanded"), "false");
        assert.strictEqual(document.getElementById("screen").children.length, pageBefore);
        assert(document.querySelector(".detail-synopsis"), "The page is still there");
        moreButton.click();
        Array.from(document.querySelectorAll("#player-menu button")).find(function (node) { return node.textContent === "Mark unwatched"; }).click();
        assert(document.querySelector(".screen-confirmation"), "A row does its action");
        press(BACK);
        await settle();
        assert.strictEqual(document.activeElement.getAttribute("aria-label"), "More", "and Back from it returns to More");

        // The top 16 of the cast, then View all; a cast page; a person's other titles (cast-page.test.js has the rest).
        var castCards = Array.from(document.querySelectorAll(".detail-cast-row button"));
        assert.strictEqual(castCards.length, 17, "16 people and View all");
        assert.strictEqual(castCards[16].firstChild.textContent, "View all");
        assert.strictEqual(castCards[16].querySelector(".detail-person-count").textContent, "+4");
        assert.strictEqual(document.querySelectorAll(".detail-cast-row img").length, 16, "16 photos");
        castCards[16].focus();
        castCards[16].click();
        assert(document.querySelector(".screen-cast"), "View all opens the cast page");
        var everyone = Array.from(document.querySelectorAll(".cast-row .detail-person"));
        assert.strictEqual(everyone.length, 20, "with everyone in one row");
        assert.strictEqual(document.activeElement, everyone[0], "starting on the first");
        assert.strictEqual(everyone[0].querySelector(".detail-person-role").textContent, "Role 1");
        everyone[6].focus();
        everyone[6].click();
        await settle();
        assert(document.querySelector(".screen-cast"), "Choosing a person stays on the page");
        assert.strictEqual(document.querySelector(".person-name").textContent, "Actor 7", "and shows them");
        assert.strictEqual(document.querySelector(".person-titles .detail-section-title").textContent, "On this server");
        assert.deepStrictEqual(Array.from(document.querySelectorAll(".person-titles .media-card")).map(function (node) { return node.vemmCard.item.title; }),
            [film.title, finished.title], "with their other titles here");
        assert.strictEqual(document.querySelector(".person-biography"), null, "With no plex.tv link there is no biography");
        assert.strictEqual(document.querySelectorAll(".person-titles").length, 1, "or filmography");
        assert.strictEqual(document.getElementById("status").textContent, "", "and nothing says so");
        assert(document.activeElement.vemmCard, "The cursor is on the first title");
        press(BACK);
        await settle();
        assert.strictEqual(document.activeElement.firstChild.textContent, "View all", "Back returns to View all");

        // Below the row is the cast; back up lands where the row rests.
        cardFor(5).focus();
        press(DOWN);
        assert(document.activeElement.classList.contains("detail-person"), "Down from the row reaches the cast");
        press(UP);
        assert.strictEqual(focusedItem().index, 5, "and Up returns to the same episode");
        await goHome();

        // No On Deck answer: a finished show starts over, and one watched out of order goes past its furthest.
        await openCard(finished);
        assert.strictEqual(selectedTab().textContent, "Season 1");
        assert.strictEqual(focusedItem().index, 1, "A finished show suggests its first episode");
        await settle();
        assert.strictEqual(state, "READY", "and prepares it");
        assert.strictEqual(document.activeElement.vemmCard.item.ratingKey, children[children[30][0].ratingKey][0].ratingKey);
        marks = { open: natively("open") };
        control("Play").click();
        await settle();
        assert.strictEqual(state, "PLAYING", "Play uses it");
        assert.strictEqual(natively("open"), marks.open);
        await stopPlaying();
        await goHome();
        await openCard(outOfOrder);
        assert.strictEqual(selectedTab().textContent, "Season 2");
        assert.strictEqual(focusedItem().index, 5, "The first after the furthest watched");
        assert.strictEqual(state, "READY");
        await goHome();

        // The episode list failing leaves the page usable: an error with a retry, and Play.
        childrenFail = true;
        await openCard(unwatched);
        childrenFail = false;
        assert(document.querySelector(".status").classList.contains("status-error"), "The failure is shown");
        assert(control("Retry"), "with a retry");
        assert.strictEqual(document.activeElement.textContent, "Play", "The cursor stays on Play");
        assert.strictEqual(state, "READY", "and the On Deck episode still starts");
        control("Retry").click();
        await settle();
        assert.strictEqual(rowCards().length, 8, "Retry brings the episodes");
        assert.strictEqual(focusedItem().index, 1);
        await goHome();

        // A press draws the page at once from the card's list item; the answer fills the rest in place, with no jump.
        function card(item) { return Array.from(document.querySelectorAll(".media-card")).find(function (node) { return node.vemmCard.item.ratingKey === item.ratingKey; }); }
        var openMetadata = null;
        metadataGate = new Promise(function (resolve) { openMetadata = resolve; });
        card(instant).click();
        assert.strictEqual(document.querySelector(".detail-title").textContent, instant.title, "The title is there in the turn of the press");
        assert.strictEqual(document.querySelector(".detail-synopsis").textContent, instant.summary);
        assert.strictEqual(document.activeElement.textContent, "Resume", "with the cursor on Play");
        assert(document.querySelector(".detail-mode"), "as a details page, with no header");
        assert.strictEqual(document.querySelector(".detail-section"), null, "What needs the answer waits for it");
        assert(buttons().every(function (node) { return node.textContent !== "Back"; }), "There is no Back-only screen");
        var firstHero = document.querySelector(".detail-hero");
        var firstBackdrop = document.querySelector(".detail-backdrop");
        marks = { open: natively("open") };
        await settle();
        assert.strictEqual(natively("open"), marks.open, "A start needs the answer's tracks");
        openMetadata();
        metadataGate = null;
        await settle();
        assert.notStrictEqual(document.querySelector(".detail-hero"), firstHero, "The answer replaces the hero");
        assert.strictEqual(document.querySelectorAll(".detail-hero").length, 1);
        assert.strictEqual(document.querySelector(".detail-backdrop"), firstBackdrop, "under the same backdrop");
        assert.strictEqual(document.querySelectorAll(".detail-scrim").length, 1);
        assert.strictEqual(document.activeElement, control("Resume"), "The cursor is on the new Resume");
        assert.strictEqual(document.querySelector(".detail-section-title").textContent, "Cast & Crew", "The rest is filled in");
        assert.strictEqual(state, "READY", "and the start begins");
        await goHome();
        // Back on a page seen moments ago: all of it at once, from memory, and an unchanged answer changes nothing.
        metadataGate = new Promise(function (resolve) { openMetadata = resolve; });
        card(instant).click();
        var remembered = document.querySelector(".detail-hero");
        assert.strictEqual(document.querySelector(".detail-section-title").textContent, "Cast & Crew", "Remembered: the whole page in the turn of the press");
        assert.strictEqual(document.activeElement, control("Resume"));
        openMetadata();
        metadataGate = null;
        await settle();
        assert.strictEqual(document.querySelector(".detail-hero"), remembered, "An unchanged answer leaves the page alone");
        await goHome();

        // A card the cursor rests on fetches its answer ahead, so the press draws everything at once. Passing over fetches nothing.
        var aheadPath = /^\/library\/metadata\/52$/;
        marks = { metadata: count(aheadPath) };
        card(ahead).focus();
        card(unwatched).focus();
        await wait(380);
        assert.strictEqual(count(aheadPath), marks.metadata, "Passing over a card fetches nothing");
        card(ahead).focus();
        await wait(380);
        await settle();
        assert.strictEqual(count(aheadPath), marks.metadata + 1, "Resting on it does");
        card(ahead).click();
        assert.strictEqual(document.querySelector(".detail-section-title").textContent, "Cast & Crew", "and the press draws the whole page");
        await settle();
        await goHome();

        // Nothing known (Go to show from a card) and a slow server: an empty page, then a way back, and errors keep their Retry.
        card(farEpisode).focus();
        press(457);
        var failMetadata = null;
        metadataGate = new Promise(function (resolve, reject) { failMetadata = reject; });
        Array.from(document.querySelectorAll("#player-menu button")).find(function (node) { return node.textContent === "Go to show"; }).click();
        assert.strictEqual(buttons().length, 0, "Nothing is drawn, not a lone Back");
        assert(document.querySelector(".detail-mode"), "and no header");
        await wait(1100);
        assert.strictEqual(buttons().map(function (node) { return node.textContent; }).join(), "Back", "A really slow server shows the way back");
        assert.strictEqual(document.activeElement.textContent, "Back");
        var gone = new Error("Synthetic failure");
        failMetadata(gone);
        metadataGate = null;
        await settle();
        assert(buttons().some(function (node) { return /Retry/.test(node.textContent); }), "An error keeps its Retry");
        buttons().find(function (node) { return /Retry/.test(node.textContent); }).click();
        await settle();
        assert.strictEqual(document.querySelector(".detail-title").textContent, farShow.title, "and Retry opens the page");
        await goHome();

        // The answer failing under a page drawn from a list: the page stays, with a Retry the waiting cursor goes to.
        var failAnswer = null;
        metadataGate = new Promise(function (resolve, reject) { failAnswer = reject; });
        card(failing).click();
        assert.strictEqual(document.querySelector(".detail-title").textContent, failing.title);
        assert.strictEqual(document.querySelector(".detail-actions").style.visibility, "hidden", "A show's Play row waits for On Deck");
        assert.strictEqual(document.activeElement, document.getElementById("screen"));
        await settle();
        failAnswer(new Error("Synthetic failure"));
        metadataGate = null;
        await settle();
        assert.strictEqual(document.querySelector(".detail-title").textContent, failing.title, "The page stays");
        assert(document.activeElement.classList.contains("route-retry"), "and the cursor goes to Retry");
        document.activeElement.click();
        await settle();
        assert.strictEqual(document.querySelector(".detail-actions").style.visibility, "", "Retry fills the page in");
        assert.strictEqual(focusedItem().ratingKey, children[children[71][0].ratingKey][0].ratingKey, "and the cursor lands on its episode");
        await goHome();

        // A long season's later pages: the cursor moves to the suggested episode when it arrives, unless it has already gone into the row.
        var openGate;
        pageGate = new Promise(function (resolve) { openGate = resolve; });
        await openCard(longOne);
        assert.strictEqual(rowCards().length, 50, "The first page is on screen while the next comes");
        assert.strictEqual(document.activeElement, document.getElementById("screen"), "The cursor waits, with no highlight");
        assert.strictEqual(state, "READY", "and the start does not wait for the list");
        press(DOWN);
        assert.strictEqual(document.activeElement.textContent, "Play next episode", "A press while it waits goes to Play");
        press(DOWN);
        var early = document.activeElement;
        assert(early.vemmCard, "Down reaches the row that is there");
        openGate();
        pageGate = null;
        await settle();
        assert.strictEqual(rowCards().length, 70);
        assert.strictEqual(document.activeElement, early, "The late page leaves that cursor alone");
        await goHome();
        pageGate = new Promise(function (resolve) { openGate = resolve; });
        await openCard(longOne);
        openGate();
        pageGate = null;
        await settle();
        assert.strictEqual(focusedItem().index, 60, "Otherwise the cursor lands on the suggested episode");
        await goHome();

        // An episode that ends waits for the next on its page, with no background start of the finished one.
        await openCard(anEpisode);
        control("Play").click();
        await settle();
        assert.strictEqual(state, "PLAYING");
        marks = { decisions: count(/decision$/), open: natively("open") };
        listener.onstreamcompleted();
        await settle();
        assert.strictEqual(document.querySelector(".detail-title").textContent, anEpisode.title);
        assert.strictEqual(count(/decision$/), marks.decisions, "The page after an episode ends starts nothing");
        assert.strictEqual(natively("open"), marks.open);
        await goHome();

        // A season from elsewhere opens its show's page there; the page's start stays the show's suggestion.
        await openCard(aSeason);
        assert.strictEqual(document.querySelector(".detail-title").textContent, "Resuming Show");
        assert.strictEqual(selectedTab().textContent, "Season 1", "That season is selected");
        assert.strictEqual(focusedItem().parentIndex, 1, "and the cursor is on it");
        assert.strictEqual(state, "NONE", "Nothing starts until Play or the suggested episode has focus");
        control("Resume").focus();
        await settle();
        assert.strictEqual(state, "READY", "Play starts the suggested episode");
        marks = { close: natively("close"), open: natively("open") };
        cardFor(4).click();
        await settle();
        assert.strictEqual(natively("close") > marks.close, true, "Another episode replaces it");
        assert.strictEqual(state, "PLAYING");
        await stopPlaying();
        await goHome();

        // An episode from elsewhere: its own page, Play first, its season below.
        await openCard(anEpisode);
        assert.strictEqual(document.querySelector(".detail-title").textContent, anEpisode.title);
        assert.strictEqual(document.activeElement.textContent, "Play", "An episode's page starts on Play");
        assert.strictEqual(selectedTab().textContent, "Season 3");
        marks = { open: natively("open") };
        press(DOWN);
        assert.strictEqual(document.activeElement, selectedTab());
        press(DOWN);
        assert.strictEqual(focusedItem().ratingKey, anEpisode.ratingKey, "The row rests on the page's episode");
        document.activeElement.click();
        await settle();
        assert.strictEqual(state, "PLAYING", "and pressing it uses the same start");
        assert.strictEqual(natively("open"), marks.open);
        await stopPlaying();
        assert.strictEqual(document.querySelector(".detail-title").textContent, anEpisode.title, "Stop returns to the episode's page");
        await goHome();

        // A movie: the cursor on Play, started at once, kept until pressed or left.
        await openCard(film);
        assert.strictEqual(document.activeElement.textContent, "Resume", "A movie's page starts on its Play");
        assert.strictEqual(state, "READY");
        assert.strictEqual(document.querySelector(".episode-row"), null);
        assert(document.querySelector(".detail-actions").contains(control("Read more")), "Read more is on every details page");
        marks = { open: natively("open"), close: natively("close") };
        control("Play from beginning").focus();
        control("Read more").focus();
        assert.deepStrictEqual({ open: natively("open"), close: natively("close") }, marks, "Other buttons neither replace nor clear it");
        control("Read more").click();
        assert.strictEqual(document.querySelector(".overview-text").textContent, film.summary);
        press(BACK);
        assert.strictEqual(document.activeElement.textContent, "Read more");
        control("Play from beginning").click();
        await settle();
        assert.strictEqual(natively("open"), marks.open + 1, "Play from beginning is another start");
        assert.strictEqual(state, "PLAYING");
        await stopPlaying();

        console.log("Tizen show page, background start on details pages and Read more modal: passed");
    } finally { dom.window.close(); }
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
