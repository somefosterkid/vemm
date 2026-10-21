(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmPreferences = api; }
}(this, function () {
    "use strict";
    var key = "vemm-tizen-preferences";
    var skipIntervals = [5, 10, 15, 30, 60];
    // The LG client's ladders (rust-modules/plex/src/plex/session.rs): quality rungs with its
    // bitrate ceilings, Direct Play Auto/Force/Off, Next episode Countdown/After credits/Off,
    // subtitle sizes up to extra large and its grey tones (plus the yellow earlier builds saved).
    // 2160, 1440 and 1080_16/12/10 are Vemm additions: height in lines, then Mbps for the extra 1080p caps.
    var qualities = ["original", "2160", "1440", "1080h", "1080_16", "1080_12", "1080_10", "1080", "720", "720l", "480"];
    var directPlayModes = ["auto", "force", "off"];
    var nextEpisodeModes = ["countdown", "after_credits", "off"];
    var subtitleSizes = ["small", "medium", "large", "extra_large"];
    // The minimum buffer: seconds AVPlay loads before playing and after every seek (VemmPlayback.buffering).
    // Earlier builds saved "bufferSeconds" and "buffer", which are no longer read, and offered 0.1 s, which
    // loads as 0.5 s now (it was slower on the TV).
    var bufferSizes = [0.5, 1, 2, 4, 8, 15];
    // Intro and credits markers: show the Skip button, skip automatically, or neither.
    var skipModes = ["button", "auto", "off"];
    var subtitlePositions = ["low", "middle", "high"];
    var subtitleColors = ["white", "grey_85", "grey_70", "grey_55", "grey_40", "grey_28", "yellow"];
    // Off is the LG look (outlined text); On adds a dark box behind the line.
    var subtitleBackgrounds = ["off", "on"];
    // Megabytes of artwork the TV may keep; 10 is the original fixed budget.
    var artworkLimits = [10, 25, 50, 100, 150];
    // The rating sources the details page can show; all on by default.
    var ratingSources = ["rt_critic", "rt_audience", "imdb", "tmdb"];
    // The themes and accents of js/theme.js, in Settings order; an accent of "theme" follows the theme.
    var themes = ["blue", "grey", "black", "pure_black"];
    var accents = ["theme", "white", "blue", "teal", "purple", "orange", "pink"];
    var subtitleDelayMinMs = -60000;
    var subtitleDelayMaxMs = 60000;
    function validate(value) {
        var skipInterval = value && value.skipInterval !== undefined ? value.skipInterval : 10;
        var subtitleSize = value && value.subtitleSize !== undefined ? value.subtitleSize : "medium";
        var subtitlePosition = value && value.subtitlePosition !== undefined ? value.subtitlePosition : "low";
        var subtitleColor = value && value.subtitleColor !== undefined ? value.subtitleColor : "white";
        var subtitleBackground = value && value.subtitleBackground !== undefined ? value.subtitleBackground : "off";
        var subtitleDelayMs = value && value.subtitleDelayMs !== undefined ? value.subtitleDelayMs : 0;
        var directPlay = value && value.directPlay !== undefined ? value.directPlay : "auto";
        var minBuffer = value && value.minBuffer !== undefined ? (value.minBuffer === 0.1 ? 0.5 : value.minBuffer) : 1;
        var skipIntro = value && value.skipIntro !== undefined ? value.skipIntro : "button";
        var skipCredits = value && value.skipCredits !== undefined ? value.skipCredits : "button";
        var enhancedGraphics = value && value.enhancedGraphics !== undefined ? value.enhancedGraphics : false;
        var saveHomeArtwork = value && value.saveHomeArtwork !== undefined ? value.saveHomeArtwork : false;
        var artworkLimitMb = value && value.artworkLimitMb !== undefined ? value.artworkLimitMb : 10;
        var preloadArtwork = value && value.preloadArtwork !== undefined ? value.preloadArtwork : true;
        var saveLibraryArtwork = value && value.saveLibraryArtwork !== undefined ? value.saveLibraryArtwork : false;
        var autoAdvanceFeatures = value && value.autoAdvanceFeatures !== undefined ? value.autoAdvanceFeatures : true;
        var shownRatings = value && value.ratingSources !== undefined ? value.ratingSources : ratingSources;
        var theme = value && value.theme !== undefined ? value.theme : "blue";
        var accent = value && value.accent !== undefined ? value.accent : "theme";
        // Builds before the Next episode choice saved only an on/off auto-play flag.
        var nextEpisode = value && value.nextEpisode !== undefined ? value.nextEpisode :
            (value && value.autoNext === false ? "off" : "countdown");
        if (!value || qualities.indexOf(value.quality) === -1 ||
                ["en", "es", "be"].indexOf(value.language) === -1 ||
                (value.autoNext !== undefined && typeof value.autoNext !== "boolean") ||
                nextEpisodeModes.indexOf(nextEpisode) === -1 ||
                (value.continueAction !== undefined && ["details", "play"].indexOf(value.continueAction) === -1) ||
                skipIntervals.indexOf(skipInterval) === -1 || subtitleSizes.indexOf(subtitleSize) === -1 ||
                subtitlePositions.indexOf(subtitlePosition) === -1 || subtitleColors.indexOf(subtitleColor) === -1 ||
                subtitleBackgrounds.indexOf(subtitleBackground) === -1 ||
                typeof subtitleDelayMs !== "number" || !isFinite(subtitleDelayMs) ||
                Math.floor(subtitleDelayMs) !== subtitleDelayMs || subtitleDelayMs % 100 !== 0 ||
                subtitleDelayMs < subtitleDelayMinMs || subtitleDelayMs > subtitleDelayMaxMs ||
                directPlayModes.indexOf(directPlay) === -1 || typeof enhancedGraphics !== "boolean" ||
                typeof saveHomeArtwork !== "boolean" || typeof saveLibraryArtwork !== "boolean" ||
                typeof preloadArtwork !== "boolean" ||
                artworkLimits.indexOf(artworkLimitMb) === -1 || typeof autoAdvanceFeatures !== "boolean" ||
                bufferSizes.indexOf(minBuffer) === -1 || skipModes.indexOf(skipIntro) === -1 ||
                skipModes.indexOf(skipCredits) === -1 || themes.indexOf(theme) === -1 || accents.indexOf(accent) === -1 ||
                !Array.isArray(shownRatings) ||
                shownRatings.some(function (source) { return ratingSources.indexOf(source) === -1; })) {
            throw new Error("Saved preferences are invalid. Reset app preferences in Settings.");
        }
        // Preferences saved before continueAction existed load with the safe default.
        return { quality: value.quality, language: value.language, nextEpisode: nextEpisode,
            continueAction: value.continueAction || "details", skipInterval: skipInterval,
            subtitleSize: subtitleSize, subtitlePosition: subtitlePosition, subtitleColor: subtitleColor,
            subtitleBackground: subtitleBackground, subtitleDelayMs: subtitleDelayMs, directPlay: directPlay,
            enhancedGraphics: enhancedGraphics, saveHomeArtwork: saveHomeArtwork,
            artworkLimitMb: artworkLimitMb, saveLibraryArtwork: saveLibraryArtwork,
            preloadArtwork: preloadArtwork,
            autoAdvanceFeatures: autoAdvanceFeatures, minBuffer: minBuffer, skipIntro: skipIntro, skipCredits: skipCredits,
            theme: theme, accent: accent,
            ratingSources: ratingSources.filter(function (source) { return shownRatings.indexOf(source) !== -1; }) };
    }
    return {
        load: function (storage) {
            var value = storage.getItem(key);
            if (!value) { return validate({ quality: "original", language: "en", nextEpisode: "countdown" }); }
            try { return validate(JSON.parse(value)); }
            catch (error) { throw new Error("Saved preferences are invalid. Reset app preferences in Settings."); }
        },
        save: function (storage, value) { storage.setItem(key, JSON.stringify(validate(value))); },
        reset: function (storage) { storage.removeItem(key); },
        // The limits worth offering when the app may store quotaBytes (unknown offers all); the current one stays.
        artworkLimitChoices: function (quotaBytes, current) {
            return artworkLimits.filter(function (mb) {
                return mb === current || !quotaBytes || mb * 1024 * 1024 <= quotaBytes;
            });
        },
        ratingSources: ratingSources.slice(), qualities: qualities.slice(), directPlayModes: directPlayModes.slice(),
        bufferSizes: bufferSizes.slice(), nextEpisodeModes: nextEpisodeModes.slice(), subtitleSizes: subtitleSizes.slice(),
        subtitleColors: subtitleColors.slice(), subtitleBackgrounds: subtitleBackgrounds.slice(),
        themes: themes.slice(), accents: accents.slice()
    };
}));
