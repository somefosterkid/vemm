"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");

var LINK = "http://lists.invalid:8080/get.php?username=alice&password=Hunter2";
var SECRETS = ["alice", "Hunter2", "lists.invalid", "streams.invalid"];

function playlistText() {
    var lines = ["#EXTM3U"];
    function channel(name, group, id) {
        lines.push('#EXTINF:-1 tvg-logo="http://img.invalid/' + id + '.png" group-title="' + group + '",' + name);
        lines.push("http://streams.invalid/live/alice/Hunter2/" + id + ".ts");
    }
    channel("Alpha", "News", "a");
    channel("Beta", "News", "b");
    channel("Dead Channel", "News", "dead");
    for (var i = 0; i < 2500; i += 1) { channel("Big " + i, "Big", "big" + i); }
    return lines.join("\r\n");
}

async function run() {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only", pretendToBeVisual: true
    });
    var window = dom.window;
    window.TextDecoder = TextDecoder;
    var realSetTimeout = window.setTimeout.bind(window);
    var plexPaths = [];
    var opened = [];
    var closed = 0;
    var state = "NONE";
    var listener;
    window.webapis = { avplay: {
        getState: function () { return state; }, open: function (url) { state = "IDLE"; opened.push(url); },
        close: function () { state = "NONE"; closed += 1; }, stop: function () { state = "IDLE"; },
        setDisplayRect: function () {}, setDisplayMethod: function () {}, setListener: function (value) { listener = value; },
        setBufferingParam: function () {},
        prepareAsync: function (success, failure) {
            if (/dead/.test(opened[opened.length - 1])) { failure({ name: "PLAYER_ERROR_NOT_SUPPORTED_FILE" }); return; }
            state = "READY"; success();
        },
        getDuration: function () { return 0; }, getCurrentTime: function () { return 0; },
        play: function () { state = "PLAYING"; }, pause: function () {}, seekTo: function () {},
        setStreamingProperty: function () {}, getTotalTrackInfo: function () { return []; },
        setSelectTrack: function () {}, setSilentSubtitle: function () {}
    } };
    window.fetch = function (target) {
        var url = new URL(target);
        plexPaths.push(url.pathname);
        var container = { Hub: [] };
        if (url.pathname === "/identity") { container = { machineIdentifier: "synthetic-machine" }; }
        else if (url.pathname === "/library/sections") { container = { Directory: [{ key: "1", type: "movie", title: "Movies" }] }; }
        return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ MediaContainer: container }); } });
    };
    var playlistRequests = [];
    var playlistOutcome = "ok";
    window.XMLHttpRequest = function () {
        var request = {
            open: function (method, url) { request.url = url; playlistRequests.push({ url: url, headers: 0 }); },
            setRequestHeader: function () { playlistRequests[playlistRequests.length - 1].headers += 1; },
            abort: function () {},
            send: function () {
                realSetTimeout(function () {
                    if (playlistOutcome === "blocked") { request.onerror(); return; }
                    request.status = 200;
                    request.responseText = playlistText();
                    request.onload();
                }, 0);
            }
        };
        return request;
    };
    ["js/plex-api.js", "js/avplay.js", "js/playback.js", "js/subtitles.js", "js/preferences.js", "js/session.js", "js/recents.js",
        "js/home-hero.js", "js/item-menu.js", "js/episodes.js", "js/skip-markers.js", "js/account-preferences.js", "js/track-menu.js",
        "js/file-info.js", "js/search-ui.js", "js/preload.js", "js/reconnect.js", "js/iptv.js", "js/dev-mode.js", "js/i18n.js", "main.js"].forEach(function (file) {
        window.eval(fs.readFileSync(path.join(app, file), "utf8"));
    });
    function find(text) {
        return Array.from(window.document.querySelectorAll("button")).find(function (node) { return node.textContent === text; });
    }
    function rowOf(label) {
        return Array.from(window.document.querySelectorAll("button")).find(function (node) { return node.textContent.indexOf(label + ": ") === 0; });
    }
    function click(text) {
        var control = find(text);
        assert(control, "Missing control: " + text);
        control.click();
    }
    async function settle() {
        for (var i = 0; i < 30; i += 1) { await Promise.resolve(); }
        await new Promise(function (resolve) { realSetTimeout(resolve, 5); });
    }
    function key(code, character) {
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: code, key: character || "", bubbles: true, cancelable: true }));
    }
    async function back() { key(10009); await settle(); }
    function pageText() { return window.document.body.textContent + window.document.body.innerHTML; }
    function assertNoSecret(where) {
        SECRETS.forEach(function (secret) {
            assert(pageText().indexOf(secret) === -1, "The page shows no part of the link or a channel address " + where + ": " + secret);
        });
    }

    window.localStorage.setItem("vemm-tizen-dev-mode", "1");
    window.document.querySelector('input[name="server"]').value = "https://pms.synthetic.invalid";
    click("Connect"); await settle();
    assert(!find("Live TV"), "Without a playlist nothing changes in the navigation");

    // Settings: the Live TV entry takes the link with the built-in keyboard.
    click("Settings"); await settle();
    click("Live TV"); await settle();
    var row = rowOf("Playlist link");
    assert(row, "Settings has a Playlist link row");
    assert(row.textContent.indexOf("Not set") !== -1);
    row.click(); await settle();
    assert(window.document.querySelector(".search-keyboard"), "The built-in keyboard opens");
    click("Save link"); await settle();
    assert(find("Save link"), "An empty link is not saved");
    assert.strictEqual(window.localStorage.getItem("vemm-tizen-iptv-source"), null);
    LINK.split("").forEach(function (character) { key(0, character); });
    var display = window.document.querySelector(".keyboard-text").textContent;
    assert(display.length <= 61 && display.charAt(0) === "…", "A long link shows its last characters");
    click("Save link"); await settle();
    assert.strictEqual(window.localStorage.getItem("vemm-tizen-iptv-source"), LINK);
    assert(rowOf("Playlist link").textContent.indexOf("Set") !== -1 && !/lists\.invalid/.test(rowOf("Playlist link").textContent),
        "Settings says the link is set without showing it");
    assert(find("Remove playlist link"));

    // The navigation now has Live TV.
    await back(); await back();
    var live = find("Live TV");
    assert(live, "Live TV joins the navigation once a link is set");

    // A playlist the provider will not let the app read says so, with a way to retry.
    playlistOutcome = "blocked";
    live.click(); await settle();
    assert(window.document.getElementById("status").textContent.indexOf("could not be read") !== -1);
    assertNoSecret("after a failed load");
    assert(find("Retry"), "A failed load offers Retry");
    playlistOutcome = "ok";
    find("Retry").click(); await settle(); await settle();
    assert.strictEqual(playlistRequests[playlistRequests.length - 1].url, LINK);
    assert.strictEqual(playlistRequests[playlistRequests.length - 1].headers, 0, "No headers, so no preflight");
    var groups = Array.from(window.document.querySelectorAll(".menu-list button")).map(function (node) { return node.textContent; });
    assert.deepStrictEqual(groups.map(function (text) { return text.replace(/\s*:\s*/, " | "); }),
        ["News | 3", "Big 1–1000 | 1000", "Big 1001–2000 | 1000", "Big 2001–2500 | 500"]);

    // A big group draws a few cards, and more as focus nears the end.
    Array.from(window.document.querySelectorAll(".menu-list button"))[1].click(); await settle();
    var cards = window.document.querySelectorAll("#item-list .media-card");
    assert.strictEqual(cards.length, 60, "Only the first 60 of 1000 are drawn");
    assert.strictEqual(cards[0].getAttribute("data-shape"), "square");
    cards[20].focus(); await settle();
    assert.strictEqual(window.document.querySelectorAll("#item-list .media-card").length, 60, "Not near the end yet");
    cards[35].focus(); await settle();
    assert.strictEqual(window.document.querySelectorAll("#item-list .media-card").length, 120, "Focus near the end draws the next 60");
    assertNoSecret("in the channel list");
    await back();

    // Play a channel: AVPlay opens the address, nothing goes to Plex, and it says Live.
    Array.from(window.document.querySelectorAll(".menu-list button"))[0].click(); await settle();
    var plexBefore = plexPaths.length;
    var channelCards = window.document.querySelectorAll("#item-list .media-card");
    assert.strictEqual(channelCards.length, 3);
    channelCards[0].click(); await settle();
    assert.strictEqual(opened[opened.length - 1], "http://streams.invalid/live/alice/Hunter2/a.ts");
    assert.strictEqual(window.document.body.className, "playing");
    assert.strictEqual(window.document.querySelector(".player-hud h2").textContent, "Alpha");
    assert.strictEqual(window.document.querySelector(".playback-live").textContent, "Live");
    assert(!window.document.querySelector(".playback-progress"), "A live channel has no timeline to seek");
    assertNoSecret("while playing");
    listener.oncurrentplaytime(1000); await settle();
    key(38); await settle();
    assert.strictEqual(opened[opened.length - 1], "http://streams.invalid/live/alice/Hunter2/b.ts", "Up is the next channel");
    assert.strictEqual(window.document.querySelector(".player-hud h2").textContent, "Beta");
    key(427); await settle();
    assert(/dead/.test(opened[opened.length - 1]), "Channel Up is the next channel");
    // The dead channel: a clear error with a way back, not a spinner.
    var panel = window.document.getElementById("playback-error");
    assert(panel, "A channel that fails shows a problem panel");
    assert(/cannot play|stopped with an error|did not start/.test(panel.textContent));
    assertNoSecret("in the error");
    assert(!window.document.getElementById("buffering-ring"), "The spinner is gone");
    assert(find("Try again") && find("Channel list"));
    assert.deepStrictEqual(Object.keys(JSON.parse(window.localStorage.getItem("vemm-tizen-error-log") || "[]")[0] || {}).length > 0, true);
    assertNoSecret("in the log");
    var logged = window.localStorage.getItem("vemm-tizen-error-log");
    SECRETS.forEach(function (secret) { assert(logged.indexOf(secret) === -1, "The error log does not hold " + secret); });
    key(428); await settle();
    assert.strictEqual(window.document.querySelector(".player-hud h2").textContent, "Beta", "Channel Down leaves the problem channel");
    assert(!window.document.getElementById("playback-error"));
    // Back returns to the channel list and stops the stream.
    var closedBefore = closed;
    await back();
    assert(closed > closedBefore, "Leaving closes AVPlay");
    assert.strictEqual(window.document.body.className, "");
    assert.strictEqual(window.document.querySelectorAll("#item-list .media-card").length, 3, "Back is the channel list");
    assert.strictEqual(window.document.activeElement.textContent.indexOf("Beta") !== -1, true, "Focus returns to the channel watched");
    assert.deepStrictEqual(plexPaths.slice(plexBefore).filter(function (p) { return /timeline|playQueues|decision|scrobble/.test(p); }), [],
        "Live TV makes no Plex playback requests");

    // Every stored value except the link itself is free of the secrets.
    for (var i = 0; i < window.localStorage.length; i += 1) {
        var name = window.localStorage.key(i);
        if (name === "vemm-tizen-iptv-source") { continue; }
        SECRETS.forEach(function (secret) { assert(window.localStorage.getItem(name).indexOf(secret) === -1, name + " holds " + secret); });
    }
    assert.deepStrictEqual(JSON.parse(window.localStorage.getItem("vemm-tizen-iptv-last")), { group: "News", name: "Beta" });

    // Removing the link takes Live TV away again.
    await back(); await back(); await back();
    click("Settings"); await settle();
    click("Live TV"); await settle();
    click("Remove playlist link"); await settle();
    assert.strictEqual(window.localStorage.getItem("vemm-tizen-iptv-source"), null);
    assert.strictEqual(window.localStorage.getItem("vemm-tizen-iptv-last"), null);
    console.log("Live TV settings, browsing, playback and secrecy: passed");
}

run().then(function () { process.exit(0); }, function (error) { console.error(error); process.exit(1); });
