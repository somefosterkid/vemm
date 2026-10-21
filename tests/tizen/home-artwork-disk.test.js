"use strict";
// Home artwork saved on the TV (opt-in): survives a relaunch, is bounded, cleared and failure-proof.
// Every server, title and image is synthetic; fake-indexeddb stands in for the TV's IndexedDB.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var fake = require("fake-indexeddb");
var app = path.resolve(__dirname, "../../samsung/Vemm");
var Store = require(path.join(app, "js/artwork-store.js"));
var Preferences = require(path.join(app, "js/preferences.js"));

// One launch of the app. options.factory is the shared "TV storage"; options.gate delays every disk lookup.
function boot(options) {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    var state = { transcodes: 0, opened: 0 };
    var created = [];
    window.TextDecoder = TextDecoder;
    window.URL.createObjectURL = function () { var url = "blob:synthetic-" + created.length; created.push(url); return url; };
    window.URL.revokeObjectURL = function () {};
    window.HTMLElement.prototype.getBoundingClientRect = function () {
        return { top: /(?:^| )shelf(?: |$)/.test(this.className) ? 500 : 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
    };
    if (options.factory === "broken") {
        window.indexedDB = { open: function () { state.opened += 1; throw new Error("IndexedDB blocked"); } };
    } else if (options.factory) {
        window.indexedDB = {
            open: function (name, version) { state.opened += 1; return options.factory.open(name, version); }
        };
    }
    Object.keys(options.storage || {}).forEach(function (name) { window.localStorage.setItem(name, options.storage[name]); });
    if (options.saveHomeArtwork !== undefined) {
        var saved = { quality: "original", language: "en", nextEpisode: "countdown", saveHomeArtwork: options.saveHomeArtwork };
        Object.keys(options.prefs || {}).forEach(function (name) { saved[name] = options.prefs[name]; });
        window.localStorage.setItem("vemm-tizen-preferences", JSON.stringify(saved));
    }
    if (options.quota) {
        Object.defineProperty(window.navigator, "webkitTemporaryStorage", { configurable: true, value: {
            queryUsageAndQuota: function (ok) { ok(0, options.quota); } } });
    }
    function hubs() {
        var titles = [];
        for (var i = 0; i < 6; i += 1) {
            titles.push({ ratingKey: "K" + i, type: "movie", title: "Title " + i, thumb: "/library/metadata/" + i + "/thumb" });
        }
        return { Hub: [{ title: "Shelf", Metadata: titles }] };
    }
    window.fetch = function (target) {
        var url = new URL(target);
        function json(container) {
            return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ MediaContainer: container }); } });
        }
        if (url.pathname === "/photo/:/transcode") {
            state.transcodes += 1;
            return Promise.resolve(new Response(new Uint8Array(4), { headers: { "Content-Type": "image/png" } }));
        }
        if (url.pathname === "/library/sections") { return json({ Directory: [{ key: "1", title: "Movies", type: "movie" }] }); }
        if (url.pathname === "/hubs/promoted") { return json(hubs()); }
        if (url.pathname === "/library/sections/1/all") {
            return json({ size: 2, totalSize: 2, Metadata: [
                { ratingKey: "L1", type: "movie", title: "Listed 1", thumb: "/library/metadata/L1/thumb" },
                { ratingKey: "L2", type: "movie", title: "Listed 2", thumb: "/library/metadata/L2/thumb" }] });
        }
        throw new Error("Unexpected synthetic request: " + url.pathname);
    };
    window.eval(fs.readFileSync(path.join(app, "js/artwork-store.js"), "utf8"));
    window.eval(fs.readFileSync(path.join(app, "js/device-stats.js"), "utf8"));
    if (options.gate) {
        var open = window.VemmArtworkStore.open;
        window.VemmArtworkStore.open = function (factory) {
            var store = open(factory);
            var get = store.get;
            store.get = function (key) { return options.gate.then(function () { return get(key); }); };
            var getMany = store.getMany;
            store.getMany = function (keys, each) { return options.gate.then(function () { return getMany(keys, each); }); };
            return store;
        };
    }
    ["js/plex-api.js", "js/preferences.js", "js/session.js", "js/i18n.js", "js/home-hero.js"].forEach(function (file) {
        window.eval(fs.readFileSync(path.join(app, file), "utf8"));
    });
    // A signed-in account with one synthetic server that has a machine identifier.
    window.localStorage.setItem("vemm-tizen-account", JSON.stringify({ version: 2, storage: "unencrypted", token: "synthetic-account-token" }));
    window.PlexApi.createAccountClient = function () {
        return {
            getProfiles: function () { return Promise.resolve([{ uuid: "synthetic-profile", title: "Profile" }]); },
            switchProfile: function () { return Promise.resolve("synthetic-profile-token"); },
            getServers: function () {
                return Promise.resolve([
                    { id: "synthetic-server", name: "Synthetic", token: "t", connections: [{ uri: "https://pms.synthetic.invalid" }] },
                    { id: "synthetic-other", name: "Other", token: "t", connections: [{ uri: "https://other.synthetic.invalid" }] }]);
            }
        };
    };
    window.PlexApi.selectServer = function () {
        return Promise.resolve({ client: window.PlexApi.createClient({ baseUrl: "https://pms.synthetic.invalid", token: "t" }) });
    };
    if (options.hang) { window.PlexApi.selectServer = function () { return new Promise(function () {}); }; }
    window.eval(fs.readFileSync(path.join(app, "main.js"), "utf8"));
    var document = window.document;
    function settle() {
        var chain = Promise.resolve();
        for (var i = 0; i < 40; i += 1) { chain = chain.then(function () {}); }
        return chain.then(function () { return new Promise(function (resolve) { setTimeout(resolve, 20); }); });
    }
    function click(label) {
        var node = Array.from(document.querySelectorAll("button")).find(function (entry) { return entry.textContent === label; });
        assert(node, "Missing control: " + label);
        node.click();
    }
    function pending(handler) {
        return Array.from(document.querySelectorAll("img")).filter(function (image) {
            return image.src.indexOf("blob:") === 0 && typeof image[handler] === "function";
        });
    }
    async function loadImages() {
        for (var batch = 0; batch < 50; batch += 1) {
            await settle();
            var waiting = pending("onload");
            if (!waiting.length) { return; }
            waiting.forEach(function (image) { image.onload(); });
        }
    }
    return { dom: dom, document: document, state: state, created: created, settle: settle, click: click, pending: pending,
        loadImages: loadImages,
        connect: async function () {
            await settle();
            click("Profile");
            await settle();
            click("Synthetic (shared)");
            await settle();
        },
        shown: function () {
            return Array.from(document.querySelectorAll(".media-card img")).filter(function (image) {
                return image.getAttribute("data-artwork-state") === "loaded";
            }).length;
        },
        toggle: async function () {
            click("Settings"); await settle();
            click("Performance"); await settle();
            var node = Array.from(document.querySelectorAll("button")).find(function (entry) {
                return /^Save Home artwork on this TV:/.test(entry.textContent);
            });
            assert(node, "The Settings toggle exists");
            var before = node.textContent;
            node.click();
            await settle();
            return before;
        },
        privacy: async function () {
            click("Settings"); await settle();
            click("Performance"); await settle();
            await settle();
        },
        click: click,
        labels: function () {
            return Array.from(document.querySelectorAll("button")).map(function (entry) { return entry.textContent; });
        },
        notes: function () { return document.querySelector(".settings-notes").textContent; },
        close: function () { dom.window.close(); } };
}

