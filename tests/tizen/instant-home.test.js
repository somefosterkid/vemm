"use strict";
// Selecting a profile goes straight to Home: the remembered Home (or a skeleton) is drawn at once while
// the profile switch, server discovery and connection finish behind it. Everything here is synthetic.
var assert = require("assert");
var fs = require("fs");
var vm = require("vm");

function Node(tag, text) {
    this.tag = tag;
    this.tagName = String(tag).toUpperCase();
    this.text = text || "";
    this.children = [];
    this.events = {};
    this.attributes = {};
    this.parentNode = null;
    this.value = "";
}
// A control's text includes its children (the profile name sits in a span).
Object.defineProperty(Node.prototype, "textContent", {
    get: function () { return this.text + this.children.map(function (child) { return child.textContent; }).join(""); },
    set: function (value) { this.text = value; }
});
Node.prototype.appendChild = function (child) { child.parentNode = this; this.children.push(child); return child; };
Node.prototype.removeChild = function (child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; };
Node.prototype.replaceChild = function (next, previous) {
    this.children.splice(this.children.indexOf(previous), 1, next);
    next.parentNode = this;
    previous.parentNode = null;
    return previous;
};
Object.defineProperty(Node.prototype, "firstChild", { get: function () { return this.children[0]; } });
Node.prototype.addEventListener = function (name, callback) { this.events[name] = callback; };
Node.prototype.setAttribute = function (name, value) { this.attributes[name] = value; };
Node.focusCount = 0;
Node.prototype.focus = function () { Node.focusCount += 1; Node.document.activeElement = this; };
Node.prototype.querySelectorAll = function () {
    var result = [];
    function visit(node) {
        if (node.tag === "button" || node.tag === "input") { result.push(node); }
        node.children.forEach(visit);
    }
    this.children.forEach(visit);
    return result;
};
Node.prototype.querySelector = function () { return this.querySelectorAll()[0] || null; };
function findById(node, id) {
    if (node.id === id) { return node; }
    for (var i = 0; i < node.children.length; i += 1) {
        var found = findById(node.children[i], id);
        if (found) { return found; }
    }
    return null;
}
function countClass(node, name) {
    var total = (" " + (node.className || "") + " ").indexOf(" " + name + " ") !== -1 ? 1 : 0;
    node.children.forEach(function (child) { total += countClass(child, name); });
    return total;
}
function allText(node) {
    return node.textContent + node.children.map(allText).join(" ");
}
function memoryStorage(initial) {
    var data = initial || {};
    return {
        get length() { return Object.keys(data).length; },
        key: function (index) { return Object.keys(data)[index] || null; },
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
        setItem: function (key, value) { data[key] = String(value); },
        removeItem: function (key) { delete data[key]; },
        data: data
    };
}

var HOME_KEY = "vemm-tizen-home-synthetic-profile-machine-a";
var FAVORITES = "vemm-tizen-favorite-libraries";
var SECTIONS = [{ key: "1", type: "movie", title: "Movies", extra: "dropped" }];
function movie(id, title, extra) {
    var item = { ratingKey: String(id), type: "movie", title: title, thumb: "/thumb/" + id };
    Object.keys(extra || {}).forEach(function (name) { item[name] = extra[name]; });
    return item;
}

