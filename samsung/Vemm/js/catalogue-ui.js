(function (root) {
    "use strict";
    root.VemmCatalogueUi = {
        create: function (options) {
            function account() {
                var client = options.account();
                if (!client) { throw new Error("Link a Plex account to use Watchlist and catalogue."); }
                return client;
            }
            function openWatchlist(filter, start) {
                filter = filter || "all";
                start = start || 0;
                var generation = options.view("Watchlist", function () { openWatchlist(filter, start); }, "watchlist");
                var filters = options.group(options.screen, "", "page-toolbar");
                ["all", "available", "released"].forEach(function (value) {
                    var choice = options.button(filters, options.translate("Watchlist filter / {filter}", {
                        filter: options.translate(value)
                    }), function () { openWatchlist(value, 0); });
                    choice.setAttribute("aria-pressed", filter === value ? "true" : "false");
                });
                var client;
                try { client = account(); }
                catch (error) { options.status(root.VemmI18n.error(error), true); return; }
                client.watchlist(filter, start).then(function (container) {
                    if (generation !== options.generation()) { return; }
                    if (!Array.isArray(container.Metadata) && Number(container.size) !== 0) {
                        throw new Error("Plex returned an invalid Watchlist.");
                    }
                    var items = container.Metadata || [];
                    var list = options.group(options.screen, "", "catalogue-grid");
                    if (!items.length) { list.appendChild(options.element("p", "empty-state", options.translate("Your Watchlist is empty."))); }
                    items.slice(0, 50).forEach(function (item) {
                        options.tile(list, item, function () {
                            options.visit(function () { openItem(item, true); });
                        }, options.artwork());
                    });
                    if (start) {
                        options.button(options.screen, "Previous page", function () { openWatchlist(filter, Math.max(0, start - 50)); });
                    }
                    if (container.totalSize ? start + items.length < Number(container.totalSize) : items.length >= 50) {
                        options.button(options.screen, "Next page", function () { openWatchlist(filter, start + 50); });
                    }
                    options.status(items.length ? "Watchlist belongs to the linked Plex identity. Choose a title for availability." : "Your Watchlist is empty.");
                    options.focus();
                }).catch(function (error) {
                    if (generation !== options.generation()) { return; }
                    options.status(root.VemmI18n.error(error), true);
                    options.button(options.screen, "Retry", function () { openWatchlist(filter, start); });
                });
            }
            function openItem(item, listed) {
                var generation = options.view("Catalogue details", function () { openItem(item, listed); }, "catalogue-detail");
                var poster = options.tile(options.screen, item, function () {
                    options.visit(function () { options.find(item); });
                }, options.artwork());
                poster.className += " catalogue-poster";
                var title = options.element("h3", "", item.title || options.translate("Untitled"));
                var summary = options.element("p", "synopsis", item.summary || options.translate("No synopsis is available."));
                options.screen.appendChild(title);
                options.screen.appendChild(summary);
                if (item.year) { options.screen.appendChild(options.element("p", "", String(item.year))); }
                (listed === true ? [false] : listed === false ? [true] : [true, false]).forEach(function (add) {
                    options.button(options.screen, add ? "Add to Watchlist" : "Remove from Watchlist", function () {
                        var client;
                        try { client = account(); }
                        catch (error) { options.status(root.VemmI18n.error(error), true); return; }
                        options.confirm(add ? "Add to Watchlist" : "Remove from Watchlist",
                            function () { return client.setWatchlist(item.guid, add); }, function () { openWatchlist("all", 0); });
                    });
                });
                options.button(options.screen, "Find in my libraries", function () {
                    options.visit(function () { options.find(item); });
                });
                options.status("Loading details...");
                options.focus();
                Promise.resolve().then(function () { return account().catalogueDetails(item); }).then(function (details) {
                    if (generation !== options.generation()) { return; }
                    options.status("Catalogue titles are not server media IDs. Licensed Plex streaming is not enabled; choose a matching server version.");
                    title.textContent = details.title || item.title;
                    summary.textContent = details.summary || options.translate("No synopsis is available.");
                }).catch(function (error) {
                    if (generation !== options.generation()) { return; }
                    options.screen.appendChild(options.element("p", "inline-error", root.VemmI18n.error(error)));
                    options.button(options.screen, "Retry details", function () { openItem(item, listed); });
                });
            }
            function openSearch(query, run) {
                var generation = options.view("Discover", function () { openSearch(query, run); }, "catalogue-search");
                var searchUi = root.VemmSearchUi;
                var timer = null;
                var latest = 0;
                var keyboard = searchUi.keyboard({
                    element: options.element, translate: options.translate, label: "Search Discover",
                    hint: "Type a title to search",
                    onChange: function () {
                        if (timer !== null) { clearTimeout(timer); }
                        timer = setTimeout(function () { timer = null; if (options.screen.contains(keyboard.node)) { search(); } }, searchUi.DEBOUNCE);
                    }
                });
                options.screen.appendChild(keyboard.node);
                var results = options.group(options.screen, "", "catalogue-results");
                keyboard.attach(results);
                searchUi.link(keyboard, results);
                function search() {
                    if (timer !== null) { clearTimeout(timer); timer = null; }
                    var text = keyboard.value().trim();
                    var mine = ++latest;
                    results.innerHTML = "";
                    if (!text) { options.status("Enter a title to search."); return; }
                    options.status("Searching...");
                    Promise.resolve().then(function () { return account().searchCatalogue(text); }).then(function (items) {
                        if (generation !== options.generation() || mine !== latest) { return; }
                        var list = options.group(results, "", "catalogue-grid");
                        if (!items.length) { list.appendChild(options.element("p", "empty-state", options.translate("No matching media found."))); }
                        items.forEach(function (item) {
                            options.tile(list, item, function () {
                                options.visit(function () { openItem(item); });
                            }, options.artwork());
                        });
                        options.status(items.length ? "Showing up to 30 catalogue results. Refine the query for more." : "No matching media found.");
                    }).catch(function (error) {
                        if (generation === options.generation() && mine === latest) { options.status(root.VemmI18n.error(error), true); }
                    });
                }
                var restoring = options.restoring();
                options.focus();
                if (!restoring) { keyboard.focus(); }
                if (query) { keyboard.set(query); }
                if (!run) { options.status("Search Plex metadata. Licensed catalogue streaming is not enabled."); return; }
                search();
            }
            return { watchlist: openWatchlist, item: openItem, search: openSearch };
        }
    };
}(this));
