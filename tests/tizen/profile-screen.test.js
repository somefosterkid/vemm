"use strict";
// "Who is watching?": Plex avatars via a plain <img>, optional colour override edited on this screen,
// a name-only marquee, a confirmed top-right Sign out, linked account only on failure, instant list.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");
var css = fs.readFileSync(path.join(app, "css/style.css"), "utf8");
var source = fs.readFileSync(path.join(app, "main.js"), "utf8");

var PROFILES = [
    { uuid: "u1", title: "Sam", thumb: "https://plex.tv/avatars/8A7FB0/53/3", admin: true, email: "private@synthetic.invalid" },
    { uuid: "u2", title: "Evie", thumb: "https://plex.tv/users/2/avatar?c=1", protected: true },
    { uuid: "u3", title: "Lou", thumb: "https://plex.tv/users/3/avatar?c=1" }
];

function boot(options) {
    options = options || {};
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    var fetched = [];
    window.fetch = function (url) { fetched.push(String(url)); return Promise.reject(new Error("no network")); };
    // Avatars load with a plain XHR: options.xhr(url) answers { responseURL, bytes } or null for a network error; options.xhrGate holds it.
    var requests = [];
    window.XMLHttpRequest = function () { this.headers = []; };
    window.XMLHttpRequest.prototype.open = function (method, url) { this.method = method; this.url = url; };
    window.XMLHttpRequest.prototype.setRequestHeader = function (name) { this.headers.push(name); };
    window.XMLHttpRequest.prototype.send = function () {
        var xhr = this;
        requests.push(xhr);
        var answer = options.xhr ? options.xhr(xhr.url) : null;
        Promise.resolve(options.xhrGate).then(function () { return new Promise(function (resolve) { setTimeout(resolve, 0); }); }).then(function () {
            if (!answer) { xhr.onerror(); return; }
            xhr.status = 200;
            xhr.responseURL = answer.responseURL;
            xhr.response = new window.Blob([new Uint8Array(answer.bytes || 20)], { type: "image/png" });
            xhr.onload();
        });
    };
    var imageSets = 0;
    var srcDescriptor = Object.getOwnPropertyDescriptor(window.HTMLImageElement.prototype, "src");
    Object.defineProperty(window.HTMLImageElement.prototype, "src", { configurable: true, get: srcDescriptor.get,
        set: function (value) { imageSets += 1; srcDescriptor.set.call(this, value); } });

    window.TextDecoder = TextDecoder;
    window.URL.createObjectURL = function () { return "blob:synthetic"; };
    window.URL.revokeObjectURL = function () {};
    window.HTMLElement.prototype.getBoundingClientRect = function () {
        return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
    };
    Object.keys(options.storage || {}).forEach(function (key) { window.localStorage.setItem(key, options.storage[key]); });
    ["js/plex-api.js", "js/preferences.js", "js/session.js", "js/i18n.js", "js/home-hero.js"].forEach(function (file) {
        window.eval(fs.readFileSync(path.join(app, file), "utf8"));
    });
    window.localStorage.setItem("vemm-tizen-account", JSON.stringify({ version: 2, storage: "unencrypted", token: "synthetic-account-token" }));
    var switched = [];
    var account = {
        getProfiles: options.getProfiles || function () { return Promise.resolve(JSON.parse(JSON.stringify(PROFILES))); },
        switchProfile: function (uuid) { switched.push(uuid); return Promise.resolve("synthetic-profile-token"); },
        getServers: function () { return new Promise(function () {}); }
    };
    window.PlexApi.createAccountClient = function () { return account; };
    window.eval(source);
    var document = window.document;
    return {
        window: window, document: document, fetched: fetched, switched: switched, requests: requests,
        imageSets: function () { return imageSets; },
        avatars: function () { return JSON.parse(window.localStorage.getItem("vemm-tizen-profile-avatars") || "{}"); },
        settle: function () {
            var chain = Promise.resolve();
            for (var i = 0; i < 40; i += 1) { chain = chain.then(function () {}); }
            return chain.then(function () { return new Promise(function (resolve) { setTimeout(resolve, 10); }); });
        },
        button: function (label) {
            return Array.from(document.querySelectorAll("button")).find(function (node) { return node.textContent === label; });
        },
        choice: function (name) {
            return Array.from(document.querySelectorAll(".identity-choice")).find(function (node) {
                return node.textContent === name;
            });
        },
        press: function (keyCode) {
            document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: keyCode, bubbles: true, cancelable: true }));
        },
        colors: function () { return JSON.parse(window.localStorage.getItem("vemm-tizen-profile-colors") || "{}"); }
    };
}

