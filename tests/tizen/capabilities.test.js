"use strict";
var assert = require("assert");
var capabilities = require("../../samsung/Vemm/js/capabilities.js");
var playback = require("../../samsung/Vemm/js/playback.js");
var tizen3 = "Mozilla/5.0 (SMART-TV; LINUX; Tizen 3.0)";
function product(model, firmware, family) { return {
    getModelCode: function () { return model; }, getFirmware: function () { return firmware; },
    getModel: function () { return family || "UMU6100"; }, isUdPanelSupported: function () { return true; }
}; }
var unknown = capabilities.detect({ userAgent: tizen3, productinfo: product("OTHER2017", "T-KTMDEUC-1410.1") });
assert.strictEqual(unknown.status, "documented", "An unobserved model plays from Samsung's published specifications");
assert.strictEqual(unknown.measured, false, "A documented profile must never claim a measurement");
assert.strictEqual(unknown.reason, "model", "A model mismatch should be diagnosable without revealing the model code");
assert.deepStrictEqual(unknown.video, ["h264", "hevc"], "Tizen 3 has no AV1");
assert(unknown.audio.includes("dts"), "2017 sets decode DTS");
assert(!unknown.audio.includes("truehd") && !unknown.audio.includes("flac"));
assert.deepStrictEqual(unknown.videoContainers.hevc, ["mkv", "mp4", "mpegts"], "HEVC is never direct from MOV");
assert.deepStrictEqual(unknown.audioContainers.opus, ["mkv"], "Opus only from MKV before Tizen 6");
assert.strictEqual(unknown.h264Level1080, 41);
assert.strictEqual(unknown.maxFrameRate, 60);
assert.strictEqual(unknown.maxWidth, 3840, "A UHD panel decodes 2160p");
assert.strictEqual(unknown.hdr, "hdr10", "Without avinfo, a UHD panel is assumed HDR-capable");
function avinfo(value) { return { isHdrTvSupport: function () { return value; } }; }
assert.strictEqual(capabilities.detect({ userAgent: tizen3, productinfo: product("OTHER2017", "x"), avinfo: avinfo(false) }).hdr,
    "none", "avinfo.isHdrTvSupport decides HDR");
assert.strictEqual(capabilities.detect({ userAgent: tizen3, productinfo: product("OTHER2017", "x"),
    avinfo: { isHdrTvSupport: function () { throw new Error("x"); } } }).hdr, "hdr10", "A throwing avinfo falls back to the panel");
var fhd = capabilities.detect({ userAgent: tizen3, productinfo: Object.assign(product("OTHER2017", "x"),
    { isUdPanelSupported: function () { return false; } }) });
assert.strictEqual(fhd.maxHeight, 1080); assert.strictEqual(fhd.maxBitrate, 20000, "FHD panels are held to 20 Mbps");
var tizen7 = capabilities.detect({ userAgent: "SMART-TV Tizen 7.0", productinfo: product("QE65Q80C", "x") });
assert(tizen7.video.includes("av1") && tizen7.audio.includes("flac") && !tizen7.audio.includes("dts"));
assert.deepStrictEqual(tizen7.audioContainers.opus, ["mkv", "mp4"]);
assert.strictEqual(tizen7.h264Level1080, 42);
var samsungProductInfo = {
    getModelCode: function () { return "UE55MU6172"; },
    getFirmware: function () { return "T-KTMDEUC-1410.1"; },
    getModel: function () { return "UMU6100"; }
};
var observed = capabilities.detect({ userAgent: tizen3, productinfo: product("UE55MU6172", "T-KTMDEUC-1410.1") });
assert.strictEqual(observed.status, "observed");
assert.strictEqual(observed.measured, true);
assert.strictEqual(observed.model, "UE55MU6172");
assert.strictEqual(capabilities.detect({ userAgent: tizen3, productinfo: samsungProductInfo }).status, "observed",
    "Samsung ProductInfo's synchronous DOMString getters should match the registered tuple");
assert.deepStrictEqual(observed.observations.map(function (row) { return [row.videoCodec,row.width,row.height]; }),
    [["h264",1920,1080],["hevc",3840,1600]]);
[product("UE55MU6172", "T-KTMDEUC-9999.0"), product("UE55MU6172", "T-KTMDEUC-1410.1", "OTHER"),
 product("UMU6100", "T-KTMDEUC-1410.1"), {}].forEach(function (info) {
    assert.strictEqual(capabilities.detect({userAgent:tizen3,productinfo:info}).status, "documented", "Firmware/family/read mismatch stays unmeasured");
});
assert.strictEqual(capabilities.detect({userAgent:tizen3,productinfo:product("UE55MU6172","T-KTMDEUC-9999.0")}).reason,
    "firmware", "Firmware mismatch diagnostics must identify only the mismatching field");
