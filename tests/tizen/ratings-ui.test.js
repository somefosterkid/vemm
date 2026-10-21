"use strict";
// Details page rating sources, the per-viewer "Ratings shown" choice and the owner-only library ratings source.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");

function boot(options) {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    var requests = [];
    window.setTimeout = function () { return 1; };
    window.clearTimeout = function () {};
    window.TextDecoder = TextDecoder;
    window.URL.createObjectURL = function () { return "blob:synthetic"; };
    window.URL.revokeObjectURL = function () {};
    window.HTMLElement.prototype.getBoundingClientRect = function () {
        return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
    };
    window.localStorage.setItem("vemm-tizen-preferences", JSON.stringify({ quality: "original", language: "en", nextEpisode: "countdown" }));
    var source = options.prefValue;
    window.fetch = function (target, init) {
        var url = new URL(target);
        var method = init && init.method || "GET";
        requests.push({ method: method, path: url.pathname, search: url.search });
        function json(container) {
            return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ MediaContainer: container }); } });
        }
        if (url.pathname === "/library/sections") {
            return json({ Directory: [{ key: "1", title: "Movies", type: "movie" }, { key: "2", title: "Music", type: "artist" }] });
        }
        if (url.pathname === "/library/sections/1/prefs") {
            if (method === "PUT") { source = url.searchParams.get("ratingsSource"); return json({}); }
            return json({ Setting: options.noPref ? [{ id: "enableCinemaTrailers", type: "bool", value: true }] : [
                { id: "ratingsSource", label: "Ratings source", type: "int", value: Number(source), default: 0,
                    enumValues: "0:Rotten Tomatoes|1:IMDb|2:The Movie Database" }] });
        }
        if (url.pathname === "/hubs/promoted") {
            return json({ Hub: [{ hubIdentifier: "home.movies.recent", title: "Recently Added",
                Metadata: [{ ratingKey: "7", type: "movie", title: "Title 7" }] }] });
        }
        if (url.pathname === "/library/metadata/7") {
            return json({ Metadata: [{ ratingKey: "7", type: "movie", title: "Title 7", year: 2020, Rating: [
                { image: "imdb://image.rating", value: 7.8, type: "audience" },
                { image: "rottentomatoes://image.rating.ripe", value: 9.1, type: "critic" },
                { image: "rottentomatoes://image.rating.upright", value: 8.5, type: "audience" },
                { image: "themoviedb://image.rating", value: 7.6, type: "audience" }] }] });
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
                return Promise.resolve([{ id: "synthetic-server", name: "Synthetic", owned: options.owned, token: "t",
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
    return { window: window, document: document, requests: requests, settle: settle, button: button,
        click: async function (label) {
            var node = button(label);
            assert(node, "Missing control: " + label);
            node.click();
            await settle();
        },
        start: async function () { await settle(); await this.click("Profile"); },
        badges: function () {
            return Array.from(document.querySelectorAll(".detail-ratings .detail-rating")).map(function (node) {
                return { cls: node.className, label: node.getAttribute("aria-label"), logo: !!node.querySelector(".rating-logo") };
            });
        },
        ratingsText: function () {
            var row = document.querySelector(".detail-ratings");
            return row ? row.textContent : null;
        },
        stored: function () { return JSON.parse(window.localStorage.getItem("vemm-tizen-preferences")); }
    };
}

(async function () {
    var a = boot({ owned: true, prefValue: "1" });
    await a.start();
    await a.click("Open details");
    var text = a.ratingsText();
    assert(text, "The details page shows a ratings row");
    ["91%", "85%", "7.8/10", "76%"].forEach(function (score) {
        assert(text.indexOf(score) !== -1, "Missing score " + score + " in: " + text);
    });
    var badges = a.badges();
    assert.strictEqual(badges.length, 4);
    assert(badges.every(function (b) { return b.logo && /detail-rating/.test(b.cls); }), "Each badge carries a logo");
    assert(/rating-rt_critic/.test(badges[0].cls) && /rating-fresh/.test(badges[0].cls), "Fresh tomato class");
    assert.strictEqual(badges[0].label, "Rotten Tomatoes critics 91% Fresh", "The source stays accessible");
    assert(/rating-rt_audience/.test(badges[1].cls) && badges[1].label === "Rotten Tomatoes audience 85%");
    assert(/rating-imdb/.test(badges[2].cls) && badges[2].label === "IMDb 7.8/10");
    assert(/rating-tmdb/.test(badges[3].cls) && badges[3].label === "TMDB 76%");
    var css = fs.readFileSync(path.join(app, "css/style.css"), "utf8");
    ["rt_critic", "rt_audience", "imdb", "tmdb"].forEach(function (source) {
        assert(css.indexOf(".rating-" + source + " .rating-logo { background-image: url(\"data:image/svg+xml,") !== -1, source + " has an inline SVG logo");
    });
    assert(css.indexOf(".rating-rotten .rating-logo { background-image: url(\"data:image/svg") !== -1, "Rotten has its own splat");

    a.document.dispatchEvent(new a.window.KeyboardEvent("keydown", { keyCode: 10009, bubbles: true })); await a.settle();
    await a.click("Settings");
    await a.click("Libraries");
    await a.click("Ratings shown: 4 of 4");
    await a.click("IMDb");
    assert.deepStrictEqual(a.stored().ratingSources, ["rt_critic", "rt_audience", "tmdb"], "The choice is persisted");
    assert.strictEqual(a.button("IMDb").getAttribute("aria-pressed"), "false");
    assert.strictEqual(a.button("TMDB").getAttribute("aria-pressed"), "true");
    await a.click("Back");
    assert(a.button("Ratings shown: 3 of 4"), "The settings entry reflects the choice");

    // Owner: one entry per movie/show library, choosing sends a PUT and explains the refresh.
    var entry = a.button("Library ratings source");
    assert(entry, "The owner sees Library ratings source when the setting exists");
    assert(!a.requests.some(function (r) { return r.path === "/library/sections/2/prefs"; }), "Only movie/show libraries are read");
    await a.click("Library ratings source");
    assert(a.button("Movies: IMDb"), "One entry per library with its current value");
    await a.click("Movies: IMDb");
    assert(/refresh/i.test(a.document.body.textContent), "A note says Plex must refresh the library metadata");
    await a.click("Rotten Tomatoes");
    var put = a.requests.filter(function (r) { return r.method === "PUT"; });
    assert.strictEqual(put.length, 1);
    assert.strictEqual(put[0].path, "/library/sections/1/prefs");
    assert.strictEqual(put[0].search, "?ratingsSource=0");

    await a.click("Back");
    await a.click("Back");
    await a.click("Back");
    await a.click("Open details");
    var narrowed = a.ratingsText();
    assert(narrowed.indexOf("7.8/10") === -1 && narrowed.indexOf("91%") !== -1, "Hidden sources are not shown: " + narrowed);

    var viewer = boot({ owned: false, prefValue: "1" });
    await viewer.start();
    await viewer.click("Settings");
    await viewer.click("Libraries");
    assert(viewer.button("Ratings shown: 4 of 4"), "Every viewer picks which ratings to show");
    assert.strictEqual(viewer.button("Library ratings source"), undefined, "Non-owners never see the library setting");
    assert(!viewer.requests.some(function (r) { return /\/prefs$/.test(r.path); }), "Non-owners never read library prefs");

    var plain = boot({ owned: true, prefValue: "1", noPref: true });
    await plain.start();
    await plain.click("Settings");
    await plain.click("Libraries");
    assert.strictEqual(plain.button("Library ratings source"), undefined, "Without a rating setting the entry is hidden");
    assert(plain.requests.some(function (r) { return r.path === "/library/sections/1/prefs"; }), "The owner's server was asked");
    console.log("Tizen rating sources UI: passed");
}()).catch(function (error) { console.error(error.stack || error.message); process.exitCode = 1; });
