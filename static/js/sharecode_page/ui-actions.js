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
    prepareHiddenShareQrSource();
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
            prepareHiddenShareQrSource();
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

            createShareEditorAreaCanvas().catch(function () {
                return html2canvas(document.querySelector("#editorArea"), {useCORS: true});
            }).then(canvas => {
                return appendQrToShareCanvas(canvas, qrcodeSrc);
            }).then(finalCanvas => {
                const finalImg = document.createElement("img");
                finalImg.src = finalCanvas.toDataURL('image/png');
                finalImg.style.maxWidth = "90%";
                finalImageContainer.appendChild(finalImg);
            });

            copyToClipboard(shareLink);
            $('#share-modal').modal('show');
        }
    });
}

function prepareHiddenShareQrSource() {
    $('#qrcode')
        .empty()
        .attr('aria-hidden', 'true')
        .css({
            display: 'block',
            position: 'absolute',
            left: '-9999px',
            top: '0',
            width: '200px',
            height: '200px',
            margin: '0',
            overflow: 'hidden',
            opacity: '0',
            pointerEvents: 'none'
        });
}

function getShareImageQrSize(canvas) {
    const fallbackSize = 160;
    if (!canvas || !canvas.width || !canvas.height) {
        return fallbackSize;
    }
    const shorterSide = Math.min(canvas.width, canvas.height);
    return Math.max(120, Math.min(240, Math.round(shorterSide * 0.18)));
}

function waitForShareImageFrame() {
    return new Promise(resolve => {
        if (window.requestAnimationFrame) {
            window.requestAnimationFrame(function () {
                window.requestAnimationFrame(resolve);
            });
        } else {
            setTimeout(resolve, 32);
        }
    });
}

function waitForShareImageTimeout(timeoutMs) {
    return new Promise(resolve => {
        setTimeout(resolve, timeoutMs);
    });
}

function waitForShareImageLoadEvent(target, timeoutMs) {
    return new Promise(resolve => {
        let settled = false;
        let timer = null;

        function done() {
            if (settled) {
                return;
            }
            settled = true;
            if (timer) {
                clearTimeout(timer);
            }
            target.removeEventListener("load", done);
            target.removeEventListener("error", done);
            resolve();
        }

        target.addEventListener("load", done, {once: true});
        target.addEventListener("error", done, {once: true});
        timer = setTimeout(done, timeoutMs);
    });
}

function getVisibleSharePreviewFrame() {
    const previewPane = document.getElementById("htmlPreviewPane");
    const frame = document.getElementById("htmlPreviewFrame");
    if (!previewPane || !frame) {
        return null;
    }
    const paneStyle = window.getComputedStyle ? window.getComputedStyle(previewPane) : null;
    const frameStyle = window.getComputedStyle ? window.getComputedStyle(frame) : null;
    const paneRect = previewPane.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    if ((paneStyle && paneStyle.display === "none")
        || (frameStyle && frameStyle.display === "none")
        || paneRect.width <= 0
        || paneRect.height <= 0
        || frameRect.width <= 0
        || frameRect.height <= 0) {
        return null;
    }
    return frame;
}

async function waitForSharePreviewFrameReady(frame) {
    if (!frame) {
        return;
    }

    const writeToken = frame.dataset.codemarkPreviewWriteToken || "";
    const loadedToken = frame.dataset.codemarkPreviewLoadedToken || "";
    if (writeToken && loadedToken !== writeToken) {
        await waitForShareImageLoadEvent(frame, 1400);
    }
    await waitForShareImageFrame();
}

async function refreshVisibleSharePreviewFrameForCapture() {
    const frame = getVisibleSharePreviewFrame();
    if (!frame || typeof refreshHtmlPreview !== "function") {
        return frame;
    }
    const active = typeof getActiveProjectFile === "function" ? getActiveProjectFile() : null;
    if (typeof isHtmlPreviewableFile === "function" && !isHtmlPreviewableFile(active)) {
        return frame;
    }
    refreshHtmlPreview(true, {forceFrame: false});
    const nextFrame = getVisibleSharePreviewFrame();
    await waitForSharePreviewFrameReady(nextFrame);
    return nextFrame;
}

