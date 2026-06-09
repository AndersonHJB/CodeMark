/* Sharecode project tree selection, CRUD, drag/drop, and rendering. */
function isProjectFolderCollapsed(path) {
    const safePath = safeNormalizePath(path);
    return !!(safePath && collapsedFolderPaths.has(safePath));
}

function toggleProjectTreeFolder(path) {
    const safePath = safeNormalizePath(path);
    if (!safePath) {
        return;
    }
    hideProjectTreeContextMenu();
    projectTreeInlineDeleteTarget = null;
    projectTreeSelectedFolderPath = safePath;
    if (collapsedFolderPaths.has(safePath)) {
        collapsedFolderPaths.delete(safePath);
    } else {
        collapsedFolderPaths.add(safePath);
    }
    renderProjectFileTree();
}

function expandProjectTreeAncestors(path) {
    const safePath = safeNormalizePath(path);
    if (!safePath || safePath.indexOf("/") < 0) {
        return;
    }
    const parts = safePath.split("/");
    let current = "";
    for (let i = 0; i < parts.length - 1; i++) {
        current = current ? `${current}/${parts[i]}` : parts[i];
        collapsedFolderPaths.delete(current);
    }
}

function pruneCollapsedProjectFolders() {
    if (!collapsedFolderPaths.size) {
        return;
    }
    const folderPaths = new Set();
    for (const folderPath of projectFolders) {
        const parts = safeNormalizePath(folderPath).split("/");
        let current = "";
        for (let i = 0; i < parts.length; i++) {
            current = current ? `${current}/${parts[i]}` : parts[i];
            folderPaths.add(current);
        }
    }
    for (const file of projectFiles) {
        const parts = safeNormalizePath(file.path).split("/");
        let current = "";
        for (let i = 0; i < parts.length - 1; i++) {
            current = current ? `${current}/${parts[i]}` : parts[i];
            folderPaths.add(current);
        }
    }
    collapsedFolderPaths = new Set(Array.from(collapsedFolderPaths).filter(path => folderPaths.has(path)));
}

function moveCollapsedFolderState(oldPath, newPath) {
    const safeOldPath = safeNormalizePath(oldPath);
    const safeNewPath = safeNormalizePath(newPath);
    if (!safeOldPath || !safeNewPath || !collapsedFolderPaths.size) {
        return;
    }
    const nextCollapsed = new Set();
    collapsedFolderPaths.forEach(path => {
        if (path === safeOldPath || path.startsWith(safeOldPath + "/")) {
            nextCollapsed.add(safeNewPath + path.slice(safeOldPath.length));
        } else {
            nextCollapsed.add(path);
        }
    });
    collapsedFolderPaths = nextCollapsed;
}

function getPathParent(path) {
    const safePath = safeNormalizePath(path);
    if (!safePath || safePath.indexOf("/") < 0) {
        return "";
    }
    const parts = safePath.split("/");
    parts.pop();
    return parts.join("/");
}

function joinProjectPath(parentPath, name) {
    return parentPath ? `${parentPath}/${name}` : name;
}

function hasProjectTreeItems() {
    return projectFiles.length > 0 || projectFolders.length > 0;
}

function isSameOrInsideFolder(path, folderPath) {
    const safePath = safeNormalizePath(path);
    const safeFolderPath = safeNormalizePath(folderPath);
    return !!(safePath && safeFolderPath && (safePath === safeFolderPath || safePath.startsWith(safeFolderPath + "/")));
}

function isPathInsideFolder(filePath, folderPath) {
    const safeFilePath = safeNormalizePath(filePath);
    const safeFolderPath = safeNormalizePath(folderPath);
    return !!(safeFilePath && safeFolderPath && safeFilePath.startsWith(safeFolderPath + "/"));
}

function getAllProjectFolderPaths() {
    const folderPaths = new Set();
    function addFolderAndAncestors(path) {
        const safePath = safeNormalizePath(path);
        if (!safePath) {
            return;
        }
        const parts = safePath.split("/");
        let current = "";
        for (const part of parts) {
            current = current ? `${current}/${part}` : part;
            folderPaths.add(current);
        }
    }

    projectFolders.forEach(addFolderAndAncestors);
    for (const file of projectFiles) {
        const safePath = safeNormalizePath(file && file.path);
        if (!safePath || safePath.indexOf("/") < 0) {
            continue;
        }
        const parts = safePath.split("/");
        parts.pop();
        addFolderAndAncestors(parts.join("/"));
    }
    return Array.from(folderPaths).sort((a, b) => a.localeCompare(b));
}

function pruneProjectTreeSelection() {
    const filePaths = new Set(projectFiles.map(file => safeNormalizePath(file && file.path)).filter(Boolean));
    selectedProjectFilePaths = new Set(Array.from(selectedProjectFilePaths).filter(path => filePaths.has(path)));

    const folderPaths = new Set(getAllProjectFolderPaths());
    selectedProjectFolderPaths = new Set(Array.from(selectedProjectFolderPaths).filter(path => folderPaths.has(path)));
}

function hasSelectedProjectTreeItems() {
    pruneProjectTreeSelection();
    return selectedProjectFilePaths.size > 0 || selectedProjectFolderPaths.size > 0;
}

function getEffectiveSelectedProjectFolderPaths() {
    pruneProjectTreeSelection();
    const selectedFolders = Array.from(selectedProjectFolderPaths)
        .map(safeNormalizePath)
        .filter(Boolean)
        .sort((a, b) => {
            const depthDiff = a.split("/").length - b.split("/").length;
            return depthDiff || a.localeCompare(b);
        });
    const effectiveFolders = [];
    for (const folderPath of selectedFolders) {
        if (!effectiveFolders.some(parentPath => isSameOrInsideFolder(folderPath, parentPath))) {
            effectiveFolders.push(folderPath);
        }
    }
    return effectiveFolders;
}

function getSelectedProjectDeleteSummary() {
    pruneProjectTreeSelection();
    const folderTargets = getEffectiveSelectedProjectFolderPaths();
    const allFolderPaths = getAllProjectFolderPaths();
    const folderPaths = new Set();
    const filePaths = new Set();

    folderTargets.forEach(folderPath => {
        folderPaths.add(folderPath);
        allFolderPaths.forEach(path => {
            if (isSameOrInsideFolder(path, folderPath)) {
                folderPaths.add(path);
            }
        });
    });

    projectFiles.forEach(file => {
        const filePath = safeNormalizePath(file && file.path);
        if (!filePath) {
            return;
        }
        if (selectedProjectFilePaths.has(filePath) || folderTargets.some(folderPath => isPathInsideFolder(filePath, folderPath))) {
            filePaths.add(filePath);
        }
    });

    return {
        folderTargets: folderTargets,
        folderPaths: folderPaths,
        filePaths: filePaths,
        totalCount: folderPaths.size + filePaths.size
    };
}

function updateProjectSelectedDeleteButton() {
    const button = document.getElementById("projectSelectedDeleteButton");
    if (!button) {
        return;
    }
    const summary = getSelectedProjectDeleteSummary();
    const hasSelection = summary.totalCount > 0;
    button.disabled = !hasSelection;
    button.title = hasSelection
        ? `删除选中的 ${summary.folderPaths.size} 个文件夹和 ${summary.filePaths.size} 个文件`
        : "先选择要删除的文件或文件夹";
    const text = button.querySelector(".sidebar-action-text");
    if (text) {
        text.textContent = hasSelection ? `delete (${summary.totalCount})` : "delete selected";
    }
}

function getProjectTreeFolderSelectionState(folderPath) {
    const safeFolderPath = safeNormalizePath(folderPath);
    if (!safeFolderPath) {
        return {checked: false, indeterminate: false};
    }

    const folderPaths = getAllProjectFolderPaths().filter(path => isSameOrInsideFolder(path, safeFolderPath));
    const filePaths = projectFiles
        .map(file => safeNormalizePath(file && file.path))
        .filter(path => isPathInsideFolder(path, safeFolderPath));
    const totalCount = folderPaths.length + filePaths.length;
    if (!totalCount) {
        return {checked: false, indeterminate: false};
    }

    const selectedFolderCount = folderPaths.filter(path => selectedProjectFolderPaths.has(path)).length;
    const selectedFileCount = filePaths.filter(path => selectedProjectFilePaths.has(path)).length;
    const selectedCount = selectedFolderCount + selectedFileCount;
    return {
        checked: selectedCount === totalCount,
        indeterminate: selectedCount > 0 && selectedCount < totalCount
    };
}

function setProjectTreeFileSelected(filePath, selected) {
    const safePath = safeNormalizePath(filePath);
    if (!safePath || !projectFiles.some(file => file.path === safePath)) {
        return;
    }
    if (selected) {
        selectedProjectFilePaths.add(safePath);
    } else {
        selectedProjectFilePaths.delete(safePath);
    }
}

