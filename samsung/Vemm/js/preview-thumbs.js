(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmPreviewThumbs = api; }
}(this, function () {
    "use strict";

    var MAGIC = [0x89, 0x42, 0x49, 0x46, 0x0d, 0x0a, 0x1a, 0x0a];
    var MAX_FRAMES = 20000;

    // Plex's preview index (BIF): 8 magic bytes, u32 version, u32 frame count, u32 ms per timestamp unit
    // (0 = 1000), padding to 64 bytes, then count + 1 pairs of u32 [timestamp, offset] (the last pair only
    // marks the end of the last JPEG). Returns { times: ms per frame, offsets: count + 1 byte offsets } or null.
    function parse(buffer) {
        if (!buffer || buffer.byteLength < 64) { return null; }
        var bytes = new Uint8Array(buffer);
        for (var i = 0; i < MAGIC.length; i += 1) { if (bytes[i] !== MAGIC[i]) { return null; } }
        var view = new DataView(buffer);
        var count = view.getUint32(12, true);
        var unit = view.getUint32(16, true) || 1000;
        if (!count || count > MAX_FRAMES || 64 + (count + 1) * 8 > buffer.byteLength) { return null; }
        var times = [];
        var offsets = [];
        for (var frame = 0; frame <= count; frame += 1) {
            var offset = view.getUint32(64 + frame * 8 + 4, true);
            if (offset > buffer.byteLength || frame && offset < offsets[frame - 1]) { return null; }
            offsets.push(offset);
            if (frame < count) { times.push(view.getUint32(64 + frame * 8, true) * unit); }
        }
        return { times: times, offsets: offsets };
    }

    // The frame at or before position (ms), by binary search; -1 before the first.
    function frameAt(index, position) {
        var low = 0;
        var high = index.times.length - 1;
        var found = -1;
        while (low <= high) {
            var middle = (low + high) >> 1;
            if (index.times[middle] <= position) { found = middle; low = middle + 1; }
            else { high = middle - 1; }
        }
        return found;
    }

    // One preview strip per playback. load() resolves the BIF bytes (or null when the server has none; a
    // failure is treated the same: no thumbnail). Only the bytes and the one frame on screen are held.
    function create(options) {
        var buffer = null;
        var index = null;
        var started = false;
        var closed = false;
        var wanted = null;
        var shown = -1;
        var url = "";
        var node = null;
        var image = null;

        function forget() {
            if (url) { URL.revokeObjectURL(url); url = ""; }
            shown = -1;
        }
        function load() {
            if (started || closed) { return; }
            started = true;
            Promise.resolve().then(options.load).then(function (bytes) {
                if (closed) { return; }
                index = parse(bytes);
                buffer = index ? bytes : null;
                if (wanted) { draw(); }
            }).catch(function () { /* previews are optional: show nothing */ });
        }
        function draw() {
            if (!index || !wanted) { return; }
            var frame = frameAt(index, wanted.position);
            if (frame < 0) { frame = 0; }
            if (!node) {
                var doc = wanted.parent.ownerDocument;
                node = doc.createElement("div");
                node.className = "preview-thumb";
                image = doc.createElement("img");
                image.alt = "";
                node.appendChild(image);
            }
            if (node.parentNode !== wanted.parent) { wanted.parent.appendChild(node); }
            if (frame !== shown) {
                forget();
                url = URL.createObjectURL(new Blob([new Uint8Array(buffer, index.offsets[frame],
                    index.offsets[frame + 1] - index.offsets[frame])], { type: "image/jpeg" }));
                image.src = url;
                shown = frame;
            }
            node.hidden = false;
            // Keep the picture inside the timeline: its half width is a share of the bar at either end.
            var width = wanted.parent.offsetWidth;
            var half = width > 0 && node.offsetWidth > 0 ? node.offsetWidth / 2 / width : 0;
            node.style.left = Math.min(1 - half, Math.max(half, wanted.share)) * 100 + "%";
        }
        return {
            // Starts the one download (once); nothing is shown until it has arrived.
            load: load,
            // The frame for position (ms), above parent at share (0..1) of its width.
            show: function (position, share, parent) {
                if (closed) { return; }
                wanted = { position: position, share: share, parent: parent };
                load();
                draw();
            },
            hide: function () {
                wanted = null;
                if (node) { node.hidden = true; }
                forget();
            },
            // Ends the playback: drops the bytes, the frame and the element.
            close: function () {
                closed = true;
                wanted = null;
                forget();
                if (node && node.parentNode) { node.parentNode.removeChild(node); }
                node = image = buffer = index = null;
            }
        };
    }

    return { parse: parse, frameAt: frameAt, create: create };
}));
