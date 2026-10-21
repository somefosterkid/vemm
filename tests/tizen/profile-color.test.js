"use strict";
var assert = require("assert");
var fs = require("fs");
var vm = require("vm");

function Node(tag, text) {
    this.tag = tag;
    this.text = text || "";
    this.children = [];
    this.listeners = {};
    this.events = {};
    this.value = "";
    this.attributes = {};
    this.className = "";
}
// Wide text overflows its 200px box; short text fits.
Object.defineProperty(Node.prototype, "clientWidth", { get: function () { return 200; } });
Object.defineProperty(Node.prototype, "scrollWidth", { get: function () { return this.textContent.length > 20 ? 440 : 200; } });
// A control's text includes its children (the profile name sits in a span).
Object.defineProperty(Node.prototype, "textContent", {
    get: function () { return this.text + this.children.map(function (child) { return child.textContent; }).join(""); },
    set: function (value) { this.text = value; }
});
Node.prototype.appendChild = function (child) { this.children.push(child); return child; };
Node.prototype.removeChild = function (child) { this.children.splice(this.children.indexOf(child), 1); };
Object.defineProperty(Node.prototype, "firstChild", { get: function () { return this.children[0]; } });
Node.prototype.addEventListener = function (name, callback) {
    (this.listeners[name] = this.listeners[name] || []).push(callback);
    if (!this.events[name]) { this.events[name] = callback; }
};
Node.prototype.fire = function (name) { (this.listeners[name] || []).forEach(function (callback) { callback({}); }); };
Node.prototype.setAttribute = function (name, value) { this.attributes[name] = value; };
Node.prototype.focus = function () { this.fire("focus"); };
Node.prototype.querySelector = function () { return null; };
Node.prototype.querySelectorAll = function () {
    var result = [];
    function visit(node) {
        if (node.tag === "button" || node.tag === "input") { result.push(node); }
        node.children.forEach(visit);
    }
    this.children.forEach(visit);
    return result;
};