function getShareFrameScrollPosition(frame) {
    let frameDocument = null;
    let frameWindow = null;
    try {
        frameDocument = frame.contentDocument;
        frameWindow = frame.contentWindow;
    } catch (e) {
        return {x: 0, y: 0};
    }
    const docEl = frameDocument && frameDocument.documentElement;
    const body = frameDocument && frameDocument.body;
    return {
        x: Math.max(0, (frameWindow && frameWindow.scrollX) || (docEl && docEl.scrollLeft) || (body && body.scrollLeft) || 0),
        y: Math.max(0, (frameWindow && frameWindow.scrollY) || (docEl && docEl.scrollTop) || (body && body.scrollTop) || 0)
    };
}

function buildSharePreviewCaptureHtml() {
    if (typeof getActiveProjectFile !== "function") {
        return "";
    }
    const active = getActiveProjectFile();
    if (typeof isHtmlPreviewableFile === "function" && !isHtmlPreviewableFile(active)) {
        return "";
    }
    if (typeof isMarkdownDocumentFile === "function" && isMarkdownDocumentFile(active)) {
        return buildMarkdownPreviewDocument(active);
    }
    if (typeof shouldBuildReactPreviewDocument === "function" && shouldBuildReactPreviewDocument(active)) {
        return buildReactPreviewDocument(active);
    }
    if (typeof buildHtmlPreviewDocument === "function") {
        return buildHtmlPreviewDocument(active);
    }
    return "";
}

function stripSharePreviewCaptureScripts(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(html || ""), "text/html");
    doc.querySelectorAll("script").forEach(script => {
        script.remove();
    });
    return "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
}

async function waitForShareCaptureFrameReady(frame) {
    if (!frame) {
        return;
    }
    const frameDocument = frame.contentDocument;
    if (!frameDocument) {
        return;
    }

    const waits = [];
    if (frameDocument.fonts && frameDocument.fonts.ready) {
        waits.push(frameDocument.fonts.ready.catch(function () {
        }));
    }
    Array.from(frameDocument.images || []).forEach(img => {
        if (!img.complete) {
            waits.push(waitForShareImageLoadEvent(img, 900));
        }
    });
    if (waits.length > 0) {
        await Promise.race([
            Promise.all(waits),
            waitForShareImageTimeout(1800)
        ]);
    }
    await waitForShareImageFrame();
}

function syncShareCaptureFrameScroll(frame) {
    if (!frame || !frame.contentDocument) {
        return;
    }
    const active = typeof getActiveProjectFile === "function" ? getActiveProjectFile() : null;
    const frameDocument = frame.contentDocument;
    const scrollElement = frameDocument.scrollingElement || frameDocument.documentElement || frameDocument.body;
    if (!scrollElement) {
        return;
    }
    if (typeof isMarkdownDocumentFile !== "function"
        || !isMarkdownDocumentFile(active)
        || typeof getEditorVisibleMarkdownLineInfo !== "function") {
        scrollElement.scrollTop = 0;
        return;
    }

    const editorInfo = getEditorVisibleMarkdownLineInfo();
    if (!editorInfo) {
        scrollElement.scrollTop = 0;
        return;
    }

    const sourceLine = Math.max(1, Number(editorInfo.line) || 1);
    const markers = Array.from(frameDocument.querySelectorAll("[data-codemark-source-line]"));
    let target = null;
    markers.forEach(marker => {
        const markerLine = Number(marker.getAttribute("data-codemark-source-line")) || 0;
        if (markerLine <= sourceLine) {
            target = marker;
        }
    });
    if (target) {
        scrollElement.scrollTop = Math.max(0, target.offsetTop - 24);
    }
}

async function createSharePreviewCaptureFrame(sourceFrame) {
    const rawHtml = buildSharePreviewCaptureHtml();
    if (!rawHtml) {
        return null;
    }
    const html = stripSharePreviewCaptureScripts(rawHtml);
    const frameRect = sourceFrame.getBoundingClientRect();
    const captureFrame = document.createElement("iframe");
    captureFrame.setAttribute("sandbox", "allow-same-origin");
    captureFrame.style.position = "fixed";
    captureFrame.style.left = "-10000px";
    captureFrame.style.top = "0";
    captureFrame.style.width = `${Math.max(1, Math.round(frameRect.width))}px`;
    captureFrame.style.height = `${Math.max(1, Math.round(frameRect.height))}px`;
    captureFrame.style.border = "0";
    captureFrame.style.opacity = "0";
    captureFrame.style.pointerEvents = "none";
    document.body.appendChild(captureFrame);
    const ready = waitForShareImageLoadEvent(captureFrame, 1200);
    captureFrame.srcdoc = html;
    await ready;
    await waitForShareCaptureFrameReady(captureFrame);
    syncShareCaptureFrameScroll(captureFrame);
    await waitForShareImageFrame();
    return captureFrame;
}

