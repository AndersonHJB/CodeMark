/* Sharecode project data, editor sync, and asset preview helpers. */
function safeNormalizePath(rawPath) {
    if (typeof rawPath !== "string") {
        return "";
    }
    let normalized = rawPath.replace(/\\/g, "/").trim();
    if (!normalized) {
        return "";
    }
    normalized = normalized.replace(/^\/+/, "").replace(/\/{2,}/g, "/");
    let parts = normalized.split("/").filter(Boolean);
    if (!parts.length) {
        return "";
    }
    for (let i = 0; i < parts.length; i++) {
        if (parts[i] === "." || parts[i] === "..") {
            return "";
        }
    }
    return parts.join("/");
}

function detectLanguageFromFilename(filename) {
    let safePath = safeNormalizePath(filename).toLowerCase();
    if (!safePath) {
        return SHARECODE_DEFAULT_LANG;
    }
    const basename = safePath.split("/").pop() || "";
    if (FILENAME_LANGUAGE_MAP[basename]) {
        return FILENAME_LANGUAGE_MAP[basename];
    }
    for (const suffix of Object.keys(MULTI_EXTENSION_LANGUAGE_MAP)) {
        if (basename.endsWith("." + suffix)) {
            return MULTI_EXTENSION_LANGUAGE_MAP[suffix];
        }
    }
    const dotIndex = basename.lastIndexOf(".");
    if (dotIndex >= 0 && dotIndex < basename.length - 1) {
        const extension = basename.slice(dotIndex + 1);
        return EXTENSION_LANGUAGE_MAP[extension] || SHARECODE_DEFAULT_LANG;
    }
    return SHARECODE_DEFAULT_LANG;
}

function defaultFilenameForLanguage(lang) {
    const rawLanguage = String(lang || "").trim().toLowerCase();
    const isKnownLanguage = SHARECODE_LANGUAGE_VALUES.has(rawLanguage) || !!LANGUAGE_ALIASES[rawLanguage];
    const language = isKnownLanguage ? normalizeSharecodeLanguage(rawLanguage) : "";
    if (language === "dockerfile") {
        return "Dockerfile";
    }
    if (language === "makefile") {
        return "Makefile";
    }
    const ext = language ? (LANGUAGE_TO_EXTENSION[language] || "txt") : "txt";
    return "main." + ext;
}

