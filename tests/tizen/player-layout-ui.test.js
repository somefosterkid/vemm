"use strict";
// LG-parity player interactions against a synthetic item and a mocked player. No Plex request,
// AVPlay session, timeline update or household account is used.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var JSDOM = require("jsdom").JSDOM;
var root = path.resolve(__dirname, "../..");
var item = {
    ratingKey: "synthetic-episode",
    type: "episode",
    title: "A Synthetic Journey",
    grandparentTitle: "Synthetic Show",
    grandparentThumb: "/library/metadata/show/thumb",
    parentTitle: "Season 2",
    parentIndex: 2,
    index: 4,
    summary: "A synthetic episode used only by this test.",
    year: 2025,
    contentRating: "TV-PG",
    duration: 60000,
    viewOffset: 45000,
    Chapter: [
        { id: 1, index: 0, tag: "Arrival", startTimeOffset: 0, thumb: "/chapter/arrival" },
        { id: 2, index: 1, tag: "Discovery", startTimeOffset: 20000, thumb: "/chapter/discovery" },
        { id: 3, index: 2, tag: "Return", startTimeOffset: 40000, thumb: "/chapter/return" }
    ],
    Marker: [{ id: 9, type: "credits", startTimeOffset: 54000, endTimeOffset: 60000, final: "1" }],
    Media: [{
        container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
        Part: [{ id: 1, key: "/library/parts/synthetic/file", Stream: [
            { id: 11, streamType: 2, language: "English", languageCode: "eng", displayTitle: "English — Stereo", codec: "aac" },
            { id: 12, streamType: 2, language: "English", languageCode: "eng", displayTitle: "English — Commentary", codec: "aac" },
            { id: 13, streamType: 2, language: "French", languageCode: "fra", displayTitle: "French", codec: "aac" },
            { id: 21, streamType: 3, language: "English", languageCode: "eng", displayTitle: "English", codec: "srt" }
        ] }]
    }]
};

