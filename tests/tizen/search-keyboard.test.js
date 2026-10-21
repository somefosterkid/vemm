"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var source = fs.readFileSync(path.resolve(__dirname, "../../samsung/Vemm/js/search-ui.js"), "utf8");
var dom = new JSDOM("<body></body>", { runScripts: "outside-only" });
var window = dom.window;
window.eval(source);
var ui = window.VemmSearchUi;

function element(tag, className, text) {
    var node = window.document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined) { node.textContent = text; }
    return node;
}
function press(node, keyCode) {
    var event = new window.KeyboardEvent("keydown", { keyCode: keyCode, bubbles: true, cancelable: true });
    node.dispatchEvent(event);
    return event;
}
function build(options) {
    var changes = [];
    var instance = ui.keyboard(Object.assign({
        element: element, translate: function (text) { return text; },
        onChange: function (value) { changes.push(value); },
        extras: [{ label: "Both", action: function () {} }, { label: "Movies", action: function () {} }]
    }, options || {}));
    window.document.body.appendChild(instance.node);
    return { instance: instance, changes: changes };
}
function key(instance, label) {
    return Array.prototype.filter.call(instance.node.querySelectorAll("button"), function (node) { return node.textContent === label; })[0];
}

// Layout: 3 rows of 12 keys, A-Z then 0-9 in order, plus one action row.
var built = build();
var rows = built.instance.node.querySelectorAll(".keyboard-row");
assert.strictEqual(rows.length, 4, "three letter rows and one action row");
var labels = [0, 1, 2].map(function (row) {
    var keys = rows[row].querySelectorAll("button");
    assert.strictEqual(keys.length, 12, "row " + row + " holds 12 keys");
    return Array.prototype.map.call(keys, function (node) { return node.textContent; }).join("");
});
assert.deepStrictEqual(labels, ["ABCDEFGHIJKL", "MNOPQRSTUVWX", "YZ0123456789"]);
assert.deepStrictEqual(Array.prototype.slice.call(rows[3].querySelectorAll("button")).map(function (node) { return node.textContent; }),
    ["Space", "Delete", "Clear"], "the action row holds only Space, Delete and Clear");
// Netflix layout: filters above the display, keys left of the panel.
var filters = built.instance.node.querySelector(".keyboard-filters");
assert(filters, "filter buttons live in their own row");
assert.deepStrictEqual(Array.prototype.map.call(filters.querySelectorAll("button"), function (node) { return node.textContent; }), ["Both", "Movies"]);
assert(filters.compareDocumentPosition(built.instance.display) & window.Node.DOCUMENT_POSITION_FOLLOWING, "filters come before the text display");
assert(!built.instance.node.querySelector(".keyboard-row .keyboard-extra"), "no filter button in the action row");
var body = built.instance.node.querySelector(".keyboard-body");
assert(body && body.querySelector(".keyboard-keys .keyboard-row"), "keys sit in a body block");
assert(built.instance.display.compareDocumentPosition(body) & window.Node.DOCUMENT_POSITION_FOLLOWING, "display above the body");
assert(!body.contains(built.instance.display), "display is outside the collapsible body");
assert(!built.instance.node.querySelector("input, textarea"), "No text input may open the Tizen IME");

// Typing builds the query; Delete and Clear edit it.
key(built.instance, "D").click(); key(built.instance, "A").click(); key(built.instance, "R").click(); key(built.instance, "K").click();
assert.strictEqual(built.instance.value(), "DARK");
assert.strictEqual(built.instance.display.querySelector(".keyboard-text").textContent, "DARK");
key(built.instance, "Space").click(); key(built.instance, "Space").click();
assert.strictEqual(built.instance.value(), "DARK ", "Space never doubles");
key(built.instance, "K").click(); key(built.instance, "N").click();
key(built.instance, "Delete").click();
assert.strictEqual(built.instance.value(), "DARK K");
assert.strictEqual(built.changes[built.changes.length - 1], "DARK K");
key(built.instance, "Clear").click();
assert.strictEqual(built.instance.value(), "");
key(built.instance, "Delete").click();
assert.strictEqual(built.instance.value(), "", "Delete on an empty query is harmless");

