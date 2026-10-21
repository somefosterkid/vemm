"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");
var tracks = [1, 2].map(function (id) {
    return { ratingKey: String(id), type: "track", title: "Track " + id, duration: 180000,
        Media: [{ container: "flac", audioCodec: "flac", Part: [{ id: String(20 + id), key: "/library/parts/" + (20 + id) + "/file.flac",
            Stream: [{ streamType: 2, codec: "flac" }] }] }] };
});
var album = { ratingKey: "30", type: "album", title: "Synthetic Album" };
var catalogue = { title: "Synthetic Watchlist movie", guid: "plex://movie/5d776b59ad5437001f79c6f8",
    key: "/library/metadata/5d776b59ad5437001f79c6f8", type: "movie", summary: "Cloud metadata" };
var localMovie = { title: "Local counterpart", guid: catalogue.guid, ratingKey: "60", type: "movie" };
var photos = [1, 2].map(function (id) {
    return { ratingKey: String(40 + id), type: "photo", title: "Photo " + id,
        Media: [{ Part: [{ key: "/library/parts/" + (40 + id) + "/file.jpg" }] }] };
});
async function run() {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    var calls = [];
    var revoked = [];
    var state = "NONE";
    var watchlisted = true;
    var listener;
    var time = 0;
    window.URL.createObjectURL = function () { return "blob:synthetic-" + calls.length; };
    window.URL.revokeObjectURL = function (url) { revoked.push(url); };
    window.TextDecoder = TextDecoder;
    window.webapis = { avplay: {
        getState: function () { return state; }, open: function () { state = "IDLE"; },
        close: function () { state = "NONE"; }, stop: function () { state = "IDLE"; },
        setDisplayRect: function () {}, setDisplayMethod: function () {}, setListener: function (value) { listener = value; },
        prepareAsync: function (success) { state = "READY"; success(); }, getDuration: function () { return 180000; },
        getCurrentTime: function () { return time; }, play: function () { state = "PLAYING"; },
        pause: function () { state = "PAUSED"; }, seekTo: function (position, success) { time = position; success(); }
    } };
    window.fetch = function (target, options) {
        var url = new URL(target);
        calls.push({ path: url.pathname, method: options.method, query: url.searchParams });
        var container;
        if (url.pathname === "/api/v2/home/users") {
            // plex.tv cannot list profiles, so the linked account is offered.
            return Promise.resolve({ ok: false, status: 500 });
        } else if (url.pathname === "/api/v2/resources") {
            return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve([{
                clientIdentifier: "synthetic-server", name: "Synthetic PMS", provides: "server", owned: true,
                accessToken: "synthetic-server-token", connections: [{ uri: "https://pms.synthetic.invalid" }]
            }]); } });
        } else if (url.pathname === "/identity") { container = { machineIdentifier: "synthetic-server" }; }
        else if (url.pathname === "/library/sections/watchlist/all") {
            container = { size: watchlisted ? 1 : 0, Metadata: watchlisted ? [catalogue] : [] };
        } else if (url.pathname === "/library/search") {
            assert.strictEqual(url.hostname, "discover.provider.plex.tv");
            assert.strictEqual(url.searchParams.get("searchProviders"), "discover");
            container = { SearchResults: [{ id: "external", SearchResult: [{ Metadata: catalogue }] }] };
        } else if (url.pathname === catalogue.key) {
            assert.strictEqual(url.hostname, "metadata.provider.plex.tv");
            container = { Metadata: [catalogue] };
        } else if (url.pathname === "/library/sections/1/all") {
            assert.strictEqual(url.searchParams.get("guid"), catalogue.guid);
            assert.strictEqual(url.searchParams.get("includeGuids"), "1");
            container = { Metadata: [localMovie] };
        } else if (url.pathname === "/library/metadata/60") { container = { Metadata: [localMovie] }; }
        else if (url.pathname === "/actions/addToWatchlist") { watchlisted = true; container = {}; }
        else if (url.pathname === "/actions/removeFromWatchlist") {
            assert.strictEqual(options.headers["X-Plex-Token"], "synthetic-account-token");
            watchlisted = false; container = {};
        } else if (url.pathname === "/library/sections") {
            container = { Directory: [{ key: "3", type: "artist", title: "Music" }, { key: "4", type: "photo", title: "Photos" },
                { key: "2", type: "show", title: "TV library" }, { key: "1", type: "movie", title: "Movies" }] };
        } else if (url.pathname === "/hubs/promoted") { container = { Hub: [] }; }
        else if (url.pathname === "/media/providers") {
            container = { MediaProvider: [{ identifier: "tv.plex.providers.epg.cloud:12", title: "Synthetic guide",
                Feature: [{ type: "subscribe", flavor: "record", key: "/media/subscriptions" }, { type: "grid" }] }] };
        } else if (url.pathname === "/tv.plex.providers.epg.cloud:12/hubs/discover") {
            container = { Hub: [{ title: "Now", Metadata: [{ title: "Synthetic program", guid: "plex://episode/abc",
                Media: [{ gridKey: "synthetic-grid", channelTitle: "Synthetic channel", beginsAt: 1791626400 }] }] }] };
        } else if (url.pathname === "/tv.plex.providers.epg.cloud:12/grid") {
            assert.strictEqual(url.searchParams.get("channelGridKey"), "synthetic-grid");
            assert(/^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("date")));
            container = { Metadata: [] };
        } else if (url.pathname === "/media/subscriptions/template") {
            container = { SubscriptionTemplate: [{ MediaSubscription: [{ title: "This Episode", type: 4,
                parameters: "hints%5Bguid%5D=plex%3A%2F%2Fepisode%2Fabc" }] }] };
        } else if (url.pathname === "/media/subscriptions") {
            container = { MediaSubscription: [{ key: "18", title: "Synthetic recording", Setting: [] }] };
        } else if (url.pathname === "/media/subscriptions/18") { container = {}; }
        else if (url.pathname === "/library/sections/3/all") { container = { Metadata: [album], totalSize: 1, offset: 0 }; }
        else if (url.pathname === "/library/sections/4/all") { container = { Metadata: photos, totalSize: 2, offset: 0 }; }
        else if (url.pathname === "/library/metadata/30") { container = { Metadata: [album] }; }
        else if (url.pathname === "/library/metadata/30/children") { container = { Metadata: tracks, totalSize: 2 }; }
        else if (/^\/library\/metadata\/[12]$/.test(url.pathname)) {
            container = { Metadata: [tracks[Number(url.pathname.split("/").pop()) - 1]] };
        } else if (url.pathname === "/music/:/transcode/universal/decision") {
            assert.strictEqual(url.searchParams.get("audioCodec"), "mp3"); container = { generalDecisionCode: 1001 };
        } else if (/^\/library\/parts\/2[12]$/.test(url.pathname) ||
                url.pathname === "/:/timeline" || url.pathname === "/music/:/transcode/universal/stop") { container = {}; }
        else if (url.pathname === "/photo/:/transcode") {
            assert.strictEqual(url.searchParams.get("width"), "1920");
            assert.strictEqual(options.headers["X-Plex-Token"], "synthetic-server-token");
            return Promise.resolve({ ok: true, status: 200, body: new ReadableStream({
                start: function (controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); }
            }) });
        } else { return Promise.resolve({ ok: false, status: 404 }); }
        return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ MediaContainer: container }); } });
    };
    ["plex-api", "avplay", "playback", "queue", "photos", "television", "television-ui", "search-ui", "catalogue-ui", "subtitles", "preferences", "session", "home-hero", "item-menu", "recents", "i18n"].forEach(function (name) {
        window.eval(fs.readFileSync(path.join(app, "js", name + ".js"), "utf8"));
    });
    window.localStorage.setItem("vemm-tizen-account", JSON.stringify({ version: 2, storage: "unencrypted", token: "synthetic-account-token" }));
    window.eval(fs.readFileSync(path.join(app, "main.js"), "utf8"));
    function press(keyCode) { window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: keyCode, bubbles: true })); }
    function click(label) {
        var node = Array.from(window.document.querySelectorAll("button")).find(function (button) { return button.textContent === label; });
        assert(node, "Missing control: " + label + "; current screen: " + window.document.body.textContent);
        node.click();
    }
    async function settle() {
        for (var i = 0; i < 50; i += 1) { await Promise.resolve(); }
        await new Promise(function (resolve) { window.setTimeout(resolve, 0); });
    }
    try {
        await settle();
        click("Use linked account"); await settle();
        click("Synthetic PMS (owned)"); await settle();
        click("Watchlist"); await settle();
        assert(window.document.querySelector(".screen-watchlist .catalogue-grid"), "Watchlist uses the shared poster grid");
        assert(window.document.querySelector('.screen-watchlist .page-toolbar [aria-pressed="true"]'),
            "Watchlist filters expose their selected state");
        click("Synthetic Watchlist movie"); await settle();
        assert(window.document.querySelector(".screen-catalogue-detail .catalogue-poster"), "Catalogue details retain a cover and explicit availability actions");
        click("Remove from Watchlist"); await settle();
        click("Cancel"); await settle();
        assert(watchlisted, "Cancelled Watchlist changes must not write");
        click("Remove from Watchlist"); await settle();
        click("Confirm"); click("Confirm"); await settle();
        assert.strictEqual(calls.filter(function (call) { return call.path === "/actions/removeFromWatchlist"; }).length, 1);
        click("Refresh"); await settle();
        assert(window.document.body.textContent.includes("Your Watchlist is empty."));
        click("Back"); await settle();
        click("Back"); await settle();
        click("Back"); await settle();
        assert(!Array.from(window.document.querySelectorAll("button")).some(function (node) { return node.textContent === "Plex catalogue"; }),
            "The catalogue entry is renamed");
        click("Discover"); await settle();
        assert.strictEqual(window.document.querySelector(".screen h2").textContent, "Discover", "The page title is renamed");
        assert(window.document.querySelector(".screen-catalogue-search .search-keyboard"), "Discover uses the shared built-in keyboard");
        assert.strictEqual(window.document.querySelectorAll(".search-keyboard .keyboard-row").length, 4);
        assert.strictEqual(window.document.querySelectorAll(".search-keyboard .keyboard-row button").length, 12 * 3 + 3);
        assert(!window.document.querySelector('input[type="search"]'), "Discover must not open the Tizen IME");
        assert.strictEqual(window.document.activeElement.textContent, "A");
        assert(window.document.querySelector(".search-keyboard .keyboard-body > .keyboard-keys"), "Discover keeps the keys on the left");
        assert(window.document.querySelector(".search-keyboard .keyboard-body > .catalogue-results"), "Discover results sit beside the keys");
        var discoverSearches = calls.filter(function (call) { return call.path === "/library/search"; }).length;
        "SYNTHETIC".split("").forEach(function (letter) { click(letter); });
        assert.strictEqual(calls.filter(function (call) { return call.path === "/library/search"; }).length, discoverSearches, "Typing is debounced");
        await new Promise(function (resolve) { setTimeout(resolve, 450); }); await settle();
        assert.strictEqual(calls.filter(function (call) { return call.path === "/library/search"; }).length, discoverSearches + 1);
        assert.strictEqual(calls.filter(function (call) { return call.path === "/library/search"; }).pop().query.get("query"), "SYNTHETIC");
        click("Synthetic Watchlist movie"); await settle();
        assert(window.document.querySelector(".synopsis").textContent.includes("Cloud metadata"));
        click("Find in my libraries"); await settle();
        assert.strictEqual(window.document.querySelectorAll(".media-card").length, 1);
        window.document.querySelector(".media-card").click(); await settle();
        assert(window.document.body.textContent.includes("Local counterpart"));
        click("Add to Watchlist"); await settle();
        assert.strictEqual(calls.filter(function (call) { return call.path === "/actions/addToWatchlist"; }).length, 0);
        click("Confirm"); await settle();
        assert(watchlisted);
        click("Refresh"); await settle();
        for (var back = 0; back < 8 && window.document.querySelector(".screen h2").textContent !== "Home"; back += 1) {
            press(10009); await settle();
        }
        assert.strictEqual(window.document.querySelector(".screen h2").textContent, "Home");
        click("Music"); await settle();
        assert.strictEqual(window.document.querySelector(".media-card").getAttribute("data-shape"), "square");
        window.document.querySelector(".media-card").click(); await settle();
        assert(window.document.querySelector(".detail-cover"), "Music uses square artwork rather than a movie poster layout");
        click("Play album"); await settle();
        assert.strictEqual(state, "PLAYING");
        assert(window.document.body.textContent.includes("Track 1"));
        click("More");
        click("Shuffle / On or off"); click("Repeat / Off, one, all");
        listener.onstreamcompleted(); await settle();
        assert(window.document.body.textContent.includes("Track 1"), "Repeat-one must replay the same track");
        click("More");
        click("Next track"); await settle();
        assert(window.document.body.textContent.includes("Track 2"), "Manual next must bypass repeat-one");
        click("More");
        click("Stop and return to details"); await settle();
        press(10009); await settle();
        press(27); await settle();
        click("Photos"); await settle();
        window.document.querySelector(".media-card").click(); await settle();
        assert(window.document.querySelector(".screen-photos .photo-controls"), "Photo navigation is grouped below the image");
        var image = window.document.querySelector(".photo-display");
        assert(image.src.startsWith("blob:"));
        image.onload();
        assert.strictEqual(window.document.querySelector(".screen h2").textContent, "Photo 1");
        var timelines = calls.filter(function (call) { return call.path === "/:/timeline"; }).length;
        click("Next photo"); await settle();
        image.onload();
        assert.strictEqual(window.document.querySelector(".screen h2").textContent, "Photo 2");
        click("Back"); await settle();
        assert(revoked.length >= 2, "Viewer transitions and back must release object URLs");
        assert.strictEqual(calls.filter(function (call) { return call.path === "/:/timeline"; }).length, timelines,
            "Viewing/slideshow photos must not write viewing progress");
        press(27); await settle();
        click("Live TV and DVR"); await settle();
        assert(window.document.querySelector(".screen-television .selection-list"), "Guide providers share selection-list layout");
        click("Synthetic guide"); await settle();
        assert(window.document.querySelector(".screen-guide .title-tile"), "Guide programs have one image/title row each");
        click("Synthetic program"); await settle();
        assert(window.document.body.textContent.includes("Record / This Episode"));
        click("Channel schedule / Synthetic channel"); await settle();
        assert(window.document.body.textContent.includes("No guide programs were returned."));
        click("Back"); await settle();
        assert(!calls.some(function (call) { return call.path === "/media/subscriptions" && call.method === "POST"; }),
            "Inspecting a program must not schedule a recording");
        click("Record / This Episode"); await settle();
        click("TV library"); await settle();
        assert(!calls.some(function (call) { return call.path === "/media/subscriptions" && call.method === "POST"; }));
        click("Confirm"); click("Confirm"); await settle();
        var scheduled = calls.filter(function (call) { return call.path === "/media/subscriptions" && call.method === "POST"; });
        assert.strictEqual(scheduled.length, 1);
        assert.strictEqual(scheduled[0].query.get("hints[guid]"), "plex://episode/abc");
        assert.strictEqual(scheduled[0].query.get("targetLibrarySectionID"), "2");
        click("Refresh"); await settle();
        click("Back"); await settle();
        click("Back"); await settle();
        click("Back"); await settle();
        click("Back"); await settle();
        click("Recording subscriptions"); await settle();
        click("Cancel recording subscription"); await settle();
        assert(!calls.some(function (call) { return call.method === "DELETE"; }));
        click("Cancel"); await settle();
        assert(!calls.some(function (call) { return call.method === "DELETE"; }));
        click("Cancel recording subscription"); await settle();
        click("Confirm"); click("Confirm"); await settle();
        assert.strictEqual(calls.filter(function (call) { return call.method === "DELETE"; }).length, 1,
            "Explicit recording cancellation must not repeat");
        console.log("Tizen linked-account Watchlist/catalogue GUID match/music/photos/DVR confirmation journeys: passed");
    } finally { dom.window.close(); }
}
run().catch(function (error) { console.error(error); process.exit(1); });