function playerFixture(trackOptions) {
    var dom = new JSDOM(fs.readFileSync(path.join(root, "samsung/Vemm/index.html"), "utf8"), {
        url: "https://player.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    Object.defineProperty(window.document, "hidden", { value: false, configurable: true });
    var callbacks = {};
    var adapters = 0;
    var seeks = [];
    var heldSeeks = [];
    var starts = 0;
    var stops = 0;
    var pending = {};
    var plays = 0;
    var pauses = 0;
    var playerSettings = [];
    var saved = [];
    var timers = [];
    var timersNext = 1;
    window.fetch = function () { assert.fail("The player preview must not use the network"); };
    var i18nContext = {};
    vm.runInNewContext(fs.readFileSync(path.join(root, "samsung/Vemm/js/i18n.js"), "utf8"), i18nContext);
    window.VemmI18n = i18nContext.VemmI18n;
    window.VemmPreferences = {
        load: function () { return Object.assign({ quality: "original", nextEpisode: "countdown", language: "en",
            skipInterval: 10, subtitleDelayMs: trackOptions && trackOptions.initialDelay || 0,
            subtitleSize: "medium", subtitlePosition: "low",
            subtitleColor: "white", subtitleBackground: "off", directPlay: "auto", minBuffer: 1,
            skipIntro: "button", skipCredits: "button" }, trackOptions && trackOptions.preferences); },
        save: function (storage, value) { saved.push(JSON.parse(JSON.stringify(value))); },
        bufferSizes: [0.5, 1, 2, 4, 8, 15]
    };
    var memory = { free: 572 };
    if (trackOptions && trackOptions.device) {
        window.VemmDeviceStats = require("../../samsung/Vemm/js/device-stats.js");
        window.tizen = { systeminfo: {
            getTotalMemory: function () { return 1869 * 1048576; },
            getAvailableMemory: function () { return memory.free * 1048576; },
            getPropertyValue: function (name, ok) { ok({ units: [{ type: "INTERNAL", capacity: 4544 * 1048576, availableCapacity: 2236 * 1048576 }] }); }
        } };
    }
    window.VemmSkipMarkers = require("../../samsung/Vemm/js/skip-markers.js");
    window.VemmSubtitles = require("../../samsung/Vemm/js/subtitles.js");
    window.VemmAvplay = { create: function (options) { adapters += 1; callbacks.avplay = options; return {}; } };
    window.VemmPlayback = {
        create: function (options) {
            playerSettings.push(options.settings);
            var state = "idle";
            return {
                start: function () {
                    starts += 1;
                    if (trackOptions && trackOptions.failFirstStart && starts === 1) {
                        return Promise.reject(new Error("Synthetic stream negotiation failure"));
                    }
                    if (trackOptions && trackOptions.pendingStart) {
                        state = "preparing";
                        return new Promise(function (resolve) { pending.start = function () { state = "playing"; resolve(); }; });
                    }
                    state = "playing";
                    return Promise.resolve();
                },
                snapshot: function () { return { state: state, position: 45000, duration: item.duration }; },
                pause: function () { pauses += 1; state = "paused"; return Promise.resolve(); },
                play: function () { plays += 1; state = "playing"; return Promise.resolve(); },
                seek: function (position) {
                    seeks.push(position);
                    if (!(trackOptions && trackOptions.holdSeeks)) { return Promise.resolve(position); }
                    // Like the AVPlay adapter: one seek at a time, settled by the test.
                    if (heldSeeks.some(function (held) { return !held.settled; })) {
                        return Promise.reject(new Error("A seek is already in progress. Wait before seeking again."));
                    }
                    return new Promise(function (resolve, reject) {
                        var held = { position: position, settled: false };
                        held.resolve = function (landed) { held.settled = true; resolve(landed); };
                        held.reject = function (failure) { held.settled = true; reject(failure); };
                        heldSeeks.push(held);
                    });
                },
                stop: function () { stops += 1; state = "idle"; return Promise.resolve(item); },
                buffer: function () { return trackOptions && trackOptions.buffer || null; },
                selection: function () { return { audioId: 11, subtitleId: 21 }; },
                part: function () { return item.Media[0].Part[0]; },
                quality: function () { return { source: item.Media[0], stream: item.Media[0], mode: "direct", limit: "original" }; },
                tracks: function () { return trackOptions && trackOptions.nativeTracks ? [{ type: "AUDIO", index: 0 }] : []; },
                setSubtitleOffset: function (offset) { callbacks.subtitleOffset = offset; }
            };
        }
    };
    var client = {
        nextEpisode: function () {
            return Promise.resolve({ ratingKey: "synthetic-next", type: "episode", title: "Next Synthetic Episode",
                grandparentTitle: "Synthetic Show", parentIndex: 2, index: 5,
                thumb: "/library/metadata/next/thumb" });
        },
        getMetadata: function () { return Promise.resolve({ ratingKey: "synthetic-next", type: "episode", title: "Next Synthetic Episode" }); },
        image: function () { return Promise.reject(new Error("No image request is permitted in this fixture")); }
    };
    var source = fs.readFileSync(path.join(root, "samsung/Vemm/main.js"), "utf8");
    var boot = source.lastIndexOf('    addConnectForm("");');
    assert(boot !== -1, "The app boot boundary remains available to isolated UI tests");
    var playing = trackOptions && trackOptions.markers ? Object.assign({}, item, { Marker: trackOptions.markers }) : item;
    source = source.slice(0, boot) +
        '    startPlayer(' + JSON.stringify(playing) + ', window.__syntheticClient, 45000, 0, ' +
        JSON.stringify(trackOptions || null) + '); }());';
    window.__syntheticClient = client;
    vm.runInNewContext(source, {
        document: window.document,
        window: window,
        navigator: window.navigator,
        console: console,
        Promise: Promise,
        URL: window.URL,
        Blob: window.Blob,
        setTimeout: function (callback, delay) {
            var id = timersNext++;
            timers.push({ id: id, callback: callback, delay: delay, interval: false });
            return id;
        },
        clearTimeout: function (id) { timers.forEach(function (timer) { if (timer.id === id) { timer.callback = null; } }); },
        setInterval: function (callback, delay) {
            var id = timersNext++;
            timers.push({ id: id, callback: callback, delay: delay, interval: true });
            return id;
        },
        clearInterval: function (id) { timers.forEach(function (timer) { if (timer.id === id) { timer.callback = null; } }); }
    });
    function findButton(label, scope) {
        return Array.prototype.slice.call((scope || window.document).querySelectorAll("button")).filter(function (button) {
            return button.textContent.trim() === label;
        })[0] || null;
    }
    function click(label, scope) {
        var control = findButton(label, scope);
        assert(control, "Missing button: " + label);
        control.click();
        return control;
    }
    function key(code, repeat) {
        var event = new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, repeat: !!repeat });
        Object.defineProperty(event, "keyCode", { value: code });
        window.document.dispatchEvent(event);
    }
    async function settle() { for (var i = 0; i < 8; i += 1) { await Promise.resolve(); } }
    // Runs the pending timers of one delay (the 0.4 s seek wait), as the clock would.
    function runTimers(delay) {
        timers.filter(function (timer) { return timer.delay === delay && timer.callback; }).forEach(function (timer) {
            var callback = timer.callback;
            if (!timer.interval) { timer.callback = null; }
            callback();
        });
    }
    return {
        dom: dom, window: window, document: window.document, callbacks: callbacks, seeks: seeks, heldSeeks: heldSeeks,
        starts: function () { return starts; }, plays: function () { return plays; }, pauses: function () { return pauses; },
        stops: function () { return stops; },
        finishStart: function () { pending.start(); },
        adapters: function () { return adapters; },
        playerSettings: playerSettings, timers: timers, saved: saved, memory: memory,
        findButton: findButton, click: click, key: key, settle: settle, runTimers: runTimers
    };
}

async function hudAndPanels() {
    var app = playerFixture();
    try {
        var controls = Array.prototype.slice.call(app.document.querySelectorAll(".playback-controls button"))
            .map(function (button) { return button.textContent.trim(); });
        ["Subtitles", "Audio", "More"].forEach(function (name) {
            assert(controls.indexOf(name) !== -1, "The transport exposes " + name + " directly");
        });
        assert(app.findButton("Info"), "The HUD includes an Info tab");
        assert(app.findButton("Chapters"), "An item with chapter metadata includes a Chapters tab");
        assert(app.document.querySelector(".playback-remaining"), "The HUD shows a negative time-left clock");
        assert(app.document.querySelector(".playback-context").textContent.indexOf("Synthetic Show") !== -1,
            "The episode HUD identifies its show");

        app.click("Info");
        var info = app.document.querySelector("#player-info");
        assert(info && info.textContent.indexOf("Synthetic Show") !== -1, "Info shows playing-item context");
        assert(info.querySelector(".info-artwork"), "Info uses the item's artwork");
        assert(info.textContent.indexOf("TV-PG") !== -1, "Info includes its rating");
        app.callbacks.avplay.onEvent({ type: "time", position: 50000, duration: item.duration });
        assert(info.querySelector(".player-info-position").textContent.indexOf("0:50") !== -1,
            "The Info playback facts follow the live playback position");

        app.click("Chapters");
        var cards = app.document.querySelectorAll("#chapter-strip .chapter-card");
        assert.strictEqual(cards.length, 3, "The chapter strip renders the chapter list");
        assert.strictEqual(cards[1].querySelector("img").getAttribute("data-artwork-source"), "/chapter/discovery",
            "Chapter cards use Plex Chapter.thumb");
        assert(cards[2].textContent.indexOf("00:40") !== -1, "Chapter cards show their timestamps");
    } finally { app.dom.window.close(); }
}

