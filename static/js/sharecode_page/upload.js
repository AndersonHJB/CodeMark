/* Sharecode file/folder upload, drag/drop import, and progress panel. */
function shouldTreatAsText(file, path) {
    const safePath = safeNormalizePath(path).toLowerCase();
    const ext = safePath.includes(".") ? safePath.split(".").pop() : "";
    if (TEXT_EXTENSIONS.has(ext)) {
        return true;
    }
    if (file && typeof file.type === "string") {
        return file.type.startsWith("text/") || file.type.includes("json") || file.type.includes("xml");
    }
    return false;
}

function readFileAsText(file, onProgress) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onprogress = function (e) {
            if (typeof onProgress === "function" && e.lengthComputable) {
                onProgress(e.loaded, e.total);
            }
        };
        reader.onload = function (e) {
            if (typeof onProgress === "function") {
                onProgress(file && file.size ? file.size : 1, file && file.size ? file.size : 1);
            }
            resolve(String(e.target.result || ""));
        };
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

function readFileAsDataURL(file, onProgress) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onprogress = function (e) {
            if (typeof onProgress === "function" && e.lengthComputable) {
                onProgress(e.loaded, e.total);
            }
        };
        reader.onload = function (e) {
            if (typeof onProgress === "function") {
                onProgress(file && file.size ? file.size : 1, file && file.size ? file.size : 1);
            }
            resolve(String(e.target.result || ""));
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function getProjectUploadProgressUnit(file) {
    const size = file && Number(file.size);
    return Number.isFinite(size) && size > 0 ? size : 1;
}

function normalizeProjectUploadItems(fileList) {
    return Array.from(fileList || [])
        .map((item, index) => {
            const file = item && item.file ? item.file : item;
            if (!file) {
                return null;
            }
            const relativePath = safeNormalizePath(
                (item && item.relativePath) || file.webkitRelativePath || file.name
            );
            if (!relativePath) {
                return null;
            }
            return {
                file: file,
                relativePath: relativePath,
                uploadKey: (item && item.uploadKey) || `upload-file-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`
            };
        })
        .filter(Boolean);
}

function normalizeProjectUploadFolderPaths(folderPaths) {
    return Array.from(folderPaths || [])
        .map(path => safeNormalizePath(path))
        .filter(Boolean);
}

function addUploadFolderAncestors(folderSet, folderPath) {
    const safeFolderPath = safeNormalizePath(folderPath);
    if (!safeFolderPath) {
        return;
    }
    const parts = safeFolderPath.split("/");
    let current = "";
    for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        folderSet.add(current);
    }
}

function getUploadRelativeParentPath(relativePath) {
    const safePath = safeNormalizePath(relativePath);
    if (!safePath || safePath.indexOf("/") < 0) {
        return "";
    }
    const parts = safePath.split("/");
    parts.pop();
    return parts.join("/");
}

function formatProjectUploadTargetLabel(folderPath) {
    const safeFolderPath = safeNormalizePath(folderPath || "");
    return safeFolderPath || "根路径";
}

function getProjectUploadTargetOptions() {
    return ["", ...getAllProjectFolderPaths()];
}

function renderProjectUploadTargetSelect(selectedPath) {
    const select = document.getElementById("projectUploadTargetSelect");
    if (!select) {
        return;
    }
    const safeSelectedPath = getProjectUploadTargetPath(selectedPath);
    select.innerHTML = "";
    for (const folderPath of getProjectUploadTargetOptions()) {
        const option = document.createElement("option");
        option.value = folderPath;
        option.textContent = formatProjectUploadTargetLabel(folderPath);
        if (folderPath === safeSelectedPath) {
            option.selected = true;
        }
        select.appendChild(option);
    }
    projectUploadDialogTargetPath = safeSelectedPath;
}

function getProjectUploadDialogTargetPath() {
    const select = document.getElementById("projectUploadTargetSelect");
    if (select) {
        return getProjectUploadTargetPath(select.value);
    }
    return getProjectUploadTargetPath(projectUploadDialogTargetPath);
}

