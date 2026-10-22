"use strict";
// "Ends at" clock time and the screensaver switch. Synthetic only.
var assert = require("assert");
var EndsAt = require("../../samsung/Vemm/js/ends-at.js");
var Screensaver = require("../../samsung/Vemm/js/screensaver.js");

var night = new Date(2030, 0, 1, 21, 30, 0);
assert.strictEqual(EndsAt.time(72 * 60000, "en", night), "10:42 PM");
assert.strictEqual(EndsAt.time(72 * 60000, "es", night), "22:42");
assert.strictEqual(EndsAt.time(72 * 60000, "be", night), "22:42");
assert.strictEqual(EndsAt.time(3 * 3600000, "en", night), "12:30 AM", "past midnight, 12 AM");
assert.strictEqual(EndsAt.time(14.5 * 3600000, "en", night), "12:00 PM", "noon is 12 PM");
assert.strictEqual(EndsAt.time(5 * 60000, "es", new Date(2030, 0, 1, 8, 0, 0)), "08:05");
assert.strictEqual(EndsAt.time(-5, "en", night), "9:30 PM", "nothing left ends now");

function tv(failing) {
    var calls = [];
    return {
        calls: calls,
        webapis: { appcommon: {
            AppCommonScreenSaverState: { SCREEN_SAVER_ON: "on", SCREEN_SAVER_OFF: "off" },
            setScreenSaver: function (state, ok, fail) {
                calls.push(state);
                if (failing === "throw") { throw new Error("synthetic"); }
                if (failing === "callback") { fail(); } else { ok(); }
            }
        } }
    };
}
var device = tv();
var saver = Screensaver.create({ webapis: device.webapis });
saver.keepAwake(true); saver.keepAwake(true);
saver.keepAwake(false); saver.keepAwake(false);
assert.deepStrictEqual(device.calls, ["off", "on"], "only changes reach the TV");
device = tv("callback");
saver = Screensaver.create({ webapis: device.webapis });
saver.keepAwake(true); saver.keepAwake(true);
assert.deepStrictEqual(device.calls, ["off", "off"], "a refused call is retried by the next one");
device = tv("throw");
saver = Screensaver.create({ webapis: device.webapis });
saver.keepAwake(true);
saver.keepAwake(false);
assert.deepStrictEqual(device.calls, ["off", "on"], "a throwing API never reaches playback");
Screensaver.create({ webapis: {} }).keepAwake(true);
Screensaver.create({ webapis: { appcommon: {} } }).keepAwake(true);
Screensaver.keepAwake(true);
console.log("Tizen ends-at and screensaver: passed");
