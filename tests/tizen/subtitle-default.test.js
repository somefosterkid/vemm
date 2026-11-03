"use strict";
// Plex selects a forced track over audio in its own language, which can be a handful of lines in an episode. Vemm plays
// that selection and writes nothing until the viewer picks another track. The real session runs against a synthetic
// server that behaves as PMS was measured to: it burns the part's selection whatever the URL names, and only
// PUT /library/parts changes that selection.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");

var FORCED = 31;
var FULL = 32;
var english = { streamType: 3, codec: "srt", language: "English", languageTag: "en", languageCode: "eng" };
var film = { ratingKey: "50", type: "movie", title: "Synthetic Film", duration: 100000, summary: "Film text",
    Media: [{ container: "mkv", videoCodec: "h264", audioCodec: "aac", videoResolution: "1080", height: 1080, width: 1920, bitrate: 8000,
        Part: [{ id: "20", key: "/library/parts/20/file.mkv", Stream: [
            { id: 1, streamType: 1, codec: "h264" },
            { id: 2, streamType: 2, codec: "aac", language: "English", languageTag: "en", languageCode: "eng", selected: true },
            Object.assign({ id: FORCED, displayTitle: "English Forced", forced: true, selected: true, index: 3 }, english),
            Object.assign({ id: FULL, displayTitle: "English", index: 4 }, english),
            Object.assign({ id: 33, displayTitle: "English SDH", hearingImpaired: true, index: 5 }, english)
        ] }] }] };
var streams = film.Media[0].Part[0].Stream;