function openProjectFolderUploadDialog(targetFolderPath) {
    hideFloatingMenuIfOpen();
    hideProjectTreeContextMenu();
    projectTreeInlineDeleteTarget = null;
    const safeTargetPath = getProjectUploadTargetPath(
        typeof targetFolderPath === "string" ? targetFolderPath : getSelectedProjectUploadTargetPath()
    );
    renderProjectUploadTargetSelect(safeTargetPath);
    const overlay = document.getElementById("projectUploadOverlay");
    if (overlay) {
        overlay.classList.add("show");
        overlay.setAttribute("aria-hidden", "false");
    }
    const dropZone = document.getElementById("projectUploadDropZone");
    if (dropZone) {
        setTimeout(() => dropZone.focus(), 0);
    }
}

function closeProjectFolderUploadDialog() {
    const overlay = document.getElementById("projectUploadOverlay");
    if (overlay) {
        overlay.classList.remove("show");
        overlay.setAttribute("aria-hidden", "true");
    }
    const dropZone = document.getElementById("projectUploadDropZone");
    if (dropZone) {
        dropZone.classList.remove("is-drag-over");
    }
}

function openProjectFolderPickerFromDialog() {
    const elem = document.getElementById("folder-input");
    if (!elem) {
        return;
    }
    pendingProjectUploadTargetPath = getProjectUploadDialogTargetPath();
    elem.click();
}

function setProjectUploadProgressPanelVisible(isVisible) {
    const panel = document.getElementById("projectUploadProgressPanel");
    if (!panel) {
        return;
    }
    panel.classList.toggle("show", !!isVisible);
    panel.setAttribute("aria-hidden", isVisible ? "false" : "true");
}

function closeProjectUploadProgressPanel() {
    if (projectUploadProgressAutoCloseTimer) {
        clearTimeout(projectUploadProgressAutoCloseTimer);
        projectUploadProgressAutoCloseTimer = null;
    }
    if (projectUploadProgressState) {
        projectUploadProgressState.isVisible = false;
    }
    setProjectUploadProgressPanelVisible(false);
}

function toggleProjectUploadProgressPanel() {
    if (!projectUploadProgressState) {
        return;
    }
    projectUploadProgressState.collapsed = !projectUploadProgressState.collapsed;
    projectUploadProgressState.isVisible = true;
    scheduleProjectUploadProgressRender();
}

function getProjectUploadEntryProgress(entry) {
    if (!entry || !entry.total) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round((entry.loaded / entry.total) * 100)));
}

function createProjectUploadProgressEntry(entry) {
    const row = document.createElement("div");
    row.className = "project-upload-progress-item";

    const ring = document.createElement("span");
    ring.className = "project-upload-progress-ring";
    const progress = getProjectUploadEntryProgress(entry);
    ring.style.setProperty("--progress", String(progress));
    if (entry.status === "complete") {
        ring.classList.add("is-complete");
    }
    ring.appendChild(createBootstrapIcon("bi-check-lg", "", ""));
    row.appendChild(ring);

    const text = document.createElement("div");
    text.style.minWidth = "0";
    const name = document.createElement("div");
    name.className = "project-upload-progress-name";
    name.textContent = entry.name || entry.path || (entry.kind === "folder" ? "Folder" : "File");
    const path = document.createElement("div");
    path.className = "project-upload-progress-path";
    path.textContent = entry.path || "";
    text.appendChild(name);
    text.appendChild(path);
    row.appendChild(text);

    const percent = document.createElement("div");
    percent.className = "project-upload-progress-percent";
    percent.textContent = entry.status === "complete" ? "完成" : `${progress}%`;
    row.appendChild(percent);

    return row;
}

function updateProjectUploadFolderProgress(state) {
    if (!state || !state.folderEntries.length) {
        return;
    }
    for (const folderEntry of state.folderEntries) {
        let total = 0;
        let loaded = 0;
        for (const fileEntry of state.fileEntries) {
            if (isSameOrInsideFolder(fileEntry.relativePath, folderEntry.relativePath)) {
                total += fileEntry.total;
                loaded += fileEntry.loaded;
            }
        }
        if (total > 0) {
            folderEntry.total = total;
            folderEntry.loaded = loaded;
            folderEntry.status = loaded >= total ? "complete" : "uploading";
        } else if (state.status === "complete") {
            folderEntry.loaded = folderEntry.total;
            folderEntry.status = "complete";
        }
    }
}

