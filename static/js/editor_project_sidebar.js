/* Editor page adapter for the sharecode project sidebar. */
(function () {
    let editorProjectSidebarInitialized = false;
    const editorProjectConfig = window.CODEMARK_EDITOR_PROJECT_CONFIG || {};
    const EDITOR_PROJECT_DRAFT_CACHE_KEY = editorProjectConfig.draftCacheKey || "codemark:editor:project-draft:v1";
    const EDITOR_SIDEBAR_WIDTH_CACHE_KEY = editorProjectConfig.sidebarWidthCacheKey || "codemark:editor:sidebar-width:v1";

    function readEditorJsonCache(key) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) {
                return null;
            }
            const data = JSON.parse(raw);
            return data && typeof data === "object" ? data : null;
        } catch (e) {
            return null;
        }
    }

    function saveEditorProjectDraftCache() {
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
            localStorage.setItem(EDITOR_PROJECT_DRAFT_CACHE_KEY, JSON.stringify({
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

    function installEditorScopedSharecodeAdapters() {
        const loadDraft = function () {
            return readEditorJsonCache(EDITOR_PROJECT_DRAFT_CACHE_KEY);
        };
        const saveDraft = function () {
            saveEditorProjectDraftCache();
        };
        const scheduleDraftSave = function () {
            if (sharecodeDraftSaveTimer) {
                clearTimeout(sharecodeDraftSaveTimer);
            }
            sharecodeDraftSaveTimer = setTimeout(function () {
                saveSharecodeDraftCache();
            }, SHARECODE_DRAFT_SAVE_DEBOUNCE_MS);
        };
        const readSidebarWidth = function () {
            try {
                const raw = localStorage.getItem(EDITOR_SIDEBAR_WIDTH_CACHE_KEY);
                const width = Number(raw);
                return Number.isFinite(width) && width > 0 ? width : null;
            } catch (e) {
                return null;
            }
        };
        const writeSidebarWidth = function (width) {
            try {
                localStorage.setItem(EDITOR_SIDEBAR_WIDTH_CACHE_KEY, String(clampSidebarWidth(width)));
            } catch (e) {
            }
        };
        const safeToggleFloatingMenu = function () {
            const menu = document.getElementById("floatingMenu");
            if (menu) {
                menu.classList.toggle("show-menu");
            }
        };
        const safeHideFloatingMenu = function () {
            const menu = document.getElementById("floatingMenu");
            if (menu && menu.classList.contains("show-menu")) {
                menu.classList.remove("show-menu");
            }
        };

        window.loadSharecodeDraftCache = loadDraft;
        window.saveSharecodeDraftCache = saveDraft;
        window.scheduleSharecodeDraftCacheSave = scheduleDraftSave;
        window.readCachedSidebarWidth = readSidebarWidth;
        window.writeCachedSidebarWidth = writeSidebarWidth;
        window.toggleFloatingMenu = safeToggleFloatingMenu;
        window.hideFloatingMenuIfOpen = safeHideFloatingMenu;
        try {
            loadSharecodeDraftCache = loadDraft;
            saveSharecodeDraftCache = saveDraft;
            scheduleSharecodeDraftCacheSave = scheduleDraftSave;
            readCachedSidebarWidth = readSidebarWidth;
            writeCachedSidebarWidth = writeSidebarWidth;
            toggleFloatingMenu = safeToggleFloatingMenu;
            hideFloatingMenuIfOpen = safeHideFloatingMenu;
        } catch (e) {
        }
    }

    installEditorScopedSharecodeAdapters();

    function normalizeEditorProjectFromCache(cacheProject) {
        const normalized = {
            files: [],
            folders: [],
            activeFile: ""
        };
        if (!cacheProject || typeof cacheProject !== "object") {
            return normalized;
        }

        const textFiles = Array.isArray(cacheProject.text_files) ? cacheProject.text_files : [];
        const assets = Array.isArray(cacheProject.assets) ? cacheProject.assets : [];
        for (const item of textFiles) {
            if (!item || typeof item !== "object") {
                continue;
            }
            const path = safeNormalizePath(item.path || item.name || "");
            if (!path) {
                continue;
            }
            normalized.files.push({
                kind: "text",
                path: path,
                content: typeof item.content === "string" ? item.content : "",
                language: normalizeSharecodeLanguage(item.language || detectLanguageFromFilename(path)),
                highlighted_lines: normalizeHighlightedLines(item.highlighted_lines || item.line_highlights)
            });
        }

        for (const item of assets) {
            if (!item || typeof item !== "object") {
                continue;
            }
            const path = safeNormalizePath(item.path || item.name || "");
            if (!path) {
                continue;
            }
            normalized.files.push({
                kind: "asset",
                path: path,
                mime_type: item.mime_type || "application/octet-stream",
                size: typeof item.size === "number" ? item.size : 0,
                data_base64: typeof item.data_base64 === "string" ? item.data_base64 : "",
                url: item.url || "",
                source_project_id: item.source_project_id || server_share_project_id || "",
                source_stored_path: item.source_stored_path || item.stored_path || ""
            });
        }

        const folders = Array.isArray(cacheProject.folders)
            ? cacheProject.folders
            : (Array.isArray(cacheProject.project_folders) ? cacheProject.project_folders : []);
        for (const folder of folders) {
            const path = safeNormalizePath(typeof folder === "string" ? folder : (folder && folder.path));
            if (path && !normalized.folders.includes(path)) {
                normalized.folders.push(path);
            }
        }
        normalized.folders.sort((a, b) => a.localeCompare(b));
        normalized.activeFile = safeNormalizePath(cacheProject.active_file || "");
        return normalized;
    }

    function getInitialEditorProject(options) {
        const opts = options || {};
        const sharedRunPage = window.location.pathname.indexOf("/share/") === 0;
        if (sharedRunPage) {
            const serverProject = normalizeEditorProjectFromCache(
                typeof server_pre_project !== "undefined" ? server_pre_project : null
            );
            if (serverProject.files.length || serverProject.folders.length) {
                return serverProject;
            }
        } else {
            const cache = loadSharecodeDraftCache();
            const cachedProject = normalizeEditorProjectFromCache(cache && cache.project);
            if (cachedProject.files.length || cachedProject.folders.length) {
                return cachedProject;
            }
        }

        const language = normalizeSharecodeLanguage(opts.initialLanguage || window.server_pre_lang || "python");
        const initialCode = typeof opts.initialCode === "string"
            ? opts.initialCode
            : (window.editor ? window.editor.getValue() : "");
        const defaultPath = safeNormalizePath(opts.defaultPath || defaultFilenameForLanguage(language))
            || defaultFilenameForLanguage(language);

        return {
            files: [{
                kind: "text",
                path: defaultPath,
                content: initialCode,
                language: normalizeSharecodeLanguage(detectLanguageFromFilename(defaultPath), language),
                highlighted_lines: []
            }],
            folders: [],
            activeFile: defaultPath
        };
    }

    function handleEditorProjectSidebarResize() {
        applyCachedSidebarWidth();
        const appRoot = document.getElementById("appRoot");
        if (appRoot) {
            if (!isMobileViewport()) {
                appRoot.classList.remove("sidebar-open");
            } else if (sidebarOpen) {
                appRoot.classList.add("sidebar-open");
                appRoot.classList.remove("sidebar-collapsed");
            }
        }
        if (window.editor && typeof window.editor.resize === "function") {
            window.editor.resize();
        }
    }

    function bindEditorProjectInputs() {
        const fileInput = document.getElementById("file-input");
        if (fileInput) {
            fileInput.addEventListener("change", async function (event) {
                try {
                    await importFilesFromInput(Array.from(event.target.files || []), pendingProjectUploadTargetPath);
                } finally {
                    pendingProjectUploadTargetPath = "";
                    event.target.value = "";
                }
            });
        }

        const folderInput = document.getElementById("folder-input");
        if (folderInput) {
            folderInput.addEventListener("change", async function (event) {
                try {
                    const files = Array.from(event.target.files || []);
                    if (files.length) {
                        closeProjectFolderUploadDialog();
                    }
                    await importFilesFromInput(files, pendingProjectUploadTargetPath);
                } finally {
                    pendingProjectUploadTargetPath = "";
                    event.target.value = "";
                }
            });
        }
    }

    window.initializeEditorProjectSidebar = function (options) {
        if (editorProjectSidebarInitialized || !window.editor) {
            return;
        }
        editorProjectSidebarInitialized = true;

        applyCachedSidebarWidth();
        bindSidebarResize();
        bindProjectTreeContextMenu();
        bindProjectUploadDialog();
        bindGlobalProjectExternalUpload();
        bindEditorLineHighlightSelection();
        bindEditorProjectInputs();
        bindOverlayDismiss("projectConfirmOverlay", "projectConfirmDialog");
        setProjectTreeSelectionVisible(false);

        const initialProject = getInitialEditorProject(options || {});
        projectFiles = initialProject.files;
        projectFolders = initialProject.folders || [];
        activeFilePath = initialProject.activeFile;
        if (!activeFilePath || !projectFiles.some(file => file.path === activeFilePath)) {
            const firstTextFile = projectFiles.find(file => file.kind === "text");
            activeFilePath = firstTextFile ? firstTextFile.path : (projectFiles[0] ? projectFiles[0].path : "");
        }
        shareViewMode = SHARE_VIEW_SOURCE;
        setShareViewSelectors(shareViewMode);

        renderProjectFileTree();
        updateSidebarVisibilityByFileCount(true);
        if (activeFilePath) {
            openProjectFile(activeFilePath);
        }

        window.editor.session.on("change", handleEditorContentChange);
        editorReady = true;
        updatePythonRunButtonVisibility();
        saveSharecodeDraftCache();
        window.addEventListener("resize", handleEditorProjectSidebarResize);
    };

    window.beginEditorProjectUpload = function (inputId) {
        if (inputId === "folder-input") {
            openProjectFolderUploadDialog(getSelectedProjectUploadTargetPath());
            return true;
        }
        if (inputId === "file-input") {
            beginProjectUpload("file-input", getSelectedProjectUploadTargetPath());
            return true;
        }
        return false;
    };

    window.saveEditorActiveProjectFile = function (fallbackFilename) {
        if (typeof syncActiveEditorToProject !== "function") {
            return false;
        }
        syncActiveEditorToProject();
        const active = getActiveProjectFile();
        if (!active) {
            return false;
        }
        if (active.kind === "asset") {
            downloadProjectFile(active.path);
            return true;
        }

        const filename = getProjectPathBaseName(active.path) || fallbackFilename || "code.py";
        const blob = new Blob([active.content || ""], {type: "text/plain;charset=utf-8"});
        saveAs(blob, filename);
        return true;
    };

    window.getEditorProjectSharePayload = function () {
        if (typeof buildSharePayload !== "function") {
            return null;
        }
        createProjectFileFromEditorInput();
        syncActiveEditorToProject();
        return buildSharePayload();
    };

    function getEditorSharePayloadTextFiles(payload) {
        return payload && Array.isArray(payload.text_files) ? payload.text_files : [];
    }

    function getEditorSharePayloadPrimaryTextFile(payload) {
        const textFiles = getEditorSharePayloadTextFiles(payload);
        const activePath = safeNormalizePath(payload && payload.active_file);
        return textFiles.find(file => safeNormalizePath(file && file.path) === activePath) || textFiles[0] || null;
    }

    function getEditorSharePayloadPythonFile(payload) {
        const textFiles = getEditorSharePayloadTextFiles(payload);
        const activePath = safeNormalizePath(payload && payload.active_file);
        const activePythonFile = textFiles.find(file => {
            const path = safeNormalizePath(file && file.path);
            const language = normalizeSharecodeLanguage((file && file.language) || detectLanguageFromFilename(path));
            return path === activePath && language === "python";
        });
        if (activePythonFile) {
            return activePythonFile;
        }
        return textFiles.find(file => {
            const path = safeNormalizePath(file && file.path);
            return normalizeSharecodeLanguage((file && file.language) || detectLanguageFromFilename(path)) === "python";
        }) || null;
    }

    function buildEditorRunPayload(payload, pythonFile) {
        if (!payload || !pythonFile) {
            return payload || null;
        }
        const pythonPath = safeNormalizePath(pythonFile.path);
        const textFiles = getEditorSharePayloadTextFiles(payload);
        return Object.assign({}, payload, {
            text_files: textFiles.slice().sort((a, b) => {
                const aIsTarget = safeNormalizePath(a && a.path) === pythonPath;
                const bIsTarget = safeNormalizePath(b && b.path) === pythonPath;
                if (aIsTarget === bIsTarget) {
                    return 0;
                }
                return aIsTarget ? -1 : 1;
            }),
            active_file: pythonPath
        });
    }

    window.getEditorSharePayloadInfo = function (payload) {
        const primaryTextFile = getEditorSharePayloadPrimaryTextFile(payload);
        const pythonFile = getEditorSharePayloadPythonFile(payload);
        return {
            primaryTextFile: primaryTextFile,
            pythonFile: pythonFile,
            hasPython: !!pythonFile
        };
    };

    window.getEditorActiveShareFile = function () {
        if (typeof getActiveProjectFile !== "function") {
            return null;
        }
        createProjectFileFromEditorInput();
        syncActiveEditorToProject();
        const active = getActiveProjectFile();
        return active && active.kind === "text" ? active : null;
    };

    window.buildEditorShareRequestData = function (runEnabled, payloadOverride) {
        const payloadInfo = payloadOverride ? window.getEditorSharePayloadInfo(payloadOverride) : null;
        const activeFile = payloadInfo
            ? (runEnabled ? payloadInfo.pythonFile : payloadInfo.primaryTextFile)
            : window.getEditorActiveShareFile();
        const fallbackLanguage = normalizeSharecodeLanguage(window.server_pre_lang || "python");
        const language = activeFile
            ? normalizeSharecodeLanguage(activeFile.language || detectLanguageFromFilename(activeFile.path))
            : fallbackLanguage;
        const code = activeFile ? (activeFile.content || "") : (window.editor ? window.editor.getValue() : "");

        if (runEnabled) {
            const payload = payloadOverride
                ? buildEditorRunPayload(payloadOverride, payloadInfo && payloadInfo.pythonFile)
                : window.getEditorProjectSharePayload();
            const requestData = {
                code: code,
                language: language,
                template: "editor",
                theme: getCurrentThemeValue()
            };
            if (payload) {
                requestData.project_payload = JSON.stringify(payload);
            }
            return {
                language: language,
                code: code,
                requestData: requestData
            };
        }

        const payload = payloadOverride || window.getEditorProjectSharePayload();
        const requestData = {
            code: code,
            language: language,
            template: "sharecode",
            theme: getCurrentThemeValue()
        };
        if (payload) {
            requestData.project_payload = JSON.stringify(payload);
        }
        return {
            language: language,
            code: code,
            requestData: requestData
        };
    };

    window.shareProjectTreeItem = function (kind, path) {
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
        if (typeof share === "function") {
            share({
                projectPayloadOverride: payload
            });
        }
    };
})();
