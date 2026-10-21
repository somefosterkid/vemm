"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");
var movie = {
    ratingKey: "10", type: "movie", title: "Synthetic Movie", duration: 100000, viewOffset: 25000,
    summary: "Synthetic metadata", Chapter: [{ startTimeOffset: 20000, tag: "Chapter one" }],
    Marker: [{ type: "intro", startTimeOffset: 0, endTimeOffset: 5000 }],
    Media: [{ container: "mp4", videoCodec: "h264", audioCodec: "aac", videoResolution: "1080",
        Part: [{ id: "20", key: "/library/parts/20/file.mp4", Stream: [
            { id: 1, streamType: 2, codec: "aac" },
            { id: 42, streamType: 3, codec: "srt", language: "English", key: "/library/streams/42" }
        ] }] }]
};
var onDeck = Object.assign({}, movie, { ratingKey: "99", type: "episode", title: "Next episode", viewOffset: 20000 });
async function run() {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    window.TextDecoder = TextDecoder;
    var requests = [];
    var nativeCalls = [];
    var state = "NONE";
    var position = 0;
    var listener;
    // Like a 2018 TV: no pause until the clock of a newly opened stream has run (a time event).
    var clockRan = false;
    var hudTimers = new Map();
    var scrubTimers = new Map();
    var preloadTimers = new Map();
    var seekTargets = [];
    var hudTimerId = 100000;
    var realSetTimeout = window.setTimeout.bind(window);
    var realClearTimeout = window.clearTimeout.bind(window);
    window.setTimeout = function (callback, delay) {
        if (delay === 400) { scrubTimers.set(++hudTimerId, callback); return hudTimerId; }
        if (delay === 600) { preloadTimers.set(++hudTimerId, callback); return hudTimerId; }
        if (delay === 5000) { hudTimers.set(++hudTimerId, callback); return hudTimerId; }
        return realSetTimeout(callback, delay);
    };
    window.clearTimeout = function (id) {
        if (scrubTimers.has(id)) { scrubTimers.delete(id); return; }
        if (preloadTimers.has(id)) { preloadTimers.delete(id); return; }
        if (hudTimers.has(id)) { hudTimers.delete(id); } else { realClearTimeout(id); }
    };
    // The seek is sent 0.4 s after the last press; this lets that time pass.
    function sendPendingSeek() {
        var pending = Array.from(scrubTimers.values());
        scrubTimers.clear();
        pending.forEach(function (callback) { callback(); });
    }
    function hideHud() {
        assert.strictEqual(hudTimers.size, 1, "Playback must arm exactly one five-second HUD timer");
        var callbacks = Array.from(hudTimers.values());
        hudTimers.clear();
        callbacks[0]();
    }
    window.webapis = { avplay: {
        getState: function () { return state; },
        open: function () { nativeCalls.push("open"); state = "IDLE"; clockRan = false; },
        close: function () { nativeCalls.push("close"); state = "NONE"; },
        stop: function () { nativeCalls.push("stop"); state = "IDLE"; },
        setDisplayRect: function () {}, setDisplayMethod: function () {},
        setListener: function (value) {
            listener = Object.assign({}, value, { oncurrentplaytime: function (time) { clockRan = true; value.oncurrentplaytime(time); } });
        },
        prepareAsync: function (success) { state = "READY"; success(); },
        getDuration: function () { return movie.duration; },
        getCurrentTime: function () { return position; },
        play: function () { nativeCalls.push("play"); state = "PLAYING"; },
        pause: function () {
            if (!clockRan) { throw new Error("PLAYER_ERROR_INVALID_STATE"); }
            nativeCalls.push("pause"); state = "PAUSED";
        },
        seekTo: function (time, success) { seekTargets.push(time); position = time; success(); },
        setStreamingProperty: function (name, value) { nativeCalls.push(name + "=" + value); },
        getTotalTrackInfo: function () { return [{ type: "AUDIO", index: 0 }]; },
        setSelectTrack: function () {}, setSilentSubtitle: function () {}
    } };
    window.fetch = function (target, options) {
        var url = new URL(target);
        requests.push({ path: url.pathname, query: url.searchParams, method: options.method });
        var container;
        if (url.pathname === "/library/sections") {
            container = { size: 1, Directory: [{ key: "1", type: "movie", title: "Movies" }] };
        } else if (url.pathname === "/hubs/promoted") {
            container = { size: 1, Hub: [{ title: "Continue Watching", Metadata: [movie] }] };
        } else if (url.pathname === "/library/sections/1/all") {
            var start = Number(url.searchParams.get("X-Plex-Container-Start"));
            var size = Number(url.searchParams.get("X-Plex-Container-Size"));
            if (url.searchParams.get("includeMeta")) {
                container = { Meta: { Type: [{ active: true,
                    Sort: [{ key: "year", title: "Year", descKey: "year:desc" }, { key: "titleSort", title: "Title" }],
                    Filter: [{ filter: "genre", key: "/library/sections/1/genre", title: "Genre" }] }] } };
            } else {
                container = { offset: start, totalSize: 250, Metadata: [] };
                for (var i = start; i < Math.min(250, start + size); i += 1) {
                    container.Metadata.push(Object.assign({}, movie, { ratingKey: String(i + 10), title: "Movie " + i }));
                }
            }
        } else if (url.pathname === "/library/sections/1/genre") {
            container = { Directory: [{ key: "28", title: "Comedy" }] };
        } else if (url.pathname === "/library/sections/1/firstCharacter") {
            container = { Directory: [{ key: "#", title: "#", size: 10 }, { key: "a", title: "A", size: 40 },
                { key: "c", title: "C", size: 100 }, { key: "m", title: "M", size: 100 }] };
        } else if (url.pathname === "/library/metadata/10") { container = { Metadata: [movie] }; }
        else if (url.pathname === "/library/sections/1/collections") {
            var collectionStart = Number(url.searchParams.get("X-Plex-Container-Start") || 0);
            container = { offset: collectionStart, totalSize: 51, Metadata: [] };
            for (var c = collectionStart; c < Math.min(51, collectionStart + 50); c += 1) {
                container.Metadata.push(Object.assign({}, movie, { title: "Collection title " + c }));
            }
        }
        else if (url.pathname === "/library/metadata/99") { container = { Metadata: [onDeck] }; }
        else if (url.pathname === "/hubs/search") { container = { Hub: [{ title: "Movies", Metadata: [movie] }] }; }
        else if (url.pathname === "/video/:/transcode/universal/decision") { container = { generalDecisionCode: 1001 }; }
        else if (url.pathname === "/:/timeline" || url.pathname === "/video/:/transcode/universal/stop") { container = {}; }
        else if (url.pathname === "/library/parts/20") {
            assert.strictEqual(options.method, "PUT");
            assert.strictEqual(url.searchParams.get("allParts"), "1");
            assert.strictEqual(url.searchParams.get("subtitleStreamID"), "42",
                "Only the user's explicit text-overlay pick is recorded");
            assert(!url.searchParams.has("audioStreamID"), "Preserve default audio when no audio switch is requested");
            container = {};
        }
        else if (url.pathname === "/library/streams/42") {
            var subtitleBytes = Buffer.from("1\n00:00:01,000 --> 00:00:02,500\nSynthetic caption");
            return Promise.resolve({ ok: true, status: 200, body: new ReadableStream({
                start: function (controller) { controller.enqueue(new Uint8Array(subtitleBytes)); controller.close(); }
            }) });
        }
        else if (url.pathname === "/:/scrobble" || url.pathname === "/:/unscrobble") {
            assert.strictEqual(options.method, "GET");
            assert.strictEqual(url.searchParams.get("key"), "10");
            assert.strictEqual(url.searchParams.get("identifier"), "com.plexapp.plugins.library");
            container = {};
        }
        else if (url.pathname === "/actions/removeFromContinueWatching") {
            assert.strictEqual(options.method, "PUT");
            assert.strictEqual(url.searchParams.get("ratingKey"), "10");
            assert(!url.searchParams.has("time"), "Hiding a tile is not clearing its resume point");
            container = {};
        }
        else { return Promise.resolve({ ok: false, status: 404 }); }
        return Promise.resolve({
            ok: true, status: 200,
            json: function () { return Promise.resolve({ MediaContainer: container }); }
        });
    };
    ["js/plex-api.js", "js/avplay.js", "js/playback.js", "js/subtitles.js", "js/preferences.js",
        "js/session.js", "js/recents.js", "js/home-hero.js", "js/item-menu.js", "js/skip-markers.js", "js/account-preferences.js", "js/file-info.js", "js/search-ui.js", "js/preload.js", "js/i18n.js", "main.js"].forEach(function (file) {
        window.eval(fs.readFileSync(path.join(app, file), "utf8"));
    });
    function click(text) {
        var control = Array.from(window.document.querySelectorAll("button")).find(function (node) {
            return node.textContent === text;
        });
        assert(control, "Missing control: " + text);
        assert(!control.disabled, "Disabled control: " + text);
        control.click();
    }
    function clickPlay() {
        var hasRestart = Array.from(window.document.querySelectorAll("button")).some(function (node) {
            return node.textContent === "Play from beginning";
        });
        click(hasRestart ? "Play from beginning" : "Play");
    }
    async function settle() {
        for (var i = 0; i < 30; i += 1) { await Promise.resolve(); }
        await new Promise(function (resolve) { window.setTimeout(resolve, 0); });
    }
    try {
        window.document.querySelector('input[name="server"]').value = "https://pms.synthetic.invalid";
        click("Connect");
        await settle();
        assert.strictEqual(window.document.querySelectorAll(".media-card").length, 1);
        assert.strictEqual(nativeCalls.length, 0, "Home must not start playback");
        assert(window.document.querySelector('.home-navigation button[aria-current="page"]'),
            "Home must be a real selected destination alongside the libraries");
        assert.strictEqual(window.document.querySelectorAll(".home-hero-description").length, 1,
            "The LG-style hero has a short synopsis, not a separate text panel");
        assert(window.document.querySelector(".home-hero .home-feature-primary"),
            "The feature needs a distinct primary action");
        assert(window.document.querySelector(".account-control"),
            "Utilities must be reachable from the top navigation");
        // Samsung's Return key policy: Back on the app's home page asks before exiting; the app
        // exits only on an explicit Yes. developer.samsung.com/smarttv/develop/guides/fundamentals/
        // terminating-applications.html
        var exits = 0;
        window.tizen = { application: { getCurrentApplication: function () {
            return { exit: function () { exits += 1; } };
        } } };
        function back() {
            window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 10009, bubbles: true }));
        }
        var homeFocus = window.document.querySelector(".home-feature-primary");
        homeFocus.focus();
        back();
        var exitPrompt = window.document.getElementById("player-menu");
        assert(exitPrompt && /exit-prompt/.test(exitPrompt.className), "Back on Home asks before leaving the app");
        assert.strictEqual(exitPrompt.getAttribute("role"), "alertdialog");
        assert.strictEqual(exitPrompt.querySelector("h2").textContent, "Exit app?");
        assert.strictEqual(window.document.activeElement.textContent, "Stay",
            "Stay is focused, so a second accidental OK does not quit");
        assert.strictEqual(window.document.querySelector(".home-track") !== null, true, "Home stays underneath");
        back();
        assert(!window.document.getElementById("player-menu"), "Back dismisses the exit prompt");
        assert.strictEqual(window.document.activeElement, homeFocus, "Dismissing restores the focused Home control");
        assert.strictEqual(exits, 0);
        back();
        click("Stay");
        assert(!window.document.getElementById("player-menu"));
        assert.strictEqual(window.document.activeElement, homeFocus, "Stay restores focus");
        assert.strictEqual(exits, 0, "Only an explicit Exit closes the app");
        back();
        click("Exit");
        assert.strictEqual(exits, 1, "Exit calls tizen.application.getCurrentApplication().exit()");
        delete window.tizen;
        click("Exit");
        assert(window.document.querySelector(".status").textContent.indexOf("Hold Back") !== -1,
            "Without the Tizen Application API, Exit explains the remote's own force-exit");
        click("Stay");
        var selectedHome = window.document.querySelector('.home-navigation button[aria-current="page"]');
        selectedHome.focus();
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 37, bubbles: true }));
        assert(window.document.activeElement.classList.contains("account-control"),
            "Left from the first Home destination must reach Account");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 13, bubbles: true }));
        assert.strictEqual(window.document.activeElement.textContent, "Settings",
            "OK on Account must open its utilities with Settings focused");
        back();
        assert(window.document.activeElement.classList.contains("account-control"),
            "Back from Account utilities must return focus to Account");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 38, bubbles: true }));
        assert(window.document.activeElement.classList.contains("account-control"),
            "Up at the fixed Home navigation must not jump into a shelf below it");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 39, bubbles: true }));
        assert.strictEqual(window.document.activeElement, selectedHome,
            "Right from Account must return to the selected Home destination");
        window.document.querySelector("#screen").scrollTop = 700;
        window.document.querySelector("#screen").classList.add("shelves-focused");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 40, bubbles: true }));
        assert(window.document.activeElement.classList.contains("home-feature-primary"),
            "Down from Home must reach the feature, not jump over it to a distant poster");
        assert.strictEqual(window.document.querySelector("#screen").scrollTop, 0,
            "Returning to the hero must reset scrolling before focusing its controls");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 40, bubbles: true }));
        assert(window.document.activeElement.classList.contains("media-card"),
            "Down from the feature must reach the first shelf");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 38, bubbles: true }));
        assert(window.document.activeElement.classList.contains("home-feature-primary"),
            "Up from the first shelf restores the visible feature");
        assert(!window.document.querySelector("#screen").classList.contains("shelves-focused"));
        var firstShelfCard = window.document.querySelector(".shelf-row .media-card");
        var homeScreen = window.document.querySelector("#screen");
        var stubbed = [[firstShelfCard.parentNode.parentNode, { left: 0, top: 800, right: 1920, bottom: 1200 }],
            [window.document.querySelector(".browse-header"), { left: 0, top: 0, right: 1920, bottom: 100 }],
            [homeScreen, { left: 0, top: 0, right: 1920, bottom: 1080 }],
            [firstShelfCard, { left: 100, top: 860, right: 340, bottom: 1220 }]];
        stubbed.forEach(function (pair) {
            pair.push(pair[0].getBoundingClientRect);
            pair[0].getBoundingClientRect = function () { return pair[1]; };
        });
        // After moveHome the card sits under the header; report that so the reveal pass is stable.
        stubbed[3][1] = { left: 100, top: 172, right: 340, bottom: 532 };
        firstShelfCard.focus();
        assert(/translate3d\(0,\s*-688px,\s*0\)/.test(window.document.querySelector(".home-track").style.transform),
            "A shelf below the hero is brought under the header by a GPU transform: " +
            window.document.querySelector(".home-track").style.transform);
        assert.strictEqual(homeScreen.scrollTop, 0,
            "Home must not scroll natively; a native scroll repaints the whole screen on older Tizen engines");
        stubbed.forEach(function (pair) { pair[0].getBoundingClientRect = pair[2]; });
        window.document.querySelector(".home-feature-primary").focus();
        assert(/translate3d\(0,\s*0px,\s*0\)/.test(window.document.querySelector(".home-track").style.transform),
            "Returning to the hero resets the Home track");
        var secondShelf = window.document.createElement("section");
        secondShelf.className = "shelf";
        var secondRow = window.document.createElement("div");
        secondRow.className = "shelf-row";
        var secondShelfCard = window.document.createElement("button");
        secondShelfCard.className = "media-card";
        secondShelfCard.vemmCard = firstShelfCard.vemmCard;
        secondRow.appendChild(secondShelfCard);
        secondShelf.appendChild(secondRow);
        window.document.querySelector(".home-shelves").appendChild(secondShelf);
        var firstBounds = firstShelfCard.getBoundingClientRect;
        firstShelfCard.getBoundingClientRect = function () {
            return { left: 100, top: -1200, right: 300, bottom: -900, width: 200, height: 300 };
        };
        secondShelfCard.getBoundingClientRect = function () {
            return { left: 100, top: 200, right: 300, bottom: 500, width: 200, height: 300 };
        };
        secondShelfCard.focus();
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 38, bubbles: true }));
        assert.strictEqual(window.document.activeElement, firstShelfCard,
            "Up from a scrolled shelf must reach the adjacent shelf, not a geometrically nearer fixed nav");
        firstShelfCard.getBoundingClientRect = firstBounds;
        secondShelf.remove();
        window.document.querySelector(".home-feature-primary").focus();
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 38, bubbles: true }));
        assert.strictEqual(window.document.activeElement, selectedHome,
            "Up from the hero must return to navigation, not the separate Account control");
        var emptyShelf = window.document.createElement("section");
        emptyShelf.className = "shelf";
        var emptyRow = window.document.createElement("div");
        emptyRow.className = "shelf-row";
        emptyShelf.appendChild(emptyRow);
        var shelfPanel = window.document.querySelector(".home-shelves");
        shelfPanel.insertBefore(emptyShelf, shelfPanel.firstChild);
        firstShelfCard.focus();
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 38, bubbles: true }));
        assert(window.document.activeElement.classList.contains("home-feature-primary"),
            "An empty first hub must not trap Up from the first populated shelf");
        emptyShelf.remove();
        var navigation = window.document.querySelector(".home-navigation");
        assert(navigation, "Home navigation belongs above the shelves, not below them");
        assert(navigation.querySelector(".menu-icon-search"), "Search needs a visible icon");
        assert(window.document.querySelector(".home-utilities .menu-icon-settings"), "Settings needs a visible icon");
        assert(window.document.querySelector(".library-button"), "Library choices need visible labels");
        click("Account");
        assert(window.document.querySelector(".home-utilities .menu-icon-refresh"),
            "Refresh must use its own icon rather than unexplained More dots");
        var accountItems = Array.from(window.document.querySelectorAll(".home-utilities button"));
        var accountLabels = accountItems.map(function (node) { return node.textContent; });
        assert(accountLabels.indexOf("Change profile") !== -1 && accountLabels.indexOf("Change profile") === accountLabels.indexOf("Change server") - 1,
            "Change profile sits directly above Change server");
        accountItems.forEach(function (node) {
            assert(/menu-icon-/.test(node.className) && !/menu-icon-none/.test(node.className), node.textContent + " needs an icon");
        });
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 27, bubbles: true }));
        assert(window.document.querySelector(".home-utilities").hidden,
            "Back must close account controls before leaving Home");
        assert(window.document.activeElement.classList.contains("account-control"));
        click("Account");
        click("Settings");
        assert(window.document.querySelector(".settings-menu"), "Settings uses a grouped menu surface");
        var iconStyle = fs.readFileSync(path.join(app, "css", "style.css"), "utf8");
        assert(window.document.querySelector(".settings-menu.settings-sections"), "Only the section list opts in to icons");
        assert(/\.settings-sections \.menu-control::before\s*\{\s*display:\s*block/.test(iconStyle), "Section icons are shown");
        assert(!/\.home-utilities \.menu-control::before\s*\{\s*display:\s*none/.test(iconStyle), "Account menu icons are not hidden");
        Array.from(window.document.querySelectorAll(".settings-menu button")).forEach(function (node) {
            var icon = /menu-icon-([a-z-]+)/.exec(node.className);
            assert(icon && icon[1] !== "none", node.textContent + " needs a top-level icon");
            assert(iconStyle.indexOf(".menu-icon-" + icon[1] + "::before") !== -1, icon[1] + " has an icon style");
        });
        assert(/menu-icon-back/.test(Array.from(window.document.querySelectorAll(".settings-menu button")).pop().className));
        assert(/\.settings-menu \.menu-control\.menu-icon-back::after\s*\{\s*content:\s*none/.test(iconStyle),
            "Back must not show the forward chevron the other rows use");
        assert.deepStrictEqual(Array.from(window.document.querySelectorAll(".settings-menu button")).map(function (node) {
            return node.textContent; }), ["Playback", "Text overlay appearance", "Language", "Graphics", "Performance", "Privacy and data", "Back"],
            "Settings lists only its sections");
        function headerTitle() { return window.document.querySelector(".app-header .header-title").textContent; }
        function pressKey(key) { window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: key, bubbles: true })); }
        assert.strictEqual(headerTitle(), "Settings", "The page name sits in the top bar");
        assert(!window.document.querySelector(".screen .page-title"), "The title is not repeated in the content");
        var sectionButtons = Array.from(window.document.querySelectorAll(".settings-menu button"));
        sectionButtons[0].focus();
        pressKey(38);
        assert.strictEqual(window.document.activeElement, sectionButtons[sectionButtons.length - 1], "Up on the first item wraps to the last");
        pressKey(40);
        assert.strictEqual(window.document.activeElement, sectionButtons[0], "Down on the last item wraps to the first");
        click("Playback");
        assert.strictEqual(headerTitle(), "Playback");
        assert(!window.document.querySelector(".screen .page-title"), "A section page has no in-content title");
        assert(window.document.querySelector(".settings-menu .menu-control"), "A section page holds its controls");
        assert(!window.document.querySelector(".settings-menu .help-text"), "Info text is not inside the list card");
        var notes = window.document.querySelector(".screen-settings > .settings-notes .help-text");
        assert(notes, "Info text sits below the options, outside the card");
        assert(window.document.querySelector(".settings-menu").compareDocumentPosition(notes) & 4, "Info text follows the list");
        click("Back");
        assert.strictEqual(window.document.activeElement.textContent, "Playback", "Back restores focus on the section entry");
        assert.strictEqual(headerTitle(), "Settings");
        Array.from(window.document.querySelectorAll(".settings-menu button")).find(function (node) { return node.textContent === "Language"; }).focus();
        click("Language");
        click("Back");
        assert.strictEqual(window.document.activeElement.textContent, "Language", "Back restores the focused section, not the first");
        click("Privacy and data");
        click("About Vemm");
        assert.strictEqual(headerTitle(), "", "Leaving Settings clears the top-bar title");
        assert(window.document.querySelector(".screen-about"), "About Vemm is a first-class settings destination");
        assert(window.document.querySelector(".about-brand-mark"), "About Vemm uses the original packaged mark");
        assert(window.document.body.textContent.includes("Your media. At its best."));
        assert(window.document.body.textContent.includes("working brand"));
        click("Back");
        assert(window.document.querySelector(".settings-menu"), "Back from About Vemm returns to its Settings section");
        click("Back");
        click("Playback");
        assert(!window.document.querySelector(".settings-sections"), "Inner Settings pages stay text-first");
        Array.from(window.document.querySelectorAll(".settings-menu button")).forEach(function (node) {
            assert(!/menu-icon-(film|audio|library|language|sparkle|shield)/.test(node.className), node.textContent + " is an inner item and gets no section icon");
        });
        assert.strictEqual(Array.from(window.document.querySelectorAll(".settings-menu button")).filter(function (node) {
            return node.textContent.indexOf("Quality:") === 0;
        }).length, 1, "Settings must show one quality value, not every alternative");
        click("Quality: Original quality");
        assert.deepStrictEqual(Array.from(window.document.querySelectorAll(".screen button")).map(function (node) {
            return node.textContent; }), ["Original quality", "2160p · 40 Mbps (converts)", "1440p · 25 Mbps (converts)",
            "1080p · 20 Mbps (converts)", "1080p · 16 Mbps (converts)", "1080p · 12 Mbps (converts)",
            "1080p · 10 Mbps (converts)", "1080p · 8 Mbps (converts)", "720p · 4 Mbps (converts)",
            "720p · 2 Mbps (converts)", "480p · 0.7 Mbps (converts)", "Recheck speed", "Back"],
            "Settings lists every quality, Original first, then by resolution and Mbps, highest first");
        assert.deepStrictEqual(Array.from(window.document.querySelectorAll(".screen .group-title")).map(function (node) {
            return node.textContent; }), ["Original", "4K", "1440p", "1080p", "720p", "480p"],
            "Quality options sit under resolution headings");
        assert(!window.document.querySelector(".screen .group-title[tabindex], .screen .group-title button"),
            "Headings are not focusable");
        var qualityButtons = Array.from(window.document.querySelectorAll(".screen button"));
        qualityButtons[0].focus();
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 40, bubbles: true }));
        assert.strictEqual(window.document.activeElement, qualityButtons[1], "Down moves past a heading to the next option");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 38, bubbles: true }));
        assert.strictEqual(window.document.activeElement, qualityButtons[0], "Up returns across the heading");
        assert.strictEqual(headerTitle(), "Quality");
        assert(!window.document.querySelector(".screen .page-title"), "Choice pages have no in-content title");
        assert(window.document.querySelector(".screen-settings > .settings-menu .settings-group"),
            "Choice pages use the same centered card as the section list");
        var choiceButtons = Array.from(window.document.querySelectorAll(".screen button"));
        choiceButtons[choiceButtons.length - 1].focus();
        pressKey(40);
        assert.strictEqual(window.document.activeElement, choiceButtons[0], "Down on Back wraps to the first choice");
        pressKey(38);
        assert.strictEqual(window.document.activeElement, choiceButtons[choiceButtons.length - 1], "Up on the first choice wraps to Back");
        assert.strictEqual(window.document.querySelector('button[aria-pressed="true"]').textContent, "Original quality",
            "Choice state must be visible independently of focus");
        click("720p · 4 Mbps (converts)");
        assert(window.document.querySelector(".settings-menu"), "Selecting quality must return to Settings");
        assert.strictEqual(window.document.activeElement.textContent, "Quality: 720p · 4 Mbps (converts)", "Choice pages restore parent focus");
        click("Quality: 720p · 4 Mbps (converts)");
        click("Original quality");
        // Settings > Playback measures the TV-to-server path with a ranged download.
        var speedRequests = [];
        var speedClock = 0;
        var realNow = window.Date.now;
        window.Date.now = function () { return speedClock; };
        window.XMLHttpRequest = function () {
            var request = { headers: {}, status: 200, readyState: 0,
                open: function (method, url) { this.url = url; },
                setRequestHeader: function (name, value) { this.headers[name] = value; },
                send: function () {}, abort: function () { this.aborted = true; } };
            speedRequests.push(request);
            return request;
        };
        function screenText() { return window.document.querySelector("#screen").textContent; }
        function labels() { return Array.from(window.document.querySelectorAll(".screen button")).map(function (node) { return node.textContent; }); }
        click("Test connection speed");
        assert.strictEqual(headerTitle(), "Connection speed", "Selecting the test opens its own page");
        assert(screenText().includes("Finding a file to test with…"), "The first phase is named");
        assert.deepStrictEqual(labels(), ["Back"], "Only Back is offered while testing");
        assert.strictEqual(window.document.activeElement.textContent, "Back");
        await settle();
        assert(screenText().includes("Measuring speed to this server…"), "The second phase is named");
        assert.strictEqual(speedRequests[0].headers.Range, "bytes=0-33554431");
        assert(speedRequests[0].url.indexOf("/library/parts/20/file.mp4") !== -1, "It downloads a real media part");
        assert(!screenText().includes("X-Plex-Token"), "The token is never displayed");
        speedClock = 1000; speedRequests[0].readyState = 2; speedRequests[0].onreadystatechange();
        speedRequests[0].onprogress({ loaded: 1000000 });
        speedClock = 3000; speedRequests[0].onprogress({ loaded: 7000000 });
        assert(screenText().includes("24 Mbps") && screenText().includes("3 of 8 seconds"), "Live reading and progress: " + screenText());
        speedRequests[0].onload();
        await settle();
        assert(screenText().includes("24 Mbps to this server. Recommended: 1080p · 16 Mbps (converts)"), screenText());
        assert.deepStrictEqual(labels(), ["Use 1080p · 16 Mbps (converts)", "Test again", "Back"]);
        click(labels()[0]);
        assert.strictEqual(headerTitle(), "Playback", "Use returns to Playback");
        assert(Array.from(window.document.querySelectorAll(".settings-menu button")).some(function (node) {
            return node.textContent === "Quality: 1080p · 16 Mbps (converts)"; }), "Use saves the recommended quality");
        click("Test connection speed");
        await settle();
        speedRequests[1].onerror();
        await settle();
        assert(screenText().includes("Couldn't measure speed: The connection failed (network error)"), screenText());
        assert.deepStrictEqual(labels(), ["Test again", "Back"]);
        click("Test again");
        await settle();
        assert.strictEqual(speedRequests.length, 3, "Test again starts another download");
        speedRequests[2].status = 403; speedRequests[2].readyState = 2; speedRequests[2].onreadystatechange();
        await settle();
        assert(screenText().includes("Couldn't measure speed: HTTP 403 from the server"), screenText());
        assert(!/X-Plex-Token|server.invalid/.test(screenText()), "Failures never show URLs or tokens");
        click("Test again");
        await settle();
        click("Back");
        assert(speedRequests[3].aborted, "Back during a test cancels the download");
        assert.strictEqual(headerTitle(), "Playback");
        // One result (24 Mbps) is saved: options above 80% of it (19.2 Mbps) carry a warning, Original never.
        click("Quality: 1080p · 16 Mbps (converts)");
        var warned = Array.from(window.document.querySelectorAll(".screen button")).filter(function (node) {
            return node.querySelector(".quality-warning"); }).map(function (node) { return node.textContent; });
        assert.deepStrictEqual(warned, ["2160p · 40 Mbps (converts)", "1440p · 25 Mbps (converts)", "1080p · 20 Mbps (converts)"]);
        assert.strictEqual(window.document.querySelector(".quality-warning").getAttribute("aria-label"), "May buffer on your connection");
        assert(window.document.querySelector(".screen-settings > .settings-notes").textContent.includes("Recent speed: 24 Mbps (1 test)"),
            "The recent average is info text below the list");
        assert.deepStrictEqual(JSON.parse(window.localStorage.getItem("vemm-tizen-speeds")), { manual: [24] });
        click("Recheck speed");
        assert.strictEqual(headerTitle(), "Connection speed");
        await settle();
        click("Back");
        assert.strictEqual(headerTitle(), "Quality", "Back from the recheck returns to the Quality page");
        click("Back");
        assert.strictEqual(headerTitle(), "Playback");
        window.Date.now = realNow;
        click("Quality: 1080p · 16 Mbps (converts)");
        click("Original quality");
        var skipInterval = Array.from(window.document.querySelectorAll(".settings-menu button")).find(function (node) {
            return node.textContent === "Skip interval: 10 seconds";
        });
        skipInterval.focus();
        skipInterval.click();
        click("15 seconds");
        assert.strictEqual(window.document.activeElement.textContent, "Skip interval: 15 seconds");
        var nextEpisode = Array.from(window.document.querySelectorAll(".settings-menu button")).find(function (node) {
            return node.textContent === "Next episode: Countdown during credits";
        });
        nextEpisode.focus();
        nextEpisode.click();
        assert.deepStrictEqual(Array.from(window.document.querySelectorAll(".screen button")).map(function (node) {
            return node.textContent; }).slice(0, 3), ["Countdown during credits", "Play after credits", "Off"]);
        click("Play after credits");
        assert.strictEqual(window.document.activeElement.textContent, "Next episode: Play after credits",
            "Changing a preference must retain remote focus on that row");
        click("Direct play: Auto");
        assert.deepStrictEqual(Array.from(window.document.querySelectorAll(".screen button")).map(function (node) {
            return node.textContent; }).slice(0, 3), ["Auto", "Force", "Off"]);
        click("Auto");
        click("Back");
        click("Back");
        await settle();
        click("Movies");
        await settle();
        assert(window.document.activeElement.classList.contains("media-card"),
            "Opening a library must land on its first title, not the Account control");
        assert.strictEqual(window.document.activeElement, window.document.querySelector(".item-list .media-card"));
        var libraryHome = window.document.querySelector(".home-navigation button");
        libraryHome.focus();
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 37, bubbles: true }));
        assert(window.document.activeElement.classList.contains("account-control"),
            "Library headers must retain the same Left path from Home to Account");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 39, bubbles: true }));
        assert.strictEqual(window.document.activeElement, libraryHome,
            "Right from Account must return to the library header");
        click("Account");
        assert(!window.document.querySelector(".home-utilities").hidden,
            "Account must open the same utility panel in a library, not jump to Settings");
        assert(!window.document.querySelector(".settings-menu"));
        click("Refresh");
        await settle();
        assert(window.document.querySelector(".screen-library"),
            "Refresh from library Account utilities must stay in that library");
        assert.strictEqual(window.document.querySelector('.home-navigation button[aria-current="page"]').textContent, "Movies");
        click("Account");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 27, bubbles: true }));
        assert(window.document.querySelector(".home-utilities").hidden);
        assert(window.document.activeElement.classList.contains("account-control"));
        await settle();
        assert.strictEqual(window.document.querySelectorAll(".media-card").length, 50);
        assert(window.document.querySelector(".screen-library .page-toolbar"), "Browse tools belong to one navigation row");
        var texts = function (selector) {
            return Array.from(window.document.querySelectorAll(selector)).map(function (node) { return node.textContent; });
        };
        var press = function (keyCode) {
            window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: keyCode, bubbles: true }));
        };
        var toolbarLabels = texts(".page-toolbar > button");
        assert(toolbarLabels.indexOf("A-Z") === -1 && toolbarLabels.indexOf("Sort and filters") === -1,
            "The A-Z and Sort and filters buttons are replaced by dropdowns");
        var sortControl = window.document.querySelector(".page-toolbar .sort-dropdown");
        var genreControl = window.document.querySelector(".page-toolbar .genre-dropdown");
        assert.strictEqual(sortControl.textContent, "Sort: Title ↑ ▾", "The toolbar shows the current sort");
        assert.strictEqual(genreControl.textContent, "Genre: All ▾", "The toolbar shows the current genre filter");
        sortControl.click();
        await settle();
        assert.deepStrictEqual(texts(".dropdown-list button"),
            ["Title ↑", "Year", "Bitrate"],
            "Title is the first sort option; each sort appears once");
        assert(window.document.querySelector(".screen-library"), "The dropdown is an overlay, not a new page");
        assert.strictEqual(window.document.activeElement.textContent, "Title ↑", "Focus starts on the active sort");
        press(40);
        assert.strictEqual(window.document.activeElement.textContent, "Year", "Down moves within the list");
        press(27);
        assert.strictEqual(window.document.querySelector(".dropdown-list"), null, "Back closes the dropdown");
        assert.strictEqual(window.document.activeElement, sortControl, "Back returns to the dropdown control");
        assert(window.document.querySelector(".screen-library"), "Closing the dropdown must not leave the library");
        assert.strictEqual(window.document.querySelectorAll(".letter-bar button").length, 27);
        assert.deepStrictEqual(Array.from(window.document.querySelectorAll(".letter-bar button")).filter(function (node) {
            return !node.disabled; }).map(function (node) { return node.textContent; }), ["#", "A", "C", "M"],
            "Letters without items are dimmed and skipped");
        assert(window.document.querySelector(".letter-bar button[disabled]"));
        var barStart = requests.length;
        window.document.querySelector(".media-card").focus();
        press(39);
        assert(window.document.activeElement.parentNode.classList.contains("letter-bar"),
            "Right from the grid enters the jump bar");
        assert.strictEqual(window.document.activeElement.textContent, "M", "The bar opens near the focused title's letter");
        press(38);
        assert.strictEqual(window.document.activeElement.textContent, "C", "Up skips the dimmed letters");
        press(40);
        assert.strictEqual(window.document.activeElement.textContent, "M");
        press(37);
        assert(window.document.activeElement.classList.contains("media-card"), "Left returns to the grid");
        press(39);
        press(38);
        window.document.activeElement.click();
        await settle();
        var jump = requests.filter(function (request) {
            return request.path === "/library/sections/1/all" && request.query.get("X-Plex-Container-Start") === "36"; });
        assert(jump.length >= 1, "C (after # 10 and A 40, beyond the 50 loaded) reloads the list from the row boundary above it");
        assert.strictEqual(requests.slice(barStart).filter(function (request) {
            return request.path === "/library/sections/1/firstCharacter"; }).length, 0,
            "Moving focus and jumping reuse the cached letter offsets");
        assert.strictEqual(window.document.activeElement.vemmCard.item.title, "Movie 50",
            "A jump focuses the first title of that letter");
        sortControl = window.document.querySelector(".page-toolbar .sort-dropdown");
        sortControl.click();
        await settle();
        Array.from(window.document.querySelectorAll(".dropdown-list button")).filter(function (node) {
            return node.textContent === "Year"; })[0].click();
        await settle();
        assert(requests.some(function (request) { return request.query.get("sort") === "year:desc"; }));
        assert.strictEqual(window.document.querySelector(".page-toolbar .sort-dropdown").textContent,
            "Sort: Year ↓ ▾");
        assert(window.document.querySelector(".letter-bar").hidden, "The jump bar is hidden for non-title sorts");
        window.document.querySelector(".media-card").focus();
        press(39);
        assert(!window.document.activeElement.parentNode.classList.contains("letter-bar"));
        window.document.querySelector(".page-toolbar .sort-dropdown").click();
        await settle();
        window.document.querySelector(".dropdown-list button").click();
        await settle();
        assert(!window.document.querySelector(".letter-bar").hidden, "Title A-Z shows the jump bar again");
        window.document.querySelector(".page-toolbar .genre-dropdown").click();
        await settle();
        assert.deepStrictEqual(texts(".dropdown-list button"), ["Clear", "Comedy"], "Genre opens the server's values in a list");
        Array.from(window.document.querySelectorAll(".dropdown-list button")).filter(function (node) {
            return node.textContent === "Comedy"; })[0].click();
        press(27);
        await settle();
        assert(requests.some(function (request) { return request.query.get("genre") === "28"; }));
        assert.strictEqual(window.document.querySelector(".page-toolbar .genre-dropdown").textContent,
            "Genre: Comedy ▾");
        assert(requests.some(function (request) {
            return request.path === "/library/sections/1/firstCharacter" && request.query.get("genre") === "28"; }),
            "Letter offsets follow the active filter");
        assert(!Array.from(window.document.querySelectorAll("button")).some(function (node) { return node.textContent === "Load more"; }),
            "The library pages in by itself, without a Load more button");
        click("Collections");
        await settle();
        assert.strictEqual(window.document.querySelectorAll(".media-card").length, 50);
        window.document.querySelector(".media-card").click();
        await settle();
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 10009, bubbles: true }));
        await settle();
        assert(Array.from(window.document.querySelectorAll("button")).some(function (node) {
            return node.textContent === "Load more";
        }), "Returning from details must preserve the listing's remaining pages");
        click("Load more");
        await settle();
        assert.strictEqual(window.document.querySelectorAll(".media-card").length, 51,
            "Collection pages must advance rather than append the first page again");
        click("Back");
        await settle();
        press(27);
        await settle();
        click("Search");
        assert(!window.document.body.textContent.includes("identifiers and permissions"),
            "Search must not open on developer-facing copy");
        function hubSearches() { return requests.filter(function (request) { return request.path === "/hubs/search"; }); }
        function type(text) {
            text.split("").forEach(function (letter) { click(letter); });
        }
        async function debounced() { await new Promise(function (resolve) { realSetTimeout(resolve, 450); }); await settle(); }
        var searches = hubSearches().length;
        assert(window.document.querySelector(".search-keyboard"), "Search opens on the built-in keyboard");
        assert.strictEqual(window.document.querySelectorAll(".search-keyboard .keyboard-row").length, 4);
        assert.strictEqual(window.document.querySelectorAll(".search-keyboard .keyboard-row")[0].querySelectorAll("button").length, 12);
        assert(!window.document.querySelector('input[type="search"]'), "Search must not focus a text input and open the Tizen IME");
        assert.strictEqual(window.document.activeElement.textContent, "A", "Focus starts on the keyboard");
        var searchNode = window.document.querySelector(".search-keyboard");
        assert(searchNode.querySelector(".keyboard-filters .keyboard-extra"), "Both/Movies/TV sit in the filters row");
        assert(!searchNode.querySelector(".keyboard-row .keyboard-extra"), "the action row has no filter buttons");
        assert(searchNode.querySelector(".keyboard-filters").compareDocumentPosition(searchNode.querySelector(".keyboard-display")) & window.Node.DOCUMENT_POSITION_FOLLOWING,
            "filters come above the text display");
        assert(searchNode.querySelector(".keyboard-body > .keyboard-keys") && searchNode.querySelector(".keyboard-body > .search-panel"),
            "keys on the left, results panel beside them");
        function keyArrow(node, code) { node.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: code, bubbles: true, cancelable: true })); }
        function labelled(text) { return Array.from(window.document.querySelectorAll(".search-keyboard button")).filter(function (node) { return node.textContent === text; })[0]; }
        var recentSeed = JSON.parse(window.localStorage.getItem("vemm-tizen-recent-searches") || "{}");
        var seeded = Object.keys(recentSeed).length > 0 && recentSeed[Object.keys(recentSeed)[0]].length > 0;
        assert(window.document.querySelector(".search-hint"), "An empty query shows a hint");
        click("S"); await debounced();
        assert.strictEqual(hubSearches().length, searches, "A one-letter query requests nothing");
        type("YNTHETIC");
        await settle();
        assert.strictEqual(hubSearches().length, searches, "Typing is debounced: nothing is requested while keys are still being pressed");
        await debounced();
        assert.strictEqual(hubSearches().length, searches + 1, "One hub search follows the pause");
        var hubQuery = hubSearches()[hubSearches().length - 1].query;
        assert.strictEqual(hubQuery.get("query"), "SYNTHETIC");
        assert.strictEqual(hubQuery.get("includeCollections"), "1");
        assert.strictEqual(hubQuery.get("includeExternalMedia"), "0");
        assert(hubQuery.get("limit"));
        assert.strictEqual(window.document.querySelectorAll(".media-card").length, 1);
        assert(window.document.querySelector(".search-results .shelf h3").textContent === "Movies and shows", "Titles lead the results");
        assert(!window.document.body.textContent.includes("identifiers and permissions"),
            "Search results must not show developer-facing copy");
        var storedSearches = JSON.parse(window.localStorage.getItem("vemm-tizen-recent-searches") || "{}");
        assert.deepStrictEqual(storedSearches[Object.keys(storedSearches)[0]], ["SYNTHETIC"],
            "A search that ran is remembered for the profile");
        // Movies / TV switch restricts the results without another request.
        var before = hubSearches().length;
        click("TV");
        assert.strictEqual(window.document.querySelectorAll(".media-card").length, 0, "TV hides the movie");
        assert.strictEqual(window.document.querySelector(".keyboard-extra[aria-pressed='true']").textContent, "TV");
        click("Movies");
        assert.strictEqual(window.document.querySelectorAll(".media-card").length, 1, "Movies keeps it");
        click("Both");
        assert.strictEqual(hubSearches().length, before, "The switch filters what was fetched");
        // Down leaves the keyboard for the results; Up returns.
        var lastKey = Array.from(window.document.querySelectorAll(".search-keyboard button")).filter(function (node) { return node.textContent === "Clear"; })[0];
        lastKey.focus();
        lastKey.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 40, bubbles: true, cancelable: true }));
        assert(window.document.activeElement.classList.contains("media-card"), "Down from the action row enters the results");
        assert(searchNode.classList.contains("keyboard-collapsed"), "entering the results hides the keyboard");
        assert.strictEqual(window.document.querySelector(".keyboard-text").textContent, "SYNTHETIC", "the query stays visible while the keys are hidden");
        window.document.activeElement.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 38, bubbles: true, cancelable: true }));
        assert.strictEqual(window.document.activeElement, lastKey, "Up from the first results row returns to the keyboard");
        assert(!searchNode.classList.contains("keyboard-collapsed"));
        labelled("L").focus();
        keyArrow(labelled("L"), 39);
        assert(window.document.activeElement.classList.contains("media-card"), "Right from the keyboard edge enters the results");
        assert(searchNode.classList.contains("keyboard-collapsed"));
        keyArrow(window.document.activeElement, 37);
        assert.strictEqual(window.document.activeElement, labelled("L"), "Left from the first results column restores the keyboard on the last key");
        keyArrow(labelled("L"), 39);
        assert(searchNode.classList.contains("keyboard-collapsed"));
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 10009, bubbles: true, cancelable: true }));
        assert(!searchNode.classList.contains("keyboard-collapsed"), "Back restores the keyboard instead of leaving Search");
        assert.strictEqual(window.document.activeElement, labelled("L"), "Back refocuses the last key used");
        assert(window.document.querySelector(".keyboard-text"), "still on the Search page");
        click("Clear");
        var recentList = window.document.querySelector(".search-recents");
        assert(recentList && !recentList.hidden, "An empty query shows the profile's recent searches");
        assert(recentList.textContent.includes("RECENT SEARCHES"));
        labelled("Clear").focus();
        keyArrow(labelled("Clear"), 40);
        assert(recentList.contains(window.document.activeElement), "Down from the action row reaches the recent searches when the query is empty");
        assert(searchNode.classList.contains("keyboard-collapsed"));
        keyArrow(window.document.activeElement, 37);
        assert(!searchNode.classList.contains("keyboard-collapsed"), "Left from the recents restores the keyboard");
        var recentButton = Array.from(recentList.querySelectorAll("button")).filter(function (node) {
            return node.textContent === "SYNTHETIC";
        })[0];
        assert(recentButton, "Each recent search is a focusable control");
        assert(Array.from(recentList.querySelectorAll("button")).some(function (node) {
            return node.textContent === "Clear recent searches";
        }), "Recent searches can be cleared");
        await debounced();
        assert.strictEqual(window.document.querySelectorAll(".media-card").length, 0, "An empty query shows no results");
        var searchesBefore = hubSearches().length;
        recentButton.click();
        await settle();
        assert.strictEqual(window.document.querySelector(".keyboard-text").textContent, "SYNTHETIC", "A recent search fills the query");
        assert(hubSearches().length > searchesBefore, "A recent search runs the search");
        assert(window.document.querySelector(".search-recents").hidden, "Recents hide once a query is present");
        assert.strictEqual(window.document.querySelectorAll(".media-card").length, 1);
        window.document.querySelector(".media-card").click();
        assert.strictEqual(window.document.activeElement.textContent, "Back",
            "A pending detail request must retain a focused escape control");
        await settle();
        assert(window.document.querySelector(".synopsis").textContent.includes("Synthetic metadata"));
        assert(window.document.querySelector(".detail-expand"),
            "A clamped synopsis must have a full-description route");
        assert(window.document.querySelector(".detail-overflow[hidden]"),
            "Secondary detail actions must not form a visible wall of pills");
        assert.strictEqual(window.document.querySelector(".detail-progress-time").textContent, "0:25 / 1:40",
            "The detail page shows the resume position in numbers");
        click("Read more");
        assert(window.document.querySelector(".detail-synopsis").classList.contains("expanded"));
        click("Read less");
        assert.strictEqual(requests.filter(function (request) { return request.path === "/:/timeline"; }).length, 0);
        click("More");
        click("File information");
        var fileInfo = window.document.querySelector(".file-info-panel");
        assert(fileInfo && !fileInfo.hidden, "The detail inspector opens as a separate read-only panel");
        var headings = Array.from(fileInfo.querySelectorAll(".file-info-heading"));
        assert.deepStrictEqual(headings.map(function (node) { return node.textContent; }), ["General", "Audio", "Subtitles"],
            "File information is split into sections");
        assert(headings.every(function (node) { return node.getAttribute("aria-expanded") === "false"; }), "Sections start collapsed");
        assert(Array.from(fileInfo.querySelectorAll(".file-info-body")).every(function (node) { return node.hidden; }));
        assert.strictEqual(window.document.activeElement, headings[0], "Opening starts on the first section");
        headings[0].click();
        assert(!fileInfo.querySelector(".file-info-body").hidden, "Enter on a heading opens its section");
        assert.strictEqual(headings[0].getAttribute("aria-expanded"), "true");
        assert(fileInfo.textContent.includes("Container: mp4"));
        headings[0].click();
        assert(fileInfo.querySelector(".file-info-body").hidden, "Enter again collapses it");
        // A section taller than the panel is paged through with Up/Down. Layout is simulated: the panel shows 500px,
        // the expanded Subtitles heading sits at 160 and Close menu 2000px down (about 20 tracks of content between).
        var buttons = Array.from(fileInfo.querySelectorAll("button"));
        var tops = [0, 80, 160, 2000];
        var scrolled = 0;
        Object.defineProperty(fileInfo, "scrollTop", { configurable: true, get: function () { return scrolled; },
            set: function (value) { scrolled = Math.max(0, value); } });
        Object.defineProperty(fileInfo, "clientHeight", { configurable: true, get: function () { return 500; } });
        fileInfo.getBoundingClientRect = function () { return { top: 0, bottom: 500, left: 0, right: 700, width: 700, height: 500 }; };
        buttons.forEach(function (node, index) {
            node.getBoundingClientRect = function () {
                return { top: tops[index] - scrolled, bottom: tops[index] + 60 - scrolled, left: 0, right: 700, width: 700, height: 60 };
            };
        });
        var key = function (code) { window.document.activeElement.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: code, bubbles: true, cancelable: true })); };
        buttons[2].focus();
        buttons[2].click();
        var presses = 0;
        while (window.document.activeElement === buttons[2] && presses < 20) { key(40); presses += 1; }
        assert.strictEqual(window.document.activeElement, buttons[3], "Down reaches the next control after paging through the section");
        assert(presses > 3 && scrolled > 1000, "Down scrolled the long section instead of jumping past it");
        presses = 0;
        while (window.document.activeElement === buttons[3] && presses < 20) { key(38); presses += 1; }
        assert.strictEqual(window.document.activeElement, buttons[2], "Up pages back to the expanded heading");
        assert(presses > 3 && scrolled < 700, "Up scrolled back through the section");
        buttons[2].click();
        assert(!fileInfo.textContent.includes("Size:"), "Unreported file size must be omitted rather than called zero");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 27, bubbles: true }));
        assert(fileInfo.hidden, "Back closes the inspector without leaving item details");
        var mutations = function () {
            return requests.filter(function (request) {
                return ["/:/scrobble", "/:/unscrobble", "/actions/removeFromContinueWatching"].indexOf(request.path) !== -1;
            });
        };
        click("More");
        assert(!Array.from(window.document.querySelectorAll(".detail-overflow button")).some(function (node) {
            return node.textContent === "Back";
        }), "The More submenu has no Back button; the remote's Back key closes it");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 27, bubbles: true }));
        assert(window.document.querySelector(".detail-overflow").hidden);
        assert.strictEqual(window.document.activeElement.getAttribute("aria-label"), "More");
        click("More");
        click("Mark unwatched");
        assert(window.document.body.textContent.includes("saved resume position"));
        assert.strictEqual(mutations().length, 0, "Opening a confirmation must not mutate Plex");
        click("Cancel");
        await settle();
        assert.strictEqual(mutations().length, 0, "Cancellation must not mutate Plex");
        click("More");
        click("Mark watched");
        click("Confirm mark watched");
        Array.from(window.document.querySelectorAll("button")).find(function (node) {
            return node.textContent === "Confirm mark watched";
        }).click();
        await settle();
        assert.strictEqual(mutations().length, 1, "Repeated confirmation must produce exactly one write");
        click("More");
        click("Mark unwatched");
        click("Confirm mark unwatched");
        await settle();
        click("More");
        click("Remove from Continue Watching");
        click("Confirm remove from continue watching");
        await settle();
        assert.deepStrictEqual(mutations().map(function (request) { return request.path; }),
            ["/:/scrobble", "/:/unscrobble", "/actions/removeFromContinueWatching"]);
        clickPlay();
        await settle();
        assert.strictEqual(state, "PLAYING");
        // Until the picture moves, the details page stays on screen under the spinner instead of the TV's black.
        var still = window.document.querySelector(".player-still");
        assert(still && still.querySelector(".synopsis"), "The details page is held while the stream starts");
        assert(!still.querySelector("[id]"), "with no ids left to answer the player's lookups");
        assert.strictEqual(window.document.body.className, "playing holding-page", "and the player's controls out of sight");
        assert(window.document.getElementById("buffering-ring"), "under the spinner");
        // Pause / Play before then is remembered: this TV throws on a pause right after play.
        function pauses() { return nativeCalls.filter(function (call) { return call === "pause"; }).length; }
        var pausesBeforeStart = pauses();
        var transport = window.document.querySelectorAll(".playback-controls button")[3];
        click("Pause / Play");
        await settle();
        assert(!window.document.getElementById("playback-error"), "Pausing a start is not a playback problem");
        assert.strictEqual(pauses(), pausesBeforeStart, "AVPlay is not asked to pause before the picture moves");
        assert(/menu-icon-play/.test(transport.className), "but the control shows it will be paused");
        assert.strictEqual(window.document.querySelector(".playback-controls").querySelectorAll("button").length, 8,
            "Playback exposes the transport, direct track controls, More, Info and Chapters on the main overlay");
        var scrubSurface = window.document.querySelector(".playback-progress");
        assert.strictEqual(scrubSurface.getAttribute("role"), "slider",
            "Playback position is a remote-focusable scrub surface, not a passive progress bar");
        assert.strictEqual(scrubSurface.getAttribute("tabindex"), "0",
            "The scrub surface is reachable by remote focus");
        assert.strictEqual(scrubSurface.getAttribute("aria-valuenow"), "0",
            "The slider exposes its current position");
        // Past the synthetic intro, so no Skip Intro button takes focus.
        listener.oncurrentplaytime(6000);
        assert(!window.document.querySelector(".player-still"), "The moving picture replaces the held page");
        assert(!window.document.getElementById("buffering-ring"), "and the spinner");
        assert.strictEqual(window.document.body.className, "playing");
        assert.strictEqual(state, "PAUSED", "The remembered pause applies once the picture moves");
        assert.strictEqual(pauses(), pausesBeforeStart + 1);
        click("Pause / Play");
        await settle();
        assert.strictEqual(state, "PLAYING");
        function remote(type, key, repeat) {
            window.document.dispatchEvent(new window.KeyboardEvent(type, { keyCode: key, repeat: !!repeat, bubbles: true }));
        }
        var playerControls = Array.from(window.document.querySelectorAll(".playback-controls button"));
        var rewindIndex = 2, pauseIndex = 3, forwardIndex = 4, chaptersIndex = 5, moreIndex = 6;
        assert.strictEqual(window.document.activeElement, playerControls[rewindIndex], "Playback starts with rewind focused");
        playerControls[pauseIndex].focus();
        remote("keydown", 38);
        assert.strictEqual(window.document.activeElement, scrubSurface, "Up from transport controls focuses playback position");
        remote("keydown", 40);
        assert.strictEqual(window.document.activeElement, playerControls[pauseIndex], "Down returns to the transport control that opened the slider");
        var seeksBeforeNavigation = seekTargets.length;
        remote("keydown", 39);
        assert.strictEqual(window.document.activeElement, playerControls[forwardIndex],
            "Right from focused Pause / Play must focus Forward rather than scrub");
        remote("keydown", 39);
        assert.strictEqual(window.document.activeElement, playerControls[chaptersIndex], "Right from Forward reaches Chapters");
        remote("keydown", 39);
        assert.strictEqual(window.document.activeElement, playerControls[moreIndex], "Right from Chapters reaches More");
        remote("keydown", 37);
        assert.strictEqual(window.document.activeElement, playerControls[chaptersIndex], "Left from More returns to Chapters");
        remote("keydown", 37);
        remote("keydown", 37);
        assert.strictEqual(window.document.activeElement, playerControls[pauseIndex], "Left from Forward returns to Pause / Play");
        remote("keydown", 37);
        assert.strictEqual(window.document.activeElement, playerControls[rewindIndex], "Left from Pause / Play reaches rewind");
        remote("keydown", 37);
        assert.strictEqual(window.document.activeElement, playerControls[1], "Left from rewind crosses to Audio");
        remote("keydown", 37);
        assert.strictEqual(window.document.activeElement, playerControls[0], "Left from Audio reaches Subtitles");
        remote("keydown", 37);
        assert.strictEqual(window.document.activeElement.textContent, "Info", "Left from Subtitles wraps to Info");
        remote("keydown", 39);
        assert.strictEqual(window.document.activeElement, playerControls[0], "Right from Info wraps to Subtitles");
        remote("keydown", 39);
        remote("keydown", 39);
        remote("keydown", 39);
        assert.strictEqual(window.document.activeElement, playerControls[pauseIndex], "Right returns from rewind to Pause / Play");
        remote("keydown", 39);
        remote("keydown", 39);
        remote("keydown", 39);
        assert.strictEqual(window.document.activeElement, playerControls[moreIndex],
            "Right traverses Forward and Chapters to More");
        assert.strictEqual(state, "PLAYING", "Directional traversal must not toggle playback");
        assert.strictEqual(seekTargets.length, seeksBeforeNavigation, "Focused HUD navigation must not seek");
        var seeksBeforeOptions = seekTargets.length;
        remote("keydown", 13);
        assert(window.document.getElementById("player-menu"), "OK on More must open playback options");
        assert.strictEqual(seekTargets.length, seeksBeforeOptions, "Opening More must not seek");
        var firstOption = window.document.activeElement;
        remote("keydown", 39);
        assert.notStrictEqual(window.document.activeElement, firstOption,
            "Directional arrows inside playback options must continue menu navigation");
        assert.strictEqual(seekTargets.length, seeksBeforeOptions, "Menu navigation must not seek");
        remote("keydown", 27);
        assert(!window.document.getElementById("player-menu"), "Back closes playback options");
        assert.strictEqual(window.document.activeElement, playerControls[moreIndex],
            "Back from playback options restores focus to More");
        click("More");
        click("Stats for nerds");
        var stats = window.document.getElementById("playback-stats");
        var reasonBeforeClock = Array.from(stats.querySelectorAll("p")).filter(function (node) {
            return node.textContent.indexOf("Reason:") === 0;
        })[0];
        assert(reasonBeforeClock, "Stats must expose the playback decision reason");
        assert.strictEqual(stats.querySelectorAll(".playback-stats-position").length, 1,
            "Stats must have exactly one live position row");
        listener.oncurrentplaytime(12000);
        assert(stats.contains(reasonBeforeClock), "A clock update must not replace the decision reason");
        assert.strictEqual(Array.from(stats.querySelectorAll("p")).filter(function (node) {
            return node.textContent.indexOf("Reason:") === 0;
        }).length, 1, "Stats retain one decision reason after a clock update");
        assert(stats.querySelector(".playback-stats-position").textContent.indexOf("0:12") !== -1,
            "The live position row updates without overwriting explanation rows");
        click("Close");
        var pauseControl = Array.from(window.document.querySelectorAll("button")).find(function (node) {
            return node.textContent === "Pause / Play";
        });
        pauseControl.focus();
        function arrow(type, key, repeat) {
            window.document.dispatchEvent(new window.KeyboardEvent(type, { keyCode: key, repeat: !!repeat, bubbles: true }));
        }
        hideHud();
        var seekCount = seekTargets.length, originalPosition = position;
        arrow("keydown", 39);
        for (var repeat = 0; repeat < 7; repeat++) { arrow("keydown", 39, true); }
        assert.strictEqual(seekTargets.length, seekCount, "A held arrow must not issue a seek per repeat");
        arrow("keyup", 39); await settle();
        assert.strictEqual(window.document.querySelector(".player-hud").hidden, false,
            "A hidden-HUD seek reveals the controls without redirecting the held input");
        assert.strictEqual(seekTargets.length, seekCount, "Releasing the key sends nothing: the seek waits 0.4 s after the last press");
        sendPendingSeek(); await settle();
        assert.strictEqual(seekTargets.length, seekCount + 1, "Held Right commits ONE seek");
        assert(position > originalPosition + 80000, "Held repeats accelerate the pending target");
        for (repeat = 0; repeat < 100; repeat++) { arrow("keydown", 39, repeat > 0); }
        var idleCommit = Array.from(scrubTimers.values())[0];
        assert(idleCommit, "An idle fallback is armed when keyup is lost"); idleCommit(); await settle();
        arrow("keyup", 39);
        assert.strictEqual(position, movie.duration, "Scrub is bounded to duration");
        assert.strictEqual(seekTargets.length, seekCount + 2, "Idle followed by keyup cannot double-commit");
        hideHud();
        for (repeat = 0; repeat < 100; repeat++) { arrow("keydown", 37, repeat > 0); }
        arrow("keyup", 37); sendPendingSeek(); await settle();
        assert.strictEqual(position, 0, "Hidden-HUD reverse scrub remains bounded to zero");
        assert.strictEqual(seekTargets.length, seekCount + 3,
            "Hidden-HUD reverse repeats commit one bounded seek");
        pauseControl.focus();
        hideHud();
        assert.strictEqual(window.document.querySelector(".player-hud").hidden, true,
            "Controls must disappear during uninterrupted playback");
        assert(window.document.querySelector(".app-shell").classList.contains("hud-hidden"),
            "The non-error status must disappear with the playback controls");
        var plays = nativeCalls.filter(function (call) { return call === "pause"; }).length;
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 13, bubbles: true }));
        assert.strictEqual(window.document.querySelector(".player-hud").hidden, false, "OK reveals hidden controls");
        assert.strictEqual(window.document.activeElement, pauseControl, "Revealing the HUD restores its focused control");
        assert.strictEqual(nativeCalls.filter(function (call) { return call === "pause"; }).length, plays,
            "Revealing controls must not also activate the focused button");
        hideHud();
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 19, bubbles: true }));
        await settle();
        assert.strictEqual(state, "PAUSED", "Media Pause must still work while the HUD is hidden");
        assert.strictEqual(hudTimers.size, 0, "Paused playback must not arm HUD hiding");
        assert.strictEqual(window.document.querySelector(".player-hud").hidden, false,
            "Pausing keeps the paused controls visible");
        var pausedPosition = position;
        pauseControl.focus();
        remote("keydown", 38);
        assert.strictEqual(window.document.activeElement, scrubSurface,
            "Up from paused transport focuses the scrub slider");
        var pausedSeeks = seekTargets.length;
        for (var pausedRepeat = 0; pausedRepeat < 7; pausedRepeat++) {
            remote("keydown", 39, pausedRepeat > 0);
        }
        assert(Number(scrubSurface.getAttribute("aria-valuenow")) > pausedPosition,
            "Held Right previews the pending scrub position accessibly");
        remote("keyup", 39);
        sendPendingSeek();
        await settle();
        assert.strictEqual(seekTargets.length, pausedSeeks + 1, "Paused held scrub commits one seek");
        assert(position > pausedPosition && position <= movie.duration, "Paused scrub advances without exceeding duration");
        assert.strictEqual(state, "PAUSED", "Scrubbing while paused leaves playback paused");
        remote("keydown", 13);
        assert.strictEqual(state, "PAUSED", "OK on the slider commits but does not toggle playback");
        remote("keydown", 27);
        assert.strictEqual(window.document.activeElement, pauseControl, "Back from the slider restores its transport control");
        click("Pause / Play");
        await settle();
        assert.strictEqual(state, "PLAYING");
        click("More");
        assert.strictEqual(hudTimers.size, 0);
        remote("keydown", 10009);
        assert(!window.document.getElementById("player-menu"), "Back closes More");
        hideHud();
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 40, bubbles: true }));
        assert.strictEqual(window.document.querySelector(".player-hud").hidden, false);
        listener.oncurrentplaytime(12000);
        assert(window.document.getElementById("playback-time").textContent.startsWith("0:12"));
        assert.strictEqual(window.document.querySelector(".playback-progress").getAttribute("aria-valuenow"), "12000");
        listener.onbufferingstart();
        assert.strictEqual(hudTimers.size, 0, "Buffering must keep controls visible");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 40, bubbles: true }));
        assert.strictEqual(hudTimers.size, 0, "Remote activity during buffering must not arm hiding");
        listener.onbufferingcomplete();
        assert.strictEqual(hudTimers.size, 1, "Buffering completion must restart hiding");
        click("Pause / Play");
        await settle();
        assert.strictEqual(state, "PAUSED");
        assert.strictEqual(hudTimers.size, 0, "Paused playback must not hide its controls");
        assert.strictEqual(window.document.querySelector(".player-hud").hidden, false);
        click("Forward 15 seconds");
        sendPendingSeek();
        await settle();
        assert.strictEqual(position, 27000);
        await new Promise(function (resolve) { window.setTimeout(resolve, 200); });
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 417, bubbles: true }));
        sendPendingSeek();
        await settle();
        assert.strictEqual(position, 42000, "The remote fast-forward key uses the saved 15-second interval");
        click("More");
        click("Chapters");
        assert.strictEqual(hudTimers.size, 0, "The chapter strip must suspend HUD hiding");
        var chapter = window.document.querySelector(".chapter-card");
        assert(chapter && chapter.textContent.indexOf("Chapter one") !== -1, "Chapter cards label their selection");
        chapter.click();
        await settle();
        assert.strictEqual(position, 20000);
        click("More");
        click("Intro and credits");
        remote("keydown", 10009);
        assert.strictEqual(window.document.querySelector("#player-menu h2").textContent, "Playback options", "Back goes up to More");
        remote("keydown", 10009);
        assert(!window.document.getElementById("player-menu"), "and Back again closes it");
        assert(!requests.some(function (request) { return request.method === "PUT" && /^\/library\/parts\//.test(request.path); }),
            "Starting playback with no track choice must not overwrite the PMS stream selection");
        click("Subtitles");
        click("Text size: Medium");
        assert(window.document.querySelector(".player-menu").textContent.includes("Text size: Large"),
            "Caption style controls update the persisted selection");
        click("English");
        click("Text overlay / English");
        await settle();
        var subtitleOverlay = window.document.getElementById("subtitle-text");
        assert(subtitleOverlay.classList.contains("subtitle-size-large"),
            subtitleOverlay.className + " | " + window.document.getElementById("status").textContent);
        assert(subtitleOverlay.classList.contains("subtitle-position-low"));
        var picks = requests.filter(function (request) { return request.method === "PUT" && /^\/library\/parts\//.test(request.path); });
        assert.strictEqual(picks.length, 1, "Choosing the text overlay records that one explicit pick on PMS");
        assert.notStrictEqual(picks[0].query.get("subtitleStreamID"), "0", "An overlay pick must not be written as Subtitles off");
        var overlayDecision = requests.filter(function (request) { return /decision$/.test(request.path); }).pop();
        assert.strictEqual(overlayDecision.query.get("subtitles"), "none", "An app-rendered text subtitle must never also be burned in");
        assert(!window.document.getElementById("playback-error"), "A track change while paused is not a playback problem");
        listener.oncurrentplaytime(1000);
        assert.strictEqual(subtitleOverlay.textContent, "Synthetic caption",
            "The owned external text renderer applies the selected cue at the playback position");
        assert.strictEqual(state, "PAUSED", "It plays to its first frame and stays paused there");
        assert(/menu-icon-play/.test(window.document.querySelectorAll(".playback-controls button")[3].className));
        assert(!window.document.getElementById("playback-error"));
        click("More");
        click("Stop and return to details");
        await settle();
        assert.strictEqual(state, "NONE");
        assert.strictEqual(window.document.body.className, "");
        assert.strictEqual(hudTimers.size, 0, "Teardown must cancel the HUD timer");
        assert(!window.document.querySelector(".app-shell").classList.contains("hud-hidden"));
        var writes = requests.filter(function (request) { return request.path === "/:/timeline"; });
        assert(writes.every(function (request) { return request.method === "POST"; }));
        assert(writes.some(function (request) { return request.query.get("state") === "stopped" && request.query.get("time") === "20000"; }));
        clickPlay(); await settle();
        Object.defineProperty(window.document, "hidden", { configurable: true, value: true });
        window.document.dispatchEvent(new window.Event("visibilitychange")); await settle();
        assert.strictEqual(state, "NONE", "Backgrounding must stop native playback");
        var opens = nativeCalls.filter(function (call) { return call === "open"; }).length;
        Object.defineProperty(window.document, "hidden", { configurable: true, value: false });
        window.document.dispatchEvent(new window.Event("visibilitychange")); await settle();
        assert.strictEqual(nativeCalls.filter(function (call) { return call === "open"; }).length, opens,
            "Foregrounding must never start playback automatically");
        assert(window.document.querySelector(".synopsis"), "Foreground recovery must restore fresh details");
        assert.strictEqual(window.localStorage.length, 4,
            "Only the device identifier, explicitly saved preferences, recent searches and recent speed numbers are stored");
        assert(window.localStorage.getItem("vemm-tizen-recent-searches"));
        assert(window.localStorage.getItem("vemm-tizen-preferences"));
        assert.strictEqual(window.localStorage.getItem("vemm-tizen-account"), null, "Preference changes must not persist account credentials");

        // Resume kept focus for 0.6 s: the stream is negotiated and prepared at the resume point in the background,
        // with nothing written to Plex; pressing Resume then only plays it.
        function count(test) { return requests.filter(function (request) { return test.test(request.path); }).length; }
        function natives(name) { return nativeCalls.filter(function (call) { return call === name; }).length; }
        function preloadNow() {
            var pending = Array.from(preloadTimers.values());
            preloadTimers.clear();
            pending.forEach(function (callback) { callback(); });
        }
        var resumeButton = Array.from(window.document.querySelectorAll("button")).find(function (node) { return node.textContent === "Resume"; });
        assert.strictEqual(window.document.activeElement, resumeButton, "The details page focuses Resume");
        var before = { decisions: count(/decision$/), writes: count(/^\/:\/timeline|playQueues|scrobble/), timelines: count(/^\/:\/timeline/),
            opens: natives("open"), plays: natives("play") };
        assert.strictEqual(preloadTimers.size, 1, "Focus arms one background start");
        preloadNow(); await settle();
        assert.strictEqual(count(/decision$/), before.decisions + 1, "The background start asks PMS for the decision");
        assert.strictEqual(natives("open"), before.opens + 1, "and opens AVPlay");
        assert(nativeCalls.indexOf("PREBUFFER_MODE=25000") !== -1, "prepared at the resume point");
        assert.strictEqual(state, "READY", "It waits, prepared, without playing");
        assert.strictEqual(natives("play"), before.plays);
        assert.strictEqual(count(/^\/:\/timeline|playQueues|scrobble/), before.writes, "Hovering writes nothing to Plex");
        assert.strictEqual(window.document.body.className, "", "The details page stays on screen");
        click("Resume"); await settle();
        assert.strictEqual(state, "PLAYING", "Resume plays the prepared stream");
        assert.strictEqual(count(/decision$/), before.decisions + 1, "with no second decision");
        assert.strictEqual(natives("open"), before.opens + 1, "and no second open");
        assert(count(/^\/:\/timeline/) > before.timelines, "Progress is reported once it plays");
        click("More");
        click("Stop and return to details");
        await settle();
        assert.strictEqual(state, "NONE");
        // Moving away discards it: AVPlay closes and the server conversion is stopped, still with no write.
        resumeButton = Array.from(window.document.querySelectorAll("button")).find(function (node) { return node.textContent === "Resume"; });
        assert.strictEqual(window.document.activeElement, resumeButton);
        preloadNow(); await settle();
        assert.strictEqual(state, "READY");
        before = { writes: count(/^\/:\/timeline|playQueues|scrobble/), stops: count(/transcode\/universal\/stop$/), closes: natives("close") };
        Array.from(window.document.querySelectorAll("button")).find(function (node) { return node.textContent === "Play from beginning"; }).focus();
        await settle();
        assert.strictEqual(state, "NONE", "Leaving Resume closes the prepared player");
        assert.strictEqual(natives("close"), before.closes + 1);
        assert.strictEqual(count(/transcode\/universal\/stop$/), before.stops + 1, "and stops the conversion it began");
        assert.strictEqual(count(/^\/:\/timeline|playQueues|scrobble/), before.writes, "without any write");
        assert.strictEqual(preloadTimers.size, 1, "The newly focused Play from beginning arms its own");
        window.document.querySelector('[aria-label="More"]').focus();
        assert.strictEqual(preloadTimers.size, 0, "and leaving it before 0.6 s cancels it");
        movie.type = "show";
        movie.OnDeck = { Metadata: onDeck };
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 10009, bubbles: true })); await settle();
        window.document.querySelector(".media-card").click(); await settle();
        assert(Array.from(window.document.querySelectorAll("button")).some(function (node) { return node.textContent === "Resume"; }),
            "A show's primary action must resume the server's on-deck episode, not force another season browse");
        click("Resume"); await settle();
        assert.strictEqual(position, 20000);
        assert(requests.some(function (request) { return request.path === "/library/metadata/99"; }),
            "Show playback must resolve the episode identity, never play or update the show itself");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 413, bubbles: true }));
        await settle();
        console.log("Tizen host DOM product journey: browse, subtitle settings, inspector, skip, show playback passed");
    } finally { dom.window.close(); }
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
