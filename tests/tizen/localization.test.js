"use strict";
var fs = require("fs");
var vm = require("vm");
var assert = require("assert");
var acorn = require("acorn");
var context = {};
vm.runInNewContext(fs.readFileSync(require.resolve("../../samsung/Vemm/js/i18n"), "utf8"), context);
var source = fs.readFileSync(require.resolve("../../samsung/Vemm/main"), "utf8");
var required = new Set();
function copy(arg) {
    if (!arg) { return; }
    if (arg.type === "Literal" && typeof arg.value === "string" && arg.value) { required.add(arg.value); }
    if (arg.type === "ConditionalExpression") { copy(arg.consequent); copy(arg.alternate); }
}
function walk(node) {
    if (!node || typeof node !== "object") { return; }
    var name = node.type === "CallExpression" && (node.callee.type === "Identifier" ? node.callee.name :
        node.callee.type === "MemberExpression" && node.callee.object.name === "options" ? node.callee.property.name : "");
    if (["button", "setStatus", "serviceView", "translate", "view", "status"].includes(name)) {
        var arg = node.arguments[name === "button" ? 1 : 0];
        copy(arg);
    }
    Object.keys(node).forEach(function (key) {
        if (Array.isArray(node[key])) { node[key].forEach(walk); }
        else if (node[key] && typeof node[key] === "object") { walk(node[key]); }
    });
}
walk(acorn.parse(source, { ecmaVersion: 5 }));
walk(acorn.parse(fs.readFileSync(require.resolve("../../samsung/Vemm/js/television-ui"), "utf8"), { ecmaVersion: 5 }));
walk(acorn.parse(fs.readFileSync(require.resolve("../../samsung/Vemm/js/catalogue-ui"), "utf8"), { ecmaVersion: 5 }));
walk(acorn.parse(fs.readFileSync(require.resolve("../../samsung/Vemm/js/search-ui"), "utf8"), { ecmaVersion: 5 }));
["es", "be"].forEach(function (language) {
    context.VemmI18n.setLanguage(language);
    var missing = Array.from(required).filter(function (text) { return !context.VemmI18n.has(text); });
    assert.deepStrictEqual(missing, [], "Missing static app-copy translations: " + language);
    assert.notStrictEqual(context.VemmI18n.text("Scheduled recordings"), "Scheduled recordings");
    assert.strictEqual(context.VemmI18n.text("Synthetic server title"), "Synthetic server title");
    assert(context.VemmI18n.text("Record / {title}", { title: "<Synthetic>" }).includes("<Synthetic>"));
    assert(!context.VemmI18n.text("Resume at {time}", { time: "3:12" }).includes("{time}"));
});
console.log("Tizen English/Spanish/Belarusian static app-copy coverage: passed");
