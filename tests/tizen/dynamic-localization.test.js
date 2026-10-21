"use strict";
var fs = require("fs"), vm = require("vm"), assert = require("assert"), acorn = require("acorn");
var app = "samsung/Vemm/";
function violations(source) {
    var errors = [];
    function walk(node, inTranslation) {
        if (!node || typeof node !== "object") { return; }
        if (node.type === "CallExpression") {
            var name = node.callee.name || node.callee.property && node.callee.property.name;
            if (["setStatus", "status", "button", "element"].includes(name)) {
                var arg = node.arguments[name === "button" ? 1 : name === "element" ? 2 : 0];
                inspect(arg, false);
            }
        }
        Object.keys(node).forEach(function (key) { if (Array.isArray(node[key])) { node[key].forEach(function(v){walk(v);}); } else if(node[key] && typeof node[key]==="object") { walk(node[key]); } });
    }
    function inspect(node, translated) {
        if (!node) { return; }
        if (node.type === "CallExpression") { return; }
        if (node.type === "ConditionalExpression") { inspect(node.consequent); inspect(node.alternate); return; }
        if (node.type === "MemberExpression" && node.property.name === "message") { errors.push("raw error.message"); }
        if (node.type === "BinaryExpression" && node.operator === "+") {
            function literal(n) {
                if(n.type==="Literal" && typeof n.value==="string" && /[A-Za-z]{2}/.test(n.value)) { errors.push("raw composite: " + n.value); }
                if(n.type==="ConditionalExpression") { literal(n.consequent);literal(n.alternate); }
            }
            literal(node.left); literal(node.right);
        }
        Object.keys(node).forEach(function(k){if(node[k] && typeof node[k]==="object") { inspect(node[k], translated); }});
    }
    walk(acorn.parse(source, { ecmaVersion:5 })); return errors;
}
assert(violations('setStatus("Failed to load " + name, true);').length, "Scan catches a newly concatenated error");
assert(violations('options.status(error.message, true);').length, "Scan catches untranslated external errors");
assert.strictEqual(violations('setStatus(translate("Failed: {name}", {name:name}), true);').length, 0);
["main.js", "js/television-ui.js", "js/catalogue-ui.js", "js/search-ui.js"].forEach(function(file) {
    assert.deepStrictEqual(violations(fs.readFileSync(app+file,"utf8")), [], file+" must localize runtime error/composite UI copy");
});
var context = {};vm.runInNewContext(fs.readFileSync(app+"js/i18n.js","utf8"), context);
["es","be"].forEach(function(lang){
    context.VemmI18n.setLanguage(lang);
    var error = context.VemmI18n.error({message:"PMS request failed with HTTP 503.",status:503});
    assert(error.includes("503")); assert(!error.includes("failed"));
    assert(!context.VemmI18n.error({message:"Raw English from server"}).includes("Raw English"));
    assert(!context.VemmI18n.text("the TV refused {seconds} s",{seconds:"0.1"}).includes("refused"));
});
console.log("Tizen dynamic error/composite localization and planted-regression scan: passed");
