"use strict";
// Returning to Home renders from memory and refreshes in the background; finished artwork stays in a
// bounded cache across screens. Every server, title and image is synthetic.
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
    var state = { set: "A", gate: null, sections: 0, hubs: 0, transcodes: 0, extraTitle: false };
    var created = [];
    var revoked = [];
    window.TextDecoder = TextDecoder;
    window.URL.createObjectURL = function () { var url = "blob:synthetic-" + created.length; created.push(url); return url; };
    window.URL.revokeObjectURL = function (url) { revoked.push(url); };
    window.HTMLElement.prototype.getBoundingClientRect = function () {
        var top = /(?:^| )shelf(?: |$)/.test(this.className) ? 500 : 0;
        var bottom = /browse-header/.test(this.className) ? 100 : top;
        return { top: top, bottom: bottom, left: 0, right: 0, width: 0, height: 0 };
    };
    function hubData() {
        var hubs = [];
        for (var h = 0; h < options.hubs; h += 1) {
            var titles = [];
            for (var i = 0; i < 12; i += 1) {
                titles.push({ ratingKey: state.set + (h * 12 + i), type: "movie", title: "Title " + state.set + (h * 12 + i),
                    thumb: "/library/metadata/" + state.set + (h * 12 + i) + "/thumb" });
            }
            if (options.playlist && h === 0) {
                titles[0] = { ratingKey: "P1", type: "playlist", title: "Mix", composite: "/playlists/P1/composite/1" };
            }
            if (state.extraTitle && h === options.hubs - 1) {
                titles[11].title = "Added later";
            }
            hubs.push({ title: "Shelf " + h, Metadata: titles });
        }
        return { Hub: hubs };
    }
    window.fetch = function (target) {
        var url = new URL(target);
        function json(container) {
            return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ MediaContainer: container }); } });
        }
        if (url.pathname === "/photo/:/transcode") {
            state.transcodes += 1;
            state.photos = (state.photos || []).concat(url.searchParams.get("url"));
            return Promise.resolve(new Response(new Uint8Array(state.imageBytes || options.imageBytes || 3), { headers: { "Content-Type": "image/png" } }));
        }
        if (url.pathname === "/library/sections") { state.sections += 1; return json({ Directory: [] }); }
        if (url.pathname === "/hubs/promoted") {
            state.hubs += 1;
            return state.gate ? state.gate.then(function () { return json(hubData()); }) : json(hubData());
        }
        throw new Error("Unexpected synthetic request: " + url.pathname);
    };
    ["js/plex-api.js", "js/preferences.js", "js/i18n.js", "js/home-hero.js", "main.js"].forEach(function (file) {
        window.eval(fs.readFileSync(path.join(app, file), "utf8"));
    });
    var document = window.document;
    function settle() {
        var chain = Promise.resolve();
        for (var i = 0; i < 40; i += 1) { chain = chain.then(function () {}); }
        return chain.then(function () { return new Promise(function (resolve) { setImmediate(resolve); }); });
    }
    function click(label) {
        var node = Array.from(document.querySelectorAll("button")).find(function (entry) { return entry.textContent === label; });
        assert(node, "Missing control: " + label);
        node.click();
    }
    function back() { document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 8, bubbles: true })); }
    function pendingImages() {
        return Array.from(document.querySelectorAll("img")).filter(function (image) {
            return image.src.indexOf("blob:") === 0 && typeof image.onload === "function";
        });
    }
    // Home draws its later shelves after the first paint.
    async function showAllShelves() {
        await new Promise(function (resolve) { setTimeout(resolve, 20); });
        var all = document.querySelectorAll(".media-card");
        if (all.length) { all[all.length - 1].dispatchEvent(new window.Event("focus")); }
    }
    async function loadImages() {
        await showAllShelves();
        for (var batch = 0; batch < 400; batch += 1) {
            var pending = pendingImages();
            if (!pending.length) {
                await settle();
                pending = pendingImages();
                if (!pending.length) { return; }
            }
            pending.forEach(function (image) { image.onload(); });
            await settle();
        }
    }
    async function connect() {
        document.querySelector('input[name="server"]').value = "https://pms.synthetic.invalid";
        click("Connect");
        await settle();
    }
    return { dom: dom, document: document, state: state, created: created, revoked: revoked,
        settle: settle, click: click, back: back, loadImages: loadImages, showAllShelves: showAllShelves, connect: connect,
        cards: function () { return Array.from(document.querySelectorAll(".media-card")); },
        track: function () { return document.querySelector(".home-track"); },
        status: function () { return document.getElementById("status").textContent; },
        live: function () { return created.filter(function (url) { return revoked.indexOf(url) === -1; }); },
        leaveHome: async function () { click("Settings"); await settle(); } };
}