function setProjectTreeFolderSelected(folderPath, selected) {
    const safeFolderPath = safeNormalizePath(folderPath);
    if (!safeFolderPath) {
        return;
    }

    const folderPaths = getAllProjectFolderPaths().filter(path => isSameOrInsideFolder(path, safeFolderPath));
    const filePaths = projectFiles
        .map(file => safeNormalizePath(file && file.path))
        .filter(path => isPathInsideFolder(path, safeFolderPath));
    const targetFolderPaths = folderPaths.length ? folderPaths : [safeFolderPath];
    if (selected) {
        targetFolderPaths.forEach(path => selectedProjectFolderPaths.add(path));
        filePaths.forEach(path => selectedProjectFilePaths.add(path));
    } else {
        targetFolderPaths.forEach(path => selectedProjectFolderPaths.delete(path));
        filePaths.forEach(path => selectedProjectFilePaths.delete(path));
    }
}

function setProjectTreeItemSelected(kind, path, selected) {
    if (kind === "folder") {
        setProjectTreeFolderSelected(path, selected);
    } else if (kind === "file") {
        setProjectTreeFileSelected(path, selected);
    }
    renderProjectFileTree();
}

function moveProjectTreeSelectionPath(kind, oldPath, newPath) {
    const safeOldPath = safeNormalizePath(oldPath);
    const safeNewPath = safeNormalizePath(newPath);
    if (!safeOldPath || !safeNewPath || safeOldPath === safeNewPath) {
        return;
    }

    if (kind === "file") {
        if (selectedProjectFilePaths.delete(safeOldPath)) {
            selectedProjectFilePaths.add(safeNewPath);
        }
        return;
    }

    if (kind !== "folder") {
        return;
    }

    const nextSelectedFolders = new Set();
    selectedProjectFolderPaths.forEach(path => {
        if (isSameOrInsideFolder(path, safeOldPath)) {
            nextSelectedFolders.add(safeNewPath + path.slice(safeOldPath.length));
        } else {
            nextSelectedFolders.add(path);
        }
    });
    selectedProjectFolderPaths = nextSelectedFolders;

    const nextSelectedFiles = new Set();
    selectedProjectFilePaths.forEach(path => {
        if (isPathInsideFolder(path, safeOldPath)) {
            nextSelectedFiles.add(safeNewPath + path.slice(safeOldPath.length));
        } else {
            nextSelectedFiles.add(path);
        }
    });
    selectedProjectFilePaths = nextSelectedFiles;
}

function projectFolderExists(folderPath) {
    const safeFolderPath = safeNormalizePath(folderPath);
    if (!safeFolderPath) {
        return false;
    }
    return projectFolders.some(path => isSameOrInsideFolder(path, safeFolderPath))
        || projectFiles.some(f => isPathInsideFolder(f.path, safeFolderPath));
}

function projectPathConflictsWithFile(path) {
    const safePath = safeNormalizePath(path);
    return !!(safePath && projectFiles.some(f => f.path === safePath));
}

function ensureUniqueFolderPath(path) {
    let safePath = safeNormalizePath(path);
    if (!safePath) {
        return "";
    }
    if (!projectFolderExists(safePath) && !projectPathConflictsWithFile(safePath)) {
        return safePath;
    }
    let index = 1;
    while (projectFolderExists(`${safePath}_${index}`) || projectPathConflictsWithFile(`${safePath}_${index}`)) {
        index += 1;
    }
    return `${safePath}_${index}`;
}

function addProjectFolder(folderPath) {
    const safeFolderPath = safeNormalizePath(folderPath);
    if (!safeFolderPath || projectFolders.includes(safeFolderPath)) {
        return safeFolderPath;
    }
    projectFolders.push(safeFolderPath);
    projectFolders.sort((a, b) => a.localeCompare(b));
    return safeFolderPath;
}

function getProjectUploadTargetPath(folderPath) {
    const safeFolderPath = safeNormalizePath(folderPath || "");
    if (!safeFolderPath) {
        return "";
    }
    return projectFolderExists(safeFolderPath) ? safeFolderPath : "";
}

function getSelectedProjectUploadTargetPath() {
    const safeFolderPath = getProjectUploadTargetPath(projectTreeSelectedFolderPath);
    if (projectTreeSelectedFolderPath !== safeFolderPath) {
        projectTreeSelectedFolderPath = safeFolderPath;
    }
    return safeFolderPath;
}

function setProjectTreeSelectedFolderPath(folderPath, options) {
    const opts = options || {};
    const nextFolderPath = getProjectUploadTargetPath(folderPath);
    if (projectTreeSelectedFolderPath === nextFolderPath) {
        return;
    }
    projectTreeSelectedFolderPath = nextFolderPath;
    if (opts.render) {
        renderProjectFileTree();
    }
}

function isProjectTreeFolderSelected(folderPath) {
    const safeFolderPath = safeNormalizePath(folderPath);
    return !!(safeFolderPath && safeFolderPath === getSelectedProjectUploadTargetPath());
}

function moveSelectedProjectFolderState(oldFolderPath, newFolderPath) {
    const safeSelectedFolderPath = safeNormalizePath(projectTreeSelectedFolderPath);
    const safeOldFolderPath = safeNormalizePath(oldFolderPath);
    const safeNewFolderPath = safeNormalizePath(newFolderPath);
    if (!safeSelectedFolderPath || !safeOldFolderPath || !safeNewFolderPath) {
        return;
    }
    if (isSameOrInsideFolder(safeSelectedFolderPath, safeOldFolderPath)) {
        projectTreeSelectedFolderPath = safeNormalizePath(safeNewFolderPath + safeSelectedFolderPath.slice(safeOldFolderPath.length));
    }
}

function clearSelectedProjectFolderInside(folderPath) {
    const safeSelectedFolderPath = safeNormalizePath(projectTreeSelectedFolderPath);
    const safeFolderPath = safeNormalizePath(folderPath);
    if (safeSelectedFolderPath && safeFolderPath && isSameOrInsideFolder(safeSelectedFolderPath, safeFolderPath)) {
        projectTreeSelectedFolderPath = "";
    }
}

function getContextTargetParentPath(target) {
    if (!target || target.kind === "root") {
        return "";
    }
    if (target.kind === "folder") {
        return safeNormalizePath(target.path);
    }
    if (target.kind === "file") {
        return getPathParent(target.path);
    }
    return "";
}

function normalizeProjectTreeItemName(rawName) {
    if (typeof rawName !== "string") {
        return "";
    }
    const name = rawName.replace(/\\/g, "/").trim();
    if (!name || name.indexOf("/") >= 0 || name === "." || name === "..") {
        return "";
    }
    return name;
}

function getDefaultActiveProjectFile() {
    return projectFiles.find(f => f.kind === "text") || projectFiles[0] || null;
}

function resetWorkspaceForEmptyProject(language, options) {
    const opts = options || {};
    projectTreeRenameTarget = null;
    projectTreeInlineDeleteTarget = null;
    projectTreeCreateTarget = null;
    projectTreeSelectedFolderPath = "";
    pendingProjectUploadTargetPath = "";
    if (opts.clearFolders) {
        projectFolders = [];
    }
    collapsedFolderPaths.clear();
    activeFilePath = "";
    const emptyLanguage = normalizeSharecodeLanguage(language || getCurrentLanguageValue());
    const viewer = document.getElementById("assetViewer");
    const editorElement = document.getElementById("editor");
    if (viewer) {
        viewer.style.display = "none";
        viewer.innerHTML = "";
    }
    hideHtmlPreviewPane();
    if (editorElement) {
        editorElement.style.display = "block";
    }
    if (window.editor && typeof window.editor.setValue === "function") {
        window.editor.setValue("", -1);
        setLanguageSelectors(emptyLanguage);
        setEditorLang(emptyLanguage);
        if (window.editor && typeof window.editor.resize === "function") {
            window.editor.resize();
        }
    }
    clearActiveLineHighlightMarkers();
    renderProjectFileTree();
    updatePythonRunButtonVisibility();
    updateHtmlShareViewControls();
    if (!opts.preserveSidebar) {
        updateSidebarVisibilityByFileCount(false);
    }
    scheduleSharecodeDraftCacheSave();
}

function createProjectFileFromEditorInput() {
    if (!window.editor || activeFilePath || projectFiles.length) {
        return;
    }
    const content = window.editor.getValue();
    if (!content) {
        return;
    }
    let language = getCurrentLanguageValue();
    const isReactContent = looksLikeReactCode(content);
    if (isReactContent) {
        language = "javascript";
    }
    const filePath = ensureUniquePath(defaultFilenameForContent(language, content));
    if (!filePath) {
        return;
    }

    projectFiles.push({
        kind: "text",
        path: filePath,
        content: content,
        language: language,
        highlighted_lines: []
    });
    activeFilePath = filePath;
    setLanguageSelectors(language);
    setEditorLang(language);
    renderProjectFileTree();
    updateSidebarVisibilityByFileCount(false);
    updatePythonRunButtonVisibility();
    applyShareViewToWorkspace({immediate: true, forceFrame: true});
}

