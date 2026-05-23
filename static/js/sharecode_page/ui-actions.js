/* Sharecode toolbar, overlay, download, share, and copy actions. */
function updatePythonRunButtonVisibility() {
    const active = getActiveProjectFile();
    const visible = !!(active && active.kind === "text" && (active.language || detectLanguageFromFilename(active.path)) === "python");
    document.querySelectorAll(".python-run-btn").forEach(btn => {
        btn.style.display = visible ? "" : "none";
    });
}

function setSidebarOpen(open) {
    const appRoot = document.getElementById("appRoot");
    const sidebarToggleButton = document.getElementById("sidebarHeaderToggle");
    const sidebarLogoButton = document.getElementById("sidebarLogoButton");
    sidebarOpen = !!open;
    if (isMobileViewport()) {
        appRoot.classList.toggle("sidebar-open", sidebarOpen);
        appRoot.classList.toggle("sidebar-collapsed", !sidebarOpen);
    } else {
        appRoot.classList.remove("sidebar-open");
        appRoot.classList.toggle("sidebar-collapsed", !sidebarOpen);
    }
    if (sidebarToggleButton) {
        sidebarToggleButton.setAttribute("aria-expanded", sidebarOpen ? "true" : "false");
    }
    if (sidebarLogoButton) {
        sidebarLogoButton.setAttribute("aria-expanded", sidebarOpen ? "true" : "false");
        sidebarLogoButton.setAttribute("aria-label", sidebarOpen ? "CodeMark logo" : "点击展开边栏");
    }
    setTimeout(function () {
        if (window.editor) {
            window.editor.resize();
        }
    }, 280);
}

function updateSidebarVisibilityByFileCount(firstLoad) {
    const textCount = projectFiles.filter(f => f.kind === "text").length;
    const assetCount = projectFiles.filter(f => f.kind === "asset").length;
    const folderCount = projectFolders.length;
    const shouldAutoHide = textCount <= 1 && assetCount === 0 && folderCount === 0;

    if (firstLoad && shouldAutoHide) {
        setSidebarOpen(false);
        return;
    }

    if (firstLoad) {
        setSidebarOpen(!isMobileViewport());
        return;
    }

    if (shouldAutoHide) {
        setSidebarOpen(false);
    }
}

function toggleProjectSidebar() {
    setSidebarOpen(!sidebarOpen);
}

function updateProjectSelectionToggleButton() {
    const button = document.getElementById("projectSelectionToggleButton");
    if (!button) {
        return;
    }
    button.classList.toggle("active", projectTreeSelectionVisible);
    button.setAttribute("aria-pressed", projectTreeSelectionVisible ? "true" : "false");
    button.title = projectTreeSelectionVisible ? "隐藏选择框" : "显示选择框";
    const text = button.querySelector(".sidebar-action-text");
    if (text) {
        text.textContent = projectTreeSelectionVisible ? "selecting" : "select";
    }
}

function setProjectTreeSelectionVisible(visible) {
    projectTreeSelectionVisible = !!visible;
    const appRoot = document.getElementById("appRoot");
    if (appRoot) {
        appRoot.classList.toggle("project-selection-visible", projectTreeSelectionVisible);
    }
    updateProjectSelectionToggleButton();
}

function toggleProjectTreeSelectionVisible() {
    hideProjectTreeContextMenu();
    setProjectTreeSelectionVisible(!projectTreeSelectionVisible);
    if (projectTreeSelectionVisible) {
        setSidebarOpen(true);
    }
}

function handleSidebarLogoClick() {
    if (!sidebarOpen) {
        setSidebarOpen(true);
    }
}

function collapseProjectSidebar() {
    setSidebarOpen(false);
}

function closeSidebarFromBackdrop() {
    if (isMobileViewport()) {
        setSidebarOpen(false);
    }
}

function toggleFloatingMenu() {
    const menu = document.getElementById("floatingMenu");
    menu.classList.toggle("show-menu");
}

function hideFloatingMenuIfOpen() {
    const menu = document.getElementById("floatingMenu");
    if (menu.classList.contains("show-menu")) {
        menu.classList.remove("show-menu");
    }
}

function openOverlay(overlayId) {
    document.getElementById(overlayId).style.display = "block";
}

function closeOverlay(overlayId) {
    document.getElementById(overlayId).style.display = "none";
}

