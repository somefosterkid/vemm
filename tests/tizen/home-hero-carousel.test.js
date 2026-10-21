"use strict";
// Home hero carousel: Left/Right on the action row cycle the featured title, and focus resting on
// the hero or the navigation row advances it every 16 seconds unless the setting is Off.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");

function boot(autoAdvance) {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    var timers = [];
    window.setTimeout = function (fn, delay) {
        timers.push({ fn: fn, delay: delay, live: true });
        return timers.length;
    };
    window.clearTimeout = function (id) { if (timers[id - 1]) { timers[id - 1].live = false; } };
    window.TextDecoder = TextDecoder;
    window.URL.createObjectURL = function () { return "blob:synthetic"; };
    window.URL.revokeObjectURL = function () {};
    window.HTMLElement.prototype.getBoundingClientRect = function () {
        return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
    };
    var saved = { quality: "original", language: "en", nextEpisode: "countdown" };
    if (autoAdvance !== undefined) { saved.autoAdvanceFeatures = autoAdvance; }
    window.localStorage.setItem("vemm-tizen-preferences", JSON.stringify(saved));
    window.fetch = function (target) {
        var url = new URL(target);
        function json(container) {
            return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ MediaContainer: container }); } });
        }
        if (url.pathname === "/library/sections") { return json({ Directory: [{ key: "1", title: "Movies", type: "movie" }] }); }
        if (url.pathname === "/hubs/promoted") {
            var titles = [];
            for (var i = 0; i < 3; i += 1) { titles.push({ ratingKey: "K" + i, type: "movie", title: "Title " + i }); }
            return json({ Hub: [{ hubIdentifier: "home.movies.recent", title: "Recently Added", Metadata: titles }] });
        }
        return Promise.reject(new Error("no artwork"));
    };
    ["js/plex-api.js", "js/preferences.js", "js/session.js", "js/i18n.js", "js/home-hero.js"].forEach(function (file) {
        window.eval(fs.readFileSync(path.join(app, file), "utf8"));
    });
    window.localStorage.setItem("vemm-tizen-account", JSON.stringify({ version: 2, storage: "unencrypted", token: "synthetic-account-token" }));
    window.PlexApi.createAccountClient = function () {
        return {
            getProfiles: function () { return Promise.resolve([{ uuid: "synthetic-profile", title: "Profile" }]); },
            switchProfile: function () { return Promise.resolve("synthetic-profile-token"); },
            getServers: function () {
                return Promise.resolve([{ id: "synthetic-server", name: "Synthetic", token: "t",
                    connections: [{ uri: "https://pms.synthetic.invalid" }] }]);
            }
        };
    };
    window.PlexApi.selectServer = function () {
        return Promise.resolve({ client: window.PlexApi.createClient({ baseUrl: "https://pms.synthetic.invalid", token: "t" }) });
    };
    window.eval(fs.readFileSync(path.join(app, "main.js"), "utf8"));
    var document = window.document;
    function settle() {
        var chain = Promise.resolve();
        for (var i = 0; i < 40; i += 1) { chain = chain.then(function () {}); }
        return chain.then(function () { return new Promise(function (resolve) { setTimeout(resolve, 20); }); });
    }
    function button(label) {
        return Array.from(document.querySelectorAll("button")).find(function (node) {
            return node.textContent === label || node.getAttribute("aria-label") === label;
        });
    }
    var api = {
        window: window, document: document, settle: settle, button: button,
        press: function (keyCode) {
            document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: keyCode, bubbles: true, cancelable: true }));
        },
        title: function () { return document.querySelector(".home-hero-title").textContent; },
        // The live 8-second timers; fire runs the pending one the way the TV's clock would.
        pendingAdvance: function () { return timers.filter(function (t) { return t.live && t.delay === 16000; }); },
        fire: function () {
            var live = api.pendingAdvance();
            assert.strictEqual(live.length, 1, "Exactly one auto-advance timer is pending");
            live[0].live = false;
            live[0].fn();
        },
        start: async function () {
            await settle();
            button("Profile").click();
            await settle();
        }
    };
    return api;
}

