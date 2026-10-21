"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");
var session = require("../../samsung/Vemm/js/session");

function harness(saved, failure, persistence) {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var data = {};
    var tokens = [];
    var approved = false;
    var switches = 0;
    var expired = false;
    var finishSelection;
    var cancelledRequests = 0;
    var storage = {
        getItem: function (key) { return data[key] || null; },
        setItem: function (key, value) {
            if (failure === "save") { throw new Error("Synthetic storage failure"); }
            data[key] = value;
        },
        removeItem: function (key) {
            if (failure === "delete") { throw new Error("Synthetic storage failure"); }
            delete data[key];
        }
    };
    if (saved) {
        data["vemm-tizen-account"] = JSON.stringify(typeof saved === "object" ? saved :
            { version: 2, storage: "unencrypted", token: saved });
    }
    if (persistence) { data["vemm-tizen-save-sign-in"] = persistence; }
    Object.defineProperty(dom.window, "localStorage", { value: storage });
    dom.window.fetch = function () { assert.fail("The synthetic session API must not use the network"); };
    dom.window.PlexApi = {
        createAuthClient: function () { return {
            startAuthorization: function () { return Promise.resolve({ code: "TEST", id: 1 }); },
            pollAuthorization: function () {
                // The code shown automatically stays pending until the test approves it.
                return Promise.resolve(approved ? { status: "linked", token: "synthetic-account-token" } : { status: "pending" });
            }
        }; },
        createAccountClient: function (options) {
            tokens.push(options.token);
            return {
                getProfiles: function () {
                    return expired ? Promise.reject({ status: 401, scope: "account", message: "Expired" }) :
                        Promise.resolve([{ uuid: "synthetic-profile", title: "Protected", protected: true },
                            { uuid: "linked-profile", title: "Linked", admin: true }]);
                },
                switchProfile: function (uuid, pin) {
                    // The linked profile keeps the account token, like the old linked-account shortcut.
                    if (uuid === "linked-profile") { return Promise.resolve(null); }
                    switches += 1;
                    assert.strictEqual(pin, "1234");
                    return Promise.resolve("synthetic-profile-token");
                },
                getServers: function () {
                    if (failure === "server-denial" || failure === "happy" || failure === "save" || failure === "pending") {
                        return Promise.resolve([{ id: "synthetic-server", name: "Synthetic", token: "synthetic-server-token",
                            connections: [{ uri: "https://server.synthetic.invalid" }] },
                            // A second server keeps the list on screen; a lone server connects automatically.
                            { id: "synthetic-other", name: "Other", token: "synthetic-other-token",
                                connections: [{ uri: "https://other.synthetic.invalid" }] }]);
                    }
                    return Promise.reject({ status: 401, scope: "account", message: "Expired" });
                }
            };
        },
        selectServer: function (server, options) {
            if (failure === "pending") {
                options.onClient({ cancelRequests: function () { cancelledRequests += 1; } });
                options.onAttempt({ index: 1, total: 2, relay: false });
                return new Promise(function (resolve) { finishSelection = resolve; });
            }
            return Promise.resolve({ client: {
                getSections: function () {
                    return failure === "server-denial" ?
                        Promise.reject({ status: 403, scope: "server", message: "Server access denied" }) :
                        Promise.resolve([{ key: "1", type: "movie", title: "Movies" }]);
                },
                getHomeHubs: function () { return Promise.resolve([]); }
            } });
        }
    };
    ["js/i18n.js", "js/session.js", "main.js"].forEach(function (file) {
        dom.window.eval(fs.readFileSync(path.join(app, file), "utf8"));
    });
    return {
        dom: dom, storage: storage, tokens: tokens,
        switches: function () { return switches; },
        cancellations: function () { return cancelledRequests; },
        finishSelection: function () {
            finishSelection({ client: {
                getSections: function () { assert.fail("Cancelled selection must not load Home"); },
                getHomeHubs: function () { assert.fail("Cancelled selection must not load Home"); }
            } });
        },
        expire: function () { expired = true; },
        approve: function () { approved = true; },
        text: function () { return dom.window.document.body.textContent; },
        click: function (label) {
            var node = Array.from(dom.window.document.querySelectorAll("button")).find(function (button) {
                return button.textContent === label;
            });
            assert(node, "Missing control: " + label);
            node.click();
        }
    };
}
async function settle() {
    for (var i = 0; i < 15; i += 1) { await Promise.resolve(); }
}
async function run() {
    var denied = harness("synthetic-account-token", "server-denial");
    await settle();
    denied.click("Linked");
    await settle();
    denied.click("Synthetic (shared)");
    await settle();
    assert.strictEqual(session.load(denied.storage), "synthetic-account-token", "PMS access denial must not erase the Plex account");
    assert(denied.text().includes("Server access denied"));
    denied.click("Settings");
    await settle();
    denied.click("Privacy and data");
    await settle();
    assert(denied.text().includes("Stay signed in on this TV: On"),
        "Saved sign-in controls must remain reachable when PMS is unavailable");
    denied.click("Back");
    await settle();
    denied.click("Back");
    await settle();
    assert(denied.text().includes("Choose a server"));
    denied.dom.window.close();
    var pending = harness("synthetic-account-token", "pending");
    await settle();
    pending.click("Linked");
    await settle();
    pending.click("Synthetic (shared)");
    assert.strictEqual(pending.dom.window.document.activeElement.textContent, "Cancel connection");
    assert(pending.text().includes("Trying secure connection 1 of 2"),
        "Connection attempts must be visible without publishing private origins");
    pending.dom.window.document.dispatchEvent(new pending.dom.window.KeyboardEvent("keydown", {
        keyCode: 8, bubbles: true
    }));
    await settle();
    assert(pending.text().includes("Choose a server"));
    assert(!pending.text().includes("Cancel connection"));
    assert.strictEqual(pending.cancellations(), 1, "Back must cancel registered connection clients");
    pending.finishSelection();
    await settle();
    assert(pending.text().includes("Choose a server"), "Late connection success must not override cancellation");
    pending.dom.window.close();
    // An automatic connection draws no server page or connecting controls, and Back still cancels it.
    pending = harness("synthetic-account-token", "pending");
    await settle();
    pending.storage.setItem("vemm-tizen-last-server-linked-profile", "synthetic-server");
    pending.click("Linked");
    await settle();
    assert(!pending.text().includes("Choose a server") && !pending.text().includes("Cancel connection") &&
        !pending.text().includes("Trying secure connection"), "An automatic connection shows no connecting screen");
    pending.dom.window.document.dispatchEvent(new pending.dom.window.KeyboardEvent("keydown", { keyCode: 8, bubbles: true }));
    await settle();
    assert(pending.text().includes("Choose a server"), "Back cancels an automatic connection and shows the list");
    assert.strictEqual(pending.cancellations(), 1);
    pending.dom.window.close();
    var app = harness("");
    assert.strictEqual(app.dom.window.document.querySelector(".remember-checkbox"), null,
        "The primary link/QR screen has no credential-storage checkbox");
    assert(!app.text().includes("unencrypted"), "Credential-storage disclosure belongs in Settings, not primary sign-in");
    app.approve();
    app.click("Get a new code");
    await settle();
    assert.strictEqual(session.load(app.storage), "synthetic-account-token",
        "A successful link must survive an application restart by default");
    var savedRecord = JSON.parse(app.storage.getItem("vemm-tizen-account"));
    app.dom.window.close();
    app = harness(savedRecord, "happy");
    await settle();
    assert.deepStrictEqual(app.tokens, ["synthetic-account-token"],
        "A new application instance restores the version-2 record without QR pairing");
    assert(!app.text().includes("Get a new code"));
    app.dom.window.close();

    app = harness("", "happy", "off");
    app.approve();
    app.click("Get a new code");
    await settle();
    assert.strictEqual(session.load(app.storage), "", "A later link must respect the remembered Settings opt-out");
    assert.deepStrictEqual(app.tokens, ["synthetic-account-token"], "Opt-out must not prevent session-only sign-in");
    app.dom.window.close();

    app = harness("", "happy");
    app.approve();
    app.click("Get a new code");
    await settle();
    assert.strictEqual(session.load(app.storage), "synthetic-account-token", "A new link persists by default");
    app.click("Linked");
    await settle();
    app.click("Synthetic (shared)");
    await settle();
    app.click("Settings");
    await settle();
    app.click("Privacy and data");
    await settle();
    var storageChoice = function () {
        return Array.from(app.dom.window.document.querySelectorAll("button")).find(function (node) {
            return /^Stay signed in on this TV:/.test(node.textContent);
        });
    };
    assert.strictEqual(storageChoice().textContent, "Stay signed in on this TV: On");
    assert.strictEqual(storageChoice().getAttribute("aria-pressed"), "true");
    storageChoice().click();
    assert.strictEqual(session.load(app.storage), "", "Turning the Settings choice off removes the saved token without signing out");
    storageChoice().click();
    assert.strictEqual(session.load(app.storage), "synthetic-account-token");
    app.click("Sign out");
    assert.strictEqual(session.load(app.storage), "");
    app.dom.window.close();

    app = harness("synthetic-account-token");
    await settle();
    assert.deepStrictEqual(app.tokens, ["synthetic-account-token"]);
    app.click("Protected");
    app.click("Use this profile");
    assert.strictEqual(app.switches(), 0);
    app.dom.window.document.querySelector("input").value = "1234";
    app.click("Use this profile");
    await settle();
    assert.strictEqual(app.switches(), 1);
    assert.strictEqual(session.load(app.storage), "", "Expired grants must delete the root saved credential");
    app.dom.window.close();

    app = harness("", "save");
    app.approve();
    app.click("Get a new code");
    await settle();
    assert(app.text().includes("Could not save sign-in"),
        "Default persistence failure must be visible while the linked session remains usable");
    app.click("Linked");
    await settle();
    app.click("Synthetic (shared)");
    await settle();
    app.click("Settings");
    await settle();
    app.click("Privacy and data");
    await settle();
    storageChoice().click();
    assert(app.text().includes("Could not update saved sign-in"), "A storage failure leaves account sign-in functional and reports the error");
    app.dom.window.close();

    app = harness("synthetic-account-token", "delete");
    await settle();
    app.click("Linked");
    await settle();
    assert(app.text().includes("Clear this app's data"), "Expiry recovery must retain a deletion-failure warning");
    app.dom.window.close();
    console.log("Tizen session default persistence/relaunch/opt-out/PIN/expiry/error UI tests: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