async function avatars() {
    var t = boot();
    await t.settle();
    var sam = t.choice("Sam");
    var img = sam.querySelector("img.profile-avatar");
    assert(img, "Profiles render an <img> for the Plex avatar");
    assert.strictEqual(img.getAttribute("src"), PROFILES[0].thumb, "The thumb is the image source, so redirects are followed");
    assert.deepStrictEqual(t.fetched, [], "Avatars never go through fetch");
    assert.strictEqual(t.requests.length, 3, "Each Plex avatar is asked for once with XHR");
    t.requests.forEach(function (xhr) {
        assert.strictEqual(xhr.method, "GET");
        assert.deepStrictEqual(xhr.headers, [], "No custom headers: a header would force a CORS preflight the redirect chain rejects");
    });
    assert.strictEqual(sam.getAttribute("data-initial"), "S");
    assert.strictEqual(sam.getAttribute("data-plex"), "8A7FB0", "The Plex colour in the avatar URL tints the initial circle");
    assert(t.document.head.textContent.indexOf("8A7FB0") !== -1, "A rule paints that colour");
    var evie = t.choice("Evie");
    assert.strictEqual(evie.getAttribute("data-plex"), null, "A thumb without a colour keeps the default circle");
    assert.strictEqual(sam.getAttribute("data-avatar"), null, "Initials show while the photo loads");
    assert.strictEqual(evie.getAttribute("data-photo"), "true", "A circle with a photo on its way is marked");
    img.onload();
    assert.strictEqual(sam.getAttribute("data-avatar"), "true");
    evie.querySelector("img.profile-avatar").onerror();
    assert(!evie.querySelector("img"), "A failed photo falls back to the initial");
    assert.strictEqual(evie.getAttribute("data-avatar"), null);
    t.window.close();

    // An override replaces the Plex avatar with the initial on the chosen colour.
    t = boot({ storage: { "vemm-tizen-profile-colors": JSON.stringify({ u1: "#4f8cff" }) } });
    await t.settle();
    sam = t.choice("Sam");
    assert.strictEqual(sam.getAttribute("data-color"), "blue");
    assert(!sam.querySelector("img"), "An override hides the Plex avatar");
    assert.strictEqual(sam.getAttribute("data-plex"), null, "The override wins over the Plex colour");
    assert(t.choice("Lou").querySelector("img"), "Other profiles keep their avatar");
    t.window.close();
}

var DATA = "data:image/png;base64,AAAA";
var WRAPPED = "https://i0.wp.com/plex.tv/avatars/8A7FB0/53/3?ssl=1";
function cacheOf(entries) { return { "vemm-tizen-profile-avatars": JSON.stringify(entries) }; }