var MB = 1024 * 1024;
function rawCount(factory) {
    return new Promise(function (resolve) {
        var request = factory.open("vemm-artwork", 1);
        request.onupgradeneeded = function () {
            request.result.createObjectStore("blobs");
            request.result.createObjectStore("meta", { keyPath: "key" }).createIndex("used", "used");
        };
        request.onsuccess = function () {
            var count = request.result.transaction("blobs").objectStore("blobs").count();
            count.onsuccess = function () { request.result.close(); resolve(count.result); };
        };
    });
}

async function defaultOff() {
    var loaded = Preferences.load({ getItem: function () { return JSON.stringify({ quality: "original", language: "en" }); } });
    assert.strictEqual(loaded.saveHomeArtwork, false, "Saved preferences without the field load as Off");
    var factory = new fake.IDBFactory();
    var t = boot({ factory: factory });
    try {
        await t.connect();
        await t.loadImages();
        assert(t.state.transcodes > 0 && t.shown() > 0, "Home still downloads and shows artwork");
        assert.strictEqual(t.state.opened, 0, "While Off the store is never opened");
    } finally { t.close(); }
}

async function relaunch() {
    var factory = new fake.IDBFactory();
    var first = boot({ factory: factory, saveHomeArtwork: true });
    try {
        await first.connect();
        await first.loadImages();
        assert.strictEqual(first.state.transcodes, 7, "The first launch downloads every thumbnail");
        await first.settle();
    } finally { first.close(); }
    assert.strictEqual(await rawCount(factory), 7, "Home thumbnails and hero were saved");

    var second = boot({ factory: factory, saveHomeArtwork: true });
    try {
        await second.connect();
        await second.loadImages();
        assert.strictEqual(second.state.transcodes, 0, "A relaunch shows Home artwork without downloading it");
        assert.strictEqual(second.shown(), 6, "Stored artwork is displayed");
        assert.strictEqual(await rawCount(factory), 7, "Images from the store are not saved again");

        // Turning the setting off deletes the saved artwork.
        assert.strictEqual(await second.toggle(), "Save Home artwork on this TV: On");
        assert.strictEqual(await rawCount(factory), 0, "Turning it off clears the store");
    } finally { second.close(); }

    var third = boot({ factory: factory, saveHomeArtwork: false });
    try {
        await third.connect();
        await third.loadImages();
        assert.strictEqual(third.state.opened, 0, "Off never reads or writes the store");
        assert.strictEqual(third.state.transcodes, 7);
        assert.strictEqual(await third.toggle(), "Save Home artwork on this TV: Off");
        assert.strictEqual(JSON.parse(third.dom.window.localStorage.getItem("vemm-tizen-preferences")).saveHomeArtwork, true,
            "The choice is saved");
        assert.strictEqual(await rawCount(factory), 0, "Turning it on saves nothing by itself");
    } finally { third.close(); }
}