// options: protectedProfile, servers, hubs (function), switchProfile / selectServer overrides.
function boot(storage, options) {
    options = options || {};
    var screen = new Node("main");
    var status = new Node("p");
    var listeners = {};
    var document = {
        activeElement: null,
        getElementById: function (id) { return id === "screen" ? screen : id === "status" ? status : findById(screen, id); },
        createElement: function (tag) { return new Node(tag); },
        querySelector: function () { return null; },
        addEventListener: function (name, callback) { listeners[name] = callback; }
    };
    Node.document = document;
    var record = { metadata: 0, switches: 0, selected: 0 };
    var home = {
        cancelRequests: function () {},
        getSections: function () { return Promise.resolve(SECTIONS); },
        getHomeHubs: function () {
            return Promise.resolve(options.hubs ? options.hubs() : [{ title: "Fresh Shelf", hubIdentifier: "home.movies.recent",
                librarySectionID: 1, Metadata: [movie(7, "Fresh Movie")] }]);
        },
        getMetadata: function () { record.metadata += 1; return Promise.reject(new Error("unused")); },
        getRelated: function () { return Promise.resolve({ Hub: [] }); }
    };
    var servers = options.servers || [
        { id: "machine-a", name: "Alpha", owned: true, token: "t-a", connections: [{ uri: "https://a.invalid" }] }
    ];
    var api = {
        createAuthClient: function () { return {
            startAuthorization: function () { return Promise.resolve({ code: "TEST", id: 1 }); },
            pollAuthorization: function () { return Promise.resolve({ status: "linked", token: "synthetic-account-token" }); }
        }; },
        createAccountClient: function () { return {
            getProfiles: function () { return Promise.resolve(options.profiles || [{ uuid: "synthetic-profile", title: "Synthetic Guest",
                protected: !!options.protectedProfile }]); },
            switchProfile: function () {
                record.switches += 1;
                return options.switchProfile ? options.switchProfile() : Promise.resolve("synthetic-profile-token");
            },
            getServers: function () { return Promise.resolve(servers); },
            getWatchlistState: function () { return Promise.resolve(false); }
        }; },
        selectServer: function () {
            record.selected += 1;
            return options.selectServer ? options.selectServer(home) : Promise.resolve({ relay: false, client: home });
        }
    };
    // options.timers: timers (and animation frames) are queued, not run, until run(maxDelay) is called.
    var timers = options.timers || null;
    var window = { PlexApi: api, VemmHomeHero: require("../../samsung/Vemm/js/home-hero.js"), Promise: Promise, URL: URL, Blob: Blob,
        localStorage: storage, fetch: function () { assert.fail("The synthetic UI must not use the network"); },
        addEventListener: function () {} };
    if (timers) {
        window.requestAnimationFrame = function (callback) { timers.push({ callback: callback, delay: 0 }); return timers.length; };
    }
    ["js/i18n.js", "js/preferences.js", "js/favorites.js", "js/item-menu.js", "js/recents.js"].forEach(function (file) {
        vm.runInNewContext(fs.readFileSync(require.resolve("../../samsung/Vemm/" + file), "utf8"), window);
    });
    vm.runInNewContext(fs.readFileSync(require.resolve("../../samsung/Vemm/main.js"), "utf8"), {
        document: document, window: window, clearTimeout: function () {},
        setTimeout: function (callback, delay) { if (timers) { timers.push({ callback: callback, delay: delay || 0 }); } return 1; }
    });
    function find(label) {
        return screen.querySelectorAll().find(function (node) { return node.tag === "button" && node.textContent === label; });
    }
    function click(label) {
        var control = find(label);
        assert(control, "Missing control: " + label + " in " + JSON.stringify(screen.querySelectorAll().map(function (n) { return n.textContent; })));
        control.events.click();
    }
    function cardTitles() {
        var titles = [];
        (function visit(node) {
            if (node.className === "card-title") { titles.push(node.textContent); }
            node.children.forEach(visit);
        }(screen));
        return titles;
    }
    async function settle() { for (var i = 0; i < 80; i += 1) { await Promise.resolve(); } }
    async function toProfile() {
        click("Get a new code");
        await settle();
    }
    return { screen: screen, status: status, focused: function () { return document.activeElement; }, find: find, click: click, settle: settle, toProfile: toProfile, record: record,
        cardTitles: cardTitles, key: function (code) { listeners.keydown({ keyCode: code, preventDefault: function () {} }); } };
}

function deferred() {
    var d = {};
    d.promise = new Promise(function (resolve, reject) { d.resolve = resolve; d.reject = reject; });
    return d;
}

// Signs in, picks the server and saves favorites so that the next launch connects by itself.
async function firstLaunch(storage, hubs, timers) {
    var app = boot(storage, { hubs: hubs, timers: timers });
    await app.toProfile();
    app.click("Synthetic Guest");
    await app.settle();
    if (app.find("Start watching")) { app.click("Start watching"); await app.settle(); }
    assert(app.find("Home") && app.cardTitles().length, "Home loads on the first launch");
    return app;
}

async function skeletonAndNoProfilePage() {
    var pending = deferred();
    var app = boot(memoryStorage(), { switchProfile: function () { return pending.promise; } });
    await app.toProfile();
    app.click("Synthetic Guest");
    assert(!app.find("Back to profiles") && !app.find("Use this profile"), "No per-profile page for an unprotected profile");
    assert(app.find("Home") && app.find("Search"), "Home navigation is drawn at once");
    assert(countClass(app.screen, "skeleton-card") > 0 && countClass(app.screen, "skeleton-shelf") > 0,
        "A skeleton is drawn when nothing is remembered");
    assert.strictEqual(app.status.textContent, "Connecting…");
    // Presses before the connection are ignored with the status; nothing navigates.
    app.click("Search");
    app.click("Settings");
    app.click("Home");
    assert(countClass(app.screen, "skeleton-card") > 0 && app.find("Home"), "Presses leave the skeleton in place");
    assert.strictEqual(app.status.textContent, "Connecting…");
    pending.resolve("synthetic-profile-token");
    await app.settle();
    assert(app.find("Start watching"), "The connection continues once the switch finishes");
    app.click("Start watching");
    await app.settle();
    assert.deepStrictEqual(app.cardTitles(), ["Fresh Movie"]);
    assert.strictEqual(countClass(app.screen, "skeleton-card"), 0);
}