function rowLabels(node) {
    return Array.prototype.map.call(node.querySelectorAll("button"), function (control) { return control.textContent; });
}

async function playerControlsShareOneRow() {
    var app = playerFixture();
    try {
        var doc = app.document;
        assert(!doc.querySelector(".player-tabs"), "Info and Chapters no longer have their own row");
        var row = doc.querySelector(".playback-controls");
        var groups = row.children;
        assert.strictEqual(groups.length, 3, "The control row has three groups");
        assert(/playback-left/.test(groups[0].className) && /playback-center/.test(groups[1].className) &&
            /playback-right/.test(groups[2].className), "Groups are left, center, right in order");
        assert.deepStrictEqual(rowLabels(groups[0]), ["Subtitles", "Audio"]);
        assert.deepStrictEqual(rowLabels(groups[1]), ["Back 10 seconds", "Pause / Play", "Forward 10 seconds", "Chapters"],
            "Chapters sit right of Forward in the center group");
        assert.deepStrictEqual(rowLabels(groups[2]), ["More", "Info"], "Info sits right beside More");

        var info = app.findButton("Info");
        var more = app.findButton("More");
        var chapters = app.findButton("Chapters");
        var forward = app.findButton("Forward 10 seconds");
        forward.focus();
        app.key(39);
        assert.strictEqual(doc.activeElement, chapters, "Right from Forward reaches Chapters");
        app.key(39);
        assert.strictEqual(doc.activeElement, more, "Right from Chapters crosses into the right group");
        app.key(39);
        assert.strictEqual(doc.activeElement, info, "Right from More reaches Info");
        app.key(37);
        assert.strictEqual(doc.activeElement, more, "Left from Info returns to More");
        app.key(37);
        assert.strictEqual(doc.activeElement, chapters, "Left from More crosses back to Chapters");
        app.findButton("Audio").focus();
        app.key(39);
        assert.strictEqual(doc.activeElement, app.findButton("Back 10 seconds"), "Right from Audio crosses into the center group");
        app.key(37);
        assert.strictEqual(doc.activeElement, app.findButton("Audio"), "Left from Back crosses to Audio");
        more.focus();
        app.key(38);
        assert.strictEqual(doc.activeElement.id, "playback-progress", "Up from the row focuses the timeline");
        app.key(40);
        assert.strictEqual(doc.activeElement, more, "Down from the timeline returns to the row");
    } finally { app.dom.window.close(); }
}

async function skipButtonStartsTheRightGroup() {
    var app = playerFixture();
    try {
        app.callbacks.avplay.onEvent({ type: "time", position: 56000, duration: item.duration });
        await app.settle();
        var right = app.document.querySelector(".playback-right");
        var skip = right.querySelector(".skip-marker");
        assert(skip, "The skip button joins the right group");
        assert.strictEqual(right.querySelector("button"), skip, "It comes before More");
        assert.deepStrictEqual(rowLabels(right).slice(1), ["More", "Info"]);
    } finally { app.dom.window.close(); }
}

async function downClosesTheChapterStrip() {
    var app = playerFixture();
    try {
        var doc = app.document;
        app.click("Chapters");
        assert(doc.getElementById("chapter-strip"), "The strip opens");
        assert(doc.getElementById("chapter-strip").contains(doc.activeElement), "Focus enters the strip");
        app.key(40);
        assert(!doc.getElementById("chapter-strip"), "Down closes the strip");
        assert.strictEqual(doc.activeElement, app.findButton("Chapters"), "Focus returns to the Chapters button");
    } finally { app.dom.window.close(); }
}

async function trackMenusAreIndependentAndOnTheLeft() {
    var app = playerFixture();
    try {
        var doc = app.document;
        app.click("More");
        var more = doc.getElementById("player-menu");
        assert(!/Audio|Subtitles/.test(rowLabels(more).join("|")), "More has no track entries");
        app.key(27);
        assert(!doc.getElementById("player-menu"), "Back closes More");

        ["Subtitles", "Audio"].forEach(function (name) {
            var opener = app.findButton(name, doc.querySelector(".playback-left"));
            opener.click();
            var menu = doc.getElementById("player-menu");
            assert(/player-menu-left/.test(menu.className), name + " menu opens on the left");
            var labels = rowLabels(menu);
            assert(labels.indexOf("Playback options") === -1, name + " has no Playback options link");
            assert(labels.indexOf("Audio") === -1 && labels.indexOf("Subtitles") === -1, name + " does not link to the other track menu");
            app.key(27);
            assert(!doc.getElementById("player-menu"), "Back closes the " + name + " menu");
            assert.strictEqual(doc.activeElement, opener, "Back returns focus to " + name);
        });
    } finally { app.dom.window.close(); }
}

async function subItemsAreMarked() {
    var app = playerFixture();
    try {
        app.click("Audio");
        var english = app.findButton("English");
        var other = app.findButton("Other languages");
        assert(/menu-has-sub/.test(english.className), "A language that expands has the indicator class");
        assert(/menu-has-sub/.test(other.className), "Other languages has the indicator class");
        assert(!/menu-sub-item/.test(english.className), "A top-level language is a primary row");
        english.click();
        var track = app.findButton("English — Stereo");
        assert(/menu-sub-item/.test(track.className), "Tracks inside a language are indented sub-items");
        app.key(10009);
        assert(app.findButton("English"), "Back from a language's tracks returns to the languages");
        app.click("Other languages");
        var french = app.findButton("French");
        assert(/menu-sub-item/.test(french.className) && /menu-has-sub/.test(french.className),
            "Languages under Other languages are sub-items that also expand");
    } finally { app.dom.window.close(); }
}