async function onlyHome() {
    var factory = new fake.IDBFactory();
    var t = boot({ factory: factory, saveHomeArtwork: true });
    try {
        await t.connect();
        await t.loadImages();
        await t.settle();
        t.click("Movies");
        await t.settle();
        await t.loadImages();
        assert(Array.from(t.document.querySelectorAll(".media-card")).some(function (card) {
            return card.textContent.indexOf("Listed 1") !== -1;
        }), "The library grid is shown");
        assert.strictEqual(await rawCount(factory), 7, "Library grid artwork is not saved");
    } finally { t.close(); }
}

async function libraryArtwork() {
    // Off (the default): the library grid is not saved. On: it joins the same store as the "library" category.
    var factory = new fake.IDBFactory();
    var t = boot({ factory: factory, saveHomeArtwork: true, prefs: { saveLibraryArtwork: true } });
    try {
        await t.connect();
        await t.loadImages();
        await t.settle();
        t.click("Movies");
        await t.settle();
        await t.loadImages();
        await t.settle();
        assert.strictEqual(await rawCount(factory), 9, "Home and library artwork are both saved");
        var usage = await Store.open(factory).usage();
        assert.strictEqual(usage.home, 28);
        assert.strictEqual(usage.library, 8);

        // Turning the library off deletes only the library entries.
        await t.privacy();
        assert(t.labels().indexOf("Save library artwork too: On") !== -1);
        t.click("Save library artwork too: On");
        await t.settle();
        assert.deepStrictEqual(await Store.open(factory).usage(), { home: 28, library: 0 });
        assert(t.labels().indexOf("Save library artwork too: Off") !== -1);
        assert.strictEqual(JSON.parse(t.dom.window.localStorage.getItem("vemm-tizen-preferences")).saveLibraryArtwork, false);

        // The artwork options live in Performance, not in Privacy and data.
        var moved = [/^Save Home artwork on this TV:/, /^Save library artwork too:/, /^Artwork storage limit:/, /^Load saved artwork at startup:/];
        moved.forEach(function (pattern) {
            assert(t.labels().some(function (label) { return pattern.test(label); }), "Performance lists " + pattern);
        });
        assert(/Saved artwork:/.test(t.notes()) || /Keeps the pictures/.test(t.notes()), "Performance carries the artwork notes");
        t.click("Back"); await t.settle();
        t.click("Privacy and data"); await t.settle();
        moved.forEach(function (pattern) {
            assert(!t.labels().some(function (label) { return pattern.test(label); }), "Privacy and data no longer has " + pattern);
        });
        ["Reset preferences", "Diagnostics", "About Vemm", "Sign out"].forEach(function (label) {
            assert(t.labels().indexOf(label) !== -1, "Privacy and data keeps " + label);
        });
    } finally { t.close(); }

    // The library toggle only exists, and only saves, while saving is on.
    var off = boot({ factory: new fake.IDBFactory(), saveHomeArtwork: false, prefs: { saveLibraryArtwork: true } });
    try {
        await off.connect();
        await off.privacy();
        assert(!off.labels().some(function (label) { return /^Save library artwork/.test(label) || /^Artwork storage limit/.test(label); }));
        assert.strictEqual(off.state.opened, 0);
    } finally { off.close(); }
}