async function avatarCache() {
    // Hex comes from the redirect target, wrapped or not; the image shows from a data URL.
    var t = boot({ xhr: function (url) {
        return { responseURL: url.indexOf("/users/2/") !== -1 ? "https://plex.tv/avatars/5F9E8A/45/3" : WRAPPED };
    } });
    await t.settle();
    await t.settle();
    var evie = t.choice("Evie");
    assert.strictEqual(evie.getAttribute("data-plex"), "5F9E8A", "The colour comes from the redirected URL");
    assert.strictEqual(t.choice("Lou").getAttribute("data-plex"), "8A7FB0", "...including the wp.com-wrapped URL");
    assert(/^data:image\/png;base64,/.test(evie.querySelector("img.profile-avatar").getAttribute("src")), "Shown from a data URL");
    var saved = t.avatars();
    assert.deepStrictEqual(Object.keys(saved.u2).sort(), ["dataUrl", "hex", "thumb"]);
    assert.strictEqual(saved.u2.hex, "5F9E8A");
    assert.strictEqual(saved.u2.thumb, PROFILES[1].thumb);
    assert(saved.u3 && saved.u1, "Cached per profile uuid");
    t.window.close();

    // A cached avatar renders at once, before any request answers.
    var release;
    var gate = new Promise(function (resolve) { release = resolve; });
    t = boot({ xhrGate: gate, xhr: function () { return { responseURL: WRAPPED }; },
        storage: cacheOf({ u1: { thumb: PROFILES[0].thumb, dataUrl: DATA, hex: "8A7FB0" } }) });
    await t.settle();
    var sam = t.choice("Sam");
    var img = sam.querySelector("img.profile-avatar");
    assert.strictEqual(img.getAttribute("src"), DATA, "Cached data URL shown without waiting for the network");
    assert.strictEqual(sam.getAttribute("data-plex"), "8A7FB0");
    img.onload();
    assert.strictEqual(sam.getAttribute("data-avatar"), "true");
    // The refresh returns different bytes: the image and the cache change.
    var before = t.imageSets();
    release();
    await t.settle();
    await t.settle();
    assert.notStrictEqual(img.getAttribute("src"), DATA, "A changed avatar replaces the cached one");
    assert.strictEqual(sam.querySelector("img"), img, "...in the same element");
    assert(t.imageSets() > before);
    assert.notStrictEqual(t.avatars().u1.dataUrl, DATA);
    t.window.close();

    // plex.tv re-stamps a profile avatar URL (?c=<last use>) each time it is used; the cached photo still applies.
    t = boot({ xhrGate: new Promise(function () {}), storage: cacheOf({ u2: { thumb: PROFILES[1].thumb.replace("c=1", "c=7"), dataUrl: DATA, hex: "5F9E8A" } }) });
    await t.settle();
    var evie = t.choice("Evie").querySelector("img.profile-avatar");
    assert(evie && evie.getAttribute("src") === DATA, "A re-stamped avatar URL still shows the cached photo at once");
    t.window.close();

    // An unchanged refresh touches neither the DOM nor the cache.
    var probe = boot({ xhr: function () { return { responseURL: WRAPPED, bytes: 3 }; } });
    await probe.settle();
    await probe.settle();
    var current = probe.avatars().u1;
    var raw = probe.window.localStorage.getItem("vemm-tizen-profile-avatars");
    probe.window.close();
    t = boot({ storage: { "vemm-tizen-profile-avatars": raw }, xhr: function () { return { responseURL: WRAPPED, bytes: 3 }; } });
    await t.settle();
    sam = t.choice("Sam");
    img = sam.querySelector("img.profile-avatar");
    assert.strictEqual(img.getAttribute("src"), current.dataUrl);
    assert(t.requests.length > 0, "It still refreshes in the background");
    assert.strictEqual(t.imageSets(), 3, "Each cached image is set once, never again by the refresh");
    assert.strictEqual(t.window.localStorage.getItem("vemm-tizen-profile-avatars"), raw, "The cache is not rewritten");
    t.window.close();

    // A cache for an older thumb is not used.
    t = boot({ xhrGate: new Promise(function () {}), storage: cacheOf({ u1: { thumb: "https://plex.tv/avatars/000000/1/1", dataUrl: DATA, hex: "000000" } }) });
    await t.settle();
    assert(!t.choice("Sam").querySelector("img"), "A different thumb is loaded fresh");
    t.window.close();

    // The local colour override still hides the avatar and asks for nothing.
    t = boot({ storage: Object.assign(cacheOf({ u1: { thumb: PROFILES[0].thumb, dataUrl: DATA, hex: "8A7FB0" } }),
        { "vemm-tizen-profile-colors": JSON.stringify({ u1: "#4f8cff" }) }) });
    await t.settle();
    sam = t.choice("Sam");
    assert.strictEqual(sam.getAttribute("data-color"), "blue");
    assert(!sam.querySelector("img") && sam.getAttribute("data-plex") === null);
    assert(t.requests.every(function (xhr) { return xhr.url !== PROFILES[0].thumb; }), "No request for an overridden profile");
    t.window.close();
}