function handleEditorContentChange() {
    createProjectFileFromEditorInput();
    refreshActiveLineHighlights();
    refreshHtmlPreviewSoon();
    scheduleSharecodeDraftCacheSave();
}

function refreshProjectAfterMutation(preferredActivePath, options) {
    const opts = options || {};
    projectTreeRenameTarget = null;
    projectTreeInlineDeleteTarget = null;
    projectTreeCreateTarget = null;
    if (!projectFiles.length) {
        if (!projectFolders.length) {
            resetWorkspaceForEmptyProject(null, opts);
            return;
        }
        activeFilePath = "";
        const viewer = document.getElementById("assetViewer");
        const editorElement = document.getElementById("editor");
        if (viewer) {
            viewer.style.display = "none";
            viewer.innerHTML = "";
        }
        if (editorElement) {
            editorElement.style.display = "block";
        }
        if (window.editor && typeof window.editor.setValue === "function") {
            window.editor.setValue("", -1);
            if (window.editor && typeof window.editor.resize === "function") {
                window.editor.resize();
            }
        }
        clearActiveLineHighlightMarkers();
        hideHtmlPreviewPane();
        renderProjectFileTree();
        updatePythonRunButtonVisibility();
        updateHtmlShareViewControls();
        scheduleSharecodeDraftCacheSave();
        if (!opts.preserveSidebar) {
            updateSidebarVisibilityByFileCount(false);
        }
        return;
    }

    const safePreferredPath = safeNormalizePath(preferredActivePath);
    const preferredFile = safePreferredPath ? projectFiles.find(f => f.path === safePreferredPath) : null;
    const targetFile = preferredFile || getDefaultActiveProjectFile();
    if (targetFile) {
        openProjectFile(targetFile.path);
    } else {
        renderProjectFileTree();
        scheduleSharecodeDraftCacheSave();
    }
    if (!opts.preserveSidebar) {
        updateSidebarVisibilityByFileCount(false);
    }
}

function focusProjectRenameInput() {
    setTimeout(function () {
        const input = document.querySelector('[data-tree-rename-input="true"]');
        if (input) {
            input.focus();
            input.select();
        }
    }, 0);
}

function cancelProjectTreeRename() {
    if (!projectTreeRenameTarget) {
        return;
    }
    projectTreeRenameTarget = null;
    renderProjectFileTree();
}

function focusProjectCreateInput() {
    setTimeout(function () {
        const input = document.querySelector('[data-tree-create-input="true"]');
        if (input) {
            input.focus();
            input.select();
        }
    }, 0);
}

function cancelProjectTreeCreate() {
    if (!projectTreeCreateTarget) {
        return;
    }
    projectTreeCreateTarget = null;
    renderProjectFileTree();
}

function getProjectTreeCreateLanguage() {
    const active = getActiveProjectFile();
    if (active && active.kind === "text") {
        return normalizeSharecodeLanguage(active.language || detectLanguageFromFilename(active.path));
    }
    return getCurrentLanguageValue();
}

function getPathRelativeToParent(path, parentPath) {
    const safePath = safeNormalizePath(path);
    const safeParentPath = safeNormalizePath(parentPath || "");
    if (safeParentPath && safePath.startsWith(safeParentPath + "/")) {
        return safePath.slice(safeParentPath.length + 1);
    }
    return safePath;
}

function getProjectTreeCreateDefaultName(kind, parentPath, language) {
    const safeParentPath = safeNormalizePath(parentPath || "");
    const fallbackName = kind === "folder"
        ? "new-folder"
        : defaultFilenameForLanguage(language || getProjectTreeCreateLanguage());
    const fallbackPath = safeNormalizePath(joinProjectPath(safeParentPath, fallbackName));
    const uniquePath = kind === "folder"
        ? ensureUniqueFolderPath(fallbackPath)
        : ensureUniquePath(fallbackPath);
    return getPathRelativeToParent(uniquePath || fallbackPath || fallbackName, safeParentPath) || fallbackName;
}

function beginProjectTreeCreate(kind, parentPath) {
    if (kind !== "file" && kind !== "folder") {
        return;
    }
    const safeParentPath = typeof parentPath === "string"
        ? getProjectUploadTargetPath(parentPath)
        : getSelectedProjectUploadTargetPath();
    if (safeParentPath) {
        setProjectTreeSelectedFolderPath(safeParentPath);
    }
    const language = kind === "file" ? getProjectTreeCreateLanguage() : "";
    hideFloatingMenuIfOpen();
    hideProjectTreeContextMenu();
    projectTreeRenameTarget = null;
    projectTreeInlineDeleteTarget = null;
    if (safeParentPath) {
        expandProjectTreeAncestors(joinProjectPath(safeParentPath, "_placeholder"));
        collapsedFolderPaths.delete(safeParentPath);
    }
    projectTreeCreateTarget = {
        kind: kind,
        parentPath: safeParentPath,
        language: language,
        defaultName: getProjectTreeCreateDefaultName(kind, safeParentPath, language)
    };
    setSidebarOpen(true);
    renderProjectFileTree();
    focusProjectCreateInput();
}

function resolveProjectTreeCreatePath(target, rawName, fallbackName) {
    const safeParentPath = safeNormalizePath((target && target.parentPath) || "");
    const rawValue = typeof rawName === "string" ? rawName.trim() : "";
    const nameValue = rawValue || fallbackName || "";
    const isExplicitProjectPath = nameValue.replace(/\\/g, "/").indexOf("/") >= 0;
    const safeNamePath = safeNormalizePath(nameValue);
    if (!safeNamePath) {
        return "";
    }
    if (safeParentPath && isExplicitProjectPath && safeNamePath.startsWith(safeParentPath + "/")) {
        return safeNamePath;
    }
    return safeNormalizePath(joinProjectPath(safeParentPath, safeNamePath));
}

function commitProjectTreeCreate(kind, parentPath, rawName) {
    const safeParentPath = safeNormalizePath(parentPath || "");
    const target = projectTreeCreateTarget;
    if (!target || target.kind !== kind || target.parentPath !== safeParentPath) {
        return true;
    }

    let inputPath = resolveProjectTreeCreatePath(target, rawName, target.defaultName);
    if (!inputPath) {
        showProjectNotice("名称不能为空，不能使用 . 或 .. 路径段。");
        focusProjectCreateInput();
        return false;
    }

    if (kind === "file") {
        const selectedLanguage = normalizeSharecodeLanguage(target.language || getProjectTreeCreateLanguage());
        const filename = getProjectPathName(inputPath);
        if (filename && filename.indexOf(".") < 0 && !FILENAME_LANGUAGE_MAP[filename.toLowerCase()]) {
            inputPath = safeNormalizePath(inputPath + "." + (LANGUAGE_TO_EXTENSION[selectedLanguage] || "txt"));
        }
        const filePath = ensureUniquePath(inputPath);
        if (!filePath) {
            showProjectNotice("文件名无效，请换一个名称。");
            focusProjectCreateInput();
            return false;
        }

        syncActiveEditorToProject();
        projectTreeCreateTarget = null;
        upsertProjectFile({
            kind: "text",
            path: filePath,
            content: "",
            language: normalizeSharecodeLanguage(detectLanguageFromFilename(filePath), selectedLanguage),
            highlighted_lines: []
        }, true);
        updateSidebarVisibilityByFileCount(false);
        scheduleSharecodeDraftCacheSave();
        return true;
    }

    const folderPath = ensureUniqueFolderPath(inputPath);
    if (!folderPath) {
        showProjectNotice("文件夹名称无效，请换一个名称。");
        focusProjectCreateInput();
        return false;
    }

    projectTreeCreateTarget = null;
    addProjectFolder(folderPath);
    expandProjectTreeAncestors(joinProjectPath(folderPath, "_placeholder"));
    collapsedFolderPaths.delete(folderPath);
    renderProjectFileTree();
    updateSidebarVisibilityByFileCount(false);
    setSidebarOpen(true);
    scheduleSharecodeDraftCacheSave();
    showProjectNotice(`已创建文件夹 "${folderPath}"。`);
    return true;
}

function bindProjectTreeCreateInput(input, kind, parentPath) {
    input.dataset.treeCreateInput = "true";
    input.addEventListener("click", function (e) {
        e.stopPropagation();
    });
    input.addEventListener("dblclick", function (e) {
        e.stopPropagation();
    });
    input.addEventListener("contextmenu", function (e) {
        e.stopPropagation();
    });
    input.addEventListener("keydown", function (e) {
        e.stopPropagation();
        if (e.key === "Enter") {
            e.preventDefault();
            commitProjectTreeCreate(kind, parentPath, input.value);
        } else if (e.key === "Escape") {
            e.preventDefault();
            cancelProjectTreeCreate();
        }
    });
    input.addEventListener("blur", function () {
        if (projectTreeCreateTarget && projectTreeCreateTarget.kind === kind && projectTreeCreateTarget.parentPath === safeNormalizePath(parentPath || "")) {
            cancelProjectTreeCreate();
        }
    });
}

function isSameProjectTreeTarget(target, kind, path) {
    return !!(target && target.kind === kind && target.path === safeNormalizePath(path));
}

