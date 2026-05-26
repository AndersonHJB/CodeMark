/* Sharecode HTML/React/Markdown preview rendering and resource rewriting. */
let markdownItRenderer = null;
let markdownSplitScrollSyncBound = false;
let markdownSplitEditorScrollFrame = null;
let markdownSplitPreviewScrollFrame = null;
let markdownSplitScrollSyncLock = "";
let markdownSplitScrollSyncUnlockTimer = null;
let markdownSplitPendingPreviewSourceLine = 1;
let markdownSplitLastEditorSyncAt = 0;

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
    applyShareViewToWorkspace({immediate: true, forceFrame: true, updateUrl: true});
    editorArea.classList.add("is-preview-fullscreen");
    updatePreviewFullscreenButton();
    scheduleHtmlPreviewVisibleRefresh({forceFrame: true});
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

function isMarkdownDocumentFile(file) {
    if (!file || file.kind !== "text") {
        return false;
    }
    const ext = getPathExtension(file.path);
    const language = file.language || detectLanguageFromFilename(file.path);
    return language === "markdown" || ["md", "markdown", "mdown", "mkdn", "mkd"].includes(ext);
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
    return isHtmlDocumentFile(file) || isReactPreviewFile(file) || isMarkdownDocumentFile(file);
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

function isHtmlPreviewVisibleForRefresh() {
    const effectiveMode = getEffectiveShareViewMode();
    return effectiveMode === SHARE_VIEW_PREVIEW
        || effectiveMode === SHARE_VIEW_SPLIT
        || isHtmlPreviewFullscreenActive();
}

function scheduleHtmlPreviewVisibleRefresh(options) {
    const opts = options || {};
    const requestId = ++htmlPreviewVisibleRefreshRequestId;

    function runRefresh() {
        if (requestId !== htmlPreviewVisibleRefreshRequestId || !isHtmlPreviewVisibleForRefresh()) {
            return;
        }
        refreshHtmlPreview(true, {forceFrame: opts.forceFrame === true});
        const writeToken = String(htmlPreviewFrameWriteToken || "");
        setTimeout(function () {
            const frame = document.getElementById("htmlPreviewFrame");
            if (requestId !== htmlPreviewVisibleRefreshRequestId
                || !frame
                || !isHtmlPreviewVisibleForRefresh()
                || !writeToken) {
                return;
            }
            if (frame.dataset.codemarkPreviewWriteToken === writeToken
                && frame.dataset.codemarkPreviewLoadedToken !== writeToken) {
                refreshHtmlPreview(true, {forceFrame: true});
            }
        }, 900);
    }

    if (window.requestAnimationFrame) {
        window.requestAnimationFrame(function () {
            window.requestAnimationFrame(runRefresh);
        });
    } else {
        setTimeout(runRefresh, 0);
    }
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
            updateMarkdownSplitScrollSyncState();
            requestSyncMarkdownPreviewToEditor();
        }, 0);
    }
}

function isMarkdownSplitScrollSyncActive() {
    return getEffectiveShareViewMode() === SHARE_VIEW_SPLIT
        && isMarkdownDocumentFile(getActiveProjectFile())
        && !isHtmlPreviewFullscreenActive();
}

function getMarkdownSplitPreviewFrame() {
    return document.getElementById("htmlPreviewFrame");
}

function getEditorDocumentRowForScreenRow(screenRow) {
    if (!window.editor || !window.editor.session) {
        return screenRow;
    }
    const session = window.editor.session;
    if (typeof session.screenToDocumentPosition === "function") {
        return session.screenToDocumentPosition(screenRow, 0).row;
    }
    if (typeof session.screenToDocumentRow === "function") {
        return session.screenToDocumentRow(screenRow, 0);
    }
    return screenRow;
}

function getEditorScreenRowForDocumentRow(documentRow) {
    if (!window.editor || !window.editor.session) {
        return documentRow;
    }
    const session = window.editor.session;
    if (typeof session.documentToScreenPosition === "function") {
        return session.documentToScreenPosition(documentRow, 0).row;
    }
    if (typeof session.documentToScreenRow === "function") {
        return session.documentToScreenRow(documentRow, 0);
    }
    return documentRow;
}

function getEditorLineHeight() {
    if (!window.editor || !window.editor.renderer) {
        return 16;
    }
    return window.editor.renderer.lineHeight
        || (window.editor.renderer.layerConfig && window.editor.renderer.layerConfig.lineHeight)
        || 16;
}

function getEditorVisibleMarkdownLineInfo() {
    if (!window.editor || !window.editor.renderer || !window.editor.session) {
        return null;
    }
    const renderer = window.editor.renderer;
    const session = window.editor.session;
    const lineHeight = getEditorLineHeight();
    const scrollTop = typeof session.getScrollTop === "function" ? session.getScrollTop() : (renderer.scrollTop || 0);
    const scrollerHeight = (renderer.$size && renderer.$size.scrollerHeight)
        || (renderer.container && renderer.container.clientHeight)
        || 0;
    const rawScreenTop = lineHeight > 0 ? scrollTop / lineHeight : 0;
    const firstScreenRow = Math.max(0, Math.floor(rawScreenTop));
    const nextScreenRow = firstScreenRow + 1;
    const lastScreenRow = Math.max(firstScreenRow, Math.floor((scrollTop + scrollerHeight) / lineHeight));
    const firstDocumentRow = Math.max(0, getEditorDocumentRowForScreenRow(firstScreenRow));
    const nextDocumentRow = Math.max(firstDocumentRow, getEditorDocumentRowForScreenRow(nextScreenRow));
    const lastDocumentRow = Math.max(firstDocumentRow, getEditorDocumentRowForScreenRow(lastScreenRow));
    const screenProgress = Math.max(0, Math.min(1, rawScreenTop - firstScreenRow));
    const sourceLine = firstDocumentRow + 1 + (nextDocumentRow - firstDocumentRow) * screenProgress;
    return {
        line: sourceLine,
        lastLine: lastDocumentRow + 1,
        totalLines: window.editor.session.getLength ? window.editor.session.getLength() : 1
    };
}

function getEditorScreenTopForSourceLine(sourceLine) {
    if (!window.editor || !window.editor.session) {
        return 0;
    }
    const maxRow = Math.max(0, window.editor.session.getLength() - 1);
    const rawRow = Math.max(0, Math.min((Number(sourceLine) || 1) - 1, maxRow));
    const rowStart = Math.floor(rawRow);
    const rowEnd = Math.min(maxRow, rowStart + 1);
    const progress = rawRow - rowStart;
    const screenStart = getEditorScreenRowForDocumentRow(rowStart);
    const screenEnd = getEditorScreenRowForDocumentRow(rowEnd);
    return (screenStart + (screenEnd - screenStart) * progress) * getEditorLineHeight();
}