function renderProjectUploadProgressPanel() {
    projectUploadProgressRenderFrame = null;
    const state = projectUploadProgressState;
    if (!state) {
        setProjectUploadProgressPanelVisible(false);
        return;
    }
    updateProjectUploadFolderProgress(state);

    const panel = document.getElementById("projectUploadProgressPanel");
    const title = document.getElementById("projectUploadProgressTitle");
    const summary = document.getElementById("projectUploadProgressSummary");
    const list = document.getElementById("projectUploadProgressList");
    const headerRing = document.getElementById("projectUploadProgressHeaderRing");
    const collapseIcon = document.getElementById("projectUploadProgressCollapseIcon");
    if (!panel || !title || !summary || !list || !headerRing) {
        return;
    }

    const entries = state.entries;
    const total = entries.length || 1;
    const completed = entries.filter(entry => entry.status === "complete").length;
    const loaded = entries.reduce((sum, entry) => sum + Math.min(entry.loaded, entry.total), 0);
    const totalUnits = entries.reduce((sum, entry) => sum + entry.total, 0) || 1;
    const headerProgress = state.status === "complete" ? 100 : Math.max(0, Math.min(100, Math.round((loaded / totalUnits) * 100)));

    title.textContent = state.status === "complete" ? "上传完成" : "正在上传";
    summary.textContent = `${completed}/${total} 项 · ${formatProjectUploadTargetLabel(state.targetPath)}`;
    headerRing.style.setProperty("--progress", String(headerProgress));
    headerRing.classList.toggle("is-complete", state.status === "complete");
    panel.classList.toggle("is-collapsed", !!state.collapsed);
    if (collapseIcon) {
        collapseIcon.className = state.collapsed ? "bi bi-chevron-up" : "bi bi-chevron-down";
    }

    list.innerHTML = "";
    for (const entry of entries) {
        list.appendChild(createProjectUploadProgressEntry(entry));
    }
    setProjectUploadProgressPanelVisible(state.isVisible);
}

function scheduleProjectUploadProgressRender() {
    if (projectUploadProgressRenderFrame) {
        return;
    }
    projectUploadProgressRenderFrame = requestAnimationFrame(renderProjectUploadProgressPanel);
}

function buildProjectUploadProgressEntries(uploadItems, folderPaths, targetFolderPath) {
    const folderSet = new Set();
    for (const folderPath of folderPaths) {
        addUploadFolderAncestors(folderSet, folderPath);
    }
    for (const item of uploadItems) {
        addUploadFolderAncestors(folderSet, getUploadRelativeParentPath(item.relativePath));
    }

    const folderEntries = Array.from(folderSet)
        .sort((a, b) => a.localeCompare(b))
        .map(folderPath => {
            const displayPath = safeNormalizePath(joinProjectPath(targetFolderPath, folderPath));
            return {
                id: `folder-${folderPath}`,
                kind: "folder",
                relativePath: folderPath,
                path: displayPath || folderPath,
                name: getProjectPathName(folderPath) || folderPath,
                loaded: 0,
                total: 1,
                status: "uploading"
            };
        });

    const fileEntries = uploadItems.map(item => {
        const displayPath = safeNormalizePath(joinProjectPath(targetFolderPath, item.relativePath));
        return {
            id: item.uploadKey,
            kind: "file",
            relativePath: item.relativePath,
            path: displayPath || item.relativePath,
            name: getProjectPathName(item.relativePath) || item.relativePath,
            loaded: 0,
            total: getProjectUploadProgressUnit(item.file),
            status: "uploading"
        };
    });

    return {
        entries: folderEntries.concat(fileEntries),
        folderEntries: folderEntries,
        fileEntries: fileEntries
    };
}

