"use strict";
var assert = require("assert");
var playback = require("../../samsung/Vemm/js/playback.js");
var item = {
    ratingKey: "10", duration: 100000, viewOffset: 5000,
    Media: [{ container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
        Part: [{ id: "20", key: "/library/parts/20/file.mp4", Stream: [{ streamType: 1, codec: "h264" }] }] }]
};
function rig() {
    var calls = [];
    var state = "idle";
    var position = 0;
    var adapter = {
        snapshot: function () { return { state: state, position: position, duration: item.duration }; },
        open: function (url, offset, paused) {
            calls.push(["open", url, offset, paused]);
            position = offset;
            state = paused ? "paused" : "playing";
            return Promise.resolve();
        },
        close: function () { calls.push(["close"]); state = "idle"; },
        pause: function () { state = "paused"; },
        play: function () { state = "playing"; },
        seek: function (target) { position = target; return Promise.resolve(target); }
    };
    var client = {
        selectStreams: function (partId, audioId, subtitleId) {
            calls.push(["streams", partId, audioId, subtitleId]);
            return Promise.resolve();
        },
        request: function (path, method, query) { calls.push(["decision", query]); return Promise.resolve({ generalDecisionCode: 1001 }); },
        streamUrl: function (path) { return "https://synthetic.invalid" + path; },
        timeline: function (media, time, phase, session, queue, tracks) {
            calls.push(["timeline", time, phase, session, tracks]);
            return Promise.resolve();
        },
        stopTranscode: function () { calls.push(["cleanup"]); return Promise.resolve(); },
        getMetadata: function () { calls.push(["readback"]); return Promise.resolve(item); }
    };
    return { calls: calls, adapter: adapter, client: client };
}
async function run() {
    var plan = playback.plan(item, { offset: 5000 });
    assert.strictEqual(plan.direct, false, "Unknown capabilities must not guess direct play");
    assert.strictEqual(plan.query.directPlay, 0);
    assert.strictEqual(plan.query.audioStreamID, undefined,
        "An unset audio stream must be omitted, matching LG's default-track query");
    var badDecision = rig();
    badDecision.client.request = function () {
        var error = new Error("PMS request failed with HTTP 400.");
        error.status = 400;
        return Promise.reject(error);
    };
    var badSession = playback.create({ client: badDecision.client, adapter: badDecision.adapter, item: item });
    await assert.rejects(badSession.start(), /can't be played.*damaged.*analyzed/i,
        "Decision 400 must explain an unavailable file rather than label it a network outage");
    assert(!badDecision.calls.some(function (call) { return call[0] === "open" || call[0] === "timeline"; }));
    await badSession.stop();
    var serverFailure = new Error("PMS request failed with HTTP 500.");
    serverFailure.status = 500;
    var failedDecision = rig();
    failedDecision.client.request = function () { return Promise.reject(serverFailure); };
    var failedSession = playback.create({ client: failedDecision.client, adapter: failedDecision.adapter, item: item });
    await assert.rejects(failedSession.start(), function (error) { return error === serverFailure; },
        "Other status codes must retain their original failure");
    await failedSession.stop();
    var summaryOnly = JSON.parse(JSON.stringify(item));
    summaryOnly.Media[0].Part[0].Stream = [];
    assert.throws(function () { playback.plan(summaryOnly, {}); }, /can't be played/i,
        "Media summary codecs do not establish that its Part has playable streams");
    var unanalysed = { ratingKey: "70", type: "movie", Media: [{
        id: 80, Part: [{ id: 80, key: "/library/parts/80/file.mp4", size: 4000000 }]
    }] };
    for (var directPlay of ["auto", "off", "force"]) {
        var invalidRig = rig();
        assert.throws(function () {
            playback.create({ client: invalidRig.client, adapter: invalidRig.adapter, item: unanalysed,
                settings: { directPlay: directPlay } });
        }, /can't be played.*damaged.*analyzed/i,
        "Media without codec or Stream facts must fail before asking PMS to transcode an unplayable file");
        assert.strictEqual(invalidRig.calls.length, 0, "Invalid source metadata must cause no network/native calls");
    }
    var streamOnly = JSON.parse(JSON.stringify(item));
    delete streamOnly.Media[0].videoCodec;
    streamOnly.Media[0].Part[0].Stream = [{ streamType: 1, codec: "h264" }];
    assert.doesNotThrow(function () { playback.plan(streamOnly, {}); },
        "A server may provide the video codec only in Stream metadata");
    var unanalysedTrack = JSON.parse(JSON.stringify(unanalysed));
    unanalysedTrack.type = "track";
    assert.throws(function () { playback.plan(unanalysedTrack, {}); }, /can't be played/i,
        "Music without audio codec or Stream facts must not negotiate an unplayable file");
    unanalysedTrack.Media[0].Part[0].Stream = [{ streamType: 2, codec: "flac" }];
    var musicPlan = playback.plan(unanalysedTrack, {});
    assert.deepStrictEqual(musicPlan.explanation, {
        selected: "transcode",
        reason: "",
        fallback: "none",
        capability: {
            status: "unknown",
            measured: false,
            source: "No device capability evidence"
        }
    }, "Music conversion must not be mislabeled as capability-supported direct playback");
    assert.strictEqual(plan.query.offset, 5, "A conversion starts at the resume point, in whole seconds");
    assert.strictEqual(playback.plan(item, {}).query.offset, 0, "A start from the beginning converts from 0");
    assert.strictEqual(playback.plan(item, { offset: 509797 }).query.offset, 509);
    assert.strictEqual(playback.plan(item, { profile: {
        evidence: "synthetic-measured-profile", containers: ["mp4"], video: ["h264"], audio: ["aac"],
        maxWidth: 1920, maxHeight: 1080
    } }).direct, true);
    assert.throws(function () { playback.plan({ ratingKey: "10" }); }, /no playable/);
    var multipart = JSON.parse(JSON.stringify(item));
    multipart.Media[0].Part.push({ id: "21", key: "/library/parts/21/file.mp4" });
    var joined = playback.plan(multipart, { profile: {
        evidence: "synthetic-measured-profile", containers: ["mp4"], video: ["h264"], audio: ["aac"],
        maxWidth: 1920, maxHeight: 1080
    } });
    assert.strictEqual(joined.direct, false, "Multiple files require server joining, never direct-play only the first file");
    assert.strictEqual(joined.query.partIndex, -1, "PMS contract: -1 joins all parts into one transcode");
    assert.strictEqual(joined.query.directPlay, 0);
    var multipartRig = rig();
    multipartRig.client.streamUrl = function (path, query) {
        assert.strictEqual(path, "/video/:/transcode/universal/start.m3u8");
        assert.strictEqual(query.partIndex, -1);
        return "https://synthetic.invalid/joined";
    };
    var multipartSession = playback.create({
        client: multipartRig.client, adapter: multipartRig.adapter, item: multipart, settings: { offset: 75000 }
    });
    await multipartSession.start();
    await multipartSession.pause();
    assert(multipartRig.calls.some(function (call) { return call[0] === "timeline" && call[1] === 75000; }),
        "Joined resume/progress must retain the whole-title timeline");
    await multipartSession.stop();
    var test = rig();
    var session = playback.create({ client: test.client, adapter: test.adapter, item: item, settings: { offset: 5000 } });
    assert.strictEqual(test.calls.length, 0, "Browsing/session construction must not mutate progress");
    await session.start();
    await Promise.resolve();
    var initialReport = test.calls.filter(function (call) { return call[0] === "timeline"; })[0];
    assert(initialReport && initialReport[2] === "playing",
        "An ordinary startup must send a playing state in its initial timeline request");
    assert.strictEqual(session.quality().source.width, 1920, "Original source quality must be separate from streaming quality");
    assert.strictEqual(session.quality().stream, null, "A requested transcode limit is not measured output quality");
    assert(!test.calls.some(function (call) { return call[0] === "streams"; }),
        "A default start must not PUT a stream selection: it would overwrite the account's language choice on PMS");
    var pausedReplacement = rig();
    var replacementSession = playback.create({ client: pausedReplacement.client, adapter: pausedReplacement.adapter,
        item: item, settings: { offset: 5000, paused: true, audioId: 31, subtitleId: 0, quality: "720" } });
    await replacementSession.start();
    await Promise.resolve();
    var replacementOpen = pausedReplacement.calls.filter(function (call) { return call[0] === "open"; })[0];
    var replacementTimeline = pausedReplacement.calls.filter(function (call) { return call[0] === "timeline"; })[0];
    assert.strictEqual(replacementOpen[3], true, "A stream replacement must preserve the paused adapter state");
    assert.strictEqual(replacementTimeline[2], "paused",
        "The first PMS timeline request after a paused replacement must remain paused");
    await replacementSession.stop();
    var preferred = JSON.parse(JSON.stringify(item));
    preferred.Media[0].Part[0].Stream = [
        { id: 31, streamType: 2, languageCode: "eng" },
        { id: 32, streamType: 2, languageCode: "fra", selected: true },
        { id: 41, streamType: 3, languageCode: "eng", selected: true }
    ];
    var preferredPlan = playback.plan(preferred, {});
    assert.strictEqual(preferredPlan.query.audioStreamID, 32, "The server-selected audio (account language preference) must be kept");
    assert.strictEqual(preferredPlan.query.subtitleStreamID, 41, "The server-selected subtitle (e.g. forced/foreign) must stay on");
    assert.strictEqual(preferredPlan.query.subtitles, "burn");
    var preferredRig = rig();
    var preferredSession = playback.create({ client: preferredRig.client, adapter: preferredRig.adapter, item: preferred });
    await preferredSession.start();
    assert(!preferredRig.calls.some(function (call) { return call[0] === "streams"; }));
    assert.deepStrictEqual(preferredSession.selection(), { audioId: 32, subtitleId: 41, explicit: false });
    await preferredSession.stop();
    var selectedAudio = JSON.parse(JSON.stringify(item));
    var selectedProfile = {
        evidence: "synthetic-profile", containers: ["mp4"], video: ["h264"], audio: ["aac", "ac3"],
        maxWidth: 1920, maxHeight: 1080
    };
    selectedAudio.Media[0].Part[0].Stream = [
        { id: 31, streamType: 2, codec: "aac" },
        { id: 32, streamType: 2, codec: "truehd", selected: true }
    ];
    var selectedAudioPlan = playback.plan(selectedAudio, { profile: selectedProfile, quality: "original" });
    assert.strictEqual(selectedAudioPlan.direct, false,
        "Direct-play eligibility must inspect the selected audio, not the media's default codec");
    assert.strictEqual(selectedAudioPlan.reason, "audio-codec");
    assert.strictEqual(selectedAudioPlan.query.directStream, 1,
        "An unsupported selected audio track may be converted without re-encoding supported video");
    selectedAudio.Media[0].audioCodec = "truehd";
    selectedAudioPlan = playback.plan(selectedAudio, {
        profile: selectedProfile, quality: "original", audioId: 31, subtitleId: 0
    });
    assert.strictEqual(selectedAudioPlan.direct, true,
        "A supported explicit audio choice must not inherit the default track's codec refusal");
    for (var forcedItem of [preferred, multipart]) {
        var forcedRig = rig();
        var forcedSession = playback.create({
            client: forcedRig.client, adapter: forcedRig.adapter, item: forcedItem,
            settings: { profile: selectedProfile, quality: "original", directPlay: "force" }
        });
        await assert.rejects(forcedSession.start(), /force|forced/i,
            "Force must refuse required subtitle burning or multipart joining instead of silently transcoding");
        assert.strictEqual(forcedRig.calls.length, 0,
            "A refused Force request must not select streams, allocate a transcode or open AVPlay");
    }
    var explicitRig = rig();
    var explicitSession = playback.create({ client: explicitRig.client, adapter: explicitRig.adapter, item: preferred,
        settings: { audioId: 31, subtitleId: 0 } });
    await explicitSession.start();
    assert.deepStrictEqual(explicitRig.calls[0], ["streams", "20", 31, 0],
        "An explicit pick (including Off) must be selected server-side before negotiation");
    assert.strictEqual(explicitRig.calls[1][1].subtitleStreamID, 0);
    assert.strictEqual(explicitRig.calls[1][1].subtitles, "none");
    await explicitSession.stop();
    await session.pause();
    assert(test.calls.some(function (call) { return call[0] === "timeline" && call[1] === 5000 && call[2] === "paused"; }));
    await session.seek(15000);
    await session.stop();
    var negotiated = rig();
    negotiated.client.request = function () {
        return Promise.resolve({ generalDecisionCode: 1001, Metadata: [{ Media: [{
            width: 1280, height: 720, bitrate: 4000, videoCodec: "h264", Part: [{ decision: "transcode" }]
        }] }] });
    };
    var measured = playback.create({ client: negotiated.client, adapter: negotiated.adapter, item: item,
        settings: { quality: "1080" } });
    await measured.start();
    assert.strictEqual(measured.quality().source.height, 1080);
    assert.strictEqual(measured.quality().stream.height, 720, "The PMS decision must not be replaced by the requested limit");
    assert.strictEqual(measured.quality().limit, "1080");
    await measured.stop();
    var stoppedReport = test.calls.filter(function (call) { return call[0] === "timeline" && call[2] === "stopped"; })[0];
    assert(stoppedReport && stoppedReport[1] === 15000);
    assert(stoppedReport[3], "The stopped report carries the decision session");
    assert(stoppedReport[4] && "audioId" in stoppedReport[4], "The stopped report carries the selected streams");
    assert(test.calls.some(function (call) { return call[0] === "cleanup"; }));
    assert(test.calls.some(function (call) { return call[0] === "readback"; }));
    assert.strictEqual(test.adapter.snapshot().state, "idle");
    await assert.rejects(session.start(), /cannot be started/);
    test = rig();
    var decision;
    test.client.request = function () { return new Promise(function (resolve) { decision = resolve; }); };
    session = playback.create({ client: test.client, adapter: test.adapter, item: item });
    var starting = session.start();
    var guard;
    var duplicate = Promise.race([session.start(), new Promise(function (resolve, reject) {
        guard = setTimeout(function () { reject(new Error("Duplicate start remained pending instead of being refused")); }, 25);
    })]);
    try { await assert.rejects(duplicate, /already|cannot/, "A pending start must not negotiate/open twice"); }
    finally { clearTimeout(guard); }
    for (var tick = 0; tick < 10; tick += 1) { await Promise.resolve(); }
    var stopping = session.stop();
    decision({ generalDecisionCode: 1001 });
    await assert.rejects(starting, /cancelled/);
    await stopping;
    assert(!test.calls.some(function (call) { return call[0] === "open" || call[0] === "timeline"; }),
        "Stopping during negotiation must never open AVPlay or report playback");

    test = rig();
    test.client.request = function () { return Promise.resolve({ generalDecisionCode: 2001 }); };
    session = playback.create({ client: test.client, adapter: test.adapter, item: item });
    await assert.rejects(session.start(), /refused playback/);
    assert(!test.calls.some(function (call) { return call[0] === "open" || call[0] === "timeline"; }));
    await session.stop();
    test = rig();
    test.client.selectStreams = function () { return Promise.reject(new Error("PMS refused stream selection")); };
    session = playback.create({ client: test.client, adapter: test.adapter, item: item, settings: { audioId: 0, subtitleId: 0 } });
    await assert.rejects(session.start(), /refused stream selection/);
    assert(!test.calls.some(function (call) { return call[0] === "decision" || call[0] === "open" || call[0] === "timeline"; }),
        "Failed stream selection must not silently play the wrong track");
    await session.stop();
    var profile = { evidence: "synthetic-measured-profile", containers: ["mp4"], video: ["h264"], audio: ["aac"],
        maxWidth: 1920, maxHeight: 1080 };
    var directPlan = playback.plan(item, { profile: profile });
    assert(/add-direct-play-profile\(type=videoProfile&protocol=http&container=mp4&videoCodec=h264&audioCodec=aac\)/
        .test(directPlan.query["X-Plex-Client-Profile-Extra"]), "PMS must be told which files this TV plays as they are");
    assert(!/add-direct-play-profile/.test(plan.query["X-Plex-Client-Profile-Extra"]));
    function directDecision(query) {
        return { generalDecisionCode: 1000, Metadata: [{ Media: [{ width: 1920, height: 1080, videoCodec: "h264",
            Part: [{ decision: query.directPlay ? "directplay" : "transcode" }] }] }] };
    }
    test = rig();
    test.client.request = function (path, method, query) { test.calls.push(["decision", query]); return Promise.resolve(directDecision(query)); };
    session = playback.create({ client: test.client, adapter: test.adapter, item: item, settings: { profile: profile } });
    await session.start();
    assert.strictEqual(session.mode(), "direct");
    assert(test.calls.some(function (call) { return call[0] === "open" && call[1] === "https://synthetic.invalid/library/parts/20/file.mp4"; }));
    await session.stop();
    assert(!test.calls.some(function (call) { return call[0] === "cleanup"; }), "Direct play allocates no transcode session to stop");

    test = rig();
    var events = [];
    test.client.request = function (path, method, query) {
        test.calls.push(["decision", JSON.parse(JSON.stringify(query))]);
        return Promise.resolve(directDecision(query));
    };
    var rejectingOpen = test.adapter.open;
    test.adapter.open = function (url, offset) {
        if (/library\/parts/.test(url)) { test.calls.push(["open", url]); return Promise.reject(new Error("Samsung AVPlay could not prepare.")); }
        return rejectingOpen(url, offset);
    };
    session = playback.create({ client: test.client, adapter: test.adapter, item: item,
        settings: { profile: profile, offset: 5000 }, onEvent: function (event) { events.push(event); } });
    await session.start();
    assert.strictEqual(session.mode(), "transcode", "A file the TV refuses must fall back to a server transcode");
    assert.deepStrictEqual(session.quality().explanation, {
        selected: "transcode",
        reason: "decoder",
        fallback: "none",
        capability: {
            status: "unknown",
            measured: false,
            source: "synthetic-measured-profile"
        }
    }, "The fallback remains explainable after AVPlay rejects the original");
    var decisions = test.calls.filter(function (call) { return call[0] === "decision"; });
    assert.strictEqual(decisions.length, 2);
    assert.strictEqual(decisions[0][1].directPlay, 1);
    assert.strictEqual(decisions[1][1].directPlay, 0);
    var opens = test.calls.filter(function (call) { return call[0] === "open"; });
    assert.strictEqual(opens[opens.length - 1][1], "https://synthetic.invalid/video/:/transcode/universal/start.m3u8");
    assert(events.some(function (event) { return event.type === "direct-fallback"; }));
    assert(events.some(function (event) { return event.type === "source" && event.mode === "transcode"; }));
    await session.stop();
    assert(test.calls.some(function (call) { return call[0] === "cleanup"; }));

    // PMS-shaped decision: a direct ask carrying the HLS transcode caps (1080p / 8 Mbps) or
    // protocol=hls is answered with a transcode, which is what the 2017 UE55MU6172 observed
    // for a 9.9 Mbps 1080p H.264 MKV and a 3840x1600 HEVC MKV (device pass ea0d7c9b).
    function pmsDecision(source) {
        return function (query) {
            var direct = query.directPlay === 1 && query.protocol === "http" &&
                !(query.videoBitrate && query.videoBitrate < source.bitrate) &&
                !(query.maxVideoBitrate && query.maxVideoBitrate < source.bitrate) &&
                !(query.videoResolution && Number(query.videoResolution.split("x")[1]) < source.height) &&
                /add-direct-play-profile\([^)]*audioCodec=[^)&]*\b/.test(query["X-Plex-Client-Profile-Extra"]) &&
                new RegExp("audioCodec=[^)&]*\\b" + source.audioCodec + "\\b").test(
                    (/add-direct-play-profile\(([^)]*)\)/.exec(query["X-Plex-Client-Profile-Extra"]) || [""])[0]);
            return { generalDecisionCode: 1000, Metadata: [{ Media: [{ width: source.width, height: source.height,
                videoCodec: source.videoCodec, Part: [{ decision: direct ? "directplay" : "transcode" }] }] }] };
        };
    }
    var tvProfile = { evidence: "Measured on a 2017 Samsung TV (Tizen 3.0)", containers: ["mkv", "mp4", "mov"],
        video: ["h264", "hevc"], audio: ["aac", "ac3", "eac3", "dts", "mp3"], maxWidth: 3840, maxHeight: 2160 };
    var sources = [
        { ratingKey: "31", container: "mkv", videoCodec: "h264", audioCodec: "ac3", width: 1920, height: 1080, bitrate: 9900 },
        { ratingKey: "32", container: "mkv", videoCodec: "hevc", audioCodec: "eac3", width: 3840, height: 1600, bitrate: 14500 },
        { ratingKey: "33", container: "mkv", videoCodec: "h264", audioCodec: "dca", width: 1920, height: 1080, bitrate: 6000 }
    ];
    for (var s = 0; s < sources.length; s += 1) {
        var source = sources[s];
        var sourceItem = { ratingKey: source.ratingKey, duration: 100000, Media: [{ container: source.container,
            videoCodec: source.videoCodec, audioCodec: source.audioCodec, width: source.width, height: source.height,
            bitrate: source.bitrate, Part: [{ id: "4" + s, key: "/library/parts/4" + s + "/file.mkv",
                Stream: [{ streamType: 1, codec: source.videoCodec }] }] }] };
        test = rig();
        var answer = pmsDecision(source);
        test.client.request = function (path, method, query) {
            test.calls.push(["decision", JSON.parse(JSON.stringify(query))]);
            return Promise.resolve(answer(query));
        };
        session = playback.create({ client: test.client, adapter: test.adapter, item: sourceItem,
            settings: { profile: tvProfile, quality: "original" } });
        await session.start();
        assert.strictEqual(session.mode(), "direct", source.videoCodec + " " + source.width + "x" + source.height +
            " " + source.audioCodec + " at " + source.bitrate + " kbps must direct play, not inherit the transcode cap");
        assert(test.calls.some(function (call) { return call[0] === "open" && /library\/parts\/4/.test(call[1]); }));
        await session.stop();
    }

    // The LG ladder: any rung below Original converts a source above it, by height or bitrate.
    function ladderPlan(media, quality, streams, profile) {
        var item = { ratingKey: "50", Media: [Object.assign({ Part: [{ id: "5", key: "/library/parts/5/file.mkv",
            Stream: streams || [{ streamType: 1, codec: media.videoCodec }] }] }, media)] };
        return playback.plan(item, { profile: profile || documentedProfile, quality: quality || "original" });
    }
    var documentedProfile = { evidence: "Samsung media specifications", containers: ["mkv", "mp4", "mov", "mpegts"],
        videoContainers: { h264: ["mkv", "mp4", "mov", "mpegts"], hevc: ["mkv", "mp4", "mpegts"] },
        audioContainers: { opus: ["mkv"] }, video: ["h264", "hevc"], audio: ["aac", "ac3", "eac3", "mp3", "opus"],
        maxWidth: 3840, maxHeight: 2160, maxFrameRate: 60, maxBitrate: 60000, h264Level1080: 41, hdr: "hdr10" };
    var uhdHevc = { container: "mkv", videoCodec: "hevc", audioCodec: "eac3", width: 3840, height: 1600, bitrate: 14500 };
    assert.strictEqual(ladderPlan(uhdHevc, "original").direct, true, "Original plays the 1600-line HEVC as-is");
    var converted = ladderPlan(uhdHevc, "1080");
    assert.strictEqual(converted.direct, false); assert.strictEqual(converted.reason, "quality");
    assert.strictEqual(converted.query.directStream, 0, "A smaller rung re-encodes the video");
    assert.strictEqual(ladderPlan({ container: "mkv", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
        bitrate: 12000 }, "1080").reason, "quality", "A rung's bitrate cap converts a heavier 1080p file");
    assert.strictEqual(ladderPlan({ container: "mkv", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
        bitrate: 12000 }, "1080h").direct, true, "1080p 20 Mbps keeps a 12 Mbps original");
    var mov = ladderPlan({ container: "mov", videoCodec: "hevc", audioCodec: "aac", width: 1920, height: 1080, bitrate: 5000 });
    assert.strictEqual(mov.reason, "container", "HEVC is never direct from MOV");
    assert.strictEqual(mov.query.directStream, 1, "A container refusal remuxes and keeps the video");
    var opus = ladderPlan({ container: "mp4", videoCodec: "h264", audioCodec: "opus", width: 1920, height: 1080, bitrate: 5000 });
    assert.strictEqual(opus.reason, "audio-container", "Opus in MP4 waits for Tizen 6");
    assert.strictEqual(ladderPlan({ container: "mkv", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
        bitrate: 5000 }, "original", [{ streamType: 1, frameRate: "119.88" }]).reason, "frame-rate", "Nothing above 60 fps is direct");
    assert.strictEqual(ladderPlan({ container: "mkv", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
        bitrate: 5000 }, "original", [{ streamType: 1, frameRate: "59.94" }]).direct, true, "59.94 fps plays direct");
    assert.strictEqual(ladderPlan({ container: "mkv", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
        bitrate: 5000 }, "original", [{ streamType: 1, level: 51 }]).reason, "level", "H.264 level 5.1 at 1080p exceeds a 2017 set");
    var dv = { container: "mkv", videoCodec: "hevc", audioCodec: "eac3", width: 3840, height: 2160, bitrate: 30000,
        videoDynamicRange: "Dolby Vision" };
    assert.strictEqual(ladderPlan(dv, "original", [{ streamType: 1, DOVIPresent: true, DOVIProfile: 5 }]).reason,
        "dolby-vision", "DV profile 5 has no base layer");
    assert.strictEqual(ladderPlan(dv, "original", [{ streamType: 1, DOVIPresent: true, DOVIProfile: 8,
        DOVIBLCompatID: 1 }]).direct, true, "DV profile 8.1 plays its HDR10 base layer");
    var forced = playback.plan({ ratingKey: "51", Media: [Object.assign({ Part: [{ id: "6", key: "/library/parts/6/f.mkv",
        Stream: [{ streamType: 1, codec: "hevc" }] }] }, uhdHevc)] }, { profile: documentedProfile, quality: "720", directPlay: "force" });
    assert.strictEqual(forced.direct, true, "Force always sends the original");
    assert.strictEqual(forced.force, true);
    var off = playback.plan({ ratingKey: "52", Media: [Object.assign({ Part: [{ id: "7", key: "/library/parts/7/f.mkv",
        Stream: [{ streamType: 1, codec: "hevc" }] }] }, uhdHevc)] }, { profile: documentedProfile, quality: "original", directPlay: "off" });
    assert.strictEqual(off.direct, false, "Direct play Off always converts");
    assert.strictEqual(playback.streamMode(false, { Part: [{ Stream: [{ streamType: 1, decision: "copy" }] }] }), "directstream");
    assert.strictEqual(playback.streamMode(false, { Part: [{ Stream: [{ streamType: 1, decision: "transcode" }] }] }), "transcode");

    // When PMS still answers transcode, the HLS start must carry the transcode caps again.
    test = rig();
    var hlsQueries = [];
    test.client.request = function (path, method, query) {
        hlsQueries.push(JSON.parse(JSON.stringify(query)));
        return Promise.resolve({ generalDecisionCode: 1000, Metadata: [{ Media: [{ Part: [{ decision: "transcode" }] }] }] });
    };
    test.client.streamUrl = function (path, query) { test.calls.push(["url", path, JSON.parse(JSON.stringify(query))]); return "https://synthetic.invalid" + path; };
    session = playback.create({ client: test.client, adapter: test.adapter, item: item, settings: { profile: profile } });
    await session.start();
    assert.strictEqual(session.mode(), "transcode");
    var started = test.calls.filter(function (call) { return call[0] === "url"; }).pop();
    assert.strictEqual(started[2].protocol, "hls");
    assert.strictEqual(started[2].directPlay, 0);
    assert.strictEqual(started[2].videoBitrate, 8000, "A transcode keeps its quality cap");
    assert.strictEqual(started[2].audioStreamID, undefined, "The HLS start also omits unset audio IDs");
    assert(hlsQueries.every(function (query) { return query.audioStreamID === undefined; }),
        "Both the direct ask and fallback conversion must retain default-track omission");
    assert.strictEqual(hlsQueries[hlsQueries.length - 1].directPlay, 0, "The transcode is registered by its own decision");
    await session.stop();

    // The extended ladder: 4K, 1440p and three more 1080p bitrates.
    [["2160", 3840, 2160, 40000], ["1440", 2560, 1440, 25000], ["1080_16", 1920, 1080, 16000],
        ["1080_12", 1920, 1080, 12000], ["1080_10", 1920, 1080, 10000]].forEach(function (row) {
        var rung = playback.rungFor(row[0]);
        assert.deepStrictEqual([rung.width, rung.height, rung.bitrate], [row[1], row[2], row[3]], row[0] + " rung");
        assert(playback.qualities.indexOf(row[0]) !== -1, row[0] + " is a ladder quality");
    });
    var heavy1080 = { container: "mkv", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080, bitrate: 14000 };
    assert.strictEqual(ladderPlan(heavy1080, "1080_16").direct, true, "14 Mbps fits the 16 Mbps cap");
    assert.strictEqual(ladderPlan(heavy1080, "1080_12").reason, "quality", "14 Mbps exceeds the 12 Mbps cap");
    var capped = ladderPlan(heavy1080, "1080_10");
    assert.strictEqual(capped.query.videoBitrate, 10000);
    assert.strictEqual(capped.query.videoResolution, "1920x1080");
    var uhdH264 = { container: "mkv", videoCodec: "h264", audioCodec: "aac", width: 3840, height: 2160, bitrate: 35000 };
    assert.strictEqual(ladderPlan(uhdH264, "2160").direct, true, "A 35 Mbps 4K source fits the 4K cap");
    var to1440 = ladderPlan(uhdH264, "1440");
    assert.strictEqual(to1440.reason, "quality");
    assert.strictEqual(to1440.query.videoResolution, "2560x1440");
    assert.strictEqual(to1440.query.videoBitrate, 25000);

    // Recommendation: the highest capped rung at or under 80% of the measured speed.
    assert.strictEqual(playback.recommend(20), "1080_16");
    assert.strictEqual(playback.recommend(10), "1080");
    assert.strictEqual(playback.recommend(3), "720l");
    assert.strictEqual(playback.recommend(0.5), "480", "A very slow link still gets the lowest rung");
    assert.strictEqual(playback.recommend(31.25), "1440");
    assert.strictEqual(playback.recommend(49.9), "1440", "4K needs 50 Mbps, which is already Original territory");
    assert.strictEqual(playback.recommend(50), "original", "1.25x the top option is Original");
    assert.strictEqual(playback.recommend(24, 1080), "1080_16", "FHD panels never get 1440p or 4K");
    assert.strictEqual(playback.recommend(25, 1080), "original", "The FHD top option is 20 Mbps");

    // Throughput measurement with a fake XHR and clock.
    function speedRig() {
        var rig = { now: 0, timers: [], requests: [] };
        rig.options = function (extra) {
            var options = { url: "https://pms.synthetic.invalid/library/parts/1/file.mkv?X-Plex-Token=synthetic-secret",
                now: function () { return rig.now; },
                setTimeout: function (callback, delay) { rig.timers.push({ callback: callback, delay: delay }); return rig.timers.length; },
                clearTimeout: function (id) { rig.timers[id - 1].cleared = true; },
                createRequest: function () {
                    var xhr = { headers: {}, aborted: false, status: 200, readyState: 0,
                        open: function (method, url) { this.method = method; this.url = url; },
                        setRequestHeader: function (name, value) { this.headers[name] = value; },
                        send: function () { this.sent = true; },
                        abort: function () { this.aborted = true; } };
                    rig.requests.push(xhr);
                    return xhr;
                } };
            Object.keys(extra || {}).forEach(function (name) { options[name] = extra[name]; });
            return options;
        };
        rig.progress = function (at, loaded) {
            rig.now = at;
            var xhr = rig.requests[0];
            if (xhr.readyState < 2) { xhr.readyState = 2; xhr.onreadystatechange(); }
            xhr.onprogress({ loaded: loaded });
        };
        return rig;
    }
    var speed = speedRig();
    var measured1 = playback.measureSpeed(speed.options());
    var xhr1 = speed.requests[0];
    assert.strictEqual(xhr1.method, "GET");
    assert.strictEqual(xhr1.headers.Range, "bytes=0-33554431");
    assert.strictEqual(xhr1.responseType, "arraybuffer", "Binary download: no text decoding on the TV");
    assert.strictEqual(speed.timers[0].delay, 8000, "The test lasts about eight seconds");
    speed.progress(500, 1000000);
    speed.progress(1000, 2000000);
    speed.progress(5000, 22000000);
    speed.progress(8000, 52000000);
    speed.timers[0].callback();
    var result1 = await measured1;
    assert(xhr1.aborted, "The download is aborted at the end");
    assert(Math.abs(result1.mbps - 50 * 8 / 7) < 0.001, "The first second of ramp-up is excluded: " + result1.mbps);
    assert.strictEqual(result1.bytes, 52000000);

    speed = speedRig();
    var measured2 = playback.measureSpeed(speed.options());
    speed.progress(1000, 5000000);
    speed.progress(3000, 33554432);
    var result2 = await measured2;
    assert(speed.requests[0].aborted && speed.timers[0].cleared, "32 MB ends the test early and stops the timer");
    assert(Math.abs(result2.mbps - (33554432 - 5000000) * 8 / 2 / 1e6) < 0.001);

    speed = speedRig();
    var measured3 = playback.measureSpeed(speed.options());
    speed.progress(500, 40000000);
    speed.timers[0].callback();
    var result3 = await measured3;
    assert(Math.abs(result3.mbps - 40000000 * 8 / 0.5 / 1e6) < 0.001, "A fast link that ends before ramp-up is counted whole");

    speed = speedRig();
    var failed = playback.measureSpeed(speed.options());
    speed.requests[0].onerror();
    var networkError = await failed.then(function () { return null; }, function (error) { return error; });
    assert(networkError && networkError.code === "network", "A network failure is reported");
    assert(!/synthetic-secret/.test(networkError.message), "Errors never carry the token");

    speed = speedRig();
    failed = playback.measureSpeed(speed.options());
    speed.requests[0].status = 403;
    speed.requests[0].readyState = 2;
    speed.requests[0].onreadystatechange();
    networkError = await failed.then(function () { return null; }, function (error) { return error; });
    assert(networkError && networkError.code === "http" && networkError.status === 403 && /403/.test(networkError.message),
        "A refused download names the HTTP status");
    assert(speed.requests[0].aborted);

    speed = speedRig();
    failed = playback.measureSpeed(speed.options());
    speed.timers[0].callback();
    networkError = await failed.then(function () { return null; }, function (error) { return error; });
    assert(networkError && networkError.code === "no-data", "No data at all within the window is a failure");

    speed = speedRig();
    failed = playback.measureSpeed(speed.options());
    speed.requests[0].ontimeout();
    networkError = await failed.then(function () { return null; }, function (error) { return error; });
    assert(networkError && networkError.code === "timeout", "A request timeout is reported as one");

    // Live progress: Mbps so far, bytes and elapsed seconds; cancel() rejects and aborts the download.
    var readings = [];
    speed = speedRig();
    var watched = playback.measureSpeed(speed.options({ onProgress: function (mbps, bytes, seconds) {
        readings.push([mbps, bytes, seconds]);
    } }));
    speed.progress(500, 1000000);
    speed.progress(1000, 2000000);
    speed.progress(3000, 7000000);
    assert.strictEqual(readings.length, 3);
    assert(Math.abs(readings[0][0] - 16) < 0.001 && readings[0][1] === 1000000 && readings[0][2] === 0.5, JSON.stringify(readings[0]));
    assert(Math.abs(readings[2][0] - 20) < 0.001 && readings[2][1] === 7000000 && readings[2][2] === 3, JSON.stringify(readings[2]));
    assert.strictEqual(typeof watched.cancel, "function", "The measurement can be cancelled");
    watched.cancel();
    var cancelled = await watched.then(function () { return null; }, function (error) { return error; });
    assert(cancelled && cancelled.code === "cancelled" && speed.requests[0].aborted && speed.timers[0].cleared);

    // Recent speeds: the last five numbers per server, averaged; options above 80% of it get a warning.
    var store = { data: {}, getItem: function (key) { return key in this.data ? this.data[key] : null; },
        setItem: function (key, value) { this.data[key] = value; } };
    assert.strictEqual(playback.recentSpeed(store, "a"), null, "No results, no recent speed");
    assert.strictEqual(playback.warns(40000, null), false, "No results, no warnings");
    [10, 20, 30, 40, 50, 60, 70].forEach(function (mbps) { playback.recordSpeed(store, "a", mbps); });
    playback.recordSpeed(store, "b", 12);
    playback.recordSpeed(store, "a", NaN);
    playback.recordSpeed(store, "", 5);
    assert.deepStrictEqual(JSON.parse(store.data["vemm-tizen-speeds"]), { a: [30, 40, 50, 60, 70], b: [12] },
        "Only the last five numbers per server are kept, nothing else");
    assert.deepStrictEqual(playback.recentSpeed(store, "a"), { mbps: 50, count: 5 }, "The average of the kept results");
    assert.deepStrictEqual(playback.recentSpeed(store, "b"), { mbps: 12, count: 1 });
    assert.strictEqual(playback.recentSpeed(store, "c"), null);
    store.data["vemm-tizen-speeds"] = "not json";
    assert.strictEqual(playback.recentSpeed(store, "a"), null, "Damaged storage is ignored");
    var twelve = { mbps: 12, count: 1 };
    assert.strictEqual(playback.warns(9600, twelve), false, "Exactly 80% of the average is fine, as in recommend()");
    assert.strictEqual(playback.warns(10000, twelve), true, "Above 80% of the average warns");
    assert.strictEqual(playback.recommend(12), "1080", "The recommendation is the highest option without a warning");

    // Choosing a file: the first movie or episode of any library, then the authenticated part URL.
    function sampleClient(sections, items, metadata) {
        var asked = [];
        return { asked: asked,
            getSections: function () { return Promise.resolve(sections); },
            getSectionItems: function (key, start, size, filters) {
                asked.push([key, start, size, filters]);
                return Promise.resolve({ items: items[key] || [], totalSize: (items[key] || []).length, offset: 0 });
            },
            getMetadata: function (id) { return Promise.resolve(metadata[id]); },
            streamUrl: function (path) { return "https://pms.synthetic.invalid" + path + "?X-Plex-Token=synthetic-secret"; } };
    }
    var sampled = sampleClient([{ key: "1", type: "artist" }, { key: "2", type: "show" }, { key: "3", type: "movie" }],
        { "2": [{ ratingKey: "70" }], "3": [{ ratingKey: "80" }] },
        { "70": { Media: [{ Part: [{ key: "/library/parts/7/file.mkv" }] }] }, "80": { Media: [{ Part: [{ key: "/library/parts/8/file.mkv" }] }] } });
    var sampleUrl = await playback.sampleUrl(sampled);
    assert(sampleUrl.indexOf("/library/parts/7/file.mkv?X-Plex-Token=") !== -1, "Music libraries are skipped; the first show gives an episode");
    assert.deepStrictEqual(sampled.asked[0], ["2", 0, 1, { type: 4 }], "Show libraries ask for episodes");
    var empty = sampleClient([{ key: "1", type: "movie" }], { "1": [] }, {});
    var noMedia = await playback.sampleUrl(empty).then(function () { return null; }, function (error) { return error; });
    assert(noMedia && noMedia.code === "no-media", "A server with nothing playable is reported");
    var unplayable = sampleClient([{ key: "1", type: "movie" }], { "1": [{ ratingKey: "9" }] }, { "9": { Media: [] } });
    noMedia = await playback.sampleUrl(unplayable).then(function () { return null; }, function (error) { return error; });
    assert(noMedia && noMedia.code === "no-media", "An item without a media part is skipped");

    // Buffering: the viewer's minimum buffer for start and seeks; the amount after a stall follows the headroom.
    assert.deepStrictEqual(playback.buffering(1, 20, 7167), { play: 1, resume: 1 }, "2.8x headroom resumes after 1 s");
    assert.deepStrictEqual(playback.buffering(1, 20, 16100), { play: 1, resume: 3 }, "1.24x headroom waits a little longer after a stall");
    assert.deepStrictEqual(playback.buffering(1, 20, 18000), { play: 1, resume: 5 }, "1.1x headroom longer still");
    assert.deepStrictEqual(playback.buffering(1, 12, 16100), { play: 1, resume: 10 }, "A link slower than the stream waits longest");
    assert.deepStrictEqual(playback.buffering(1, undefined, 8000), { play: 1, resume: 3 }, "No speed test yet: a middle value");
    assert.deepStrictEqual(playback.buffering(undefined, 20, 7167), { play: 1, resume: 1 }, "Without a choice the minimum is 1 s");
    assert.deepStrictEqual(playback.buffering(8, 100, 1000), { play: 8, resume: 8 }, "A stall never waits less than the start");
    assert.deepStrictEqual(playback.buffering(0.5, 20, 8109), { play: 0.5, resume: 1, playBytes: 506813 },
        "Under a second goes in bytes: 0.5 s of an 8.1 Mbps stream");
    assert.deepStrictEqual(playback.buffering(0.5, 20, 2051), { play: 0.5, resume: 1, playBytes: 393216 },
        "Never under 384 KB: AVPlay creeps toward a smaller byte target (0.5 s of a 2 Mbps film started 1 s later)");
    assert.deepStrictEqual(playback.buffering(0.5, 20, 0), { play: 0.5, resume: 3, playBytes: 0 },
        "Without a bitrate there is no byte size; the adapter falls back to 1 s");
    var opened = [];
    function bufferRig(decided) {
        var bufferTest = rig();
        bufferTest.client.request = function () { return Promise.resolve(decided); };
        bufferTest.adapter.open = function (url, offset, paused, buffer) { opened.push(buffer); return Promise.resolve(); };
        return bufferTest;
    }
    var transcoded = { generalDecisionCode: 1001, Metadata: [{ Media: [{ bitrate: 16100, Part: [{ decision: "transcode" }] }] }] };
    var buffered = bufferRig(transcoded);
    session = playback.create({ client: buffered.client, adapter: buffered.adapter, item: item,
        settings: { minBuffer: 1, mbps: 20, quality: "1080h" } });
    await session.start();
    assert.deepStrictEqual(opened.pop(), { play: 1, resume: 3 }, "The resume amount uses the bitrate PMS reports for the conversion");
    assert.deepStrictEqual(session.buffer(), { play: 1, resume: 3 }, "The buffer in use is readable for the stats");
    await session.stop();
    buffered = bufferRig({ generalDecisionCode: 1001, Metadata: [{ Media: [{ Part: [{ decision: "transcode" }] }] }] });
    session = playback.create({ client: buffered.client, adapter: buffered.adapter, item: item,
        settings: { minBuffer: 0.5, mbps: 10, quality: "720" } });
    await session.start();
    assert.deepStrictEqual(opened.pop(), { play: 0.5, resume: 1, playBytes: 393216 },
        "Without a reported bitrate the quality cap (4 Mbps) sizes the headroom; its 0.5 s (250 KB) is raised to the floor");
    await session.stop();
    buffered = bufferRig(transcoded);
    session = playback.create({ client: buffered.client, adapter: buffered.adapter, item: item, settings: { minBuffer: 15, mbps: 90 } });
    await session.start();
    assert.deepStrictEqual(opened.pop(), { play: 15, resume: 15 });
    await session.stop();

    // The top quality of a file: its own bitrate, raised to the size's minimum where PMS would shrink it.
    assert.strictEqual(playback.ceiling({ bitrate: 8109, height: 1080 }), 8109);
    assert.strictEqual(playback.ceiling({ bitrate: 2051, height: 1040 }), 8000);
    assert.strictEqual(playback.ceiling({ bitrate: 1650, height: 480 }), 2000);
    assert.strictEqual(playback.ceiling({ height: 1080 }), Infinity, "An unknown bitrate has no ceiling");

    // Never ask PMS for more than the file needs (Direct play Off re-encodes everything).
    function capFor(media, quality, streams) {
        var file = { ratingKey: "30", type: "episode", Media: [Object.assign({ container: "mkv", videoCodec: "h264", audioCodec: "aac",
            width: 1920, height: 1080, Part: [{ id: 3, key: "/library/parts/3/file.mkv",
                Stream: streams || [{ id: 1, streamType: 1, codec: media.videoCodec || "h264" }] }] }, media)] };
        return playback.plan(file, { quality: quality || "1080h", directPlay: "off" }).query;
    }
    assert.strictEqual(capFor({ bitrate: 8109 }).videoBitrate, 8109, "An 8.1 Mbps episode is converted at 8.1 Mbps, not up to 20");
    assert.strictEqual(capFor({ videoCodec: "hevc", bitrate: 7167, height: 800 }).videoBitrate, 8000,
        "A 7.2 Mbps HEVC film gets PMS's 1080p minimum, not the 20 Mbps rung");
    assert.strictEqual(capFor({ bitrate: 2051, height: 1040 }).videoBitrate, 8000,
        "A low-bitrate 1080p film keeps PMS's 1080p minimum instead of being shrunk to 390p");
    assert.strictEqual(capFor({ bitrate: 2400, width: 1280, height: 720 }).videoBitrate, 4000, "720p has a smaller minimum");
    assert.strictEqual(capFor({ bitrate: 1650, width: 634, height: 480 }).videoBitrate, 2000, "and SD a smaller one");
    assert.strictEqual(capFor({ bitrate: 30000 }).videoBitrate, 20000, "A source above the chosen quality is capped by the quality");
    assert.strictEqual(capFor({ bitrate: 9000 }, "720").videoBitrate, 4000, "A lower quality still caps a conversion");
    assert.strictEqual(capFor({}).videoBitrate, 20000, "Without a known source bitrate the quality cap applies");
    var remuxed = playback.plan({ ratingKey: "31", Media: [{ container: "mkv", videoCodec: "h264", audioCodec: "dca", width: 1920,
        height: 1080, bitrate: 9000, Part: [{ id: 4, key: "/library/parts/4/f.mkv", Stream: [{ streamType: 1, codec: "h264" }] }] }] },
        { quality: "1080h", profile: documentedProfile });
    assert.strictEqual(remuxed.reason, "audio-codec");
    assert.strictEqual(remuxed.query.directStream, 1);
    assert.strictEqual(remuxed.query.videoBitrate, 18000, "A Direct Stream keeps room for PMS to copy (it refused at 1.4x)");

    // The stopped timeline already ends the server's transcode, so its stop then answers 404.
    var cleanupEvents = [];
    test = rig();
    test.client.stopTranscode = function () {
        var gone = new Error("PMS request failed with HTTP 404.");
        gone.status = 404;
        return Promise.reject(gone);
    };
    session = playback.create({ client: test.client, adapter: test.adapter, item: item,
        onEvent: function (event) { cleanupEvents.push(event.type); } });
    await session.start();
    await session.stop();
    assert(cleanupEvents.indexOf("cleanup-error") === -1, "A transcode that is already gone is not a cleanup error");
    test.client.stopTranscode = function () { return Promise.reject(new Error("PMS request failed with HTTP 500.")); };
    session = playback.create({ client: test.client, adapter: test.adapter, item: item,
        onEvent: function (event) { cleanupEvents.push(event.type); } });
    await session.start();
    await session.stop();
    assert(cleanupEvents.indexOf("cleanup-error") !== -1, "Other cleanup failures are still reported");

    // A background start: decision and a held prepare at the offset, nothing written to Plex until start().
    function holdRig() {
        var held = rig();
        held.adapter.open = function (url, offset, paused, buffer, mode) {
            held.calls.push(["open", url, offset, paused, mode]);
            return held.openResult ? held.openResult(mode) : Promise.resolve();
        };
        held.adapter.play = function () { held.calls.push(["play"]); };
        held.client.request = function (path, method, query) {
            held.calls.push(["decision", JSON.parse(JSON.stringify(query))]);
            return Promise.resolve({ generalDecisionCode: 1001 });
        };
        held.kinds = function () { return held.calls.map(function (call) { return call[0]; }); };
        return held;
    }
    test = holdRig();
    session = playback.create({ client: test.client, adapter: test.adapter, item: item, settings: { offset: 5000 } });
    await session.prepare();
    assert.deepStrictEqual(test.kinds(), ["decision", "open"], "Preparing asks PMS and opens AVPlay, nothing more");
    assert.deepStrictEqual(test.calls[1][4], { prebuffer: true, hold: true }, "Held, and prepared at the resume point");
    assert.strictEqual(test.calls[0][1].offset, 5, "The conversion starts at the resume point");
    await session.start();
    assert.deepStrictEqual(test.kinds().slice(2, 4), ["play", "timeline"], "Start only plays it, then reports");
    assert.strictEqual(test.kinds().filter(function (kind) { return kind === "decision"; }).length, 1, "No second decision");
    await session.stop();
    test = holdRig();
    session = playback.create({ client: test.client, adapter: test.adapter, item: item, settings: { offset: 5000 } });
    await session.prepare();
    var discarded = await session.stop();
    assert.deepStrictEqual(test.kinds(), ["decision", "open", "close", "cleanup"],
        "A discarded background start ends its conversion and writes or reads back nothing");
    assert.strictEqual(discarded, undefined);
    for (var refused of [{ audioId: 31, subtitleId: 0 }, { paused: true }]) {
        test = holdRig();
        session = playback.create({ client: test.client, adapter: test.adapter, item: item, settings: Object.assign({ offset: 5000 }, refused) });
        await assert.rejects(session.prepare(), /default start/);
        assert.deepStrictEqual(test.calls, [], "Only a default start is prepared: no stream selection in the background");
        await session.start();
        assert.strictEqual(test.kinds().filter(function (kind) { return kind === "decision"; }).length, 1, "Start then opens it the ordinary way");
        await session.stop();
    }
    test = holdRig();
    test.openResult = function (mode) {
        return mode.hold ? Promise.reject(new Error("Samsung playback failed during prepare. Stop and retry this title.")) : Promise.resolve();
    };
    session = playback.create({ client: test.client, adapter: test.adapter, item: item, settings: { offset: 5000 } });
    await assert.rejects(session.prepare(), /prepare/);
    await session.start();
    assert.deepStrictEqual(test.calls.filter(function (call) { return call[0] === "open"; }).map(function (call) { return call[4].hold; }),
        [true, false], "A failed background start falls back to the ordinary start");
    await session.stop();
    test = holdRig();
    test.openResult = function (mode) {
        if (!mode.prebuffer) { return Promise.resolve(); }
        var refusedMode = new Error("Samsung playback failed during prebuffer. Stop and retry this title.");
        refusedMode.code = "avplay-prebuffer";
        return Promise.reject(refusedMode);
    };
    session = playback.create({ client: test.client, adapter: test.adapter, item: item, settings: { offset: 5000 } });
    await session.start();
    var asked = test.calls.filter(function (call) { return call[0] === "decision"; }).map(function (call) { return call[1].offset; });
    assert.deepStrictEqual(asked, [5, 0], "A TV that cannot prepare at the offset converts from the start instead");
    assert.deepStrictEqual(test.calls.filter(function (call) { return call[0] === "open"; }).map(function (call) { return [call[2], call[4].prebuffer]; }),
        [[5000, true], [5000, false]], "and still resumes at the offset with a READY seek");
    await session.stop();

    // A seek outside what PMS reports as converted reopens the conversion at the target (same session, no new
    // decision); a seek inside it, or without an answer, is an ordinary AVPlay seek.
    test = holdRig();
    var converting = { minOffsetAvailable: 5, maxOffsetAvailable: 60 };
    test.client.request = function (path, method, query) {
        if (/^\/transcode\/sessions\/tizen-/.test(path)) {
            test.calls.push(["progress"]);
            return converting ? Promise.resolve({ TranscodeSession: [converting] }) : Promise.reject(new Error("PMS request failed with HTTP 401."));
        }
        test.calls.push(["decision", JSON.parse(JSON.stringify(query))]);
        return Promise.resolve({ generalDecisionCode: 1001 });
    };
    test.client.streamUrl = function (path, query) { return "https://synthetic.invalid" + path + "?offset=" + query.offset; };
    test.adapter.seek = function (target) { test.calls.push(["seek", target]); return Promise.resolve(target); };
    var reopenState = "playing";
    test.adapter.snapshot = function () { return { state: reopenState, position: 0, duration: item.duration }; };
    session = playback.create({ client: test.client, adapter: test.adapter, item: item, settings: { offset: 5000 } });
    await session.start();
    reopenState = "paused";
    await session.seek(200000);
    assert.deepStrictEqual(test.calls.filter(function (call) { return call[0] === "seek" || call[0] === "progress"; }), [["seek", 200000]],
        "Paused, even a far seek is an AVPlay seek (the TV refuses a pause right after play)");
    test.calls.length = 0;
    reopenState = "playing";
    await session.seek(30000);
    await session.seek(64000);
    assert.deepStrictEqual(test.calls.filter(function (call) { return call[0] === "seek"; }).map(function (call) { return call[1]; }),
        [30000, 64000], "Seeks inside the converted range (5-60 s, a few seconds past its end) stay AVPlay seeks");
    await session.seek(150000);
    await session.seek(2000);
    var reopened = test.calls.filter(function (call) { return call[0] === "open"; });
    assert.deepStrictEqual(reopened.map(function (call) { return [call[1], call[2], call[4].prebuffer]; }), [
        ["https://synthetic.invalid/video/:/transcode/universal/start.m3u8?offset=150", 150000, true],
        ["https://synthetic.invalid/video/:/transcode/universal/start.m3u8?offset=2", 2000, true]
    ], "Past its end or before its start, the conversion reopens at the target");
    assert.strictEqual(test.kinds().filter(function (kind) { return kind === "decision"; }).length, 0, "without a new decision");
    converting = null;
    await session.seek(300000);
    assert.deepStrictEqual(test.calls.filter(function (call) { return call[0] === "seek" || call[0] === "open"; }).pop(), ["seek", 300000],
        "No answer from PMS: an ordinary seek");
    await session.stop();
    test = rig();
    test.client.request = function (path, method, query) {
        test.calls.push([/transcode\/sessions/.test(path) ? "progress" : "decision"]);
        return Promise.resolve(directDecision(query));
    };
    session = playback.create({ client: test.client, adapter: test.adapter, item: item, settings: { profile: profile } });
    await session.start();
    await session.seek(90000);
    assert(!test.calls.some(function (call) { return call[0] === "progress"; }), "Direct play has no conversion to ask about");
    await session.stop();

    // While the server cannot be reached the progress reports fail every 10 s; the viewer hears of it once, and
    // again only after a report has got through in between.
    var outage = rig();
    var failing = true;
    var heard = [];
    outage.client.timeline = function (media, time, phase) {
        outage.calls.push(["timeline", time, phase]);
        return failing ? Promise.reject(new Error("network")) : Promise.resolve();
    };
    var outageSession = playback.create({ client: outage.client, adapter: outage.adapter, item: item,
        onEvent: function (event) { if (/^progress-/.test(event.type)) { heard.push(event.type); } } });
    await outageSession.start();
    await outageSession.pause();
    await outageSession.play();
    await outageSession.pause();
    assert.deepStrictEqual(heard, ["progress-error"], "Failed reports in a row are one notice, not one each");
    failing = false;
    await outageSession.play();
    assert.deepStrictEqual(heard, ["progress-error", "progress-restored"], "A report that gets through says so");
    await outageSession.pause();
    assert.strictEqual(heard.length, 2, "and says it once");
    failing = true;
    await outageSession.play();
    assert.deepStrictEqual(heard.slice(2), ["progress-error"], "A later outage is a new notice");
    await outageSession.stop().catch(function () { /* the read-back may fail too */ });

    console.log("Tizen playback negotiation/progress/read-back tests: passed");
}
run().catch(function (error) { console.error(error); process.exit(1); });