function setMarkdownSplitSyncLock(source) {
    markdownSplitScrollSyncLock = source;
    if (markdownSplitScrollSyncUnlockTimer) {
        clearTimeout(markdownSplitScrollSyncUnlockTimer);
    }
    markdownSplitScrollSyncUnlockTimer = setTimeout(function () {
        markdownSplitScrollSyncLock = "";
        markdownSplitScrollSyncUnlockTimer = null;
    }, 80);
}

function syncMarkdownPreviewScrollToEditor() {
    markdownSplitEditorScrollFrame = null;
    if (!isMarkdownSplitScrollSyncActive() || markdownSplitScrollSyncLock === "preview") {
        return;
    }
    const frame = getMarkdownSplitPreviewFrame();
    const editorInfo = getEditorVisibleMarkdownLineInfo();
    if (!frame || !frame.contentWindow || !editorInfo) {
        return;
    }

    setMarkdownSplitSyncLock("editor");
    markdownSplitLastEditorSyncAt = Date.now();
    frame.contentWindow.postMessage({
        type: "codemark:markdown-sync-source-line",
        sourceLine: editorInfo.line,
        lastLine: editorInfo.lastLine,
        totalLines: editorInfo.totalLines
    }, "*");
}

function syncMarkdownEditorScrollToPreview() {
    markdownSplitPreviewScrollFrame = null;
    if (!isMarkdownSplitScrollSyncActive() || markdownSplitScrollSyncLock === "editor") {
        return;
    }
    if (!window.editor || !window.editor.session) {
        return;
    }

    const sourceLine = Math.max(1, Number(markdownSplitPendingPreviewSourceLine) || 1);
    const targetTop = getEditorScreenTopForSourceLine(sourceLine);

    setMarkdownSplitSyncLock("preview");
    if (typeof window.editor.session.setScrollTop === "function") {
        if (Math.abs(window.editor.session.getScrollTop() - targetTop) > 1) {
            window.editor.session.setScrollTop(targetTop);
        }
    } else if (typeof window.editor.scrollToLine === "function") {
        window.editor.scrollToLine(Math.max(0, Math.round(sourceLine - 1)), false, false);
    }
}

function requestSyncMarkdownPreviewToEditor() {
    if (!isMarkdownSplitScrollSyncActive() || markdownSplitEditorScrollFrame) {
        return;
    }
    markdownSplitEditorScrollFrame = window.requestAnimationFrame
        ? window.requestAnimationFrame(syncMarkdownPreviewScrollToEditor)
        : setTimeout(syncMarkdownPreviewScrollToEditor, 16);
}

function requestSyncMarkdownEditorToPreview() {
    if (!isMarkdownSplitScrollSyncActive() || markdownSplitPreviewScrollFrame) {
        return;
    }
    markdownSplitPreviewScrollFrame = window.requestAnimationFrame
        ? window.requestAnimationFrame(syncMarkdownEditorScrollToPreview)
        : setTimeout(syncMarkdownEditorScrollToPreview, 16);
}

function handleMarkdownSplitPreviewMessage(event) {
    const frame = getMarkdownSplitPreviewFrame();
    if (!frame || event.source !== frame.contentWindow) {
        return;
    }
    const data = event.data || {};
    if (data.type === "codemark:markdown-preview-ready") {
        requestSyncMarkdownPreviewToEditor();
        return;
    }
    if (data.type !== "codemark:markdown-preview-scroll") {
        return;
    }
    const sourceLine = Number(data.sourceLine);
    if (!Number.isFinite(sourceLine) || sourceLine < 1) {
        return;
    }
    if (Date.now() - markdownSplitLastEditorSyncAt < 180) {
        return;
    }
    markdownSplitPendingPreviewSourceLine = sourceLine;
    requestSyncMarkdownEditorToPreview();
}

function updateMarkdownSplitScrollSyncState() {
    bindMarkdownSplitScrollSync();
    if (isMarkdownSplitScrollSyncActive()) {
        requestSyncMarkdownPreviewToEditor();
    }
}