function loadSharecodeDraftCache() {
    try {
        const raw = localStorage.getItem(SHARECODE_DRAFT_CACHE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        return data && typeof data === "object" ? data : null;
    } catch (e) {
        return null;
    }
}

function scheduleSharecodeDraftCacheSave() {
    if (sharecodeDraftSaveTimer) {
        clearTimeout(sharecodeDraftSaveTimer);
    }
    sharecodeDraftSaveTimer = setTimeout(function () {
        saveSharecodeDraftCache();
    }, SHARECODE_DRAFT_SAVE_DEBOUNCE_MS);
}

function saveSharecodeDraftCache() {
    if (!window.editor || !editorReady) {
        return;
    }
    createProjectFileFromEditorInput();
    syncActiveEditorToProject();
    try {
        const textFiles = projectFiles
            .filter(f => f.kind === "text")
            .map(f => ({
                path: f.path,
                content: f.content,
                language: normalizeSharecodeLanguage(f.language || detectLanguageFromFilename(f.path)),
                highlighted_lines: normalizeHighlightedLines(f.highlighted_lines)
            }));

        localStorage.setItem(SHARECODE_DRAFT_CACHE_KEY, JSON.stringify({
            project: {
                text_files: textFiles,
                assets: [],
                folders: projectFolders.slice(),
                active_file: activeFilePath,
                empty_project: projectFiles.length === 0 && projectFolders.length === 0
            },
            language: getCurrentLanguageValue(),
            theme: getCurrentThemeValue(),
            updatedAt: Date.now()
        }));
    } catch (e) {
    }
}

function getCurrentLanguageValue() {
    const desktop = document.getElementById("lang-selector-desktop");
    const mobile = document.getElementById("lang-selector-mobile");
    return normalizeSharecodeLanguage((desktop && desktop.value) || (mobile && mobile.value));
}

function getCurrentThemeValue() {
    const desktop = document.getElementById("theme-selector-desktop");
    const mobile = document.getElementById("theme-selector-mobile");
    return (desktop && desktop.value) || (mobile && mobile.value) || SHARECODE_DEFAULT_THEME;
}

function setLanguageSelectors(lang) {
    const language = normalizeSharecodeLanguage(lang);
    const desktop = document.getElementById("lang-selector-desktop");
    const mobile = document.getElementById("lang-selector-mobile");
    if (desktop) {
        desktop.value = language;
    }
    if (mobile) {
        mobile.value = language;
    }
}

function normalizeSharecodeLanguage(lang, fallback) {
    const rawLanguage = String(lang || "").trim().toLowerCase();
    if (SHARECODE_LANGUAGE_VALUES.has(rawLanguage)) {
        return rawLanguage;
    }
    if (LANGUAGE_ALIASES[rawLanguage]) {
        return LANGUAGE_ALIASES[rawLanguage];
    }
    const fallbackLanguage = String(fallback || SHARECODE_DEFAULT_LANG).trim().toLowerCase();
    if (SHARECODE_LANGUAGE_VALUES.has(fallbackLanguage)) {
        return fallbackLanguage;
    }
    if (LANGUAGE_ALIASES[fallbackLanguage]) {
        return LANGUAGE_ALIASES[fallbackLanguage];
    }
    return SHARECODE_DEFAULT_LANG;
}

function getSharecodeLanguageConfig(lang) {
    return SHARECODE_LANGUAGE_CONFIG[normalizeSharecodeLanguage(lang)] || SHARECODE_LANGUAGE_CONFIG[SHARECODE_DEFAULT_LANG];
}

function renderSharecodeLanguageOptions(selectElement) {
    if (!selectElement) {
        return;
    }
    const serverLanguage = typeof server_pre_lang === "string" ? server_pre_lang : "";
    const selectedLanguage = normalizeSharecodeLanguage(selectElement.value || serverLanguage);
    selectElement.innerHTML = "";
    SHARECODE_LANGUAGES.forEach(language => {
        const option = document.createElement("option");
        option.value = language.value;
        option.textContent = language.label;
        selectElement.appendChild(option);
    });
    selectElement.value = selectedLanguage;
}

function populateLanguageSelectors() {
    renderSharecodeLanguageOptions(document.getElementById("lang-selector-desktop"));
    renderSharecodeLanguageOptions(document.getElementById("lang-selector-mobile"));
}

function setThemeSelectors(theme) {
    const nextTheme = theme || SHARECODE_DEFAULT_THEME;
    const desktop = document.getElementById("theme-selector-desktop");
    const mobile = document.getElementById("theme-selector-mobile");
    if (desktop) {
        desktop.value = nextTheme;
    }
    if (mobile) {
        mobile.value = nextTheme;
    }
}

function applyEditorTheme(theme) {
    const selected = theme || SHARECODE_DEFAULT_THEME;
    if (window.editor) {
        window.editor.setTheme("ace/theme/" + selected);
    }
    setThemeSelectors(selected);
}

function setEditorLang(lang) {
    if (!window.editor) {
        return;
    }
    const language = normalizeSharecodeLanguage(lang);
    const languageConfig = getSharecodeLanguageConfig(language);
    const aceMode = languageConfig.aceMode || language;
    window.editor.session.setMode("ace/mode/" + aceMode);
}

function upsertProjectFile(fileObj, activate) {
    const safePath = safeNormalizePath(fileObj.path);
    if (!safePath) {
        return;
    }
    const nextFile = Object.assign({}, fileObj, {path: safePath});
    const existingIndex = projectFiles.findIndex(f => f.path === safePath);
    if (nextFile.kind === "text") {
        const existingLines = existingIndex >= 0 ? projectFiles[existingIndex].highlighted_lines : [];
        const incomingLines = Object.prototype.hasOwnProperty.call(nextFile, "highlighted_lines")
            ? nextFile.highlighted_lines
            : existingLines;
        nextFile.highlighted_lines = normalizeHighlightedLines(incomingLines);
    }
    if (existingIndex >= 0) {
        projectFiles[existingIndex] = Object.assign({}, projectFiles[existingIndex], nextFile);
    } else {
        projectFiles.push(nextFile);
    }
    if (activate) {
        openProjectFile(safePath);
    } else {
        renderProjectFileTree();
        updateSidebarVisibilityByFileCount(false);
    }
}

function ensureUniquePath(path) {
    let safePath = safeNormalizePath(path);
    if (!safePath) {
        return "";
    }
    const pathConflicts = function (candidatePath) {
        const conflictsWithFile = projectFiles.some(f => f.path === candidatePath);
        const conflictsWithFolder = typeof projectFolderExists === "function" && projectFolderExists(candidatePath);
        return conflictsWithFile || conflictsWithFolder;
    };
    if (!pathConflicts(safePath)) {
        return safePath;
    }
    let base = safePath;
    let suffix = "";
    const dotIndex = safePath.lastIndexOf(".");
    if (dotIndex > 0 && dotIndex < safePath.length - 1) {
        base = safePath.slice(0, dotIndex);
        suffix = safePath.slice(dotIndex);
    }
    let index = 1;
    while (pathConflicts(`${base}_${index}${suffix}`)) {
        index += 1;
    }
    return `${base}_${index}${suffix}`;
}

function getActiveProjectFile() {
    return projectFiles.find(f => f.path === activeFilePath) || null;
}

function syncActiveEditorToProject() {
    if (!editorReady) {
        return;
    }
    const currentFile = getActiveProjectFile();
    if (currentFile && currentFile.kind === "text") {
        currentFile.content = window.editor.getValue();
        currentFile.language = normalizeSharecodeLanguage(currentFile.language || detectLanguageFromFilename(currentFile.path));
        currentFile.highlighted_lines = normalizeHighlightedLines(currentFile.highlighted_lines);
    }
}

function openProjectFile(path) {
    const safePath = safeNormalizePath(path);
    const targetFile = projectFiles.find(f => f.path === safePath);
    if (!targetFile) {
        return;
    }
    syncActiveEditorToProject();
    activeFilePath = safePath;
    expandProjectTreeAncestors(safePath);

    if (targetFile.kind === "text") {
        document.getElementById("assetViewer").style.display = "none";
        document.getElementById("editor").style.display = "block";
        window.editor.setValue(targetFile.content || "", -1);
        const lang = normalizeSharecodeLanguage(targetFile.language || detectLanguageFromFilename(targetFile.path));
        targetFile.language = lang;
        targetFile.highlighted_lines = normalizeHighlightedLines(targetFile.highlighted_lines);
        setLanguageSelectors(lang);
        setEditorLang(lang);
        renderActiveLineHighlights();
        applyShareViewToWorkspace({immediate: true, forceFrame: true});
    } else {
        clearActiveLineHighlightMarkers();
        showAssetPreview(targetFile);
        updateHtmlShareViewControls();
    }

    renderProjectFileTree();
    updatePythonRunButtonVisibility();
    scheduleSharecodeDraftCacheSave();
    setTimeout(function () {
        if (window.editor) {
            window.editor.resize();
        }
    }, 30);
}

function buildAssetUrl(projectId, storedPath) {
    if (!projectId || !storedPath) {
        return "";
    }
    const encodedPath = safeNormalizePath(storedPath).split("/").map(encodeURIComponent).join("/");
    return `/share_asset/${encodeURIComponent(projectId)}/${encodedPath}`;
}

function resolveAssetPreviewSource(assetFile) {
    if (assetFile.data_base64) {
        return assetFile.data_base64;
    }
    if (assetFile.url) {
        return assetFile.url;
    }
    if (assetFile.source_project_id && assetFile.source_stored_path) {
        return buildAssetUrl(assetFile.source_project_id, assetFile.source_stored_path);
    }
    return "";
}

function getAssetPreviewKind(assetFile) {
    const mimeType = String((assetFile && assetFile.mime_type) || "").toLowerCase();
    const extension = getPathExtension(assetFile && assetFile.path);
    if (mimeType.startsWith("image/") || IMAGE_EXTENSIONS.has(extension)) {
        return "image";
    }
    if (mimeType.startsWith("audio/") || AUDIO_EXTENSIONS.has(extension)) {
        return "audio";
    }
    if (mimeType.startsWith("video/") || VIDEO_EXTENSIONS.has(extension)) {
        return "video";
    }
    return "";
}

function showAssetPreview(assetFile) {
    const viewer = document.getElementById("assetViewer");
    const editorElement = document.getElementById("editor");
    hideHtmlPreviewPane();
    editorElement.style.display = "none";
    viewer.style.display = "block";

    const source = resolveAssetPreviewSource(assetFile);
    const mimeType = assetFile.mime_type || "application/octet-stream";
    const sizeText = typeof assetFile.size === "number" ? `${assetFile.size} bytes` : "unknown";
    const previewKind = getAssetPreviewKind(assetFile);

    let html = `<div><strong>${escapeHtml(assetFile.path)}</strong></div>`;
    if (previewKind === "image" && source) {
        html += `<div class="asset-preview-stage"><img class="asset-media" src="${escapeHtml(source)}" alt="${escapeHtml(assetFile.path)}" decoding="async"></div>`;
    } else if (previewKind === "audio" && source) {
        html += `<div class="asset-preview-stage is-audio"><audio class="asset-media" controls preload="metadata" src="${escapeHtml(source)}"></audio></div>`;
    } else if (previewKind === "video" && source) {
        html += `<div class="asset-preview-stage"><video class="asset-media" controls preload="metadata" src="${escapeHtml(source)}"></video></div>`;
    }
    html += `<div class="asset-meta">`;
    html += `<div>MIME: ${escapeHtml(mimeType)}</div>`;
    html += `<div>Size: ${escapeHtml(sizeText)}</div>`;
    html += `</div>`;
    if (source) {
        html += `<a class="asset-open-link" href="${escapeHtml(source)}" target="_blank" rel="noreferrer">Open / Download</a>`;
    }
    viewer.innerHTML = html;
}
