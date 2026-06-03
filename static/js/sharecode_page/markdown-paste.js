/* Markdown image paste support for the Sharecode Ace editor. */
let markdownPasteImageSequence = 0;
let markdownImageHoverPreviewElement = null;
let markdownImageHoverPreviewImage = null;
let markdownImageHoverLastKey = "";
let markdownImageHoverLastMouse = {x: 0, y: 0};

function getClipboardImageFiles(event) {
    const clipboardData = event && event.clipboardData;
    if (!clipboardData) {
        return [];
    }
    const imageFiles = [];
    Array.from(clipboardData.items || []).forEach(item => {
        if (item && item.kind === "file" && String(item.type || "").toLowerCase().startsWith("image/")) {
            const file = item.getAsFile();
            if (file) {
                imageFiles.push(file);
            }
        }
    });
    if (imageFiles.length) {
        return imageFiles;
    }
    return Array.from(clipboardData.files || []).filter(file => {
        return file && String(file.type || "").toLowerCase().startsWith("image/");
    });
}

function getClipboardImageExtension(file) {
    const mimeType = String((file && file.type) || "").toLowerCase();
    const mimeExt = mimeType.split("/")[1] || "";
    if (mimeExt) {
        if (mimeExt === "jpeg") return "jpg";
        if (mimeExt === "svg+xml") return "svg";
        return mimeExt.split(/[+;]/)[0].replace(/[^a-z0-9]/g, "") || "png";
    }
    const filename = String((file && file.name) || "").toLowerCase();
    const ext = filename.includes(".") ? filename.split(".").pop() : "";
    return ext && IMAGE_EXTENSIONS.has(ext) ? ext : "png";
}

function formatMarkdownPasteTimestamp(date) {
    const d = date || new Date();
    const pad = function (value, size) {
        return String(value).padStart(size || 2, "0");
    };
    return [
        d.getFullYear(),
        pad(d.getMonth() + 1),
        pad(d.getDate()),
        pad(d.getHours()),
        pad(d.getMinutes()),
        pad(d.getSeconds()),
        pad(d.getMilliseconds(), 3)
    ].join("");
}

function getMarkdownAssetFolderStem(markdownPath) {
    const filename = getProjectPathBaseName(markdownPath) || "main.md";
    const dotIndex = filename.lastIndexOf(".");
    const stem = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
    return safeNormalizePath(stem) || "main";
}

function getMarkdownAssetFolderPath(markdownPath) {
    const parentPath = getPathParent(markdownPath);
    const folderName = `${getMarkdownAssetFolderStem(markdownPath)}.assets`;
    return safeNormalizePath(joinProjectPath(parentPath, folderName));
}

function encodeMarkdownLinkPath(relativePath) {
    return String(relativePath || "")
        .split("/")
        .map(segment => encodeURIComponent(segment))
        .join("/");
}

function getMarkdownRelativeAssetPath(assetPath, markdownPath) {
    const safeAssetPath = safeNormalizePath(assetPath);
    const markdownParent = getPathParent(markdownPath);
    let relativePath = safeAssetPath;
    if (markdownParent && safeAssetPath.startsWith(markdownParent + "/")) {
        relativePath = safeAssetPath.slice(markdownParent.length + 1);
    }
    const encodedPath = encodeMarkdownLinkPath(relativePath);
    return encodedPath.startsWith("./") ? encodedPath : `./${encodedPath}`;
}

function createMarkdownPasteImageName(file) {
    const ext = getClipboardImageExtension(file);
    const sequence = markdownPasteImageSequence++;
    const suffix = sequence > 0 ? `-${sequence}` : "";
    return `image-${formatMarkdownPasteTimestamp(new Date())}${suffix}.${ext}`;
}

function isMarkdownImagePasteTarget() {
    const active = getActiveProjectFile();
    if (active && active.kind === "text") {
        return isMarkdownDocumentFile(active);
    }
    return !active && getCurrentLanguageValue() === "markdown";
}

function ensureMarkdownPasteTargetFile() {
    const active = getActiveProjectFile();
    if (active && active.kind === "text") {
        return active;
    }
    if (active || getCurrentLanguageValue() !== "markdown") {
        return null;
    }
    const filePath = ensureUniquePath(defaultFilenameForLanguage("markdown"));
    if (!filePath) {
        return null;
    }
    const file = {
        kind: "text",
        path: filePath,
        content: window.editor ? window.editor.getValue() : "",
        language: "markdown",
        highlighted_lines: []
    };
    projectFiles.push(file);
    activeFilePath = filePath;
    setLanguageSelectors("markdown");
    setEditorLang("markdown");
    renderProjectFileTree();
    updateSidebarVisibilityByFileCount(false);
    updatePythonRunButtonVisibility();
    updateHtmlShareViewControls();
    return file;
}

function cloneAceRange(range) {
    if (!range || !window.ace || typeof window.ace.require !== "function") {
        return null;
    }
    try {
        const Range = window.ace.require("ace/range").Range;
        return new Range(range.start.row, range.start.column, range.end.row, range.end.column);
    } catch (e) {
        return null;
    }
}

