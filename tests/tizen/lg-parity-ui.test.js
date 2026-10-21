"use strict";
// UI journeys for the LG parity features: the per-server Favorite libraries onboarding step, the
// card hold menu (long OK versus short OK), the Continue Watching preference, and the "Other
// servers" alternate-source panel. Every server, profile and identifier is synthetic.
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
Node.prototype.focus = function () { Node.document.activeElement = this; };
Node.prototype.click = function () { if (this.events.click) { this.events.click(); } };
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
function texts(node) {
    var out = [];
    (function visit(entry) { out.push(entry.textContent); entry.children.forEach(visit); }(node));
    return out;
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

var FAVORITES = "vemm-tizen-favorite-libraries";
var episode = { ratingKey: "50", type: "episode", title: "Synthetic Episode", viewOffset: 6000,
    grandparentRatingKey: "30", parentRatingKey: "40" };
var movie = { ratingKey: "7", type: "movie", title: "Synthetic Movie", guid: "plex://movie/5d7768295af944001f1f7477" };

function boot(storage, extraHubs) {
    var screen = new Node("main");
    var status = new Node("p");
    var listeners = {};
    var timers = [];
    var document = {
        activeElement: null,
        getElementById: function (id) { return id === "screen" ? screen : id === "status" ? status : findById(screen, id); },
        createElement: function (tag) { return new Node(tag); },
        querySelector: function () { return null; },
        addEventListener: function (name, callback) { listeners[name] = callback; }
    };
    Node.document = document;
    var record = { opened: [], findGuid: [], selected: [], queues: 0 };
    function server(name, sections) {
        return {
            name: name,
            cancelRequests: function () {},
            getSections: function () { return Promise.resolve(sections); },
            getHomeHubs: function () {
                return Promise.resolve([
                    { title: "Continue Watching", hubIdentifier: "home.continue", Metadata: [episode] },
                    { title: "Recent Shows", hubIdentifier: "home.television.recent", librarySectionID: 2,
                        Metadata: [{ ratingKey: "60", type: "show", title: "Shows Shelf Item" }] },
                    { title: "Recent Movies", hubIdentifier: "home.movies.recent", librarySectionID: 1, Metadata: [movie] }
                ].concat(extraHubs || []));
            },
            getMetadata: function (id) {
                record.opened.push(name + ":" + id);
                return Promise.resolve(String(id) === "7" ? movie : { ratingKey: String(id), type: "episode", title: "Opened " + id });
            },
            getRelated: function () { return Promise.resolve({ Hub: [] }); },
            findGuid: function (section, guid) {
                record.findGuid.push(name + ":" + section + ":" + guid);
                return Promise.resolve([{ ratingKey: "900", type: "movie", title: "Copy on " + name,
                    Media: [{ videoResolution: "1080" }] }]);
            },
            createVideoPlayQueue: function () { record.queues += 1; return Promise.reject(new Error("unused")); }
        };
    }
    var sections = [{ key: "1", type: "movie", title: "Movies" }, { key: "2", type: "show", title: "Shows" }];
    var clients = { a: server("Alpha", sections), b: server("Beta", [{ key: "5", type: "movie", title: "Films" }]) };
    var api = {
        ratingBadges: function () { return []; },
        createAuthClient: function () { return {
            startAuthorization: function () { return Promise.resolve({ code: "TEST", id: 1 }); },
            pollAuthorization: function () { return Promise.resolve({ status: "linked", token: "synthetic-account-token" }); }
        }; },
        createAccountClient: function () { return {
            getProfiles: function () { return Promise.resolve([{ uuid: "synthetic-profile", title: "Synthetic Guest" }]); },
            switchProfile: function () { return Promise.resolve("synthetic-profile-token"); },
            getServers: function () {
                return Promise.resolve([
                    { id: "machine-a", name: "Alpha", owned: true, token: "t-a", connections: [{ uri: "https://a.invalid" }] },
                    { id: "machine-b", name: "Beta", owned: false, token: "t-b", connections: [{ uri: "https://b.invalid" }] }
                ]);
            },
            getWatchlistState: function () { return Promise.resolve(false); }
        }; },
        selectServer: function (entry) {
            record.selected.push(entry.id);
            return Promise.resolve({ relay: false, client: entry.id === "machine-a" ? clients.a : clients.b });
        }
    };
    var window = { PlexApi: api, VemmHomeHero: require("../../samsung/Vemm/js/home-hero.js"), Promise: Promise, URL: URL, Blob: Blob, localStorage: storage,
        fetch: function () { assert.fail("The synthetic UI must not use the network"); },
        addEventListener: function () {} };
    ["i18n.js", "js/preferences.js", "js/favorites.js", "js/item-menu.js"].forEach(function (file) {
        var path = require.resolve("../../samsung/Vemm/" + (file === "i18n.js" ? "js/i18n.js" : file));
        vm.runInNewContext(fs.readFileSync(path, "utf8"), window);
    });
    vm.runInNewContext(fs.readFileSync(require.resolve("../../samsung/Vemm/main.js"), "utf8"), {
        document: document, window: window, console: console,
        setTimeout: function (callback, delay) { timers.push({ callback: callback, delay: delay }); return timers.length; },
        clearTimeout: function (id) { if (timers[id - 1]) { timers[id - 1].callback = null; } }
    });
    function find(label) {
        return screen.querySelectorAll().find(function (node) { return node.tag === "button" && node.textContent === label; });
    }
    function click(label) {
        var control = find(label);
        assert(control, "Missing control: " + label + " in " + JSON.stringify(screen.querySelectorAll().map(function (n) { return n.textContent; })));
        control.events.click();
    }
    function cards() { return screen.querySelectorAll().filter(function (node) { return node.className === "media-card"; }); }
    function key(name, code) { listeners[name]({ keyCode: code, repeat: false, preventDefault: function () {} }); }
    function fire(delay) {
        timers.forEach(function (timer) {
            if (timer.callback && timer.delay === delay) { var callback = timer.callback; timer.callback = null; callback(); }
        });
    }
    async function settle() { for (var i = 0; i < 60; i += 1) { await Promise.resolve(); } }
    async function signIn(serverLabel) {
        click("Get a new code");
        await settle();
        click("Synthetic Guest");
        await settle();
        var serverButton = screen.querySelectorAll().find(function (node) { return node.textContent.indexOf(serverLabel) === 0; });
        assert(serverButton, "Missing server control " + serverLabel);
        serverButton.events.click();
        await settle();
        fire(0); // Home draws its later shelves after the first paint
    }
    return { screen: screen, status: status, find: find, click: click, cards: cards, key: key, fire: fire,
        settle: settle, signIn: signIn, record: record, document: document, window: window };
}

async function onboardingSkip() {
    var storage = memoryStorage();
    var app = boot(storage);
    await app.signIn("Alpha (owned)");
    assert(app.find("Start watching"), "First run on a server opens Favorite libraries");
    assert(app.find("[x] Movies") && app.find("[x] Shows"), "Every library starts selected");
    assert.strictEqual(app.status.textContent, "Nothing is saved until you choose Start watching.");
    app.click("Skip for now");
    await app.settle();
    assert.strictEqual(storage.getItem(FAVORITES), null, "Skip writes nothing");
    assert(app.find("Movies") && app.find("Shows"), "Home shows every library after Skip");
}

async function onboardingSave() {
    var storage = memoryStorage();
    var app = boot(storage);
    await app.signIn("Alpha (owned)");
    app.click("[x] Shows");
    assert(app.find("[ ] Shows"));
    app.click("[x] Movies");
    assert(app.find("[x] Movies"), "The last library cannot be cleared");
    assert.strictEqual(app.status.textContent, "Keep at least one library.");
    app.click("Start watching");
    await app.settle();
    assert.deepStrictEqual(JSON.parse(storage.getItem(FAVORITES)), { "machine-a": ["1"] });
    assert(app.find("Movies") && !app.find("Shows"), "Home lists only favorite libraries");
    var titles = texts(app.screen);
    assert(titles.indexOf("Recent Movies") !== -1, "A favorite library's shelf stays");
    assert(titles.indexOf("Recent Shows") === -1, "A hidden library's shelf is filtered");
    assert(titles.indexOf("Continue Watching") !== -1, "Server-wide shelves stay");
}

async function holdMenuAndShortPress() {
    var storage = memoryStorage({});
    storage.setItem(FAVORITES, JSON.stringify({ "machine-a": ["1", "2"] }));
    var app = boot(storage);
    await app.signIn("Alpha (owned)");
    assert(!app.find("Start watching"), "An answered server skips onboarding");
    var deckCard = app.cards()[0];
    assert.strictEqual(deckCard.vemmCard.item.ratingKey, "50");
    deckCard.focus();
    app.key("keydown", 13);
    assert.deepStrictEqual(app.record.opened, [], "OK keydown on a card waits for key-up");
    app.fire(600);
    var menu = app.document.getElementById("player-menu");
    assert(menu, "Holding OK opens the card menu");
    var labels = menu.children.filter(function (node) { return node.tag === "button"; }).map(function (node) { return node.textContent; });
    assert.strictEqual(labels[0], "Resume", "Play is the default row, never a write");
    assert(labels.indexOf("Remove from Continue Watching") !== -1);
    assert.strictEqual(labels[labels.length - 1], "Cancel");
    assert.strictEqual(app.document.activeElement.textContent, "Resume");
    app.key("keyup", 13);
    assert(app.document.getElementById("player-menu"), "Releasing after the hold does not also click");
    assert.deepStrictEqual(app.record.opened, []);
    app.click("Cancel");
    assert(!app.document.getElementById("player-menu"));
    assert.strictEqual(app.document.activeElement, deckCard);
    app.key("keydown", 13);
    app.key("keyup", 13);
    app.fire(600);
    await app.settle();
    assert(!app.document.getElementById("player-menu"), "A short press never opens the menu");
    assert.deepStrictEqual(app.record.opened, ["Alpha:50"], "A short press opens the card");
}

async function otherServers() {
    var storage = memoryStorage({});
    storage.setItem(FAVORITES, JSON.stringify({ "machine-a": ["1", "2"] }));
    var app = boot(storage);
    await app.signIn("Alpha (owned)");
    var movieCard = app.cards().find(function (node) { return node.vemmCard.item.ratingKey === "7"; });
    movieCard.events.click();
    await app.settle();
    app.click("Other servers");
    await app.settle();
    assert.deepStrictEqual(app.record.findGuid, ["Beta:5:" + movie.guid], "The current server is excluded");
    var titles = texts(app.screen);
    assert(titles.indexOf("Beta / Films / 1080p") !== -1, "Each copy names its server and resolution");
    assert.strictEqual(app.status.textContent, "Other copies of this title. Each copy keeps its own resume position.");
}

async function restrictedProfileHubs() {
    var storage = memoryStorage({});
    var app = boot(storage, [
        { title: "Recently added in Documentaries", hubIdentifier: "home.documentaries.recent", librarySectionID: "9",
            Metadata: [{ ratingKey: "90", type: "show", title: "Documentary Item" }] },
        { title: "Empty Row", hubIdentifier: "home.empty", librarySectionID: 1, Metadata: [] },
        { title: "No Metadata Row", hubIdentifier: "home.none" }
    ]);
    await app.signIn("Alpha (owned)");
    app.click("Skip for now");
    await app.settle();
    app.fire(0);
    var titles = texts(app.screen);
    assert(titles.indexOf("Recently added in Documentaries") === -1, "A hub of a library the profile cannot see is hidden");
    assert(titles.indexOf("Empty Row") === -1 && titles.indexOf("No Metadata Row") === -1, "Empty hubs are hidden");
    assert(titles.indexOf("Recent Movies") !== -1 && titles.indexOf("Continue Watching") !== -1, "Normal hubs stay");
    assert(!app.cards().some(function (node) { return node.vemmCard.item.ratingKey === "90"; }),
        "The inaccessible hub feeds neither a row nor the hero");
}

function serverApi(app, servers) {
    var createAccountClient = app.window.PlexApi.createAccountClient;
    app.window.PlexApi.createAccountClient = function () {
        var client = createAccountClient.apply(this, arguments);
        client.getServers = function () { return Promise.resolve(servers); };
        return client;
    };
}
var ALPHA = { id: "machine-a", name: "Alpha", owned: true, token: "t-a", connections: [{ uri: "https://a.invalid" }] };
var BETA = { id: "machine-b", name: "Beta", owned: false, token: "t-b", connections: [{ uri: "https://b.invalid" }] };
var LAST = "vemm-tizen-last-server-synthetic-profile";

async function automaticServer() {
    var storage = memoryStorage({});
    storage.setItem(FAVORITES, JSON.stringify({ "machine-a": ["1", "2"], "machine-b": ["5"] }));
    // One available server connects without a list; an unavailable one does not count.
    var app = boot(storage);
    serverApi(app, [ALPHA, { id: "off", name: "Off", token: "", connections: [] }]);
    app.click("Get a new code");
    await app.settle();
    app.click("Synthetic Guest");
    await app.settle();
    assert.deepStrictEqual(app.record.selected, ["machine-a"], "A lone available server connects automatically");
    assert(app.find("Movies"), "Home is shown");
    assert.strictEqual(storage.getItem(LAST), "machine-a", "A successful connection is remembered per profile");

    // Two servers: the list is shown first, a manual pick is remembered, and the next sign-in skips the list.
    app = boot(storage);
    storage.removeItem(LAST);
    await app.signIn("Beta (shared)");
    assert.strictEqual(storage.getItem(LAST), "machine-b");
    app.click("Change server");
    await app.settle();
    assert(app.find("Alpha (owned)") && app.find("Beta (shared)"), "Change server shows the list instead of reconnecting");
    assert.deepStrictEqual(app.record.selected, ["machine-b"]);
    app = boot(storage);
    app.click("Get a new code");
    await app.settle();
    app.click("Synthetic Guest");
    await app.settle();
    assert.deepStrictEqual(app.record.selected, ["machine-b"], "The remembered server connects automatically");
    assert(app.find("Films"), "Home of the remembered server is shown");

    // A remembered server that is no longer listed falls back to the list.
    storage.setItem(LAST, "gone");
    app = boot(storage);
    app.click("Get a new code");
    await app.settle();
    app.click("Synthetic Guest");
    await app.settle();
    assert(app.find("Alpha (owned)") && app.record.selected.length === 0, "An unknown remembered server shows the list");

    // A failed automatic connection shows the list with the error.
    storage.setItem(LAST, "machine-a");
    app = boot(storage);
    app.window.PlexApi.selectServer = function () { return Promise.reject(new Error("Synthetic connection failure")); };
    app.click("Get a new code");
    await app.settle();
    app.click("Synthetic Guest");
    await app.settle();
    assert(app.find("Beta (shared)"), "A failed automatic connection offers the server list");
    assert(texts(app.screen).some(function (text) { return text.indexOf("Synthetic connection failure") !== -1; }),
        "The failure is shown");
}

async function automaticConnectionIsSilent() {
    var storage = memoryStorage({});
    storage.setItem(FAVORITES, JSON.stringify({ "machine-a": ["1", "2"] }));
    var app = boot(storage);
    serverApi(app, [ALPHA]);
    var seen = [];
    var append = Node.prototype.appendChild;
    Node.prototype.appendChild = function (child) { seen.push(child.textContent); return append.call(this, child); };
    var release;
    app.window.PlexApi.selectServer = function () {
        var home = { cancelRequests: function () {}, getSections: function () { return Promise.resolve([]); },
            getHomeHubs: function () { return Promise.resolve([]); } };
        return new Promise(function (resolve) { release = function () { resolve({ relay: false, client: home }); }; });
    };
    try {
        app.click("Get a new code");
        await app.settle();
        app.click("Synthetic Guest");
        await app.settle();
        assert(release, "The lone server is being connected");
        assert(!app.find("Cancel connection") && !app.find("Alpha (owned)"), "No connecting controls while connecting automatically");
        assert(!/Discovering/.test(app.status.textContent), "No discovery status: " + app.status.textContent);
        release();
        await app.settle();
        assert(app.find("Home"), "Home is shown");
        ["Choose a server", "Cancel connection", "Alpha (owned)"].forEach(function (text) {
            assert.strictEqual(seen.indexOf(text), -1, "The server page never renders: " + text);
        });
    } finally { Node.prototype.appendChild = append; }
}

async function run() {
    await restrictedProfileHubs();
    await automaticServer();
    await automaticConnectionIsSilent();
    await onboardingSkip();
    await onboardingSave();
    await holdMenuAndShortPress();
    await otherServers();
    console.log("Tizen Favorite libraries onboarding, card hold menu and Other servers UI: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