assert.strictEqual(capabilities.detect({userAgent:tizen3,productinfo:{getModelCode:function(){throw new Error("private detail");}}}).reason,
    "throw", "Getter exceptions must not expose exception text");
assert.strictEqual(capabilities.detect({userAgent:tizen3}).reason, "throw");
assert.strictEqual(capabilities.detect({userAgent:tizen3,productinfo:product("UE55MU6172","T-KTMDEUC-1410.1","OTHER")}).reason,
    "family", "Family mismatch diagnostics must identify only the field");
assert.strictEqual(capabilities.detect({userAgent:"SMART-TV Tizen 4.0",productinfo:samsungProductInfo}).reason,
    "tizen", "A different Tizen version must remain unverified");
assert.strictEqual(capabilities.detect({ userAgent: "Mozilla/5.0 (Macintosh)" }), null);
assert.strictEqual(capabilities.detect({ userAgent: "SMART-TV Tizen 2.4" }), null);
function plan(media, profile, quality, streams) {
    var item = { ratingKey:"1", type:"movie", Media:[Object.assign({},media,{Part:[{id:"1",key:"/library/parts/1/file",
        Stream:streams||[{streamType:1,codec:media.videoCodec}]}]})] };
    return playback.plan(item,{profile:profile,quality:quality||"original"});
}
var direct = plan({ container:"mkv",videoCodec:"hevc",audioCodec:"aac",width:3840,height:2160 }, unknown);
assert.strictEqual(direct.direct, true, "Documented UHD HEVC in MKV plays the original");
assert(direct.query["X-Plex-Client-Profile-Extra"].includes("add-direct-play-profile"));
assert.strictEqual(plan({ container:"mkv",videoCodec:"h264",audioCodec:"dca",width:1920,height:1080 }, unknown).direct, true,
    "DTS is direct on a 2017 set");
var dts7 = plan({ container:"mkv",videoCodec:"h264",audioCodec:"dca",width:1920,height:1080 }, tizen7);
assert.strictEqual(dts7.direct, false); assert.strictEqual(dts7.reason, "audio-codec");
assert.strictEqual(dts7.query.directStream, 1, "Only the audio is wrong, so the video may be copied");
var noHdr = capabilities.detect({ userAgent: tizen3, productinfo: product("OTHER2017", "x"), avinfo: avinfo(false) });
var hdrPlan = plan({ container:"mkv",videoCodec:"hevc",audioCodec:"aac",width:3840,height:1600,videoDynamicRange:"HDR10" }, noHdr);
assert.strictEqual(hdrPlan.reason, "hdr"); assert.strictEqual(hdrPlan.query.directStream, 0, "Pixel refusals always re-encode");
observed.video.push("mutated");
assert(!capabilities.detect({userAgent:tizen3,productinfo:product("UE55MU6172","T-KTMDEUC-1410.1")}).video.includes("mutated"));
console.log("Tizen exact model/firmware capability register and conservative PMS policy: passed");
var fs = require("fs"), vm = require("vm");
var register = require("../../samsung/Vemm/js/model-register");
assert.strictEqual(register.length, 1, "Only the observed retail set may have an observed register entry");
assert.strictEqual(register[0].status, "observed");
assert.strictEqual(register[0].subtitles, "unknown");
var JSDOM = require("jsdom").JSDOM;
function settingsJourney(info, language, expected) {
    var dom = new JSDOM(fs.readFileSync("samsung/Vemm/index.html", "utf8"), { url:"https://synthetic.invalid",runScripts:"outside-only" });
    try {
        var w = dom.window;
        Object.defineProperty(w.navigator,"userAgent",{value:tizen3});
        w.webapis = { productinfo:info };
        w.fetch = function(){assert.fail("Settings must not contact a real server");};
        ["i18n","model-register","capabilities","preferences"].forEach(function(name){w.eval(fs.readFileSync("samsung/Vemm/js/"+name+".js","utf8"));});
        var source=fs.readFileSync("samsung/Vemm/main.js","utf8");
        source=source.slice(0,source.lastIndexOf('    addConnectForm("");'))+
            'preferences.language="'+language+'"; window.VemmI18n.setLanguage(preferences.language); openSettings("Playback"); }());';
        w.eval(source);
        var text = w.document.body.textContent;
        assert(text.includes(expected),"Settings exposes localized capability uncertainty: "+language);
        assert(!text.includes("OTHER2017"),"Settings must not expose raw device identity values");
        assert(!text.includes("private detail"),"Settings must not expose getter exception details");
    } finally { dom.window.close(); }
}
settingsJourney(product("OTHER2017","T-KTMDEUC-1410.1"),"en","From Samsung's published media specifications");
settingsJourney({getModelCode:function(){throw new Error("private detail");}},"en","up to 60 fps");
settingsJourney(product("UE55MU6172","T-KTMDEUC-1410.1"),"en","Confirmed on this TV model: UE55MU6172");
console.log("Tizen browser-loaded register and Settings uncertainty journeys: passed");