async function run() {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), { url: "https://app.synthetic.invalid", runScripts: "outside-only" });
    var window = dom.window;
    var document = window.document;
    window.TextDecoder = TextDecoder;
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    var requests = [];
    var state = "NONE";
    var realSetTimeout = window.setTimeout.bind(window);
    window.webapis = { avplay: {
        getState: function () { return state; },
        open: function () { state = "IDLE"; }, close: function () { state = "NONE"; }, stop: function () { state = "IDLE"; },
        setDisplayRect: function () {}, setDisplayMethod: function () {}, setListener: function () {},
        prepareAsync: function (success) { state = "READY"; success(); },
        getDuration: function () { return 100000; }, getCurrentTime: function () { return 0; },
        play: function () { state = "PLAYING"; }, pause: function () { state = "PAUSED"; },
        seekTo: function (time, success) { success(); }, setStreamingProperty: function () {},
        getTotalTrackInfo: function () { return []; }, setSelectTrack: function () {}, setSilentSubtitle: function () {}
    } };
    function selectedSubtitle() { return streams.filter(function (stream) { return stream.streamType === 3 && stream.selected; })[0]; }
    window.fetch = function (target, options) {
        var url = new URL(target);
        requests.push({ path: url.pathname, method: options.method, query: url.searchParams });
        var container = null;
        if (url.pathname === "/library/sections") {
            container = { size: 1, Directory: [{ key: "1", type: "movie", title: "Movies" }] };
        } else if (url.pathname === "/hubs/promoted") {
            container = { size: 1, Hub: [{ title: "Recently Added", hubIdentifier: "synthetic", Metadata: [film] }] };
        } else if (url.pathname === "/library/metadata/50") {
            container = { Metadata: [JSON.parse(JSON.stringify(film))] };
        } else if (url.pathname === "/library/parts/20" && options.method === "PUT") {
            var wanted = url.searchParams.get("subtitleStreamID");
            streams.forEach(function (stream) { if (stream.streamType === 3) { stream.selected = String(stream.id) === wanted; } });
            container = {};
        } else if (url.pathname === "/video/:/transcode/universal/decision") {
            var burning = selectedSubtitle();
            var asked = url.searchParams.get("subtitles");
            container = { generalDecisionCode: 1001, Metadata: [{ Media: [{ bitrate: 7000, Part: [{ decision: "transcode", Stream: [{ id: "1", streamType: 1, decision: "transcode" }]
                .concat(burning ? [{ id: String(burning.id), streamType: 3, decision: asked === "burn" ? "burn" : "ignore" }] : []) }] }] }] };
        } else if (["/:/timeline", "/video/:/transcode/universal/stop"].indexOf(url.pathname) !== -1 || /^\/transcode\/sessions\//.test(url.pathname)) {
            container = {};
        } else { return Promise.resolve({ ok: false, status: 404 }); }
        return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ MediaContainer: container }); } });
    };
    var html = fs.readFileSync(path.join(app, "index.html"), "utf8");
    (html.match(/src="(js\/[^"]+|main\.js)"/g) || []).map(function (tag) { return tag.slice(5, -1); }).forEach(function (file) {
        window.eval(fs.readFileSync(path.join(app, file), "utf8"));
    });
    async function settle() {
        for (var round = 0; round < 3; round += 1) {
            for (var i = 0; i < 40; i += 1) { await Promise.resolve(); }
            await new Promise(function (resolve) { realSetTimeout(resolve, 0); });
        }
    }
    function buttons() { return Array.from(document.querySelectorAll("#screen button")); }
    function click(text) {
        var found = buttons().find(function (node) { return node.textContent.trim() === text; });
        assert(found, "Missing control: " + text + " in " + buttons().slice(0, 20).map(function (node) { return node.textContent; }));
        found.click();
    }
    function puts() { return requests.filter(function (request) { return request.method === "PUT" && request.path === "/library/parts/20"; }); }
    function memory() { return JSON.parse(window.localStorage.getItem("vemm-tizen-track-memory") || "[]"); }
    function checked() { return Array.from(document.querySelectorAll('#player-menu button[aria-pressed="true"]')).map(function (node) { return node.textContent.trim(); }); }
    function note() { return document.querySelector("#player-menu .subtitle-partial-note"); }
    async function openFilm() {
        var card = Array.from(document.querySelectorAll(".media-card")).find(function (node) { return node.vemmCard.item.ratingKey === "50"; });
        assert(card, "The film's card is on Home");
        card.click();
        await settle();
    }
    // The Stop key ignores a press within 150 ms of the last.
    async function stopPlaying() {
        await new Promise(function (resolve) { realSetTimeout(resolve, 170); });
        document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 413, bubbles: true, cancelable: true }));
        await settle();
    }
    try {
        document.querySelector('input[name="server"]').value = "https://pms.synthetic.invalid";
        buttons().find(function (node) { return node.textContent === "Connect"; }).click();
        await settle();

        // Plex's selection needs no write, so the details page holds its background start.
        await openFilm();
        assert.strictEqual(state, "READY", "The details page prepares the start");
        assert.strictEqual(puts().length, 0, "Being on the page writes nothing");

        click("Play");
        await settle();
        assert.strictEqual(state, "PLAYING");
        assert.strictEqual(puts().length, 0, "and neither does playing what Plex selected");
        assert.strictEqual(requests.filter(function (request) { return /decision$/.test(request.path); }).pop().query.get("subtitles"), "burn");
        assert.deepStrictEqual(memory(), []);
        click("Subtitles");
        assert.deepStrictEqual(checked(), ["English · Forced"], "The check mark shows what is really playing");
        assert(note(), "The note points at the track with all the dialogue");

        // A pick is one write. Plex keeps it for the file, so a movie needs no memory here and keeps its background start.
        click("English");
        await settle();
        assert.strictEqual(puts().length, 1);
        assert.strictEqual(puts()[0].query.get("subtitleStreamID"), String(FULL));
        assert.deepStrictEqual(memory(), []);
        click("Subtitles");
        assert.deepStrictEqual(checked(), ["English"]);
        assert.strictEqual(note(), null, "All the dialogue needs no explaining");
        await stopPlaying();
        assert.strictEqual(state, "READY", "The next visit prepares its start");
        click("Play");
        await settle();
        assert.strictEqual(puts().length, 1, "and pressing it writes nothing");
        click("Subtitles");
        assert.deepStrictEqual(checked(), ["English"]);

        // Off sticks too.
        click("Subtitles off");
        await settle();
        assert.strictEqual(puts().length, 2);
        assert.strictEqual(puts()[1].query.get("subtitleStreamID"), "0");
        click("Subtitles");
        assert.deepStrictEqual(checked(), ["Subtitles off"]);
        await stopPlaying();
        click("Play");
        await settle();
        assert.strictEqual(puts().length, 2, "Off needs no further write");
        assert.strictEqual(requests.filter(function (request) { return /decision$/.test(request.path); }).pop().query.get("subtitles"), "none");
        click("Subtitles");
        assert.deepStrictEqual(checked(), ["Subtitles off"]);
        await stopPlaying();

        console.log("Tizen forced subtitle default, picks and the background start: passed");
    } finally { dom.window.close(); }
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