function bindMarkdownSplitScrollSync() {
    if (markdownSplitScrollSyncBound || !window.editor || !window.editor.session) {
        return;
    }
    markdownSplitScrollSyncBound = true;
    window.editor.session.on("changeScrollTop", function () {
        requestSyncMarkdownPreviewToEditor();
    });
    window.addEventListener("message", handleMarkdownSplitPreviewMessage);
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
            refreshHtmlPreview(opts.immediate === true, {forceFrame: opts.forceFrame === true});
            scheduleHtmlPreviewVisibleRefresh({forceFrame: true});
        }
    } else if (shareViewMode === SHARE_VIEW_SPLIT && canPreview) {
        showSplitPreviewPane();
        if (!opts.skipRefresh) {
            refreshHtmlPreview(opts.immediate === true, {forceFrame: opts.forceFrame === true});
            scheduleHtmlPreviewVisibleRefresh({forceFrame: true});
        }
    } else {
        showSourcePaneForActiveFile();
        if (canPreview && !opts.skipRefresh) {
            refreshHtmlPreview(opts.immediate === true, {allowHidden: true});
        }
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
        forceFrame: true,
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
    if (["md", "markdown", "mdown", "mkdn", "mkd"].includes(ext)) return "text/markdown";
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

function appendPreviewHashNavigationRuntime(doc) {
    const body = doc.body || doc.documentElement;
    if (!body || doc.getElementById("codemark-preview-hash-navigation")) {
        return;
    }
    const script = doc.createElement("script");
    script.id = "codemark-preview-hash-navigation";
    setInlineScriptContent(script, `
(function () {
    function findAnchorTarget(eventTarget) {
        var node = eventTarget && eventTarget.nodeType === 1 ? eventTarget : eventTarget && eventTarget.parentElement;
        if (!node || !node.closest) {
            return null;
        }
        return node.closest("a[href]");
    }

    function decodeHashId(hash) {
        var raw = String(hash || "").replace(/^#/, "");
        try {
            return decodeURIComponent(raw);
        } catch (e) {
            return raw;
        }
    }

    function updateHash(hash) {
        if (!hash || hash === "#") {
            return;
        }
        try {
            var previous = window.location.href;
            window.history.pushState(null, "", hash);
            if (typeof HashChangeEvent === "function") {
                window.dispatchEvent(new HashChangeEvent("hashchange", {
                    oldURL: previous,
                    newURL: window.location.href
                }));
            } else {
                window.dispatchEvent(new Event("hashchange"));
            }
        } catch (e) {
        }
    }

    function scrollToHash(hash) {
        if (!hash || hash === "#") {
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
        }
        var id = decodeHashId(hash);
        var target = document.getElementById(id) || document.getElementsByName(id)[0];
        updateHash(hash);
        if (!target) {
            return;
        }
        var behavior = "auto";
        try {
            behavior = getComputedStyle(document.documentElement).scrollBehavior === "smooth" ? "smooth" : "auto";
        } catch (e) {
        }
        try {
            target.scrollIntoView({ behavior: behavior, block: "start" });
        } catch (e) {
            target.scrollIntoView();
        }
    }

    document.addEventListener("click", function (event) {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
        }
        var anchor = findAnchorTarget(event.target);
        if (!anchor) {
            return;
        }
        var href = (anchor.getAttribute("href") || "").trim();
        if (!href || href.charAt(0) !== "#") {
            return;
        }
        event.preventDefault();
        scrollToHash(href);
    });
})();
`);
    body.appendChild(script);
}

function resolvePreviewDocumentUrl(rawUrl) {
    try {
        return new URL(rawUrl, window.location.href).toString();
    } catch (e) {
        return rawUrl;
    }
}

function normalizeMarkdownHighlightLanguage(rawLanguage) {
    const lang = String(rawLanguage || "").trim().toLowerCase();
    const aliases = {
        "c++": "cpp",
        c_cpp: "cpp",
        golang: "go",
        html: "xml",
        js: "javascript",
        jsx: "javascript",
        py: "python",
        python3: "python",
        ts: "typescript",
        tsx: "typescript"
    };
    return aliases[lang] || lang;
}

function highlightMarkdownCode(code, rawLanguage) {
    if (!window.hljs) {
        return escapeHtml(code);
    }
    const language = normalizeMarkdownHighlightLanguage(rawLanguage);
    try {
        if (language && window.hljs.getLanguage && window.hljs.getLanguage(language)) {
            return window.hljs.highlight(String(code || ""), {
                language,
                ignoreIllegals: true
            }).value;
        }
        return window.hljs.highlightAuto(String(code || "")).value;
    } catch (e) {
        return escapeHtml(code);
    }
}

function getMarkdownPlugin(pluginNames) {
    for (const pluginName of pluginNames) {
        if (typeof window[pluginName] === "function") {
            return window[pluginName];
        }
    }
    return null;
}

function useMarkdownPlugin(markdownRenderer, pluginNames, options) {
    const plugin = getMarkdownPlugin(pluginNames);
    if (!plugin) {
        return false;
    }
    try {
        markdownRenderer.use(plugin, options || {});
        return true;
    } catch (e) {
        return false;
    }
}

function slugifyMarkdownHeading(rawText) {
    const text = String(rawText || "")
        .trim()
        .toLowerCase()
        .replace(/<[^>]+>/g, "")
        .replace(/[^\w\u00a0-\uffff -]+/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    return text || "section";
}

function installMarkdownFenceRenderer(markdownRenderer) {
    const defaultFence = markdownRenderer.renderer.rules.fence || function (tokens, idx, options, env, slf) {
        return slf.renderToken(tokens, idx, options);
    };
    markdownRenderer.renderer.rules.fence = function (tokens, idx, options, env, slf) {
        const token = tokens[idx];
        const info = token.info ? token.info.trim() : "";
        const language = info.split(/\s+/)[0].toLowerCase();
        if (language === "mermaid") {
            const sourceLine = token.attrGet ? token.attrGet("data-codemark-source-line") : "";
            const sourceLineAttr = sourceLine ? ` data-codemark-source-line="${escapeHtml(sourceLine)}"` : "";
            return `<div class="mermaid"${sourceLineAttr}>${escapeHtml(token.content)}</div>\n`;
        }
        return defaultFence(tokens, idx, options, env, slf);
    };
}

function shouldMarkMarkdownTokenSourceLine(token) {
    if (!token || !token.map || !token.map.length || !token.tag || token.type === "inline") {
        return false;
    }
    return token.nesting !== -1;
}

function renderMarkdownWithSourceLineMarkers(markdownRenderer, source) {
    if (!markdownRenderer
        || typeof markdownRenderer.parse !== "function"
        || !markdownRenderer.renderer
        || typeof markdownRenderer.renderer.render !== "function") {
        return markdownRenderer && typeof markdownRenderer.render === "function"
            ? markdownRenderer.render(source)
            : `<pre data-codemark-source-line="1"><code>${escapeHtml(source)}</code></pre>`;
    }
    const env = {};
    const tokens = markdownRenderer.parse(String(source || ""), env);
    tokens.forEach(token => {
        if (shouldMarkMarkdownTokenSourceLine(token) && typeof token.attrSet === "function") {
            token.attrSet("data-codemark-source-line", String(token.map[0] + 1));
        }
    });
    return markdownRenderer.renderer.render(tokens, markdownRenderer.options, env);
}

function getMarkdownRenderer() {
    if (markdownItRenderer) {
        return markdownItRenderer;
    }
    if (typeof window.markdownit !== "function") {
        markdownItRenderer = {
            render: function (source) {
                return `<pre><code>${escapeHtml(source)}</code></pre>`;
            }
        };
        return markdownItRenderer;
    }

    const renderer = window.markdownit({
        html: true,
        linkify: true,
        typographer: true,
        breaks: false,
        highlight: function (code, rawLanguage) {
            return highlightMarkdownCode(code, rawLanguage);
        }
    });

    useMarkdownPlugin(renderer, ["markdownItAnchor", "markdownitAnchor"], {
        slugify: slugifyMarkdownHeading
    });
    useMarkdownPlugin(renderer, ["markdownitFootnote", "markdownItFootnote"]);
    useMarkdownPlugin(renderer, ["markdownitDeflist", "markdownItDeflist"]);
    useMarkdownPlugin(renderer, ["markdownitAbbr", "markdownItAbbr"]);
    useMarkdownPlugin(renderer, ["markdownitSub", "markdownItSub"]);
    useMarkdownPlugin(renderer, ["markdownitSup", "markdownItSup"]);
    useMarkdownPlugin(renderer, ["markdownitMark", "markdownItMark"]);
    useMarkdownPlugin(renderer, ["markdownitTaskLists", "markdownItTaskLists"], {
        enabled: true,
        label: true,
        labelAfter: true
    });
    useMarkdownPlugin(renderer, ["markdownItAttrs", "markdownitAttrs"]);
    useMarkdownPlugin(renderer, ["markdownitAdmon", "markdownItAdmon"]);
    useMarkdownPlugin(renderer, ["markdownitEmoji", "markdownItEmoji"]);
    installMarkdownFenceRenderer(renderer);

    markdownItRenderer = renderer;
    return markdownItRenderer;
}

function fallbackSanitizeMarkdownHtml(markup) {
    const template = document.createElement("template");
    template.innerHTML = String(markup || "");
    template.content.querySelectorAll("script, iframe, object, embed, form, meta, base").forEach(node => {
        node.remove();
    });
    template.content.querySelectorAll("*").forEach(node => {
        Array.from(node.attributes || []).forEach(attr => {
            const name = attr.name.toLowerCase();
            const value = String(attr.value || "").trim();
            if (name.startsWith("on") || /^(?:javascript|vbscript):/i.test(value)) {
                node.removeAttribute(attr.name);
            }
        });
    });
    return template.innerHTML;
}

function sanitizeMarkdownHtml(markup) {
    if (window.DOMPurify && typeof window.DOMPurify.sanitize === "function") {
        return window.DOMPurify.sanitize(String(markup || ""), {
            USE_PROFILES: {html: true},
            ADD_TAGS: ["input"],
            ADD_ATTR: [
                "align",
                "aria-hidden",
                "checked",
                "class",
                "data-codemark-source-line",
                "disabled",
                "id",
                "name",
                "rel",
                "target",
                "type"
            ]
        });
    }
    return fallbackSanitizeMarkdownHtml(markup);
}

function appendMarkdownPreviewStyles(doc) {
    const head = doc.head || doc.documentElement;
    const highlightCssPath = SHARECODE_STATIC_PATHS.highlightCssPath || "/static/css/default.min.css";
    if (highlightCssPath) {
        const highlightStyle = doc.createElement("link");
        highlightStyle.rel = "stylesheet";
        highlightStyle.href = resolvePreviewDocumentUrl(highlightCssPath);
        head.appendChild(highlightStyle);
    }

    const style = doc.createElement("style");
    style.textContent = `
:root {
    color-scheme: light;
}
html {
    scroll-behavior: smooth;
}
body {
    margin: 0;
    background: #f6f7f2;
    color: #22251f;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}
.markdown-body {
    width: min(100% - 48px, 980px);
    margin: 0 auto;
    padding: 42px 0 64px;
    font-size: 16px;
    line-height: 1.78;
}
.markdown-preview-shell {
    width: min(100% - 48px, 1240px);
    margin: 0 auto;
    padding: 42px 0 64px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 260px;
    gap: 36px;
    align-items: start;
}
.markdown-preview-shell .markdown-body {
    width: auto;
    max-width: none;
    margin: 0;
    padding: 0;
    min-width: 0;
}
.markdown-body > :first-child {
    margin-top: 0;
}
.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
    color: #151812;
    font-weight: 750;
    line-height: 1.25;
    margin: 1.8em 0 0.7em;
    scroll-margin-top: 24px;
}
.markdown-body h1 {
    padding-bottom: 0.32em;
    border-bottom: 1px solid #d8dccf;
    font-size: 2.2em;
}
.markdown-body h2 {
    padding-bottom: 0.24em;
    border-bottom: 1px solid #e3e6dc;
    font-size: 1.58em;
}
.markdown-body h3 {
    font-size: 1.26em;
}
.markdown-body h4 {
    font-size: 1.08em;
}
.markdown-body p,
.markdown-body ul,
.markdown-body ol,
.markdown-body dl,
.markdown-body table,
.markdown-body blockquote,
.markdown-body pre,
.markdown-body details,
.markdown-body .admonition {
    margin-top: 0;
    margin-bottom: 1.05em;
}
.markdown-body a {
    color: #1666b1;
    text-decoration: none;
}
.markdown-body a:hover {
    text-decoration: underline;
}
.markdown-body .heading-anchor {
    margin-left: 0.35em;
    color: #9aa395;
    opacity: 0;
    font-size: 0.75em;
    text-decoration: none;
}
.markdown-body h1:hover .heading-anchor,
.markdown-body h2:hover .heading-anchor,
.markdown-body h3:hover .heading-anchor,
.markdown-body h4:hover .heading-anchor,
.markdown-body h5:hover .heading-anchor,
.markdown-body h6:hover .heading-anchor {
    opacity: 1;
}
.markdown-body img,
.markdown-body video {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
}
.markdown-body audio {
    width: 100%;
}
.markdown-body table {
    display: block;
    width: 100%;
    overflow: auto;
    border-spacing: 0;
    border-collapse: collapse;
}
.markdown-body th,
.markdown-body td {
    padding: 8px 12px;
    border: 1px solid #d8dccf;
}
.markdown-body th {
    background: #ecefe5;
    font-weight: 700;
}
.markdown-body tr:nth-child(2n) {
    background: #fafbf7;
}
.markdown-body blockquote {
    padding: 0 1em;
    color: #5f685c;
    border-left: 4px solid #b7c1ad;
}
.markdown-body code,
.markdown-body kbd {
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 0.92em;
}
.markdown-body :not(pre) > code {
    padding: 0.16em 0.36em;
    border-radius: 4px;
    background: #e9ece3;
    color: #b4374b;
}
.markdown-body pre {
    overflow: auto;
    padding: 16px;
    border-radius: 8px;
    background: #1f221b;
    color: #f4f5f0;
}
.markdown-body pre code {
    padding: 0;
    background: transparent;
    color: inherit;
    font-size: 0.9em;
}
.markdown-body hr {
    height: 1px;
    padding: 0;
    margin: 28px 0;
    background: #d8dccf;
    border: 0;
}
.markdown-body dl {
    padding: 0;
}
.markdown-body dt {
    margin-top: 12px;
    font-weight: 700;
}
.markdown-body dd {
    margin-left: 20px;
}
.markdown-body mark {
    padding: 0.08em 0.22em;
    border-radius: 3px;
    background: #fff1a6;
}
.markdown-body .contains-task-list {
    padding-left: 1.35em;
}
.markdown-body .task-list-item {
    list-style: none;
}
.markdown-body .task-list-item input[type="checkbox"] {
    margin: 0 0.5em 0 -1.35em;
    vertical-align: -0.1em;
}
.markdown-body .footnotes {
    margin-top: 2.4em;
    padding-top: 1em;
    border-top: 1px solid #d8dccf;
    color: #555f53;
    font-size: 0.92em;
}
.markdown-toc {
    padding: 14px 16px;
    border: 1px solid #d8dccf;
    border-radius: 8px;
    background: #ffffff;
}
.markdown-toc-title {
    margin-bottom: 8px;
    color: #50584c;
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
}
.markdown-toc ol {
    margin: 0;
    padding-left: 1.4em;
}
.markdown-toc li + li {
    margin-top: 4px;
}
.markdown-outline {
    position: sticky;
    top: 76px;
    max-height: calc(100vh - 104px);
    overflow: auto;
    padding: 14px 0 16px 18px;
    border-left: 1px solid #d6dccf;
    color: #596253;
    scrollbar-width: thin;
    scrollbar-color: #c5cebd transparent;
}
.markdown-outline-title {
    margin-bottom: 10px;
    color: #2d3329;
    font-size: 12px;
    font-weight: 850;
}
.markdown-outline-list {
    display: grid;
    gap: 2px;
}
.markdown-outline-link {
    position: relative;
    display: block;
    padding: 5px 8px;
    border-radius: 6px;
    color: #6a735f;
    font-size: 13px;
    line-height: 1.35;
    text-decoration: none;
    transition: color 0.15s ease, background 0.15s ease;
}
.markdown-outline-link:hover {
    background: #edf1e6;
    color: #26301f;
    text-decoration: none;
}
.markdown-outline-link.is-active {
    background: #e7f0d4;
    color: #1f3216;
    font-weight: 750;
}
.markdown-outline-link.is-active::before {
    content: "";
    position: absolute;
    left: -19px;
    top: 8px;
    bottom: 8px;
    width: 3px;
    border-radius: 999px;
    background: #88a52f;
}
.admonition {
    padding: 13px 15px;
    border-left: 4px solid #4f8fda;
    border-radius: 8px;
    background: #eef6fb;
}
.admonition-title {
    margin: 0 0 6px;
    font-weight: 800;
}
.admonition.warning,
.admonition.caution,
.admonition.danger,
.admonition.error {
    border-left-color: #d86b4a;
    background: #fff2ed;
}
.admonition.tip,
.admonition.success {
    border-left-color: #6a9f45;
    background: #f0f7e8;
}
.mermaid {
    margin: 1.2em 0;
    padding: 16px;
    border: 1px solid #d8dccf;
    border-radius: 8px;
    background: #ffffff;
    text-align: center;
}
@media (max-width: 720px) {
    .markdown-body {
        width: min(100% - 28px, 980px);
        padding: 28px 0 46px;
        font-size: 15px;
    }
    .markdown-body h1 {
        font-size: 1.72em;
    }
    .markdown-body h2 {
        font-size: 1.36em;
    }
}
@media (max-width: 1080px) {
    .markdown-preview-shell {
        display: block;
        width: min(100% - 48px, 980px);
    }
    .markdown-preview-shell .markdown-body {
        width: auto;
    }
    .markdown-outline {
        display: none;
    }
}
@media (max-width: 720px) {
    .markdown-preview-shell {
        width: min(100% - 28px, 980px);
        padding: 28px 0 46px;
    }
}
`;
    head.appendChild(style);
}

function addMarkdownHeadingIdsAndToc(doc) {
    const body = doc.querySelector(".markdown-body");
    if (!body) {
        return [];
    }
    const usedIds = new Set();
    const headings = Array.from(body.querySelectorAll("h1, h2, h3, h4, h5, h6"));
    const headingEntries = headings.map((heading, index) => {
        let id = heading.id || slugifyMarkdownHeading(heading.textContent || `section-${index + 1}`);
        let uniqueId = id;
        let suffix = 2;
        while (usedIds.has(uniqueId)) {
            uniqueId = `${id}-${suffix}`;
            suffix += 1;
        }
        usedIds.add(uniqueId);
        heading.id = uniqueId;
        if (!heading.querySelector(".heading-anchor")) {
            const anchor = doc.createElement("a");
            anchor.className = "heading-anchor";
            anchor.href = `#${encodeURIComponent(uniqueId)}`;
            anchor.setAttribute("aria-hidden", "true");
            anchor.textContent = "#";
            heading.appendChild(anchor);
        }
        return {
            id: uniqueId,
            level: Number((heading.tagName || "H1").slice(1)) || 1,
            text: (heading.textContent || "").replace(/#$/, "").trim() || uniqueId
        };
    });

    body.querySelectorAll("p").forEach(paragraph => {
        const text = (paragraph.textContent || "").trim().toLowerCase();
        if (text !== "[toc]" && text !== "[[toc]]") {
            return;
        }
        const nav = doc.createElement("nav");
        nav.className = "markdown-toc";
        const title = doc.createElement("div");
        title.className = "markdown-toc-title";
        title.textContent = "Contents";
        nav.appendChild(title);
        const list = doc.createElement("ol");
        headingEntries.forEach(entry => {
            const item = doc.createElement("li");
            item.style.marginLeft = `${Math.max(0, entry.level - 1) * 12}px`;
            const link = doc.createElement("a");
            link.href = `#${encodeURIComponent(entry.id)}`;
            link.textContent = entry.text;
            item.appendChild(link);
            list.appendChild(item);
        });
        nav.appendChild(list);
        paragraph.parentNode.replaceChild(nav, paragraph);
    });

    return headingEntries;
}

function addMarkdownOutline(doc, headingEntries) {
    const body = doc.body || doc.documentElement;
    const main = doc.querySelector(".markdown-body");
    const entries = Array.isArray(headingEntries) ? headingEntries : [];
    if (!body || !main || entries.length < 1) {
        return;
    }

    const shell = doc.createElement("div");
    shell.className = "markdown-preview-shell";
    main.parentNode.insertBefore(shell, main);
    shell.appendChild(main);

    const outline = doc.createElement("aside");
    outline.className = "markdown-outline";
    outline.setAttribute("aria-label", "Markdown 大纲");

    const title = doc.createElement("div");
    title.className = "markdown-outline-title";
    title.textContent = "大纲";
    outline.appendChild(title);

    const list = doc.createElement("nav");
    list.className = "markdown-outline-list";
    const baseLevel = entries.reduce((minLevel, entry) => Math.min(minLevel, entry.level || 1), 6);

    entries.forEach(entry => {
        const link = doc.createElement("a");
        link.className = "markdown-outline-link";
        link.href = `#${encodeURIComponent(entry.id)}`;
        link.textContent = entry.text;
        link.dataset.targetId = entry.id;
        const depth = Math.max(0, (entry.level || baseLevel) - baseLevel);
        link.style.paddingLeft = `${8 + depth * 13}px`;
        list.appendChild(link);
    });

    outline.appendChild(list);
    shell.appendChild(outline);
}

function appendMarkdownOutlineRuntime(doc) {
    const body = doc.body || doc.documentElement;
    if (!body || doc.getElementById("codemark-markdown-outline-runtime") || !doc.querySelector(".markdown-outline")) {
        return;
    }
    const script = doc.createElement("script");
    script.id = "codemark-markdown-outline-runtime";
    setInlineScriptContent(script, `
(function () {
    var links = Array.prototype.slice.call(document.querySelectorAll(".markdown-outline-link"));
    if (!links.length) {
        return;
    }
    var headings = links.map(function (link) {
        return document.getElementById(link.dataset.targetId || "");
    }).filter(Boolean);
    var activeId = "";
    var ticking = false;

    function decodeHashId(hash) {
        var raw = String(hash || "").replace(/^#/, "");
        try {
            return decodeURIComponent(raw);
        } catch (e) {
            return raw;
        }
    }

    function setActive(id) {
        if (!id || id === activeId) {
            return;
        }
        activeId = id;
        links.forEach(function (link) {
            link.classList.toggle("is-active", link.dataset.targetId === id);
        });
    }

    function updateActiveHeading() {
        ticking = false;
        if (!headings.length) {
            return;
        }
        var currentId = headings[0].id;
        var topBoundary = 16;
        var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        var scrollElement = document.scrollingElement || document.documentElement;
        var isNearBottom = viewportHeight > 0
            && scrollElement
            && Math.ceil(scrollElement.scrollTop + viewportHeight) >= scrollElement.scrollHeight - 4;
        if (isNearBottom) {
            for (var bottomIndex = 0; bottomIndex < headings.length; bottomIndex += 1) {
                var bottomRect = headings[bottomIndex].getBoundingClientRect();
                if (bottomRect.bottom > topBoundary && bottomRect.top < viewportHeight - 24) {
                    currentId = headings[bottomIndex].id;
                }
            }
            setActive(currentId);
            return;
        }
        var switchBoundary = Math.min(Math.max(viewportHeight * 0.42, 260), 520);
        for (var i = 0; i < headings.length; i += 1) {
            var rect = headings[i].getBoundingClientRect();
            if (rect.bottom > topBoundary && rect.top <= switchBoundary) {
                currentId = headings[i].id;
                break;
            }
            if (rect.top <= topBoundary) {
                currentId = headings[i].id;
            }
        }
        setActive(currentId);
    }

    function requestUpdate() {
        if (ticking) {
            return;
        }
        ticking = true;
        window.requestAnimationFrame(updateActiveHeading);
    }

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    window.addEventListener("hashchange", function () {
        setActive(decodeHashId(window.location.hash));
        requestUpdate();
    });
    window.addEventListener("load", requestUpdate);
    if (typeof ResizeObserver === "function") {
        try {
            new ResizeObserver(requestUpdate).observe(document.querySelector(".markdown-body"));
        } catch (e) {
        }
    }
    if (typeof MutationObserver === "function") {
        try {
            new MutationObserver(requestUpdate).observe(document.querySelector(".markdown-body"), {
                childList: true,
                subtree: true
            });
        } catch (e) {
        }
    }
    window.setTimeout(requestUpdate, 250);
    window.setTimeout(requestUpdate, 800);
    if (window.location.hash) {
        setActive(decodeHashId(window.location.hash));
    }
    requestUpdate();
})();
`);
    body.appendChild(script);
}

function appendMarkdownSplitScrollRuntime(doc) {
    const body = doc.body || doc.documentElement;
    if (!body || doc.getElementById("codemark-markdown-split-scroll-runtime")) {
        return;
    }
    const script = doc.createElement("script");
    script.id = "codemark-markdown-split-scroll-runtime";
    setInlineScriptContent(script, `
(function () {
    var messageTypes = {
        align: "codemark:markdown-sync-source-line",
        scroll: "codemark:markdown-preview-scroll",
        ready: "codemark:markdown-preview-ready"
    };
    var scrollLock = false;
    var unlockTimer = null;
    var pendingAlignFrame = null;
    var pendingAlignData = null;
    var pendingScrollFrame = null;
    var lastPostedLine = 0;
    var lastRequestedLine = 1;
    var lastRequestedLastLine = 1;
    var lastRequestedTotalLines = 1;
    var anchorsDirty = true;
    var anchorCache = [];
    var userScrollUntil = 0;

    function getScrollElement() {
        return document.scrollingElement || document.documentElement || document.body;
    }

    function getClientHeight(scrollElement) {
        return scrollElement.clientHeight || window.innerHeight || 0;
    }

    function getMaxScrollTop(scrollElement) {
        return Math.max(0, (scrollElement.scrollHeight || 0) - getClientHeight(scrollElement));
    }

    function setScrollTop(scrollElement, top) {
        var targetTop = Math.max(0, Math.min(top, getMaxScrollTop(scrollElement)));
        var rootStyle = document.documentElement && document.documentElement.style;
        var bodyStyle = document.body && document.body.style;
        var previousRootScrollBehavior = rootStyle ? rootStyle.scrollBehavior : "";
        var previousBodyScrollBehavior = bodyStyle ? bodyStyle.scrollBehavior : "";
        if (rootStyle) {
            rootStyle.scrollBehavior = "auto";
        }
        if (bodyStyle) {
            bodyStyle.scrollBehavior = "auto";
        }
        scrollElement.scrollTop = targetTop;
        if (document.documentElement && document.documentElement !== scrollElement) {
            document.documentElement.scrollTop = targetTop;
        }
        if (document.body && document.body !== scrollElement) {
            document.body.scrollTop = targetTop;
        }
        window.requestAnimationFrame(function () {
            if (rootStyle) {
                rootStyle.scrollBehavior = previousRootScrollBehavior;
            }
            if (bodyStyle) {
                bodyStyle.scrollBehavior = previousBodyScrollBehavior;
            }
        });
    }

    function getElementTop(element, scrollElement) {
        return element.getBoundingClientRect().top + scrollElement.scrollTop;
    }

    function markAnchorsDirty() {
        anchorsDirty = true;
    }

    function rebuildAnchors() {
        var scrollElement = getScrollElement();
        if (!scrollElement) {
            anchorCache = [];
            anchorsDirty = false;
            return anchorCache;
        }
        var seenLines = Object.create(null);
        anchorCache = Array.prototype.slice.call(document.querySelectorAll("[data-codemark-source-line]"))
            .map(function (element) {
                return {
                    line: Number(element.getAttribute("data-codemark-source-line")),
                    top: getElementTop(element, scrollElement)
                };
            })
            .filter(function (item) {
                if (!Number.isFinite(item.line) || item.line < 1 || seenLines[item.line]) {
                    return false;
                }
                seenLines[item.line] = true;
                return true;
            })
            .sort(function (a, b) {
                return a.line - b.line;
            });
        anchorsDirty = false;
        return anchorCache;
    }

    function getAnchors() {
        return anchorsDirty ? rebuildAnchors() : anchorCache;
    }

    function findAnchorIndexByLine(anchors, sourceLine) {
        var low = 0;
        var high = anchors.length - 1;
        var result = 0;
        while (low <= high) {
            var mid = Math.floor((low + high) / 2);
            if (anchors[mid].line <= sourceLine) {
                result = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return result;
    }

    function findAnchorIndexByTop(anchors, targetTop) {
        var low = 0;
        var high = anchors.length - 1;
        var result = 0;
        while (low <= high) {
            var mid = Math.floor((low + high) / 2);
            if (anchors[mid].top <= targetTop) {
                result = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return result;
    }

    function getTargetTopForSourceLine(scrollElement, sourceLine) {
        var anchors = getAnchors();
        if (!anchors.length || sourceLine <= anchors[0].line) {
            return 0;
        }

        var previousIndex = findAnchorIndexByLine(anchors, sourceLine);
        var previous = anchors[previousIndex];
        var next = anchors[previousIndex + 1] || null;
        if (!next) {
            return previous.top;
        }
        var lineSpan = Math.max(1, next.line - previous.line);
        var progress = Math.max(0, Math.min(1, (sourceLine - previous.line) / lineSpan));
        return previous.top + (next.top - previous.top) * progress;
    }

    function setLock() {
        scrollLock = true;
        if (unlockTimer) {
            window.clearTimeout(unlockTimer);
        }
        unlockTimer = window.setTimeout(function () {
            scrollLock = false;
            unlockTimer = null;
        }, 80);
    }

    function markUserScrollIntent() {
        userScrollUntil = Date.now() + 900;
    }

    function alignToSourceLine(data) {
        var scrollElement = getScrollElement();
        if (!scrollElement) {
            return;
        }
        lastRequestedLine = Math.max(1, Number(data.sourceLine) || 1);
        lastRequestedLastLine = Math.max(lastRequestedLine, Number(data.lastLine) || lastRequestedLine);
        lastRequestedTotalLines = Math.max(1, Number(data.totalLines) || lastRequestedLastLine);

        var nearEditorBottom = lastRequestedTotalLines > 0 && lastRequestedLastLine >= lastRequestedTotalLines - 1;
        var targetTop = nearEditorBottom
            ? getMaxScrollTop(scrollElement)
            : getTargetTopForSourceLine(scrollElement, lastRequestedLine) - 12;

        setLock();
        if (Math.abs((scrollElement.scrollTop || 0) - targetTop) > 1) {
            setScrollTop(scrollElement, targetTop);
        }
    }

    function requestAlignToSourceLine(data) {
        pendingAlignData = data || {
            sourceLine: lastRequestedLine,
            lastLine: lastRequestedLastLine,
            totalLines: lastRequestedTotalLines
        };
        if (pendingAlignFrame) {
            return;
        }
        pendingAlignFrame = window.requestAnimationFrame
            ? window.requestAnimationFrame(function () {
                pendingAlignFrame = null;
                alignToSourceLine(pendingAlignData || {});
                pendingAlignData = null;
            })
            : window.setTimeout(function () {
                pendingAlignFrame = null;
                alignToSourceLine(pendingAlignData || {});
                pendingAlignData = null;
            }, 16);
    }

    function getSourceLineForScroll(scrollElement) {
        var anchors = getAnchors();
        if (!anchors.length) {
            return 1;
        }
        var scrollTop = scrollElement.scrollTop || 0;
        var maxScrollTop = getMaxScrollTop(scrollElement);
        if (getClientHeight(scrollElement) > 0 && scrollTop >= maxScrollTop - 3) {
            return Math.max(1, lastRequestedTotalLines || anchors[anchors.length - 1].line);
        }

        var targetTop = scrollTop + 16;
        var previousIndex = findAnchorIndexByTop(anchors, targetTop);
        var previous = anchors[previousIndex];
        var next = anchors[previousIndex + 1] || null;
        if (!next) {
            return previous.line;
        }
        var topSpan = Math.max(1, next.top - previous.top);
        var progress = Math.max(0, Math.min(1, (targetTop - previous.top) / topSpan));
        return previous.line + (next.line - previous.line) * progress;
    }

    function postScrollLine() {
        pendingScrollFrame = null;
        if (scrollLock || !window.parent) {
            return;
        }
        if (Date.now() > userScrollUntil) {
            return;
        }
        var scrollElement = getScrollElement();
        if (!scrollElement) {
            return;
        }
        var sourceLine = getSourceLineForScroll(scrollElement);
        if (Math.abs(sourceLine - lastPostedLine) < 0.2) {
            return;
        }
        lastPostedLine = sourceLine;
        window.parent.postMessage({
            type: messageTypes.scroll,
            sourceLine: sourceLine
        }, "*");
    }

    function requestPostScrollLine() {
        if (pendingScrollFrame) {
            return;
        }
        pendingScrollFrame = window.requestAnimationFrame
            ? window.requestAnimationFrame(postScrollLine)
            : window.setTimeout(postScrollLine, 16);
    }

    window.addEventListener("message", function (event) {
        var data = event.data || {};
        if (data.type === messageTypes.align) {
            requestAlignToSourceLine(data);
        }
    });
    window.addEventListener("wheel", markUserScrollIntent, { passive: true });
    window.addEventListener("touchstart", markUserScrollIntent, { passive: true });
    window.addEventListener("touchmove", markUserScrollIntent, { passive: true });
    window.addEventListener("pointerdown", markUserScrollIntent, { passive: true });
    window.addEventListener("mousedown", markUserScrollIntent, { passive: true });
    window.addEventListener("keydown", markUserScrollIntent);
    window.addEventListener("scroll", requestPostScrollLine, { passive: true });
    window.addEventListener("load", function () {
        markAnchorsDirty();
        window.parent.postMessage({ type: messageTypes.ready }, "*");
        requestPostScrollLine();
    });
    window.addEventListener("resize", function () {
        markAnchorsDirty();
        requestAlignToSourceLine({
            sourceLine: lastRequestedLine,
            lastLine: lastRequestedLastLine,
            totalLines: lastRequestedTotalLines
        });
    });
    if (typeof ResizeObserver === "function" && document.body) {
        try {
            new ResizeObserver(function () {
                markAnchorsDirty();
                requestAlignToSourceLine({
                    sourceLine: lastRequestedLine,
                    lastLine: lastRequestedLastLine,
                    totalLines: lastRequestedTotalLines
                });
            }).observe(document.body);
        } catch (e) {
        }
    }
    if (typeof MutationObserver === "function") {
        try {
            new MutationObserver(function () {
                markAnchorsDirty();
            }).observe(document.body || document.documentElement, {
                childList: true,
                subtree: true
            });
        } catch (e) {
        }
    }
    window.parent.postMessage({ type: messageTypes.ready }, "*");
})();
`);
    body.appendChild(script);
}

function rewriteMarkdownPreviewResources(doc, file, resourceMap) {
    ["src", "poster", "href", "data"].forEach(attr => {
        doc.querySelectorAll(`[${attr}]`).forEach(el => {
            const tagName = (el.tagName || "").toLowerCase();
            if (tagName === "a" && attr === "href") {
                return;
            }
            const value = el.getAttribute(attr) || "";
            const nextUrl = getPreviewResourceUrl(value, file.path, resourceMap);
            if (nextUrl) {
                el.setAttribute(attr, nextUrl);
            }
        });
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
    doc.querySelectorAll("[style]").forEach(el => {
        el.setAttribute("style", rewriteCssResourceReferences(el.getAttribute("style") || "", file.path, resourceMap));
    });
}

function updateMarkdownLinkTargets(doc) {
    doc.querySelectorAll(".markdown-body a[href]").forEach(link => {
        const href = (link.getAttribute("href") || "").trim();
        if (!href || href.startsWith("#")) {
            return;
        }
        if (href.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(href)) {
            link.target = "_blank";
            link.rel = "noopener noreferrer";
        }
    });
}

function hasMarkdownMath(source) {
    const content = String(source || "");
    return /\\\(|\\\[|(^|[^\\])\$\$[\s\S]+?\$\$|(^|[^\\])\$[^\s$][^\n$]*[^\s$]\$/m.test(content);
}

function appendMarkdownMathRuntime(doc) {
    const head = doc.head || doc.documentElement;
    const configScript = doc.createElement("script");
    setInlineScriptContent(configScript, `
window.MathJax = {
    tex: {
        inlineMath: [["$", "$"], ["\\\\(", "\\\\)"]],
        displayMath: [["$$", "$$"], ["\\\\[", "\\\\]"]],
        processEscapes: true
    },
    options: {
        skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code"]
    }
};
`);
    head.appendChild(configScript);
    const mathScript = doc.createElement("script");
    mathScript.async = true;
    mathScript.src = "https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-chtml-full.min.js";
    head.appendChild(mathScript);
}

function appendMarkdownMermaidRuntime(doc) {
    const body = doc.body || doc.documentElement;
    if (!body || !doc.querySelector(".mermaid")) {
        return;
    }
    const initScript = doc.createElement("script");
    setInlineScriptContent(initScript, `
(function () {
    function renderMermaid() {
        if (!window.mermaid) {
            window.setTimeout(renderMermaid, 60);
            return;
        }
        try {
            window.mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
            window.mermaid.run({ querySelector: ".mermaid" }).catch(function () {});
        } catch (e) {
        }
    }
    renderMermaid();
})();
`);
    const mermaidScript = doc.createElement("script");
    mermaidScript.src = "https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.min.js";
    mermaidScript.crossOrigin = "anonymous";
    body.appendChild(mermaidScript);
    body.appendChild(initScript);
}

function buildMarkdownPreviewDocument(file) {
    const resourceMap = buildPreviewResourceMap();
    const rawMarkdown = file.content || "";
    const renderer = getMarkdownRenderer();
    const renderedHtml = renderMarkdownWithSourceLineMarkers(renderer, rawMarkdown);
    const doc = document.implementation.createHTMLDocument(getProjectPathBaseName(file.path) || "Markdown Preview");
    const meta = doc.createElement("meta");
    meta.setAttribute("charset", "UTF-8");
    doc.head.appendChild(meta);
    const viewport = doc.createElement("meta");
    viewport.name = "viewport";
    viewport.content = "width=device-width, initial-scale=1.0";
    doc.head.appendChild(viewport);
    appendMarkdownPreviewStyles(doc);

    const main = doc.createElement("main");
    main.className = "markdown-body";
    main.innerHTML = sanitizeMarkdownHtml(renderedHtml);
    doc.body.appendChild(main);

    rewriteMarkdownPreviewResources(doc, file, resourceMap);
    const headingEntries = addMarkdownHeadingIdsAndToc(doc);
    addMarkdownOutline(doc, headingEntries);
    updateMarkdownLinkTargets(doc);
    if (hasMarkdownMath(rawMarkdown)) {
        appendMarkdownMathRuntime(doc);
    }
    appendMarkdownMermaidRuntime(doc);
    appendMarkdownOutlineRuntime(doc);
    appendMarkdownSplitScrollRuntime(doc);
    appendPreviewHashNavigationRuntime(doc);
    return "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
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
    appendPreviewHashNavigationRuntime(doc);
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
    appendPreviewHashNavigationRuntime(doc);
    return "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
}

function resetHtmlPreviewFrame(frame) {
    if (!frame || !frame.parentNode) {
        return frame;
    }
    // A fresh browsing context avoids retained blank srcdoc renders after file or view switches.
    const replacement = frame.cloneNode(false);
    replacement.removeAttribute("src");
    replacement.removeAttribute("srcdoc");
    replacement.removeAttribute("data-codemark-preview-write-token");
    replacement.removeAttribute("data-codemark-preview-loaded-token");
    frame.parentNode.replaceChild(replacement, frame);
    return replacement;
}

function writeHtmlPreviewFrame(frame, html, options) {
    const opts = options || {};
    let targetFrame = frame;
    if (opts.forceFrame) {
        targetFrame = resetHtmlPreviewFrame(frame);
    }
    if (!targetFrame) {
        return;
    }

    const writeToken = String(++htmlPreviewFrameWriteToken);
    targetFrame.dataset.codemarkPreviewWriteToken = writeToken;
    targetFrame.dataset.codemarkPreviewLoadedToken = "";
    targetFrame.addEventListener("load", function () {
        targetFrame.dataset.codemarkPreviewLoadedToken = writeToken;
        updateMarkdownSplitScrollSyncState();
        requestSyncMarkdownPreviewToEditor();
    }, {once: true});
    targetFrame.srcdoc = html;
}

function refreshHtmlPreview(immediate, options) {
    const opts = options || {};
    if (htmlPreviewRefreshTimer) {
        clearTimeout(htmlPreviewRefreshTimer);
        htmlPreviewRefreshTimer = null;
    }
    const runRefresh = function () {
        const effectiveMode = getEffectiveShareViewMode();
        if (!opts.allowHidden && effectiveMode !== SHARE_VIEW_PREVIEW && effectiveMode !== SHARE_VIEW_SPLIT) {
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
        const previewHtml = isMarkdownDocumentFile(active)
            ? buildMarkdownPreviewDocument(active)
            : (shouldBuildReactPreviewDocument(active)
                ? buildReactPreviewDocument(active)
                : buildHtmlPreviewDocument(active));
        writeHtmlPreviewFrame(frame, previewHtml, {forceFrame: opts.forceFrame === true});
    };
    if (immediate) {
        runRefresh();
        return;
    }
    htmlPreviewRefreshTimer = setTimeout(runRefresh, 180);
}

function refreshHtmlPreviewSoon() {
    const effectiveMode = getEffectiveShareViewMode();
    if (isHtmlPreviewableFile(getActiveProjectFile())) {
        refreshHtmlPreview(false, {
            allowHidden: effectiveMode !== SHARE_VIEW_PREVIEW && effectiveMode !== SHARE_VIEW_SPLIT
        });
    }
}
