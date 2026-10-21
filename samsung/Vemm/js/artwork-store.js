(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmArtworkStore = api; }
}(this, function () {
    "use strict";
    // Home artwork kept in IndexedDB so the first Home after launch needs no downloads. Bounded by bytes (one budget
    // shared by the "home" and "library" categories); the least recently used entries go first. Every failure resolves to "nothing stored".
    function open(indexedDB, options) {
        options = options || {};
        var maxBytes = options.maxBytes || 10 * 1024 * 1024;
        var now = options.now || function () { return Date.now(); };
        var ready = null;

        function database() {
            if (!ready) {
                ready = new Promise(function (resolve) {
                    try {
                        var request = indexedDB.open("vemm-artwork", 1);
                        request.onupgradeneeded = function () {
                            request.result.createObjectStore("blobs");
                            request.result.createObjectStore("meta", { keyPath: "key" }).createIndex("used", "used");
                        };
                        request.onsuccess = function () {
                            request.result.onversionchange = function () {
                                request.result.close();
                                ready = Promise.resolve(null);
                            };
                            resolve(request.result);
                        };
                        request.onerror = request.onblocked = function () { resolve(null); };
                    } catch (error) { resolve(null); }
                });
            }
            return ready;
        }

        // Runs work(blobs, meta, setResult) in one transaction; resolves its result, or null on any failure.
        function run(work) {
            return new Promise(function (resolve) {
                var timer = setTimeout(function () { resolve(null); }, 3000);
                function done(value) { clearTimeout(timer); resolve(value); }
                database().then(function (db) {
                    if (!db) { done(null); return; }
                    var result = null;
                    try {
                        var transaction = db.transaction(["blobs", "meta"], "readwrite");
                        transaction.oncomplete = function () { done(result); };
                        transaction.onerror = transaction.onabort = function () { done(null); };
                        work(transaction.objectStore("blobs"), transaction.objectStore("meta"), function (value) { result = value; });
                    } catch (error) { done(null); }
                });
            });
        }

        function trim(blobs, meta) {
            var bytes = 0;
            meta.index("used").openCursor(null, "prev").onsuccess = function (event) {
                var cursor = event.target.result;
                if (!cursor) { return; }
                bytes += cursor.value.size;
                if (bytes > maxBytes) {
                    blobs.delete(cursor.value.key);
                    cursor.delete();
                }
                cursor.continue();
            };
        }

        return {
            // Resolves the stored Blob (refreshing its lastUsed) or null.
            get: function (key) {
                return run(function (blobs, meta, set) {
                    meta.get(key).onsuccess = function (event) {
                        var entry = event.target.result;
                        if (!entry) { return; }
                        blobs.get(key).onsuccess = function (found) {
                            if (!found.target.result) { return; }
                            set(found.target.result);
                            entry.used = now();
                            meta.put(entry);
                        };
                    };
                });
            },
            put: function (key, blob, category) {
                return run(function (blobs, meta) {
                    blobs.put(blob, key);
                    meta.put({ key: key, size: blob.size, used: now(), category: category || "home" });
                    trim(blobs, meta);
                });
            },
            // Reads many keys in ONE transaction: each(key, blob|null) runs as soon as that key is read (blob refreshes its
            // lastUsed). Resolves true when finished, or null when the store is unavailable (keys not yet reported are unread).
            getMany: function (keys, each) {
                return run(function (blobs, meta, set) {
                    keys.forEach(function (key) {
                        blobs.get(key).onsuccess = function (found) {
                            var blob = found.target.result || null;
                            try { each(key, blob); } catch (error) { /* a consumer's failure must not abort the batch */ }
                            if (!blob) { return; }
                            meta.get(key).onsuccess = function (read) {
                                var entry = read.target.result;
                                if (entry) { entry.used = now(); meta.put(entry); }
                            };
                        };
                    });
                    set(true);
                });
            },
            // One pass over the saved entries, without refreshing them: resolves [{ key, blob, size }] Home first, then library,
            // most recently used first within each (up to maxCount entries and maxBytes in all, skipping any over maxEntryBytes),
            // or null when unavailable.
            preload: function (maxCount, maxBytes, maxEntryBytes) {
                return run(function (blobs, meta, set) {
                    var candidates = [];
                    var found = [];
                    set(found);
                    meta.index("used").openCursor(null, "prev").onsuccess = function (event) {
                        var cursor = event.target.result;
                        if (cursor) {
                            if (cursor.value.size <= maxEntryBytes) { candidates.push(cursor.value); }
                            cursor.continue();
                            return;
                        }
                        var ordered = candidates.filter(function (entry) { return (entry.category || "home") === "home"; })
                            .concat(candidates.filter(function (entry) { return (entry.category || "home") !== "home"; }));
                        var bytes = 0;
                        ordered.slice(0, Math.max(0, maxCount)).some(function (candidate) {
                            if (bytes + candidate.size > maxBytes) { return true; }
                            bytes += candidate.size;
                            var entry = { key: candidate.key, size: candidate.size, blob: null };
                            found.push(entry);
                            blobs.get(entry.key).onsuccess = function (read) { entry.blob = read.target.result || null; };
                            return false;
                        });
                    };
                }).then(function (found) {
                    return found && found.filter(function (entry) { return entry.blob; });
                });
            },
            // The byte budget for later saves; trim() applies a lowered one to what is already stored.
            setLimit: function (bytes) { maxBytes = bytes; },
            trim: function () { return run(trim); },
            // Resolves { home, library } bytes, or null when the store is unavailable.
            usage: function () {
                return run(function (blobs, meta, set) {
                    var total = { home: 0, library: 0 };
                    meta.openCursor().onsuccess = function (event) {
                        var cursor = event.target.result;
                        if (!cursor) { set(total); return; }
                        total[cursor.value.category === "library" ? "library" : "home"] += cursor.value.size;
                        cursor.continue();
                    };
                });
            },
            // Deletes one category's entries and leaves the other.
            removeCategory: function (category) {
                return run(function (blobs, meta) {
                    meta.openCursor().onsuccess = function (event) {
                        var cursor = event.target.result;
                        if (!cursor) { return; }
                        if ((cursor.value.category || "home") === category) { blobs.delete(cursor.value.key); cursor.delete(); }
                        cursor.continue();
                    };
                });
            },
            remove: function (key) {
                return run(function (blobs, meta) { blobs.delete(key); meta.delete(key); });
            },
            clear: function () {
                return run(function (blobs, meta) { blobs.clear(); meta.clear(); });
            }
        };
    }
    return { open: open };
}));