function beginRenameTreeItem(kind, path) {
    const safePath = safeNormalizePath(path);
    if (!safePath) {
        return;
    }
    if (kind === "file" && !projectFiles.some(f => f.path === safePath)) {
        return;
    }
    if (kind === "folder" && !projectFolderExists(safePath)) {
        return;
    }
    hideProjectTreeContextMenu();
    projectTreeRenameTarget = {kind: kind, path: safePath};
    projectTreeInlineDeleteTarget = null;
    projectTreeCreateTarget = null;
    renderProjectFileTree();
    focusProjectRenameInput();
}

function renameProjectFile(oldPath, newName) {
    const safeOldPath = safeNormalizePath(oldPath);
    const targetFile = projectFiles.find(f => f.path === safeOldPath);
    if (!targetFile) {
        return true;
    }
    const newPath = safeNormalizePath(joinProjectPath(getPathParent(safeOldPath), newName));
    if (!newPath || newPath === safeOldPath) {
        return true;
    }
    if (projectFiles.some(f => f.path === newPath)) {
        showProjectNotice("已存在同名文件或路径，请换一个名称。");
        return false;
    }
    if (projectFolderExists(newPath)) {
        showProjectNotice("已存在同名文件夹或路径，请换一个名称。");
        return false;
    }

    syncActiveEditorToProject();
    targetFile.path = newPath;
    moveProjectTreeSelectionPath("file", safeOldPath, newPath);
    const nextActivePath = activeFilePath === safeOldPath ? newPath : activeFilePath;
    activeFilePath = nextActivePath;
    refreshProjectAfterMutation(nextActivePath);
    return true;
}

function renameProjectFolder(oldFolderPath, newName) {
    const safeOldFolderPath = safeNormalizePath(oldFolderPath);
    const newFolderPath = safeNormalizePath(joinProjectPath(getPathParent(safeOldFolderPath), newName));
    if (!safeOldFolderPath || !newFolderPath || newFolderPath === safeOldFolderPath) {
        return true;
    }

    const affectedFiles = projectFiles.filter(f => isPathInsideFolder(f.path, safeOldFolderPath));
    const affectedFolders = projectFolders.filter(path => isSameOrInsideFolder(path, safeOldFolderPath));
    if (!affectedFiles.length && !affectedFolders.length) {
        return true;
    }
    if (projectPathConflictsWithFile(newFolderPath) || projectFolderExists(newFolderPath)) {
        showProjectNotice("重命名后会产生同名文件或路径，请换一个名称。");
        return false;
    }

    const outsidePaths = new Set(projectFiles
        .filter(f => !isPathInsideFolder(f.path, safeOldFolderPath))
        .map(f => f.path));
    const outsideFolders = new Set(projectFolders
        .filter(path => !isSameOrInsideFolder(path, safeOldFolderPath)));
    const nextPaths = new Set();
    for (const file of affectedFiles) {
        const nextPath = safeNormalizePath(newFolderPath + file.path.slice(safeOldFolderPath.length));
        if (!nextPath || outsidePaths.has(nextPath) || nextPaths.has(nextPath)) {
            showProjectNotice("重命名后会产生同名文件或路径，请换一个名称。");
            return false;
        }
        nextPaths.add(nextPath);
    }
    const nextFolders = new Set();
    for (const folderPath of affectedFolders) {
        const nextFolderPath = safeNormalizePath(newFolderPath + folderPath.slice(safeOldFolderPath.length));
        if (!nextFolderPath || outsidePaths.has(nextFolderPath) || outsideFolders.has(nextFolderPath) || nextFolders.has(nextFolderPath)) {
            showProjectNotice("重命名后会产生同名文件或路径，请换一个名称。");
            return false;
        }
        nextFolders.add(nextFolderPath);
    }

    syncActiveEditorToProject();
    let nextActivePath = activeFilePath;
    for (const file of affectedFiles) {
        const previousPath = file.path;
        const nextPath = safeNormalizePath(newFolderPath + previousPath.slice(safeOldFolderPath.length));
        file.path = nextPath;
        if (activeFilePath === previousPath) {
            nextActivePath = nextPath;
        }
    }
    projectFolders = projectFolders.map(path => {
        if (isSameOrInsideFolder(path, safeOldFolderPath)) {
            return safeNormalizePath(newFolderPath + path.slice(safeOldFolderPath.length));
        }
        return path;
    }).sort((a, b) => a.localeCompare(b));
    moveProjectTreeSelectionPath("folder", safeOldFolderPath, newFolderPath);
    moveSelectedProjectFolderState(safeOldFolderPath, newFolderPath);
    moveCollapsedFolderState(safeOldFolderPath, newFolderPath);
    activeFilePath = nextActivePath;
    refreshProjectAfterMutation(nextActivePath);
    return true;
}

function getProjectPathName(path) {
    const safePath = safeNormalizePath(path);
    if (!safePath) {
        return "";
    }
    const parts = safePath.split("/");
    return parts[parts.length - 1] || "";
}

function getDropTargetParentPath(targetKind, targetPath) {
    if (targetKind === "folder") {
        return safeNormalizePath(targetPath);
    }
    if (targetKind === "file") {
        return getPathParent(targetPath);
    }
    return "";
}

function canMoveProjectTreeItemToParent(kind, path, targetParentPath) {
    const safePath = safeNormalizePath(path);
    const safeTargetParentPath = safeNormalizePath(targetParentPath || "");
    if (!safePath || (kind !== "file" && kind !== "folder")) {
        return false;
    }

    const itemName = getProjectPathName(safePath);
    if (!itemName) {
        return false;
    }
    const nextPath = safeNormalizePath(joinProjectPath(safeTargetParentPath, itemName));

    if (kind === "file") {
        if (!projectFiles.some(f => f.path === safePath) || !nextPath || nextPath === safePath) {
            return false;
        }
        return !projectFiles.some(f => f.path === nextPath && f.path !== safePath)
            && !projectFolderExists(nextPath);
    }

    if (!projectFolderExists(safePath) || !nextPath || nextPath === safePath) {
        return false;
    }
    if (safeTargetParentPath === safePath || safeTargetParentPath.startsWith(safePath + "/")) {
        return false;
    }
    return !projectPathConflictsWithFile(nextPath) && !projectFolderExists(nextPath);
}

function moveProjectFileToParent(oldPath, targetParentPath) {
    const safeOldPath = safeNormalizePath(oldPath);
    const targetFile = projectFiles.find(f => f.path === safeOldPath);
    if (!targetFile) {
        return false;
    }

    const safeTargetParentPath = safeNormalizePath(targetParentPath || "");
    const newPath = safeNormalizePath(joinProjectPath(safeTargetParentPath, getProjectPathName(safeOldPath)));
    if (!newPath || newPath === safeOldPath) {
        return true;
    }
    if (projectFiles.some(f => f.path === newPath && f.path !== safeOldPath)) {
        showProjectNotice("目标位置已存在同名文件。");
        return false;
    }
    if (projectFolderExists(newPath)) {
        showProjectNotice("目标位置已存在同名文件夹。");
        return false;
    }

    syncActiveEditorToProject();
    if (safeTargetParentPath) {
        addProjectFolder(safeTargetParentPath);
    }
    targetFile.path = newPath;
    moveProjectTreeSelectionPath("file", safeOldPath, newPath);
    const nextActivePath = activeFilePath === safeOldPath ? newPath : activeFilePath;
    activeFilePath = nextActivePath;
    expandProjectTreeAncestors(newPath);
    refreshProjectAfterMutation(nextActivePath, {preserveSidebar: true});
    showProjectNotice(safeTargetParentPath ? `已移动到 "${safeTargetParentPath}"。` : "已移动到根目录。");
    return true;
}