async function run() {
    var screen = new Node("main");
    var status = new Node("p");
    var storage = {};
    storage["vemm-tizen-profile-colors"] = JSON.stringify({ "long-profile": "#4f8cff" });
    var localStorage = {
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; },
        setItem: function (key, value) { storage[key] = String(value); },
        removeItem: function (key) { delete storage[key]; },
        key: function (index) { return Object.keys(storage)[index] || null; },
        get length() { return Object.keys(storage).length; }
    };
    var head = new Node("head");
    var document = {
        getElementById: function (id) { return id === "screen" ? screen : status; },
        createElement: function (tag) { return new Node(tag); },
        querySelector: function () { return null; },
        addEventListener: function () {},
        head: head
    };
    var longName = "A Very Long Profile Name That Cannot Fit";
    var accountApi = {
        getProfiles: function () { return Promise.resolve([
            { uuid: "short-profile", title: "Short" },
            { uuid: "long-profile", title: longName }
        ]); },
        switchProfile: function () { return Promise.resolve("synthetic-profile-token"); },
        getServers: function () {
            return Promise.resolve([{ id: "shared", name: "Shared", owned: false, token: "synthetic-server-token",
                connections: [{ uri: "https://relay.invalid", relay: true }] }]);
        }
    };
    var api = {
        createAuthClient: function () { return {
            startAuthorization: function () { return Promise.resolve({ code: "TEST", id: 1 }); },
            pollAuthorization: function () { return Promise.resolve({ status: "linked", token: "synthetic-account-token" }); }
        }; },
        createAccountClient: function () { return accountApi; },
        selectServer: function () {
            return Promise.resolve({ relay: true, client: {
                getSections: function () { return Promise.resolve([]); },
                getHomeHubs: function () { return Promise.resolve([]); }
            } });
        }
    };
    vm.runInNewContext(fs.readFileSync(require.resolve("../../samsung/Vemm/main.js"), "utf8"), {
        document: document, window: { PlexApi: api, VemmHomeHero: require("../../samsung/Vemm/js/home-hero.js"),
            Promise: Promise, URL: URL, Blob: Blob, localStorage: localStorage,
            fetch: function () { assert.fail("The synthetic API must not use the network"); },
            addEventListener: function () {} },
        setTimeout: function () { return 1; }, clearTimeout: function () {}
    });
    function find(label) {
        return screen.querySelectorAll().find(function (node) { return node.tag === "button" && node.textContent === label; });
    }
    function click(label) {
        var control = find(label);
        assert(control, "Missing control: " + label);
        control.events.click();
    }
    function account() {
        return screen.querySelectorAll().find(function (node) { return /account-control/.test(node.className); });
    }
    async function settle() { for (var i = 0; i < 30; i += 1) { await Promise.resolve(); } }

    click("Get a new code");
    await settle();
    var shortChoice = find("Short");
    var longChoice = find(longName);
    assert.strictEqual(shortChoice.attributes["data-color"], undefined, "Default shows no override");
    assert.strictEqual(longChoice.attributes["data-color"], "blue", "A stored colour tints the profile list");

    var longName = longChoice.children.filter(function (node) { return node.tag === "span"; })[0];
    var shortName = shortChoice.children.filter(function (node) { return node.tag === "span"; })[0];
    longChoice.fire("focus");
    assert(/(^| )marquee( |$)/.test(longName.className), "A name that overflows scrolls while focused");
    assert(!/marquee/.test(longChoice.className), "The initial circle, drawn by the button, stays still");
    assert(head.children[0].textContent.indexOf("text-indent:-248px") !== -1, "Travel is the overflow plus a margin");
    longChoice.fire("blur");
    assert(!/marquee/.test(longName.className), "An unfocused name rests");
    shortChoice.fire("focus");
    assert(!/marquee/.test(shortName.className), "A name that fits never moves");
    var css = fs.readFileSync(require.resolve("../../samsung/Vemm/css/style.css"), "utf8");
    var rule = css.match(/\.identity-choice\s*\{[^}]*\}/)[0];
    assert(/white-space:\s*nowrap/.test(rule) && !/overflow-wrap/.test(rule), "Profile names stay on one line");
    assert(/\.profile-name\.marquee\s*\{[^}]*animation:\s*profile-marquee/.test(css));
    assert(css.indexOf('.identity-choice[data-color="blue"]::before') !== -1, "The stylesheet colours every palette name");

    // Colours are edited on this screen, one profile at a time.
    click("Edit profiles");
    click("Short");
    var labels = screen.querySelectorAll().map(function (node) { return node.textContent; });
    ["Plex default", "Red", "Orange", "Yellow", "Green", "Teal", "Blue", "Purple", "Pink"].forEach(function (name) {
        assert(labels.indexOf(name) !== -1, "Palette lists " + name);
    });
    assert.strictEqual(find("Plex default").attributes["aria-pressed"], "true", "The current colour is marked");
    assert.strictEqual(find("Blue").attributes["aria-pressed"], "false");
    assert.strictEqual(find("Blue").attributes["data-color"], "blue", "Choices show a swatch");
    assert.strictEqual(find("Plex default").attributes["data-color"], undefined);
    click("Blue");
    var saved = JSON.parse(storage["vemm-tizen-profile-colors"]);
    assert.strictEqual(saved["short-profile"], "#4f8cff", "Saved per profile uuid");
    assert.strictEqual(saved["long-profile"], "#4f8cff", "Other profiles keep theirs");
    click("Short");
    assert.strictEqual(find("Blue").attributes["aria-pressed"], "true");
    click("Plex default");
    assert.strictEqual(JSON.parse(storage["vemm-tizen-profile-colors"])["short-profile"], undefined, "Plex default removes the override");
    click("Short");
    click("Blue");
    click("Done");

    click("Short");
    await settle();
    assert.strictEqual(account().attributes["data-color"], "blue", "The Home account button carries the colour");
    assert.strictEqual(account().attributes["data-initial"], "S", "...with the initial on it");
    console.log("Tizen synthetic profile colour tests: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
