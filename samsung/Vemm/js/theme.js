// The theme engine. Every colour in the interface is a token, and a theme is one set of colours for those tokens.
// Three layers, after the W3C Design Tokens Community Group format and the Material 3 colour roles:
//   palette - primitive named colours (navy-950, grey-900, blue-400 ...). Only themes and accents use them.
//   roles   - semantic tokens (canvas, surface-raised, text-secondary, focus ...). Each theme gives every role a palette
//             colour, an accent gives the accent roles, and a few roles derive from another role with an alpha.
//   styles  - css/style.css names roles only, as $role, or $role/alpha for scrims and tints.
// The 2017 televisions (Chromium 47) have no CSS custom properties. tools/tizen/build-theme.js therefore copies every
// paint declaration of style.css, unresolved, into js/theme-rules.js, and apply() writes them resolved into one <style>
// after style.css. Loaded in <head>, this file applies the saved choice before the first paint.
(function (root, factory) {
    var api = factory(root);
    if (typeof module === "object" && module.exports) { module.exports = api; return; }
    root.VemmTheme = api;
    var saved = {};
    try { saved = root.VemmPreferences.load(root.localStorage); } catch (error) { saved = {}; }
    if (root.document && root.VemmThemeRules) { api.apply(root.document, saved.theme, saved.accent); }
}(this, function (root) {
    "use strict";
    var palette = {
        white: "#ffffff", black: "#000000", paper: "#f7fafc",
        // Blue: the Blue Calm navy ground, pale-sky focus and mist text.
        "navy-950": "#081522", "navy-900": "#102238", "navy-850": "#13283f", "navy-800": "#1c3450",
        "navy-700": "#1d3c66", "navy-ink": "#0f2747", "slate-600": "#4b5c63",
        "sky-100": "#d6e6f5", "mist-50": "#f5f8fc", "mist-200": "#d7dbe3", "mist-400": "#a7b3c4",
        // Neutral greys with a faint cool cast, for Grey, Black and Pure black.
        "grey-975": "#0b0b0c", "grey-950": "#121214", "grey-925": "#18181b", "grey-900": "#1e1e21",
        "grey-875": "#242428", "grey-850": "#2a2a2e", "grey-825": "#303035", "grey-800": "#36363b",
        "grey-775": "#3c3c42", "grey-725": "#4a4a51", "grey-650": "#5c5c64", "grey-400": "#9e9ea6",
        "grey-300": "#b8b8bf", "grey-200": "#cfcfd5", "grey-100": "#e4e4e8", "grey-50": "#f2f2f5",
        // Accent hues: a fill for buttons (white text, or dark text on orange), a mid tone for progress and
        // selection, and a light tone for accent text.
        "blue-200": "#b7d0ff", "blue-400": "#6b93c9", "blue-600": "#2f6bcc",
        "teal-200": "#8fe3d8", "teal-400": "#3bb8aa", "teal-700": "#127a70",
        "purple-200": "#cdbcff", "purple-400": "#a385f2", "purple-600": "#6b4fd0",
        "orange-200": "#ffd08a", "orange-400": "#e9a23b", "orange-ink": "#1c1305",
        "pink-200": "#ffb7cd", "pink-400": "#ec6f98", "pink-600": "#c23e6c",
        "red-300": "#ff9b9b", "yellow-400": "#facc15", "ink-800": "#1f2937", "ink-950": "#101012"
    };
    // Roles every theme shares unless it overrides them. [role, alpha] derives from another role.
    var shared = {
        "focus-ring": "white", shadow: "black", "text-danger": "red-300", warning: "yellow-400", "on-warning": "ink-800",
        "qr-plate": "paper", "on-profile": "ink-950",
        "glass-faint": ["text", 0.07], glass: ["text", 0.14], "glass-strong": ["text", 0.22], hairline: ["text", 0.16],
        line: ["text", 0.4], "accent-track": ["accent", 0.3]
    };
    // canvas < surface < surface-raised < surface-high: raised surfaces are lighter, as in Material dark themes.
    var themes = {
        blue: { label: "Blue", accent: "blue", roles: {
            canvas: "navy-950", surface: "navy-900", "surface-raised": "navy-850", "surface-high": "navy-800",
            "surface-selected": "navy-700", border: "slate-600",
            text: "mist-50", "text-strong": "white", "text-secondary": "mist-200", "text-muted": "mist-400",
            focus: "sky-100", "on-focus": "navy-ink" } },
        grey: { label: "Grey", accent: "white", roles: {
            canvas: "grey-900", surface: "grey-850", "surface-raised": "grey-825", "surface-high": "grey-775",
            "surface-selected": "grey-725", border: "grey-650",
            text: "grey-50", "text-strong": "white", "text-secondary": "grey-200", "text-muted": "grey-300",
            focus: "grey-50", "on-focus": "grey-950" } },
        black: { label: "Black", accent: "white", roles: {
            canvas: "grey-975", surface: "grey-925", "surface-raised": "grey-900", "surface-high": "grey-850",
            "surface-selected": "grey-800", border: "grey-725",
            text: "grey-50", "text-strong": "white", "text-secondary": "grey-200", "text-muted": "grey-400",
            focus: "grey-50", "on-focus": "grey-975" } },
        // True black switches OLED pixels off. Text, focus and titles stay off-white: pure white on black blooms.
        pure_black: { label: "Pure black (OLED)", accent: "white", roles: {
            canvas: "black", surface: "grey-950", "surface-raised": "grey-925", "surface-high": "grey-875",
            "surface-selected": "grey-825", border: "grey-725",
            text: "grey-100", "text-strong": "grey-50", "text-secondary": "grey-300", "text-muted": "grey-400",
            focus: "grey-100", "on-focus": "black" } }
    };
    // The accent colours progress, the primary (play) button, selected items and links. White keeps a neutral theme
    // neutral: its play button is a brighter glass pill, never a white fill that would look focused.
    var accents = {
        white: { label: "White", roles: { accent: "grey-200", "text-accent": "grey-100", primary: ["text", 0.26],
            "on-primary": ["text", 1] } },
        blue: { label: "Blue", roles: { accent: "blue-400", "text-accent": "blue-200", primary: "blue-600", "on-primary": "white" } },
        teal: { label: "Teal", roles: { accent: "teal-400", "text-accent": "teal-200", primary: "teal-700", "on-primary": "white" } },
        purple: { label: "Purple", roles: { accent: "purple-400", "text-accent": "purple-200", primary: "purple-600",
            "on-primary": "white" } },
        orange: { label: "Orange", roles: { accent: "orange-400", "text-accent": "orange-200", primary: "orange-400",
            "on-primary": "orange-ink" } },
        pink: { label: "Pink", roles: { accent: "pink-400", "text-accent": "pink-200", primary: "pink-600", "on-primary": "white" } }
    };
    var defaultTheme = "blue";

    function rgb(hex) {
        return [parseInt(hex.substr(1, 2), 16), parseInt(hex.substr(3, 2), 16), parseInt(hex.substr(5, 2), 16), 1];
    }
    function format(color, alpha) {
        var a = Math.round(color[3] * alpha * 1000) / 1000;
        return a === 1 ? "rgb(" + color.slice(0, 3).join(",") + ")" : "rgba(" + color.slice(0, 3).join(",") + "," + a + ")";
    }
    function pick(theme, accent) {
        var chosenTheme = themes[theme] ? theme : defaultTheme;
        return { theme: chosenTheme, accent: accents[accent] ? accent : themes[chosenTheme].accent };
    }
    // Every role of a theme with an accent ("theme" or an unknown accent is the theme's own), as [r, g, b, alpha].
    function values(theme, accent) {
        var chosen = pick(theme, accent);
        var roles = {};
        [shared, themes[chosen.theme].roles, accents[chosen.accent].roles].forEach(function (set) {
            Object.keys(set).forEach(function (name) { roles[name] = set[name]; });
        });
        var out = {};
        function resolve(name) {
            if (!out[name]) {
                var value = roles[name];
                if (typeof value === "string") { out[name] = rgb(palette[value]); }
                else {
                    var base = resolve(value[0]);
                    out[name] = [base[0], base[1], base[2], base[3] * value[1]];
                }
            }
            return out[name];
        }
        Object.keys(roles).forEach(resolve);
        return out;
    }
    // Samples for the Settings choices: a theme shows its canvas inside a rim of its muted text; an accent its colour.
    function swatches() {
        var selector = ".settings-menu .menu-control.swatch-choice[data-color=\"";
        return Object.keys(themes).map(function (id) {
            var colors = values(id);
            return selector + "theme-" + id + "\"]::before{background:" + format(colors.canvas, 1) +
                ";box-shadow:inset 0 0 0 2px " + format(colors["text-muted"], 1) + "}";
        }).concat(Object.keys(accents).map(function (id) {
            return selector + "accent-" + id + "\"]::before{background:" + format(values(defaultTheme, id).accent, 1) + "}";
        })).join("\n");
    }
    function css(rules, theme, accent) {
        var colors = values(theme, accent);
        return rules.replace(/\$([a-z][a-z0-9-]*)(?:\/([0-9.]+))?/g, function (match, name, alpha) {
            return colors[name] ? format(colors[name], alpha ? Number(alpha) : 1) : match;
        }) + "\n" + swatches();
    }
    return {
        themes: themes, accents: accents, palette: palette, defaultTheme: defaultTheme,
        // The theme an accent of "theme" follows, after unknown names fall back.
        resolve: pick,
        roles: function () { return Object.keys(values(defaultTheme)); },
        values: values,
        css: css,
        // Writes the chosen theme into the <style> after style.css; choosing the applied theme again does nothing.
        apply: function (document, theme, accent) {
            var chosen = pick(theme, accent);
            var key = chosen.theme + " " + chosen.accent;
            var style = document.getElementById("vemm-theme");
            if (style && style.getAttribute("data-theme") === key) { return; }
            if (!style) {
                style = document.createElement("style");
                style.id = "vemm-theme";
                (document.head || document.documentElement).appendChild(style);
            }
            style.setAttribute("data-theme", key);
            style.textContent = css(root.VemmThemeRules || "", chosen.theme, chosen.accent);
        }
    };
}));