async function limitAndUsage() {
    var factory = new fake.IDBFactory();
    var clock = 0;
    var seed = Store.open(factory, { maxBytes: 25 * MB, now: function () { clock += 1; return clock; } });
    await seed.put("home", new Blob([new Uint8Array(Math.round(3.1 * MB))]), "home");
    await seed.put("library", new Blob([new Uint8Array(Math.round(5.1 * MB))]), "library");
    var t = boot({ factory: factory, saveHomeArtwork: true, quota: 60 * MB, prefs: { artworkLimitMb: 25 } });
    try {
        await t.connect();
        await t.privacy();
        assert(t.labels().indexOf("Artwork storage limit: 25 MB") !== -1);
        assert(t.notes().indexOf("Saved artwork: 8.2 MB of 25 MB (Home 3.1 MB · Library 5.1 MB)") !== -1, t.notes());
        t.click("Artwork storage limit: 25 MB");
        await t.settle();
        await t.settle();
        var choices = t.labels().filter(function (label) { return /^\d+ MB$/.test(label); });
        assert.deepStrictEqual(choices, ["10 MB", "25 MB", "50 MB"], "Choices above the 60 MB quota are hidden");
        t.click("10 MB");
        await t.settle();
        await t.settle();
        assert.strictEqual(JSON.parse(t.dom.window.localStorage.getItem("vemm-tizen-preferences")).artworkLimitMb, 10);
        assert(t.labels().indexOf("Artwork storage limit: 10 MB") !== -1);
        // 8.2 MB still fits in 10 MB, so nothing was evicted yet.
        assert.strictEqual(await rawCount(factory), 2);
    } finally { t.close(); }

    // Without a quota reading every choice is offered, and the current value stays selected.
    var small = boot({ factory: factory, saveHomeArtwork: true, prefs: { artworkLimitMb: 10 } });
    try {
        await small.connect();
        await small.privacy();
        small.click("Artwork storage limit: 10 MB");
        await small.settle();
        assert.deepStrictEqual(small.labels().filter(function (label) { return /^\d+ MB$/.test(label); }),
            ["10 MB", "25 MB", "50 MB", "100 MB", "150 MB"]);
    } finally { small.close(); }

    // A smaller limit evicts the least recently used entries at once.
    await Store.open(factory, { maxBytes: 25 * MB }).put("more", new Blob([new Uint8Array(4 * MB)]), "home");
    var lower = boot({ factory: factory, saveHomeArtwork: true, prefs: { artworkLimitMb: 25 } });
    try {
        await lower.connect();
        await lower.privacy();
        lower.click("Artwork storage limit: 25 MB");
        await lower.settle();
        lower.click("10 MB");
        await lower.settle();
        await lower.settle();
        var left = await Store.open(factory).usage();
        assert(left.home + left.library <= 10 * MB, "Lowering the limit evicted down to it");
        assert(left.home + left.library > 0);
    } finally { lower.close(); }
}

