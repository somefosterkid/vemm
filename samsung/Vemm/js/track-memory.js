(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmTrackMemory = api; }
}(this, function () {
    "use strict";
    // The audio and subtitle language picked while watching an episode, kept per show on this TV and applied to the
    // show's other episodes that have a matching track. Plex remembers a pick only for the file it was made on.
    // An entry is { show, audio?: "jpn", subtitle?: "off" | "eng" | "eng:forced" | "eng:sdh" }; the newest 50
    // shows are kept, newest first. Nothing but language codes and show keys is stored.
    var KEY = "vemm-tizen-track-memory";
    var LIMIT = 50;

    function flag(value) { return value === true || value === 1 || value === "1" || value === "true"; }
    function language(stream) {
        var code = stream && (stream.languageCode || stream.languageTag);
        return /^[A-Za-z]{2,3}(-[A-Za-z0-9]+)?$/.test(String(code || "")) ? String(code).toLowerCase() : "";
    }
    function kind(stream) { return flag(stream.forced) ? "forced" : flag(stream.hearingImpaired) ? "sdh" : "regular"; }
    function describe(stream) {
        var code = language(stream);
        return code ? (Number(stream.streamType) === 3 && kind(stream) !== "regular" ? code + ":" + kind(stream) : code) : "";
    }
    function byId(streams, id) {
        return (streams || []).filter(function (stream) { return String(stream.id) === String(id); })[0];
    }
    function ofType(streams, type) {
        return (streams || []).filter(function (stream) { return Number(stream.streamType) === type; });
    }

    function load(storage) {
        try {
            var saved = JSON.parse(storage.getItem(KEY));
            return Array.isArray(saved) ? saved.filter(function (entry) {
                return entry && typeof entry.show === "string" && (entry.audio || entry.subtitle);
            }) : [];
        } catch (error) { return []; }
    }
    function recall(storage, show) {
        return load(storage).filter(function (entry) { return entry.show === String(show); })[0] || null;
    }
    function forget(storage, show) {
        var kept = load(storage).filter(function (entry) { return entry.show !== String(show); });
        try { storage.setItem(KEY, JSON.stringify(kept)); } catch (error) { /* only a convenience */ }
    }

    // A pick in an episode: change.audioId / change.subtitleId (0 = off) are set only for what the viewer changed.
    // Tracks that cannot be described (no language) leave that part as it was.
    function remember(storage, show, streams, change) {
        var entry = recall(storage, show) || { show: String(show) };
        if (change.audioId !== undefined) {
            var audio = describe(byId(ofType(streams, 2), change.audioId) || {});
            if (audio) { entry.audio = audio; }
        }
        if (change.subtitleId !== undefined) {
            var subtitle = Number(change.subtitleId) === 0 ? "off" : describe(byId(ofType(streams, 3), change.subtitleId) || {});
            if (subtitle) { entry.subtitle = subtitle; }
        }
        if (!entry.audio && !entry.subtitle) { return; }
        var list = load(storage).filter(function (other) { return other.show !== entry.show; });
        list.unshift(entry);
        try { storage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT))); } catch (error) { /* only a convenience */ }
    }

    // The tracks of another episode that match the entry, as { audioId, subtitleId } (0 = off). A part the entry
    // says nothing about, or finds no match for, keeps what Plex selected; null when that changes nothing.
    function choose(entry, streams) {
        if (!entry) { return null; }
        var audios = ofType(streams, 2);
        var subtitles = ofType(streams, 3);
        var audio = audios.filter(function (stream) { return flag(stream.selected); })[0];
        var subtitle = subtitles.filter(function (stream) { return flag(stream.selected); })[0];
        var chosen = {
            audioId: audio ? Number(audio.id) : 0,
            subtitleId: subtitle ? Number(subtitle.id) : 0
        };
        var picked = false;
        if (entry.audio) {
            var matchAudio = audios.filter(function (stream) { return language(stream) === entry.audio; })[0];
            if (matchAudio && Number(matchAudio.id) !== chosen.audioId) { chosen.audioId = Number(matchAudio.id); picked = true; }
        }
        if (entry.subtitle === "off") {
            if (chosen.subtitleId !== 0) { chosen.subtitleId = 0; picked = true; }
        } else if (entry.subtitle) {
            var wanted = entry.subtitle.split(":");
            var same = subtitles.filter(function (stream) { return language(stream) === wanted[0]; });
            var match = same.filter(function (stream) { return kind(stream) === (wanted[1] || "regular"); })[0] ||
                (wanted[1] === "sdh" ? same.filter(function (stream) { return kind(stream) === "regular"; })[0] : null);
            if (match && Number(match.id) !== chosen.subtitleId) { chosen.subtitleId = Number(match.id); picked = true; }
        }
        return picked && chosen.audioId > 0 ? chosen : null;
    }

    return { recall: recall, remember: remember, forget: forget, choose: choose };
}));