async function homeFromMemory() {
    var t = boot({ hubs: 3 });
    try {
        await t.connect();
        assert.strictEqual(t.state.hubs, 1);
        assert(t.cards().length > 0, "First load renders Home");
        var focused = t.cards()[2];
        focused.focus();
        var position = t.track().style.transform;
        assert(position, "Focus moves the Home track");
        await t.leaveHome();
        assert(!t.track(), "Settings replaces Home");

        // Return: Home renders at once from memory, without Loading, while the refresh is pending.
        var release;
        t.state.gate = new Promise(function (resolve) { release = resolve; });
        t.back();
        assert(t.track(), "Home is rendered synchronously from memory");
        assert.notStrictEqual(t.status(), "Loading...", "Returning to Home shows no loading status");
        assert.strictEqual(t.track().style.transform, position, "The vertical position is restored");
        assert.strictEqual(t.document.activeElement.textContent, focused.textContent, "Focus is restored");
        var shown = t.cards()[0];
        await t.settle();
        assert.strictEqual(t.state.hubs, 2, "A background refresh is requested");
        release();
        await t.settle();
        assert(shown.isConnected, "Unchanged data does not re-render Home");

        // A changed refresh re-renders, keeping focus and position.
        await t.leaveHome();
        t.state.gate = new Promise(function (resolve) { release = resolve; });
        t.state.extraTitle = true;
        t.back();
        assert(!t.cards().some(function (card) { return card.textContent.indexOf("Added later") !== -1; }));
        var before = t.cards()[2];
        position = t.track().style.transform;
        release();
        await t.settle();
        assert(t.cards().some(function (card) { return card.textContent.indexOf("Added later") !== -1; }),
            "Changed data is rendered after the refresh");
        assert(!before.isConnected, "Changed data re-renders Home");
        assert.strictEqual(t.track().style.transform, position, "The refresh keeps the vertical position");
        assert.strictEqual(t.document.activeElement.textContent, focused.textContent, "The refresh keeps focus");

        // A refresh that arrives after the user left Home must not overwrite the newer view.
        await t.leaveHome();
        t.state.gate = new Promise(function (resolve) { release = resolve; });
        t.state.extraTitle = false;
        t.back();
        assert(t.track());
        await t.leaveHome();
        release();
        await t.settle();
        assert(!t.track(), "A stale Home refresh cannot replace Settings");

        // Changing server drops the remembered Home: the next connection loads it again.
        t.state.gate = null;
        t.back();
        await t.settle();
        var sections = t.state.sections;
        t.click("Account");
        t.click("Change server");
        await t.connect();
        assert.strictEqual(t.state.sections, sections + 1, "A new connection loads Home again");
    } finally { t.dom.window.close(); }
}

async function artworkCache() {
    var t = boot({ hubs: 16 });
    try {
        await t.connect();
        await t.loadImages();
        var requested = t.state.transcodes;
        assert(requested > 150, "The first load downloads every thumbnail");
        assert.strictEqual(t.live().length, requested, "Every thumbnail stays cached while it fits the budget");
        var cached = t.live();

        await t.leaveHome();
        assert.deepStrictEqual(t.live(), cached, "Leaving a screen keeps finished artwork");

        // Returning attaches cached thumbnails immediately and downloads only the missing ones.
        t.back();
        await t.showAllShelves();
        var attached = t.cards().filter(function (card) { return card.querySelector("img").src.indexOf("blob:") === 0; });
        assert(attached.length >= 100, "Cached thumbnails are attached immediately");
        await t.settle();
        await t.loadImages();
        assert(t.state.transcodes - requested < requested - 100, "Cached artwork is not downloaded again");
        assert(t.live().length <= requested);

        // New artwork beyond the byte budget evicts the least recently used images that are no longer on screen.
        await t.leaveHome();
        t.state.set = "B";
        t.state.imageBytes = 512 * 1024;
        t.back();
        await t.settle();
        await t.loadImages();
        assert(t.live().length <= 64, "The cache stays within its byte budget");
        cached.forEach(function (url) { assert(t.revoked.indexOf(url) !== -1, "Evicted artwork is revoked"); });

        // Changing server clears the cache.
        t.click("Account");
        t.click("Change server");
        assert.strictEqual(t.live().length, 0, "Changing server releases every cached image");
    } finally { t.dom.window.close(); }
}

async function artworkByteBudget() {
    var t = boot({ hubs: 16, imageBytes: 512 * 1024 });
    try {
        await t.connect();
        await t.loadImages();
        var live = t.live().length;
        assert(live > 0 && live <= 64, "512 KB artwork is held to the 32 MB total budget: " + live);
    } finally { t.dom.window.close(); }
}

// Plex gives a playlist its picture as a composite rather than a thumb.
async function playlistComposite() {
    var t = boot({ hubs: 1, playlist: true });
    try {
        await t.connect();
        await t.loadImages();
        assert((t.state.photos || []).some(function (photo) { return photo.indexOf("/playlists/P1/composite/") === 0; }),
            "A playlist card shows its composite picture");
    } finally { t.dom.window.close(); }
}

homeFromMemory().then(artworkCache).then(artworkByteBudget).then(playlistComposite).then(function () {
    console.log("Tizen Home from memory and bounded artwork cache: passed");
}).catch(function (error) { console.error(error); process.exitCode = 1; });