async function avatarCaps() {
    // A big avatar is not cached.
    var t = boot({ xhr: function () { return { responseURL: WRAPPED, bytes: 70000 }; } });
    await t.settle();
    await t.settle();
    assert.deepStrictEqual(t.avatars(), {}, "Entries over 64 KB are skipped");
    t.window.close();

    // Only the newest 20 profiles are kept.
    var many = [];
    for (var i = 0; i < 25; i += 1) { many.push({ uuid: "p" + i, title: "P" + i, thumb: "https://plex.tv/users/" + i + "/avatar?c=1" }); }
    t = boot({ getProfiles: function () { return Promise.resolve(many); }, xhr: function () { return { responseURL: WRAPPED }; } });
    await t.settle();
    await t.settle();
    var keys = Object.keys(t.avatars());
    assert.strictEqual(keys.length, 20, "The map holds at most 20 profiles");
    assert(keys.indexOf("p24") !== -1, "The newest stay");
    t.window.close();
}

async function avatarFallback() {
    var t = boot({ xhr: function () { return null; } });
    await t.settle();
    var sam = t.choice("Sam");
    assert.strictEqual(sam.querySelector("img.profile-avatar").getAttribute("src"), PROFILES[0].thumb, "An XHR error falls back to the plain image");
    assert.strictEqual(sam.getAttribute("data-plex"), "8A7FB0", "...and the colour known from the thumb");
    assert.deepStrictEqual(t.avatars(), {});
    t.window.close();
    // A failed refresh keeps the cached avatar.
    t = boot({ xhr: function () { return null; }, storage: cacheOf({ u1: { thumb: PROFILES[0].thumb, dataUrl: DATA, hex: "8A7FB0" } }) });
    await t.settle();
    assert.strictEqual(t.choice("Sam").querySelector("img").getAttribute("src"), DATA);
    assert.strictEqual(t.avatars().u1.dataUrl, DATA);
    t.window.close();
}

async function marquee() {
    var t = boot();
    await t.settle();
    var sam = t.choice("Sam");
    var name = sam.querySelector(".profile-name");
    assert(name && name.textContent === "Sam", "The name sits in its own span");
    Object.defineProperty(name, "clientWidth", { value: 100 });
    Object.defineProperty(name, "scrollWidth", { value: 300 });
    sam.dispatchEvent(new t.window.Event("focus"));
    assert(/(^| )marquee( |$)/.test(name.className), "Only the name scrolls");
    assert(!/marquee/.test(sam.className), "The button, and so the initial circle, never animates");
    sam.dispatchEvent(new t.window.Event("blur"));
    assert(!/marquee/.test(name.className));
    assert(/\.profile-name\.marquee/.test(css));
    assert(!/\.identity-choice\.marquee/.test(css), "No text-indent animation on the whole button");
    t.window.close();
}

