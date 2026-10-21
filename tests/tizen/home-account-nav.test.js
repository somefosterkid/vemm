"use strict";
// Home: the account button always shows the active profile (never an "Account" oval), is filled by a
// colour override, and row navigation keeps rows still: Right at a row's end does nothing, Left at its
// start goes to the account button, and Down from it returns without scrolling. The account menu wraps.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");
var css = fs.readFileSync(path.join(app, "css/style.css"), "utf8");

var THUMB = "https://plex.tv/avatars/8A7FB0/53/3";

function hub(title, prefix) {
    return { title: title, hubIdentifier: "synthetic." + prefix, Metadata: [1, 2, 3].map(function (n) {
        return { ratingKey: prefix + n, type: "movie", title: prefix + " " + n };
    }) };
}

function boot(options) {
    options = options || {};
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    window.TextDecoder = TextDecoder;
    window.fetch = function () { return Promise.reject(new Error("no network")); };
    // Avatars are asked for with XHR; this journey has no network, so they fall back to the plain image.
    window.XMLHttpRequest = function () {};
    window.XMLHttpRequest.prototype.open = function () {};
    window.XMLHttpRequest.prototype.send = function () { var xhr = this; setTimeout(function () { xhr.onerror(); }, 0); };
    window.URL.createObjectURL = function () { return "blob:synthetic"; };
    window.URL.revokeObjectURL = function () {};
    function rect(left, top, width, height) {
        return { left: left, top: top, right: left + width, bottom: top + height, width: width, height: height };
    }
    window.HTMLElement.prototype.getBoundingClientRect = function () {
        var siblings = this.parentNode ? Array.prototype.indexOf.call(this.parentNode.children, this) : 0;
        if (/(^| )media-card( |$)/.test(this.className)) {
            var shelf = this.parentNode.parentNode;
            var row = Array.prototype.indexOf.call(shelf.parentNode.children, shelf);
            return rect(siblings * 200, 400 + row * 300, 180, 200);
        }
        if (/(^| )shelf( |$)/.test(this.className)) { return rect(0, 400 + siblings * 300, 1800, 280); }
        if (/browse-header/.test(this.className)) { return rect(0, 0, 1920, 100); }
        return rect(0, 0, 0, 0);
    };
    Object.keys(options.storage || {}).forEach(function (key) { window.localStorage.setItem(key, options.storage[key]); });
    ["js/plex-api.js", "js/preferences.js", "js/session.js", "js/i18n.js", "js/home-hero.js"].forEach(function (file) {
        window.eval(fs.readFileSync(path.join(app, file), "utf8"));
    });
    window.localStorage.setItem("vemm-tizen-account", JSON.stringify({ version: 2, storage: "unencrypted", token: "synthetic-account-token" }));
    var client = {
        cancelRequests: function () {},
        getSections: function () { return Promise.resolve([{ key: "1", type: "movie", title: "Movies" }]); },
        getHomeHubs: function () { return Promise.resolve([hub("First shelf", "a"), hub("Second shelf", "b")]); }
    };
    window.PlexApi.createAccountClient = function () {
        return {
            getProfiles: function () {
                return options.profiles ? options.profiles() : Promise.resolve([{ uuid: "u1", title: "Sam", thumb: THUMB, admin: true }]);
            },
            switchProfile: function () { return Promise.resolve("synthetic-profile-token"); },
            getServers: function () {
                return options.hangServers ? new Promise(function () {}) : Promise.resolve([{ id: "s", name: "Synthetic", owned: true,
                    token: "t", connections: [{ uri: "https://pms.synthetic.invalid" }] }]);
            }
        };
    };
    window.PlexApi.selectServer = function () { return Promise.resolve({ relay: false, client: client }); };
    window.eval(fs.readFileSync(path.join(app, "main.js"), "utf8"));
    var document = window.document;
    return {
        window: window, document: document,
        settle: function () {
            var chain = Promise.resolve();
            for (var i = 0; i < 60; i += 1) { chain = chain.then(function () {}); }
            return chain.then(function () { return new Promise(function (resolve) { setTimeout(resolve, 10); }); });
        },
        button: function (label) {
            return Array.from(document.querySelectorAll("button")).find(function (node) { return node.textContent === label; });
        },
        press: function (keyCode) {
            document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: keyCode, bubbles: true, cancelable: true }));
        },
        account: function () { return document.querySelector(".account-control"); },
        cards: function () { return Array.from(document.querySelectorAll(".media-card")); },
        transform: function () { return document.querySelector(".home-track").style.transform; }
    };
}

function ruleBodies(selector) {
    var found = [];
    css.replace(/([^{}]+)\{([^{}]*)\}/g, function (all, selectors, body) {
        if (selectors.split(",").some(function (s) { return s.trim() === selector; })) { found.push(body); }
        return all;
    });
    return found;
}

