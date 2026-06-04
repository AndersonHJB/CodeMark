/* Sharecode browser event bindings and Ace startup. */
window.addEventListener("beforeunload", function () {
    saveSharecodeDraftCache();
});

window.addEventListener("resize", function () {
    applyCachedSidebarWidth();
    if (window.editor) {
        window.editor.resize();
    }
    if (!isMobileViewport()) {
        const appRoot = document.getElementById("appRoot");
        appRoot.classList.remove("sidebar-open");
    } else if (sidebarOpen) {
        const appRoot = document.getElementById("appRoot");
        appRoot.classList.add("sidebar-open");
        appRoot.classList.remove("sidebar-collapsed");
    }
});

window.addEventListener("load", async function () {
    applyCachedSidebarWidth();
    bindSidebarResize();

    ace.config.set("basePath", SHARECODE_STATIC_PATHS.aceBasePath || "/static/js/ace/");
    window.editor = ace.edit("editor");
    editor.setOptions({
        fontSize: isMobileViewport() ? "16pt" : "20pt",
        enableLiveAutocompletion: true,
        enableBasicAutocompletion: true,
        enableSnippets: true,
    });

    populateLanguageSelectors();
    bindEditorLineHighlightSelection();
    bindSelectorSync();
    bindProjectTreeContextMenu();
    bindProjectUploadDialog();
    bindGlobalProjectExternalUpload();
    if (typeof bindMarkdownImagePaste === "function") {
        bindMarkdownImagePaste();
    }
    setProjectTreeSelectionVisible(false);

    const initialState = resolveInitialState();
    projectFiles = initialState.project.files;
    projectFolders = initialState.project.folders || [];
    activeFilePath = initialState.project.activeFile;
    shareViewMode = resolveInitialShareViewMode();
    setShareViewSelectors(shareViewMode);

    applyEditorTheme(initialState.theme);

    renderProjectFileTree();
    updateSidebarVisibilityByFileCount(true);

    if (activeFilePath) {
        openProjectFile(activeFilePath);
    } else if (projectFiles.length > 0) {
        openProjectFile(projectFiles[0].path);
    } else {
        setLanguageSelectors(initialState.language);
        setEditorLang(initialState.language);
        updatePythonRunButtonVisibility();
        updateHtmlShareViewControls();
    }

    editor.session.on("change", handleEditorContentChange);
    editor.commands.addCommand({
        name: 'duplicateLine',
        bindKey: {win: 'Ctrl-D', mac: 'Command-D'},
        exec: function (editorRef) {
            editorRef.execCommand("copylinesdown");
        }
    });

    document.getElementById("file-input").addEventListener("change", async function (e) {
        try {
            await importFilesFromInput(Array.from(e.target.files || []), pendingProjectUploadTargetPath);
        } finally {
            pendingProjectUploadTargetPath = "";
            e.target.value = "";
        }
    });

    document.getElementById("folder-input").addEventListener("change", async function (e) {
        try {
            const files = Array.from(e.target.files || []);
            if (files.length) {
                closeProjectFolderUploadDialog();
            }
            await importFilesFromInput(files, pendingProjectUploadTargetPath);
        } finally {
            pendingProjectUploadTargetPath = "";
            e.target.value = "";
        }
    });

    bindOverlayDismiss("projectConfirmOverlay", "projectConfirmDialog");
    bindOverlayDismiss("aboutOverlay", "aboutDialog");

    editorReady = true;
    saveSharecodeDraftCache();
});