function openCreateFileDialog(parentPath) {
    beginProjectTreeCreate("file", parentPath);
}

function closeCreateFileDialog() {
    cancelProjectTreeCreate();
}

function createNewProjectFileFromDialog() {
    if (!projectTreeCreateTarget || projectTreeCreateTarget.kind !== "file") {
        beginProjectTreeCreate("file", "");
        return;
    }
    const input = document.querySelector('[data-tree-create-input="true"]');
    commitProjectTreeCreate("file", projectTreeCreateTarget.parentPath, input ? input.value : "");
}

function openCreateFolderDialog(parentPath) {
    beginProjectTreeCreate("folder", parentPath);
}

function closeCreateFolderDialog() {
    cancelProjectTreeCreate();
}

function createNewProjectFolderFromDialog() {
    if (!projectTreeCreateTarget || projectTreeCreateTarget.kind !== "folder") {
        beginProjectTreeCreate("folder", "");
        return;
    }
    const input = document.querySelector('[data-tree-create-input="true"]');
    commitProjectTreeCreate("folder", projectTreeCreateTarget.parentPath, input ? input.value : "");
}

function openAboutDialog() {
    openOverlay("aboutOverlay");
}

function closeAboutDialog() {
    closeOverlay("aboutOverlay");
}

function closeShare() {
    $('#share-modal').modal('hide');
}

function beginProjectUpload(inputId, targetFolderPath) {
    if (inputId === "folder-input") {
        openProjectFolderUploadDialog(targetFolderPath);
        return;
    }
    const elem = document.getElementById(inputId);
    if (!elem) {
        return;
    }
    pendingProjectUploadTargetPath = getProjectUploadTargetPath(targetFolderPath);
    elem.click();
}

function performClick(elemId) {
    if (elemId === "folder-input") {
        openProjectFolderUploadDialog(getSelectedProjectUploadTargetPath());
        return;
    }
    if (elemId === "file-input") {
        beginProjectUpload(elemId, getSelectedProjectUploadTargetPath());
        return;
    }
    const elem = document.getElementById(elemId);
    if (elem) {
        elem.click();
    }
}

function save() {
    syncActiveEditorToProject();
    const active = getActiveProjectFile();
    if (!active) {
        return;
    }

    if (active.kind === "text") {
        const filename = active.path.split("/").pop() || "code.txt";
        const blob = new Blob([active.content || ""], {type: "text/plain;charset=utf-8"});
        saveAs(blob, filename);
        return;
    }

    const source = resolveAssetPreviewSource(active);
    if (!source) {
        return;
    }

    if (source.startsWith("data:")) {
        const parts = source.split(",");
        const mimeMatch = parts[0].match(/data:(.*?);base64/);
        const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
        const binary = atob(parts[1] || "");
        const buffer = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            buffer[i] = binary.charCodeAt(i);
        }
        const filename = active.path.split("/").pop() || "asset.bin";
        saveAs(new Blob([buffer], {type: mime}), filename);
        return;
    }

    const link = document.createElement("a");
    link.href = source;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.click();
}