async function editing() {
    var t = boot();
    await t.settle();
    assert(t.button("Edit profiles"), "An Edit profiles button sits below the profiles");
    t.button("Edit profiles").click();
    assert(t.button("Done") && !t.button("Edit profiles"), "Edit mode offers Done");
    t.choice("Evie").click();
    assert.deepStrictEqual(t.switched, [], "In edit mode a profile opens its colour choice instead of entering");
    var labels = Array.from(t.document.querySelectorAll("button")).map(function (node) { return node.textContent; });
    assert.strictEqual(labels[0], "Plex default", "Plex default comes first");
    ["Red", "Orange", "Yellow", "Green", "Teal", "Blue", "Purple", "Pink"].forEach(function (name) {
        assert(labels.indexOf(name) !== -1, "Palette lists " + name);
    });
    assert.strictEqual(t.button("Plex default").getAttribute("aria-pressed"), "true");
    t.button("Blue").click();
    assert.strictEqual(t.colors().u2, "#4f8cff", "Saved against the chosen profile's uuid");
    assert(t.button("Done"), "Returning from the palette keeps edit mode");
    assert.strictEqual(t.choice("Evie").getAttribute("data-color"), "blue");
    t.choice("Evie").click();
    assert.strictEqual(t.button("Blue").getAttribute("aria-pressed"), "true");
    t.button("Plex default").click();
    assert.strictEqual(t.colors().u2, undefined, "Plex default removes the override");
    t.button("Done").click();
    assert(t.button("Edit profiles"), "Done leaves edit mode");
    t.choice("Lou").click();
    assert.deepStrictEqual(t.switched, ["u3"], "Outside edit mode a profile is entered");
    await t.settle();
    t.window.close();
    assert(source.indexOf('title: "Profile"') === -1, "The Profile settings section is removed");
}

async function signOut() {
    var t = boot();
    await t.settle();
    var corner = t.document.querySelector(".profile-corner");
    assert(corner && corner.querySelector("button").textContent === "Sign out", "Sign out is in the top-right corner");
    assert(/\.profile-corner\s*\{[^}]*position:\s*fixed/.test(css) && /\.profile-corner\s*\{[^}]*right:/.test(css));
    var session = t.window.VemmSession;
    function dialogButton(label) {
        return Array.from(t.document.querySelectorAll("#player-menu button")).find(function (node) {
            return node.textContent === label;
        });
    }
    corner.querySelector("button").click();
    var dialog = t.document.getElementById("player-menu");
    assert(dialog, "Sign out asks first");
    assert.strictEqual(dialog.querySelector("h2").textContent, "Sign out of Plex on this TV?");
    assert.strictEqual(t.document.activeElement.textContent, "Cancel", "Cancel is focused by default");
    assert.strictEqual(session.load(t.window.localStorage), "synthetic-account-token");
    t.press(10009);
    assert(!t.document.getElementById("player-menu"), "Back cancels");
    assert.strictEqual(session.load(t.window.localStorage), "synthetic-account-token", "Cancelling keeps the session");
    corner.querySelector("button").click();
    dialogButton("Cancel").click();
    assert.strictEqual(session.load(t.window.localStorage), "synthetic-account-token");
    corner.querySelector("button").click();
    t.window.localStorage.setItem("vemm-tizen-profile-avatars", "{}");
    assert(t.window.localStorage.getItem("vemm-tizen-profiles"), "The profile list is remembered");
    dialogButton("Sign out").click();
    assert.strictEqual(session.load(t.window.localStorage), "", "Confirming signs out");
    assert.strictEqual(t.window.localStorage.getItem("vemm-tizen-profiles"), null, "Signing out forgets the profile list");
    assert.strictEqual(t.window.localStorage.getItem("vemm-tizen-profile-avatars"), null, "...and the cached avatars");
    t.window.close();
}

async function linkedAccount() {
    var t = boot();
    await t.settle();
    assert(!t.button("Use linked account"), "Not offered while the list loads");
    t.window.close();
    t = boot({ getProfiles: function () { return Promise.reject({ message: "Offline" }); } });
    await t.settle();
    assert(t.button("Use linked account"), "Offered when the profile list fails");
    assert(t.button("Retry profiles"));
    assert(t.button("Sign out"));
    t.window.close();
}