function insertMarkdownImageReferences(markdownLinks, pasteRange) {
    if (!window.editor || !Array.isArray(markdownLinks) || !markdownLinks.length) {
        return;
    }
    const markdownText = markdownLinks.map(path => `![](${path})`).join("\n");
    if (pasteRange && window.editor.selection && typeof window.editor.selection.setSelectionRange === "function") {
        window.editor.selection.setSelectionRange(pasteRange);
    }
    window.editor.insert(markdownText);
}

async function createMarkdownImageAsset(file, markdownFile) {
    const assetFolderPath = getMarkdownAssetFolderPath(markdownFile.path);
    if (!assetFolderPath) {
        return null;
    }
    addProjectFolder(assetFolderPath);
    collapsedFolderPaths.delete(assetFolderPath);

    const imageName = createMarkdownPasteImageName(file);
    const assetPath = ensureUniquePath(joinProjectPath(assetFolderPath, imageName));
    if (!assetPath) {
        return null;
    }
    const dataUrl = await readFileAsDataURL(file);
    upsertProjectFileSilently({
        kind: "asset",
        path: assetPath,
        mime_type: file.type || "image/" + getClipboardImageExtension(file),
        size: file.size,
        data_base64: dataUrl,
        source_project_id: "",
        source_stored_path: "",
        url: ""
    });
    return getMarkdownRelativeAssetPath(assetPath, markdownFile.path);
}

async function pasteMarkdownImages(imageFiles, pasteRange) {
    const markdownFile = ensureMarkdownPasteTargetFile();
    if (!markdownFile) {
        return;
    }

    syncActiveEditorToProject();
    const markdownLinks = [];
    let failedCount = 0;
    for (const file of imageFiles) {
        try {
            const markdownPath = await createMarkdownImageAsset(file, markdownFile);
            if (markdownPath) {
                markdownLinks.push(markdownPath);
            } else {
                failedCount += 1;
            }
        } catch (e) {
            failedCount += 1;
        }
    }

    if (markdownLinks.length) {
        insertMarkdownImageReferences(markdownLinks, pasteRange);
        syncActiveEditorToProject();
        expandProjectTreeAncestors(getMarkdownAssetFolderPath(markdownFile.path));
        renderProjectFileTree();
        updateSidebarVisibilityByFileCount(false);
        refreshHtmlPreviewSoon();
        scheduleSharecodeDraftCacheSave();
        showProjectNotice(markdownLinks.length === 1 ? "图片已粘贴。" : `已粘贴 ${markdownLinks.length} 张图片。`);
    }
    if (failedCount) {
        showProjectNotice(`${failedCount} 张图片粘贴失败。`);
    }
}

function handleMarkdownImagePaste(event) {
    const imageFiles = getClipboardImageFiles(event);
    if (!imageFiles.length || !isMarkdownImagePasteTarget()) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    const pasteRange = cloneAceRange(window.editor && window.editor.getSelectionRange
        ? window.editor.getSelectionRange()
        : null);
    pasteMarkdownImages(imageFiles, pasteRange).catch(function () {
        showProjectNotice("图片粘贴失败。");
    });
}

function bindMarkdownImagePaste() {
    if (!window.editor || !window.editor.container) {
        return;
    }
    if (window.editor.container.dataset.codemarkMarkdownPasteBound !== "true") {
        window.editor.container.dataset.codemarkMarkdownPasteBound = "true";
        window.editor.container.addEventListener("paste", handleMarkdownImagePaste, true);
    }
    bindMarkdownImageHoverPreview();
}

function parseMarkdownImageReferenceAt(line, column) {
    const text = String(line || "");
    const patterns = [
        /!\[[^\]\n]*\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g,
        /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi
    ];
    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (column < start || column > end) {
                continue;
            }
            const url = match[1] || match[2] || match[3] || "";
            if (url) {
                return {
                    url,
                    start,
                    end
                };
            }
        }
    }
    return null;
}

