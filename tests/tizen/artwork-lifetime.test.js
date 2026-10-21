"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");

async function run() {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    var created = [];
    var decoded = [];
    var revoked = [];
    window.TextDecoder = TextDecoder;
    window.URL.createObjectURL = function () {
        var url = "blob:synthetic-" + created.length;
        created.push(url);
        return url;
    };
    window.URL.revokeObjectURL = function (url) { revoked.push(url); };
    window.fetch = function (target) {
        var url = new URL(target);
        if (url.pathname === "/photo/:/transcode") {
            return Promise.resolve(new Response(new Uint8Array([1, 2, 3]), {
                headers: { "Content-Type": "image/png" }
            }));
        }
        var container;
        if (url.pathname === "/library/sections") { container = { Directory: [] }; }
        else if (url.pathname === "/hubs/promoted") {
            var hubs = [];
            for (var h = 0; h < 6; h += 1) {
                var titles = [];
                for (var i = 0; i < 12; i += 1) {
                    titles.push({ ratingKey: String(h * 12 + i), type: "movie",
                        title: "Artwork " + h + "-" + i, thumb: "/library/metadata/" + (h * 12 + i) + "/thumb" });
                }
                hubs.push({ title: "Shelf " + h, Metadata: titles });
            }
            container = { Hub: hubs };
        } else { throw new Error("Unexpected synthetic request: " + url.pathname); }
        return Promise.resolve({ ok: true, status: 200, json: function () {
            return Promise.resolve({ MediaContainer: container });
        } });
    };
    ["js/plex-api.js", "js/preferences.js", "js/i18n.js", "js/home-hero.js", "main.js"].forEach(function (file) {
        window.eval(fs.readFileSync(path.join(app, file), "utf8"));
    });
    window.document.querySelector('input[name="server"]').value = "https://pms.synthetic.invalid";
    Array.from(window.document.querySelectorAll("button")).find(function (node) {
        return node.textContent === "Connect";
    }).click();
    async function settle() {
        for (var i = 0; i < 40; i += 1) { await Promise.resolve(); }
        await new Promise(function (resolve) { setImmediate(resolve); });
    }
    // Home draws its later shelves after the first paint.
    async function showAllShelves() {
        await new Promise(function (resolve) { setTimeout(resolve, 20); });
        var all = window.document.querySelectorAll(".media-card");
        if (all.length) { all[all.length - 1].dispatchEvent(new window.Event("focus")); }
    }
    try {
        await settle();
        await showAllShelves();
        assert.strictEqual(created.length, 6, "Image concurrency must include decode, not just download");
        assert.deepStrictEqual(revoked, [], "An undecoded displayed URL must not be evicted");
        var failedImage = Array.from(window.document.querySelectorAll("img")).find(function (image) {
            return typeof image.onerror === "function";
        });
        assert.strictEqual(failedImage.getAttribute("data-artwork-state"), "decoding");
        decoded.push(failedImage.src);
        failedImage.onerror();
        await settle();
        assert.strictEqual(failedImage.getAttribute("data-artwork-state"), "unavailable");
        assert.strictEqual(failedImage.getAttribute("data-artwork-error"), "decode",
            "Fallback diagnostics must distinguish decoder failure from missing metadata or transport");
        for (var batch = 0; batch < 30; batch += 1) {
            var pending = Array.from(window.document.querySelectorAll("img")).filter(function (image) {
                return image.src.indexOf("blob:") === 0 && typeof image.onload === "function";
            });
            if (!pending.length) { break; }
            pending.forEach(function (image) {
                decoded.push(image.src);
                image.onload();
            });
            await settle();
            assert(created.length - revoked.length <= 3 + 150, "Only active decodes and the bounded cache may retain Blob URLs");
        }
        assert(created.length > 60, "Exercise more images than the old eviction limit");
        assert.strictEqual(created.length - revoked.length, created.length - 1,
            "Finished artwork stays cached; only the undecodable image is released");
        assert(window.document.querySelector('img[data-artwork-state="loaded"]'),
            "Successful images expose decode completion without leaking their URL");
        assert(revoked.every(function (url) { return decoded.indexOf(url) !== -1; }));
        function click(label) {
            Array.from(window.document.querySelectorAll("button")).find(function (node) {
                return node.textContent === label;
            }).click();
        }
        click("Account");
        click("Refresh");
        await settle();
        assert(created.length - revoked.length <= 150 + 3);
        click("Account");
        click("Settings");
        assert(created.length - revoked.length <= 150,
            "Leaving a view must cancel its active decodes and keep only the bounded cache");
        console.log("Tizen artwork decode concurrency and Blob URL lifetime: passed");
    } finally { dom.window.close(); }
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