async function protectedProfileStillAsksForPin() {
    var app = boot(memoryStorage(), { protectedProfile: true });
    await app.toProfile();
    app.click("Synthetic Guest");
    assert(app.find("Use this profile") && app.find("Back to profiles"), "A protected profile shows the PIN page");
    assert.strictEqual(app.record.switches, 0);
    var pin = app.screen.querySelectorAll().find(function (node) { return node.tag === "input"; });
    pin.value = "1234";
    app.click("Use this profile");
    await app.settle();
    assert.strictEqual(app.record.switches, 1);
    assert(app.find("Start watching") || app.find("Home"), "An accepted PIN continues to Home");
    assert(!app.find("Use this profile"));
}

async function rememberedHome() {
    var storage = memoryStorage();
    var long = new Array(600).join("x");
    await firstLaunch(storage, function () {
        return [{ title: "Remembered Shelf", hubIdentifier: "home.movies.recent", librarySectionID: 1, junk: "dropped",
            Metadata: [movie(7, "Remembered Movie", { summary: long, Media: [{ junk: true }], guid: "plex://dropped" })] }];
    });
    var saved = JSON.parse(storage.getItem(HOME_KEY));
    assert.strictEqual(saved.hubs[0].Metadata[0].title, "Remembered Movie");
    assert.strictEqual(saved.hubs[0].Metadata[0].summary.length, 300, "Summaries are trimmed");
    assert(!("Media" in saved.hubs[0].Metadata[0]) && !("guid" in saved.hubs[0].Metadata[0]) && !("junk" in saved.hubs[0]) &&
        !("extra" in saved.sections[0]), "Only what rendering needs is stored");

    // Next launch: a fresh boot with the same storage.
    var switching = deferred();
    var connecting = deferred();
    var fresh = [{ title: "Fresh Shelf", hubIdentifier: "home.movies.recent", librarySectionID: 1, Metadata: [movie(8, "Fresh Movie")] }];
    var app = boot(memoryStorage(JSON.parse(JSON.stringify(storage.data))), {
        switchProfile: function () { return switching.promise; },
        selectServer: function (client) { return connecting.promise.then(function () { return { relay: false, client: client }; }); },
        hubs: function () { return fresh; }
    });
    await app.toProfile();
    app.click("Synthetic Guest");
    assert.deepStrictEqual(app.cardTitles(), ["Remembered Movie"], "The remembered Home renders immediately");
    assert.strictEqual(countClass(app.screen, "skeleton-card"), 0);
    app.click("Movies");
    assert.strictEqual(app.record.metadata, 0);
    assert.strictEqual(app.status.textContent, "Connecting…");
    // A press on a card and the card menu key before the connection do nothing.
    var card = [];
    (function visit(node) { if (node.vemmCard) { card.push(node); } node.children.forEach(visit); }(app.screen));
    card[0].events.click();
    Node.document.activeElement = card[0];
    app.key(10135);
    assert.strictEqual(app.record.metadata, 0, "A card press before the connection opens nothing");
    assert.strictEqual(app.status.textContent, "Connecting…");
    switching.resolve("synthetic-profile-token");
    await app.settle();
    assert.deepStrictEqual(app.cardTitles(), ["Remembered Movie"], "Still the remembered Home while connecting");
    connecting.resolve();
    await app.settle();
    assert.deepStrictEqual(app.cardTitles(), ["Fresh Movie"], "The fresh Home replaces it");
}

async function freshHomeIsRemembered() {
    var storage = memoryStorage();
    await firstLaunch(storage);
    assert.strictEqual(JSON.parse(storage.getItem(HOME_KEY)).hubs[0].Metadata[0].title, "Fresh Movie");
    assert(storage.getItem(FAVORITES), "Favorites were saved");
}