function getDownloadSafeName(rawName, fallbackName) {
    const fallback = fallbackName || "download";
    const name = String(rawName || "").trim().replace(/[\\/:*?"<>|]+/g, "-");
    return name || fallback;
}

function getProjectFileDownloadFilename(file) {
    return getDownloadSafeName(getProjectPathBaseName(file && file.path), "download.txt");
}

function getProjectFolderArchiveFilename(folderPath) {
    const folderName = getDownloadSafeName(getProjectPathName(folderPath), "folder");
    return folderName.toLowerCase().endsWith(".zip") ? folderName : folderName + ".zip";
}

function projectPayloadHasDownloadItems(payload) {
    return !!(payload
        && Array.isArray(payload.text_files)
        && Array.isArray(payload.assets)
        && Array.isArray(payload.folders)
        && (payload.text_files.length > 0 || payload.assets.length > 0 || payload.folders.length > 0));
}

async function saveAssetSourceAsFile(source, filename) {
    const fetchOptions = String(source || "").startsWith("data:") ? {} : {credentials: "same-origin"};
    const response = await fetch(source, fetchOptions);
    if (!response.ok) {
        throw new Error("asset download failed");
    }
    const blob = await response.blob();
    saveAs(blob, filename);
}

function openAssetSourceForDownload(source, filename) {
    const link = document.createElement("a");
    link.href = source;
    link.download = filename;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.click();
}

async function downloadProjectFile(path) {
    const safePath = safeNormalizePath(path);
    const targetFile = projectFiles.find(f => f.path === safePath);
    if (!targetFile) {
        showProjectNotice("未找到要下载的文件。");
        return;
    }

    hideFloatingMenuIfOpen();
    syncActiveEditorToProject();
    const filename = getProjectFileDownloadFilename(targetFile);

    if (targetFile.kind === "text") {
        const mimeType = getTextResourceMimeType(targetFile) || "text/plain";
        saveAs(new Blob([targetFile.content || ""], {type: mimeType + ";charset=utf-8"}), filename);
        showProjectNotice("文件已下载。");
        return;
    }

    const source = resolveAssetPreviewSource(targetFile);
    if (!source) {
        showProjectNotice("该资源文件暂时无法下载。");
        return;
    }

    try {
        await saveAssetSourceAsFile(source, filename);
        showProjectNotice("文件已下载。");
    } catch (e) {
        openAssetSourceForDownload(source, filename);
        showProjectNotice("已打开资源链接，请在新页面保存文件。");
    }
}

function buildFolderDownloadPayload(folderPath) {
    const safeFolderPath = safeNormalizePath(folderPath);
    const payload = buildSharePayload();
    const folderSet = new Set([safeFolderPath]);
    payload.folders.forEach(path => {
        if (isSameOrInsideFolder(path, safeFolderPath)) {
            folderSet.add(path);
        }
    });

    const textFiles = payload.text_files.filter(file => isPathInsideFolder(file.path, safeFolderPath));
    const assets = payload.assets.filter(file => isPathInsideFolder(file.path, safeFolderPath));
    const firstFile = textFiles[0] || assets[0] || null;
    const activeFile = isPathInsideFolder(payload.active_file, safeFolderPath)
        ? payload.active_file
        : (firstFile ? firstFile.path : "");

    return {
        text_files: textFiles,
        assets: assets,
        folders: Array.from(folderSet),
        active_file: activeFile
    };
}

function buildFileSharePayload(filePath) {
    const safePath = safeNormalizePath(filePath);
    const payload = buildSharePayload();
    const textFiles = payload.text_files.filter(file => safeNormalizePath(file.path) === safePath);
    const assets = payload.assets.filter(file => safeNormalizePath(file.path) === safePath);
    const firstFile = textFiles[0] || assets[0] || null;
    return {
        text_files: textFiles,
        assets: assets,
        folders: [],
        active_file: firstFile ? firstFile.path : ""
    };
}

function buildSelectedProjectArchivePayload() {
    if (!hasSelectedProjectTreeItems()) {
        return null;
    }

    const payload = buildSharePayload();
    const selectedFiles = new Set(selectedProjectFilePaths);
    const textFiles = payload.text_files.filter(file => selectedFiles.has(safeNormalizePath(file.path)));
    const assets = payload.assets.filter(file => selectedFiles.has(safeNormalizePath(file.path)));
    const selectedFolders = new Set(selectedProjectFolderPaths);
    const folders = getAllProjectFolderPaths()
        .filter(path => selectedFolders.has(path))
        .sort((a, b) => a.localeCompare(b));
    const firstFile = textFiles[0] || assets[0] || null;
    const activeFile = selectedFiles.has(safeNormalizePath(payload.active_file))
        ? payload.active_file
        : (firstFile ? firstFile.path : "");

    return {
        text_files: textFiles,
        assets: assets,
        folders: folders,
        active_file: activeFile
    };
}

async function downloadProjectArchivePayload(payload, filename, successMessage, emptyMessage) {
    if (projectArchiveDownloadBusy) {
        return;
    }
    if (!projectPayloadHasDownloadItems(payload)) {
        showProjectNotice(emptyMessage || "当前没有可打包下载的文件。");
        return;
    }

    const active = getActiveProjectFile();
    const language = active && active.kind === "text"
        ? (active.language || detectLanguageFromFilename(active.path))
        : (getCurrentLanguageValue() || SHARECODE_DEFAULT_LANG);
    const code = active && active.kind === "text" ? (active.content || "") : "";
    const formData = new FormData();
    formData.append("project_payload", JSON.stringify(payload));
    formData.append("filename", filename);
    formData.append("code", code);
    formData.append("language", language);

    setProjectDownloadBusy(true);
    try {
        const response = await fetch("/download_project_zip", {
            method: "POST",
            body: formData
        });
        if (!response.ok) {
            throw new Error("download failed");
        }
        const archiveBlob = await response.blob();
        saveAs(archiveBlob, filename);
        showProjectNotice(successMessage || "项目已打包下载。");
    } catch (e) {
        showProjectNotice("打包下载失败，请稍后再试。");
    } finally {
        setProjectDownloadBusy(false);
    }
}

async function downloadProjectFolderArchive(folderPath) {
    const safeFolderPath = safeNormalizePath(folderPath);
    if (!safeFolderPath || !projectFolderExists(safeFolderPath)) {
        showProjectNotice("未找到要下载的文件夹。");
        return;
    }

    hideFloatingMenuIfOpen();
    createProjectFileFromEditorInput();
    syncActiveEditorToProject();
    const payload = buildFolderDownloadPayload(safeFolderPath);
    await downloadProjectArchivePayload(
        payload,
        getProjectFolderArchiveFilename(safeFolderPath),
        "文件夹已打包下载。",
        "文件夹中没有可打包下载的内容。"
    );
}

function downloadProjectTreeItem(kind, path) {
    if (kind === "folder") {
        downloadProjectFolderArchive(path);
        return;
    }
    if (kind === "file") {
        downloadProjectFile(path);
    }
}

function getProjectArchiveFilename() {
    return "codemark-project.zip";
}

function setProjectDownloadBusy(isBusy) {
    projectArchiveDownloadBusy = !!isBusy;
    document.querySelectorAll(".project-download-btn").forEach(button => {
        if (!button.dataset.defaultText) {
            button.dataset.defaultText = button.textContent;
        }
        button.disabled = projectArchiveDownloadBusy;
        button.textContent = projectArchiveDownloadBusy ? "..." : button.dataset.defaultText;
    });
}

async function downloadProjectArchive() {
    if (projectArchiveDownloadBusy) {
        return;
    }
    hideFloatingMenuIfOpen();
    createProjectFileFromEditorInput();
    syncActiveEditorToProject();

    const selectedPayload = buildSelectedProjectArchivePayload();
    const payload = selectedPayload || buildSharePayload();
    await downloadProjectArchivePayload(
        payload,
        getProjectArchiveFilename(),
        selectedPayload ? "选中内容已打包下载。" : "项目已打包下载。",
        selectedPayload ? "选中内容中没有可打包下载的文件。" : "当前没有可打包下载的文件。"
    );
}

function home() {
    window.location.href = "/";
}

function buildSharePayload() {
    syncActiveEditorToProject();
    const textFiles = projectFiles
        .filter(f => f.kind === "text")
        .sort((a, b) => {
            if (a.path === activeFilePath) return -1;
            if (b.path === activeFilePath) return 1;
            return 0;
        })
        .map(f => ({
            path: f.path,
            content: f.content || "",
            language: f.language || detectLanguageFromFilename(f.path),
            highlighted_lines: normalizeHighlightedLines(f.highlighted_lines)
        }));

    const assets = projectFiles.filter(f => f.kind === "asset").map(f => ({
        path: f.path,
        mime_type: f.mime_type || "application/octet-stream",
        size: typeof f.size === "number" ? f.size : 0,
        data_base64: f.data_base64 || "",
        source_project_id: f.data_base64 ? "" : (f.source_project_id || server_share_project_id || ""),
        source_stored_path: f.data_base64 ? "" : (f.source_stored_path || "")
    }));

    return {
        text_files: textFiles,
        assets: assets,
        folders: projectFolders.slice(),
        active_file: activeFilePath
    };
}

function share() {
    openShareModalWithPayload(null);
}

function shareProjectTreeItem(kind, path) {
    const safePath = safeNormalizePath(path);
    if (!safePath) {
        return;
    }

    let payload = null;
    let emptyMessage = "";
    if (kind === "folder") {
        if (!projectFolderExists(safePath)) {
            showProjectNotice("未找到要分享的文件夹。");
            return;
        }
        createProjectFileFromEditorInput();
        syncActiveEditorToProject();
        payload = buildFolderDownloadPayload(safePath);
        emptyMessage = "文件夹中没有可分享的内容。";
    } else if (kind === "file") {
        if (!projectFiles.some(f => f.path === safePath)) {
            showProjectNotice("未找到要分享的文件。");
            return;
        }
        syncActiveEditorToProject();
        payload = buildFileSharePayload(safePath);
        emptyMessage = "未找到要分享的文件。";
    } else {
        return;
    }

    if (!projectPayloadHasDownloadItems(payload)) {
        showProjectNotice(emptyMessage);
        return;
    }

    hideProjectTreeContextMenu();
    openShareModalWithPayload(payload);
}

function openShareModalWithPayload(payloadOverride) {
    hideFloatingMenuIfOpen();
    $('#qrcode').empty();
    $('#share-link-input').val('');
    $('#share-modal .modal-title').text('Share your code');
    $('#copy-success').hide();
    let existingFinalImageContainer = document.getElementById("final-image-container");
    if (existingFinalImageContainer) {
        existingFinalImageContainer.remove();
    }

    $('#share-modal').modal('show');
    generateShareLink(payloadOverride);
}

function generateShareLink(payloadOverride) {
    const payload = payloadOverride || buildSharePayload();
    let language;
    let code;
    if (payloadOverride) {
        const scopedTextFiles = Array.isArray(payload.text_files) ? payload.text_files : [];
        const primaryTextFile = scopedTextFiles.find(f => f.path === payload.active_file) || scopedTextFiles[0] || null;
        if (primaryTextFile) {
            language = primaryTextFile.language || detectLanguageFromFilename(primaryTextFile.path);
            code = primaryTextFile.content || "";
        } else {
            language = getCurrentLanguageValue() || SHARECODE_DEFAULT_LANG;
            code = "";
        }
    } else {
        const active = getActiveProjectFile();
        language = active && active.kind === "text"
            ? (active.language || detectLanguageFromFilename(active.path))
            : (getCurrentLanguageValue() || SHARECODE_DEFAULT_LANG);
        code = active && active.kind === "text" ? (active.content || "") : "";
    }

    const requestData = {
        language: language,
        template: 'sharecode',
        project_payload: JSON.stringify(payload)
    };
    if (code) {
        requestData.code = code;
    }

    $.ajax({
        type: 'POST',
        url: '/upload_code',
        dataType: 'json',
        data: requestData,
        success: function (d) {
            let shareLink = appendShareViewToLink(d.share_link);
            $('#qrcode').empty();
            $('#qrcode').qrcode({
                text: shareLink,
                width: 200,
                height: 200
            });

            $('#share-modal .modal-title')
                .empty()
                .append(document.createTextNode('Code link：'))
                .append($('<a></a>', {
                    href: shareLink,
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    text: shareLink
                }));
            $('#share-link-input').val(shareLink);

            let qrcodeCanvas = $('#qrcode canvas')[0];
            let qrcodeSrc = qrcodeCanvas.toDataURL('image/png');

            let existingFinalImageContainer = document.getElementById("final-image-container");
            if (existingFinalImageContainer) {
                existingFinalImageContainer.remove();
            }
            let finalImageContainer = document.createElement("div");
            finalImageContainer.id = "final-image-container";
            finalImageContainer.style.marginTop = "20px";
            document.getElementById("qrcode").parentNode.appendChild(finalImageContainer);

            html2canvas(document.querySelector("#editorArea")).then(canvas => {
                const ctx = canvas.getContext('2d');
                const qrImg = new Image();
                qrImg.src = qrcodeSrc;
                qrImg.onload = function () {
                    const qrSize = 120;
                    ctx.drawImage(qrImg, canvas.width - qrSize - 10, 10, qrSize, qrSize);
                    const finalImg = document.createElement("img");
                    finalImg.src = canvas.toDataURL('image/png');
                    finalImg.style.maxWidth = "90%";
                    finalImageContainer.appendChild(finalImg);
                };
            });

            copyToClipboard(shareLink);
            $('#share-modal').modal('show');
        }
    });
}

function goPythonRunPage() {
    hideFloatingMenuIfOpen();
    syncActiveEditorToProject();
    const active = getActiveProjectFile();
    if (!active || active.kind !== "text") {
        return;
    }
    const lang = active.language || detectLanguageFromFilename(active.path);
    if (lang !== 'python') {
        return;
    }

    $.ajax({
        type: 'POST',
        url: '/upload_code',
        dataType: 'json',
        data: {
            code: active.content || "",
            language: 'python',
            template: 'editor'
        },
        success: function (d) {
            window.location.href = d.share_link;
        }
    });
}

function copyToClipboard(text) {
    if (!text) {
        return;
    }
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () {
            showCopySuccess();
        }).catch(function () {
            fallbackCopyToClipboard(text);
        });
    } else {
        fallbackCopyToClipboard(text);
    }
}

function fallbackCopyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showCopySuccess();
}

function copyLinkManually() {
    let shareLink = document.getElementById("share-link-input").value;
    copyToClipboard(shareLink);
}

function showCopySuccess() {
    let copyMsg = document.getElementById("copy-success");
    if (!copyMsg) {
        return;
    }
    copyMsg.style.display = "block";
    copyMsg.style.animation = "none";
    void copyMsg.offsetWidth;
    copyMsg.style.animation = null;

    setTimeout(() => {
        copyMsg.style.display = "none";
    }, 2000);
}

function bindOverlayDismiss(overlayId, dialogId) {
    const overlay = document.getElementById(overlayId);
    const dialog = document.getElementById(dialogId);
    overlay.addEventListener("click", function (e) {
        if (e.target === overlay) {
            if (overlayId === "projectConfirmOverlay") {
                closeProjectConfirmDialog();
            } else {
                overlay.style.display = "none";
            }
        }
    });
    dialog.addEventListener("click", function (e) {
        e.stopPropagation();
    });
}

function bindSelectorSync() {
    const langDesktop = document.getElementById("lang-selector-desktop");
    const langMobile = document.getElementById("lang-selector-mobile");
    const themeDesktop = document.getElementById("theme-selector-desktop");
    const themeMobile = document.getElementById("theme-selector-mobile");

    function onLanguageChange(nextLang) {
        const lang = nextLang || SHARECODE_DEFAULT_LANG;
        const active = getActiveProjectFile();
        if (!active || active.kind !== "text") {
            setLanguageSelectors(lang);
            setEditorLang(lang);
            createProjectFileFromEditorInput();
            updatePythonRunButtonVisibility();
            applyShareViewToWorkspace({immediate: true, forceFrame: true});
            scheduleSharecodeDraftCacheSave();
            return;
        }
        active.language = lang;
        setLanguageSelectors(lang);
        setEditorLang(lang);
        updatePythonRunButtonVisibility();
        applyShareViewToWorkspace({immediate: true, forceFrame: true});
        scheduleSharecodeDraftCacheSave();
    }

    function onThemeChange(nextTheme) {
        applyEditorTheme(nextTheme || SHARECODE_DEFAULT_THEME);
        scheduleSharecodeDraftCacheSave();
    }

    langDesktop.addEventListener("change", function () {
        onLanguageChange(langDesktop.value);
    });
    langMobile.addEventListener("change", function () {
        onLanguageChange(langMobile.value);
    });

    themeDesktop.addEventListener("change", function () {
        onThemeChange(themeDesktop.value);
    });
    themeMobile.addEventListener("change", function () {
        onThemeChange(themeMobile.value);
    });

    document.querySelectorAll("[data-share-view-mode]").forEach(button => {
        button.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            setShareViewMode(button.getAttribute("data-share-view-mode"));
        });
    });

    const previewFullscreenButton = document.getElementById("previewFullscreenButton");
    if (previewFullscreenButton) {
        previewFullscreenButton.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            toggleHtmlPreviewFullscreen();
        });
    }

    document.addEventListener("fullscreenchange", function () {
        const editorArea = getEditorAreaElement();
        if (editorArea && document.fullscreenElement !== editorArea) {
            editorArea.classList.remove("is-preview-fullscreen");
        }
        updatePreviewFullscreenButton();
        scheduleHtmlPreviewVisibleRefresh({forceFrame: true});
        if (window.editor) {
            window.editor.resize();
        }
    });

    document.addEventListener("visibilitychange", function () {
        if (!document.hidden) {
            scheduleHtmlPreviewVisibleRefresh({forceFrame: true});
        }
    });

    window.addEventListener("pageshow", function () {
        scheduleHtmlPreviewVisibleRefresh({forceFrame: true});
    });
}
