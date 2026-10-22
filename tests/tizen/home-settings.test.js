"use strict";
// Home rows, opening the last profile at launch, developer mode and the error log. Everything here is synthetic.
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
Node.prototype.click = function () { this.events.click({}); };
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


function movie(id, title) { return { ratingKey: String(id), type: "movie", title: title, thumb: "/thumb/" + id }; }
var SECTIONS = [{ key: "1", type: "movie", title: "Movies" }];
var HUBS = [
    { title: "Alpha Shelf", hubIdentifier: "synthetic.alpha", librarySectionID: 1, Metadata: [movie(1, "Alpha Movie")] },
    { title: "Beta Shelf", hubIdentifier: "synthetic.beta", librarySectionID: 1, Metadata: [movie(2, "Beta Movie")] },
    { title: "Gamma Shelf", hubIdentifier: "synthetic.gamma", librarySectionID: 1, Metadata: [movie(3, "Gamma Movie")] }
];
var ROWS_KEY = "vemm-tizen-home-rows-synthetic-profile-machine-a";

// options: profiles, protectedProfile, hubs, signedIn (a saved sign-in).
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
    var record = { switches: 0 };
    var home = {
        cancelRequests: function () {},
        getSections: function () { return Promise.resolve(SECTIONS); },
        getHomeHubs: function () { return Promise.resolve(options.hubs || HUBS); },
        getRelated: function () { return Promise.resolve({ Hub: [] }); }
    };
    var servers = [{ id: "machine-a", name: "Alpha", owned: true, token: "t-a", connections: [{ uri: "https://a.invalid" }] }];
    var profiles = options.profiles || [{ uuid: "synthetic-profile", title: "Synthetic Guest", protected: !!options.protectedProfile }];
    var api = {
        createAccountClient: function () { return {
            getProfiles: function () { return Promise.resolve(profiles); },
            switchProfile: function () { record.switches += 1; return Promise.resolve("synthetic-profile-token"); },
            getServers: function () { return Promise.resolve(servers); },
            getWatchlistState: function () { return Promise.resolve(false); }
        }; },
        selectServer: function () { return Promise.resolve({ relay: false, client: home }); }
    };
    var window = { PlexApi: api, VemmHomeHero: require("../../samsung/Vemm/js/home-hero.js"), Promise: Promise, URL: URL, Blob: Blob,
        localStorage: storage, fetch: function () { assert.fail("The synthetic UI must not use the network"); },
        addEventListener: function (name, callback) { listeners[name] = callback; } };
    ["js/i18n.js", "js/preferences.js", "js/session.js", "js/favorites.js", "js/item-menu.js", "js/recents.js",
        "js/dev-mode.js", "js/home-rows.js"].forEach(function (file) {
        vm.runInNewContext(fs.readFileSync(require.resolve("../../samsung/Vemm/" + file), "utf8"), window);
    });
    if (options.signedIn) { window.VemmSession.save(storage, "synthetic-account-token"); }
    vm.runInNewContext(fs.readFileSync(require.resolve("../../samsung/Vemm/main.js"), "utf8"), {
        document: document, window: window, clearTimeout: function () {}, setTimeout: function (callback) { Promise.resolve().then(callback); return 1; }
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
    return { screen: screen, status: status, find: find, click: click, settle: settle, record: record, cardTitles: cardTitles,
        focused: function () { return document.activeElement; }, listeners: listeners,
        key: function (code) { listeners.keydown({ keyCode: code, preventDefault: function () {} }); },
        labels: function () { return screen.querySelectorAll().map(function (node) { return node.textContent; }); } };
}

function savedPrefs(extra) {
    var prefs = { quality: "original", language: "en", nextEpisode: "countdown" };
    Object.keys(extra || {}).forEach(function (name) { prefs[name] = extra[name]; });
    return { "vemm-tizen-preferences": JSON.stringify(prefs), "vemm-tizen-last-profile": "synthetic-profile" };
}

async function launchesAtThePickerByDefault() {
    var app = boot(memoryStorage(savedPrefs()), { signedIn: true });
    await app.settle();
    assert(app.find("Synthetic Guest"), "The profile picker is shown");
    assert.strictEqual(app.record.switches, 0);
}

async function opensTheLastProfile() {
    var app = boot(memoryStorage(savedPrefs({ autoOpenProfile: true })), { signedIn: true });
    await app.settle();
    assert.strictEqual(app.record.switches, 1, "The last profile is switched to without a choice");
    assert(!app.find("Synthetic Guest") && !app.find("Edit profiles"), "The picker is skipped");
    assert(app.find("Home") || app.find("Start watching"));
}

async function aPinStillAsks() {
    var app = boot(memoryStorage(savedPrefs({ autoOpenProfile: true })), { signedIn: true, protectedProfile: true });
    await app.settle();
    assert(app.find("Use this profile"), "A protected profile asks for its PIN");
    assert.strictEqual(app.record.switches, 0);
}

async function aMissingProfileFallsBack() {
    var storage = memoryStorage(savedPrefs({ autoOpenProfile: true }));
    storage.setItem("vemm-tizen-last-profile", "removed-profile");
    var app = boot(storage, { signedIn: true });
    await app.settle();
    assert(app.find("Synthetic Guest") && app.record.switches === 0, "An unknown last profile leaves the picker");
}

async function homeFollowsTheChosenRows() {
    var storage = memoryStorage(savedPrefs({ autoOpenProfile: true }));
    storage.setItem(ROWS_KEY, JSON.stringify({ order: ["synthetic.gamma", "synthetic.alpha"], hidden: ["synthetic.beta"] }));
    var app = boot(storage, { signedIn: true });
    await app.settle();
    if (app.find("Start watching")) { app.click("Start watching"); await app.settle(); }
    assert.deepStrictEqual(app.cardTitles(), ["Gamma Movie", "Alpha Movie"], "Hidden rows are dropped and the order is kept");
}

async function settingsHomeRows() {
    var storage = memoryStorage(savedPrefs({ autoOpenProfile: true }));
    var app = boot(storage, { signedIn: true });
    await app.settle();
    if (app.find("Start watching")) { app.click("Start watching"); await app.settle(); }
    assert.deepStrictEqual(app.cardTitles(), ["Alpha Movie", "Beta Movie", "Gamma Movie"], "New rows show in server order");
    app.click("Settings");
    app.click("Home");
    app.click("Open last profile on launch: On");
    assert.strictEqual(JSON.parse(storage.getItem("vemm-tizen-preferences")).autoOpenProfile, false);
    app.click("Home rows");
    await app.settle();
    assert.deepStrictEqual(app.labels().slice(0, 6), ["Reorder: Off", "Show all rows and reset order", "Alpha Shelf", "Beta Shelf", "Gamma Shelf", "Back"]);
    app.click("Beta Shelf");
    assert.deepStrictEqual(JSON.parse(storage.getItem(ROWS_KEY)).hidden, ["synthetic.beta"], "Enter hides a row");
    app.click("Reorder: Off");
    assert(app.find("Reorder: On"));
    app.find("Gamma Shelf").focus();
    app.key(38);
    assert.deepStrictEqual(JSON.parse(storage.getItem(ROWS_KEY)).order, ["synthetic.alpha", "synthetic.gamma", "synthetic.beta"], "Up moves the row");
    assert.strictEqual(app.focused().textContent, "Gamma Shelf", "Focus follows the moved row");
    app.key(38);
    assert.deepStrictEqual(JSON.parse(storage.getItem(ROWS_KEY)).order, ["synthetic.gamma", "synthetic.alpha", "synthetic.beta"]);
    app.click("Show all rows and reset order");
    assert.strictEqual(storage.getItem(ROWS_KEY), null, "Reset forgets the choice");
    assert.deepStrictEqual(app.labels().slice(2, 5), ["Alpha Shelf", "Beta Shelf", "Gamma Shelf"]);
}

async function developerModeAndErrorLog() {
    var storage = memoryStorage(savedPrefs({ autoOpenProfile: true }));
    var app = boot(storage, { signedIn: true });
    await app.settle();
    if (app.find("Start watching")) { app.click("Start watching"); await app.settle(); }
    app.listeners.error({ message: "before dev mode", filename: "x.js", lineno: 1 });
    assert.strictEqual(storage.getItem("vemm-tizen-error-log"), null, "Nothing is logged while developer mode is off");
    app.click("Settings");
    assert(!app.find("Developer"), "Developer settings are hidden");
    app.click("Privacy and data");
    app.click("About Vemm");
    var version = app.focused();
    assert(version && version.vemmDevCode === "", "The version line takes the code");
    [2, 5, 8].forEach(function (digit) { app.key(48 + digit); });
    assert.strictEqual(storage.getItem("vemm-tizen-dev-mode"), null, "A partial code does nothing");
    app.key(48);
    assert.strictEqual(storage.getItem("vemm-tizen-dev-mode"), "1", "2580 turns developer mode on");
    assert(/Developer mode is on/.test(app.status.textContent));
    app.listeners.error({ message: "boom https://a.invalid/x?X-Plex-Token=SECRETVALUE&a=1", filename: "http://t/main.js", lineno: 7 });
    var logged = JSON.parse(storage.getItem("vemm-tizen-error-log"));
    assert.strictEqual(logged.length, 1);
    assert(logged[0].message.indexOf("SECRETVALUE") === -1 && logged[0].message.indexOf("[redacted]") !== -1, "Tokens are redacted: " + logged[0].message);
    app.click("Back");
    app.click("Back");
    app.click("Developer");
    app.click("Error log");
    assert(app.labels().some(function (label) { return /boom https:\/\/a\.invalid\/x\?X-Plex-Token=\[redacted\]/.test(label); }), "The log lists the entry");
    app.click("Clear log");
    assert.strictEqual(storage.getItem("vemm-tizen-error-log"), null);
    assert(/No errors recorded/.test(app.status.textContent));
    app.click("Back");
    app.click("Turn off developer mode");
    assert.strictEqual(storage.getItem("vemm-tizen-dev-mode"), null);
    assert(!app.find("Developer"), "Turning it off hides the section again");
}

async function run() {
    await launchesAtThePickerByDefault();
    await opensTheLastProfile();
    await aPinStillAsks();
    await aMissingProfileFallsBack();
    await homeFollowsTheChosenRows();
    await settingsHomeRows();
    await developerModeAndErrorLog();
    console.log("Tizen Home rows, last-profile launch and developer mode tests: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