async function failures() {
    var broken = boot({ factory: "broken", saveHomeArtwork: true });
    try {
        await broken.connect();
        await broken.loadImages();
        assert(broken.state.opened > 0);
        assert.strictEqual(broken.shown(), 6, "A failing IndexedDB falls back to downloading");
    } finally { broken.close(); }
    var missing = boot({ saveHomeArtwork: true });
    try {
        missing.dom.window.indexedDB = undefined;
        await missing.connect();
        await missing.loadImages();
        assert.strictEqual(missing.shown(), 6, "A missing IndexedDB falls back to downloading");
    } finally { missing.close(); }

    // A stored image that cannot be decoded is deleted and downloaded again.
    var factory = new fake.IDBFactory();
    var seed = boot({ factory: factory, saveHomeArtwork: true });
    try { await seed.connect(); await seed.loadImages(); await seed.settle(); } finally { seed.close(); }
    var bad = boot({ factory: factory, saveHomeArtwork: true });
    try {
        await bad.connect();
        await bad.settle();
        bad.pending("onerror").forEach(function (image) { image.onerror(); });
        await bad.settle();
        await bad.loadImages();
        assert.strictEqual(bad.state.transcodes, 7, "Undecodable stored images are downloaded again");
        assert.strictEqual(bad.shown(), 6);
        await bad.settle();
        assert.strictEqual(await rawCount(factory), 7, "The bad entries were replaced");
    } finally { bad.close(); }
}

async function staleLookup() {
    var factory = new fake.IDBFactory();
    var seed = boot({ factory: factory, saveHomeArtwork: true });
    try { await seed.connect(); await seed.loadImages(); await seed.settle(); } finally { seed.close(); }
    var release;
    var t = boot({ factory: factory, saveHomeArtwork: true, gate: new Promise(function (resolve) { release = resolve; }) });
    try {
        await t.connect();
        assert(t.document.querySelectorAll(".media-card").length > 0);
        t.click("Settings");
        await t.settle();
        var objects = t.created.length;
        release();
        await t.settle();
        assert.strictEqual(t.created.length, objects, "A stale lookup shows nothing");
        assert.strictEqual(t.state.transcodes, 0, "A stale lookup queues no download");
    } finally { t.close(); }
}

async function signOut() {
    var factory = new fake.IDBFactory();
    var t = boot({ factory: factory, saveHomeArtwork: true });
    try {
        await t.connect();
        await t.loadImages();
        await t.settle();
        assert.strictEqual(await rawCount(factory), 7);
        t.click("Settings");
        await t.settle();
        t.click("Privacy and data");
        await t.settle();
        t.click("Sign out");
        await t.settle();
        assert.strictEqual(await rawCount(factory), 0, "Signing out clears the store");
    } finally { t.close(); }
}

async function budget() {
    var factory = new fake.IDBFactory();
    var clock = 0;
    var store = Store.open(factory, { now: function () { clock += 1; return clock; } });
    var i;
    for (i = 0; i < 260; i += 1) { await store.put("k" + i, new Blob([new Uint8Array(10)])); }
    assert.strictEqual(await rawCount(factory), 260, "Only bytes are limited, not the entry count");

    factory = new fake.IDBFactory();
    clock = 0;
    store = Store.open(factory, { now: function () { clock += 1; return clock; } });
    var big = function () { return new Blob([new Uint8Array(4 * 1024 * 1024)]); };
    await store.put("a", big());
    await store.put("b", big());
    assert(await store.get("a"), "Reading refreshes lastUsed");
    await store.put("c", big());
    assert.strictEqual(await store.get("b"), null, "10 MB total: the least recently used entry goes");
    assert(await store.get("a") && await store.get("c"));
    await store.clear();
    assert.strictEqual(await rawCount(factory), 0);

    // A chosen limit replaces the 10 MB default; lowering it evicts down to it, least recently used first.
    clock = 0;
    store = Store.open(factory, { now: function () { clock += 1; return clock; }, maxBytes: 25 * MB });
    for (i = 0; i < 5; i += 1) { await store.put("e" + i, new Blob([new Uint8Array(4 * MB)]), i < 2 ? "home" : "library"); }
    assert.strictEqual(await rawCount(factory), 5, "20 MB fits in 25 MB");
    assert.deepStrictEqual(await store.usage(), { home: 8 * MB, library: 12 * MB }, "Totals per category");
    store.setLimit(10 * MB);
    await store.trim();
    assert.strictEqual(await rawCount(factory), 2, "Lowering the limit evicts down to it");
    assert(await store.get("e4") && await store.get("e3") && !(await store.get("e0")));
    await store.put("e5", new Blob([new Uint8Array(4 * MB)]), "home");
    assert.strictEqual(await store.get("e4"), null, "The new limit also governs later saves");
    assert.deepStrictEqual(await store.usage(), { home: 4 * MB, library: 4 * MB });
    await store.removeCategory("library");
    assert.deepStrictEqual(await store.usage(), { home: 4 * MB, library: 0 }, "Removing a category keeps the other");
    assert.strictEqual(await Store.open(undefined).usage(), null);
    assert.strictEqual(await Store.open(undefined).removeCategory("library"), null);
    await store.put("untagged", new Blob([new Uint8Array(1)]));
    assert.strictEqual((await store.usage()).home, 4 * MB + 1, "Entries without a category count as Home");
    assert.strictEqual(await Store.open(undefined).get("x"), null, "No IndexedDB at all is harmless");
}