function getImageExtensionFromReference(rawUrl) {
    const parts = typeof splitPreviewUrl === "function"
        ? splitPreviewUrl(rawUrl)
        : {path: String(rawUrl || "").split(/[?#]/)[0]};
    const path = String(parts.path || "").replace(/\\/g, "/");
    const filename = path.split("/").pop() || "";
    const dotIndex = filename.lastIndexOf(".");
    if (dotIndex <= 0 || dotIndex === filename.length - 1) {
        return "";
    }
    return filename.slice(dotIndex + 1).toLowerCase();
}

function isImageReferenceUrl(rawUrl) {
    const value = String(rawUrl || "").trim();
    if (!value) {
        return false;
    }
    if (/^data:image\//i.test(value) || /^blob:/i.test(value)) {
        return true;
    }
    return IMAGE_EXTENSIONS.has(getImageExtensionFromReference(value));
}

function resolveMarkdownHoverImageUrl(rawUrl, markdownPath) {
    const value = String(rawUrl || "").trim();
    if (!value) {
        return "";
    }
    if (/^data:image\//i.test(value) || /^blob:/i.test(value)) {
        return value;
    }
    if (typeof buildPreviewResourceMap === "function" && typeof findPreviewResource === "function") {
        const resourceMap = buildPreviewResourceMap();
        const resolved = findPreviewResource(value, markdownPath, resourceMap);
        if (resolved && resolved.resource) {
            const resource = resolved.resource;
            const mimeType = String(resource.mime_type || "").toLowerCase();
            const extension = getImageExtensionFromReference(resource.path || value);
            if (mimeType.startsWith("image/") || IMAGE_EXTENSIONS.has(extension)) {
                return getPreviewResourceUrl(value, markdownPath, resourceMap);
            }
            return "";
        }
    }
    if ((value.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(value)) && isImageReferenceUrl(value)) {
        return value;
    }
    return "";
}

function getMarkdownImageHoverReference(event) {
    if (!window.editor || !window.editor.renderer || !window.editor.session || !isMarkdownImagePasteTarget()) {
        return null;
    }
    let position = null;
    try {
        position = window.editor.renderer.screenToTextCoordinates(event.clientX, event.clientY);
    } catch (e) {
        return null;
    }
    if (!position || position.row < 0) {
        return null;
    }
    const line = window.editor.session.getLine(position.row);
    const reference = parseMarkdownImageReferenceAt(line, position.column);
    if (!reference) {
        return null;
    }
    const active = getActiveProjectFile();
    const sourceUrl = resolveMarkdownHoverImageUrl(reference.url, active && active.path);
    if (!sourceUrl) {
        return null;
    }
    return {
        key: `${active && active.path || ""}:${position.row}:${reference.start}:${reference.end}:${reference.url}`,
        url: sourceUrl
    };
}

function ensureMarkdownImageHoverPreviewElement() {
    if (markdownImageHoverPreviewElement && markdownImageHoverPreviewImage) {
        return markdownImageHoverPreviewElement;
    }
    const preview = document.createElement("div");
    preview.id = "markdownImageHoverPreview";
    preview.setAttribute("aria-hidden", "true");
    const image = document.createElement("img");
    image.alt = "";
    image.decoding = "async";
    image.addEventListener("load", function () {
        positionMarkdownImageHoverPreview(markdownImageHoverLastMouse.x, markdownImageHoverLastMouse.y);
    });
    preview.appendChild(image);
    document.body.appendChild(preview);
    markdownImageHoverPreviewElement = preview;
    markdownImageHoverPreviewImage = image;
    return preview;
}

function positionMarkdownImageHoverPreview(clientX, clientY) {
    const preview = markdownImageHoverPreviewElement;
    if (!preview || !preview.classList.contains("is-visible")) {
        return;
    }
    const viewportPadding = 12;
    const cursorOffset = 14;
    const rect = preview.getBoundingClientRect();
    let left = clientX + cursorOffset;
    let top = clientY + cursorOffset;
    if (left + rect.width > window.innerWidth - viewportPadding) {
        left = clientX - rect.width - cursorOffset;
    }
    if (top + rect.height > window.innerHeight - viewportPadding) {
        top = clientY - rect.height - cursorOffset;
    }
    preview.style.left = Math.max(viewportPadding, left) + "px";
    preview.style.top = Math.max(viewportPadding, top) + "px";
}

function showMarkdownImageHoverPreview(reference, event) {
    const preview = ensureMarkdownImageHoverPreviewElement();
    markdownImageHoverLastMouse = {x: event.clientX, y: event.clientY};
    if (markdownImageHoverLastKey !== reference.key) {
        markdownImageHoverLastKey = reference.key;
        markdownImageHoverPreviewImage.src = reference.url;
    }
    preview.classList.add("is-visible");
    preview.setAttribute("aria-hidden", "false");
    positionMarkdownImageHoverPreview(event.clientX, event.clientY);
}

function hideMarkdownImageHoverPreview() {
    if (markdownImageHoverPreviewElement) {
        markdownImageHoverPreviewElement.classList.remove("is-visible");
        markdownImageHoverPreviewElement.setAttribute("aria-hidden", "true");
    }
    markdownImageHoverLastKey = "";
}

function handleMarkdownImageHoverMove(event) {
    const reference = getMarkdownImageHoverReference(event);
    if (!reference) {
        hideMarkdownImageHoverPreview();
        return;
    }
    showMarkdownImageHoverPreview(reference, event);
}

function bindMarkdownImageHoverPreview() {
    if (!window.editor || !window.editor.container || window.editor.container.dataset.codemarkMarkdownHoverBound === "true") {
        return;
    }
    window.editor.container.dataset.codemarkMarkdownHoverBound = "true";
    window.editor.container.addEventListener("mousemove", handleMarkdownImageHoverMove);
    window.editor.container.addEventListener("mouseleave", hideMarkdownImageHoverPreview);
    if (window.editor.session && typeof window.editor.session.on === "function") {
        window.editor.session.on("changeScrollTop", hideMarkdownImageHoverPreview);
        window.editor.session.on("change", hideMarkdownImageHoverPreview);
    }
    window.addEventListener("resize", hideMarkdownImageHoverPreview);
}
