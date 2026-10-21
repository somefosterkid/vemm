"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");
var movie = { ratingKey: "10", type: "movie", title: "Synthetic incomplete movie", duration: 100000,
    Media: [{ id: 20, Part: [{ id: 20, key: "/library/parts/20/file.mp4", size: 4000000 }] }] };

async function run() {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    var calls = [];
    var nativeOpens = 0;
    window.TextDecoder = TextDecoder;
    window.webapis = { avplay: {
        getState: function () { return "NONE"; },
        open: function () { nativeOpens += 1; },
        setDisplayRect: function () {}, setDisplayMethod: function () {}, setListener: function () {}
    } };
    window.fetch = function (target, options) {
        var url = new URL(target);
        calls.push({ path: url.pathname, method: options.method });
        var payload;
        // plex.tv cannot list profiles, so the linked account is offered.
        if (url.pathname === "/api/v2/home/users") { return Promise.resolve({ ok: false, status: 500 }); }
        else if (url.pathname === "/api/v2/resources") {
            payload = [{ clientIdentifier: "synthetic-server", name: "Synthetic PMS", provides: "server", owned: true,
                accessToken: "synthetic-server-token", connections: [{ uri: "https://pms.synthetic.invalid" }] }];
        } else {
            var container;
            if (url.pathname === "/identity") { container = { machineIdentifier: "synthetic-server" }; }
            else if (url.pathname === "/library/sections") {
                container = { Directory: [{ key: "1", type: "movie", title: "Movies" }] };
            } else if (url.pathname === "/hubs/promoted") {
                container = { Hub: [{ title: "Movies", Metadata: [movie] }] };
            } else if (url.pathname === "/library/metadata/10") { container = { Metadata: [movie] }; }
            else if (url.pathname === "/playQueues") {
                container = { playQueueID: 1, Metadata: [{ ratingKey: "10", playQueueItemID: 1 }] };
            } else if (url.pathname === "/video/:/transcode/universal/decision") {
                return Promise.resolve({ ok: false, status: 400 });
            } else if (url.pathname === "/library/sections/1/all") { container = { Metadata: [], size: 0 }; }
            else { throw new Error("Unexpected synthetic request: " + url.pathname); }
            payload = { MediaContainer: container };
        }
        return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(payload); } });
    };
    window.localStorage.setItem("vemm-tizen-account", JSON.stringify({
        version: 2, storage: "unencrypted", token: "synthetic-account-token"
    }));
    window.localStorage.setItem("vemm-tizen-favorite-libraries", JSON.stringify({ "synthetic-server": ["1"] }));
    for (var script of window.document.querySelectorAll("script[src]")) {
        var src = script.getAttribute("src");
        if (src.indexOf("$WEBAPIS") === 0) { continue; }
        window.eval(fs.readFileSync(path.join(app, src), "utf8"));
    }
    async function settle() {
        for (var tick = 0; tick < 10; tick += 1) {
            await new Promise(function (resolve) { setTimeout(resolve, 0); });
        }
    }
    function click(text) {
        var control = Array.from(window.document.querySelectorAll("button")).find(function (button) {
            return button.textContent.trim() === text;
        });
        assert(control, "Missing control: " + text);
        control.click();
    }
    try {
        await settle();
        click("Use linked account");
        await settle();
        click("Synthetic PMS (owned)");
        await settle();
        var card = window.document.querySelector(".media-card");
        assert(card, "The synthetic movie must be visible");
        card.click();
        await settle();
        click("Play");
        await settle();
        assert.match(window.document.getElementById("status").textContent,
            /can't be played.*damaged.*analyzed/i);
        assert(!calls.some(function (call) {
            return call.path === "/playQueues" || /\/transcode\/|\/:\/timeline|\/library\/parts\//.test(call.path);
        }), "An incomplete source must be rejected before queue creation, negotiation, selection or progress");
        assert.strictEqual(nativeOpens, 0);
        movie.Media[0].Part[0].Stream = [{ streamType: 1, codec: "h264" }];
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 10009, bubbles: true }));
        await settle();
        window.document.querySelector(".media-card").click();
        await settle();
        click("Play");
        await settle();
        assert.match(window.document.getElementById("status").textContent,
            /can't be played.*damaged.*analyzed/i, "A decision 400 must show the same recovery guidance");
        assert.strictEqual(calls.filter(function (call) { return /\/transcode\/universal\/decision$/.test(call.path); }).length, 1);
        assert(!calls.some(function (call) { return /start\.|\/:\/timeline/.test(call.path); }));
        assert.strictEqual(nativeOpens, 0);
        var message = window.document.getElementById("status").textContent;
        for (var language of ["es", "be"]) {
            window.VemmI18n.setLanguage(language);
            assert(window.VemmI18n.has(message), "Unavailable-media guidance must have an explicit translation");
            assert.notStrictEqual(window.VemmI18n.error(new Error(message)), message);
        }
    } finally { dom.window.close(); }
    console.log("Tizen incomplete-media UI fails explicitly without playback writes: passed");
}
run().catch(function (error) { console.error(error.stack || error); process.exitCode = 1; });