// A launch that already ran once: the populated store plus the remembered Home, server and account in localStorage.
async function seeded() {
    var factory = new fake.IDBFactory();
    var first = boot({ factory: factory, saveHomeArtwork: true });
    var storage = {};
    try {
        await first.connect(); await first.loadImages(); await first.settle();
        var local = first.dom.window.localStorage;
        for (var i = 0; i < local.length; i += 1) { storage[local.key(i)] = local.getItem(local.key(i)); }
    } finally { first.close(); }
    return { factory: factory, storage: storage };
}

// Opens the linked account's Home while the server never answers, so only saved artwork can appear.
async function offline(seed, prefs) {
    var t = boot({ factory: seed.factory, saveHomeArtwork: true, prefs: prefs, storage: seed.storage, hang: true });
    await t.settle();
    t.click("Profile");
    await t.settle();
    return t;
}

function attached(t) {
    return Array.from(t.document.querySelectorAll(".media-card img")).filter(function (image) {
        return /^blob:/.test(image.src);
    }).length;
}

async function startupIndex() {
    var seed = await seeded();
    var transactions = 0;
    var transaction = fake.IDBDatabase.prototype.transaction;
    fake.IDBDatabase.prototype.transaction = function () { transactions += 1; return transaction.apply(this, arguments); };
    var t;
    try {
        t = await offline(seed, {});
        assert.strictEqual(transactions, 1, "The startup preload reads the store in one transaction, not one per image");
    } finally { fake.IDBDatabase.prototype.transaction = transaction; }
    try {
        assert(t.document.querySelectorAll(".media-card").length >= 6, "The remembered Home is shown");
        assert.strictEqual(attached(t), t.document.querySelectorAll(".media-card").length,
            "Saved thumbnails are attached before the server client exists");
        assert.strictEqual(t.state.transcodes, 0, "No downloads");
        assert.strictEqual(t.created.length, 7, "One object URL per saved image, none duplicated per card");
    } finally { t.close(); }

    // Preloading Off: lazy per-image lookups, still attached before the connection.
    var lazy = await offline(seed, { preloadArtwork: false });
    try {
        await lazy.settle();
        assert.strictEqual(lazy.document.querySelectorAll(".media-card").length >= 6, true);
        assert.strictEqual(attached(lazy), lazy.document.querySelectorAll(".media-card").length,
            "Lazy lookups attach before the connection too");
        assert.strictEqual(lazy.state.transcodes, 0);
    } finally { lazy.close(); }
}

async function preloadOnePass() {
    var seed = await seeded();
    var store = Store.open(seed.factory);
    var list = await store.preload(150, 32 * MB, MB);
    assert.strictEqual(list.length, 7, "Every saved entry is returned");
    list.forEach(function (entry) {
        assert(entry.blob && entry.size > 0 && /^synthetic-server\|\/library\/metadata\/[^|]+\|\d*x?\d*$/.test(entry.key), entry.key);
    });
    assert.strictEqual(new Set(list.map(function (entry) { return entry.key; })).size, 7, "One entry per server|path|size");
    assert.strictEqual((await store.preload(3, 32 * MB, MB)).length, 3, "Capped by count");
    assert.strictEqual((await store.preload(150, 8, MB)).length, Math.floor(8 / list[0].size), "Capped by bytes");
    assert.strictEqual((await store.preload(150, 32 * MB, 1)).length, 0, "Entries over the per-image size are skipped");
    assert.strictEqual(await Store.open(undefined).preload(1, 1, 1), null, "No IndexedDB at all is harmless");
}

