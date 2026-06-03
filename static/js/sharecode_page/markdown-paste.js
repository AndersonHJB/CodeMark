/* Markdown image paste support for the Sharecode Ace editor. */
let markdownPasteImageSequence = 0;

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
    if (!window.editor || !window.editor.container || window.editor.container.dataset.codemarkMarkdownPasteBound === "true") {
        return;
    }
    window.editor.container.dataset.codemarkMarkdownPasteBound = "true";
    window.editor.container.addEventListener("paste", handleMarkdownImagePaste, true);
}