function moveProjectFolderToParent(oldFolderPath, targetParentPath) {
    const safeOldFolderPath = safeNormalizePath(oldFolderPath);
    const safeTargetParentPath = safeNormalizePath(targetParentPath || "");
    const folderName = getProjectPathName(safeOldFolderPath);
    const newFolderPath = safeNormalizePath(joinProjectPath(safeTargetParentPath, folderName));
    if (!safeOldFolderPath || !folderName || !newFolderPath || newFolderPath === safeOldFolderPath) {
        return true;
    }
    if (safeTargetParentPath === safeOldFolderPath || safeTargetParentPath.startsWith(safeOldFolderPath + "/")) {
        showProjectNotice("不能把文件夹移动到自身或其子文件夹中。");
        return false;
    }

    const affectedFiles = projectFiles.filter(f => isPathInsideFolder(f.path, safeOldFolderPath));
    const affectedFolders = projectFolders.filter(path => isSameOrInsideFolder(path, safeOldFolderPath));
    if (!affectedFiles.length && !affectedFolders.length) {
        return false;
    }
    if (projectPathConflictsWithFile(newFolderPath) || projectFolderExists(newFolderPath)) {
        showProjectNotice("目标位置已存在同名文件或文件夹。");
        return false;
    }

    const outsidePaths = new Set(projectFiles
        .filter(f => !isPathInsideFolder(f.path, safeOldFolderPath))
        .map(f => f.path));
    const outsideFolders = new Set(projectFolders
        .filter(path => !isSameOrInsideFolder(path, safeOldFolderPath)));
    const nextPaths = new Set();
    for (const file of affectedFiles) {
        const nextPath = safeNormalizePath(newFolderPath + file.path.slice(safeOldFolderPath.length));
        if (!nextPath || outsidePaths.has(nextPath) || nextPaths.has(nextPath)) {
            showProjectNotice("移动后会产生同名文件，请换一个目标位置。");
            return false;
        }
        nextPaths.add(nextPath);
    }
    const nextFolders = new Set();
    for (const folderPath of affectedFolders) {
        const nextFolderPath = safeNormalizePath(newFolderPath + folderPath.slice(safeOldFolderPath.length));
        if (!nextFolderPath || outsidePaths.has(nextFolderPath) || outsideFolders.has(nextFolderPath) || nextFolders.has(nextFolderPath)) {
            showProjectNotice("移动后会产生同名文件夹，请换一个目标位置。");
            return false;
        }
        nextFolders.add(nextFolderPath);
    }

    syncActiveEditorToProject();
    let nextActivePath = activeFilePath;
    for (const file of affectedFiles) {
        const previousPath = file.path;
        const nextPath = safeNormalizePath(newFolderPath + previousPath.slice(safeOldFolderPath.length));
        file.path = nextPath;
        if (activeFilePath === previousPath) {
            nextActivePath = nextPath;
        }
    }
    if (safeTargetParentPath) {
        addProjectFolder(safeTargetParentPath);
    }
    projectFolders = Array.from(new Set(projectFolders.map(path => {
        if (isSameOrInsideFolder(path, safeOldFolderPath)) {
            return safeNormalizePath(newFolderPath + path.slice(safeOldFolderPath.length));
        }
        return path;
    }).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    moveProjectTreeSelectionPath("folder", safeOldFolderPath, newFolderPath);
    moveSelectedProjectFolderState(safeOldFolderPath, newFolderPath);
    moveCollapsedFolderState(safeOldFolderPath, newFolderPath);
    expandProjectTreeAncestors(joinProjectPath(newFolderPath, "_placeholder"));
    collapsedFolderPaths.delete(newFolderPath);
    activeFilePath = nextActivePath;
    refreshProjectAfterMutation(nextActivePath, {preserveSidebar: true});
    showProjectNotice(safeTargetParentPath ? `已移动到 "${safeTargetParentPath}"。` : "已移动到根目录。");
    return true;
}

function moveProjectTreeItemToParent(kind, path, targetParentPath) {
    const safePath = safeNormalizePath(path);
    const safeTargetParentPath = safeNormalizePath(targetParentPath || "");
    hideProjectTreeContextMenu();
    projectTreeRenameTarget = null;
    projectTreeInlineDeleteTarget = null;
    projectTreeCreateTarget = null;
    if (!canMoveProjectTreeItemToParent(kind, safePath, safeTargetParentPath)) {
        return false;
    }
    return kind === "folder"
        ? moveProjectFolderToParent(safePath, safeTargetParentPath)
        : moveProjectFileToParent(safePath, safeTargetParentPath);
}

function clearProjectTreeDropTarget() {
    projectTreeCurrentDropTarget = null;
    document.querySelectorAll(".is-drop-target").forEach(el => {
        el.classList.remove("is-drop-target");
    });
}

function setProjectTreeDropTarget(element) {
    if (projectTreeCurrentDropTarget === element) {
        return;
    }
    clearProjectTreeDropTarget();
    projectTreeCurrentDropTarget = element;
    if (element) {
        element.classList.add("is-drop-target");
    }
}

function clearProjectTreeDragState() {
    projectTreeDragState = null;
    clearProjectTreeDropTarget();
    document.querySelectorAll(".is-dragging").forEach(el => {
        el.classList.remove("is-dragging");
    });
}

function shouldIgnoreProjectTreeDrag(e) {
    return !!e.target.closest(".tree-rename-input, .tree-delete-btn, .tree-delete-confirm-btn, .tree-select-control, .tree-select-checkbox");
}

function bindProjectTreeDragSource(element, kind, path) {
    const safePath = safeNormalizePath(path);
    if (!element || !safePath) {
        return;
    }
    element.draggable = true;
    element.addEventListener("dragstart", function (e) {
        if (shouldIgnoreProjectTreeDrag(e)) {
            e.preventDefault();
            return;
        }
        hideProjectTreeContextMenu();
        projectTreeInlineDeleteTarget = null;
        projectTreeDragState = {kind: kind, path: safePath};
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", safePath);
        e.dataTransfer.setData("application/x-codemark-project-tree", JSON.stringify(projectTreeDragState));
        setTimeout(function () {
            element.classList.add("is-dragging");
        }, 0);
    });
    element.addEventListener("dragend", function () {
        clearProjectTreeDragState();
    });
}

function bindProjectTreeDropTarget(element, targetKind, targetPath) {
    if (!element) {
        return;
    }
    element.addEventListener("dragover", function (e) {
        if (!projectTreeDragState) {
            return;
        }
        const targetParentPath = getDropTargetParentPath(targetKind, targetPath);
        if (!canMoveProjectTreeItemToParent(projectTreeDragState.kind, projectTreeDragState.path, targetParentPath)) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        setProjectTreeDropTarget(element);
    });
    element.addEventListener("dragleave", function (e) {
        if (element.contains(e.relatedTarget)) {
            return;
        }
        if (projectTreeCurrentDropTarget === element) {
            clearProjectTreeDropTarget();
        }
    });
    element.addEventListener("drop", function (e) {
        if (!projectTreeDragState) {
            return;
        }
        const targetParentPath = getDropTargetParentPath(targetKind, targetPath);
        if (!canMoveProjectTreeItemToParent(projectTreeDragState.kind, projectTreeDragState.path, targetParentPath)) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        const dragState = Object.assign({}, projectTreeDragState);
        clearProjectTreeDragState();
        moveProjectTreeItemToParent(dragState.kind, dragState.path, targetParentPath);
    });
}

function isProjectTreeRootDropEvent(e) {
    return !e.target.closest(".tree-folder-title, .tree-file-button, .tree-rename-input, .tree-delete-btn, .tree-delete-confirm-btn");
}

function bindProjectTreeRootDropTarget(element) {
    if (!element) {
        return;
    }
    element.addEventListener("dragover", function (e) {
        if (!projectTreeDragState || !isProjectTreeRootDropEvent(e)) {
            return;
        }
        if (!canMoveProjectTreeItemToParent(projectTreeDragState.kind, projectTreeDragState.path, "")) {
            return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setProjectTreeDropTarget(element);
    });
    element.addEventListener("dragleave", function (e) {
        if (element.contains(e.relatedTarget)) {
            return;
        }
        if (projectTreeCurrentDropTarget === element) {
            clearProjectTreeDropTarget();
        }
    });
    element.addEventListener("drop", function (e) {
        if (!projectTreeDragState || !isProjectTreeRootDropEvent(e)) {
            return;
        }
        if (!canMoveProjectTreeItemToParent(projectTreeDragState.kind, projectTreeDragState.path, "")) {
            return;
        }
        e.preventDefault();
        const dragState = Object.assign({}, projectTreeDragState);
        clearProjectTreeDragState();
        moveProjectTreeItemToParent(dragState.kind, dragState.path, "");
    });
}

function commitProjectTreeRename(kind, oldPath, rawName) {
    const newName = normalizeProjectTreeItemName(rawName);
    if (!newName) {
        showProjectNotice("名称不能为空，不能包含 /，也不能是 . 或 ..。");
        focusProjectRenameInput();
        return;
    }

    const renamed = kind === "folder"
        ? renameProjectFolder(oldPath, newName)
        : renameProjectFile(oldPath, newName);
    if (renamed) {
        projectTreeRenameTarget = null;
        renderProjectFileTree();
    } else {
        focusProjectRenameInput();
    }
}

function bindProjectTreeRenameInput(input, kind, path) {
    input.dataset.treeRenameInput = "true";
    input.addEventListener("click", function (e) {
        e.stopPropagation();
    });
    input.addEventListener("dblclick", function (e) {
        e.stopPropagation();
    });
    input.addEventListener("contextmenu", function (e) {
        e.stopPropagation();
    });
    input.addEventListener("keydown", function (e) {
        e.stopPropagation();
        if (e.key === "Enter") {
            e.preventDefault();
            commitProjectTreeRename(kind, path, input.value);
        } else if (e.key === "Escape") {
            e.preventDefault();
            cancelProjectTreeRename();
        }
    });
    input.addEventListener("blur", function () {
        if (projectTreeRenameTarget && projectTreeRenameTarget.kind === kind && projectTreeRenameTarget.path === path) {
            cancelProjectTreeRename();
        }
    });
}

function deleteProjectTreeItem(kind, path) {
    const safePath = safeNormalizePath(path);
    if (!safePath) {
        return;
    }
    hideProjectTreeContextMenu();

    let removedActiveFile = false;
    if (kind === "folder") {
        const affectedFiles = projectFiles.filter(f => isPathInsideFolder(f.path, safePath));
        const affectedFolders = projectFolders.filter(path => isSameOrInsideFolder(path, safePath));
        if (!affectedFiles.length && !affectedFolders.length) {
            return;
        }
        openProjectConfirmDialog(
            "删除文件夹",
            `确定删除文件夹 "${safePath}" 及其中 ${affectedFiles.length} 个文件吗？`,
            "删除",
            function () {
                syncActiveEditorToProject();
                removedActiveFile = isPathInsideFolder(activeFilePath, safePath);
                projectFiles = projectFiles.filter(f => !isPathInsideFolder(f.path, safePath));
                projectFolders = projectFolders.filter(path => !isSameOrInsideFolder(path, safePath));
                collapsedFolderPaths = new Set(Array.from(collapsedFolderPaths).filter(path => !isSameOrInsideFolder(path, safePath)));
                clearSelectedProjectFolderInside(safePath);
                refreshProjectAfterMutation(removedActiveFile ? "" : activeFilePath, {preserveSidebar: true});
                showProjectNotice("文件夹已删除。");
            }
        );
        return;
    } else {
        const targetFile = projectFiles.find(f => f.path === safePath);
        if (!targetFile) {
            return;
        }
        openProjectConfirmDialog(
            "删除文件",
            `确定删除文件 "${safePath}" 吗？`,
            "删除",
            function () {
                syncActiveEditorToProject();
                removedActiveFile = activeFilePath === safePath;
                projectFiles = projectFiles.filter(f => f.path !== safePath);
                refreshProjectAfterMutation(removedActiveFile ? "" : activeFilePath, {preserveSidebar: true});
                showProjectNotice("文件已删除。");
            }
        );
        return;
    }
}

function deleteProjectTreeItemNow(kind, path) {
    const safePath = safeNormalizePath(path);
    if (!safePath) {
        return;
    }
    syncActiveEditorToProject();
    let removedActiveFile = false;
    if (kind === "folder") {
        if (!projectFolderExists(safePath)) {
            return;
        }
        removedActiveFile = isPathInsideFolder(activeFilePath, safePath);
        projectFiles = projectFiles.filter(f => !isPathInsideFolder(f.path, safePath));
        projectFolders = projectFolders.filter(path => !isSameOrInsideFolder(path, safePath));
        collapsedFolderPaths = new Set(Array.from(collapsedFolderPaths).filter(path => !isSameOrInsideFolder(path, safePath)));
        clearSelectedProjectFolderInside(safePath);
        refreshProjectAfterMutation(removedActiveFile ? "" : activeFilePath, {preserveSidebar: true});
        showProjectNotice("文件夹已删除。");
        return;
    }

    if (!projectFiles.some(f => f.path === safePath)) {
        return;
    }
    removedActiveFile = activeFilePath === safePath;
    projectFiles = projectFiles.filter(f => f.path !== safePath);
    refreshProjectAfterMutation(removedActiveFile ? "" : activeFilePath, {preserveSidebar: true});
    showProjectNotice("文件已删除。");
}

function deleteSelectedProjectTreeItemsNow() {
    const summary = getSelectedProjectDeleteSummary();
    if (!summary.totalCount) {
        updateProjectSelectedDeleteButton();
        showProjectNotice("请先选择要删除的文件或文件夹。");
        return;
    }

    syncActiveEditorToProject();
    const removedActiveFile = !!(activeFilePath && summary.filePaths.has(activeFilePath));
    projectFiles = projectFiles.filter(file => !summary.filePaths.has(safeNormalizePath(file && file.path)));
    projectFolders = projectFolders.filter(path => {
        const safePath = safeNormalizePath(path);
        return !!safePath && !summary.folderTargets.some(folderPath => isSameOrInsideFolder(safePath, folderPath));
    });
    collapsedFolderPaths = new Set(Array.from(collapsedFolderPaths).filter(path => {
        return !summary.folderTargets.some(folderPath => isSameOrInsideFolder(path, folderPath));
    }));
    if (summary.folderTargets.some(folderPath => isSameOrInsideFolder(projectTreeSelectedFolderPath, folderPath))) {
        projectTreeSelectedFolderPath = "";
    }
    if (summary.folderTargets.some(folderPath => isSameOrInsideFolder(pendingProjectUploadTargetPath, folderPath))) {
        pendingProjectUploadTargetPath = "";
    }
    selectedProjectFilePaths.clear();
    selectedProjectFolderPaths.clear();
    projectTreeRenameTarget = null;
    projectTreeInlineDeleteTarget = null;
    projectTreeCreateTarget = null;
    refreshProjectAfterMutation(removedActiveFile ? "" : activeFilePath, {preserveSidebar: true});
    updateProjectSelectedDeleteButton();
    showProjectNotice(`已删除选中的 ${summary.folderPaths.size} 个文件夹和 ${summary.filePaths.size} 个文件。`);
}

function deleteSelectedProjectTreeItems() {
    hideFloatingMenuIfOpen();
    hideProjectTreeContextMenu();
    const summary = getSelectedProjectDeleteSummary();
    if (!summary.totalCount) {
        updateProjectSelectedDeleteButton();
        showProjectNotice("请先选择要删除的文件或文件夹。");
        return;
    }
    openProjectConfirmDialog(
        "删除选中项",
        `确定删除选中的 ${summary.folderPaths.size} 个文件夹和 ${summary.filePaths.size} 个文件吗？`,
        "删除",
        deleteSelectedProjectTreeItemsNow
    );
}

function requestInlineDeleteTreeItem(kind, path) {
    const safePath = safeNormalizePath(path);
    if (!safePath) {
        return;
    }
    hideProjectTreeContextMenu();
    projectTreeRenameTarget = null;
    projectTreeCreateTarget = null;
    projectTreeInlineDeleteTarget = {kind: kind, path: safePath};
    renderProjectFileTree();
}

function confirmInlineDeleteTreeItem(kind, path) {
    projectTreeInlineDeleteTarget = null;
    deleteProjectTreeItemNow(kind, path);
}

function createTreeDeleteControl(kind, path) {
    const safePath = safeNormalizePath(path);
    const confirming = isSameProjectTreeTarget(projectTreeInlineDeleteTarget, kind, safePath);
    const button = document.createElement("button");
    button.type = "button";
    if (confirming) {
        button.className = "tree-delete-confirm-btn";
        button.textContent = "确认";
        button.setAttribute("aria-label", "确认删除");
    } else {
        button.className = "tree-delete-btn";
        button.innerHTML = '<i class="bi bi-trash3" aria-hidden="true"></i>';
        button.title = "删除";
        button.setAttribute("aria-label", "删除");
    }
    button.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (confirming) {
            confirmInlineDeleteTreeItem(kind, safePath);
        } else {
            requestInlineDeleteTreeItem(kind, safePath);
        }
    });
    button.addEventListener("dblclick", function (e) {
        e.preventDefault();
        e.stopPropagation();
    });
    button.draggable = false;
    button.addEventListener("contextmenu", function (e) {
        e.preventDefault();
        e.stopPropagation();
    });
    return button;
}

function createProjectTreeSelectControl(kind, path) {
    const safePath = safeNormalizePath(path);
    const wrapper = document.createElement("span");
    wrapper.className = "tree-select-control";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "tree-select-checkbox";
    checkbox.draggable = false;
    checkbox.setAttribute("aria-label", kind === "folder" ? `选择文件夹 ${safePath}` : `选择文件 ${safePath}`);

    if (kind === "folder") {
        const state = getProjectTreeFolderSelectionState(safePath);
        checkbox.checked = state.checked;
        checkbox.indeterminate = state.indeterminate;
    } else {
        checkbox.checked = selectedProjectFilePaths.has(safePath);
    }

    checkbox.addEventListener("change", function (e) {
        e.stopPropagation();
        setProjectTreeItemSelected(kind, safePath, checkbox.checked);
    });

    ["click", "dblclick", "mousedown", "contextmenu"].forEach(eventName => {
        wrapper.addEventListener(eventName, function (e) {
            e.stopPropagation();
        });
    });
    wrapper.appendChild(checkbox);
    return wrapper;
}

function clearAllProjectFiles() {
    hideFloatingMenuIfOpen();
    hideProjectTreeContextMenu();
    projectTreeCreateTarget = null;
    const emptyLanguage = getCurrentLanguageValue();
    if (!hasProjectTreeItems()) {
        resetWorkspaceForEmptyProject(emptyLanguage, {clearFolders: true});
        showProjectNotice(`已清空，继续输入将自动创建 ${defaultFilenameForLanguage(emptyLanguage)}。`);
        return;
    }
    syncActiveEditorToProject();
    projectFiles = [];
    projectFolders = [];
    projectTreeSelectedFolderPath = "";
    pendingProjectUploadTargetPath = "";
    resetWorkspaceForEmptyProject(emptyLanguage, {clearFolders: true});
    showProjectNotice(`已清空所有文件，继续输入将自动创建 ${defaultFilenameForLanguage(emptyLanguage)}。`);
}

function copyProjectTreeItemPath(kind, path) {
    const safePath = safeNormalizePath(path);
    if (!safePath) {
        showProjectNotice("未找到要复制的路径。");
        return;
    }
    if (kind === "folder" && !projectFolderExists(safePath)) {
        showProjectNotice("未找到要复制路径的文件夹。");
        return;
    }
    if (kind === "file" && !projectFiles.some(f => f.path === safePath)) {
        showProjectNotice("未找到要复制路径的文件。");
        return;
    }
    if (kind !== "folder" && kind !== "file") {
        return;
    }

    copyToClipboard(safePath, function () {
        showProjectNotice("路径已复制。");
    });
}

function showProjectTreeContextMenu(x, y, kind, path) {
    const menu = document.getElementById("projectTreeContextMenu");
    if (!menu) {
        return;
    }
    const targetKind = kind || "root";
    projectTreeContextTarget = {kind: targetKind, path: safeNormalizePath(path)};
    const newFileButton = menu.querySelector('[data-action="new-file"]');
    const newFolderButton = menu.querySelector('[data-action="new-folder"]');
    const uploadFileButton = menu.querySelector('[data-action="upload-file"]');
    const uploadFolderButton = menu.querySelector('[data-action="upload-folder"]');
    const copyPathButton = menu.querySelector('[data-action="copy-path"]');
    const downloadButton = menu.querySelector('[data-action="download"]');
    const shareButton = menu.querySelector('[data-action="share"]');
    const renameButton = menu.querySelector('[data-action="rename"]');
    const deleteButton = menu.querySelector('[data-action="delete"]');
    const itemOnlyElements = menu.querySelectorAll('[data-item-only="true"]');
    const isRootTarget = targetKind === "root";
    setProjectTreeSelectedFolderPath(getContextTargetParentPath(projectTreeContextTarget), {render: true});

    itemOnlyElements.forEach(el => {
        el.style.display = isRootTarget ? "none" : "";
    });
    if (newFileButton) {
        newFileButton.textContent = targetKind === "folder"
            ? "新建文件"
            : (targetKind === "file" ? "新建同级文件" : "新建文件");
    }
    if (newFolderButton) {
        newFolderButton.textContent = targetKind === "folder"
            ? "新建文件夹"
            : (targetKind === "file" ? "新建同级文件夹" : "新建文件夹");
    }
    if (uploadFileButton) {
        uploadFileButton.textContent = targetKind === "folder"
            ? "上传文件到此文件夹"
            : (targetKind === "file" ? "上传同级文件" : "上传文件到根目录");
    }
    if (uploadFolderButton) {
        uploadFolderButton.textContent = targetKind === "folder"
            ? "上传文件夹到此文件夹"
            : (targetKind === "file" ? "上传同级文件夹" : "上传文件夹到根目录");
    }
    if (copyPathButton) {
        copyPathButton.textContent = targetKind === "folder" ? "复制文件夹路径" : "复制文件路径";
    }
    if (downloadButton) {
        downloadButton.textContent = targetKind === "folder" ? "下载文件夹" : "下载文件";
    }
    if (shareButton) {
        shareButton.textContent = targetKind === "folder" ? "分享文件夹" : "分享文件";
    }
    if (renameButton) {
        renameButton.textContent = targetKind === "folder" ? "重命名文件夹" : "重命名文件";
    }
    if (deleteButton) {
        deleteButton.textContent = targetKind === "folder" ? "删除文件夹" : "删除文件";
    }

    menu.style.display = "block";
    menu.setAttribute("aria-hidden", "false");
    menu.style.left = "0px";
    menu.style.top = "0px";
    const rect = menu.getBoundingClientRect();
    const padding = 8;
    const left = Math.max(padding, Math.min(x, window.innerWidth - rect.width - padding));
    const top = Math.max(padding, Math.min(y, window.innerHeight - rect.height - padding));
    menu.style.left = left + "px";
    menu.style.top = top + "px";
}

function hideProjectTreeContextMenu() {
    const menu = document.getElementById("projectTreeContextMenu");
    if (!menu) {
        return;
    }
    projectTreeContextTarget = null;
    menu.style.display = "none";
    menu.setAttribute("aria-hidden", "true");
}

function showProjectNotice(message) {
    const notice = document.getElementById("projectTreeNotice");
    if (!notice || !message) {
        return;
    }
    notice.textContent = message;
    notice.classList.add("show");
    if (projectNoticeTimer) {
        clearTimeout(projectNoticeTimer);
    }
    projectNoticeTimer = setTimeout(function () {
        notice.classList.remove("show");
    }, 2600);
}

function openProjectConfirmDialog(title, message, confirmText, onConfirm) {
    pendingProjectConfirmAction = typeof onConfirm === "function" ? onConfirm : null;
    document.getElementById("projectConfirmTitle").textContent = title || "确认操作";
    document.getElementById("projectConfirmMessage").textContent = message || "";
    document.getElementById("projectConfirmActionBtn").textContent = confirmText || "确认";
    openOverlay("projectConfirmOverlay");
    setTimeout(function () {
        const button = document.getElementById("projectConfirmActionBtn");
        if (button) {
            button.focus();
        }
    }, 40);
}

function closeProjectConfirmDialog() {
    pendingProjectConfirmAction = null;
    closeOverlay("projectConfirmOverlay");
}

function runProjectConfirmAction() {
    const action = pendingProjectConfirmAction;
    pendingProjectConfirmAction = null;
    closeOverlay("projectConfirmOverlay");
    if (action) {
        action();
    }
}

function bindProjectTreeContextMenu() {
    const menu = document.getElementById("projectTreeContextMenu");
    if (!menu) {
        return;
    }
    const treeEl = document.getElementById("projectFileTree");
    const emptyEl = document.getElementById("projectTreeEmpty");
    menu.addEventListener("click", function (e) {
        const button = e.target.closest("button[data-action]");
        if (!button || !projectTreeContextTarget) {
            return;
        }
        const target = Object.assign({}, projectTreeContextTarget);
        const action = button.getAttribute("data-action");
        hideProjectTreeContextMenu();
        if (action === "new-file") {
            openCreateFileDialog(getContextTargetParentPath(target));
        } else if (action === "new-folder") {
            openCreateFolderDialog(getContextTargetParentPath(target));
        } else if (action === "upload-file") {
            beginProjectUpload("file-input", getContextTargetParentPath(target));
        } else if (action === "upload-folder") {
            openProjectFolderUploadDialog(getContextTargetParentPath(target));
        } else if (action === "copy-path") {
            copyProjectTreeItemPath(target.kind, target.path);
        } else if (action === "download") {
            downloadProjectTreeItem(target.kind, target.path);
        } else if (action === "share") {
            shareProjectTreeItem(target.kind, target.path);
        } else if (action === "rename") {
            beginRenameTreeItem(target.kind, target.path);
        } else if (action === "delete") {
            deleteProjectTreeItem(target.kind, target.path);
        }
    });
    if (treeEl) {
        bindProjectTreeRootDropTarget(treeEl);
        treeEl.addEventListener("contextmenu", function (e) {
            if (e.target.closest(".tree-folder-title, .tree-file-button, .tree-rename-input, .tree-delete-btn, .tree-delete-confirm-btn")) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            showProjectTreeContextMenu(e.clientX, e.clientY, "root", "");
        });
        treeEl.addEventListener("click", function (e) {
            if (!isProjectTreeRootDropEvent(e)) {
                return;
            }
            setProjectTreeSelectedFolderPath("", {render: true});
        });
    }
    if (emptyEl) {
        bindProjectTreeRootDropTarget(emptyEl);
        emptyEl.addEventListener("contextmenu", function (e) {
            e.preventDefault();
            e.stopPropagation();
            showProjectTreeContextMenu(e.clientX, e.clientY, "root", "");
        });
        emptyEl.addEventListener("click", function () {
            setProjectTreeSelectedFolderPath("", {render: true});
        });
    }
    document.addEventListener("click", function (e) {
        if (!menu.contains(e.target)) {
            hideProjectTreeContextMenu();
        }
    });
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
            hideProjectTreeContextMenu();
            const confirmOverlay = document.getElementById("projectConfirmOverlay");
            if (confirmOverlay && confirmOverlay.style.display === "block") {
                closeProjectConfirmDialog();
            }
            const uploadOverlay = document.getElementById("projectUploadOverlay");
            if (uploadOverlay && uploadOverlay.classList.contains("show")) {
                closeProjectFolderUploadDialog();
            }
        }
    });
    window.addEventListener("resize", hideProjectTreeContextMenu);
    document.addEventListener("scroll", hideProjectTreeContextMenu, true);
}