// Physical keyboard and remote number keys still type; Backspace deletes without leaving the page.
var bubbled = [];
window.document.addEventListener("keydown", function (event) { bubbled.push(event.keyCode); });
key(built.instance, "A").focus();
press(window.document.activeElement, 52);
press(window.document.activeElement, 66);
assert.strictEqual(built.instance.value(), "4B");
var back = press(window.document.activeElement, 8);
assert.strictEqual(built.instance.value(), "4");
assert(back.defaultPrevented);
assert.deepStrictEqual(bubbled, [], "Handled typing keys do not reach the app's key handler (Backspace is Back there)");
press(window.document.activeElement, 13);
assert.deepStrictEqual(bubbled, [13], "OK still reaches the focused key");
built.instance.set("");

// Arrow navigation: no wrap, clamped rows, Down from the action row exits.
var exits = 0;
built.instance.enter = function () { exits += 1; };
function step(code) { press(window.document.activeElement, code); return window.document.activeElement.textContent; }
key(built.instance, "A").focus();
assert.strictEqual(step(37), "A", "no wrap to the left");
assert.strictEqual(step(38), "Both", "Up from the top row reaches the filters");
assert.strictEqual(step(38), "Both", "no wrap upward");
assert.strictEqual(step(39), "Movies");
assert.strictEqual(step(40), "B", "Down from the filters returns to the keys");
assert.strictEqual(step(37), "A");
assert.strictEqual(step(39), "B");
assert.strictEqual(step(40), "N");
assert.strictEqual(step(40), "Z");
assert.strictEqual(step(40), "Delete", "column 2 of the action row is Delete");
assert.strictEqual(exits, 0);
assert.strictEqual(step(37), "Space");
assert.strictEqual(step(37), "Space");
press(window.document.activeElement, 40);
assert.strictEqual(exits, 1, "Down from the action row leaves the keyboard");
key(built.instance, "9").focus();
assert.strictEqual(step(40), "Clear", "Down from the last column lands on the action row's last key");
var entered = 0;
built.instance.enter = function () { entered += 1; };
key(built.instance, "L").focus();
press(window.document.activeElement, 39);
assert.strictEqual(entered, 1, "Right from the right edge enters the results");
key(built.instance, "A").focus();
press(window.document.activeElement, 39);
assert.strictEqual(entered, 1, "Right inside a row only moves");
key(built.instance, "Clear").focus();
press(window.document.activeElement, 39);
assert.strictEqual(entered, 2, "Right from the end of the short action row enters the results too");

// Results link: Down enters, Up from the first row returns to the last keyboard key.
var results = element("div");
window.document.body.appendChild(results);
ui.link(built.instance, results);
results.innerHTML = "<button>One</button><button>Two</button><button>Three</button>";
var buttons = results.querySelectorAll("button");
buttons[0].getBoundingClientRect = function () { return { top: 100, left: 100 }; };
buttons[1].getBoundingClientRect = function () { return { top: 100, left: 400 }; };
buttons[2].getBoundingClientRect = function () { return { top: 300, left: 100 }; };
built.instance.attach(results);
assert(body.contains(results), "the panel sits beside the keys");
built.instance.enter = null;
ui.link(built.instance, results);
key(built.instance, "Clear").focus();
press(key(built.instance, "Clear"), 40);
assert.strictEqual(window.document.activeElement, buttons[0], "Down from the keyboard enters the results");
assert(built.instance.node.classList.contains("keyboard-collapsed"), "entering the results hides the keys");
assert(built.instance.display.parentNode === built.instance.node, "the typed query stays visible while the keys are hidden");
buttons[2].focus();
press(buttons[2], 38);
assert.strictEqual(window.document.activeElement, buttons[2], "Up from a lower row is left to normal navigation");
press(buttons[1], 38);
assert.strictEqual(window.document.activeElement, key(built.instance, "Clear"), "Up from the first results row returns to the keyboard");
assert(!built.instance.node.classList.contains("keyboard-collapsed"), "Up restores the keys");
// Right from the edge collapses; Left from the first results column or restore() brings the keys back on the last key used.
key(built.instance, "L").focus();
press(key(built.instance, "L"), 39);
assert.strictEqual(window.document.activeElement, buttons[0], "Right from the edge enters the results");
assert(built.instance.collapsed());
press(buttons[0], 37);
assert.strictEqual(window.document.activeElement, key(built.instance, "L"), "Left from the first column restores focus to the last key used");
assert(!built.instance.collapsed());
press(key(built.instance, "L"), 39);
assert(built.instance.collapsed());
assert.strictEqual(built.instance.restore(), true, "restore() reports it brought the keyboard back");
assert.strictEqual(window.document.activeElement, key(built.instance, "L"));
assert.strictEqual(built.instance.restore(), false, "restore() is a no-op when the keyboard is showing");
press(key(built.instance, "L"), 39);
buttons[1].focus();
press(buttons[1], 37);
assert.strictEqual(window.document.activeElement, buttons[1], "Left from column two is left to normal navigation");
assert(built.instance.collapsed());
built.instance.restore();