async function instantList() {
    var release;
    var calls = 0;
    var t = boot({
        storage: { "vemm-tizen-profiles": JSON.stringify([
            { uuid: "u1", title: "Sam", thumb: PROFILES[0].thumb, admin: true },
            { uuid: "u2", title: "Evie", thumb: PROFILES[1].thumb, protected: true },
            { uuid: "u3", title: "Lou", thumb: PROFILES[2].thumb }]) },
        getProfiles: function () {
            calls += 1;
            return new Promise(function (resolve) { release = resolve; });
        }
    });
    await t.settle();
    assert.strictEqual(calls, 1, "plex.tv is still asked");
    assert(t.choice("Sam") && t.choice("Evie") && t.choice("Lou"), "The remembered list shows before plex.tv answers");
    var lou = t.choice("Lou");
    lou.focus();
    release([
        { uuid: "u1", title: "Sam", thumb: PROFILES[0].thumb, admin: true, email: "x" },
        { uuid: "u2", title: "Evie", thumb: PROFILES[1].thumb, protected: true },
        { uuid: "u3", title: "Lou", thumb: PROFILES[2].thumb.replace("c=1", "c=9") }]);
    await t.settle();
    assert.strictEqual(t.choice("Lou"), lou, "An unchanged list is not re-rendered, even when plex.tv re-stamps an avatar URL");
    t.window.close();

    t = boot({
        storage: { "vemm-tizen-profiles": JSON.stringify([{ uuid: "u2", title: "Evie" }, { uuid: "u3", title: "Lou" }]) },
        getProfiles: function () { return new Promise(function (resolve) { release = resolve; }); }
    });
    await t.settle();
    t.choice("Lou").focus();
    release([{ uuid: "u1", title: "Sam", admin: true, email: "private@synthetic.invalid" }, { uuid: "u2", title: "Evie" },
        { uuid: "u3", title: "Lou" }]);
    await t.settle();
    assert(t.choice("Sam"), "A changed list is re-rendered");
    assert.strictEqual(t.document.activeElement.textContent, "Lou", "...keeping focus on the same profile");
    var stored = JSON.parse(t.window.localStorage.getItem("vemm-tizen-profiles"));
    assert.deepStrictEqual(stored.map(function (p) { return p.uuid; }), ["u1", "u2", "u3"]);
    assert.deepStrictEqual(Object.keys(stored[0]).sort(), ["admin", "title", "uuid"],
        "Only uuid, title, thumb, protected and admin are remembered");
    t.window.close();
}

function ringAlignment() {
    var ring = css.match(/\.identity-choice::before\s*\{([^}]*)\}/)[1];
    assert(/box-sizing:\s*border-box/.test(ring), "The ring box includes its border, so it is concentric with the avatar");
    var avatar = css.match(/\n\.profile-avatar\s*\{([^}]*)\}/)[1];
    ["width", "height", "top", "left"].forEach(function (name) {
        var re = new RegExp("(?:^|[\\s;])" + name + ":\\s*([^;]+);");
        assert.strictEqual(ring.match(re)[1], avatar.match(re)[1], "Ring and avatar share " + name);
    });
}

(async function () {
    ringAlignment();
    await avatars();
    await avatarCache();
    await avatarCaps();
    await avatarFallback();
    await marquee();
    await editing();
    await signOut();
    await linkedAccount();
    await instantList();
    console.log("Tizen profile screen tests: passed");
}()).catch(function (error) { console.error(error); process.exitCode = 1; });

assert(/\.identity-choice\[data-photo="true"\]:not\(\[data-avatar="true"\]\):not\(\[data-plex\]\):not\(\[data-color\]\)::before\s*\{[^}]*opacity:\s*0/.test(css),
    "A circle awaiting its photo with no known colour is hidden, never grey");