async function deviceTracksAreASubList() {
    var app = playerFixture({ nativeTracks: true });
    try {
        app.click("Audio");
        var device = app.findButton("Device tracks");
        assert(/menu-has-sub/.test(device.className), "Device tracks has the indicator class");
        var nested = app.document.querySelector(".native-tracks button");
        assert(nested && /menu-sub-item/.test(nested.className), "Device track entries are sub-items");
    } finally { app.dom.window.close(); }
}

async function rapidPressesMakeOneSeek() {
    var app = playerFixture({ holdSeeks: true });
    try {
        await app.settle();
        app.click("Back 10 seconds");
        app.click("Back 10 seconds");
        app.click("Back 10 seconds");
        assert.deepStrictEqual(app.seeks, [], "Nothing is sent while the presses keep coming");
        assert.strictEqual(app.document.querySelector(".playback-elapsed").textContent, "0:15", "Each press moves the timeline at once");
        app.runTimers(400);
        assert.deepStrictEqual(app.seeks, [15000], "0.4 s after the last press, one seek goes to the sum of the presses");
        app.click("Back 10 seconds");
        app.click("Back 10 seconds");
        app.runTimers(400);
        await app.settle();
        assert(!app.document.getElementById("playback-error"), "Presses while a seek lands must not raise a playback problem");
        assert.deepStrictEqual(app.seeks, [15000], "AVPlay cannot take a second seek while one lands");
        app.heldSeeks[0].resolve(15000);
        await app.settle();
        assert.deepStrictEqual(app.seeks, [15000, 0], "Only the latest target follows, once the first has landed");
        app.heldSeeks[1].resolve(0);
        await app.settle();
        assert(!app.document.getElementById("playback-error"), "Queued seeks finish without a playback problem");
    } finally { app.dom.window.close(); }
}

async function timedOutSeekClosesItsProblemWhenItLands() {
    var app = playerFixture({ holdSeeks: true });
    try {
        await app.settle();
        app.click("Back 10 seconds");
        app.runTimers(400);
        var timeout = new Error("Samsung playback failed during seek-timeout. Stop and retry this title.");
        timeout.code = "avplay-seek-timeout";
        app.heldSeeks[0].reject(timeout);
        await app.settle();
        assert(app.document.getElementById("playback-error"), "A timed-out seek raises the playback problem");
        app.callbacks.avplay.onEvent({ type: "time", position: 45500, duration: item.duration });
        assert(app.document.getElementById("playback-error"), "Ordinary playback at the old spot keeps the problem open");
        app.callbacks.avplay.onEvent({ type: "time", position: 35000, duration: item.duration });
        assert(!app.document.getElementById("playback-error"), "The problem closes once the late seek lands");
    } finally { app.dom.window.close(); }
}

async function upNextAndTracks() {
    var app = playerFixture();
    try {
        app.callbacks.avplay.onEvent({ type: "time", position: 56000, duration: item.duration });
        await app.settle();
        assert(app.document.querySelector(".up-next-card"), "Final credits reveal the Up Next card");
        assert(app.findButton("Watch Credits"), "The viewer can choose to watch credits");
        assert(app.findButton("Next Episode"), "The next-episode action is explicit");
        assert(app.document.querySelector(".up-next-countdown"), "Up Next shows its countdown");

        app.click("Audio");
        assert(app.findButton("English"), "Tracks open on a language-selection step");
        assert(app.findButton("Other languages"), "Other languages remain discoverable");
        assert(app.findButton("Subtitles off"), "Subtitles off is available from the menu");
        app.click("English");
        assert(app.findButton("English — Stereo"), "A language step lists tracks within that language");
        assert(!app.findButton("Back to languages") && !app.findButton("Close menu"), "Back is the remote's job");
        app.key(10009);
        app.click("Other languages");
        assert(app.findButton("French"), "Other languages opens the remaining language choices");
        app.click("French");
        assert(app.findButton("French"), "The selected language step lists its matching track");
    } finally { app.dom.window.close(); }
}

async function timingStatsAndErrors() {
    var app = playerFixture({ cues: [
        { start: 44000, end: 44999, text: "Earlier cue" },
        { start: 45000, end: 46000, text: "Current cue" }
    ] });
    try {
        app.callbacks.avplay.onEvent({ type: "time", position: 45000, duration: item.duration });
        assert.strictEqual(app.document.getElementById("subtitle-text").textContent, "Current cue");
        app.click("Subtitles");
        app.click("Subtitle timing");
        var timing = app.document.querySelector(".subtitle-timing");
        assert(timing, "Subtitle timing opens a live on-screen capsule");
        var before = timing.textContent;
        app.key(39);
        assert.notStrictEqual(timing.textContent, before, "RIGHT changes the subtitle offset live");
        assert.strictEqual(timing.querySelector(".subtitle-timing-value").textContent, "+0.1 s",
            "A fresh LG timing key advances exactly 100 ms");
        assert.strictEqual(app.document.getElementById("subtitle-text").textContent, "Earlier cue",
            "The live delay immediately changes the rendered text subtitle");
        for (var repeat = 0; repeat < 8; repeat += 1) { app.key(39, true); }
        assert.strictEqual(timing.querySelector(".subtitle-timing-value").textContent, "+1.3 s",
            "The eighth held repeat advances by the LG 500 ms fast step");
        app.key(13);
        assert(!app.document.querySelector(".subtitle-timing"), "OK closes subtitle timing");

        app.click("More");
        app.click("Stats for nerds");
        assert(app.document.querySelector(".playback-stats"), "Stats for nerds opens a playback overlay");
        app.callbacks.avplay.onEvent({ type: "time", position: 51000, duration: item.duration });
        assert(app.document.querySelector(".playback-stats-position").textContent.indexOf("0:51") !== -1,
            "Stats follow the live playback position");

        app.callbacks.avplay.onEvent({ type: "error", detail: "Synthetic decoder failure" });
        var error = app.document.querySelector(".playback-error");
        assert(error, "A playback error owns a recovery panel");
        assert(error.querySelectorAll("button").length > 0, "The recovery panel offers actionable controls");
        assert(Array.prototype.some.call(error.querySelectorAll("button"), function (button) {
            return /back/i.test(button.textContent);
        }), "The recovery panel always offers Back");
    } finally { app.dom.window.close(); }
}

