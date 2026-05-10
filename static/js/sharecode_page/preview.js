/* Sharecode HTML/React preview rendering and resource rewriting. */
function escapeHtml(raw) {
    return String(raw || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function isSharedCodePage() {
    return window.location.pathname.indexOf("/share/") === 0;
}

function normalizeShareViewMode(rawMode) {
    if (rawMode === SHARE_VIEW_PREVIEW || rawMode === SHARE_VIEW_SPLIT) {
        return rawMode;
    }
    return SHARE_VIEW_SOURCE;
}

function resolveInitialShareViewMode() {
    try {
        const params = new URLSearchParams(window.location.search || "");
        const view = (params.get("view") || "").toLowerCase();
        const preview = (params.get("preview") || "").toLowerCase();
        if (view === SHARE_VIEW_SPLIT) {
            return SHARE_VIEW_SPLIT;
        }
        if (view === SHARE_VIEW_PREVIEW || preview === "1" || preview === "true") {
            return SHARE_VIEW_PREVIEW;
        }
    } catch (e) {
    }
    return SHARE_VIEW_SOURCE;
}

function setShareViewSelectors(mode) {
    const nextMode = normalizeShareViewMode(mode);
    document.querySelectorAll("[data-share-view-mode]").forEach(button => {
        const active = button.getAttribute("data-share-view-mode") === nextMode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
    });
}

function getEditorAreaElement() {
    return document.getElementById("editorArea");
}

function setEditorAreaShareViewClass(mode) {
    const editorArea = getEditorAreaElement();
    if (!editorArea) {
        return;
    }
    editorArea.classList.toggle("share-view-source", mode === SHARE_VIEW_SOURCE);
    editorArea.classList.toggle("share-view-preview", mode === SHARE_VIEW_PREVIEW);
    editorArea.classList.toggle("share-view-split", mode === SHARE_VIEW_SPLIT);
}

function isHtmlPreviewFullscreenActive() {
    const editorArea = getEditorAreaElement();
    return !!(editorArea && editorArea.classList.contains("is-preview-fullscreen"));
}

function updatePreviewFullscreenButton() {
    const button = document.getElementById("previewFullscreenButton");
    if (!button) {
        return;
    }
    const active = isHtmlPreviewFullscreenActive();
    const icon = button.querySelector("i");
    const label = button.querySelector("span");
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.title = active ? "退出全屏预览" : "全屏预览";
    if (icon) {
        icon.className = active ? "bi bi-fullscreen-exit" : "bi bi-arrows-fullscreen";
    }
    if (label) {
        label.textContent = active ? "Exit" : "Full";
    }
}

function enterHtmlPreviewFullscreen() {
    const editorArea = getEditorAreaElement();
    if (!editorArea || !isHtmlPreviewableFile(getActiveProjectFile())) {
        return;
    }
    shareViewMode = SHARE_VIEW_PREVIEW;
    setShareViewSelectors(shareViewMode);
    applyShareViewToWorkspace({immediate: true, updateUrl: true});
    editorArea.classList.add("is-preview-fullscreen");
    updatePreviewFullscreenButton();
    if (editorArea.requestFullscreen && document.fullscreenElement !== editorArea) {
        editorArea.requestFullscreen().catch(function () {
            updatePreviewFullscreenButton();
        });
    }
}

function exitHtmlPreviewFullscreen() {
    const editorArea = getEditorAreaElement();
    if (editorArea) {
        editorArea.classList.remove("is-preview-fullscreen");
    }
    if (document.fullscreenElement === editorArea && document.exitFullscreen) {
        document.exitFullscreen().catch(function () {
        });
    }
    updatePreviewFullscreenButton();
}

function toggleHtmlPreviewFullscreen() {
    hideFloatingMenuIfOpen();
    if (isHtmlPreviewFullscreenActive()) {
        exitHtmlPreviewFullscreen();
        return;
    }
    enterHtmlPreviewFullscreen();
}

function isHtmlDocumentFile(file) {
    if (!file || file.kind !== "text") {
        return false;
    }
    const ext = getPathExtension(file.path);
    const language = file.language || detectLanguageFromFilename(file.path);
    return language === "html" || ext === "html" || ext === "htm";
}

function looksLikeReactCode(content) {
    const code = String(content || "");
    return /(?:from\s+["']react["']|ReactDOM|createRoot\s*\(|<[A-Z][A-Za-z0-9.]*[\s/>])/.test(code);
}

function looksLikeHtmlPreviewDocument(content) {
    return /(?:<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]|<script\b)/i.test(String(content || ""));
}

function isReactPreviewFile(file) {
    if (!file || file.kind !== "text") {
        return false;
    }
    const ext = getPathExtension(file.path);
    if (ext === "jsx" || ext === "tsx") {
        return true;
    }
    if ((ext === "html" || ext === "htm") && looksLikeReactCode(file.content)) {
        return !looksLikeHtmlPreviewDocument(file.content);
    }
    return looksLikeReactCode(file.content) && (!ext || ["js", "jsx", "ts", "tsx", "py", "txt"].includes(ext));
}

function shouldBuildReactPreviewDocument(file) {
    return isReactPreviewFile(file) && (!isHtmlDocumentFile(file) || !looksLikeHtmlPreviewDocument(file.content));
}

function isHtmlPreviewableFile(file) {
    return isHtmlDocumentFile(file) || isReactPreviewFile(file);
}

function updateHtmlShareViewControls() {
    const visible = isHtmlPreviewableFile(getActiveProjectFile());
    document.querySelectorAll(".html-share-view-control").forEach(control => {
        control.classList.toggle("is-visible", visible);
    });
    document.querySelectorAll("[data-share-view-mode], #previewFullscreenButton").forEach(control => {
        control.disabled = !visible;
    });
    if (!visible && isHtmlPreviewFullscreenActive()) {
        exitHtmlPreviewFullscreen();
    }
    setShareViewSelectors(shareViewMode);
    updatePreviewFullscreenButton();
    return visible;
}

function hideHtmlPreviewPane() {
    const previewPane = document.getElementById("htmlPreviewPane");
    if (previewPane) {
        previewPane.style.display = "none";
    }
    setEditorAreaShareViewClass(SHARE_VIEW_SOURCE);
}

function showSourcePaneForActiveFile() {
    const active = getActiveProjectFile();
    hideHtmlPreviewPane();
    if (!active || active.kind !== "text") {
        return;
    }
    const assetViewer = document.getElementById("assetViewer");
    const editorElement = document.getElementById("editor");
    if (assetViewer) {
        assetViewer.style.display = "none";
    }
    if (editorElement) {
        editorElement.style.display = "block";
    }
    setEditorAreaShareViewClass(SHARE_VIEW_SOURCE);
    if (window.editor) {
        setTimeout(function () {
            window.editor.resize();
        }, 0);
    }
}

function showHtmlPreviewPane() {
    const assetViewer = document.getElementById("assetViewer");
    const editorElement = document.getElementById("editor");
    const previewPane = document.getElementById("htmlPreviewPane");
    if (assetViewer) {
        assetViewer.style.display = "none";
    }
    if (editorElement) {
        editorElement.style.display = "none";
    }
    if (previewPane) {
        previewPane.style.display = "block";
    }
    setEditorAreaShareViewClass(SHARE_VIEW_PREVIEW);
}

function showSplitPreviewPane() {
    const assetViewer = document.getElementById("assetViewer");
    const editorElement = document.getElementById("editor");
    const previewPane = document.getElementById("htmlPreviewPane");
    if (assetViewer) {
        assetViewer.style.display = "none";
    }
    if (editorElement) {
        editorElement.style.display = "block";
    }
    if (previewPane) {
        previewPane.style.display = "block";
    }
    setEditorAreaShareViewClass(SHARE_VIEW_SPLIT);
    if (window.editor) {
        setTimeout(function () {
            window.editor.resize();
        }, 0);
    }
}

function getEffectiveShareViewMode() {
    if (!isHtmlPreviewableFile(getActiveProjectFile())) {
        return SHARE_VIEW_SOURCE;
    }
    return normalizeShareViewMode(shareViewMode);
}

function updateCurrentShareViewUrl() {
    if (!isSharedCodePage() || !window.history || !window.history.replaceState) {
        return;
    }
    try {
        const url = new URL(window.location.href);
        const effectiveMode = getEffectiveShareViewMode();
        if (effectiveMode !== SHARE_VIEW_SOURCE) {
            url.searchParams.set("view", effectiveMode);
        } else {
            url.searchParams.delete("view");
            url.searchParams.delete("preview");
        }
        window.history.replaceState(null, "", url.toString());
    } catch (e) {
    }
}

function applyShareViewToWorkspace(options) {
    const opts = options || {};
    const active = getActiveProjectFile();
    const canPreview = updateHtmlShareViewControls();
    if (!active || active.kind !== "text") {
        hideHtmlPreviewPane();
        return;
    }
    if (shareViewMode === SHARE_VIEW_PREVIEW && canPreview) {
        showHtmlPreviewPane();
        if (!opts.skipRefresh) {
            refreshHtmlPreview(opts.immediate === true);
        }
    } else if (shareViewMode === SHARE_VIEW_SPLIT && canPreview) {
        showSplitPreviewPane();
        if (!opts.skipRefresh) {
            refreshHtmlPreview(opts.immediate === true);
        }
    } else {
        showSourcePaneForActiveFile();
    }
    if (opts.updateUrl) {
        updateCurrentShareViewUrl();
    }
}

function setShareViewMode(nextMode, options) {
    const opts = options || {};
    const normalizedMode = normalizeShareViewMode(nextMode);
    if (normalizedMode !== SHARE_VIEW_PREVIEW && isHtmlPreviewFullscreenActive()) {
        exitHtmlPreviewFullscreen();
    }
    shareViewMode = normalizedMode;
    setShareViewSelectors(shareViewMode);
    applyShareViewToWorkspace({
        immediate: true,
        updateUrl: opts.updateUrl !== false
    });
    scheduleSharecodeDraftCacheSave();
}

function appendShareViewToLink(rawLink) {
    const effectiveMode = getEffectiveShareViewMode();
    if (effectiveMode === SHARE_VIEW_SOURCE) {
        return rawLink;
    }
    try {
        const url = new URL(rawLink, window.location.href);
        url.searchParams.set("view", effectiveMode);
        return url.toString();
    } catch (e) {
        const separator = rawLink.indexOf("?") >= 0 ? "&" : "?";
        return rawLink + separator + "view=" + effectiveMode;
    }
}

function getTextResourceMimeType(file) {
    const ext = getPathExtension(file && file.path);
    if (ext === "css" || ext === "scss" || ext === "less") return "text/css";
    if (ext === "html" || ext === "htm") return "text/html";
    if (ext === "svg") return "image/svg+xml";
    if (ext === "json") return "application/json";
    if (ext === "js" || ext === "jsx" || ext === "ts" || ext === "tsx") return "text/javascript";
    return "text/plain";
}

function addPreviewResource(resourceMap, path, resource) {
    const safePath = safeNormalizePath(path);
    if (!safePath) {
        return;
    }
    if (!resourceMap.has(safePath)) {
        resourceMap.set(safePath, resource);
    }
    if (safePath.startsWith("assets/")) {
        const unprefixedPath = safeNormalizePath(safePath.slice("assets/".length));
        if (unprefixedPath && !resourceMap.has(unprefixedPath)) {
            resourceMap.set(unprefixedPath, resource);
        }
    }
    const baseName = getProjectPathBaseName(safePath);
    if (baseName && !resourceMap.has(baseName)) {
        resourceMap.set(baseName, resource);
    }
}

function buildPreviewResourceMap() {
    const resourceMap = new Map();
    for (const file of projectFiles) {
        const safePath = safeNormalizePath(file && file.path);
        if (!safePath) {
            continue;
        }
        if (file.kind === "text") {
            addPreviewResource(resourceMap, safePath, {
                kind: "text",
                path: safePath,
                content: file.content || "",
                mime_type: getTextResourceMimeType(file)
            });
        } else if (file.kind === "asset") {
            const source = resolveAssetPreviewSource(file);
            if (source) {
                addPreviewResource(resourceMap, safePath, {
                    kind: "asset",
                    path: safePath,
                    url: source,
                    mime_type: file.mime_type || "application/octet-stream"
                });
            }
        }
    }
    return resourceMap;
}

function isExternalPreviewUrl(rawValue) {
    const value = String(rawValue || "").trim();
    return !value
        || value.startsWith("#")
        || value.startsWith("//")
        || /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function splitPreviewUrl(rawValue) {
    const value = String(rawValue || "").trim();
    const match = value.match(/^([^?#]*)([?#].*)?$/);
    return {
        path: match ? match[1] : value,
        suffix: match && match[2] ? match[2] : ""
    };
}

function normalizePreviewResourcePath(rawPath) {
    if (typeof rawPath !== "string") {
        return "";
    }
    const normalizedPath = rawPath.replace(/\\/g, "/").trim().replace(/^\/+/, "");
    if (!normalizedPath) {
        return "";
    }
    const resultParts = [];
    const pathParts = normalizedPath.split("/");
    for (const part of pathParts) {
        if (!part || part === ".") {
            continue;
        }
        if (part === "..") {
            if (!resultParts.length) {
                return "";
            }
            resultParts.pop();
            continue;
        }
        resultParts.push(part);
    }
    return resultParts.join("/");
}

function addPreviewResourceCandidate(candidates, path) {
    const normalizedPath = normalizePreviewResourcePath(path);
    if (normalizedPath && !candidates.includes(normalizedPath)) {
        candidates.push(normalizedPath);
    }
}

function findPreviewResource(rawValue, basePath, resourceMap) {
    if (isExternalPreviewUrl(rawValue)) {
        return null;
    }
    const parts = splitPreviewUrl(rawValue);
    const rawPath = parts.path || "";
    const baseDir = getPathParent(basePath || "");
    const candidates = [];
    if (rawPath.startsWith("/")) {
        addPreviewResourceCandidate(candidates, rawPath.replace(/^\/+/, ""));
    } else {
        addPreviewResourceCandidate(candidates, joinProjectPath(baseDir, rawPath));
        addPreviewResourceCandidate(candidates, rawPath);
    }
    try {
        const decodedPath = decodeURIComponent(rawPath);
        if (decodedPath !== rawPath) {
            if (decodedPath.startsWith("/")) {
                addPreviewResourceCandidate(candidates, decodedPath.replace(/^\/+/, ""));
            } else {
                addPreviewResourceCandidate(candidates, joinProjectPath(baseDir, decodedPath));
                addPreviewResourceCandidate(candidates, decodedPath);
            }
        }
    } catch (e) {
    }
    for (const candidate of candidates) {
        if (candidate && resourceMap.has(candidate)) {
            return {
                resource: resourceMap.get(candidate),
                suffix: parts.suffix
            };
        }
    }
    return null;
}
function textResourceToDataUrl(resource, resourceMap, seenPaths) {

    const mimeType = resource.mime_type || "text/plain";
    let content = resource.content || "";
    if (mimeType === "text/css") {
        content = rewriteCssResourceReferences(content, resource.path, resourceMap, seenPaths);
    }
    return `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;
}

function getPreviewResourceUrl(rawValue, basePath, resourceMap) {
    const resolved = findPreviewResource(rawValue, basePath, resourceMap);
    if (!resolved) {
        return "";
    }
    const resource = resolved.resource;
    const url = resource.kind === "asset" ? resource.url : textResourceToDataUrl(resource, resourceMap);
    if (!url) {
        return "";
    }
    if (!resolved.suffix || url.startsWith("data:")) {
        return url;
    }
    return url + resolved.suffix;
}

function getPreviewResourceUrlForCss(rawValue, cssPath, resourceMap, seenPaths) {
    const resolved = findPreviewResource(rawValue, cssPath, resourceMap);
    if (!resolved) {
        return "";
    }
    const resource = resolved.resource;
    if (resource.kind === "asset") {
        return resource.url || "";
    }
    const pathKey = resource.path || "";
    if (pathKey && seenPaths && seenPaths.has(pathKey)) {
        return "";
    }
    const nextSeenPaths = new Set(seenPaths || []);
    if (pathKey) {
        nextSeenPaths.add(pathKey);
    }
    return textResourceToDataUrl(resource, resourceMap, nextSeenPaths);
}

function rewriteCssResourceUrls(cssText, cssPath, resourceMap, seenPaths) {
    return String(cssText || "").replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, function (match, quote, urlValue) {
        const nextUrl = getPreviewResourceUrlForCss(urlValue, cssPath, resourceMap, seenPaths);
        if (!nextUrl) {
            return match;
        }
        return `url("${nextUrl.replace(/"/g, "%22")}")`;
    });
}

function rewriteCssImportUrls(cssText, cssPath, resourceMap, seenPaths) {
    return String(cssText || "").replace(/@import\s+(?:url\(\s*)?(['"]?)([^'")\s]+)\1\s*\)?([^;]*);/g, function (match, quote, urlValue, mediaQuery) {
        const nextUrl = getPreviewResourceUrlForCss(urlValue, cssPath, resourceMap, seenPaths);
        if (!nextUrl) {
            return match;
        }
        return `@import url("${nextUrl.replace(/"/g, "%22")}")${mediaQuery || ""};`;
    });
}

function rewriteCssResourceReferences(cssText, cssPath, resourceMap, seenPaths) {
    const nextSeenPaths = new Set(seenPaths || []);
    const pathKey = safeNormalizePath(cssPath || "");
    if (pathKey) {
        nextSeenPaths.add(pathKey);
    }
    return rewriteCssImportUrls(
        rewriteCssResourceUrls(cssText, cssPath, resourceMap, nextSeenPaths),
        cssPath,
        resourceMap,
        nextSeenPaths
    );
}

function rewritePreviewSrcset(value, basePath, resourceMap) {
    if (/\bdata:/i.test(String(value || ""))) {
        return value;
    }
    return String(value || "").split(",").map(part => {
        const item = part.trim();
        if (!item) {
            return part;
        }
        const pieces = item.split(/\s+/);
        const nextUrl = getPreviewResourceUrl(pieces[0], basePath, resourceMap);
        if (!nextUrl) {
            return item;
        }
        return [nextUrl].concat(pieces.slice(1)).join(" ");
    }).join(", ");
}

function appendPreviewRuntime(doc, options) {
    const opts = options || {};
    const head = doc.head || doc.documentElement;
    function appendScript(id, src, fallbackSrc) {
        if (doc.getElementById(id)) {
            return;
        }
        const script = doc.createElement("script");
        script.id = id;
        script.crossOrigin = "anonymous";
        script.src = src;
        if (fallbackSrc) {
            script.onerror = function () {
                if (script.dataset.codemarkFallbackLoaded === "true") {
                    return;
                }
                script.dataset.codemarkFallbackLoaded = "true";
                script.src = fallbackSrc;
            };
        }
        head.appendChild(script);
    }
    function appendInlineScript(id, content) {
        if (doc.getElementById(id)) {
            return;
        }
        const script = doc.createElement("script");
        script.id = id;
        script.textContent = content;
        head.appendChild(script);
    }
    if (opts.tailwind && !doc.querySelector('script[src*="tailwindcss"],script[src*="@tailwindcss/browser"]')) {
        appendScript(
            "codemark-preview-tailwind",
            "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.2.4",
            "https://cdn.tailwindcss.com/3.4.17"
        );
    }
    if (opts.react) {
        appendScript("codemark-preview-react", "https://unpkg.com/react@18/umd/react.development.js");
        appendScript("codemark-preview-react-dom", "https://unpkg.com/react-dom@18/umd/react-dom.development.js");
    }
    if (opts.lucide) {
        appendInlineScript("codemark-preview-react-global-alias", "window.react = window.React;");
        appendScript("codemark-preview-lucide-react", "https://cdn.jsdelivr.net/npm/lucide-react@1.0.0/dist/umd/lucide-react.js");
    }
    if (opts.babel) {
        appendScript("codemark-preview-babel", "https://unpkg.com/@babel/standalone/babel.min.js");
    }
}

function getBabelPresetsForPath(path) {
    const ext = getPathExtension(path);
    return ext === "ts" || ext === "tsx" ? "env,react,typescript" : "env,react";
}

function setInlineScriptContent(script, content) {
    script.textContent = String(content || "").replace(/<\/script/gi, "<\\/script");
}

function collectNamedImports(code, packageName) {
    const names = new Set();
    const escapedPackage = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const importRe = new RegExp("import\\s+(?:[A-Za-z_$][\\w$]*\\s*,\\s*)?\\{([^}]+)\\}\\s+from\\s+[\"']" + escapedPackage + "[\"'];?", "g");
    let match;
    while ((match = importRe.exec(code)) !== null) {
        match[1].split(",").forEach(item => {
            const part = item.trim();
            if (!part) {
                return;
            }
            const aliasParts = part.split(/\s+as\s+/i).map(value => value.trim()).filter(Boolean);
            if (aliasParts.length === 2) {
                names.add(`${aliasParts[0]}: ${aliasParts[1]}`);
            } else {
                names.add(aliasParts[0]);
            }
        });
    }
    return Array.from(names);
}

function collectNamespaceImports(code, packageName) {
    const names = new Set();
    const escapedPackage = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const importRe = new RegExp("import\\s+\\*\\s+as\\s+([A-Za-z_$][\\w$]*)\\s+from\\s+[\"']" + escapedPackage + "[\"'];?", "g");
    let match;
    while ((match = importRe.exec(code)) !== null) {
        names.add(match[1]);
    }
    return Array.from(names);
}

function hasPackageImport(code, packageName) {
    const escapedPackage = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const fromRe = new RegExp("\\bfrom\\s+[\"']" + escapedPackage + "[\"']");
    const sideEffectRe = new RegExp("^\\s*import\\s+[\"']" + escapedPackage + "[\"'];?", "m");
    return fromRe.test(code) || sideEffectRe.test(code);
}

function stripStaticImportStatements(code) {
    return String(code || "").replace(/^\s*import\s+(?:[\s\S]*?\s+from\s+)?["'][^"']+["'];?\s*/gm, "");
}

function usesLucideReactPackage(code) {
    return hasPackageImport(String(code || ""), "lucide-react");
}

function looksLikeTailwindCode(content) {
    const code = String(content || "");
    if (/tailwindcss|cdn\.tailwindcss\.com/.test(code)) {
        return true;
    }
    if (!/(?:className|class)\s*=/.test(code)) {
        return false;
    }
    return /\b(?:sm:|md:|lg:|xl:|2xl:|dark:|hover:|focus:|active:|disabled:|group-hover:|bg-|text-|font-|flex\b|grid\b|items-|justify-|gap-|p[trblxy]?-\d|m[trblxy]?-\d|w-\d|h-\d|min-h-|max-w-|rounded|shadow|border)\b/.test(code);
}

function defaultFilenameForContent(language, content) {
    if (looksLikeReactCode(content)) {
        return "main.jsx";
    }
    return defaultFilenameForLanguage(language);
}

function prepareReactPreviewCode(code) {
    const rawCode = String(code || "");
    const reactImports = collectNamedImports(rawCode, "react");
    const reactDomImports = collectNamedImports(rawCode, "react-dom/client")
        .concat(collectNamedImports(rawCode, "react-dom"));
    const lucideImports = collectNamedImports(rawCode, "lucide-react");
    const lucideNamespaces = collectNamespaceImports(rawCode, "lucide-react");
    let nextCode = stripStaticImportStatements(rawCode)
        .replace(/^\s*export\s+default\s+/gm, "")
        .replace(/^\s*export\s+(?=(function|class|const|let|var)\s+)/gm, "")
        .replace(/^\s*export\s+\{[^}]+\};?\s*$/gm, "");
    const prelude = [];
    if (reactImports.length) {
        prelude.push(`const { ${reactImports.join(", ")} } = React;`);
    }
    if (reactDomImports.length) {
        prelude.push(`const { ${Array.from(new Set(reactDomImports)).join(", ")} } = ReactDOM;`);
    }
    if (lucideImports.length) {
        prelude.push(`const { ${lucideImports.join(", ")} } = LucideReact;`);
    }
    lucideNamespaces.forEach(name => {
        prelude.push(`const ${name} = LucideReact;`);
    });
    if (!/(createRoot\s*\(|ReactDOM\.render\s*\()/m.test(nextCode)
        && /(?:function|class)\s+App\b|(?:const|let|var)\s+App\s*=/.test(nextCode)) {
        nextCode += "\n\nconst codemarkPreviewRoot = document.getElementById('root');\n";
        nextCode += "ReactDOM.createRoot(codemarkPreviewRoot).render(<App />);\n";
    }
    return prelude.concat(nextCode).join("\n");
}

function appendProjectCssToDocument(doc, resourceMap) {
    const head = doc.head || doc.documentElement;
    for (const file of projectFiles) {
        if (!file || file.kind !== "text") {
            continue;
        }
        const ext = getPathExtension(file.path);
        if (ext !== "css") {
            continue;
        }
        const style = doc.createElement("style");
        style.setAttribute("data-codemark-preview", file.path);
        style.textContent = rewriteCssResourceReferences(file.content || "", file.path, resourceMap);
        head.appendChild(style);
    }
}

function buildReactPreviewDocument(file) {
    const resourceMap = buildPreviewResourceMap();
    const doc = document.implementation.createHTMLDocument("Preview");
    const meta = doc.createElement("meta");
    meta.setAttribute("charset", "UTF-8");
    doc.head.appendChild(meta);
    const viewport = doc.createElement("meta");
    viewport.name = "viewport";
    viewport.content = "width=device-width, initial-scale=1.0";
    doc.head.appendChild(viewport);
    const baseStyle = doc.createElement("style");
    baseStyle.textContent = "html,body,#root{min-height:100%;margin:0;}body{font-family:system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;}";
    doc.head.appendChild(baseStyle);
    appendProjectCssToDocument(doc, resourceMap);
    const root = doc.createElement("div");
    root.id = "root";
    doc.body.appendChild(root);
    appendPreviewRuntime(doc, {
        react: true,
        babel: true,
        lucide: usesLucideReactPackage(file.content || ""),
        tailwind: looksLikeTailwindCode(file.content || "")
    });
    const script = doc.createElement("script");
    script.type = "text/babel";
    script.setAttribute("data-presets", getBabelPresetsForPath(file.path));
    setInlineScriptContent(script, prepareReactPreviewCode(file.content || ""));
    doc.body.appendChild(script);
    return "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
}

function buildHtmlPreviewDocument(file) {
    const resourceMap = buildPreviewResourceMap();
    const parser = new DOMParser();
    const doc = parser.parseFromString(file.content || "", "text/html");
    let needsReactRuntime = false;
    let needsBabelRuntime = false;
    let needsLucideRuntime = usesLucideReactPackage(file.content || "");
    const needsTailwindRuntime = looksLikeTailwindCode(file.content || "");

    doc.querySelectorAll("link[href]").forEach(link => {
        const href = link.getAttribute("href") || "";
        const resolved = findPreviewResource(href, file.path, resourceMap);
        if (!resolved) {
            return;
        }
        const rel = (link.getAttribute("rel") || "").toLowerCase();
        if (rel.indexOf("stylesheet") >= 0 && resolved.resource.kind === "text") {
            const style = doc.createElement("style");
            style.setAttribute("data-codemark-preview", resolved.resource.path);
            style.textContent = rewriteCssResourceReferences(resolved.resource.content || "", resolved.resource.path, resourceMap);
            link.parentNode.replaceChild(style, link);
            return;
        }
        const nextUrl = getPreviewResourceUrl(href, file.path, resourceMap);
        if (nextUrl) {
            link.setAttribute("href", nextUrl);
        }
    });

    doc.querySelectorAll("script[src]").forEach(script => {
        const src = script.getAttribute("src") || "";
        const resolved = findPreviewResource(src, file.path, resourceMap);
        if (!resolved) {
            return;
        }
        if (resolved.resource.kind === "text") {
            script.removeAttribute("src");
            const ext = getPathExtension(resolved.resource.path);
            if (ext === "jsx" || ext === "tsx") {
                script.type = "text/babel";
                script.setAttribute("data-presets", getBabelPresetsForPath(resolved.resource.path));
                setInlineScriptContent(script, prepareReactPreviewCode(resolved.resource.content || ""));
                needsReactRuntime = true;
                needsBabelRuntime = true;
                needsLucideRuntime = needsLucideRuntime || usesLucideReactPackage(resolved.resource.content || "");
            } else {
                setInlineScriptContent(script, resolved.resource.content || "");
            }
            return;
        }
        const nextUrl = getPreviewResourceUrl(src, file.path, resourceMap);
        if (nextUrl) {
            script.setAttribute("src", nextUrl);
        }
    });

    doc.querySelectorAll("script").forEach(script => {
        const type = (script.getAttribute("type") || "").toLowerCase();
        if (type === "text/babel" || type === "text/jsx") {
            const scriptCode = script.textContent || "";
            needsReactRuntime = true;
            needsBabelRuntime = true;
            needsLucideRuntime = needsLucideRuntime || usesLucideReactPackage(scriptCode);
            if (!script.getAttribute("data-presets")) {
                script.setAttribute("data-presets", "env,react");
            }
            setInlineScriptContent(script, prepareReactPreviewCode(scriptCode));
        }
    });

    doc.querySelectorAll("style").forEach(style => {
        style.textContent = rewriteCssResourceReferences(style.textContent || "", file.path, resourceMap);
    });

    doc.querySelectorAll("[style]").forEach(el => {
        el.setAttribute("style", rewriteCssResourceReferences(el.getAttribute("style") || "", file.path, resourceMap));
    });

    ["src", "poster", "href", "data"].forEach(attr => {
        doc.querySelectorAll(`[${attr}]`).forEach(el => {
            if ((el.tagName || "").toLowerCase() === "script" && attr === "src") {
                return;
            }
            if ((el.tagName || "").toLowerCase() === "link" && attr === "href") {
                return;
            }
            const value = el.getAttribute(attr) || "";
            const nextUrl = getPreviewResourceUrl(value, file.path, resourceMap);
            if (nextUrl) {
                el.setAttribute(attr, nextUrl);
            }
        });
    });

    doc.querySelectorAll("[xlink\\:href]").forEach(el => {
        const value = el.getAttribute("xlink:href") || "";
        const nextUrl = getPreviewResourceUrl(value, file.path, resourceMap);
        if (nextUrl) {
            el.setAttribute("xlink:href", nextUrl);
        }
    });

    ["srcset", "imagesrcset"].forEach(attr => {
        doc.querySelectorAll(`[${attr}]`).forEach(el => {
            const value = el.getAttribute(attr) || "";
            const nextValue = rewritePreviewSrcset(value, file.path, resourceMap);
            if (nextValue && nextValue !== value) {
                el.setAttribute(attr, nextValue);
            }
        });
    });

    if (needsReactRuntime || needsBabelRuntime || needsLucideRuntime || needsTailwindRuntime) {
        appendPreviewRuntime(doc, {
            react: needsReactRuntime || needsLucideRuntime,
            babel: needsBabelRuntime,
            lucide: needsLucideRuntime,
            tailwind: needsTailwindRuntime
        });
    }
    return "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
}

function refreshHtmlPreview(immediate) {
    if (htmlPreviewRefreshTimer) {
        clearTimeout(htmlPreviewRefreshTimer);
        htmlPreviewRefreshTimer = null;
    }
    const runRefresh = function () {
        const effectiveMode = getEffectiveShareViewMode();
        if (effectiveMode !== SHARE_VIEW_PREVIEW && effectiveMode !== SHARE_VIEW_SPLIT) {
            return;
        }
        syncActiveEditorToProject();
        const active = getActiveProjectFile();
        if (!isHtmlPreviewableFile(active)) {
            return;
        }
        const frame = document.getElementById("htmlPreviewFrame");
        if (!frame) {
            return;
        }
        frame.srcdoc = shouldBuildReactPreviewDocument(active)
            ? buildReactPreviewDocument(active)
            : buildHtmlPreviewDocument(active);
    };
    if (immediate) {
        runRefresh();
        return;
    }
    htmlPreviewRefreshTimer = setTimeout(runRefresh, 180);
}

function refreshHtmlPreviewSoon() {
    const effectiveMode = getEffectiveShareViewMode();
    if (effectiveMode === SHARE_VIEW_PREVIEW || effectiveMode === SHARE_VIEW_SPLIT) {
        refreshHtmlPreview(false);
    }
}