async function preloadSetting() {
    var seed = await seeded();
    var t = boot({ factory: seed.factory, saveHomeArtwork: true });
    try {
        await t.connect();
        await t.privacy();
        assert(t.labels().indexOf("Load saved artwork at startup: On") !== -1, "On by default, shown while saving is On");
        t.click("Load saved artwork at startup: On");
        await t.settle();
        assert(t.labels().indexOf("Load saved artwork at startup: Off") !== -1);
        assert.strictEqual(JSON.parse(t.dom.window.localStorage.getItem("vemm-tizen-preferences")).preloadArtwork, false);
    } finally { t.close(); }
    var off = boot({ factory: new fake.IDBFactory(), saveHomeArtwork: false });
    try {
        await off.connect();
        await off.privacy();
        assert(!off.labels().some(function (label) { return /^Load saved artwork/.test(label); }), "Hidden while saving is Off");
        assert.strictEqual(off.state.opened, 0, "Nothing is read while saving is Off");
    } finally { off.close(); }
}

async function indexCleared() {
    var seed = await seeded();
    var t = boot({ factory: seed.factory, saveHomeArtwork: true });
    var revoked = [];
    t.dom.window.URL.revokeObjectURL = function (url) { revoked.push(url); };
    try {
        await t.settle();
        assert.strictEqual(t.created.length, 7, "The startup pass made an object URL per saved image");
        await t.connect();
        await t.settle();
        assert.strictEqual(revoked.length, 0, "Connecting keeps the saved index");
        t.click("Settings"); await t.settle();
        t.click("Performance"); await t.settle();
        t.click("Save Home artwork on this TV: On"); await t.settle();
        assert.strictEqual(revoked.length, 7, "Turning saving Off revokes every URL of the index");
        assert.strictEqual(await rawCount(seed.factory), 0);
    } finally { t.close(); }
}

async function preloadFailure() {
    var broken = boot({ factory: "broken", saveHomeArtwork: true });
    try {
        await broken.settle();
        assert(broken.state.opened > 0, "The startup pass tried the store");
        await broken.connect();
        await broken.loadImages();
        assert.strictEqual(broken.shown(), 6, "A failing IndexedDB falls back to downloading");
    } finally { broken.close(); }

    // A preloaded image that cannot be decoded is deleted and downloaded.
    var seed = await seeded();
    var bad = boot({ factory: seed.factory, saveHomeArtwork: true });
    try {
        await bad.settle();
        await bad.connect();
        await bad.settle();
        bad.pending("onerror").forEach(function (image) { image.onerror(); });
        await bad.settle();
        await bad.loadImages();
        assert.strictEqual(bad.shown(), 6);
        assert(bad.state.transcodes > 0, "Undecodable preloaded images are downloaded again");
    } finally { bad.close(); }
}

async function sharedKeys() {
    var seed = await seeded();
    var t = boot({ factory: seed.factory, saveHomeArtwork: true });
    try {
        await t.connect();
        await t.loadImages();
        await t.settle();
        assert.strictEqual(t.state.transcodes, 0, "The memory cache and the store use one key: nothing is downloaded");
        assert.strictEqual(t.created.length, 7, "No second object URL for an image already in the index");
        assert.strictEqual(await rawCount(seed.factory), 7, "Nothing is saved twice");
    } finally { t.close(); }
}

async function localIsNotQueued() {
    // Six saved thumbnails and downloads that never finish: none waits for a download slot (3).
    var seed = await seeded();
    var t = boot({ factory: seed.factory, saveHomeArtwork: true });
    try {
        await t.settle();
        var real = t.dom.window.fetch;
        t.dom.window.fetch = function (target) {
            return /transcode/.test(String(target)) ? new Promise(function () {}) : real(target);
        };
        await t.connect();
        await t.settle();
        assert.strictEqual(attached(t), 6);
        assert.strictEqual(t.state.transcodes, 0);
    } finally { t.close(); }
}

// The TV held 237 entries (56 Home posters, 10 heroes, 171 library posters) and the 150 cap dropped most Home artwork.
async function seedMixed(factory, home, library) {
    var clock = 0;
    var store = Store.open(factory, { maxBytes: 100 * MB, now: function () { clock += 1; return clock; } });
    var png = function (n) { return new Blob([new Uint8Array(3000 + n)], { type: "image/png" }); };
    var n;
    // Home is the oldest, library the newest: the old order would keep library and drop Home.
    for (n = 0; n < home; n += 1) { await store.put("synthetic-server|/library/metadata/H" + n + "/thumb|240x360", png(n), "home"); }
    for (n = 0; n < library; n += 1) { await store.put("synthetic-server|/library/metadata/L" + n + "/thumb|240x360", png(n), "library"); }
    return store;
}