async function subtitleTimingUsesTrackBounds() {
    var sidecar = playerFixture({ cues: [], subtitleSidecar: true, initialDelay: 60000 });
    try {
        sidecar.click("Subtitles");
        sidecar.click("Subtitle timing");
        sidecar.key(39);
        assert.strictEqual(sidecar.document.querySelector(".subtitle-timing-value").textContent, "+60.0 s",
            "Sidecar timing clamps at the LG +60 s bound");
        sidecar.key(37);
        assert.strictEqual(sidecar.document.querySelector(".subtitle-timing-value").textContent, "+59.9 s",
            "Sidecar timing can move earlier by one 100 ms step");
    } finally { sidecar.dom.window.close(); }

    var sidecarMinimum = playerFixture({ cues: [], subtitleSidecar: true, initialDelay: -60000 });
    try {
        sidecarMinimum.click("Subtitles");
        sidecarMinimum.click("Subtitle timing");
        sidecarMinimum.key(37);
        assert.strictEqual(sidecarMinimum.document.querySelector(".subtitle-timing-value").textContent, "-60.0 s",
            "Sidecar timing clamps at the LG -60 s bound");
        sidecarMinimum.key(39);
        assert.strictEqual(sidecarMinimum.document.querySelector(".subtitle-timing-value").textContent, "-59.9 s",
            "Sidecar timing can move later by one 100 ms step");
    } finally { sidecarMinimum.dom.window.close(); }

    var embedded = playerFixture({ cues: [], subtitleSidecar: false, initialDelay: 0 });
    try {
        embedded.click("Subtitles");
        embedded.click("Subtitle timing");
        embedded.key(37);
        assert.strictEqual(embedded.document.querySelector(".subtitle-timing-value").textContent, "0.0 s",
            "Embedded text subtitles cannot advance before their not-yet-read cues");
    } finally { embedded.dom.window.close(); }
}

async function subtitleTimingZeroDetentAndTrackAvailability() {
    var sidecar = playerFixture({ cues: [], subtitleSidecar: true, initialDelay: 100 });
    try {
        sidecar.click("Subtitles");
        sidecar.click("Subtitle timing");
        for (var repeat = 0; repeat < 8; repeat += 1) { sidecar.key(37, true); }
        assert.strictEqual(sidecar.document.querySelector(".subtitle-timing-value").textContent, "0.0 s",
            "The held-key sweep detents at zero rather than crossing immediately");
        sidecar.key(37);
        assert.strictEqual(sidecar.document.querySelector(".subtitle-timing-value").textContent, "-0.1 s",
            "A fresh press passes through the zero detent");
    } finally { sidecar.dom.window.close(); }

    var native = playerFixture({ cues: null, subtitleId: 21 });
    try {
        native.click("Subtitles");
        assert.strictEqual(native.findButton("Subtitle timing"), null,
            "Device-native subtitles are not offered a live app-overlay timing control");
        native.click("More");
        assert.strictEqual(native.findButton("Subtitle timing"), null,
            "Device-native subtitle timing is also absent from the More menu");
    } finally { native.dom.window.close(); }
}

async function failedPlayerRecoveryRestartsThePipeline() {
    var app = playerFixture({ cues: [], subtitleSidecar: true, audioId: 11, subtitleId: 21, failFirstStart: true });
    try {
        await app.settle();
        assert(app.document.querySelector(".playback-error"), "A failed startup offers recovery");
        app.click("Retry playback");
        await app.settle();
        assert.strictEqual(app.starts(), 2, "Retry creates and starts a fresh player pipeline");
        assert.strictEqual(app.plays(), 0, "Retry does not call play on the failed AVPlay instance");
        assert.strictEqual(app.playerSettings[1].audioId, 11, "Retry preserves the selected audio stream");
        assert.strictEqual(app.playerSettings[1].subtitleId, 21, "Retry preserves the selected subtitle stream");
        assert.strictEqual(app.playerSettings[1].offset, 45000, "Retry preserves the failed session position");
        assert.strictEqual(app.adapters(), 2, "Retry allocates a fresh AVPlay adapter");
        assert.strictEqual(app.playerSettings[1].subtitleSidecar, true, "Retry preserves sidecar identity");
        app.callbacks.avplay.onEvent({ type: "error", detail: "Synthetic decoder failure" });
        app.click("Restart");
        await app.settle();
        assert.strictEqual(app.starts(), 3, "Restart also resolves and starts a fresh pipeline");
        assert.strictEqual(app.playerSettings[2].offset, 0, "Restart starts the fresh pipeline at zero");
        assert.strictEqual(app.playerSettings[2].audioId, 11, "Restart preserves explicit audio selection");
        assert.strictEqual(app.playerSettings[2].subtitleId, 21, "Restart preserves explicit subtitle selection");
        assert.strictEqual(app.adapters(), 3, "Restart allocates another fresh AVPlay adapter");
    } finally { app.dom.window.close(); }
}

