"use strict";
// The Text overlay appearance page can draw a sample subtitle with the player's own element and classes.
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
    Object.defineProperty(window, "localStorage", { value: {
        getItem: function (key) { return data[key] || null; },
        setItem: function (key, value) { data[key] = value; },
        removeItem: function (key) { delete data[key]; }
    } });
    window.TextDecoder = TextDecoder;
    window.fetch = function (target) {
        var url = new URL(target);
        var container = url.pathname === "/library/sections" ? { Directory: [] } : { Hub: [] };
        return Promise.resolve({ ok: true, status: 200, json: function () {
            return Promise.resolve({ MediaContainer: container });
        } });
    };
    ["js/plex-api.js", "js/preferences.js", "js/i18n.js", "js/home-hero.js", "main.js"].forEach(function (file) {
        window.eval(fs.readFileSync(path.join(app, file), "utf8"));
    });
    var doc = window.document;
    function find(pattern) {
        return Array.from(doc.querySelectorAll("button")).find(function (node) { return pattern.test(node.textContent); });
    }
    function click(pattern) {
        var node = find(pattern);
        assert(node, "Missing control: " + pattern);
        node.focus();
        node.click();
    }
    function key(code) { doc.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: code, bubbles: true })); }
    async function settle() {
        for (var i = 0; i < 40; i += 1) { await Promise.resolve(); }
        await new Promise(function (resolve) { setImmediate(resolve); });
    }
    function preview() { return doc.getElementById("subtitle-preview"); }
    function box() { return find(/^Preview:/); }
    function on() { return box().getAttribute("aria-pressed") === "true"; }
    try {
        doc.querySelector('input[name="server"]').value = "https://pms.synthetic.invalid";
        click(/^Connect$/);
        await settle();
        click(/^Account$/); click(/^Settings$/); click(/^Text overlay appearance$/);
        assert(box() && box().tagName === "BUTTON", "The page offers a Preview toggle button");
        assert.strictEqual(box().textContent, "Preview: Off");
        assert.strictEqual(doc.querySelector("input[type=checkbox]"), null, "No native checkbox on the TV");
        assert.strictEqual(on(), false, "Preview is off by default");
        assert.strictEqual(preview(), null);
        var controls = Array.from(doc.querySelectorAll("#screen button"));
        assert.strictEqual(controls[0], box(), "The toggle is first, so focus starts on it");

        box().focus();
        box().click();
        assert.strictEqual(doc.activeElement, box());
        assert.strictEqual(box().textContent, "Preview: On", "One press turns it on");
        assert.strictEqual(on(), true);
        assert(preview(), "Checking shows the sample");
        assert.strictEqual(preview().tagName, "P");
        assert(/^subtitle-text /.test(preview().className));
        assert(preview().classList.contains("subtitle-size-medium"));
        assert(preview().classList.contains("subtitle-position-low"));
        assert(preview().classList.contains("subtitle-background-off"));
        assert(/\n/.test(preview().textContent), "The sample has two lines");
        assert.strictEqual(preview().parentNode.id, "subtitle-preview-layer");
        assert(preview().parentNode.classList.contains("hud-hidden"), "Placed as while watching, with the controls hidden");
        assert.strictEqual(preview().parentNode.parentNode, doc.querySelector("#screen").parentNode, "A full-screen layer above the settings");
        assert.strictEqual(doc.querySelector(".settings-notes").hidden, true, "The notes make way while previewing");
        assert.strictEqual(JSON.parse(data["vemm-tizen-preferences"] || "{}").subtitlePreview, undefined, "Not persisted");
        assert(!/preview/i.test(data["vemm-tizen-preferences"] || ""), "Not persisted");

        key(40);
        assert.notStrictEqual(doc.activeElement, box(), "Down leaves the toggle");
        key(38);
        assert.strictEqual(doc.activeElement, box());
        key(38);
        assert.strictEqual(doc.activeElement, Array.from(doc.querySelectorAll("#screen button")).pop(),
            "Up from the first control wraps to Back");
        key(40);
        assert.strictEqual(doc.activeElement, box(), "Down from Back wraps to the toggle");

        click(/^Text size:/);
        assert(preview(), "The preview stays on the choice page");
        click(/^Large$/);
        assert(on(), "The toggle is still on on return");
        assert(preview().classList.contains("subtitle-size-large"), "Choosing a size updates the sample");
        click(/^Text position:/);
        click(/^high$/);
        assert(preview().classList.contains("subtitle-position-high"));
        click(/^Text background:/);
        click(/^On$/);
        assert(preview().classList.contains("subtitle-background-on"));
        assert.strictEqual(doc.querySelectorAll("#subtitle-preview").length, 1);

        box().focus();
        box().click();
        assert.strictEqual(on(), false);
        assert.strictEqual(box().textContent, "Preview: Off");
        assert.strictEqual(preview(), null, "One press turns it off and removes the sample");
        assert.strictEqual(doc.getElementById("subtitle-preview-layer"), null);
        assert.strictEqual(doc.querySelector(".settings-notes").hidden, false);
        box().click();
        assert(preview(), "It can be shown again");
        click(/^Back$/);
        assert.strictEqual(preview(), null, "Leaving the page removes it");
        click(/^Text overlay appearance$/);
        assert.strictEqual(on(), false, "Re-entering starts off");
        assert.strictEqual(preview(), null);
        console.log("Text overlay preview toggle: passed");
    } finally { dom.window.close(); }
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