async function accountButton() {
    var t = boot({ hangServers: true });
    await t.settle();
    t.button("Sam").click();
    // The skeleton (nothing remembered, servers still loading) already shows the profile.
    var account = t.account();
    assert(account, "Home draws an account button");
    assert.strictEqual(account.getAttribute("data-initial"), "S", "The skeleton shows the profile initial");
    assert.strictEqual(account.getAttribute("data-plex"), "8A7FB0", "...on the Plex colour");
    await t.settle();
    assert(account.querySelector("img").getAttribute("src") === THUMB);
    ruleBodies(".browse-header .account-control").forEach(function (body) {
        assert(!/min-width:\s*112px/.test(body) && !/width:\s*auto/.test(body), "No Account oval");
    });
    t.window.close();

    // A colour override fills the button and drops the avatar.
    t = boot({ storage: { "vemm-tizen-profile-colors": JSON.stringify({ u1: "#4f8cff" }) } });
    await t.settle();
    t.button("Sam").click();
    await t.settle();
    account = t.account();
    assert.strictEqual(account.getAttribute("data-color"), "blue");
    assert.strictEqual(account.getAttribute("data-initial"), "S");
    assert(!account.querySelector("img"), "An override shows the initial, not the Plex avatar");
    assert(ruleBodies('.browse-header .account-control[data-color="blue"]:not([data-avatar="true"])').some(function (body) {
        return /background:\s*#4f8cff/.test(body);
    }), "The button is filled with the colour");
    t.window.close();

    // Without a profile (a manual connection) a person icon replaces the word.
    t = boot({ profiles: function () { return Promise.reject({ message: "Offline" }); } });
    await t.settle();
    t.button("Use linked account").click();
    await t.settle();
    t.button("Synthetic (owned)") && t.button("Synthetic (owned)").click();
    await t.settle();
    account = t.account();
    assert(account, "Home draws an account button");
    assert.strictEqual(account.getAttribute("data-initial"), null, "No profile, no initial");
    assert(ruleBodies(".browse-header .account-control::before").some(function (body) {
        return /display:\s*block/.test(body);
    }), "The generic person icon is shown");
    t.window.close();
}

async function navigation() {
    var t = boot();
    await t.settle();
    t.button("Sam").click();
    await t.settle();
    var cards = t.cards();
    assert.strictEqual(cards.length, 6, "Two rows of three cards");
    var account = t.account();

    cards[2].focus();
    t.press(39);
    assert.strictEqual(t.document.activeElement, cards[2], "Right on a row's last card does nothing");
    cards[5].focus();
    t.press(39);
    assert.strictEqual(t.document.activeElement, cards[5], "...on every row");
    t.press(37);
    assert.strictEqual(t.document.activeElement, cards[4], "Left inside a row still steps");

    cards[3].focus();
    var rest = t.transform();
    t.press(37);
    assert.strictEqual(t.document.activeElement, account, "Left on a row's first card goes to the account button");
    t.press(40);
    assert.strictEqual(t.document.activeElement, cards[3], "Down returns to the card it came from");
    assert.strictEqual(t.transform(), rest, "...without moving the rows");

    cards[0].focus();
    t.press(37);
    assert.strictEqual(t.document.activeElement, account, "Left on the first row's first card goes to the account button");
    t.press(40);
    assert.strictEqual(t.document.activeElement, cards[0]);

    t.press(40);
    assert(cards.indexOf(t.document.activeElement) >= 3, "Down still changes rows");
    t.window.close();
}

// Left/Right never move the rows vertically; only an Up/Down row change does.
async function horizontalKeepsRows() {
    var t = boot();
    await t.settle();
    t.button("Sam").click();
    await t.settle();
    var cards = t.cards();
    cards[0].focus();
    var first = t.transform();
    t.press(40);
    assert.strictEqual(t.document.activeElement, cards[3]);
    var second = t.transform();
    assert.notStrictEqual(second, first, "Down to another row moves the rows");
    t.press(39);
    assert.strictEqual(t.document.activeElement, cards[4]);
    assert.strictEqual(t.transform(), second, "Right keeps the rows still");
    t.press(39);
    assert.strictEqual(t.document.activeElement, cards[5]);
    assert.strictEqual(t.transform(), second, "...on every step");
    t.press(37);
    assert.strictEqual(t.transform(), second, "Left keeps the rows still");
    t.press(38);
    assert.notStrictEqual(t.transform(), second, "Up changes rows");
    t.window.close();
}

function titleRules() {
    var rules = ruleBodies(".screen-home .media-card:focus .card-title");
    assert(rules.some(function (body) { return /width:\s*200%/.test(body); }), "The focused title is twice the card width");
    assert(!rules.some(function (body) { return /background|box-shadow/.test(body); }), "...with no plate, halo or shadow behind it");
    assert(ruleBodies(".media-card:focus").some(function (body) { return /z-index:\s*\d/.test(body); }),
        "...above its neighbours");
    assert(ruleBodies(".screen-home .media-card:focus .card-meta").some(function (body) { return /width:\s*200%/.test(body); }),
        "The year, episode or time-left line below it is as wide");
    assert(!rules.some(function (body) { return /box-shadow/.test(body); }), "...and the title has no halo");
}

async function menuWraps() {
    var t = boot();
    await t.settle();
    t.button("Sam").click();
    await t.settle();
    t.account().click();
    var utilities = t.document.querySelector(".home-utilities");
    assert(!utilities.hidden, "The account button opens the menu");
    var items = Array.from(utilities.querySelectorAll("button"));
    assert.strictEqual(t.document.activeElement, items[0]);
    t.press(38);
    assert.strictEqual(t.document.activeElement, items[items.length - 1], "Up on the first item jumps to the last");
    t.press(40);
    assert.strictEqual(t.document.activeElement, items[0], "Down on the last item goes to the first");
    t.press(40);
    assert.strictEqual(t.document.activeElement, items[1], "Ordinary Down still steps");
    t.window.close();
}

(async function () {
    await accountButton();
    await navigation();
    await horizontalKeepsRows();
    titleRules();
    await menuWraps();
    console.log("Tizen Home account/navigation tests: passed");
}()).catch(function (error) { console.error(error); process.exitCode = 1; });