function qualityPolicyJourney(mode, expected) {
    var dom = new JSDOM(fs.readFileSync("samsung/Vemm/index.html", "utf8"), {
        url: "https://synthetic.invalid", runScripts: "outside-only"
    });
    try {
        var w = dom.window;
        w.fetch = function () { assert.fail("Opening quality choices must not contact Plex"); };
        ["i18n", "preferences", "playback"].forEach(function (name) {
            w.eval(fs.readFileSync("samsung/Vemm/js/" + name + ".js", "utf8"));
        });
        var source = fs.readFileSync("samsung/Vemm/main.js", "utf8");
        source = source.slice(0, source.lastIndexOf('    addConnectForm("");')) +
            'preferences.directPlay = "' + mode + '";' +
            'playerItem = {ratingKey:"1",type:"movie",Media:[{container:"mp4",videoCodec:"h264",audioCodec:"aac",' +
            'width:1920,height:1040,bitrate:2051,Part:[{id:"1",key:"/library/parts/1/file",Stream:[{streamType:1,codec:"h264"}]}]}]};' +
            'playerSettings = {mediaIndex:0,quality:"original",profile:{evidence:"synthetic-profile",' +
            'video:["h264"],audio:["aac"],containers:["mp4"],maxWidth:1920,maxHeight:1080}};' +
            'player = {quality:function(){return {source:playerItem.Media[0],stream:playerItem.Media[0],mode:"direct"};}};' +
            'openQuality(); }());';
        w.eval(source);
        var original = w.document.querySelector("#player-menu button");
        assert(original && original.textContent === expected,
            "The top choice says what Direct Play " + mode + " asks for: " + (original && original.textContent));
    } finally { dom.window.close(); }
}
// Played directly, the file's own 2.1 Mbps; converted, the 8 Mbps PMS needs to keep 1080p.
qualityPolicyJourney("off", "1080p – 8 Mbps");
qualityPolicyJourney("auto", "1080p – 2.1 Mbps");
console.log("Tizen quality-menu direct-play policy labels: passed");

// The in-player picker is one column under resolution headings, and FHD panels never see 1440p or 4K.
function qualityLayoutJourney(uhdPanel, headings, labels) {
    var dom = new JSDOM(fs.readFileSync("samsung/Vemm/index.html", "utf8"), {
        url: "https://synthetic.invalid", runScripts: "outside-only"
    });
    try {
        var w = dom.window;
        Object.defineProperty(w.navigator, "userAgent", { value: tizen3 });
        w.webapis = { productinfo: Object.assign(product("OTHER2017", "x"), { isUdPanelSupported: function () { return uhdPanel; } }) };
        w.fetch = function () { assert.fail("Opening quality choices must not contact Plex"); };
        ["i18n", "model-register", "capabilities", "preferences", "playback"].forEach(function (name) {
            w.eval(fs.readFileSync("samsung/Vemm/js/" + name + ".js", "utf8"));
        });
        var source = fs.readFileSync("samsung/Vemm/main.js", "utf8");
        source = source.slice(0, source.lastIndexOf('    addConnectForm("");')) +
            'playerItem = {ratingKey:"1",type:"movie",Media:[{container:"mp4",videoCodec:"h264",audioCodec:"aac",' +
            'width:3840,height:2160,Part:[{id:"1",key:"/library/parts/1/file",Stream:[{streamType:1,codec:"h264"}]}]}]};' +
            'playerSettings = {mediaIndex:0,quality:"original",profile:{evidence:"synthetic-profile",' +
            'video:["h264"],audio:["aac"],containers:["mp4"],maxWidth:1920,maxHeight:1080}};' +
            'player = {quality:function(){return {source:playerItem.Media[0],stream:playerItem.Media[0],mode:"direct"};}};' +
            'openQuality(); }());';
        w.eval(source);
        var menu = w.document.getElementById("player-menu");
        assert.deepStrictEqual(Array.from(menu.querySelectorAll(".group-title")).map(function (node) { return node.textContent; }),
            headings, "Resolution headings, Original first");
        assert(!menu.querySelector(".group-title button, .group-title[tabindex]"), "Headings are not focusable");
        var buttons = Array.from(menu.querySelectorAll("button")).map(function (node) { return node.textContent.replace(/^✓ /, ""); });
        assert.deepStrictEqual(buttons.slice(1, 1 + labels.length), labels, "Highest Mbps first within a resolution");
        assert.strictEqual(buttons[0].indexOf("Original quality"), 0);
        assert.strictEqual(menu.querySelector('[aria-pressed="true"]').textContent.indexOf("Original quality") !== -1, true);
        assert.strictEqual(menu.querySelectorAll("button")[0], w.document.activeElement, "Focus starts on the chosen option");
        assert(buttons.indexOf("Close menu") === -1 && buttons.indexOf("Playback options") === -1,
            "Back goes up a level; the menu has no close or return buttons");
    } finally { dom.window.close(); }
}
qualityLayoutJourney(true, ["Original", "4K", "1440p", "1080p", "720p", "480p"], [
    "2160p · 40 Mbps (converts)", "1440p · 25 Mbps (converts)", "1080p · 20 Mbps (converts)",
    "1080p · 16 Mbps (converts)", "1080p · 12 Mbps (converts)", "1080p · 10 Mbps (converts)",
    "1080p · 8 Mbps (converts)", "720p · 4 Mbps (converts)", "720p · 2 Mbps (converts)", "480p · 0.7 Mbps (converts)"]);