async function preloadsEverythingHomeFirst() {
    var factory = new fake.IDBFactory();
    await seedMixed(factory, 66, 171);
    var list = await Store.open(factory).preload(1500, 32 * MB, MB);
    assert.strictEqual(list.length, 237, "All saved entries are preloaded, not just 150");
    assert(list.slice(0, 66).every(function (entry) { return entry.key.indexOf("|/library/metadata/H") !== -1; }), "Home first");
    assert(list.slice(66).every(function (entry) { return entry.key.indexOf("|/library/metadata/L") !== -1; }), "then library");
    assert.strictEqual(list[0].key.split("|")[1], "/library/metadata/H65/thumb", "newest first within Home");
    assert.strictEqual(list[66].key.split("|")[1], "/library/metadata/L170/thumb", "newest first within library");
    var cut = await Store.open(factory).preload(1500, list[0].size * 70 + 100, MB);
    assert.strictEqual(cut.length, 70, "Within the byte budget");
    assert(cut.slice(0, 66).every(function (entry) { return entry.key.indexOf("/H") !== -1; }), "Home survives the byte cut");

    var t = boot({ factory: factory, saveHomeArtwork: true });
    try {
        await t.settle();
        assert.strictEqual(t.created.length, 237, "The app holds an object URL for every saved entry");
    } finally { t.close(); }
}

async function getManyOneTransaction() {
    var factory = new fake.IDBFactory();
    var store = await seedMixed(factory, 5, 5);
    var transactions = 0;
    var transaction = fake.IDBDatabase.prototype.transaction;
    var seen = [];
    var found;
    fake.IDBDatabase.prototype.transaction = function () { transactions += 1; return transaction.apply(this, arguments); };
    try {
        found = await store.getMany(["synthetic-server|/library/metadata/H1/thumb|240x360", "missing",
            "synthetic-server|/library/metadata/L2/thumb|240x360"], function (key, blob) { seen.push([key, !!blob]); });
    } finally { fake.IDBDatabase.prototype.transaction = transaction; }
    assert.strictEqual(transactions, 1, "Every key is read in one transaction");
    assert.strictEqual(seen.length, 3, "Each key is reported once");
    assert.strictEqual(seen.filter(function (entry) { return entry[1]; }).length, 2);
    assert.deepStrictEqual(seen.filter(function (entry) { return !entry[1]; }).map(function (entry) { return entry[0]; }), ["missing"]);
    assert.strictEqual(found, true);
    assert.strictEqual(await Store.open(undefined).getMany(["x"], function () {}), null, "No IndexedDB at all is harmless");
}

async function lazyLookupsAreBatched() {
    var seed = await seeded();
    // Drop one saved thumbnail: a true miss that must be downloaded; the rest come from storage.
    var all = await Store.open(seed.factory).preload(1500, 32 * MB, MB);
    await Store.open(seed.factory).remove(all.filter(function (entry) { return /\/library\/metadata\/\d/.test(entry.key); })[0].key);
    var transactions = 0;
    var transaction = fake.IDBDatabase.prototype.transaction;
    var t;
    fake.IDBDatabase.prototype.transaction = function () { transactions += 1; return transaction.apply(this, arguments); };
    try {
        t = boot({ factory: seed.factory, saveHomeArtwork: true, prefs: { preloadArtwork: false } });
        await t.connect();
        await t.loadImages();
        await t.settle();
        assert.strictEqual(t.state.transcodes, 1, "Only the true miss is downloaded");
        assert(transactions <= 3, "Lookups share transactions (" + transactions + ")");
        assert.strictEqual(t.shown(), 6);
    } finally { fake.IDBDatabase.prototype.transaction = transaction; if (t) { t.close(); } }
}

defaultOff().then(relaunch).then(onlyHome).then(libraryArtwork).then(limitAndUsage).then(failures).then(staleLookup).then(signOut).then(budget).then(startupIndex).then(preloadOnePass).then(preloadSetting).then(indexCleared).then(preloadFailure).then(sharedKeys).then(localIsNotQueued).then(preloadsEverythingHomeFirst).then(getManyOneTransaction).then(lazyLookupsAreBatched).then(function () {
    console.log("Home artwork on disk: passed");
}).catch(function (error) { console.error(error); process.exitCode = 1; });
