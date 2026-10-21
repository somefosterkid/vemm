"use strict";
var assert = require("assert");
var fs = require("fs");
var vm = require("vm");

function Node(tag, text) {
    this.tag = tag;
    this.text = text || "";
    this.children = [];
    this.events = {};
    this.value = "";
    this.attributes = {};
}
// A control's text includes its children (the profile name sits in a span).
Object.defineProperty(Node.prototype, "textContent", {
    get: function () { return this.text + this.children.map(function (child) { return child.textContent; }).join(""); },
    set: function (value) { this.text = value; }
});
Node.prototype.appendChild = function (child) { this.children.push(child); return child; };
Node.prototype.removeChild = function (child) { this.children.splice(this.children.indexOf(child), 1); };
Object.defineProperty(Node.prototype, "firstChild", { get: function () { return this.children[0]; } });
Node.prototype.addEventListener = function (name, callback) { this.events[name] = callback; };
Node.prototype.setAttribute = function (name, value) { this.attributes[name] = value; };
Node.prototype.getAttribute = function (name) { return this.attributes[name] === undefined ? null : this.attributes[name]; };
Node.prototype.focus = function () {};
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
    var tokens = [];
    var switches = 0;
    var expire = false;
    var linkPin = true;
    var protectedProfile = true;
    var document = {
        getElementById: function (id) { return id === "screen" ? screen : id === "player-menu" ? null : status; },
        createElement: function (tag) { return new Node(tag); },
        querySelector: function () { return null; },
        addEventListener: function () {}
    };
    var accountApi = {
        getProfiles: function () { return Promise.resolve([
            { uuid: "synthetic-profile", title: "Synthetic Guest", protected: protectedProfile,
                thumb: "https://plex.tv/users/synthetic/avatar?c=1" }
        ]); },
        switchProfile: function (uuid, pin) {
            switches += 1;
            assert.strictEqual(uuid, "synthetic-profile");
            assert.strictEqual(pin, "1234");
            return Promise.resolve("synthetic-profile-token");
        },
        getServers: function () {
            return Promise.resolve([
                { id: "offline", name: "Offline", owned: true, token: "", connections: [] },
                { id: "other", name: "Other", owned: true, token: "synthetic-other-token",
                    connections: [{ uri: "https://other.invalid" }] },
                { id: "shared", name: "Shared", owned: false, token: "synthetic-server-token",
                    connections: [{ uri: "https://relay.invalid", relay: true }] }
            ]);
        }
    };
    var api = {
        createAuthClient: function () { return {
            startAuthorization: function () { return Promise.resolve({ code: "TEST", id: 1 }); },
            pollAuthorization: function () {
                if (!linkPin) { return Promise.resolve({ status: "denied" }); }
                return Promise.resolve({ status: "linked", token: "synthetic-account-token" });
            }
        }; },
        createAccountClient: function (options) { tokens.push(options.token); return accountApi; },
        selectServer: function (server) {
            assert.strictEqual(server.token, "synthetic-server-token");
            return Promise.resolve({ relay: true, client: {
                getSections: function () {
                    return expire ? Promise.reject({ status: 401, scope: "server" }) : Promise.resolve([]);
                },
                getHomeHubs: function () { return Promise.resolve([]); }
            } });
        }
    };
    vm.runInNewContext(fs.readFileSync(require.resolve("../../samsung/Vemm/main.js"), "utf8"), {
        document: document, window: { PlexApi: api, VemmHomeHero: require("../../samsung/Vemm/js/home-hero.js"), Promise: Promise, URL: URL, Blob: Blob,
            fetch: function () { assert.fail("The synthetic API must not use the network"); },
            addEventListener: function () {} },
        setTimeout: function () { return 1; }, clearTimeout: function () {}
    });
    function click(label) {
        var control = screen.querySelectorAll().find(function (node) {
            return node.tag === "button" && node.textContent === label;
        });
        assert(control, "Missing control: " + label);
        assert(!control.disabled, "Disabled control: " + label);
        control.events.click();
    }
    // Sign out asks first: the first match is the corner button, the last is the confirmation.
    function signOut() {
        click("Sign out");
        var matches = screen.querySelectorAll().filter(function (node) { return node.textContent === "Sign out"; });
        assert.strictEqual(matches.length, 2, "Sign out must ask for confirmation");
        matches[1].events.click();
    }
    async function settle() { for (var i = 0; i < 20; i += 1) { await Promise.resolve(); } }
    click("Get a new code");
    await settle();
    var identity = screen.querySelectorAll().find(function (node) { return node.textContent === "Synthetic Guest"; });
    assert(identity.children.some(function (node) { return node.tag === "img" && node.className === "profile-avatar"; }),
        "Profiles must render their returned photo, retaining initials as a loading/error fallback");
    var avatar = identity.children.find(function (node) { return node.tag === "img"; });
    assert.strictEqual(identity.attributes["data-avatar"], undefined, "Initials remain while the photo loads");
    assert.strictEqual(avatar.src, "https://plex.tv/users/synthetic/avatar?c=1", "The photo is a plain image, which follows redirects");
    assert.strictEqual(typeof avatar.onload, "function");
    avatar.onload();
    await settle();
    assert.strictEqual(identity.attributes["data-avatar"], "true", "Decoded photos must become visible");
    click("Synthetic Guest");
    click("Use this profile");
    assert.strictEqual(switches, 0);
    assert.strictEqual(status.textContent, "Enter the four-digit profile PIN.");
    var pin = screen.querySelectorAll().find(function (node) { return node.tag === "input"; });
    pin.value = "1234";
    click("Use this profile");
    await settle();
    assert.deepStrictEqual(tokens, ["synthetic-account-token", "synthetic-profile-token"]);
    assert.strictEqual(pin.value, "");
    assert(screen.querySelectorAll().some(function (node) {
        return node.textContent === "Offline (owned) — unavailable" && node.disabled;
    }));
    click("Shared (shared) — relay");
    await settle();
    assert(status.textContent.indexOf("relay (bandwidth limited)") !== -1);
    click("Change server");
    await settle();
    expire = true;
    click("Shared (shared) — relay");
    await settle();
    assert(screen.querySelectorAll().some(function (node) { return node.textContent === "Shared (shared) — relay"; }),
        "A stale server grant must return to discovery without erasing the linked account");
    click("Sign out");
    click("Get a new code");
    await settle();
    var resolveSwitch;
    accountApi.switchProfile = function () {
        return new Promise(function (resolve) { resolveSwitch = resolve; });
    };
    click("Synthetic Guest");
    screen.querySelectorAll().find(function (node) { return node.tag === "input"; }).value = "1234";
    click("Use this profile");
    click("Back to profiles");
    await settle();
    linkPin = false;
    signOut();
    resolveSwitch("synthetic-stale-token");
    await settle();
    assert.strictEqual(tokens.indexOf("synthetic-stale-token"), -1);
    assert(screen.querySelectorAll().some(function (node) { return node.textContent === "Get a new code"; }),
        "Signing out while a profile switch is pending must land on the sign-in screen");
    linkPin = true;
    protectedProfile = false;
    var transientFailure = true;
    accountApi.switchProfile = function (uuid, pinValue) {
        assert.strictEqual(pinValue, "");
        switches += 1;
        if (transientFailure) { return Promise.reject({ message: "Temporary profile failure" }); }
        return Promise.resolve("synthetic-unprotected-token");
    };
    click("Get a new code");
    await settle();
    var before = switches;
    click("Synthetic Guest");
    await settle();
    assert.strictEqual(switches, before + 1, "An unprotected profile must switch with one click");
    assert(!screen.querySelectorAll().some(function (node) { return node.textContent === "Back to profiles"; }),
        "An unprotected profile never shows the per-profile page");
    assert.strictEqual(status.textContent, "Temporary profile failure");
    assert(screen.querySelectorAll().some(function (node) { return node.textContent === "Synthetic Guest"; }),
        "A failed switch returns to the profiles with the error");
    transientFailure = false;
    click("Synthetic Guest");
    await settle();
    assert.strictEqual(switches, before + 2, "Selecting the profile again retries it");
    assert(tokens.indexOf("synthetic-unprotected-token") !== -1);
    assert(!screen.querySelectorAll().some(function (node) { return node.textContent === "Use this profile"; }),
        "An unprotected profile must not require an intermediate confirmation");
    console.log("Tizen synthetic profile UI/recovery tests: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
