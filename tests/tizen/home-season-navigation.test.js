"use strict";
var assert = require("assert");
var fs = require("fs");
var vm = require("vm");

function Node(tag, text) {
    this.tag = tag;
    this.text = text || "";
    this.children = [];
    this.events = {};
    this.className = "";
    this.attributes = {};
    this.parentNode = null;
}
Object.defineProperty(Node.prototype, "textContent", {
    get: function () { return this.text + this.children.map(function (child) { return child.textContent; }).join(""); },
    set: function (value) { this.text = value; }
});
Object.defineProperty(Node.prototype, "firstChild", { get: function () { return this.children[0]; } });
Node.prototype.appendChild = function (child) { child.parentNode = this; this.children.push(child); return child; };
Node.prototype.removeChild = function (child) {
    this.children.splice(this.children.indexOf(child), 1);
    child.parentNode = null;
    return child;
};
Node.prototype.addEventListener = function (name, callback) { this.events[name] = callback; };
Node.prototype.setAttribute = function (name, value) { this.attributes[name] = value; };
Node.prototype.getAttribute = function (name) { return this.attributes[name] || ""; };
Node.prototype.focus = function () { Node.document.activeElement = this; };
Node.prototype.querySelectorAll = function () {
    var found = [];
    function walk(node) {
        if (node.tag === "button" || node.tag === "input") { found.push(node); }
        node.children.forEach(walk);
    }
    this.children.forEach(walk);
    return found;
};
Node.prototype.querySelector = function () { return this.querySelectorAll()[0] || null; };

async function run() {
    var screen = new Node("main");
    var status = new Node("p");
    var focused = null;
    var listeners = {};
    var show = { ratingKey: "132", type: "show", title: "Synthetic Show", summary: "Synthetic synopsis" };
    var season = { ratingKey: "133", type: "season", title: "Season 1", parentTitle: "Synthetic Show",
        parentRatingKey: "132", leafCount: 2, viewedLeafCount: 0 };
    var seasonTwo = { ratingKey: "134", type: "season", title: "Season 2", parentTitle: "Synthetic Show",
        parentRatingKey: "132", leafCount: 1, viewedLeafCount: 0 };
    var episode = { ratingKey: "140", type: "episode", title: "Synthetic Episode", parentRatingKey: "133" };
    var showMetadataRequests = [];
    var childRequests = [];
    function forbiddenWrite() { assert.fail("Browsing must not write Plex watch or playback state"); }

    var server = {
        cancelRequests: function () {},
        getSections: function () { return Promise.resolve([]); },
        getHomeHubs: function () {
            return Promise.resolve([{ title: "Recently Added", Metadata: [season] }]);
        },
        getMetadata: function (id) {
            showMetadataRequests.push(String(id));
            if (String(id) === show.ratingKey) { return Promise.resolve(show); }
            if (String(id) === season.ratingKey) { return Promise.resolve(season); }
            return Promise.resolve(episode);
        },
        getChildren: function (id) {
            childRequests.push(String(id));
            if (String(id) === show.ratingKey) {
                return Promise.resolve({ totalSize: 2, Metadata: [season, seasonTwo] });
            }
            return Promise.resolve({ totalSize: 1, Metadata: [episode] });
        },
        getRelated: function () { return Promise.resolve({ Hub: [] }); },
        setWatched: forbiddenWrite,
        removeContinueWatching: forbiddenWrite,
        scrobble: forbiddenWrite,
        unscrobble: forbiddenWrite,
        createVideoPlayQueue: forbiddenWrite
    };
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
                return Promise.resolve([{ id: "synthetic-server", name: "Synthetic", owned: true,
                    token: "synthetic-server-token", connections: [{ uri: "https://server.synthetic.invalid" }] }]);
            }
        }; },
        selectServer: function () { return Promise.resolve({ relay: false, client: server }); }
    };
    var document = {
        get activeElement() { return focused; },
        set activeElement(value) { focused = value; },
        getElementById: function (id) { return id === "screen" ? screen : status; },
        createElement: function (tag) { return new Node(tag); },
        querySelector: function () { return null; },
        addEventListener: function (name, callback) { listeners[name] = callback; }
    };
    Node.document = document;
    var window = {
        PlexApi: api,
        VemmHomeHero: require("../../samsung/Vemm/js/home-hero.js"),
        Promise: Promise,
        URL: URL,
        Blob: Blob,
        fetch: function () { assert.fail("Synthetic Home navigation must not use the network"); },
        addEventListener: function () {}
    };
    vm.runInNewContext(fs.readFileSync(require.resolve("../../samsung/Vemm/js/i18n.js"), "utf8"), window);
    vm.runInNewContext(fs.readFileSync(require.resolve("../../samsung/Vemm/main.js"), "utf8"), {
        document: document,
        window: window,
        console: console,
        setTimeout: function () { return 1; },
        clearTimeout: function () {}
    });

    function find(label) {
        return screen.querySelectorAll().find(function (node) {
            return node.tag === "button" && node.textContent === label;
        });
    }
    function findContaining(label) {
        return screen.querySelectorAll().find(function (node) {
            return node.tag === "button" && node.textContent.indexOf(label) !== -1;
        });
    }
    function click(label) {
        var control = find(label);
        assert(control, "Missing button: " + label + " in " +
            JSON.stringify(screen.querySelectorAll().map(function (node) { return node.textContent; })));
        control.events.click();
    }
    async function settle() { for (var i = 0; i < 50; i += 1) { await Promise.resolve(); } }

    click("Get a new code");
    await settle();
    click("Synthetic Guest");
    await settle();

    var homeSeason = screen.querySelectorAll().find(function (node) {
        return node.className === "media-card" && node.vemmCard && node.vemmCard.item.type === "season";
    });
    assert(homeSeason, "Home renders the synthetic season card");
    homeSeason.events.click();
    await settle();
    assert.strictEqual(childRequests[0], season.ratingKey, "Home season card opens its episode list");
    assert(findContaining("Synthetic Episode"), "The season episode list is visible; status=" + status.textContent +
        ", buttons=" + JSON.stringify(screen.querySelectorAll().map(function (node) { return node.textContent; })));
    assert(find("Go to show"), "The season episode list provides a route to its parent show");

    click("Go to show");
    await settle();
    assert.strictEqual(showMetadataRequests[0], show.ratingKey, "Go to show opens the parent show's detail");
    assert(find("Seasons"), "The parent show exposes its existing Seasons action");
    click("Seasons");
    await settle();
    assert.strictEqual(childRequests[1], show.ratingKey, "The show's Seasons action loads its seasons");
    assert(findContaining("Synthetic Show · Season 1"), "The first season is reachable from the show");
    assert(findContaining("Synthetic Show · Season 2"), "Other seasons are reachable from the show");
    console.log("Tizen Home season-to-show navigation: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