async function captureSharePreviewFrame(frame) {
    if (!frame) {
        return null;
    }
    let captureFrame = null;
    try {
        captureFrame = await createSharePreviewCaptureFrame(frame);
        if (!captureFrame || !captureFrame.contentDocument || !captureFrame.contentDocument.documentElement) {
            return null;
        }
        const frameRect = frame.getBoundingClientRect();
        const scroll = getShareFrameScrollPosition(captureFrame);
        return await html2canvas(captureFrame.contentDocument.documentElement, {
            backgroundColor: "#ffffff",
            useCORS: true,
            x: scroll.x,
            y: scroll.y,
            width: Math.max(1, Math.round(frameRect.width)),
            height: Math.max(1, Math.round(frameRect.height)),
            windowWidth: Math.max(1, Math.round(frameRect.width)),
            windowHeight: Math.max(1, Math.round(frameRect.height)),
            scrollX: scroll.x,
            scrollY: scroll.y
        });
    } finally {
        if (captureFrame && captureFrame.parentNode) {
            captureFrame.parentNode.removeChild(captureFrame);
        }
    }
}

function drawCanvasAtElementRect(targetCanvas, sourceCanvas, rootElement, element) {
    if (!targetCanvas || !sourceCanvas || !rootElement || !element) {
        return;
    }
    const rootRect = rootElement.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    if (!rootRect.width || !rootRect.height || !elementRect.width || !elementRect.height) {
        return;
    }
    const scaleX = targetCanvas.width / rootRect.width;
    const scaleY = targetCanvas.height / rootRect.height;
    const ctx = targetCanvas.getContext("2d");
    ctx.drawImage(
        sourceCanvas,
        0,
        0,
        sourceCanvas.width,
        sourceCanvas.height,
        Math.round((elementRect.left - rootRect.left) * scaleX),
        Math.round((elementRect.top - rootRect.top) * scaleY),
        Math.round(elementRect.width * scaleX),
        Math.round(elementRect.height * scaleY)
    );
}

async function paintSharePreviewFrameOntoCanvas(canvas, editorArea, frame) {
    if (!canvas || !editorArea || !frame) {
        return canvas;
    }
    try {
        const frameCanvas = await captureSharePreviewFrame(frame);
        drawCanvasAtElementRect(canvas, frameCanvas, editorArea, frame);
    } catch (e) {
    }
    return canvas;
}

async function paintSharePreviewControlsOntoCanvas(canvas, editorArea) {
    const controls = document.getElementById("editorPreviewControls");
    if (!controls || !editorArea) {
        return canvas;
    }
    const style = window.getComputedStyle ? window.getComputedStyle(controls) : null;
    const rect = controls.getBoundingClientRect();
    if ((style && style.display === "none") || rect.width <= 0 || rect.height <= 0) {
        return canvas;
    }
    try {
        const controlsCanvas = await html2canvas(controls, {
            backgroundColor: null,
            useCORS: true
        });
        drawCanvasAtElementRect(canvas, controlsCanvas, editorArea, controls);
    } catch (e) {
    }
    return canvas;
}

async function createShareEditorAreaCanvas() {
    const editorArea = document.querySelector("#editorArea");
    if (!editorArea) {
        throw new Error("Missing editor area.");
    }
    const frame = await refreshVisibleSharePreviewFrameForCapture();
    const canvas = await html2canvas(editorArea, {useCORS: true});
    await paintSharePreviewFrameOntoCanvas(canvas, editorArea, frame);
    await paintSharePreviewControlsOntoCanvas(canvas, editorArea);
    return canvas;
}

function loadShareImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = function () {
            resolve(img);
        };
        img.onerror = reject;
        img.src = src;
    });
}

async function appendQrToShareCanvas(canvas, qrcodeSrc) {
    const qrImg = await loadShareImage(qrcodeSrc);
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = canvas.width;
    finalCanvas.height = canvas.height;
    const ctx = finalCanvas.getContext("2d");
    ctx.drawImage(canvas, 0, 0);

    const qrSize = getShareImageQrSize(finalCanvas);
    const qrMargin = Math.max(12, Math.round(qrSize * 0.08));
    const qrX = finalCanvas.width - qrSize - qrMargin;
    const qrY = qrMargin;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(qrX, qrY, qrSize, qrSize);
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
    return finalCanvas;
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