async function bufferingShowsPercent() {
    var app = playerFixture();
    try {
        var status = app.document.getElementById("status");
        var send = function (type, detail) {
            app.callbacks.avplay.onEvent({ type: type, detail: detail, position: 45000, duration: item.duration });
        };
        var ring = function () { return app.document.querySelector(".buffering-ring"); };
        var percent = function () { return ring().querySelector(".buffering-percent").textContent; };
        var spinning = function () { return !!ring() && /buffering-spinner/.test(ring().className) && percent() === ""; };
        var time = function (position) {
            app.callbacks.avplay.onEvent({ type: "time", position: position, duration: item.duration });
        };
        assert(spinning(), "Playback starts behind a spinner, not a percent");
        assert.strictEqual(status.textContent, "", "No status bar while Plex prepares the stream");
        assert.strictEqual(app.document.querySelector(".playback-elapsed").textContent, "0:45",
            "The clock shows where playback resumes, not a preparing message");
        // AVPlay fills once while preparing and again after the resume seek: neither shows a percent.
        send("buffering", true);
        send("buffer-progress", 34);
        assert(spinning(), "A start-up fill does not jump the ring to a percent");
        send("buffering", false);
        assert(spinning(), "The spinner stays through the resume seek");
        await app.settle();
        time(45000);
        assert(spinning(), "Started but not moving yet");
        time(45500);
        assert(!ring(), "The spinner goes once the picture moves");
        send("buffering", true);
        assert(ring(), "Buffering shows the centered ring");
        assert(status.textContent.indexOf("Buffering") === -1, "The status bar does not repeat the buffering text");
        send("buffer-progress", 42);
        assert(spinning(), "The first 3 s of a wait only spin, with no percent");
        app.runTimers(3000);
        assert.strictEqual(percent(), "42%", "A longer wait shows AVPlay's percent");
        send("buffer-progress", 50);
        assert.strictEqual(percent(), "50%");
        send("buffer-progress", 250);
        assert.strictEqual(percent(), "100%", "The percent is clamped to 100");
        send("buffer-progress", -3);
        assert.strictEqual(percent(), "0%", "The percent is clamped to 0");
        var hud = app.document.querySelector(".player-hud");
        hud.hidden = true;
        assert(ring() && !hud.contains(ring()), "The ring shows whether or not the HUD is visible");
        send("buffering", false);
        assert(!ring(), "The ring goes away when buffering completes");
        send("buffer-progress", 60);
        assert(!ring(), "A late progress event after completion shows nothing");
        send("buffering", true);
        app.runTimers(3000);
        assert.strictEqual(percent(), "0%", "A wait with no progress yet shows 0% after 3 s");
        send("buffering", false);
        send("buffering", true);
        send("buffer-progress", 80);
        assert(spinning(), "Every new wait spins for its own first 3 s");
        send("buffering", false);
    } finally { app.dom.window.close(); }
}

async function bufferSizeIsChosenFromMoreAndRestartsTheStream() {
    var app = playerFixture();
    try {
        await app.settle();
        assert.strictEqual(app.playerSettings[0].minBuffer, 1, "1 s is the default minimum buffer");
        app.click("More");
        var entry = app.click("Minimum buffer: 1 s");
        var menu = app.document.getElementById("player-menu");
        assert.deepStrictEqual(rowLabels(menu), ["0.5 s", "1 s", "2 s", "4 s", "8 s", "15 s"],
            "The choices, shortest first, with no close or return buttons");
        assert(!menu.querySelector(".help-text"), "No description and, at the default, no warning");
        assert.strictEqual(app.document.activeElement, app.findButton("1 s"), "Focus starts on the chosen value");
        app.key(10009);
        assert.strictEqual(app.document.querySelector("#player-menu h2").textContent, "Playback options", "Back returns to More");
        assert.strictEqual(app.document.activeElement.textContent, entry.textContent, "on the entry the submenu came from");
        app.click("Minimum buffer: 1 s");
        app.click("0.5 s");
        await app.settle();
        assert.strictEqual(app.saved[app.saved.length - 1].minBuffer, 0.5, "The choice is saved");
        assert.strictEqual(app.starts(), 2, "The stream restarts so the choice applies now");
        assert.strictEqual(app.playerSettings[1].minBuffer, 0.5, "The new pipeline receives the minimum buffer");
        assert.strictEqual(app.playerSettings[1].offset, 45000, "The restart resumes at the current position");
        app.click("More");
        entry = app.click("Minimum buffer: 0.5 s");
        assert(entry.textContent.length < 24, "The More entry stays short enough for one line");
        assert(!app.document.querySelector("#player-menu .help-text"), "0.5 s is an ordinary choice, with no warning");
        app.key(10009);
        app.click("Minimum buffer: 0.5 s");
        app.click("4 s");
        await app.settle();
        app.click("More");
        app.click("Minimum buffer: 4 s");
        assert.strictEqual(app.document.querySelector("#player-menu .help-text").textContent, "Every start and seek waits this long.",
            "A longer wait than the default carries a one-line note");
    } finally { app.dom.window.close(); }
}

async function moreMenuOrder() {
    var app = playerFixture();
    try {
        await app.settle();
        app.click("More");
        assert.deepStrictEqual(rowLabels(app.document.getElementById("player-menu")), ["Quality and version", "Minimum buffer: 1 s",
            "Intro and credits", "Stop and return to details", "Stats for nerds"],
            "Quality first, stats last; no Markers, Info (the HUD has its own) or Close menu");
        app.key(10009);
        assert(!app.document.getElementById("player-menu"), "Back closes More");
        assert.strictEqual(app.document.activeElement, app.findButton("More"), "and returns to the More button");
    } finally { app.dom.window.close(); }
}