(async function () {
    var a = boot();
    await a.start();
    var document = a.document;
    assert(document.querySelector(".home-hero"), "Home renders the hero");
    assert.strictEqual(a.title(), "Title 0");
    var play = document.querySelector(".home-feature-primary");
    var nextButton = a.button("Next featured title");
    play.focus();

    a.press(37);
    assert.strictEqual(a.title(), "Title 2", "Left on Play wraps to the last featured title");
    assert.strictEqual(document.activeElement, play, "Focus stays on Play");
    a.press(39);
    assert.strictEqual(document.activeElement.getAttribute("aria-label"), "Open details", "Right between buttons still moves focus");
    assert.strictEqual(a.title(), "Title 2", "Moving between buttons does not cycle");

    nextButton.focus();
    a.press(39);
    assert.strictEqual(a.title(), "Title 0", "Right on Next wraps forward");
    assert.strictEqual(document.activeElement, nextButton, "Focus stays on Next");
    a.press(39);
    assert.strictEqual(a.title(), "Title 1");

    assert.strictEqual(a.pendingAdvance().length, 1, "Focus on the hero row arms one 16 second timer");
    var armed = a.pendingAdvance()[0];
    a.press(39);
    assert.strictEqual(armed.live, false, "A key press clears the pending timer");
    assert.strictEqual(a.pendingAdvance().length, 1, "...and arms a fresh one");
    var before = a.title();
    a.fire();
    assert.notStrictEqual(a.title(), before, "16 seconds on the hero row advances the title");
    assert.strictEqual(document.activeElement, nextButton, "Auto-advance does not move focus");
    assert.strictEqual(a.pendingAdvance().length, 1, "It keeps advancing while focus stays there");

    document.querySelector(".home-navigation button").focus();
    a.press(39);
    assert.strictEqual(a.pendingAdvance().length, 1, "Focus on the navigation row arms the timer");
    var navTitle = a.title();
    a.fire();
    assert.notStrictEqual(a.title(), navTitle, "16 seconds on the navigation row advances the title");

    a.press(40);
    assert.strictEqual(document.activeElement, play, "Down from the navigation row reaches the hero");
    a.press(40);
    assert(document.activeElement.vemmCard, "Down from the hero reaches the shelves");
    assert.strictEqual(a.pendingAdvance().length, 0, "No auto-advance while focus is on the shelves");

    play.focus();
    a.press(39);
    var stale = a.pendingAdvance()[0];
    assert(stale, "Back on the hero row the timer re-arms");
    a.button("Settings").click();
    await a.settle();
    assert.strictEqual(stale.live, false, "Leaving Home clears the timer");
    assert.strictEqual(document.querySelector(".home-hero-title"), null, "Home is gone");
    stale.fn();
    assert.strictEqual(a.pendingAdvance().length, 0, "A stale timer neither advances nor re-arms");

    var off = boot(false);
    await off.start();
    off.document.querySelector(".home-feature-primary").focus();
    off.press(37);
    assert.strictEqual(off.title(), "Title 2", "Manual cycling works with auto-advance Off");
    assert.strictEqual(off.pendingAdvance().length, 0, "Auto-advance Off arms no timer");

    var s = boot();
    await s.start();
    s.button("Settings").click(); await s.settle();
    s.button("Libraries").click(); await s.settle();
    var toggle = s.button("Auto-advance featured titles: On");
    assert(toggle, "Libraries offers the auto-advance toggle, On by default");
    toggle.click(); await s.settle();
    assert(s.button("Auto-advance featured titles: Off"), "The toggle flips to Off");
    assert.strictEqual(JSON.parse(s.window.localStorage.getItem("vemm-tizen-preferences")).autoAdvanceFeatures, false);
    console.log("Tizen Home hero carousel: passed");
}()).catch(function (error) { console.error(error.stack || error.message); process.exitCode = 1; });
