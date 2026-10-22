(function (root, factory) {
    var product = typeof module === "object" && module.exports && typeof require === "function" ?
        require("./product") : root.VemmProduct;
    var api = factory(product);
    if (typeof module === "object" && module.exports) {
        module.exports = api;
    } else {
        root.PlexApi = api;
    }
}(this, function (product) {
    "use strict";
    var PRODUCT = product && product.name || "Vemm";
    var deviceIdentifier = "tizen-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);

    function clientId() {
        if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
            try {
                var stored = localStorage.getItem("vemm-tizen-device-id");
                if (stored && /^[A-Za-z0-9._-]{8,128}$/.test(stored)) { deviceIdentifier = stored; }
                else { localStorage.setItem("vemm-tizen-device-id", deviceIdentifier); }
            } catch (error) {
                throw new Error("Device identity storage is unavailable. Enable app storage and retry.");
            }
        }
        return deviceIdentifier;
    }

    function isNonNegativeInteger(value) {
        return typeof value === "number" && value >= 0 && Math.floor(value) === value;
    }

    function validateBaseUrl(value) {
        var baseUrl = String(value || "").replace(/\/+$/, "");
        if (!/^https?:\/\/(?:[a-z0-9.-]+|\[[0-9a-f:.]+\])(?::[0-9]{1,5})?$/i.test(baseUrl) ||
                baseUrl.indexOf("@") !== -1) {
            throw new Error("Enter a PMS origin such as https://server.example.invalid:32400.");
        }
        return baseUrl;
    }

    function listFrom(container, field) {
        if (Array.isArray(container[field])) {
            return container[field];
        }
        if (container.size === 0 || container.totalSize === 0) {
            return [];
        }
        throw new Error("PMS response is missing the " + field + " list.");
    }

    // Discover credits name a title by its bare catalogue id, while PMS names it plex://movie/<id>
    // or plex://show/<id>; only the last path segment is the same on both sides.
    function guidTail(value) {
        var text = String(value || "");
        return text.slice(text.lastIndexOf("/") + 1);
    }

    function localCatalogueIndex(items) {
        var index = {};
        (items || []).forEach(function (item) {
            if (!item || (item.type !== "movie" && item.type !== "show") || !item.guid || !item.ratingKey) { return; }
            var tail = guidTail(item.guid);
            if (tail && !Object.prototype.hasOwnProperty.call(index, tail)) { index[tail] = String(item.ratingKey); }
        });
        return index;
    }

    function matchCredit(index, catalogueRatingKey) {
        var tail = guidTail(catalogueRatingKey);
        return tail && index && Object.prototype.hasOwnProperty.call(index, tail) ? index[tail] : null;
    }

    function requestCancelled() {
        var error = new Error("The request was cancelled.");
        error.code = "cancelled";
        return error;
    }

    function requestScope() {
        return {
            revision: 0, pending: [],
            cancel: function () {
                this.revision += 1;
                var active = this.pending.slice();
                this.pending = [];
                active.forEach(function (cancel) { cancel(); });
            }
        };
    }

    function timedFetch(fetchRequest, url, options, scope, maxBytes) {
        var revision = scope ? scope.revision : 0;
        function cancelled() { return requestCancelled(); }
        function register(cancel) { if (scope) { scope.pending.push(cancel); } }
        function unregister(cancel) {
            if (scope) {
                var index = scope.pending.indexOf(cancel);
                if (index !== -1) { scope.pending.splice(index, 1); }
            }
        }
        return new Promise(function (resolve, reject) {
            var deadline = Date.now() + 15000;
            var controller = typeof AbortController === "function" ? new AbortController() : null;
            if (controller) { options.signal = controller.signal; }
            var settled = false;
            function stop(error) {
                if (settled) { return; }
                settled = true;
                clearTimeout(timeout);
                unregister(cancel);
                if (controller) { controller.abort(); }
                reject(error);
            }
            function cancel() { stop(cancelled()); }
            register(cancel);
            var timeout = setTimeout(function () {
                stop(new Error("The request timed out. Check the network and retry."));
            }, 15000);
            Promise.resolve().then(function () {
                if (settled || scope && scope.revision !== revision) { throw cancelled(); }
                return fetchRequest(url, options);
            }).then(function (response) {
                if (settled) { return; }
                settled = true;
                clearTimeout(timeout);
                unregister(cancel);
                if (!response) { resolve(response); return; }
                function body(asBlob) {
                    return new Promise(function (resolveBody, rejectBody) {
                        var reader = null;
                        var done = false;
                        var bodyTimer = setTimeout(function () {
                            fail(new Error("The response body timed out. Check the network and retry."));
                        }, Math.max(0, deadline - Date.now()));
                        function fail(error) {
                            if (done) { return; }
                            done = true;
                            clearTimeout(bodyTimer);
                            unregister(cancelBody);
                            if (controller) { controller.abort(); }
                            if (reader) { reader.cancel().catch(function () {}); }
                            rejectBody(error);
                        }
                        function complete(value) {
                            if (done) { return; }
                            done = true;
                            clearTimeout(bodyTimer);
                            unregister(cancelBody);
                            resolveBody(value);
                        }
                        var limit = maxBytes || 4 * 1024 * 1024;
                        function cancelBody() { fail(cancelled()); }
                        register(cancelBody);
                        try {
                            if (scope && scope.revision !== revision) { throw cancelled(); }
                            var length = response.headers && response.headers.get("Content-Length");
                            if (length && Number(length) > limit) { throw new Error("Response exceeds the metadata/artwork limit."); }
                            if (response.body && typeof response.body.getReader === "function" &&
                                    (asBlob || typeof TextDecoder === "function")) {
                                reader = response.body.getReader();
                                var decoder = asBlob ? null : new TextDecoder("utf-8");
                                var size = 0;
                                var chunks = [];
                                var text = "";
                                function read() {
                                    if (done) { return; }
                                    if (Date.now() >= deadline) { fail(new Error("The response body timed out.")); return; }
                                    reader.read().then(function (chunk) {
                                        if (done) { return; }
                                        if (chunk.done) {
                                            complete(asBlob ? new Blob(chunks, {
                                                type: response.headers ? response.headers.get("Content-Type") || "" : ""
                                            }) : text + decoder.decode());
                                            return;
                                        }
                                        size += chunk.value.byteLength;
                                        if (size > limit) { fail(new Error("Response exceeds the metadata/artwork limit.")); return; }
                                        if (asBlob) { chunks.push(chunk.value); }
                                        else { text += decoder.decode(chunk.value, { stream: true }); }
                                        read();
                                    }).catch(fail);
                                }
                                read();
                            } else if (!response.text && response.json && !asBlob) {
                                // Injected test transports may supply already-decoded fixtures.
                                Promise.resolve().then(function () { return response.json(); }).then(function (value) {
                                    var text = JSON.stringify(value);
                                    if (text.length > limit) { throw new Error("Response exceeds the metadata limit."); }
                                    complete(text);
                                }).catch(fail);
                            } else {
                                throw new Error("Bounded response streaming is unavailable. This TV runtime is not supported yet.");
                            }
                        } catch (error) { fail(error); }
                    });
                }
                resolve({
                    ok: response.ok, status: response.status, url: String(response.url || ""),
                    text: function () { return body(false); },
                    blob: function () { return body(true); }
                });
            }, stop);
        });
    }

    function readJson(response) {
        return Promise.resolve().then(function () {
            if (response.text) {
                return response.text().then(function (body) {
                    if (body.length > 4 * 1024 * 1024) { throw new Error("Response exceeds the metadata limit."); }
                    return JSON.parse(body);
                });
            }
            return response.json();
        }).catch(function (error) {
            if (error instanceof SyntaxError) { throw new Error("Plex returned an invalid JSON response."); }
            throw error;
        });
    }

    function profileImagePath(path) {
        return /^https:\/\/plex\.tv\/users\/[a-zA-Z0-9_-]+\/avatar(?:\?c=[a-zA-Z0-9_.-]+)?$/.test(String(path || ""));
    }

    function profileImageTarget(url) {
        url = String(url || "");
        return profileImagePath(url) ||
            /^https:\/\/assets\.plex\.tv\/avatars\/[A-Za-z0-9_-]+(?:\.(?:png|jpe?g|gif|webp)?)?(?:\?[^#]*)?$/i.test(url);
    }

    function createAccountClient(options) {
        options = options || {};
        var token = String(options.token || "");
        var fetchRequest = options.fetch || (typeof fetch === "function" ? fetch : null);
        var identifier = options.clientIdentifier || clientId();
        var scope = requestScope();
        if (!token || !fetchRequest) {
            throw new Error("A linked Plex session is required.");
        }
        function request(path, method, body) {
            var revision = scope.revision;
            return Promise.resolve().then(function () {
                if (method !== "POST" && revision !== scope.revision) { throw requestCancelled(); }
                return timedFetch(fetchRequest, "https://plex.tv" + path, {
                    method: method || "GET",
                    credentials: "omit",
                    redirect: "error",
                    headers: {
                        Accept: "application/json",
                        "Content-Type": "application/x-www-form-urlencoded",
                        "X-Plex-Token": token,
                        "X-Plex-Client-Identifier": identifier,
                        "X-Plex-Product": PRODUCT
                    },
                    body: body
                }, method === "POST" ? null : scope);
            }).then(function (response) {
                if (!response.ok) {
                    var error = new Error(response.status === 401 ?
                        "Plex refused this session or profile PIN. Sign in again or check the PIN." :
                        "Plex request failed (HTTP " + response.status + "). Retry.");
                    error.status = response.status;
                    error.scope = "account";
                    throw error;
                }
                return readJson(response);
            });
        }
        function discover(tagKey, suffix) {
            if (!/^[0-9a-f]{24}$/i.test(String(tagKey || ""))) {
                return Promise.reject(new Error("This person has no Plex catalogue identifier."));
            }
            return timedFetch(fetchRequest, "https://discover.provider.plex.tv/library/people/" +
                tagKey + (suffix || ""), {
                    credentials: "omit", redirect: "error",
                    headers: { Accept: "application/json", "X-Plex-Token": token, "X-Plex-Client-Identifier": identifier }
                }, scope).then(function (response) {
                    if (!response.ok) { throw new Error("Plex person information failed (HTTP " + response.status + ")."); }
                    return readJson(response);
                }).then(function (payload) {
                    if (!payload.MediaContainer) { throw new Error("Plex returned an invalid person-information container."); }
                    return payload.MediaContainer;
                });
        }
        function cloud(host, path, method, query, empty) {
            if (["discover.provider.plex.tv", "metadata.provider.plex.tv"].indexOf(host) === -1 ||
                    !/^\/[A-Za-z0-9/_-]+$/.test(path)) {
                return Promise.reject(new Error("Invalid Plex catalogue endpoint."));
            }
            var target = "https://" + host + path;
            if (query) {
                target += "?" + Object.keys(query).map(function (key) {
                    return encodeURIComponent(key) + "=" + encodeURIComponent(query[key]);
                }).join("&");
            }
            return timedFetch(fetchRequest, target, {
                method: method || "GET", credentials: "omit", redirect: "error",
                headers: { Accept: "application/json", "X-Plex-Token": token,
                    "X-Plex-Client-Identifier": identifier, "X-Plex-Product": PRODUCT,
                    "X-Plex-Language": options.language || "en" }
            }, method && method !== "GET" ? null : scope).then(function (response) {
                if (!response.ok) {
                    var error = new Error("Plex catalogue request failed (HTTP " + response.status + ").");
                    error.status = response.status; error.scope = "account";
                    throw error;
                }
                if (empty) { return {}; }
                return readJson(response).then(function (payload) {
                    if (!payload.MediaContainer) { throw new Error("Plex returned an invalid catalogue container."); }
                    return payload.MediaContainer;
                });
            });
        }
        function profilePreferences(method, query) {
            var target = "https://clients.plex.tv/api/v2/user/profile";
            var keys = Object.keys(query || {});
            if (keys.length) {
                target += "?" + keys.map(function (key) {
                    return encodeURIComponent(key) + "=" + encodeURIComponent(query[key]);
                }).join("&");
            }
            return timedFetch(fetchRequest, target, {
                method: method, credentials: "omit", redirect: "error",
                headers: { Accept: "application/json", "X-Plex-Token": token,
                    "X-Plex-Client-Identifier": identifier, "X-Plex-Product": PRODUCT }
            }, method === "GET" ? scope : null).then(function (response) {
                if (!response.ok) {
                    var error = new Error(response.status === 401 || response.status === 403 ?
                        "Plex refused this profile. Sign in to this Plex profile again to edit its account preferences." :
                        "Plex account preferences are unavailable (HTTP " + response.status + ").");
                    error.status = response.status; error.scope = "account";
                    throw error;
                }
                return method === "GET" ? readJson(response) : {};
            });
        }
        function catalogueId(guid) {
            var match = /^plex:\/\/(?:movie|show)\/([0-9a-f]{24})$/i.exec(String(guid || ""));
            if (!match) { throw new Error("This item has no valid Plex catalogue identifier."); }
            return match[1];
        }
        return {
            cancelRequests: function () { scope.cancel(); },
            image: function (path) {
                if (!profileImagePath(path)) { return Promise.reject(new Error("Invalid Plex profile artwork.")); }
                return timedFetch(fetchRequest, path, {
                    credentials: "omit", redirect: "follow", headers: { Accept: "image/*" }
                }, scope).then(function (response) {
                    if (!profileImageTarget(response.url)) { throw new Error("Invalid Plex profile artwork."); }
                    if (!response.ok) { throw new Error("Profile artwork is unavailable (HTTP " + response.status + ")."); }
                    return response.blob();
                });
            },
            accountPreferences: function () { return profilePreferences("GET"); },
            saveAccountPreferences: function (query) {
                var allowed = ["autoSelectAudio", "defaultAudioLanguage", "defaultSubtitleLanguage",
                    "autoSelectSubtitle", "defaultSubtitleForced"];
                if (!query || typeof query !== "object" || Object.keys(query).some(function (key) {
                    return allowed.indexOf(key) === -1 || typeof query[key] !== "string";
                })) {
                    return Promise.reject(new Error("Invalid account preference."));
                }
                if (!Object.keys(query).length) { return Promise.resolve({}); }
                return profilePreferences("PUT", query);
            },
            watchlist: function (filter, start) {
                if (["all", "available", "released"].indexOf(filter) === -1 || !isNonNegativeInteger(start || 0)) {
                    return Promise.reject(new Error("Invalid Watchlist filter or page."));
                }
                return cloud("discover.provider.plex.tv", "/library/sections/watchlist/" + filter, "GET", {
                    "X-Plex-Container-Start": start || 0, "X-Plex-Container-Size": 50
                });
            },
            setWatchlist: function (guid, add) {
                if (typeof add !== "boolean") { return Promise.reject(new Error("Choose add or remove Watchlist.")); }
                return cloud("discover.provider.plex.tv", "/actions/" + (add ? "addToWatchlist" : "removeFromWatchlist"),
                    "PUT", { ratingKey: catalogueId(guid) }, true);
            },
            catalogueState: function (guid) {
                return cloud("metadata.provider.plex.tv", "/library/metadata/" + catalogueId(guid) + "/userState");
            },
            searchCatalogue: function (query) {
                if (typeof query !== "string" || !query.trim() || query.length > 200) {
                    return Promise.reject(new Error("Enter a catalogue search of 1 to 200 characters."));
                }
                return cloud("discover.provider.plex.tv", "/library/search", "GET", {
                    query: query.trim(), limit: 30, searchTypes: "movies,tv",
                    searchProviders: "discover", includeMetadata: 1
                }).then(function (container) {
                    if (!Array.isArray(container.SearchResults)) { throw new Error("Plex returned invalid catalogue search results."); }
                    var items = [];
                    container.SearchResults.forEach(function (group) {
                        if (group.id !== "external") { return; }
                        if (!Array.isArray(group.SearchResult)) { throw new Error("Plex returned an invalid catalogue search group."); }
                        group.SearchResult.forEach(function (result) {
                            if (result.Metadata && ["movie", "show"].indexOf(result.Metadata.type) !== -1) {
                                items.push(result.Metadata);
                            }
                        });
                    });
                    return items.slice(0, 30);
                });
            },
            catalogueDetails: function (item) {
                var id = catalogueId(item.guid);
                if (item.key !== "/library/metadata/" + id) {
                    return Promise.reject(new Error("Plex returned an invalid catalogue detail path."));
                }
                return cloud("metadata.provider.plex.tv", item.key, "GET", { includeUserState: 1 }).then(function (container) {
                    var items = listFrom(container, "Metadata");
                    if (!items.length || items[0].guid && items[0].guid !== item.guid) {
                        throw new Error("Plex returned mismatched catalogue details.");
                    }
                    return items[0];
                });
            },
            personProfile: function (tagKey) { return discover(tagKey); },
            personCredits: function (tagKey) {
                return discover(tagKey, "/credits").then(function (container) {
                    if (!Array.isArray(container.CreditGroup)) { throw new Error("Plex returned an invalid filmography."); }
                    return container.CreditGroup;
                });
            },
            getProfiles: function () {
                return request("/api/v2/home/users").then(function (result) {
                    if (!result || !Array.isArray(result.users)) {
                        throw new Error("Plex returned an invalid profile list.");
                    }
                    return result.users;
                });
            },
            switchProfile: function (uuid, pin) {
                if (!/^[a-zA-Z0-9-]+$/.test(String(uuid || "")) ||
                        (pin && !/^[0-9]{4}$/.test(pin))) {
                    return Promise.reject(new Error("Select a valid profile and enter its four-digit PIN."));
                }
                return request("/api/v2/home/users/" + encodeURIComponent(uuid) + "/switch",
                    "POST", pin ? "pin=" + encodeURIComponent(pin) : "").then(function (result) {
                    if (!result || typeof result.authToken !== "string" || !result.authToken) {
                        throw new Error("Plex did not authorize the selected profile.");
                    }
                    return result.authToken;
                });
            },
            getServers: function () {
                return request("/api/v2/resources?includeHttps=1&includeRelay=1&includeIPv6=1").then(function (result) {
                    if (!Array.isArray(result)) {
                        throw new Error("Plex returned an invalid server list.");
                    }
                    return result.filter(function (resource) {
                        return resource && typeof resource.clientIdentifier === "string" &&
                            resource.clientIdentifier && ((typeof resource.provides === "string" &&
                            resource.provides.split(",").indexOf("server") !== -1) ||
                            // plex.tv can list a live PMS as provides="sync"; selectServer still
                            // verifies the machine identifier before any library request.
                            resource.product === "Plex Media Server");
                    }).map(function (resource) {
                        return {
                            id: resource.clientIdentifier,
                            name: resource.name || "Plex Media Server",
                            owned: resource.owned === true,
                            token: resource.accessToken || "",
                            connections: (Array.isArray(resource.connections) ? resource.connections : [])
                                .filter(function (connection) {
                                    try {
                                        if (!connection || typeof connection.uri !== "string") { return false; }
                                        validateBaseUrl(connection.uri);
                                        return /^https:\/\//.test(connection.uri);
                                    } catch (error) {
                                        return false;
                                    }
                                }).sort(function (a, b) {
                                    return Number(a.relay === true) - Number(b.relay === true) ||
                                        Number(b.local === true) - Number(a.local === true);
                                })
                        };
                    });
                });
            }
        };
    }

    var LAST_CONNECTION_KEY = "vemm-tizen-last-connection";

    function connectionStorage(options) {
        if (options.storage) { return options.storage; }
        try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (error) { return null; }
    }

    // Only the URI that last worked for each server id is kept; never a token.
    function lastConnections(storage) {
        try {
            var map = JSON.parse(storage.getItem(LAST_CONNECTION_KEY));
            return map && typeof map === "object" && !Array.isArray(map) ? map : {};
        } catch (error) { return {}; }
    }

    function selectServer(server, options) {
        options = options || {};
        var index = 0;
        var storage = connectionStorage(options);
        var remembered = storage && server.id ? lastConnections(storage)[server.id] : null;
        var order = server.connections || [];
        // The address that worked last time goes first; the advertised order follows, so a changed network still falls back.
        var first = order.filter(function (connection) { return connection.uri === remembered; })[0];
        if (first) { order = [first].concat(order.filter(function (connection) { return connection !== first; })); }
        function remember(uri) {
            if (!storage || !server.id) { return; }
            try {
                var map = lastConnections(storage);
                if (map[server.id] === uri) { return; }
                map[server.id] = uri;
                storage.setItem(LAST_CONNECTION_KEY, JSON.stringify(map));
            } catch (error) { /* a full or blocked store only costs the head start */ }
        }
        function probe() {
            if (!server.id || !server.token || index >= order.length) {
                var unavailable = new Error("This server is unavailable. Check PMS and retry.");
                unavailable.code = "unavailable";
                return Promise.reject(unavailable);
            }
            var connection = order[index++];
            var client;
            try {
                if (!/^https:\/\//.test(connection.uri)) { return probe(); }
                client = createClient({ baseUrl: connection.uri, token: server.token, fetch: options.fetch });
            } catch (error) { return probe(); }
            if (options.onClient && options.onClient(client) === false) { return Promise.reject(requestCancelled()); }
            if (options.onAttempt) {
                options.onAttempt({ index: index, total: order.length, relay: connection.relay === true });
            }
            return client.identity().then(function (identity) {
                if (identity.machineIdentifier !== server.id) {
                    var mismatch = new Error("Server identity mismatch. Connection refused.");
                    mismatch.code = "identity-mismatch";
                    throw mismatch;
                }
                remember(connection.uri);
                return { client: client, relay: connection.relay === true };
            }).catch(function (error) {
                if (error.status === 401 || error.status === 403 || error.code === "identity-mismatch" || error.code === "cancelled") {
                    throw error;
                }
                return probe();
            });
        }
        return probe();
    }

    // Plex rating entries: image "imdb://image.rating", "rottentomatoes://image.rating.ripe|rotten" (critic) or
    // ".upright|spilled" (audience), "themoviedb://image.rating"; values are 0-10.
    var RATING_SOURCES = ["rt_critic", "rt_audience", "imdb", "tmdb"];

    function ratingSource(image, type) {
        image = String(image || "");
        if (image.indexOf("imdb://") === 0) { return { source: "imdb" }; }
        if (image.indexOf("themoviedb://") === 0) { return { source: "tmdb" }; }
        if (image.indexOf("rottentomatoes://") === 0) {
            var critic = type === "critic" || /\.(ripe|rotten)$/.test(image);
            return { source: critic ? "rt_critic" : "rt_audience", fresh: /\.(ripe|upright)$/.test(image) ? true :
                /\.(rotten|spilled)$/.test(image) ? false : null };
        }
        return null;
    }

    // The scores Plex has for an item, in a fixed order; "enabled" limits them to those sources.
    function ratingBadges(item, enabled) {
        item = item || {};
        var entries = Array.isArray(item.Rating) && item.Rating.length ? item.Rating : [
            { image: item.ratingImage, value: item.rating, type: "critic" },
            { image: item.audienceRatingImage, value: item.audienceRating, type: "audience" }
        ];
        var found = {};
        entries.forEach(function (entry) {
            var value = entry && typeof entry.value === "number" ? entry.value : NaN;
            var info = isFinite(value) ? ratingSource(entry.image, entry.type) : null;
            if (!info || found[info.source]) { return; }
            found[info.source] = { source: info.source, value: value, fresh: info.fresh === undefined ? null : info.fresh,
                text: info.source === "imdb" ? value.toFixed(1) + "/10" : Math.round(value * 10) + "%" };
        });
        return RATING_SOURCES.filter(function (source) {
            return found[source] && (!enabled || enabled.indexOf(source) !== -1);
        }).map(function (source) { return found[source]; });
    }

    // The library setting that picks the ratings source: an id like /rating/i that offers enumValues "0:Label|1:Label".
    function ratingPref(settings) {
        var match = (Array.isArray(settings) ? settings : []).filter(function (setting) {
            return setting && /rating/i.test(String(setting.id || "")) && typeof setting.enumValues === "string" && setting.enumValues;
        })[0];
        if (!match) { return null; }
        var options = match.enumValues.split("|").map(function (part) {
            var at = part.indexOf(":");
            return at > 0 ? { value: part.slice(0, at), label: part.slice(at + 1) } : null;
        }).filter(Boolean);
        if (!options.length) { return null; }
        var value = match.value !== undefined && match.value !== null ? match.value : match.default;
        return { id: String(match.id), label: match.label || match.id, value: String(value), options: options };
    }

    function createAuthClient(options) {
        options = options || {};
        var fetchRequest = options.fetch || (typeof fetch === "function" ? fetch : null);
        var now = options.now || Date.now;
        var clientIdentifier = String(options.clientIdentifier || clientId());
        var rootUrl = "https://plex.tv";
        var scope = requestScope();
        if (!fetchRequest) {
            throw new Error("This runtime does not provide fetch.");
        }
        if (!/^[A-Za-z0-9._-]{8,128}$/.test(clientIdentifier)) {
            throw new Error("The Plex client identifier is invalid.");
        }

        function request(url, method) {
            var revision = scope.revision;
            return Promise.resolve().then(function () {
                if (revision !== scope.revision) { throw requestCancelled(); }
                return timedFetch(fetchRequest, url, {
                    method: method,
                    credentials: "omit",
                    redirect: "error",
                    headers: {
                        Accept: "application/json",
                        "X-Plex-Client-Identifier": clientIdentifier,
                        "X-Plex-Product": PRODUCT,
                        "X-Plex-Version": "0.2.2",
                        "X-Plex-Platform": "Tizen"
                    }
                }, scope);
            }).catch(function (error) {
                if (error.code === "cancelled") { throw error; }
                throw new Error("Could not reach Plex. Check the network and try again.");
            }).then(function (response) {
                if (!response || typeof response.status !== "number") {
                    throw new Error("Plex returned an invalid authorization response.");
                }
                if (!response.ok) {
                    if (response.status === 404) {
                        return { status: "expired" };
                    }
                    throw new Error("Plex authorization request failed (HTTP " + response.status + ").");
                }
                return Promise.resolve().then(function () {
                    return readJson(response);
                }).catch(function () {
                    throw new Error("Plex returned an invalid authorization response.");
                }).then(function (payload) {
                    if (!payload || typeof payload !== "object") {
                        throw new Error("Plex returned an invalid authorization response.");
                    }
                    return payload;
                });
            });
        }

        return {
            cancelRequests: function () { scope.cancel(); },
            startAuthorization: function () {
                return request(rootUrl + "/api/v2/pins?strong=false", "POST").then(function (pin) {
                    var id = pin.id;
                    var code = typeof pin.code === "string" ? pin.code : "";
                    var expiry = pin.expiresAt ? Date.parse(pin.expiresAt) : NaN;
                    if (!(typeof expiry === "number" && isFinite(expiry)) && typeof pin.expiresIn === "number" && pin.expiresIn > 0) {
                        expiry = now() + pin.expiresIn * 1000;
                    }
                    if (!/^[0-9]+$/.test(String(id)) || !/^[A-Z0-9]{4,12}$/.test(code) ||
                            !(typeof expiry === "number" && isFinite(expiry)) || expiry <= now()) {
                        throw new Error("Plex returned an invalid sign-in code.");
                    }
                    return {
                        id: String(id),
                        code: code,
                        qr: typeof pin.qr === "string" && /^https:\/\/plex\.tv\//.test(pin.qr) ? pin.qr :
                            "https://plex.tv/api/v2/pins/qr/" + code,
                        linkUrl: "https://plex.tv/link",
                        expiresAt: expiry
                    };
                });
            },
            pollAuthorization: function (pin) {
                if (!pin || !/^[0-9]+$/.test(String(pin.id || "")) ||
                        !/^[A-Z0-9]{4,12}$/.test(String(pin.code || "")) ||
                        !(typeof pin.expiresAt === "number" && isFinite(pin.expiresAt))) {
                    return Promise.reject(new Error("The Plex sign-in request is invalid."));
                }
                if (now() >= pin.expiresAt) {
                    return Promise.resolve({ status: "expired" });
                }
                var url = rootUrl + "/api/v2/pins/" + encodeURIComponent(pin.id) +
                    "?code=" + encodeURIComponent(pin.code);
                return request(url, "GET").then(function (result) {
                    var state = String(result.status || result.state || "").toLowerCase();
                    if (state === "denied" || state === "rejected") {
                        return { status: "denied" };
                    }
                    if (state === "expired" || result.expired === true) {
                        return { status: "expired" };
                    }
                    if (typeof result.authToken === "string" && result.authToken.length > 0) {
                        return { status: "linked", token: result.authToken };
                    }
                    return { status: "pending" };
                });
            }
        };
    }

    function createClient(options) {
        options = options || {};
        var baseUrl = validateBaseUrl(options.baseUrl);
        var token = String(options.token || "");
        var fetchRequest = options.fetch || (typeof fetch === "function" ? fetch : null);
        var scope = requestScope();
        if (!fetchRequest) {
            throw new Error("This runtime does not provide fetch.");
        }

        function get(path, method, query, allowEmpty) {
            var revision = scope.revision;
            var headers = {
                Accept: "application/json"
            };
            if (token) {
                headers["X-Plex-Token"] = token;
            }
            headers["X-Plex-Client-Identifier"] = options.clientIdentifier || clientId();
            headers["X-Plex-Product"] = PRODUCT;
            headers["X-Plex-Version"] = "0.2.2";
            headers["X-Plex-Platform"] = "Tizen";
            headers["X-Plex-Device"] = "TV";
            headers["X-Plex-Device-Name"] = "Samsung TV";
            var target = baseUrl + path;
            if (query) {
                target += (path.indexOf("?") === -1 ? "?" : "&") + Object.keys(query).map(function (key) {
                    return encodeURIComponent(key) + "=" + encodeURIComponent(query[key]);
                }).join("&");
            }
            return Promise.resolve().then(function () {
                if (!allowEmpty && (!method || method === "GET") && revision !== scope.revision) { throw requestCancelled(); }
                return timedFetch(fetchRequest, target, {
                method: method || "GET",
                credentials: "omit",
                redirect: "error",
                headers: headers
                }, allowEmpty || method && method !== "GET" ? null : scope);
            }).catch(function (error) {
                if (error.code === "cancelled") { throw error; }
                throw new Error("The server is unreachable. Check your network and retry.");
            }).then(function (response) {
                if (!response || typeof response.status !== "number") {
                    throw new Error("PMS returned an invalid HTTP response.");
                }
                if (!response.ok) {
                    var error = new Error("PMS request failed with HTTP " + response.status + ".");
                    error.status = response.status;
                    error.scope = "server";
                    throw error;
                }
                if (allowEmpty) { return { MediaContainer: {} }; }
                return readJson(response);
            }).then(function (payload) {
                if (!payload || !payload.MediaContainer ||
                        typeof payload.MediaContainer !== "object") {
                    throw new Error("PMS response did not contain a MediaContainer.");
                }
                return payload.MediaContainer;
            });
        }

        function key(value) {
            if (!/^[0-9]+$/.test(String(value || ""))) {
                throw new Error("Plex returned an invalid media identifier.");
            }
            return String(value);
        }

        function localPath(value) {
            if (typeof value !== "string" || value.charAt(0) !== "/" ||
                    value.charAt(1) === "/" || /[\\?#\r\n]/.test(value) || value.indexOf("..") !== -1) {
                throw new Error("Plex returned an invalid local resource path.");
            }
            return value;
        }

        return {
            cancelRequests: function () { scope.cancel(); },
            request: get,
            identity: function () { return get("/identity"); },
            getMetadata: function (id) {
                return get("/library/metadata/" + key(id), "GET", {
                    includeChapters: 1, includeMarkers: 1, includeExtras: 1, includeRelated: 1, includeOnDeck: 1
                }).then(function (container) {
                    var metadata = listFrom(container, "Metadata");
                    if (!metadata.length) { throw new Error("This item is no longer available."); }
                    return metadata[0];
                });
            },
            getChildren: function (id, start) {
                return get("/library/metadata/" + key(id) + "/children", "GET", {
                    "X-Plex-Container-Start": start || 0, "X-Plex-Container-Size": 50
                });
            },
            getFirstEpisode: function (id) {
                return get("/library/metadata/" + key(id) + "/allLeaves", "GET", {
                    "X-Plex-Container-Start": 0, "X-Plex-Container-Size": 50
                }).then(function (container) {
                    var episodes = listFrom(container, "Metadata");
                    if (!episodes.length || episodes[0].type !== "episode") {
                        throw new Error("This show has no available episodes.");
                    }
                    key(episodes[0].ratingKey);
                    return episodes[0];
                });
            },
            findGuid: function (section, guid) {
                if (!/^plex:\/\/(?:movie|show)\/[0-9a-f]{24}$/i.test(String(guid || ""))) {
                    return Promise.reject(new Error("Invalid Plex catalogue GUID."));
                }
                return get("/library/sections/" + key(section) + "/all", "GET", {
                    guid: guid, includeGuids: 1, "X-Plex-Container-Size": 50
                }).then(function (container) {
                    return listFrom(container, "Metadata").filter(function (item) {
                        return item.guid === guid || (item.Guid || []).some(function (entry) { return entry.id === guid; });
                    });
                });
            },
            getTracks: function (id, playlist) {
                var tracks = [];
                function page(start) {
                    return get(playlist ? "/playlists/" + key(id) + "/items" : "/library/metadata/" + key(id) + "/children", "GET", {
                        "X-Plex-Container-Start": start, "X-Plex-Container-Size": 50
                    }).then(function (container) {
                        var items = listFrom(container, "Metadata");
                        if (items.some(function (item) { return item.type !== "track"; })) {
                            throw new Error("Choose an album containing tracks.");
                        }
                        tracks = tracks.concat(items);
                        if (tracks.length > 200 || Number(container.totalSize) > 200) {
                            throw new Error("This album exceeds the 200-track queue limit. Choose individual tracks.");
                        }
                        if (start + items.length < container.totalSize) {
                            if (!items.length) { throw new Error("Plex returned an incomplete album."); }
                            return page(start + items.length);
                        }
                        if (!tracks.length) { throw new Error("This album has no available tracks."); }
                        return tracks;
                    });
                }
                return page(0);
            },
            getPlaylists: function (start) {
                return get("/playlists", "GET", { "X-Plex-Container-Start": start || 0, "X-Plex-Container-Size": 50 });
            },
            getPlaylist: function (id) {
                return get("/playlists/" + key(id)).then(function (container) {
                    var playlists = listFrom(container, "Metadata");
                    if (!playlists.length) { throw new Error("This playlist is no longer available."); }
                    return playlists[0];
                });
            },
            getPlaylistItems: function (id, start) {
                return get("/playlists/" + key(id) + "/items", "GET", { "X-Plex-Container-Start": start || 0, "X-Plex-Container-Size": 50 });
            },
            // A server-side video queue over the playlist (shuffled by the server when asked), starting at one item.
            createPlaylistPlayQueue: function (machineId, playlistId, shuffle, firstRatingKey) {
                if (!/^[0-9A-Za-z_-]{1,80}$/.test(String(machineId || ""))) {
                    return Promise.reject(new Error("The server identity is invalid."));
                }
                var query = { type: "video", playlistID: key(playlistId), shuffle: shuffle ? 1 : 0, repeat: 0, continuous: 0 };
                if (firstRatingKey) { query.key = "/library/metadata/" + key(firstRatingKey); }
                return get("/playQueues", "POST", query).then(function (container) {
                    var id = String(container.playQueueID || "");
                    var selected = String(container.playQueueSelectedItemID || "");
                    if (!/^[1-9][0-9]*$/.test(id) || !/^[1-9][0-9]*$/.test(selected)) {
                        throw new Error("Plex returned an invalid play queue.");
                    }
                    return { id: id, itemId: selected, items: listFrom(container, "Metadata"), total: Number(container.playQueueTotalCount) || 0 };
                });
            },
            // The items of a play queue around one of its items (20 on each side).
            getPlayQueueItems: function (queueId, center) {
                return get("/playQueues/" + key(queueId), "GET", { center: key(center), window: 20 }).then(function (container) {
                    return listFrom(container, "Metadata");
                });
            },
            getCollectionItems: function (id, start) {
                return get("/library/collections/" + key(id) + "/children", "GET", {
                    "X-Plex-Container-Start": start || 0, "X-Plex-Container-Size": 50
                });
            },
            getRelated: function (id) { return get("/hubs/metadata/" + key(id) + "/related"); },
            nextEpisode: function (item) {
                if (item.type !== "episode" || !item.grandparentRatingKey) { return Promise.resolve(null); }
                var found = false;
                function page(start) {
                    if (start >= 2000) {
                        return Promise.reject(new Error("This series exceeds the next-episode lookup limit. Choose the next episode from its season."));
                    }
                    return get("/library/metadata/" + key(item.grandparentRatingKey) + "/allLeaves", "GET", {
                        "X-Plex-Container-Start": start, "X-Plex-Container-Size": 50
                    }).then(function (container) {
                        var items = listFrom(container, "Metadata");
                        for (var i = 0; i < items.length; i += 1) {
                            if (found) { return items[i]; }
                            if (String(items[i].ratingKey) === String(item.ratingKey)) { found = true; }
                        }
                        if (items.length && start + items.length < container.totalSize) {
                            return page(start + items.length);
                        }
                        return null;
                    });
                }
                return page(0);
            },
            getPerson: function (section, personId, start) {
                return get("/library/people/" + key(personId) + "/media", "GET", {
                    "X-Plex-Container-Size": 50, "X-Plex-Container-Start": start || 0
                });
            },
            personLibraryIndex: function (personId) {
                var index = {};
                var limit = 10000;
                var self = this;
                function page(start) {
                    return self.getPerson(null, personId, start).then(function (container) {
                        var rows = listFrom(container, "Metadata");
                        if (rows.length > 50 || container.offset !== undefined && Number(container.offset) !== start) {
                            throw new Error("Plex returned an invalid person-library page.");
                        }
                        var entries = localCatalogueIndex(rows);
                        Object.keys(entries).forEach(function (guid) {
                            if (!Object.prototype.hasOwnProperty.call(index, guid)) { index[guid] = entries[guid]; }
                        });
                        var next = start + rows.length;
                        var total = container.totalSize === undefined || container.totalSize === null ?
                            NaN : Number(container.totalSize);
                        var more = isFinite(total) ? next < total : rows.length === 50;
                        if (more && !rows.length) { throw new Error("Plex returned an incomplete person-library page."); }
                        if (more && next < limit) {
                            return page(next);
                        }
                        return { index: index, complete: !more };
                    });
                }
                return page(0);
            },
            search: function (query) {
                if (!String(query || "").trim() || String(query).length > 200) {
                    return Promise.reject(new Error("Enter a search of 1 to 200 characters."));
                }
                return get("/hubs/search", "GET", { query: query, limit: 50, includeCollections: 1, includeExternalMedia: 0 });
            },
            getFilters: function (section) { return get("/library/sections/" + key(section) + "/filters"); },
            getSorts: function (section) { return get("/library/sections/" + key(section) + "/sorts"); },
            getBrowseMenus: function (section, type) {
                return get("/library/sections/" + key(section) + "/all", "GET", {
                    includeMeta: 1, type: type || 1, "X-Plex-Container-Size": 0
                });
            },
            getFilterValues: function (section, path) {
                var prefix = "/library/sections/" + key(section) + "/";
                var target = path.charAt(0) === "/" ? path : prefix + path;
                localPath(target);
                if (target.indexOf(prefix) !== 0) { return Promise.reject(new Error("Invalid library filter.")); }
                return get(target);
            },
            getLetters: function (section, filters) {
                return get("/library/sections/" + key(section) + "/firstCharacter", "GET",
                    filters && Object.keys(filters).length ? filters : undefined);
            },
            getCollections: function (section, start) {
                if (!isNonNegativeInteger(start || 0)) { return Promise.reject(new Error("Invalid collection page.")); }
                return get("/library/sections/" + key(section) + "/collections", "GET", {
                    "X-Plex-Container-Start": start || 0, "X-Plex-Container-Size": 50
                });
            },
            image: function (path, size) {
                if (!profileImagePath(path) && !/^https:\/\/(?:metadata-static\.plex\.tv|image\.tmdb\.org)\//.test(path)) { localPath(path); }
                var width = size && size.width > 0 && size.width <= 1920 ? Math.round(size.width) : 240;
                var height = size && size.height > 0 && size.height <= 1080 ? Math.round(size.height) : 360;
                return timedFetch(fetchRequest, baseUrl + "/photo/:/transcode?width=" + width + "&height=" + height + "&minSize=1&url=" +
                    encodeURIComponent(path), {
                        credentials: "omit", redirect: "error", headers: { "X-Plex-Token": token }
                    }, scope).then(function (response) {
                    if (!response.ok) { throw new Error("Artwork is unavailable (HTTP " + response.status + ")."); }
                    return response.blob();
                });
            },
            photo: function (item) {
                var part = item.Media && item.Media[0] && item.Media[0].Part && item.Media[0].Part[0];
                var path = part && part.key || item.thumb;
                try { localPath(path); }
                catch (error) { return Promise.reject(error); }
                return timedFetch(fetchRequest, baseUrl + "/photo/:/transcode?width=1920&height=1080&minSize=0&upscale=0&url=" +
                    encodeURIComponent(path), {
                        credentials: "omit", redirect: "error", headers: { "X-Plex-Token": token }
                    }, scope).then(function (response) {
                    if (!response.ok) { throw new Error("Photo is unavailable (HTTP " + response.status + ")."); }
                    return response.blob();
                });
            },
            streamUrl: function (path, query) {
                localPath(path);
                var params = {};
                Object.keys(query || {}).forEach(function (name) { params[name] = query[name]; });
                params["X-Plex-Client-Identifier"] = options.clientIdentifier || clientId();
                params["X-Plex-Product"] = PRODUCT;
                return baseUrl + path + "?" + Object.keys(params).map(function (name) {
                    return encodeURIComponent(name) + "=" + encodeURIComponent(params[name]);
                }).concat(token ? ["X-Plex-Token=" + encodeURIComponent(token)] : []).join("&");
            },
            // The preview-thumbnail index (BIF) of a part: its bytes, or null when the server has none.
            previewIndex: function (partId) {
                return timedFetch(fetchRequest, baseUrl + "/library/parts/" + key(partId) + "/indexes/sd", {
                    credentials: "omit", redirect: "error", headers: { "X-Plex-Token": token }
                }, scope, 32 * 1024 * 1024).then(function (response) {
                    if (response.status === 404) { return null; }
                    if (!response.ok) { throw new Error("Plex refused the preview index (HTTP " + response.status + ")."); }
                    return response.blob();
                }).then(function (blob) {
                    if (!blob) { return null; }
                    return new Promise(function (resolve, reject) {
                        var reader = new FileReader();
                        reader.onload = function () { resolve(reader.result); };
                        reader.onerror = function () { reject(new Error("The preview index could not be read.")); };
                        reader.readAsArrayBuffer(blob);
                    });
                });
            },
            subtitleText: function (id, codec) {
                if (["srt", "subrip", "webvtt"].indexOf(codec) === -1) {
                    return Promise.reject(new Error("This subtitle format needs server rendering."));
                }
                return timedFetch(fetchRequest, baseUrl + "/library/streams/" + key(id) +
                    "?encoding=utf-8" + (codec === "webvtt" ? "" : "&format=srt"), {
                        credentials: "omit", redirect: "error", headers: { "X-Plex-Token": token }
                    }, scope).then(function (response) {
                    if (!response.ok) { throw new Error("Plex refused the subtitle (HTTP " + response.status + ")."); }
                    return response.text();
                }).then(function (text) {
                    if (text.length > 2 * 1024 * 1024) { throw new Error("The subtitle exceeds the memory limit."); }
                    return text;
                });
            },
            // docs/pms-api.md section 8: read-only search; `language` must be ISO 639-1.
            searchSubtitles: function (id, language) {
                if (!/^[a-z]{2}$/.test(String(language || ""))) {
                    var refused = new Error("Subtitle search needs a two-letter language code.");
                    refused.code = "bad-language";
                    return Promise.reject(refused);
                }
                return Promise.resolve().then(function () {
                    return get("/library/metadata/" + key(id) + "/subtitles", "GET", {
                        language: language, hearingImpaired: 0, forced: 0
                    });
                });
            },
            // Adds the candidate as a stream on the item (a server write); PMS installs it asynchronously.
            addSubtitle: function (id, candidateKey) {
                if (typeof candidateKey !== "string" ||
                        !/^\/library\/streams\/[0-9]{1,20}(\.[A-Za-z0-9]{1,10})?$/.test(candidateKey)) {
                    return Promise.reject(new Error("Plex returned an invalid subtitle candidate."));
                }
                return Promise.resolve().then(function () {
                    return get("/library/metadata/" + key(id) + "/subtitles", "PUT", { key: candidateKey }, true);
                });
            },
            selectStreams: function (partId, audioId, subtitleId) {
                if (!/^[0-9]+$/.test(String(audioId)) || !/^[0-9]+$/.test(String(subtitleId))) {
                    return Promise.reject(new Error("Invalid audio or subtitle selection."));
                }
                var query = { subtitleStreamID: subtitleId, allParts: 1 };
                if (Number(audioId) > 0) { query.audioStreamID = audioId; }
                return get("/library/parts/" + key(partId), "PUT", query, true);
            },
            setWatched: function (id, watched) {
                if (typeof watched !== "boolean") { return Promise.reject(new Error("Select watched or unwatched explicitly.")); }
                return get(watched ? "/:/scrobble" : "/:/unscrobble", "GET", {
                    key: key(id), identifier: "com.plexapp.plugins.library"
                }, true);
            },
            removeContinueWatching: function (id) {
                return get("/actions/removeFromContinueWatching", "PUT", { ratingKey: key(id) }, true);
            },
            // Mirrors the LG contract (rust-modules/plex/src/plex/timeline.rs): the decision's
            // X-Plex-Session-Identifier and the selected streams ride with every report.
            timeline: function (item, position, state, session, playQueue, tracks) {
                if (["playing", "paused", "stopped", "buffering"].indexOf(state) === -1 ||
                        !isNonNegativeInteger(position)) {
                    return Promise.reject(new Error("Invalid playback timeline."));
                }
                var query = {
                    ratingKey: key(item.ratingKey), key: "/library/metadata/" + key(item.ratingKey),
                    identifier: "com.plexapp.plugins.library", time: position,
                    duration: item.duration || 0, state: state, session: session,
                    "X-Plex-Session-Identifier": session
                };
                if (playQueue && /^[1-9][0-9]*$/.test(String(playQueue.id)) &&
                        /^[1-9][0-9]*$/.test(String(playQueue.itemId))) {
                    query.playQueueID = String(playQueue.id);
                    query.playQueueItemID = String(playQueue.itemId);
                }
                if (tracks && /^[1-9][0-9]*$/.test(String(tracks.audioId))) {
                    query.audioStreamID = String(tracks.audioId);
                }
                if (tracks && /^[1-9][0-9]*$/.test(String(tracks.subtitleId))) {
                    query.subtitleStreamID = String(tracks.subtitleId);
                }
                return get("/:/timeline", "POST", query, true);
            },
            // An ephemeral server-side queue (no watch-state change) so the server's dashboard
            // and Up Next agree with this client, as the LG client does for every video start.
            createVideoPlayQueue: function (machineId, ratingKey) {
                if (!/^[0-9A-Za-z_-]{1,80}$/.test(String(machineId || ""))) {
                    return Promise.reject(new Error("The server identity is invalid."));
                }
                return get("/playQueues", "POST", {
                    type: "video", continuous: 1, shuffle: 0, repeat: 0,
                    uri: "server://" + machineId + "/com.plexapp.plugins.library/library/metadata/" + key(ratingKey)
                }).then(function (container) {
                    var id = String(container.playQueueID || "");
                    var selected = String(container.playQueueSelectedItemID || "");
                    if (!/^[1-9][0-9]*$/.test(id) || !/^[1-9][0-9]*$/.test(selected)) {
                        throw new Error("Plex returned an invalid play queue.");
                    }
                    return { id: id, itemId: selected, items: listFrom(container, "Metadata") };
                });
            },
            stopTranscode: function (session, kind) {
                if (kind && ["video", "music"].indexOf(kind) === -1) { return Promise.reject(new Error("Invalid transcode kind.")); }
                return get("/" + (kind || "video") + "/:/transcode/universal/stop", "GET", { session: session }, true);
            },
            // Library settings (the ratings source among them); only the server owner may change them.
            getSectionPrefs: function (section) {
                return get("/library/sections/" + key(section) + "/prefs").then(function (container) {
                    return Array.isArray(container.Setting) ? container.Setting : [];
                });
            },
            setSectionPref: function (section, id, value) {
                if (!/^[A-Za-z0-9_.-]+$/.test(String(id || ""))) { return Promise.reject(new Error("Invalid library setting.")); }
                return Promise.resolve().then(function () {
                    var query = {};
                    query[id] = value;
                    return get("/library/sections/" + key(section) + "/prefs", "PUT", query, true);
                });
            },
            getSections: function () {
                return get("/library/sections").then(function (container) {
                    return listFrom(container, "Directory");
                });
            },
            getHomeHubs: function () {
                // removeFromContinueWatching hides an item from /hubs/continueWatching and home.ondeck
                // but not from home.continue, so the deck comes from the dedicated hub. A server
                // without that hub keeps the promoted rows.
                var deck = get("/hubs/continueWatching?count=12").then(function (container) {
                    return listFrom(container, "Hub").filter(function (hub) {
                        return Array.isArray(hub && hub.Metadata) && hub.Metadata.length > 0;
                    }).slice(0, 1);
                }).catch(function () { return null; });
                return Promise.all([get("/hubs/promoted?count=12&excludeContinueWatching=0"), deck]).then(function (results) {
                    var hubs = listFrom(results[0], "Hub");
                    if (!results[1]) { return hubs; }
                    var at = -1;
                    var rest = hubs.filter(function (hub, index) {
                        var deckRow = hub.hubIdentifier === "home.continue" || hub.hubIdentifier === "home.ondeck";
                        if (deckRow && at === -1) { at = index; }
                        return !deckRow;
                    });
                    rest.splice(at === -1 ? 0 : at, 0, results[1][0]);
                    return rest.filter(Boolean);
                });
            },
            getSectionItems: function (sectionKey, start, size, filters) {
                var key = String(sectionKey || "");
                start = start === undefined ? 0 : start;
                size = size === undefined ? 50 : size;
                if (!/^[0-9]+$/.test(key)) {
                    return Promise.reject(new Error("The library section key is invalid."));
                }
                if (!isNonNegativeInteger(start) || !isNonNegativeInteger(size) || size < 1 || size > 100) {
                    return Promise.reject(new Error("The requested page range is invalid."));
                }
                var path = "/library/sections/" + key + "/all" +
                    "?X-Plex-Container-Start=" + start +
                    "&X-Plex-Container-Size=" + size;
                if (filters) {
                    path += "&" + Object.keys(filters).map(function (name) {
                        return encodeURIComponent(name) + "=" + encodeURIComponent(filters[name]);
                    }).join("&");
                }
                return get(path).then(function (container) {
                    var items = listFrom(container, "Metadata");
                    var totalSize = isNonNegativeInteger(container.totalSize) ?
                        container.totalSize : items.length;
                    var offset = isNonNegativeInteger(container.offset) ? container.offset : start;
                    return {
                        items: items,
                        totalSize: totalSize,
                        offset: offset
                    };
                });
            }
        };
    }

    return {
        createClient: createClient,
        createAuthClient: createAuthClient,
        createAccountClient: createAccountClient,
        selectServer: selectServer,
        ratingBadges: ratingBadges,
        ratingPref: ratingPref,
        validateBaseUrl: validateBaseUrl,
        localCatalogueIndex: localCatalogueIndex,
        matchCredit: matchCredit
    };
}));