// Matching: words in any order, starts of words.
assert(ui.score("dark kn", "The Dark Knight") >= 0);
assert(ui.score("knight dark", "The Dark Knight") >= 0);
assert(ui.score("dark kn", "Darker Knights") >= 0);
assert.strictEqual(ui.score("dark kx", "The Dark Knight"), -1);
assert.strictEqual(ui.score("dark dark", "The Dark Knight"), -1, "one title word cannot satisfy two query words");
assert.strictEqual(ui.score("the dark knight", "The Dark Knight"), 0);
assert.strictEqual(ui.score("", "x"), -1);

// Ranking and the Movies / TV switch.
function item(type, title, key) { return { type: type, title: title, ratingKey: key }; }
var container = { Hub: [
    { type: "episode", Metadata: [item("episode", "Dark Knight Rises Spoof", "e1")] },
    { type: "actor", Directory: [{ tag: "Christian Bale", tagKey: "p1" }, { tag: "Christian Bale", tagKey: "p1" }] },
    { type: "genre", Directory: [{ tag: "Dark" }] },
    { type: "studio", Directory: [{ tag: "Dark Studio" }] },
    { type: "show", Metadata: [item("show", "Dark Matter", "s1")] },
    { type: "movie", Metadata: [item("movie", "Batman: The Dark Knight", "m2"), item("movie", "The Dark Knight", "m1"), item("movie", "Heat", "m3")] }
] };
var client = {};
var all = ui.arrange([{ container: container, client: client }], "all", "dark kn");
assert.strictEqual(all.titles.map(function (entry) { return entry.item.ratingKey; }).join(), "m1,m2",
    "matching titles rank first, shortest/earliest-word match ahead; dark matter does not match 'kn'");
assert.strictEqual(all.related.map(function (entry) { return entry.item.ratingKey; }).join(), "s1,m3", "server results that do not match are kept, not dropped");
assert.strictEqual(all.people.length, 1, "people are de-duplicated");
assert.strictEqual(all.tags.length, 2);
assert.strictEqual(all.episodes.length, 1);
assert.strictEqual(all.titles[0].client, client);
var movies = ui.arrange([{ container: container, client: client }], "movies", "dark kn");
assert.strictEqual(movies.episodes.length, 0, "Movies hides episodes");
assert(movies.titles.concat(movies.related).every(function (entry) { return entry.item.type === "movie"; }), "Movies hides shows");
var tv = ui.arrange([{ container: container, client: client }], "tv", "dark");
assert.strictEqual(tv.titles.map(function (entry) { return entry.item.ratingKey; }).join(), "s1");
assert.strictEqual(tv.episodes.length, 1);
assert(tv.related.every(function (entry) { return entry.item.type !== "movie"; }));
assert.strictEqual(tv.people.length, 1, "People are not restricted by the media switch");

console.log("search keyboard, results link, partial matching, ranking and Movies/TV filter: passed");

// Search results page: one row of actor photos, no Genres section, no "Search complete." status.
var page = fs.readFileSync(path.resolve(__dirname, "../../samsung/Vemm/main.js"), "utf8");
var search = page.slice(page.indexOf("function openSearch("), page.indexOf("function openDetail("));
assert(/arranged\.people\.slice\(0, 5\)/.test(search) && /"detail-person-photo"/.test(search), "search shows at most one row of actor photos");
assert(!/"Genres"|"genre"\]/.test(search), "search has no Genres section");
assert(search.indexOf("Search complete.") === -1, "search shows no completion status");