function appendProjectTreeCreateInput(parent, prefix, kind) {
    if (!projectTreeCreateTarget || projectTreeCreateTarget.kind !== kind || projectTreeCreateTarget.parentPath !== safeNormalizePath(prefix || "")) {
        return;
    }

    const li = document.createElement("li");
    li.className = "tree-node";
    const row = document.createElement("div");
    row.className = "tree-create-row";
    const input = document.createElement("input");
    input.className = "tree-rename-input tree-create-input";
    input.type = "text";
    input.value = projectTreeCreateTarget.defaultName || getProjectTreeCreateDefaultName(kind, prefix, projectTreeCreateTarget.language);
    input.placeholder = kind === "folder" ? "new-folder" : defaultFilenameForLanguage(projectTreeCreateTarget.language || getProjectTreeCreateLanguage());
    bindProjectTreeCreateInput(input, kind, prefix);

    if (kind === "folder") {
        const previewFolderPath = safeNormalizePath(joinProjectPath(prefix || "", input.value));
        row.appendChild(createBootstrapIcon("bi-chevron-right", "tree-folder-toggle", ""));
        row.appendChild(createTreeFolderIcon(true, previewFolderPath || input.value));
    } else {
        const previewPath = safeNormalizePath(joinProjectPath(prefix || "", input.value));
        row.appendChild(createTreeFileIcon({
            kind: "text",
            path: previewPath || input.value
        }));
    }

    row.appendChild(input);
    li.appendChild(row);
    parent.appendChild(li);
}

