"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");

async function run() {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only", pretendToBeVisual: true
    });
    var window = dom.window;
    var data = {};
    var failStorage = false;
    var state = { created: 0, enabled: [], presented: [], cleared: 0, disposed: 0, fail: false };
    Object.defineProperty(window, "localStorage", { value: {
        getItem: function (key) { return data[key] || null; },
        setItem: function (key, value) {
            if (failStorage) { throw new Error("Synthetic storage failure"); }
            data[key] = value;
        },
        removeItem: function (key) { delete data[key]; }
    } });
    window.VemmGraphics = { create: function (options) {
        state.created += 1;
        return {
            setEnabled: function (enabled) { state.enabled.push(enabled); },
            present: function (image) {
                state.presented.push(image);
                if (state.fail) { options.onError(new Error("Synthetic GPU failure")); }
            },
            clear: function () { state.cleared += 1; },
            dispose: function () { state.disposed += 1; }
        };
    } };
    window.TextDecoder = TextDecoder;
    window.URL.createObjectURL = function () { return "blob:synthetic-artwork"; };
    window.URL.revokeObjectURL = function () {};
    window.fetch = function (target) {
        var url = new URL(target);
        assert.strictEqual(url.origin, "https://pms.synthetic.invalid");
        if (url.pathname === "/photo/:/transcode") {
            return Promise.resolve(new Response(new Uint8Array([1, 2, 3]), {
                headers: { "Content-Type": "image/png" }
            }));
        }
        var container;
        if (url.pathname === "/library/sections") { container = { Directory: [] }; }
        else if (url.pathname === "/hubs/promoted") {
            container = { Hub: [{ title: "Featured", Metadata: [
                { ratingKey: "1", type: "movie", title: "Synthetic one", art: "/art/1" },
                { ratingKey: "2", type: "movie", title: "Synthetic two", art: "/art/2" }
            ] }] };
        } else { throw new Error("Unexpected synthetic request: " + url.pathname); }
        return Promise.resolve({ ok: true, status: 200, json: function () {
            return Promise.resolve({ MediaContainer: container });
        } });
    };
    ["js/plex-api.js", "js/preferences.js", "js/i18n.js", "js/home-hero.js", "main.js"].forEach(function (file) {
        window.eval(fs.readFileSync(path.join(app, file), "utf8"));
    });
    function find(pattern) {
        return Array.from(window.document.querySelectorAll("button")).find(function (node) {
            return pattern.test(node.textContent);
        });
    }
    function click(pattern) {
        var node = find(pattern);
        assert(node, "Missing control: " + pattern);
        node.focus();
        node.click();
    }
    async function settle() {
        for (var i = 0; i < 40; i += 1) { await Promise.resolve(); }
        await new Promise(function (resolve) { setImmediate(resolve); });
    }
    async function decode() {
        await settle();
        Array.from(window.document.querySelectorAll("img")).forEach(function (image) {
            if (typeof image.onload === "function") { image.onload(); }
        });
        await settle();
    }
    function settings() { click(/^Account$/); click(/^Settings$/); click(/^Graphics$/); }
    function saved() { return JSON.parse(data["vemm-tizen-preferences"]); }
    try {
        assert(!find(/^New graphics enhancements:/), "Enhancements are not offered before connection/login");
        assert.strictEqual(state.created, 0);
        window.document.querySelector('input[name="server"]').value = "https://pms.synthetic.invalid";
        click(/^Connect$/);
        await decode();
        assert.strictEqual(state.created, 0, "Existing rendering must allocate no new GPU backend by default");
        assert(window.document.querySelector(".home-track"), "The existing compositor movement remains");
        settings();
        assert(find(/^New graphics enhancements: Off$/));
        assert.strictEqual(find(/^New graphics enhancements:/).getAttribute("aria-pressed"), "false");
        click(/^New graphics enhancements:/);
        assert.strictEqual(saved().enhancedGraphics, true);
        assert.strictEqual(state.created, 0, "Enable is lazy; Settings contains no artwork context");
        click(/^Back$/); click(/^Back$/);
        await decode();
        assert.strictEqual(state.created, 1);
        assert.strictEqual(state.enabled[0], true);
        assert(state.presented.length > 0);
        assert(state.presented.every(function (image) {
            return image.getAttribute("data-artwork-state") === "loaded";
        }));
        settings();
        assert(state.cleared > 0, "Leaving Home releases the GPU view");
        click(/^New graphics enhancements:/);
        assert.strictEqual(saved().enhancedGraphics, false);
        assert.strictEqual(state.enabled[state.enabled.length - 1], false);
        var rendered = state.presented.length;
        click(/^Back$/); click(/^Back$/);
        await decode();
        assert.strictEqual(state.presented.length, rendered, "Off preserves the original renderer");
        settings();
        failStorage = true;
        click(/^New graphics enhancements:/);
        assert(find(/^New graphics enhancements: Off$/), "Failed persistence must not enable enhancements");
        assert.strictEqual(saved().enhancedGraphics, false);
        assert(window.document.getElementById("status").textContent.includes("Could not save preferences"));
        failStorage = false;
        click(/^New graphics enhancements:/);
        state.fail = true;
        click(/^Back$/); click(/^Back$/);
        await decode();
        assert(window.document.getElementById("status").textContent.includes("Existing graphics remain active"));
        assert(window.document.querySelector('img.home-hero-art[data-artwork-state="loaded"]'),
            "GPU fallback must not mark successfully decoded artwork unavailable");
        Object.defineProperty(window.document, "hidden", { configurable: true, value: true });
        var before = state.cleared;
        window.document.dispatchEvent(new window.Event("visibilitychange"));
        assert(state.cleared > before, "Backgrounding releases enhancements without changing the baseline");
        window.dispatchEvent(new window.Event("pagehide"));
        assert.strictEqual(state.disposed, 1);
        console.log("Tizen optional graphics Settings, lazy lifecycle and baseline fallback: passed");
    } finally { dom.window.close(); }
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
