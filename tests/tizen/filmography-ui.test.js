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
    this.style = {};
}
Node.prototype.appendChild = function (child) { this.children.push(child); child.parentNode = this; return child; };
Object.defineProperty(Node.prototype, "textContent", {
    get: function () { return this.text || this.children.map(function (child) { return child.textContent; }).join(""); },
    set: function (value) { this.text = value; }
});
Node.prototype.removeChild = function (child) { this.children.splice(this.children.indexOf(child), 1); };
Node.prototype.replaceChild = function (next, previous) {
    this.children.splice(this.children.indexOf(previous), 1, next);
    next.parentNode = this;
    return previous;
};
Node.prototype.getBoundingClientRect = function () { return { left: 0, right: 0, top: 0, bottom: 0 }; };
Node.prototype.getAttribute = function () { return null; };
Node.prototype.removeAttribute = function () {};
Object.defineProperty(Node.prototype, "firstChild", { get: function () { return this.children[0]; } });
Node.prototype.addEventListener = function (name, callback) { this.events[name] = callback; };
Node.prototype.setAttribute = function () {};
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


async function journey(indexFails, language, largeCareer) {
    var screen = new Node("main");
    var status = new Node("p");
    var opened = [];
    var document = {
        getElementById: function (id) { return id === "screen" ? screen : status; },
        createElement: function (tag) { return new Node(tag); },
        querySelector: function () { return null; },
        addEventListener: function () {}
    };
    var reads = [];
    var accountApi = {
        getProfiles: function () { return Promise.resolve([{ uuid: "synthetic-profile", title: "Synthetic Guest" }]); },
        switchProfile: function () { return Promise.resolve("synthetic-profile-token"); },
        getServers: function () {
            return Promise.resolve([{ id: "s", name: "Synthetic", owned: true, token: "synthetic-server-token",
                connections: [{ uri: "https://server.invalid" }] }]);
        },
        personProfile: function () { return Promise.resolve({ Metadata: [{ summary: "Synthetic biography" }] }); },
        personCredits: function (tagKey) {
            assert.strictEqual(tagKey, "5d776827151a60001f24ab18");
            if (largeCareer) {
                var credits = [];
                for (var i = 0; i < 251; i += 1) {
                    credits.push({ Metadata: { ratingKey: "career" + i, title: "Career title " + i } });
                }
                return Promise.resolve([{ title: "Acting", Credit: credits }]);
            }
            return Promise.resolve([{ title: "Acting", Credit: [
                { role: "Lead", Metadata: { ratingKey: "5d7768295af944001f1f7477", title: "Held Film", year: 2001 } },
                { Metadata: { ratingKey: "5d9c08804eefaa001f5df5fc", title: "Absent Show" } }
            ] }]);
        }
    };
    var movie = { ratingKey: "7", type: "movie", title: "Synthetic Movie",
        Role: [{ id: 921, tag: "Synthetic Actor", tagKey: "5d776827151a60001f24ab18" }] };
    var server = {
        cancelRequests: function () {},
        getSections: function () { return Promise.resolve([]); },
        getHomeHubs: function () { return Promise.resolve([{ title: "Recently Added", Metadata: [movie] }]); },
        getMetadata: function (id) {
            opened.push(String(id));
            return Promise.resolve(String(id) === "7" ? movie : { ratingKey: String(id), type: "movie", title: "Local Held Film" });
        },
        getRelated: function () { return Promise.resolve({ Hub: [] }); },
        getPerson: function (section, personId) {
            assert.strictEqual(personId, 921);
            if (indexFails) { return Promise.reject(new Error("synthetic index failure")); }
            return Promise.resolve({ totalSize: 1, Metadata: [
                { type: "movie", guid: "plex://movie/5d7768295af944001f1f7477", ratingKey: "41", title: "Local Held Film", year: 2001 }
            ] });
        },
        titleCredits: function (keys) { reads.push(keys); return Promise.resolve([]); }
    };
    var api = {
        ratingBadges: function () { return []; },
        createAuthClient: function () { return {
            startAuthorization: function () { return Promise.resolve({ code: "TEST", id: 1 }); },
            pollAuthorization: function () { return Promise.resolve({ status: "linked", token: "synthetic-account-token" }); }
        }; },
        createAccountClient: function () { return accountApi; },
        selectServer: function () { return Promise.resolve({ relay: false, client: server }); },
        matchCredit: realApi.matchCredit,
        localCatalogueIndex: realApi.localCatalogueIndex
    };
    var window = { PlexApi: api, VemmHomeHero: require("../../samsung/Vemm/js/home-hero.js"), Promise: Promise, URL: URL, Blob: Blob,
        fetch: function () { assert.fail("The synthetic API must not use the network"); },
        addEventListener: function () {},
        document: document, window: null, setTimeout: function () { return 1; }, clearTimeout: function () {} };
    window.window = window;
    ["i18n", "people", "cast-ui"].forEach(function (name) {
        vm.runInNewContext(fs.readFileSync(require.resolve("../../samsung/Vemm/js/" + name + ".js"), "utf8"), window);
    });
    vm.runInNewContext(fs.readFileSync(require.resolve("../../samsung/Vemm/main.js"), "utf8"), {
        document: document, window: window,
        setTimeout: function () { return 1; }, clearTimeout: function () {}
    });
    function find(label) {
        return screen.querySelectorAll().find(function (node) { return node.tag === "button" && node.textContent === label; });
    }
    function rowOf(card) { return card.parentNode; }
    function click(label) {
        var control = find(label);
        assert(control, "Missing control: " + label);
        control.events.click();
    }
    async function settle() { for (var i = 0; i < 40; i += 1) { await Promise.resolve(); } }
    click("Get a new code");
    await settle();
    click("Synthetic Guest");
    await settle();
    screen.querySelectorAll().find(function (node) { return node.className === "media-card"; }).events.click();
    await settle();
    window.VemmI18n.setLanguage(language);
    click("Synthetic Actor");
    await settle();
    if (largeCareer) {
        var first = find("Career title 0");
        assert(first);
        assert(!find("Career title 50"), "A long career's row keeps the DOM bounded");
        var row = rowOf(first);
        // Moving along the row builds what lies ahead, all the way to the last credit.
        for (var page = 0; page < 12; page += 1) { row.events.focus({ target: row.children[row.children.length - 1] }); }
        assert(find("Career title 250"), "Credits after the old 200-title cap remain reachable");
        return;
    }
    if (indexFails) {
        assert(find("Held Filmas Lead"), "An unchecked library must not claim availability: the credit stays in the career row");
        assert(find("Retry"), "and the failure says so");
        assert(/synthetic index failure/.test(status.textContent));
        assert(find("Held Filmas Lead").vemmCard.options.open, "and it has a search of its own rather than a title here");
        return;
    }
    if (language === "es") {
        assert(find("Local Held Film" + window.VemmI18n.text("as {character}", { character: "Lead" })));
        assert(!find("Local Held Filmas Lead"), "The caption is translated");
        return;
    }
    assert(find("Absent Show"), "A title not on this server has a card, with its bare title when nothing else is known");
    assert(!find("Held Filmas Lead"), "A title on this server is not repeated in the career row");
    assert(find("Local Held Filmas Lead"), "and its card names the character from the filmography");
    assert.deepStrictEqual(reads, [], "so no title had to be read for it");
    click("Local Held Filmas Lead");
    await settle();
    assert.deepStrictEqual(opened, ["7", "41"]);
}

var realApi = require("../../samsung/Vemm/js/plex-api");
async function run() {
    await journey(false, "en");
    await journey(true, "en");
    await journey(false, "es");
    await journey(false, "en", true);
    console.log("Tizen filmography local-library join journey: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
