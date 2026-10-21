(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmPlayback = api; }
}(this, function () {
    "use strict";

    function trackId(value) {
        return /^[0-9]+$/.test(String(value)) ? Number(value) : 0;
    }

    function unplayableFile() {
        return new Error("This file can't be played. It may be damaged or not analyzed on the Plex server.");
    }

    // Unset audio/subtitle ids follow PMS `Stream.selected`, which already applies the account's
    // language preferences and any earlier pick. Only an explicit choice (Off included) is
    // written back with PUT /library/parts, matching the LG client.
    function resolveTracks(part, options) {
        var explicit = options.audioId !== undefined || options.subtitleId !== undefined;
        if (explicit) {
            return { audioId: trackId(options.audioId), subtitleId: trackId(options.subtitleId), explicit: true };
        }
        var audioId = 0;
        var subtitleId = 0;
        (part.Stream || []).forEach(function (stream) {
            if (!stream.selected) { return; }
            if (Number(stream.streamType) === 2 && !audioId) { audioId = trackId(stream.id); }
            if (Number(stream.streamType) === 3 && !subtitleId) { subtitleId = trackId(stream.id); }
        });
        return { audioId: audioId, subtitleId: subtitleId, explicit: false };
    }

    // Plex names DTS core "dca"; the capability profile uses the codec's common name.
    function plexAudio(codec) { return codec === "dca" ? "dts" : codec; }

    // The direct-play ask mirrors LG's MDE request (plex/src/plex/transcoder.rs mde_decision):
    // protocol=http and NO transcode caps. A 1080p / 8 Mbps cap or protocol=hls makes PMS answer
    // "transcode" for any file above the cap, which the 2017 test TV observed for every source.
    function directQuery(query) {
        var ask = {};
        Object.keys(query).forEach(function (key) { ask[key] = query[key]; });
        ask.protocol = "http";
        ask.directPlay = 1;
        delete ask.videoResolution;
        delete ask.videoBitrate;
        delete ask.videoQuality;
        delete ask.videoCodec;
        delete ask.audioCodec;
        return ask;
    }

    // The LG client's quality ladder (rust-modules/media/src/route/plan.rs QUALITY_LADDER):
    // Original keeps the source; every other rung caps resolution and bitrate for a conversion.
    var LADDER = {
        original: { height: Infinity, width: 1920, heightAsk: 1080, bitrate: 20000 },
        "2160": { height: 2160, width: 3840, bitrate: 40000 },
        "1440": { height: 1440, width: 2560, bitrate: 25000 },
        "1080h": { height: 1080, width: 1920, bitrate: 20000 },
        "1080_16": { height: 1080, width: 1920, bitrate: 16000 },
        "1080_12": { height: 1080, width: 1920, bitrate: 12000 },
        "1080_10": { height: 1080, width: 1920, bitrate: 10000 },
        "1080": { height: 1080, width: 1920, bitrate: 8000 },
        "720": { height: 720, width: 1280, bitrate: 4000 },
        "720l": { height: 720, width: 1280, bitrate: 2000 },
        "480": { height: 480, width: 854, bitrate: 720 }
    };
    var COPYABLE = { container: true, "audio-codec": true, "audio-container": true };
    function explanation(kind, direct, reason, force, profile) {
        var selected = direct ? "direct" : kind === "video" && COPYABLE[reason] ? "directstream" : "transcode";
        return {
            selected: selected,
            reason: reason || (kind === "video" ? "supported" : ""),
            fallback: force ? "stop-if-refused" : direct ? "server-transcode-if-refused" : "none",
            capability: {
                status: profile && profile.status || "unknown",
                measured: !!(profile && profile.measured),
                source: profile && profile.evidence || "No device capability evidence"
            }
        };
    }
    function rungFor(quality) {
        var rung = LADDER[quality] || LADDER["1080"];
        return { cap: rung.height, width: rung.width, height: rung.heightAsk || rung.height, bitrate: rung.bitrate };
    }

    // AVPlay's two buffers, measured on a 2018 Tizen 4 TV: PLAYER_BUFFER_FOR_PLAY is waited for at
    // the start AND after every seek (AVPlay keeps reading ahead after it), PLAYER_BUFFER_FOR_RESUME after
    // the buffer runs dry; there is no maximum. The first is the viewer's minimum buffer, 1 s by default
    // (on a 16 Mbps transcode over ~20 Mbps Wi-Fi 1 s started 2.1 s sooner and seeked 1.5 s faster than
    // 4 s, with no stall in the next 37 s). 0.5 s goes in bytes at the stream's bitrate, since the seconds unit
    // takes whole seconds, but never under 384 KB: below about 200 KB AVPlay does not finish the fill at once and
    // creeps up in 2% steps (96 KB and 128 KB played 1-3 s later; 256-478 KB filled at once), which made 0.1 s
    // slower than 0.5 s and 0.5 s of a 2 Mbps film slower than 1 s. The second follows the headroom between the
    // measured speed and the bitrate, so a tight link waits longer after a stall instead of stalling again.
    var RESUME_STEPS = [[1.5, 1], [1.2, 3], [1, 5], [0, 10]];
    var MIN_PLAY_BYTES = 393216;
    function buffering(seconds, mbps, kbps) {
        var play = seconds > 0 ? seconds : 1;
        var headroom = mbps > 0 && kbps > 0 ? mbps * 1000 / kbps : 0;
        var resume = headroom ? RESUME_STEPS.filter(function (step) { return headroom >= step[0]; })[0][1] : 3;
        var buffer = { play: play, resume: Math.max(Math.ceil(play), resume) };
        if (play < 1) { buffer.playBytes = kbps > 0 && isFinite(kbps) ? Math.max(MIN_PLAY_BYTES, Math.round(kbps * 125 * play)) : 0; }
        return buffer;
    }

    // The most a conversion of this file asks PMS for: its own bitrate, raised to the per-size minimum
    // below which PMS shrinks the picture (a 2 Mbps 1080p film became 390p under 2.7 Mbps, 692p under 6).
    function ceiling(media) {
        var height = Number(media && media.height);
        return Math.max(Number(media && media.bitrate) || Infinity, height > 720 ? 8000 : height > 480 ? 4000 : 2000);
    }

    function videoStream(streams) {
        for (var i = 0; i < streams.length; i += 1) {
            if (Number(streams[i].streamType) === 1) { return streams[i]; }
        }
        return {};
    }

    // Why the original cannot play as-is on this profile, or "" when it can.
    function fits(profile, media, streams, hdr, rung, audioId) {
        if (!profile || !profile.evidence) { return "profile"; }
        var video = videoStream(streams);
        var container = String(media.container || "");
        var vcodec = String(media.videoCodec || "");
        var audio = streams.filter(function (stream) {
            return audioId > 0 && Number(stream.streamType) === 2 && trackId(stream.id) === audioId;
        })[0];
        var acodec = plexAudio(String(audio && audio.codec || media.audioCodec || ""));
        if (profile.video.indexOf(vcodec) === -1) { return "video-codec"; }
        var boxes = profile.videoContainers && profile.videoContainers[vcodec] || profile.containers;
        if (boxes.indexOf(container) === -1) { return "container"; }
        if (acodec && profile.audio.indexOf(acodec) === -1) { return "audio-codec"; }
        var audioBoxes = profile.audioContainers && profile.audioContainers[acodec];
        if (audioBoxes && audioBoxes.indexOf(container) === -1) { return "audio-container"; }
        if (Number(media.width) > profile.maxWidth || Number(media.height) > profile.maxHeight) { return "resolution"; }
        if (Number(media.height) > rung.cap || (rung.cap !== Infinity && Number(media.bitrate) > rung.bitrate)) {
            return "quality";
        }
        if (profile.maxBitrate && Number(media.bitrate) > profile.maxBitrate) { return "bitrate"; }
        var depth = Number(video.bitDepth) || 8;
        if ((vcodec === "h264" && depth > 8) || depth > 10) { return "bit-depth"; }
        var fps = Number(video.frameRate) || 0;
        if (profile.maxFrameRate && fps > profile.maxFrameRate + 0.5) { return "frame-rate"; }
        var level = Number(video.level) || 0;
        if (vcodec === "h264" && profile.h264Level1080 && Number(media.height) <= 1080 && level > profile.h264Level1080) {
            return "level";
        }
        if (hdr) {
            if (profile.hdr !== "hdr10" && profile.hdr !== "observed") { return "hdr"; }
            // No Samsung TV decodes Dolby Vision; a profile 7/8 file carries an HDR10/SDR/HLG base
            // layer that plays as that format. Profile 5 has none.
            if (video.DOVIPresent || /dolby|dovi/i.test(String(media.videoDynamicRange || ""))) {
                var doviProfile = Number(video.DOVIProfile) || 0;
                var compat = Number(video.DOVIBLCompatID) || 0;
                if (!((doviProfile === 7 || doviProfile === 8) && compat > 0)) { return "dolby-vision"; }
            }
        }
        return "";
    }

    // How PMS answered: the original file, a remux that keeps the video, or a conversion.
    function streamMode(direct, media) {
        if (direct) { return "direct"; }
        var part = media && media.Part && media.Part[0];
        var copied = (part && part.Stream || []).some(function (stream) {
            return Number(stream.streamType) === 1 && stream.decision === "copy";
        });
        return copied ? "directstream" : "transcode";
    }

    function plan(item, options) {
        options = options || {};
        var mediaIndex = options.mediaIndex || 0;
        var media = (item.Media || [])[mediaIndex];
        var part = media && (media.Part || [])[0];
        if (!part || !part.key || !/^[0-9]+$/.test(String(item.ratingKey))) {
            throw new Error("This item has no playable media version.");
        }
        var kind = item.type === "track" ? "music" : "video";
        var streams = part.Stream || [];
        if (!streams.some(function (stream) {
            return Number(stream.streamType) === 2 || kind === "video" && Number(stream.streamType) === 1;
        })) {
            throw unplayableFile();
        }
        var multipart = media.Part.length > 1;
        var tracks = resolveTracks(part, options);
        // A text subtitle the app renders itself stays selected on PMS but is never burned in.
        var burn = tracks.subtitleId && !options.overlaySubtitle ? tracks.subtitleId : 0;
        var profile = options.profile;
        var range = String(media.videoDynamicRange || "");
        var dolby = /dolby|dovi/i.test(range) || streams.some(function (stream) { return stream.streamType === 1 && stream.DOVIPresent; });
        var hdr = (range && range !== "SDR") || dolby || media.hdr ||
            /smpte2084|arib-std-b67/.test(String(media.colorTrc || media.colorTransfer || "")) || streams.some(function (stream) { return stream.streamType === 1 &&
                (stream.colorTrc === "smpte2084" || stream.colorTrc === "arib-std-b67"); });
        var rung = rungFor(options.quality);
        var force = options.directPlay === "force";
        var verdict = kind !== "video" ? "" : multipart ? "multipart" : burn ? "subtitle" :
            options.directPlay === "off" ? "settings" : fits(profile, media, streams, hdr, rung, tracks.audioId);
        var direct = verdict === "" && kind === "video" && !multipart && !burn && !!profile;
        // Force asks for the original even where the profile predicts a refusal; the device is the judge.
        if (force && kind === "video" && !multipart && !burn) { direct = true; }
        // Never ask for more than the file needs: a conversion fills most of its cap (an 8.1 Mbps episode
        // came back at 18.4 Mbps under the 20 Mbps rung), so it is capped at ceiling(). PMS copies video
        // only under a cap well above the average (8 Mbps H.264 at 14 Mbps, not 11), so a Direct Stream ask
        // keeps twice the source.
        var copy = kind === "video" && !!COPYABLE[verdict];
        var cap = copy ? Math.max(2 * (Number(media.bitrate) || Infinity), ceiling(media)) : ceiling(media);
        var session = "tizen-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
        var query = {
            path: "/library/metadata/" + item.ratingKey, mediaIndex: mediaIndex, partIndex: multipart ? -1 : 0,
            protocol: "hls", hasMDE: 1, directPlay: direct ? 1 : 0,
            // Direct Stream: when only the box or the audio is wrong (DTS/TrueHD, HEVC in MOV), PMS
            // may copy the video into HLS and convert the rest. Never for a pixel-level refusal:
            // the LG client measured a Dolby Vision base layer copied straight through
            // (plex/src/plex/transcoder.rs transcode_query), so those always re-encode.
            directStream: copy ? 1 : 0,
            directStreamAudio: kind === "video" ? 1 : 0,
            // The conversion starts at the resume point (in whole seconds). Its playlist still spans the whole
            // title, so AVPlay keeps the title's clock and can seek back before it.
            offset: kind === "video" ? Math.floor((Number(options.offset) || 0) / 1000) : 0,
            session: session, "X-Plex-Session-Identifier": session,
            videoResolution: rung.width + "x" + rung.height,
            videoBitrate: Math.min(rung.bitrate, cap),
            videoQuality: 100, audioCodec: "aac", videoCodec: "h264",
            subtitleStreamID: burn,
            subtitles: burn ? "burn" : "none",
            "X-Plex-Client-Profile-Name": "Generic",
            "X-Plex-Client-Profile-Extra": "add-transcode-target(type=videoProfile&context=streaming&protocol=hls&container=mpegts&videoCodec=h264&audioCodec=aac)"
        };
        if (tracks.audioId > 0) { query.audioStreamID = tracks.audioId; }
        if (direct) {
            query["X-Plex-Client-Profile-Extra"] += "+add-direct-play-profile(type=videoProfile&protocol=http&container=" +
                profile.containers.join(",") + "&videoCodec=" + profile.video.join(",") + "&audioCodec=" +
                profile.audio.map(function (codec) { return codec === "dts" ? "dca" : codec; }).join(",") + ")";
        }
        if (kind === "music") {
            query.protocol = "http";
            query.audioCodec = "mp3";
            query.audioBitrate = 192;
            delete query.videoCodec;
            delete query.videoBitrate;
            delete query.videoResolution;
            delete query.videoQuality;
            query["X-Plex-Client-Profile-Extra"] =
                "add-transcode-target(type=musicProfile&context=streaming&protocol=http&container=mp3&audioCodec=mp3)";
        }
        return { direct: !!direct, part: part, query: query, session: session, kind: kind, tracks: tracks,
            force: force && kind === "video", reason: verdict,
            explanation: explanation(kind, !!direct, verdict, force && kind === "video", profile) };
    }

    function create(options) {
        var client = options.client;
        var adapter = options.adapter;
        var item = options.item;
        var settings = options.settings || {};
        var selection = plan(item, settings);
        var sourceMedia = item.Media[settings.mediaIndex || 0];
        var streamMedia = null;
        var emit = options.onEvent || function () {};
        var interval = null;
        var started = false;
        var starting = false;
        var stopping = false;
        var closed = false;
        var allocated = false;
        var reportChain = Promise.resolve();
        var reporting = false;
        var pendingReport = null;
        var lastPosition = Math.max(0, Number(settings.offset) || 0);
        var buffer = null;
        var prebuffer = true;
        var preparing = null;

        function report(state) {
            if (!started) { return Promise.resolve(); }
            var position = Math.max(0, Math.round(adapter.snapshot().position));
            lastPosition = position;
            if (!pendingReport || pendingReport.state !== "stopped") {
                pendingReport = { position: position, state: state };
            }
            if (reporting) { return reportChain; }
            reporting = true;
            function drain() {
                var next = pendingReport;
                pendingReport = null;
                return Promise.resolve().then(function () {
                    return client.timeline(item, next.position, next.state, selection.session,
                        settings.playQueue || null, selection.tracks);
                }).catch(function () {
                    emit({ type: "progress-error", message: "Plex progress could not be saved. Check the server and retry." });
                }).then(function () {
                    if (pendingReport) { return drain(); }
                    reporting = false;
                });
            }
            reportChain = drain();
            return reportChain;
        }

        function stop() {
            if (closed || stopping) { return reportChain; }
            stopping = true;
            if (interval !== null) { clearInterval(interval); interval = null; }
            var stopped = report("stopped");
            try {
                adapter.close();
                closed = true;
            } catch (error) {
                stopping = false;
                return Promise.reject(error);
            }
            return stopped.then(function () {
                if (!selection.direct && allocated) {
                    return client.stopTranscode(selection.session, selection.kind).catch(function (error) {
                        // 404: the stopped timeline already ended the session on the server.
                        if (error && error.status === 404) { return; }
                        emit({ type: "cleanup-error", message: "Plex did not confirm transcode cleanup." });
                    });
                }
            }).then(function () {
                // Nothing was reported before the start, so Plex has nothing new to read back.
                if (!started) { return undefined; }
                return client.getMetadata(item.ratingKey).then(function (metadata) {
                    emit({ type: "progress-readback", item: metadata });
                    return metadata;
                }, function (error) {
                    emit({ type: "progress-error", message: "Could not reconcile playback state with Plex. Retry when the server is reachable." });
                    throw error;
                });
            });
        }
        // hold: prepare without playing (see prepare()).
        function negotiate(hold) {
            if (closed || stopping) { throw new Error("Playback was cancelled."); }
            var asked = selection.direct ? directQuery(selection.query) : selection.query;
            return client.request("/" + selection.kind + "/:/transcode/universal/decision", "GET", asked).catch(function (error) {
                if (error && error.status === 400) {
                    var unavailable = unplayableFile();
                    unavailable.status = error.status;
                    unavailable.scope = error.scope;
                    throw unavailable;
                }
                throw error;
            }).then(function (decision) {
                if (closed || stopping) { throw new Error("Playback was cancelled."); }
                if (Number(decision.generalDecisionCode) >= 2000 || Number(decision.transcodeDecisionCode) >= 2000) {
                    throw new Error("Plex refused playback. Change quality, source or subtitle settings and retry.");
                }
                var selectedMedia = decision.Metadata && decision.Metadata[0] &&
                    decision.Metadata[0].Media && decision.Metadata[0].Media[0];
                var selectedPart = selectedMedia && selectedMedia.Part && selectedMedia.Part[0];
                streamMedia = selectedMedia || null;
                if (selection.direct && !(selectedPart && selectedPart.decision === "directplay")) {
                    if (selection.force) { throw new Error("Plex would not send the original file. Direct Play is set to Force in Settings."); }
                    // PMS declined the original; register the capped HLS transcode with its own decision.
                    selection.direct = false;
                    selection.reason = "server";
                    selection.explanation = explanation(selection.kind, false, selection.reason, selection.force,
                        settings.profile);
                    selection.query.directPlay = 0;
                    selection.query.directStream = 0;
                    return negotiate(hold);
                }
                var path = selection.direct ? selection.part.key : "/" + selection.kind +
                    "/:/transcode/universal/start." + (selection.kind === "music" ? "mp3" : "m3u8");
                var url = client.streamUrl(path, selection.direct ? {} : selection.query);
                allocated = true;
                // The bitrate on the wire: the file itself, or the conversion PMS reports (else its cap).
                var kbps = selection.direct ? Number(sourceMedia.bitrate) : Number(streamMedia && streamMedia.bitrate) ||
                    Math.min(Number(sourceMedia.bitrate) || Infinity, rungFor(settings.quality).bitrate);
                buffer = buffering(settings.minBuffer, settings.mbps, kbps);
                // A resume prepares at the offset, where the conversion also starts: on a 2018 TV the picture
                // came 2.2 s after Resume instead of 5.4 s (no fetch of the opening, no transcoder restart).
                return adapter.open(url, settings.offset || 0, settings.paused, buffer, { prebuffer: prebuffer, hold: hold }).catch(function (error) {
                    if (error && error.code === "avplay-prebuffer" && !closed && !stopping) {
                        // This TV cannot prepare at an offset: convert from the start and seek once prepared.
                        prebuffer = false;
                        selection.query.offset = 0;
                        return negotiate(hold);
                    }
                    if (!selection.direct || selection.force || closed || stopping) { throw error; }
                    // The capability profile is a prediction; the decoder has the last word.
                    emit({ type: "direct-fallback", message: error && error.message });
                    selection.direct = false;
                    selection.reason = "decoder";
                    selection.explanation = explanation(selection.kind, false, selection.reason, selection.force,
                        settings.profile);
                    selection.query.directPlay = 0;
                    selection.query.directStream = 0;
                    return negotiate(hold);
                });
            });
        }
        function openStream() {
            if (closed || stopping) { throw new Error("Playback was cancelled."); }
            if (selection.force && !selection.direct) {
                throw new Error("Direct Play is set to Force, but this selection requires server conversion. Change subtitle settings or turn off Force.");
            }
            return Promise.resolve(selection.tracks.explicit ?
                client.selectStreams(selection.part.id, selection.tracks.audioId, selection.tracks.subtitleId) : null)
                .then(function () { return negotiate(false); });
        }
        // A seek past what PMS has converted makes it restart its transcoder for the requested segment while AVPlay
        // waits (3.7 s to a moving picture after a 90 s jump on a 2018 TV). Opening the conversion again at the
        // target took 2.1-2.7 s, so a seek PMS reports outside its converted range reopens there (same session);
        // any other seek, or no answer, is an ordinary AVPlay seek. So is one while paused: the TV refused a pause
        // right after play, which a paused reopen needs.
        function converted(target) {
            if (selection.direct || selection.kind !== "video" || !prebuffer || adapter.snapshot().state !== "playing") {
                return Promise.resolve(true);
            }
            return client.request("/transcode/sessions/" + encodeURIComponent(selection.session)).then(function (container) {
                var made = container && container.TranscodeSession && container.TranscodeSession[0];
                var from = Number(made && made.minOffsetAvailable) * 1000;
                var to = Number(made && made.maxOffsetAvailable) * 1000;
                return !(isFinite(from) && isFinite(to)) || (target >= from - 1000 && target <= to + 5000);
            }, function () { return true; });
        }
        function reopen(target) {
            selection.query.offset = Math.floor(target / 1000);
            var url = client.streamUrl("/video/:/transcode/universal/start.m3u8", selection.query);
            return adapter.open(url, target, false, buffer, { prebuffer: true, moving: true }).then(function () {
                return adapter.snapshot().position;
            });
        }
        // Plays what prepare() readied; if that was lost, opens the ordinary way.
        function playPrepared() {
            if (closed || stopping) { throw new Error("Playback was cancelled."); }
            try { adapter.play(); }
            catch (error) { return openStream(); }
        }
        return {
            // A background start: the decision and the AVPlay prepare at the offset, held before the picture.
            // It writes nothing to Plex (no stream selection, timeline or play queue), so stop() may discard
            // it; that also ends the conversion it began. start() then only has to play.
            prepare: function () {
                if (!preparing && !starting && !started) {
                    preparing = Promise.resolve().then(function () {
                        if (selection.tracks.explicit || settings.paused || (selection.force && !selection.direct)) {
                            throw new Error("Only a default start can be prepared.");
                        }
                        return negotiate(true);
                    });
                }
                return preparing || Promise.reject(new Error("This playback session has already started."));
            },
            start: function () {
                if (started || starting || closed || stopping) { return Promise.reject(new Error("This playback session cannot be started again.")); }
                starting = true;
                return (preparing ? preparing.then(playPrepared, openStream) : Promise.resolve().then(openStream)).then(function () {
                    if (closed || stopping) { throw new Error("Playback was cancelled."); }
                    started = true;
                    starting = false;
                    emit({ type: "source", mode: streamMode(selection.direct, streamMedia), session: selection.session });
                    report(adapter.snapshot().state);
                    interval = setInterval(function () {
                        var snapshot = adapter.snapshot();
                        if (snapshot.state === "paused" || snapshot.state === "playing" || snapshot.state === "buffering") {
                            report(snapshot.state);
                        }
                    }, 10000);
                }).catch(function (error) {
                    starting = false;
                    throw error;
                });
            },
            stop: stop,
            pause: function () { adapter.pause(); return report("paused"); },
            play: function () { adapter.play(); return report("playing"); },
            seek: function (position) {
                return converted(position).then(function (ready) {
                    return ready ? adapter.seek(position) : reopen(position);
                }).then(function (landed) {
                    report(adapter.snapshot().state === "paused" ? "paused" : "playing");
                    return landed;
                });
            },
            snapshot: function () { return adapter.snapshot(); },
            part: function () { return selection.part; },
            selection: function () {
                return { audioId: selection.tracks.audioId, subtitleId: selection.tracks.subtitleId,
                    explicit: selection.tracks.explicit };
            },
            mode: function () { return streamMode(selection.direct, streamMedia); },
            buffer: function () { return buffer; },
            quality: function () {
                var currentMode = streamMode(selection.direct, streamMedia);
                var currentExplanation = explanation(selection.kind, selection.direct, selection.reason,
                    selection.force, settings.profile);
                currentExplanation.selected = currentMode;
                return { source: sourceMedia, stream: selection.direct ? sourceMedia : streamMedia,
                    mode: currentMode, reason: selection.reason, explanation: currentExplanation,
                    limit: LADDER[settings.quality] ? settings.quality : "1080" };
            },
            tracks: function () { return adapter.tracks(); },
            selectTrack: function (type, index) { adapter.selectTrack(type, index); },
            subtitles: function (enabled) { adapter.subtitles(enabled); },
            position: function () { return lastPosition; }
        };
    }

    // Highest capped rung whose bitrate is at most 80% of the measured Mbps; at 1.25x the top rung the
    // link carries the original. maxHeight hides rungs a panel cannot show (1080 on an FHD panel).
    function recommend(mbps, maxHeight) {
        var rungs = Object.keys(LADDER).filter(function (name) {
            return name !== "original" && LADDER[name].height <= (maxHeight || Infinity);
        }).sort(function (a, b) { return LADDER[b].bitrate - LADDER[a].bitrate; });
        if (mbps * 1000 >= LADDER[rungs[0]].bitrate * 1.25) { return "original"; }
        for (var i = 0; i < rungs.length; i += 1) {
            if (!warns(LADDER[rungs[i]].bitrate, { mbps: mbps })) { return rungs[i]; }
        }
        return rungs[rungs.length - 1];
    }

    // A rung warns when its bitrate (kbps) is above 80% of the speed's Mbps; no speed, no warning.
    function warns(kbps, speed) { return !!speed && kbps > speed.mbps * 1000 * 0.8; }

    // The last five measured Mbps per server, numbers only, so Settings can mark options that may buffer.
    var SPEEDS_KEY = "vemm-tizen-speeds";
    function savedSpeeds(storage, serverId) {
        var all = {};
        try { all = JSON.parse(storage.getItem(SPEEDS_KEY) || "{}"); } catch (error) { all = {}; }
        var list = all && all[serverId];
        return { all: all && typeof all === "object" && !Array.isArray(all) ? all : {}, list: Array.isArray(list) ? list.filter(function (value) {
            return typeof value === "number" && isFinite(value) && value > 0;
        }).slice(-5) : [] };
    }
    function recordSpeed(storage, serverId, mbps) {
        if (!serverId || typeof mbps !== "number" || !isFinite(mbps) || mbps <= 0) { return; }
        var saved = savedSpeeds(storage, serverId);
        saved.all[serverId] = saved.list.concat(mbps).slice(-5);
        try { storage.setItem(SPEEDS_KEY, JSON.stringify(saved.all)); } catch (error) { /* not remembered */ }
    }
    function recentSpeed(storage, serverId) {
        var list = serverId ? savedSpeeds(storage, serverId).list : [];
        if (!list.length) { return null; }
        return { mbps: list.reduce(function (sum, value) { return sum + value; }, 0) / list.length, count: list.length };
    }

    function speedError(code, message, status) {
        var error = new Error(message);
        error.code = code;
        if (status) { error.status = status; }
        return error;
    }

    // Downloads from the server for about eight seconds (or 32 MB) and reports Mbps, ignoring the
    // first second of ramp-up. Progress events carry the byte count; the URL is never put in an error.
    // options.onProgress(mbps, bytes, seconds) reports the reading so far; the promise's cancel() stops it.
    function measureSpeed(options) {
        var now = options.now || Date.now;
        var wait = options.setTimeout || setTimeout;
        var stopWaiting = options.clearTimeout || clearTimeout;
        // 32 MB caps memory on the TV; a link fast enough to hit it early is far above every capped rung.
        var maxBytes = 33554432;
        var cancel;
        var measuring = new Promise(function (resolve, reject) {
            var request = options.createRequest ? options.createRequest() : new XMLHttpRequest();
            var started = now();
            var baseTime = started;
            var baseBytes = 0;
            var loaded = 0;
            var lastMbps = 0;
            var finished = false;
            var timer;
            function finish(error) {
                if (finished) { return; }
                finished = true;
                stopWaiting(timer);
                request.abort();
                var seconds = (now() - baseTime) / 1000;
                if (error) { reject(error); }
                else if (loaded <= baseBytes || seconds <= 0) { reject(speedError("no-data", "The server sent no data.")); }
                else { resolve({ mbps: (loaded - baseBytes) * 8 / seconds / 1e6, bytes: loaded }); }
            }
            function failed() { finish(speedError("network", "The connection to the server failed.")); }
            cancel = function () { finish(speedError("cancelled", "The speed test was cancelled.")); };
            request.open("GET", options.url);
            request.responseType = "arraybuffer";
            request.setRequestHeader("Range", "bytes=0-" + (maxBytes - 1));
            request.onreadystatechange = function () {
                if (request.readyState === 2 && request.status !== 200 && request.status !== 206) {
                    finish(speedError("http", "The server refused the download (HTTP " + request.status + ").", request.status));
                }
            };
            request.onprogress = function (event) {
                loaded = event.loaded;
                if (baseBytes === 0 && now() - started >= (options.rampMs === undefined ? 1000 : options.rampMs)) {
                    baseTime = now();
                    baseBytes = loaded;
                }
                var seconds = (now() - baseTime) / 1000;
                if (loaded > baseBytes && seconds > 0) { lastMbps = (loaded - baseBytes) * 8 / seconds / 1e6; }
                if (options.onProgress) { options.onProgress(lastMbps, loaded, (now() - started) / 1000); }
                if (loaded >= maxBytes) { finish(); }
            };
            request.onload = function () { finish(); };
            request.onerror = failed;
            request.ontimeout = function () { finish(speedError("timeout", "The server took too long to respond.")); };
            request.onabort = failed;
            timer = wait(function () { finish(); }, options.durationMs || 8000);
            request.send();
        });
        measuring.cancel = cancel;
        return measuring;
    }

    // The authenticated URL of the first playable file in any movie or show library.
    function sampleUrl(client) {
        function noMedia() { return speedError("no-media", "This server has no playable media to test."); }
        return client.getSections().then(function (sections) {
            var libraries = sections.filter(function (section) { return section.type === "movie" || section.type === "show"; });
            function next(index) {
                if (index >= libraries.length) { throw noMedia(); }
                var library = libraries[index];
                return client.getSectionItems(library.key, 0, 1, library.type === "show" ? { type: 4 } : undefined).then(function (page) {
                    if (!page.items.length) { return next(index + 1); }
                    return client.getMetadata(page.items[0].ratingKey).then(function (item) {
                        var part = item.Media && item.Media[0] && item.Media[0].Part && item.Media[0].Part[0];
                        return part && part.key ? client.streamUrl(part.key) : next(index + 1);
                    });
                });
            }
            return next(0);
        });
    }

    return { plan: plan, create: create, fits: fits, rungFor: rungFor, streamMode: streamMode,
        recommend: recommend, warns: warns, buffering: buffering, ceiling: ceiling, recordSpeed: recordSpeed, recentSpeed: recentSpeed, measureSpeed: measureSpeed, sampleUrl: sampleUrl,
        qualities: Object.keys(LADDER) };
}));
