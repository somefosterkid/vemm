"use strict";
// A synthetic Plex preview index (BIF) for tests.
// frames: [[timestampUnits, byteLength], ...]; unit is the header's ms-per-timestamp (0 means 1000).
module.exports = function bif(frames, unit) {
    var header = 64 + (frames.length + 1) * 8;
    var total = header + frames.reduce(function (sum, frame) { return sum + frame[1]; }, 0);
    var buffer = new ArrayBuffer(total);
    var bytes = new Uint8Array(buffer);
    var view = new DataView(buffer);
    [0x89, 0x42, 0x49, 0x46, 0x0d, 0x0a, 0x1a, 0x0a].forEach(function (value, i) { bytes[i] = value; });
    view.setUint32(8, 0, true);
    view.setUint32(12, frames.length, true);
    view.setUint32(16, unit, true);
    var offset = header;
    frames.forEach(function (frame, i) {
        view.setUint32(64 + i * 8, frame[0], true);
        view.setUint32(64 + i * 8 + 4, offset, true);
        for (var b = 0; b < frame[1]; b += 1) { bytes[offset + b] = i + 1; }
        offset += frame[1];
    });
    view.setUint32(64 + frames.length * 8, 0xffffffff, true);
    view.setUint32(64 + frames.length * 8 + 4, offset, true);
    return buffer;
};
