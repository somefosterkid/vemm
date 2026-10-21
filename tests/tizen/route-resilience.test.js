"use strict";
var assert = require("assert"), fs = require("fs"), path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");
function harness() {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), { url: "https://synthetic.invalid", runScripts: "outside-only" });
    var w = dom.window, pending = [], calls = [];
    function request(name) { calls.push(name); return new Promise(function (ok, fail) { pending.push({ ok: ok, fail: fail, name: name }); }); }
    var client = new Proxy({ then: undefined, token: "synthetic-token", url: "https://synthetic.invalid", cancelRequests: function () {}, image: function () { return Promise.reject(new Error("no art")); } }, {
        get: function (obj, name) { if (name === "then") { return undefined; } return obj[name] || function () { return request(name); }; }
    });
    w.fetch = function () { assert.fail("No network in route journey"); };
    ["i18n", "plex-api", "preferences", "queue", "subtitles", "television-ui", "search-ui", "catalogue-ui", "home-hero"].forEach(function (name) {
        var text = fs.readFileSync(path.join(app, "js", name + ".js"), "utf8");
        if (name === "television-ui") { text = text.replace("return { open: openTelevision };", "return { open: openTelevision, guide: openGuide, program: openProgram, channel: openChannel, recordings: openRecordings };"); }
        if (name === "catalogue-ui") { text = text.replace("open: openWatchlist", "open: openWatchlist"); }
        w.eval(text);
    });
    w.VemmTelevision = { create: function () { return client; } };
    var text = fs.readFileSync(path.join(app, "main.js"), "utf8");
    text = text.slice(0, text.lastIndexOf('    addConnectForm("");')) +
        'window.journey = { openProfiles: openProfiles, openServers: openServers, openFavorites: openFavorites, loadHome: loadHome, openSection: openSection, openListing: openListing, openSearch: openSearch, openDetail: openDetail, openPerson: openPerson, openSettings: openSettings, addConnectForm: addConnectForm, choices: settingsChoices, confirm: confirmServiceWrite, renderDetail: renderDetail, back: backView, visit: visit, service: serviceView, status: setStatus, focus: focusFirst, button: button, element: element, group: group, tile: titleTile, catalogue: catalogueUi, find: findCatalogueItem, state: function() { return { currentOffset: currentOffset, currentItems: currentItems.slice(), currentSection: currentSection }; }, setup: function(c) { currentClient=c; accountClient=c; servers=[]; homeSections=[]; } }; }());';
    w.eval(text); w.journey.setup(client);
    var j = w.journey, screen = w.document.getElementById("screen");
    var options = { client: function () { return client; }, preferences: function () { return { language: "en" }; },
        screen: screen, view: j.service, generation: function () { return Number(screen.getAttribute("test-generation")); },
        button: j.button, element: j.element, group: j.group, tile: j.tile, visit: j.visit,
        translate: w.VemmI18n.text, status: j.status, focus: j.focus };
    var original = options.view;
    options.view = function () { var value = original.apply(null, arguments); screen.setAttribute("test-generation", value); return value; };
    return { w: w, dom: dom, j: j, client: client, pending: pending, calls: calls, screen: screen,
        tv: w.VemmTelevisionUi.create(options),
        click: function (label) { var b = Array.from(screen.querySelectorAll("button")).find(function (node) { return node.textContent === label; }); assert(b, "Missing " + label); b.click(); },
        fail: function () { pending.splice(0).forEach(function (p) { p.fail(new Error("Synthetic outage")); }); },
        empty: function (value) { pending.splice(0).forEach(function (p) { p.ok(p.name === "personCredits" ? [] : value); }); }
    };
}
var section = { key: "1", title: "Movies", type: "movie" };
var provider = { identifier: "synthetic", Feature: [{ type: "subscribe", flavor: "record" }, { type: "grid" }] };
var routes = [
    ["profiles", function(h) { h.j.openProfiles(); }, []],
    ["servers", function(h) { h.j.openServers(); }, []],
    ["favorites", function(h) { h.j.openFavorites(); }, []],
    ["home", function(h) { h.j.loadHome(false); }, []],
    ["library", function(h) { h.j.openSection(section); }, { items: [], totalSize: 0, offset: 0 }],
    ["listing/collections/children", function(h) { h.j.openListing("Collection", function () { return h.client.getChildren(); }, h.client); }, { Metadata: [] }],
    ["details", function(h) { h.j.openDetail("1", h.client); }, null],
    ["person", function(h) { h.j.openPerson({ tag: "Person", id: "1", tagKey: "synthetic" }, h.client); }, { Metadata: [] }],
    ["television", function(h) { h.tv.open(); }, []],
    ["guide", function(h) { h.tv.guide(provider); }, {}],
    ["program", function(h) { h.tv.program({ guid: "synthetic", title: "Program" }, provider); }, []],
    ["channel-schedule", function(h) { h.tv.channel(provider, { gridKey: "synthetic" }); }, []],
    ["recordings", function(h) { h.tv.recordings(false); }, []],
    ["subscriptions", function(h) { h.tv.recordings(true); }, []],
    ["search", function(h) { h.j.openSearch("Synthetic"); }, {}],
    ["catalogue-search", function(h) { h.j.catalogue().search("Synthetic", true); }, []],
    ["catalogue-detail", function(h) { h.j.catalogue().item({ title: "Synthetic", guid: "plex://movie/synthetic" }, true); }, {}],
    ["find/other-servers", function(h) { h.j.find({ type: "movie", guid: "plex://movie/synthetic" }); }, []],
    ["lineups", async function(h) { h.tv.guide(provider); h.click("Channel lineups"); }, []],
    ["channels", async function(h) { h.tv.guide(provider); h.click("Channel lineups"); h.empty([{ lineup: "Synthetic lineup" }]); await settle(); h.click("Synthetic lineup"); }, []],
    ["recording-destination", async function(h) { h.tv.program({ guid: "synthetic" }, provider); h.empty([{ title: "Synthetic template", type: 1 }]); await settle(); h.click("Record / Synthetic template"); }, []],
    ["watchlist", function(h) { h.j.catalogue().watchlist(); }, { size: 0, Metadata: [] }]
];
async function settle() { for(var i=0;i<8;i++) { await new Promise(function (ok) { setImmediate(ok); }); } }
async function run() {
    var staleRetry = harness();
    try {
        staleRetry.j.openSection(section);
        staleRetry.empty({ items: [{ ratingKey: "1", title: "Synthetic title", type: "movie" }],
            totalSize: 500, offset: 0 });
        await settle();
        var pagingBeforeSearch = staleRetry.j.state();
        assert.strictEqual(pagingBeforeSearch.currentOffset, 1);
        assert.strictEqual(pagingBeforeSearch.currentItems.length, 1);
        staleRetry.j.openSearch();
        assert(staleRetry.screen.querySelector(".search-keyboard"), "Search is the built-in keyboard");
        staleRetry.j.status("Search failed", true);
        var emptyRetry = Array.from(staleRetry.screen.querySelectorAll("button")).find(function (button) {
            return /Retry/.test(button.textContent);
        });
        assert(emptyRetry, "Search validation should keep its own route action");
        emptyRetry.click();
        await settle();
        assert.deepStrictEqual(staleRetry.calls, ["getLetters", "getSectionItems"],
            "Search Retry must never invoke the previous library's page loader");
        var pagingAfterRetry = staleRetry.j.state();
        assert.strictEqual(pagingAfterRetry.currentOffset, pagingBeforeSearch.currentOffset,
            "Search Retry must not advance the previous library offset");
        assert.strictEqual(pagingAfterRetry.currentItems.length, pagingBeforeSearch.currentItems.length,
            "Search Retry must not mutate the previous library items");
        assert(staleRetry.screen.className.indexOf("screen-search") !== -1,
            "Search Retry must remain on Search");
    } finally { staleRetry.dom.window.close(); }
    for (var route of routes) {
        var h = harness();
        try {
            await route[1](h); await settle();
            assert(h.pending.length, route[0] + " must fetch");
            assert(/Loading|Searching|Finding|Discovering|biography/i.test(h.w.document.getElementById("status").textContent), route[0] + " loading state");
            h.fail(); await settle();
            var count = h.calls.length;
            var retry = Array.from(h.screen.querySelectorAll("button")).find(function (b) { return /Retry/.test(b.textContent); });
            assert(retry, route[0] + " error must expose Retry"); retry.click(); await settle();
            assert(h.calls.length > count, route[0] + " Retry must re-fetch rather than restore stale data");
            h.empty(route[2]); await settle();
            assert(!/^Loading/.test(h.w.document.getElementById("status").textContent), route[0] + " must settle empty or missing-data state");
            assert(h.screen.querySelector(".empty-state, .inline-error, .route-empty, .route-retry") || /empty|No |no |0 |Who|Choose|Select|Not|unavailable|failed/i.test(h.w.document.body.textContent), route[0] + " empty or unavailable state");
            var control = h.screen.querySelector("button:not([disabled]), input"); assert(control, route[0] + " actionable return control");
            control.focus(); h.screen.scrollTop = 123;
            h.j.visit(function () { h.j.openSettings(); }); h.j.back(); await settle(); h.empty(route[2]); await settle();
            assert.strictEqual(h.screen.scrollTop, 123, route[0] + " Back restores scroll");
            assert.strictEqual(h.w.document.activeElement.textContent, control.textContent, route[0] + " Back restores focus");
        } finally { h.dom.window.close(); }
    }
    // Cached/local routes have no read to retry: assert usable controls and return state,
    // rather than inventing network loading/errors for a settings or confirmation dialog.
    var localRoutes = [
        ["manual-server/pairing", function(h) { h.j.addConnectForm(""); }],
        ["settings/about", function(h) { h.j.openSettings(); }],
        ["settings-choice", function(h) { h.j.choices("Quality", [{label:"Synthetic",value:"synthetic"}], "synthetic", function(){}); }],
        ["confirmation", function(h) { h.j.confirm("Synthetic", function() { assert.fail("Confirmation must not write without OK"); }, function() { h.j.openSettings(); }); }],
        ["cached-movie/show/season/music/photo-details", function(h) { h.j.renderDetail({ ratingKey:"1",title:"Synthetic",type:"movie",Media:[] }, h.client); }]
    ];
    for(var local of localRoutes) {
        h = harness();
        try { local[1](h); await settle(); assert(h.screen.querySelector("button,input"), local[0]+" has an exit/action"); }
        finally { h.dom.window.close(); }
    }
    // Player/HUD/tracks/quality/chapters/subtitle-search and photo viewer/slideshow
    // have their actual native/decoder loading, error, empty and return journeys in
    // product-ui.test.js, subtitle-search.test.js, media-ui.test.js and photos.test.js.
    console.log("Tizen local route action/exit journeys: passed (" + localRoutes.length + ")");
    console.log("Tizen table-driven route loading/empty/error/Retry/Back journeys: passed (" + routes.length + " request routes)");
}
run().catch(function(e) { console.error(e); process.exitCode=1; });