function createProjectTreeRenameRow(kind, path, name, options) {
    const row = document.createElement("div");
    row.className = `tree-rename-row tree-rename-row-${kind}`;
    const input = document.createElement("input");
    input.className = "tree-rename-input";
    input.type = "text";
    input.value = name;
    bindProjectTreeRenameInput(input, kind, path);

    if (kind === "folder") {
        const isCollapsed = !!(options && options.isCollapsed);
        row.appendChild(createBootstrapIcon(
            isCollapsed ? "bi-chevron-right" : "bi-chevron-down",
            "tree-folder-toggle",
            ""
        ));
        row.appendChild(createTreeFolderIcon(isCollapsed, path));
    } else {
        row.appendChild(createTreeFileIcon((options && options.file) || {path: path}));
    }

    row.appendChild(input);
    return row;
}

function renderProjectFileTree() {
    const treeEl = document.getElementById("projectFileTree");
    const emptyEl = document.getElementById("projectTreeEmpty");
    treeEl.innerHTML = "";
    pruneProjectTreeSelection();
    updateProjectSelectedDeleteButton();

    if (!hasProjectTreeItems() && !projectTreeCreateTarget) {
        collapsedFolderPaths.clear();
        emptyEl.style.display = "block";
        return;
    }
    emptyEl.style.display = "none";
    if (hasProjectTreeItems()) {
        pruneCollapsedProjectFolders();
    }

    const root = {dirs: {}, files: []};
    const sortedFolders = projectFolders.slice().sort((a, b) => a.localeCompare(b));
    for (const folderPath of sortedFolders) {
        const parts = safeNormalizePath(folderPath).split("/");
        let node = root;
        for (const segment of parts) {
            if (!segment) {
                continue;
            }
            if (!node.dirs[segment]) {
                node.dirs[segment] = {dirs: {}, files: []};
            }
            node = node.dirs[segment];
        }
    }
    const sortedFiles = projectFiles.slice().sort((a, b) => a.path.localeCompare(b.path));
    for (const file of sortedFiles) {
        const parts = file.path.split("/");
        let node = root;
        for (let i = 0; i < parts.length - 1; i++) {
            const segment = parts[i];
            if (!node.dirs[segment]) {
                node.dirs[segment] = {dirs: {}, files: []};
            }
            node = node.dirs[segment];
        }
        node.files.push({name: parts[parts.length - 1], file: file});
    }

    const rootList = document.createElement("ul");
    rootList.className = "tree-group";
    buildTreeDom(root, rootList, "");
    treeEl.appendChild(rootList);
}

