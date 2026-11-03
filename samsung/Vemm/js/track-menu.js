(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmTrackMenu = api; }
}(this, function () {
    "use strict";
    // The order and labels of the player's track menus. Real files carry 40 or more subtitles, Plex names a language
    // in that language ("Deutsch"), and what tells two of them apart is in a free-text title ("Latin American | SDH").

    var LONGEST = 40;

    function flag(value) { return value === true || value === 1 || value === "1" || value === "true"; }

    function languageOf(stream) {
        return stream.language || stream.languageTag || stream.languageCode || stream.displayTitle || stream.codec || String(stream.id);
    }

    // What sets a track apart within its language. A title is cut down to that: it may repeat the language ("English
    // subs") or run to a sentence naming every commentator.
    function details(stream, forcedName) {
        var language = languageOf(stream).toLowerCase();
        var parts = [];
        function add(text) {
            var at = text.toLowerCase().indexOf(language);
            var part = (at === -1 ? text : text.slice(0, at) + text.slice(at + language.length)).replace(/^[\s\-:(\[]+|[\s\-:]+$/g, "");
            if (!/[(\[]/.test(part)) { part = part.replace(/[)\]]+$/, ""); }
            if (/^(subs?|subtitles?)$/i.test(part)) { return; }
            if (part.length > LONGEST) { part = part.slice(0, LONGEST - 1) + "…"; }
            var said = parts.some(function (seen) { return seen.toLowerCase().indexOf(part.toLowerCase()) !== -1; });
            if (part && !said) { parts.push(part); }
        }
        if (flag(stream.forced)) { add(forcedName); }
        String(stream.title || "").split("|").forEach(function (part) { add(part.trim()); });
        if (flag(stream.hearingImpaired)) { add("SDH"); }
        return parts;
    }

    // "AAC 5.1" out of Plex's "English (AAC 5.1)", without the speaker list some files put in a second bracket.
    function format(stream) {
        var bracket = /\((.*)\)/.exec(stream.displayTitle || "");
        return bracket ? bracket[1].replace(/\s*\([^)]*\)/g, "") : String(stream.codec || "").toUpperCase();
    }

    function join(parts) { return parts.filter(Boolean).join(" · "); }

    // Each stream's label, distinct within the list. Audio always says its format, because 5.1 or stereo is part of the
    // choice; a subtitle says it only when two would otherwise read the same. The server's own title settles the rest,
    // and tracks it cannot tell apart either are numbered.
    function labels(streams, forcedName) {
        function count(rows, value) { return rows.filter(function (row) { return row === value; }).length; }
        var plain = streams.map(function (stream) {
            var parts = [languageOf(stream)].concat(details(stream, forcedName));
            return join(Number(stream.streamType) === 2 ? parts.concat(format(stream)) : parts);
        });
        var coded = plain.map(function (label, at) {
            return count(plain, label) > 1 && Number(streams[at].streamType) !== 2 ? join([label, String(streams[at].codec || "").toUpperCase()]) : label;
        });
        var titled = coded.map(function (label, at) {
            return count(coded, label) > 1 ? streams[at].extendedDisplayTitle || streams[at].displayTitle || label : label;
        });
        return titled.map(function (label, at) {
            var before = count(titled.slice(0, at), label);
            return before ? join([label, String(before + 1)]) : label;
        });
    }

    // The likely choices first: the current track, others in its language, then the viewer's languages (two-letter
    // codes, most wanted first); the rest stay in the file's order, which is its own alphabet.
    function arrange(streams, currentId, languages, twoLetter) {
        function code(stream) { return twoLetter(stream.languageCode || stream.languageTag); }
        var current = streams.filter(function (stream) { return String(stream.id) === String(currentId); })[0];
        var first = current ? [current] : [];
        (current ? [code(current)] : []).concat(languages).forEach(function (language) {
            streams.forEach(function (stream) {
                if (language && code(stream) === language && first.indexOf(stream) === -1) { first.push(stream); }
            });
        });
        return { first: first, others: streams.filter(function (stream) { return first.indexOf(stream) === -1; }) };
    }

    return { labels: labels, arrange: arrange };
}));