qualityLayoutJourney(false, ["Original", "1080p", "720p", "480p"], [
    "1080p · 20 Mbps (converts)", "1080p · 16 Mbps (converts)", "1080p · 12 Mbps (converts)",
    "1080p · 10 Mbps (converts)", "1080p · 8 Mbps (converts)", "720p · 4 Mbps (converts)",
    "720p · 2 Mbps (converts)", "480p · 0.7 Mbps (converts)"]);
// The in-player picker's top choice is the file's own size at what is asked for; it hides presets above
// the file's size or at or above that bitrate, and a saved quality at or above it is the top choice.
function qualitySourceJourney(bitrate, active, expected, top, pressedLabel) {
    var dom = new JSDOM(fs.readFileSync("samsung/Vemm/index.html", "utf8"), {
        url: "https://synthetic.invalid", runScripts: "outside-only"
    });
    try {
        var w = dom.window;
        w.fetch = function () { assert.fail("Opening quality choices must not contact Plex"); };
        ["i18n", "preferences", "playback"].forEach(function (name) {
            w.eval(fs.readFileSync("samsung/Vemm/js/" + name + ".js", "utf8"));
        });
        var source = fs.readFileSync("samsung/Vemm/main.js", "utf8");
        source = source.slice(0, source.lastIndexOf('    addConnectForm("");')) +
            'playerItem = {ratingKey:"1",type:"movie",Media:[{container:"mp4",videoCodec:"h264",audioCodec:"aac",' +
            'width:1920,height:1080,bitrate:' + bitrate + ',Part:[{id:"1",key:"/library/parts/1/file",Stream:[{streamType:1,codec:"h264"}]}]}]};' +
            'playerSettings = {mediaIndex:0,quality:"' + active + '",profile:{evidence:"synthetic-profile",' +
            'video:["h264"],audio:["aac"],containers:["mp4"],maxWidth:1920,maxHeight:1080}};' +
            'player = {quality:function(){return {source:playerItem.Media[0],stream:playerItem.Media[0],mode:"direct"};}};' +
            'openQuality(); }());';
        w.eval(source);
        var buttons = Array.from(w.document.querySelectorAll("#player-menu button"));
        var labels = buttons.map(function (node) { return node.textContent; }).filter(function (text) { return /converts[)]$/.test(text); });
        assert.deepStrictEqual(labels, expected);
        assert.strictEqual(buttons[0].textContent, top, "The top choice names what is asked for (" + bitrate + ")");
        var pressed = w.document.querySelector('#player-menu [aria-pressed="true"]');
        assert.strictEqual(pressed.textContent, pressedLabel || top,
            "A saved quality at or above this file's top is the top choice");
    } finally { dom.window.close(); }
}
var below1080p = ["720p · 4 Mbps (converts)", "720p · 2 Mbps (converts)", "480p · 0.7 Mbps (converts)"];
// An 8.1 Mbps 1080p episode with the saved quality 1080p 20 Mbps.
qualitySourceJourney(8109, "1080h", ["1080p · 8 Mbps (converts)"].concat(below1080p), "1080p – 8.1 Mbps");
qualitySourceJourney(8000, "original", below1080p, "1080p – 8 Mbps");
qualitySourceJourney(8000, "2160", below1080p, "1080p – 8 Mbps");
// A 2.1 Mbps 1080p film that plays directly: nothing at or above its own 2.1 Mbps is offered.
qualitySourceJourney(2051, "720l", ["720p · 2 Mbps (converts)", "480p · 0.7 Mbps (converts)"], "1080p – 2.1 Mbps", "720p · 2 Mbps (converts)");
qualitySourceJourney(0, "original", ["1080p · 20 Mbps (converts)", "1080p · 16 Mbps (converts)", "1080p · 12 Mbps (converts)",
    "1080p · 10 Mbps (converts)", "1080p · 8 Mbps (converts)"].concat(below1080p), "Original quality");
console.log("Tizen quality picker layout and panel gating: passed");