async function seeksShowTheTargetAndNoStatus() {
    var app = playerFixture({ holdSeeks: true, pendingStart: true });
    try {
        var status = app.document.getElementById("status");
        app.click("Back 10 seconds");
        app.runTimers(400);
        assert.deepStrictEqual(app.seeks, [], "No seek before playback has started");
        assert(!app.document.getElementById("playback-error"), "An early press is not a playback problem");
        app.finishStart();
        await app.settle();
        app.callbacks.avplay.onEvent({ type: "time", position: 45500, duration: item.duration });
        var knob = app.document.querySelector(".playback-knob-track");
        assert.strictEqual(knob.style.transform, "translateX(" + 45500 / 600 + "%)", "The scrubber follows the playhead");
        assert(/scaleX\(0\.758/.test(app.document.querySelector(".playback-progress-fill").style.transform),
            "The fill scales instead of changing width");
        app.click("Back 10 seconds");
        assert.strictEqual(app.document.querySelector(".playback-elapsed").textContent, "0:35", "The clock jumps to the target at once");
        app.runTimers(400);
        assert(/buffering-spinner/.test(app.document.querySelector(".buffering-ring").className), "A spinner shows while the seek lands");
        app.callbacks.avplay.onEvent({ type: "time", position: 45600, duration: item.duration });
        assert.strictEqual(app.document.querySelector(".playback-elapsed").textContent, "0:35",
            "Playback ticks during the seek do not pull the timeline back");
        app.heldSeeks[0].resolve(34000);
        await app.settle();
        assert.strictEqual(app.document.querySelector(".playback-elapsed").textContent, "0:34", "The clock shows where it landed");
        assert(!app.document.querySelector(".buffering-ring"), "The spinner goes when the seek lands");
        assert.strictEqual(status.textContent, "", "No 'Seek landed' status bar");
    } finally { app.dom.window.close(); }
}

// AVPlay cannot pause before the picture moves (it throws right after play()), so Pause / Play during a start or a
// seek only records the choice, which applies once the picture moves.
async function pauseWaitsForThePicture() {
    var app = playerFixture({ holdSeeks: true, pendingStart: true });
    try {
        var control = app.findButton("Pause / Play");
        app.click("Pause / Play");
        await app.settle();
        assert(!app.document.getElementById("playback-error"), "Pause while the stream starts is not a playback problem");
        assert.strictEqual(app.pauses(), 0, "Nothing is paused before the picture moves");
        assert(/menu-icon-play/.test(control.className), "The control shows that it will be paused");
        app.key(415);
        assert(/menu-icon-pause/.test(control.className), "The Play key takes it back");
        app.click("Pause / Play");
        assert(/menu-icon-play/.test(control.className), "and Pause / Play asks again");
        app.finishStart();
        await app.settle();
        assert.strictEqual(app.pauses(), 0, "Started is not moving yet");
        app.callbacks.avplay.onEvent({ type: "time", position: 45500, duration: item.duration });
        await app.settle();
        assert.strictEqual(app.pauses(), 1, "The picture moving applies the pause");
        app.click("Pause / Play");
        await app.settle();
        assert.strictEqual(app.plays(), 1, "after which Pause / Play acts at once");
        app.click("Forward 10 seconds");
        app.runTimers(400);
        assert.strictEqual(app.seeks.length, 1);
        app.click("Pause / Play");
        await app.settle();
        assert.strictEqual(app.pauses(), 1, "A press while a seek lands waits for it");
        app.heldSeeks[0].resolve(55000);
        await app.settle();
        assert.strictEqual(app.pauses(), 2, "and pauses once it has landed");
        assert(!app.document.getElementById("playback-error"));
    } finally { app.dom.window.close(); }
}

async function introAndCreditsModes() {
    var intro = [{ id: 1, type: "intro", startTimeOffset: 46000, endTimeOffset: 52000 },
        { id: 9, type: "credits", startTimeOffset: 54000, endTimeOffset: 60000, final: "1" }];
    var app = playerFixture({ markers: intro, preferences: { skipIntro: "auto", skipCredits: "off" } });
    try {
        await app.settle();
        app.callbacks.avplay.onEvent({ type: "time", position: 46500, duration: item.duration });
        await app.settle();
        assert.deepStrictEqual(app.seeks, [52000], "Skip automatically jumps past the intro");
        assert(!app.document.querySelector(".skip-marker"), "No Skip button when skipping automatically");
        app.callbacks.avplay.onEvent({ type: "time", position: 47000, duration: item.duration });
        await app.settle();
        assert.deepStrictEqual(app.seeks, [52000], "An intro is skipped once");
        app.callbacks.avplay.onEvent({ type: "time", position: 56000, duration: item.duration });
        await app.settle();
        assert(!app.document.querySelector(".skip-marker") && !app.document.querySelector(".up-next-card"),
            "Credits set to Off show neither Skip nor the countdown");
        assert.strictEqual(app.stops(), 0, "Off never finishes the episode early");
    } finally { app.dom.window.close(); }

    app = playerFixture({ markers: intro });
    try {
        await app.settle();
        app.click("More");
        app.click("Intro and credits");
        var menu = app.document.getElementById("player-menu");
        assert(menu.textContent.indexOf("Synthetic Show") !== -1, "The choice is for the show, not one episode");
        assert.strictEqual(app.findButton("Default (Show Skip button)").getAttribute("aria-pressed"), "true", "A title starts on the TV's default");
        var rows = Array.prototype.filter.call(menu.querySelectorAll("button"), function (row) { return row.textContent === "Skip automatically"; });
        rows[0].click();
        assert(app.document.activeElement.textContent === "Skip automatically" && app.document.activeElement.getAttribute("aria-pressed") === "true", "Focus stays on the choice, now marked");
        var saved = JSON.parse(app.window.localStorage.getItem("vemm-tizen-skip-overrides"));
        assert.deepStrictEqual(saved[Object.keys(saved)[0]], { intro: "auto" }, "Stored on the TV under vemm-tizen-");
        app.key(27);
        app.key(27);
        app.callbacks.avplay.onEvent({ type: "time", position: 46500, duration: item.duration });
        await app.settle();
        assert.deepStrictEqual(app.seeks, [52000], "The show's own choice applies");
        app.callbacks.avplay.onEvent({ type: "time", position: 56000, duration: item.duration });
        assert(app.document.querySelector(".skip-marker"), "Credits still follow the default Skip button");
    } finally { app.dom.window.close(); }
}

async function upFromProgressHidesTheHud() {
    var app = playerFixture();
    try {
        var hud = app.document.querySelector(".player-hud");
        var shell = app.document.querySelector(".app-shell");
        var progress = app.document.getElementById("playback-progress");
        progress.focus();
        app.key(37);
        assert.strictEqual(app.document.activeElement, progress, "Left on the progress bar scrubs and keeps focus");
        app.key(40);
        assert.notStrictEqual(app.document.activeElement, progress, "Down returns to the controls");
        assert(app.document.querySelector(".playback-controls").contains(app.document.activeElement));
        app.key(38);
        assert.strictEqual(app.document.activeElement, progress, "Up from the controls reaches the progress bar");
        assert(!hud.hidden, "Reaching the progress bar keeps the HUD");
        app.key(38);
        assert(hud.hidden, "Up on the top-most element hides the HUD");
        assert(shell.classList.contains("hud-hidden"), "The shell gets hud-hidden like the auto-hide");
        assert(!hud.contains(app.document.activeElement), "No HUD control keeps focus");
        app.key(38);
        assert(!hud.hidden, "The next key press restores the HUD");
        assert(!shell.classList.contains("hud-hidden"));
        assert.strictEqual(app.document.activeElement, progress, "Focus returns to where it was");
    } finally { app.dom.window.close(); }
}

async function deviceReadoutsRefreshOnlyWhileOpen() {
    var app = playerFixture({ device: true });
    try {
        function refreshers() {
            return app.timers.filter(function (timer) {
                return timer.interval && timer.callback && timer.delay >= 2000 && timer.delay <= 3000;
            });
        }
        var before = refreshers().length;
        app.click("More");
        app.click("Stats for nerds");
        var stats = app.document.getElementById("playback-stats");
        assert(stats.textContent.indexOf("TV memory: 572 MB free of 1,869 MB") !== -1, "Stats show the TV memory");
        assert(stats.textContent.indexOf("TV storage: 2.2 GB free of 4.4 GB") !== -1, "Stats show the TV storage");
        assert.strictEqual(refreshers().length, before + 1, "Opening the panel starts one 2-3 s refresh");
        app.memory.free = 300;
        refreshers()[0].callback();
        await app.settle();
        assert(stats.textContent.indexOf("TV memory: 300 MB free of 1,869 MB") !== -1, "The refresh updates the readout");
        assert.strictEqual(stats.querySelectorAll(".playback-stats-device p").length, 2, "Lines are replaced, not added");
        app.click("Close");
        assert.strictEqual(refreshers().length, before, "Closing the panel stops the refresh");

        app.click("More");
        app.click("Stats for nerds");
        assert.strictEqual(refreshers().length, before + 1, "Reopening starts it again");
        app.key(10009);
        assert(!app.document.getElementById("playback-stats"));
        assert.strictEqual(refreshers().length, before, "Back closes the panel and stops the refresh");

        app.click("More");
        app.click("Stats for nerds");
        var pending = refreshers()[0];
        app.window.document.getElementById("playback-stats").parentNode.removeChild(app.window.document.getElementById("playback-stats"));
        pending.callback();
        await app.settle();
        assert.strictEqual(refreshers().length, before, "A refresh that finds no panel stops itself");
    } finally { app.dom.window.close(); }
}

async function noDeviceApisShowNoReadout() {
    var app = playerFixture();
    try {
        app.click("More");
        app.click("Stats for nerds");
        assert(app.document.getElementById("playback-stats"));
        assert(app.document.getElementById("playback-stats").textContent.indexOf("TV memory") === -1);
        assert(app.document.getElementById("playback-stats").textContent.indexOf("Playback:") !== -1);
    } finally { app.dom.window.close(); }
}

async function run() {
    await bufferingShowsPercent();
    await bufferSizeIsChosenFromMoreAndRestartsTheStream();
    await moreMenuOrder();
    await seeksShowTheTargetAndNoStatus();
    await pauseWaitsForThePicture();
    await introAndCreditsModes();
    await upFromProgressHidesTheHud();
    await hudAndPanels();
    await playerControlsShareOneRow();
    await skipButtonStartsTheRightGroup();
    await downClosesTheChapterStrip();
    await trackMenusAreIndependentAndOnTheLeft();
    await subItemsAreMarked();
    await deviceTracksAreASubList();
    await rapidPressesMakeOneSeek();
    await timedOutSeekClosesItsProblemWhenItLands();
    await upNextAndTracks();
    await timingStatsAndErrors();
    await subtitleTimingUsesTrackBounds();
    await subtitleTimingZeroDetentAndTrackAvailability();
    await failedPlayerRecoveryRestartsThePipeline();
    await deviceReadoutsRefreshOnlyWhileOpen();
    await noDeviceApisShowNoReadout();
    console.log("Tizen LG-style player HUD, panels, Up Next, tracks, timing, stats and recovery: passed (synthetic player)");
}
run().catch(function (error) { console.error(error.stack || error); process.exitCode = 1; });
