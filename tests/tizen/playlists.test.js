"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");
var playlists = require("../../samsung/Vemm/js/playlists");

function movie(id) {
    return { ratingKey: String(id), type: "movie", title: "Item " + id, duration: 100000,
        Media: [{ container: "mp4", videoCodec: "h264", audioCodec: "aac", videoResolution: "1080",
            Part: [{ id: String(id + 100), key: "/library/parts/" + (id + 100) + "/file.mp4", Stream: [{ id: 1, streamType: 2, codec: "aac" }] }] }] };
}
var playlist = { ratingKey: "500", key: "/playlists/500/items", type: "playlist", title: "Synthetic Playlist",
    playlistType: "video", smart: false, leafCount: 3, duration: 300000, composite: "/playlists/500/composite/1" };
var members = [movie(1), movie(2), movie(3)];
function queueItems(from) {
    return members.map(function (item, index) { return Object.assign({}, item, { playQueueItemID: 10 + index }); }).slice(from);
}

function unit() {
    assert.strictEqual(playlists.kind({ playlistType: "video" }), "video");
    assert.strictEqual(playlists.kind({ playlistType: "audio" }), "audio");
    assert.strictEqual(playlists.kind({ playlistType: "photo" }), "photo");
    assert.strictEqual(playlists.kind({ playlistType: "other" }), "");
    assert.strictEqual(playlists.kind(null), "");
    var queue = { id: "7", itemId: "11", items: queueItems(0), total: 3, playlist: "500" };
    assert.strictEqual(playlists.selectedIndex(queue), 1);
    assert.strictEqual(playlists.successor(queue).ratingKey, "3", "The next item follows the selected queue item, not the rating key");
    var moved = playlists.advance(queue, playlists.successor(queue));
    assert.strictEqual(moved.itemId, "12");
    assert.strictEqual(moved.playlist, "500");
    assert.strictEqual(playlists.successor(moved), null, "The last item has no successor");
    assert.strictEqual(playlists.successor({ id: "7", itemId: "99", items: queueItems(0) }), null);
    assert.strictEqual(playlists.needsMore({ id: "7", itemId: "11", items: queueItems(0), total: 3 }), false, "A whole queue needs nothing more");
    assert.strictEqual(playlists.needsMore({ id: "7", itemId: "11", items: queueItems(0), total: 60 }), true, "The end of a window asks for the next one");
    assert.strictEqual(playlists.needsMore({ id: "7", itemId: "10", items: queueItems(0), total: 60 }), false);
    var repeated = { id: "7", itemId: "10", items: [queueItems(0)[0], Object.assign({}, queueItems(0)[0], { playQueueItemID: 20 })] };
    assert.strictEqual(playlists.successor(repeated).playQueueItemID, 20, "An item twice in a queue is found by queue item id");
}