async function sizeIsCapped() {
    var storage = memoryStorage();
    await firstLaunch(storage, function () {
        var hubs = [];
        for (var i = 0; i < 300; i += 1) {
            var items = [];
            for (var j = 0; j < 12; j += 1) { items.push(movie(i * 100 + j, new Array(100).join("t"))); }
            hubs.push({ title: "Shelf " + i, hubIdentifier: "home.movies." + i, librarySectionID: 1, Metadata: items });
        }
        return hubs;
    });
    assert.strictEqual(storage.getItem(HOME_KEY), null, "A Home over about 300 KB is not saved");
    var small = memoryStorage();
    await firstLaunch(small);
    assert(small.getItem(HOME_KEY).length < 300 * 1024);
}

async function fallbacks() {
    // Several servers and none remembered: the server list.
    var two = [
        { id: "machine-a", name: "Alpha", owned: true, token: "t-a", connections: [{ uri: "https://a.invalid" }] },
        { id: "machine-b", name: "Beta", owned: true, token: "t-b", connections: [{ uri: "https://b.invalid" }] }
    ];
    var app = boot(memoryStorage(), { servers: two });
    await app.toProfile();
    app.click("Synthetic Guest");
    await app.settle();
    assert(app.find("Alpha (owned)") && app.find("Beta (owned)"), "Several servers show the server list");
    assert.strictEqual(countClass(app.screen, "skeleton-card"), 0);
    app.click("Change profile");
    await app.settle();
    assert(app.find("Synthetic Guest"), "Change profile works from the server list");

    // The connection fails: the server list with the error.
    app = boot(memoryStorage(), { selectServer: function () { return Promise.reject(new Error("Synthetic connection failure")); } });
    await app.toProfile();
    app.click("Synthetic Guest");
    await app.settle();
    assert(app.find("Alpha (owned)"), "A failed connection shows the server list");
    assert(allText(app.screen).indexOf("Synthetic connection failure") !== -1, "...with the error");

    // The profile switch fails: the profiles with the error.
    app = boot(memoryStorage(), { switchProfile: function () { return Promise.reject(new Error("Synthetic switch failure")); } });
    await app.toProfile();
    app.click("Synthetic Guest");
    await app.settle();
    assert(app.find("Synthetic Guest"), "A failed switch returns to the profiles");
    assert.strictEqual(app.status.textContent, "Synthetic switch failure");

    // Change profile works from Home and does not pick a profile.
    app = await firstLaunch(memoryStorage());
    app.click("Change profile");
    await app.settle();
    assert(app.find("Synthetic Guest"), "Change profile shows the profile list from Home");
    assert(!app.find("Alpha (owned)"), "...without choosing anything");

    // Change server works from Home.
    app = await firstLaunch(memoryStorage());
    app.click("Change server");
    await app.settle();
    assert(app.find("Alpha (owned)"), "Change server shows the server list");
}

async function clearing() {
    var storage = memoryStorage();
    var app = await firstLaunch(storage);
    assert(storage.getItem(HOME_KEY));
    storage.setItem("vemm-tizen-home-other-machine-z", "{}");
    storage.setItem("vemm-tizen-listing-synthetic-profile-machine-a-1-abc", "{}");
    storage.setItem("vemm-tizen-listing-index", "[]");
    app.click("Settings");
    await app.settle();
    app.click("Privacy and data");
    await app.settle();
    app.click("Sign out");
    assert.strictEqual(storage.getItem(HOME_KEY), null, "Sign out removes the remembered Home");
    assert.strictEqual(storage.getItem("vemm-tizen-home-other-machine-z"), null, "...for every profile and server");
    assert.strictEqual(storage.getItem("vemm-tizen-listing-synthetic-profile-machine-a-1-abc"), null, "Sign out removes cached library listings");
    assert.strictEqual(storage.getItem("vemm-tizen-listing-index"), null, "...and their index");

    storage = memoryStorage();
    app = await firstLaunch(storage);
    storage.setItem("vemm-tizen-listing-x-1-abc", "{}");
    app.click("Settings");
    await app.settle();
    app.click("Privacy and data");
    await app.settle();
    app.click("Reset preferences");
    assert.strictEqual(storage.getItem(HOME_KEY), null, "Reset preferences removes the remembered Home");
    assert.strictEqual(storage.getItem("vemm-tizen-listing-x-1-abc"), null, "Reset preferences removes cached library listings");
}

async function lastProfileIsFocused() {
    var storage = memoryStorage();
    var profiles = [{ uuid: "synthetic-first", title: "First Guest" }, { uuid: "synthetic-second", title: "Second Guest" }];
    var app = boot(storage, { profiles: profiles });
    await app.toProfile();
    assert.strictEqual(app.focused(), app.find("First Guest"), "With no history the first profile is focused");
    app.click("Second Guest");
    await app.settle();
    var next = boot(storage, { profiles: profiles });
    await next.toProfile();
    assert.strictEqual(next.focused(), next.find("Second Guest"), "The most recently chosen profile is focused");
}

