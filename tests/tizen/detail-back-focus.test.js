"use strict";
var assert = require("assert");
var fs = require("fs");
var vm = require("vm");

function Node(tag, text) {
    this.tag = tag;
    this.textContent = text || "";
    this.children = [];
    this.events = {};
    this.value = "";
}
Node.prototype.appendChild = function (child) { this.children.push(child); return child; };
Object.defineProperty(Node.prototype, "textContent", {
    get: function () { return this.text || this.children.map(function (child) { return child.textContent; }).join(""); },
    set: function (value) { this.text = value; }
});
Node.prototype.removeChild = function (child) { this.children.splice(this.children.indexOf(child), 1); };
Node.prototype.replaceChild = function (next, previous) {
    this.children.splice(this.children.indexOf(previous), 1, next);
    return previous;
};
Object.defineProperty(Node.prototype, "firstChild", { get: function () { return this.children[0]; } });
Node.prototype.addEventListener = function (name, callback) { this.events[name] = callback; };
Node.prototype.setAttribute = function () {};
Node.prototype.focus = function () { focused = this; };
Node.prototype.querySelector = function () { return null; };
var focused = null;
Node.prototype.querySelectorAll = function () {
    var result = [];
    function visit(node) {
        if (node.tag === "button" || node.tag === "input") { result.push(node); }
        node.children.forEach(visit);
    }
    this.children.forEach(visit);
    return result;
};



// Regression: Back from a detail child listing must return focus to the action that opened it.
// openDetail's loading placeholder used to consume the pending restore, so the rendered detail
// page fell back to its first control (Read more) instead of Seasons.
async function run() {
    var screen = new Node("main");
    var status = new Node("p");
    var document = {
        getElementById: function (id) { return id === "screen" ? screen : status; },
        createElement: function (tag) { return new Node(tag); },
        querySelector: function () { return null; },
        addEventListener: function () {}
    };
    Object.defineProperty(document, "activeElement", { get: function () { return focused; } });
    var show = { ratingKey: "132", type: "show", title: "Synthetic Show", summary: "Synthetic synopsis" };
    var season = { ratingKey: "133", type: "season", title: "Season 1", parentRatingKey: "132" };
    var server = {
        cancelRequests: function () {},
        getSections: function () { return Promise.resolve([]); },
        getHomeHubs: function () { return Promise.resolve([{ title: "Recently Added", Metadata: [show] }]); },
        getMetadata: function (id) { return Promise.resolve(String(id) === "132" ? show : season); },
        getRelated: function () { return Promise.resolve({ Hub: [] }); },
        getChildren: function () { return Promise.resolve({ totalSize: 1, Metadata: [season] }); }
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
                return Promise.resolve([{ id: "s", name: "Synthetic", owned: true, token: "synthetic-server-token",
                    connections: [{ uri: "https://server.invalid" }] }]);
            }
        }; },
        selectServer: function () { return Promise.resolve({ relay: false, client: server }); }
    };
    var window = { PlexApi: api, VemmHomeHero: require("../../samsung/Vemm/js/home-hero.js"), Promise: Promise, URL: URL, Blob: Blob,
        fetch: function () { assert.fail("The synthetic API must not use the network"); },
        addEventListener: function () {} };
    vm.runInNewContext(fs.readFileSync(require.resolve("../../samsung/Vemm/js/i18n.js"), "utf8"), window);
    vm.runInNewContext(fs.readFileSync(require.resolve("../../samsung/Vemm/main.js"), "utf8"), {
        document: document, window: window,
        setTimeout: function () { return 1; }, clearTimeout: function () {}
    });
    function find(label) {
        return screen.querySelectorAll().find(function (node) { return node.tag === "button" && node.textContent === label; });
    }
    function click(label) {
        var control = find(label);
        assert(control, "Missing control: " + label);
        control.focus();
        control.events.click();
    }
    async function settle() { for (var i = 0; i < 40; i += 1) { await Promise.resolve(); } }
    click("Get a new code");
    await settle();
    click("Synthetic Guest");
    await settle();
    var card = screen.querySelectorAll().find(function (node) { return node.className === "media-card"; });
    card.focus();
    card.events.click();
    await settle();
    assert(find("Read more"), "Show detail renders its synopsis expander first");
    click("Seasons");
    await settle();
    assert(find("Back"), "Seasons listing rendered");
    click("Back");
    await settle();
    assert(focused && focused.textContent === "Seasons",
        "Back to show detail must restore focus to Seasons, not " + (focused && focused.textContent));
    console.log("Tizen detail back-focus restoration: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