async function run() {
    unit();
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only", pretendToBeVisual: true
    });
    var window = dom.window;
    window.TextDecoder = TextDecoder;
    var requests = [];
    var state = "NONE";
    var listener;
    var nextTimers = [];
    var realSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = function (callback, delay) {
        if (delay === 10000) { nextTimers.push(callback); return 1; }
        return realSetTimeout(callback, delay);
    };
    window.webapis = { avplay: {
        getState: function () { return state; }, open: function () { state = "IDLE"; },
        close: function () { state = "NONE"; }, stop: function () { state = "IDLE"; },
        setDisplayRect: function () {}, setDisplayMethod: function () {}, setListener: function (value) { listener = value; },
        prepareAsync: function (success) { state = "READY"; success(); }, getDuration: function () { return 100000; },
        getCurrentTime: function () { return 0; }, play: function () { state = "PLAYING"; },
        pause: function () { state = "PAUSED"; }, seekTo: function (time, success) { success(); },
        setStreamingProperty: function () {}, getTotalTrackInfo: function () { return []; },
        setSelectTrack: function () {}, setSilentSubtitle: function () {}
    } };
    window.fetch = function (target, options) {
        var url = new URL(target);
        requests.push({ path: url.pathname, query: url.searchParams, method: options.method });
        var container = {};
        var queueKey;
        if (url.pathname === "/identity") { container = { machineIdentifier: "synthetic-machine" }; }
        else if (url.pathname === "/library/sections") { container = { Directory: [{ key: "1", type: "movie", title: "Movies" }] }; }
        else if (url.pathname === "/hubs/promoted") {
            container = { Hub: [{ title: "Recent Playlists", hubIdentifier: "home.playlists", type: "playlist", Metadata: [playlist] }] };
        } else if (url.pathname === "/playlists") { container = { totalSize: 1, Metadata: [playlist] }; }
        else if (url.pathname === "/playlists/500") { container = { Metadata: [playlist] }; }
        else if (url.pathname === "/playlists/500/items") { container = { totalSize: 3, Metadata: members }; }
        else if (/^\/library\/metadata\/[1-5]$/.test(url.pathname)) { container = { Metadata: [movie(Number(url.pathname.slice(-1)))] }; }
        else if (url.pathname === "/playQueues") {
            assert.strictEqual(options.method, "POST");
            assert.strictEqual(url.searchParams.get("playlistID"), "500");
            assert.strictEqual(url.searchParams.get("type"), "video");
            assert.strictEqual(url.searchParams.get("continuous"), "0");
            queueKey = url.searchParams.get("key");
            var from = queueKey ? Number(queueKey.slice(-1)) - 1 : 0;
            container = { playQueueID: 7, playQueueSelectedItemID: 10 + from, playQueueTotalCount: 5, Metadata: queueItems(0) };
        }
        else if (url.pathname === "/playQueues/7") {
            assert.strictEqual(options.method, "GET");
            assert.strictEqual(url.searchParams.get("window"), "20");
            container = { playQueueID: 7, playQueueTotalCount: 5, Metadata: queueItems(0).concat([4, 5].map(function (id) { return Object.assign(movie(id), { playQueueItemID: 10 + id - 1 }); })) };
        }
        else if (url.pathname === "/video/:/transcode/universal/decision") { container = { generalDecisionCode: 1001 }; }
        return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ MediaContainer: container }); } });
    };
    ["js/plex-api.js", "js/avplay.js", "js/playback.js", "js/subtitles.js", "js/preferences.js", "js/session.js", "js/recents.js",
        "js/home-hero.js", "js/item-menu.js", "js/skip-markers.js", "js/account-preferences.js", "js/file-info.js", "js/search-ui.js",
        "js/playlists.js", "js/queue.js", "js/preload.js", "js/i18n.js", "main.js"].forEach(function (file) {
        window.eval(fs.readFileSync(path.join(app, file), "utf8"));
    });
    function find(text) {
        return Array.from(window.document.querySelectorAll("button")).find(function (node) { return node.textContent === text; });
    }
    function click(text) {
        var control = find(text);
        assert(control, "Missing control: " + text);
        control.click();
    }
    async function backTo(label) {
        for (var i = 0; i < 8 && !find(label); i += 1) {
            window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 10009, bubbles: true }));
            await settle();
        }
        assert(find(label), "Back reaches " + label);
    }
    function count(pattern) { return requests.filter(function (request) { return pattern.test(request.path); }).length; }
    async function settle() {
        for (var i = 0; i < 30; i += 1) { await Promise.resolve(); }
        await new Promise(function (resolve) { realSetTimeout(resolve, 0); });
    }
    function lastTimeline() {
        return requests.filter(function (request) { return request.path === "/:/timeline"; }).pop();
    }

    try {
        window.document.querySelector('input[name="server"]').value = "https://pms.synthetic.invalid";
        click("Connect"); await settle();
        // The Home row's playlist card opens the playlist page (not the library metadata route).
        var card = Array.from(window.document.querySelectorAll(".media-card")).find(function (node) {
            return node.textContent.indexOf("Synthetic Playlist") !== -1;
        });
        assert(card, "The Recent Playlists card is on Home");
        assert.strictEqual(card.getAttribute("data-shape"), "square", "Playlist artwork is square");
        assert(card.textContent.indexOf("3 items") !== -1);
        card.click(); await settle();
        assert.strictEqual(count(/^\/library\/metadata\/500$/), 0);
        assert.strictEqual(window.document.querySelector(".detail-title").textContent, "Synthetic Playlist");
        assert(window.document.querySelector(".detail-cover"), "The page shows the composite picture");
        assert(window.document.querySelector(".detail-meta").textContent.indexOf("3 items") !== -1);
        assert(window.document.querySelector(".detail-meta").textContent.indexOf("5 min") !== -1);
        assert(find("Play") && find("Shuffle") && find("Items"));
        assert(!find("More") && !find("Related titles"), "A playlist has no overflow actions");
        // Back out and find the playlist without the Home row.
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 10009, bubbles: true })); await settle();
        click("Playlists"); await settle();
        assert.strictEqual(window.document.querySelector(".screen h2").textContent, "Playlists");
        var listed = window.document.querySelectorAll(".item-list .media-card");
        assert.strictEqual(listed.length, 1);
        listed[0].click(); await settle();
        // Play: the server builds the queue and the player starts at its first item.
        click("Play"); await settle();
        var created = requests.filter(function (request) { return request.path === "/playQueues"; });
        assert.strictEqual(created.length, 1);
        assert.strictEqual(created[0].query.get("shuffle"), "0");
        assert.strictEqual(created[0].query.get("key"), null);
        assert(created[0].query.get("uri") === null, "The queue is made from the playlist, not one item");
        assert.strictEqual(state, "PLAYING");
        assert(window.document.body.textContent.indexOf("Item 1") !== -1);
        assert.strictEqual(lastTimeline().query.get("playQueueID"), "7");
        assert.strictEqual(lastTimeline().query.get("playQueueItemID"), "10", "Progress is reported against the queue item");
        // The end of an item continues with the next queue item, without making another queue.
        listener.onstreamcompleted(); await settle();
        assert(find("Up Next: Item 2"), "The next playlist item is offered");
        assert.strictEqual(nextTimers.length, 1);
        nextTimers.shift()(); await settle();
        assert.strictEqual(state, "PLAYING");
        assert(window.document.body.textContent.indexOf("Item 2") !== -1);
        assert.strictEqual(count(/^\/playQueues$/), 1, "The playlist continues in the same queue");
        assert.strictEqual(lastTimeline().query.get("playQueueID"), "7");
        assert.strictEqual(lastTimeline().query.get("playQueueItemID"), "11");
        listener.onstreamcompleted(); await settle();
        nextTimers.shift()(); await settle();
        assert.strictEqual(lastTimeline().query.get("playQueueItemID"), "12");
        // The window ended there; the rest of the queue was fetched while the item before played.
        assert.strictEqual(count(/^\/playQueues\/7$/), 1);
        listener.onstreamcompleted(); await settle();
        nextTimers.shift()(); await settle();
        assert(window.document.body.textContent.indexOf("Item 4") !== -1, "The playlist goes on past the first window");
        listener.onstreamcompleted(); await settle();
        nextTimers.shift()(); await settle();
        assert.strictEqual(lastTimeline().query.get("playQueueItemID"), "14");
        listener.onstreamcompleted(); await settle();
        assert(!Array.from(window.document.querySelectorAll("button")).some(function (node) { return /^Up Next/.test(node.textContent); }),
            "The end of the playlist ends playback");
        assert.strictEqual(nextTimers.length, 0);
        // Shuffle asks the server to shuffle.
        await backTo("Playlists");
        click("Playlists"); await settle();
        window.document.querySelector(".item-list .media-card").click(); await settle();
        click("Shuffle"); await settle();
        var shuffled = requests.filter(function (request) { return request.path === "/playQueues"; }).pop();
        assert.strictEqual(shuffled.query.get("shuffle"), "1");
        // Choosing an item plays the playlist from that item.
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 10009, bubbles: true })); await settle(); await settle();
        assert.notStrictEqual(state, "PLAYING", "Back stops the playlist");
        await backTo("Playlists");
        click("Playlists"); await settle();
        window.document.querySelector(".item-list .media-card").click(); await settle();
        click("Items"); await settle();
        var rows = window.document.querySelectorAll(".item-list .media-card");
        assert.strictEqual(rows.length, 3, "The items are listed in order");
        assert(rows[0].textContent.indexOf("Item 1") !== -1 && rows[2].textContent.indexOf("Item 3") !== -1);
        rows[2].click(); await settle();
        var picked = requests.filter(function (request) { return request.path === "/playQueues"; }).pop();
        assert.strictEqual(picked.query.get("key"), "/library/metadata/3");
        assert.strictEqual(picked.query.get("shuffle"), "0");
        assert(window.document.body.textContent.indexOf("Item 3") !== -1);
        assert.strictEqual(lastTimeline().query.get("playQueueItemID"), "12");
        console.log("Tizen playlists: card, page, list, play, shuffle, play from item and continue through the queue: passed");
    } finally { dom.window.close(); }
}
run().catch(function (error) { console.error(error); process.exit(1); });