function buildTreeDom(node, parent, prefix) {
    appendProjectTreeCreateInput(parent, prefix, "folder");

    const folderNames = Object.keys(node.dirs).sort((a, b) => a.localeCompare(b));
    for (const folder of folderNames) {
        const folderPath = prefix ? `${prefix}/${folder}` : folder;
        const isCollapsed = isProjectFolderCollapsed(folderPath);
        const li = document.createElement("li");
        li.className = "tree-node";
        const title = document.createElement("div");
        title.className = "tree-folder";
        if (projectTreeRenameTarget && projectTreeRenameTarget.kind === "folder" && projectTreeRenameTarget.path === folderPath) {
            title.appendChild(createProjectTreeRenameRow("folder", folderPath, folder, {
                isCollapsed: isCollapsed
            }));
        } else {
            const span = document.createElement("span");
            span.className = "tree-folder-title";
            if (isCollapsed) {
                span.classList.add("is-collapsed");
            }
            if (isProjectTreeFolderSelected(folderPath)) {
                span.classList.add("is-upload-target");
            }
            span.setAttribute("role", "button");
            span.tabIndex = 0;
            span.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
            span.title = isCollapsed ? "展开文件夹" : "折叠文件夹";
            bindProjectTreeDragSource(span, "folder", folderPath);
            bindProjectTreeDropTarget(span, "folder", folderPath);
            bindProjectExternalUploadDropTarget(span, folderPath);
            const toggleIcon = createBootstrapIcon(
                isCollapsed ? "bi-chevron-right" : "bi-chevron-down",
                "tree-folder-toggle",
                ""
            );
            const folderIcon = createTreeFolderIcon(isCollapsed, folderPath);
            const label = document.createElement("span");
            label.className = "tree-entry-label";
            label.textContent = folder;
            span.appendChild(toggleIcon);
            span.appendChild(createProjectTreeSelectControl("folder", folderPath));
            span.appendChild(folderIcon);
            span.appendChild(label);
            span.appendChild(createTreeDeleteControl("folder", folderPath));
            title.appendChild(span);
            span.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                toggleProjectTreeFolder(folderPath);
            });
            span.addEventListener("keydown", function (e) {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleProjectTreeFolder(folderPath);
                }
            });
            title.addEventListener("dblclick", function (e) {
                e.preventDefault();
                e.stopPropagation();
                beginRenameTreeItem("folder", folderPath);
            });
            title.addEventListener("contextmenu", function (e) {
                e.preventDefault();
                e.stopPropagation();
                showProjectTreeContextMenu(e.clientX, e.clientY, "folder", folderPath);
            });
        }
        li.appendChild(title);

        const child = document.createElement("ul");
        child.className = "tree-group";
        if (isCollapsed) {
            child.classList.add("is-collapsed");
        }
        child.style.paddingLeft = "14px";
        buildTreeDom(node.dirs[folder], child, folderPath);
        li.appendChild(child);
        parent.appendChild(li);
    }

    appendProjectTreeCreateInput(parent, prefix, "file");

    const fileItems = node.files.slice().sort((a, b) => a.name.localeCompare(b.name));
    for (const item of fileItems) {
        const li = document.createElement("li");
        li.className = "tree-node";
        if (projectTreeRenameTarget && projectTreeRenameTarget.kind === "file" && projectTreeRenameTarget.path === item.file.path) {
            li.appendChild(createProjectTreeRenameRow("file", item.file.path, item.name, {
                file: item.file
            }));
        } else {
            const button = document.createElement("div");
            button.setAttribute("role", "button");
            button.tabIndex = 0;
            button.className = "tree-file-button";
            if (item.file.path === activeFilePath) {
                button.classList.add("active");
            }
            bindProjectTreeDragSource(button, "file", item.file.path);
            bindProjectTreeDropTarget(button, "file", item.file.path);
            bindProjectExternalUploadDropTarget(button, getPathParent(item.file.path));
            const icon = createTreeFileIcon(item.file);
            const label = document.createElement("span");
            label.className = "tree-entry-label";
            label.textContent = item.name;
            button.appendChild(createProjectTreeSelectControl("file", item.file.path));
            button.appendChild(icon);
            button.appendChild(label);
            button.appendChild(createTreeDeleteControl("file", item.file.path));
            button.addEventListener("click", function () {
                projectTreeInlineDeleteTarget = null;
                openProjectFile(item.file.path);
                if (isMobileViewport()) {
                    setSidebarOpen(false);
                }
            });
            button.addEventListener("keydown", function (e) {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    projectTreeInlineDeleteTarget = null;
                    openProjectFile(item.file.path);
                    if (isMobileViewport()) {
                        setSidebarOpen(false);
                    }
                }
            });
            button.addEventListener("dblclick", function (e) {
                e.preventDefault();
                e.stopPropagation();
                beginRenameTreeItem("file", item.file.path);
            });
            button.addEventListener("contextmenu", function (e) {
                e.preventDefault();
                e.stopPropagation();
                showProjectTreeContextMenu(e.clientX, e.clientY, "file", item.file.path);
            });
            li.appendChild(button);
        }
        parent.appendChild(li);
    }
}