// Runs the queued callbacks due within maxDelay (and those they queue), leaving longer timers such as the idle ones.
function runTimers(timers, maxDelay) {
    for (var guard = 0; guard < 100; guard += 1) {
        var due = timers.filter(function (timer) { return timer.delay <= maxDelay; });
        if (!due.length) { return; }
        due.forEach(function (timer) { timers.splice(timers.indexOf(timer), 1); timer.callback(); });
    }
}
function shelfHubs() {
    var hubs = [];
    for (var i = 0; i < 7; i += 1) {
        hubs.push({ title: "Shelf " + i, hubIdentifier: "home.movies." + i, librarySectionID: 1,
            Metadata: [movie(i * 10 + 1, "Movie " + i + "a"), movie(i * 10 + 2, "Movie " + i + "b")] });
    }
    return hubs;
}
function posterStates(app) {
    var states = [];
    (function visit(node) {
        if (node.className === "poster") { states.push(node.attributes["data-artwork-state"]); }
        node.children.forEach(visit);
    }(app.screen));
    return states;
}

async function laterShelvesFollowTheFirstPaint() {
    var timers = [];
    var app = await firstLaunch(memoryStorage(), shelfHubs, timers);
    assert.strictEqual(countClass(app.screen, "shelf"), 2, "Only the first two shelves exist synchronously");
    assert.strictEqual(app.cardTitles().length, 4);
    assert(timers.length > 0, "The rest is queued");
    runTimers(timers, 100);
    assert.strictEqual(countClass(app.screen, "shelf"), 7, "The later shelves appear after the timers run");
    assert.strictEqual(app.cardTitles().length, 14);
}

async function downFinishesTheShelves() {
    var timers = [];
    var app = await firstLaunch(memoryStorage(), shelfHubs, timers);
    assert.strictEqual(countClass(app.screen, "shelf"), 2);
    app.key(39);
    assert.strictEqual(countClass(app.screen, "shelf"), 2, "Other keys do not draw them");
    app.key(40);
    assert.strictEqual(countClass(app.screen, "shelf"), 7, "Down draws the remaining shelves before it moves");
    runTimers(timers, 100);
    assert.strictEqual(countClass(app.screen, "shelf"), 7, "The queued chunk does not draw them twice");
}

async function staleChunkDrawsNothing() {
    var timers = [];
    var app = await firstLaunch(memoryStorage(), shelfHubs, timers);
    assert.strictEqual(countClass(app.screen, "shelf"), 2);
    app.click("Settings");
    await app.settle();
    runTimers(timers, 100);
    app.key(40);
    assert.strictEqual(countClass(app.screen, "shelf"), 0, "A chunk from the old Home draws nothing into the new view");
    assert.strictEqual(countClass(app.screen, "hub-title"), 0);
}

async function focusOncePerRender() {
    var timers = [];
    var app = await firstLaunch(memoryStorage(), shelfHubs, timers);
    // A second render of the same Home (Refresh) is one render, one focus() call.
    Node.focusCount = 0;
    app.click("Account");
    Node.focusCount = 0;
    app.click("Refresh");
    await app.settle();
    runTimers(timers, 100);
    assert(Node.focusCount <= 1, "Rendering Home focuses once, not " + Node.focusCount + " times");
}

async function laterShelvesGetArtworkAtOnce() {
    var timers = [];
    var app = await firstLaunch(memoryStorage(), shelfHubs, timers);
    runTimers(timers, 100);
    function shelfStates() {
        return posterStates(app).reduce(function (rows, state, index) {
            rows[Math.floor(index / 2)] = rows[Math.floor(index / 2)] || state;
            return rows;
        }, []);
    }
    var states = shelfStates();
    assert(states.length > 3 && states.every(Boolean), "Every shelf asks for its artwork as soon as it is drawn: " + JSON.stringify(states));
}

async function run() {
    await laterShelvesFollowTheFirstPaint();
    await downFinishesTheShelves();
    await staleChunkDrawsNothing();
    await focusOncePerRender();
    await laterShelvesGetArtworkAtOnce();
    await skeletonAndNoProfilePage();
    await protectedProfileStillAsksForPin();
    await freshHomeIsRemembered();
    await rememberedHome();
    await sizeIsCapped();
    await fallbacks();
    await clearing();
    await lastProfileIsFocused();
    console.log("Tizen instant Home tests: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
