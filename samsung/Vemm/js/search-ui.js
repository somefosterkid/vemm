(function (root) {
    "use strict";
    var ROWS = ["ABCDEFGHIJKL", "MNOPQRSTUVWX", "YZ0123456789"];
    var MEDIA = { movie: "movies", show: "tv", season: "tv", episode: "tv" };

    function words(text) {
        return String(text || "").toLowerCase().split(/[^a-z0-9À-￿]+/).filter(function (word) { return word; });
    }

    // Every query word must start a different title word, in any order: "kn dark" finds "The Dark Knight".
    function score(query, title) {
        var wanted = words(query);
        var have = words(title);
        if (!wanted.length) { return -1; }
        var used = [];
        var ordered = true;
        var last = -1;
        for (var i = 0; i < wanted.length; i += 1) {
            var found = -1;
            for (var j = 0; j < have.length; j += 1) {
                if (used.indexOf(j) === -1 && have[j].indexOf(wanted[i]) === 0) { found = j; break; }
            }
            if (found < 0) { return -1; }
            if (found < last) { ordered = false; }
            last = found;
            used.push(found);
        }
        if (wanted.join(" ") === have.join(" ")) { return 0; }
        if (ordered && used[0] === 0) { return 1; }
        return ordered ? 2 : 3;
    }

    function allowed(mode, type) {
        return mode === "all" || !MEDIA[type] || MEDIA[type] === mode;
    }

    function add(list, seen, key, value) {
        if (key && seen[key]) { return; }
        if (key) { seen[key] = true; }
        list.push(value);
    }

    // sources: [{ container, client, server }] from /hubs/search. Titles that match the query rank first,
    // then people, studios and genres, then episodes; every other server result stays under "related".
    function arrange(sources, mode, query) {
        var out = { titles: [], people: [], tags: [], episodes: [], related: [] };
        var seen = {};
        (sources || []).forEach(function (source) {
            ((source.container && source.container.Hub) || []).forEach(function (hub) {
                var scope = source.server ? source.server.name : "";
                if (hub.type === "actor" || hub.type === "director") {
                    (hub.Directory || []).forEach(function (person) {
                        add(out.people, seen, "p:" + (person.tagKey || person.id || person.tag), { person: person, client: source.client });
                    });
                } else if (hub.type === "studio" || hub.type === "genre") {
                    (hub.Directory || []).forEach(function (tag) {
                        add(out.tags, seen, hub.type + ":" + String(tag.tag).toLowerCase(), { kind: hub.type, tag: tag });
                    });
                } else {
                    (hub.Metadata || []).forEach(function (item, index) {
                        if (!allowed(mode, item.type)) { return; }
                        var entry = { item: item, client: source.client, server: source.server, order: out.titles.length + index };
                        var key = scope + "/" + item.ratingKey;
                        if (item.type === "episode") { add(out.episodes, seen, key, entry); }
                        else if ((item.type === "movie" || item.type === "show") && score(query, item.title) >= 0) {
                            entry.rank = score(query, item.title);
                            add(out.titles, seen, key, entry);
                        } else { add(out.related, seen, key, entry); }
                    });
                }
            });
        });
        out.titles = out.titles.map(function (entry, index) { entry.order = index; return entry; });
        out.titles.sort(function (a, b) { return a.rank - b.rank || String(a.item.title).length - String(b.item.title).length || a.order - b.order; });
        return out;
    }

    // One on-screen keyboard for every search page, laid out Netflix-style: filters and the typed query on top, keys on
// the left, the page's results panel (see attach) on the right. Arrows never wrap; Down from the action row and Right
// from a row's end leave through instance.enter, which also hides the keys so the results get the full width.
    function keyboard(options) {
        var node = options.element("section", "search-keyboard");
        var filterRow = options.element("div", "keyboard-filters");
        var display = options.element("div", "keyboard-display");
        display.setAttribute("role", "textbox");
        display.setAttribute("aria-readonly", "true");
        display.setAttribute("aria-label", options.translate(options.label || "Search"));
        var text = options.element("span", "keyboard-text");
        var hint = options.element("span", "keyboard-hint", options.translate(options.hint || "Type to search"));
        display.appendChild(text);
        display.appendChild(hint);
        var body = options.element("div", "keyboard-body");
        var keys = options.element("div", "keyboard-keys");
        var value = "";
        var grid = [];
        var instance = { node: node, display: display, rows: grid, extras: [] };
        if ((options.extras || []).length) { node.appendChild(filterRow); }
        node.appendChild(display);
        body.appendChild(keys);
        node.appendChild(body);

        function show() {
            text.textContent = value;
            hint.hidden = value !== "";
        }
        function change(next) {
            value = next.slice(0, 200);
            show();
            if (options.onChange) { options.onChange(value); }
        }
        function key(row, label, action, className) {
            var control = options.element("button", "secondary-button keyboard-key" + (className ? " " + className : ""), label);
            control.type = "button";
            control.addEventListener("click", action);
            row.node.appendChild(control);
            row.keys.push(control);
            return control;
        }
        function line() {
            var row = { node: options.element("div", "keyboard-row"), keys: [] };
            keys.appendChild(row.node);
            grid.push(row.keys);
            return row;
        }
        ROWS.forEach(function (letters) {
            var row = line();
            letters.split("").forEach(function (letter) {
                key(row, letter, function () { change(value + letter); });
            });
        });
        var actions = line();
        key(actions, options.translate("Space"), function () { if (value && value.slice(-1) !== " ") { change(value + " "); } }, "keyboard-wide");
        key(actions, options.translate("Delete"), function () { change(value.slice(0, -1)); }, "keyboard-action");
        key(actions, options.translate("Clear"), function () { change(""); }, "keyboard-action");
        var filters = { node: filterRow, keys: [] };
        (options.extras || []).forEach(function (extra) {
            instance.extras.push(key(filters, extra.label, extra.action, "keyboard-extra"));
        });
        // Navigation order: filters (when present) above the letter rows and the action row.
        var nav = filters.keys.length ? [filters.keys].concat(grid) : grid;

        node.addEventListener("keydown", function (event) {
            var code = event.keyCode;
            var active = event.target;
            var row = -1;
            var col = -1;
            nav.forEach(function (line, r) { if (line.indexOf(active) !== -1) { row = r; col = line.indexOf(active); } });
            if (row < 0 || code < 37 || code > 40) { return; }
            event.preventDefault();
            event.stopPropagation();
            if (code === 37 || code === 39) {
                var side = nav[row][col + (code === 37 ? -1 : 1)];
                if (side) { side.focus(); } else if (code === 39 && instance.enter) { instance.enter(); }
            } else if (code === 38) {
                if (row > 0) { nav[row - 1][Math.min(col, nav[row - 1].length - 1)].focus(); }
            } else if (row < nav.length - 1) {
                nav[row + 1][Math.min(col, nav[row + 1].length - 1)].focus();
            } else if (instance.enter) { instance.enter(); }
        });

        // Remote number keys and a USB keyboard still type; Backspace deletes instead of leaving the page.
        function typed(event) {
            if (!node.parentNode || !root.document.body.contains(node)) {
                root.document.removeEventListener("keydown", typed, true);
                return;
            }
            var code = event.keyCode;
            var target = event.target;
            if (event.ctrlKey || event.altKey || event.metaKey || (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA"))) { return; }
            var character = code >= 48 && code <= 57 ? String(code - 48) : code >= 96 && code <= 105 ? String(code - 96) :
                code >= 65 && code <= 90 ? String.fromCharCode(code) : "";
            if (code === 8) { change(value.slice(0, -1)); } else if (character) { change(value + character); } else { return; }
            event.preventDefault();
            event.stopPropagation();
        }
        root.document.addEventListener("keydown", typed, true);

        instance.value = function () { return value; };
        instance.set = function (next) { value = String(next || "").slice(0, 200); show(); };
        instance.focus = function () {
            var target = instance.last && instance.last.parentNode ? instance.last : grid[0][0];
            node.classList.remove("keyboard-collapsed");
            target.focus();
        };
        instance.attach = function (panel) { body.appendChild(panel); };
        instance.collapsed = function () { return node.classList.contains("keyboard-collapsed"); };
        instance.collapse = function () { node.classList.add("keyboard-collapsed"); };
        // Back and Left from the results: show the keys again with focus on the last one used.
        instance.restore = function () {
            if (!instance.collapsed()) { return false; }
            instance.focus();
            return true;
        };
        node.vemmRestore = instance.restore;
        node.addEventListener("focusin", function (event) {
            grid.forEach(function (line) { if (line.indexOf(event.target) !== -1) { instance.last = event.target; } });
        });
        show();
        return instance;
    }

    function visible(container) {
        return Array.prototype.filter.call(container.querySelectorAll("button"), function (control) {
            for (var node = control; node && node !== container.parentNode; node = node.parentNode) {
                if (node.hidden) { return false; }
            }
            return !control.disabled;
        });
    }

    // Down or Right from the keyboard enters the results and hides the keys; Up from the first results row and Left
    // from the first column bring the keyboard back on the last key used.
    function link(instance, container) {
        instance.enter = function () {
            var first = visible(container)[0];
            if (!first) { return; }
            first.focus();
            if (root.document.activeElement === first) { instance.collapse(); }
        };
        container.addEventListener("keydown", function (event) {
            var active = event.target;
            var code = event.keyCode;
            var buttons = visible(container);
            if ((code !== 38 && code !== 37) || !buttons.length || active.tagName !== "BUTTON") { return; }
            var rect = active.getBoundingClientRect();
            if (code === 38) {
                if (rect.top > buttons[0].getBoundingClientRect().top + 8) { return; }
            } else {
                var edge = Math.min.apply(null, buttons.map(function (control) { return control.getBoundingClientRect().left; }));
                if (rect.left > edge + 8) { return; }
            }
            event.preventDefault();
            event.stopPropagation();
            instance.focus();
        });
    }

    root.VemmSearchUi = { link: link, DEBOUNCE: 350, ROWS: ROWS, words: words, score: score, arrange: arrange, keyboard: keyboard };
}(this));