function startProjectUploadProgress(uploadItems, folderPaths, targetFolderPath) {
    if (projectUploadProgressAutoCloseTimer) {
        clearTimeout(projectUploadProgressAutoCloseTimer);
        projectUploadProgressAutoCloseTimer = null;
    }
    const builtEntries = buildProjectUploadProgressEntries(uploadItems, folderPaths, targetFolderPath);
    projectUploadProgressState = {
        id: `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        targetPath: targetFolderPath || "",
        status: "uploading",
        collapsed: false,
        isVisible: true,
        entries: builtEntries.entries,
        folderEntries: builtEntries.folderEntries,
        fileEntries: builtEntries.fileEntries,
        fileEntryByKey: new Map(builtEntries.fileEntries.map(entry => [entry.id, entry]))
    };
    scheduleProjectUploadProgressRender();
    return projectUploadProgressState.id;
}

function updateProjectUploadFileProgress(progressId, uploadKey, loaded) {
    const state = projectUploadProgressState;
    if (!state || state.id !== progressId) {
        return;
    }
    const entry = state.fileEntryByKey.get(uploadKey);
    if (!entry) {
        return;
    }
    entry.loaded = Math.max(0, Math.min(entry.total, loaded || 0));
    scheduleProjectUploadProgressRender();
}

function completeProjectUploadFileProgress(progressId, uploadKey) {
    const state = projectUploadProgressState;
    if (!state || state.id !== progressId) {
        return;
    }
    const entry = state.fileEntryByKey.get(uploadKey);
    if (!entry) {
        return;
    }
    entry.loaded = entry.total;
    entry.status = "complete";
    scheduleProjectUploadProgressRender();
}

function finishProjectUploadProgress(progressId) {
    const state = projectUploadProgressState;
    if (!state || state.id !== progressId) {
        return;
    }
    state.status = "complete";
    for (const entry of state.entries) {
        entry.loaded = entry.total;
        entry.status = "complete";
    }
    scheduleProjectUploadProgressRender();
    if (state.isVisible) {
        projectUploadProgressAutoCloseTimer = setTimeout(function () {
            const currentState = projectUploadProgressState;
            if (currentState && currentState.id === progressId && currentState.status === "complete") {
                closeProjectUploadProgressPanel();
            }
        }, 6000);
    }
}

function upsertProjectFileSilently(fileObj) {
    const safePath = safeNormalizePath(fileObj && fileObj.path);
    if (!safePath) {
        return "";
    }
    const nextFile = Object.assign({}, fileObj, {path: safePath});
    const existingIndex = projectFiles.findIndex(f => f.path === safePath);
    if (existingIndex >= 0) {
        projectFiles[existingIndex] = Object.assign({}, projectFiles[existingIndex], nextFile);
    } else {
        projectFiles.push(nextFile);
    }
    return safePath;
}

function addUploadedFolderPathsToProject(folderPaths, targetFolderPath) {
    for (const folderPath of folderPaths) {
        const projectFolderPath = safeNormalizePath(joinProjectPath(targetFolderPath, folderPath));
        if (projectFolderPath && !projectPathConflictsWithFile(projectFolderPath)) {
            addProjectFolder(projectFolderPath);
        }
    }
}

async function importProjectUploadItems(uploadItems, targetFolderPath, options) {
    const opts = options || {};
    const normalizedItems = normalizeProjectUploadItems(uploadItems);
    const explicitFolderPaths = normalizeProjectUploadFolderPaths(opts.folderPaths);
    if (!normalizedItems.length && !explicitFolderPaths.length) {
        return;
    }

    syncActiveEditorToProject();
    let firstAddedPath = "";
    const safeTargetFolderPath = getProjectUploadTargetPath(targetFolderPath);
    const progressId = opts.trackProgress === false
        ? ""
        : startProjectUploadProgress(normalizedItems, explicitFolderPaths, safeTargetFolderPath);
    let failedCount = 0;

    addUploadedFolderPathsToProject(explicitFolderPaths, safeTargetFolderPath);

    for (const item of normalizedItems) {
        const file = item.file;
        const incomingPath = safeNormalizePath(item.relativePath);
        if (!incomingPath) {
            continue;
        }
        const projectPath = ensureUniquePath(joinProjectPath(safeTargetFolderPath, incomingPath));
        if (!projectPath) {
            continue;
        }

        try {
            const updateProgress = function (loaded) {
                if (progressId) {
                    updateProjectUploadFileProgress(progressId, item.uploadKey, loaded);
                }
            };
            if (shouldTreatAsText(file, incomingPath)) {
                const textContent = await readFileAsText(file, updateProgress);
                upsertProjectFileSilently({
                    kind: "text",
                    path: projectPath,
                    content: textContent,
                    language: detectLanguageFromFilename(projectPath)
                });
                if (!firstAddedPath) {
                    firstAddedPath = projectPath;
                }
            } else {
                const dataUrl = await readFileAsDataURL(file, updateProgress);
                upsertProjectFileSilently({
                    kind: "asset",
                    path: projectPath,
                    mime_type: file.type || "application/octet-stream",
                    size: file.size,
                    data_base64: dataUrl,
                    source_project_id: "",
                    source_stored_path: "",
                    url: ""
                });
                if (!firstAddedPath) {
                    firstAddedPath = projectPath;
                }
            }
            if (progressId) {
                completeProjectUploadFileProgress(progressId, item.uploadKey);
            }
        } catch (e) {
            failedCount += 1;
            if (progressId) {
                completeProjectUploadFileProgress(progressId, item.uploadKey);
            }
        }
    }

    const inferredFolderPaths = new Set(explicitFolderPaths);
    for (const item of normalizedItems) {
        addUploadFolderAncestors(inferredFolderPaths, getUploadRelativeParentPath(item.relativePath));
    }
    addUploadedFolderPathsToProject(Array.from(inferredFolderPaths), safeTargetFolderPath);

    if (safeTargetFolderPath) {
        projectTreeSelectedFolderPath = safeTargetFolderPath;
        expandProjectTreeAncestors(joinProjectPath(safeTargetFolderPath, "_upload"));
        collapsedFolderPaths.delete(safeTargetFolderPath);
    }
    renderProjectFileTree();
    updateSidebarVisibilityByFileCount(false);
    if (firstAddedPath) {
        openProjectFile(firstAddedPath);
    } else if (explicitFolderPaths.length) {
        refreshProjectAfterMutation(activeFilePath, {preserveSidebar: true});
    }
    scheduleSharecodeDraftCacheSave();
    if (progressId) {
        finishProjectUploadProgress(progressId);
    }
    if (failedCount) {
        showProjectNotice(`${failedCount} 个文件上传失败。`);
    }
}

async function importFilesFromInput(fileList, targetFolderPath) {
    await importProjectUploadItems(fileList, targetFolderPath);
}

function readDirectoryEntries(reader) {
    return new Promise((resolve, reject) => {
        const entries = [];
        const readBatch = function () {
            reader.readEntries(function (batch) {
                if (!batch.length) {
                    resolve(entries);
                    return;
                }
                entries.push(...batch);
                readBatch();
            }, reject);
        };
        readBatch();
    });
}

function getFileFromEntry(entry) {
    return new Promise((resolve, reject) => {
        entry.file(resolve, reject);
    });
}

async function collectProjectUploadEntry(entry, parentPath, payload) {
    if (!entry) {
        return;
    }
    const entryPath = safeNormalizePath(joinProjectPath(parentPath || "", entry.name || ""));
    if (!entryPath) {
        return;
    }
    if (entry.isFile) {
        const file = await getFileFromEntry(entry);
        payload.files.push({
            file: file,
            relativePath: entryPath
        });
        return;
    }
    if (entry.isDirectory) {
        payload.folders.push(entryPath);
        const reader = entry.createReader();
        const children = await readDirectoryEntries(reader);
        for (const child of children) {
            await collectProjectUploadEntry(child, entryPath, payload);
        }
    }
}

async function getProjectUploadPayloadFromDataTransfer(dataTransfer) {
    const payload = {files: [], folders: []};
    if (!dataTransfer) {
        return payload;
    }
    const items = Array.from(dataTransfer.items || []).filter(item => item.kind === "file");
    const entries = items
        .map(item => typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null)
        .filter(Boolean);

    if (entries.length) {
        for (const entry of entries) {
            await collectProjectUploadEntry(entry, "", payload);
        }
        return payload;
    }

    payload.files = Array.from(dataTransfer.files || []).map(file => ({
        file: file,
        relativePath: file.webkitRelativePath || file.name
    }));
    return payload;
}

function isExternalFileDragEvent(e) {
    if (!e || !e.dataTransfer) {
        return false;
    }
    return Array.from(e.dataTransfer.types || []).includes("Files");
}

function clearProjectExternalUploadTarget() {
    if (projectExternalUploadTargetElement) {
        projectExternalUploadTargetElement.classList.remove("is-external-upload-target");
        projectExternalUploadTargetElement = null;
    }
}

function setProjectExternalUploadTarget(element) {
    if (projectExternalUploadTargetElement === element) {
        return;
    }
    clearProjectExternalUploadTarget();
    projectExternalUploadTargetElement = element || null;
    if (projectExternalUploadTargetElement) {
        projectExternalUploadTargetElement.classList.add("is-external-upload-target");
    }
}

async function importProjectUploadFromDropEvent(e, targetFolderPath) {
    const payload = await getProjectUploadPayloadFromDataTransfer(e.dataTransfer);
    await importProjectUploadItems(payload.files, targetFolderPath, {folderPaths: payload.folders});
}

function bindProjectExternalUploadDropTarget(element, targetPathResolver, options) {
    if (!element) {
        return;
    }
    const opts = options || {};
    const highlightElement = opts.highlightElement || element;
    const shouldHandleEvent = typeof opts.shouldHandleEvent === "function"
        ? opts.shouldHandleEvent
        : function () { return true; };

    element.addEventListener("dragover", function (e) {
        if (!isExternalFileDragEvent(e) || !shouldHandleEvent(e)) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
        setProjectExternalUploadTarget(highlightElement);
    });
    element.addEventListener("dragleave", function (e) {
        if (element.contains(e.relatedTarget)) {
            return;
        }
        clearProjectExternalUploadTarget();
    });
    element.addEventListener("drop", async function (e) {
        if (!isExternalFileDragEvent(e) || !shouldHandleEvent(e)) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        clearProjectExternalUploadTarget();
        const targetPath = typeof targetPathResolver === "function" ? targetPathResolver(e) : targetPathResolver;
        await importProjectUploadFromDropEvent(e, getProjectUploadTargetPath(targetPath));
    });
}

function bindProjectUploadDialog() {
    const overlay = document.getElementById("projectUploadOverlay");
    const dropZone = document.getElementById("projectUploadDropZone");
    const chooseButton = document.getElementById("projectUploadChooseFolderBtn");
    const targetSelect = document.getElementById("projectUploadTargetSelect");

    if (overlay) {
        overlay.addEventListener("click", function (e) {
            if (e.target === overlay) {
                closeProjectFolderUploadDialog();
            }
        });
    }
    if (targetSelect) {
        targetSelect.addEventListener("change", function () {
            projectUploadDialogTargetPath = getProjectUploadTargetPath(targetSelect.value);
        });
    }
    if (chooseButton) {
        chooseButton.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            openProjectFolderPickerFromDialog();
        });
    }
    if (dropZone) {
        dropZone.addEventListener("click", function (e) {
            if (e.target.closest("select, option, button")) {
                return;
            }
            openProjectFolderPickerFromDialog();
        });
        dropZone.addEventListener("keydown", function (e) {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openProjectFolderPickerFromDialog();
            }
        });
        dropZone.addEventListener("dragover", function (e) {
            if (!isExternalFileDragEvent(e)) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "copy";
            dropZone.classList.add("is-drag-over");
        });
        dropZone.addEventListener("dragleave", function (e) {
            if (!dropZone.contains(e.relatedTarget)) {
                dropZone.classList.remove("is-drag-over");
            }
        });
        dropZone.addEventListener("drop", async function (e) {
            if (!isExternalFileDragEvent(e)) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove("is-drag-over");
            closeProjectFolderUploadDialog();
            await importProjectUploadFromDropEvent(e, getProjectUploadDialogTargetPath());
        });
    }
}

function bindGlobalProjectExternalUpload() {
    const treeEl = document.getElementById("projectFileTree");
    const emptyEl = document.getElementById("projectTreeEmpty");
    const editorArea = document.getElementById("editorArea");

    bindProjectExternalUploadDropTarget(treeEl, "", {
        shouldHandleEvent: isProjectTreeRootDropEvent
    });
    bindProjectExternalUploadDropTarget(emptyEl, "");
    bindProjectExternalUploadDropTarget(editorArea, function () {
        return getSelectedProjectUploadTargetPath();
    });

    document.addEventListener("dragover", function (e) {
        if (!isExternalFileDragEvent(e)) {
            return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
    });
    document.addEventListener("drop", async function (e) {
        if (!isExternalFileDragEvent(e) || e.defaultPrevented) {
            return;
        }
        e.preventDefault();
        clearProjectExternalUploadTarget();
        await importProjectUploadFromDropEvent(e, getSelectedProjectUploadTargetPath());
    });
}
