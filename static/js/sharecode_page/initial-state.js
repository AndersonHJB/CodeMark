/* Sharecode server payload normalization and initial editor state. */
function normalizeServerProject(rawProject) {
    const normalized = {
        files: [],
        folders: [],
        activeFile: ""
    };
    if (!rawProject || typeof rawProject !== "object") {
        return normalized;
    }

    const textFiles = Array.isArray(rawProject.text_files) ? rawProject.text_files : [];
    const assets = Array.isArray(rawProject.assets) ? rawProject.assets : [];
    const folders = Array.isArray(rawProject.folders)
        ? rawProject.folders
        : (Array.isArray(rawProject.project_folders) ? rawProject.project_folders : []);

    for (const item of folders) {
        const folderPath = safeNormalizePath(typeof item === "string" ? item : (item && item.path));
        if (folderPath && !normalized.folders.includes(folderPath)) {
            normalized.folders.push(folderPath);
        }
    }

    for (const item of textFiles) {
        if (!item || typeof item !== "object") {
            continue;
        }
        const path = safeNormalizePath(item.path || item.name || "");
        if (!path) {
            continue;
        }
        const content = typeof item.content === "string" ? item.content : "";
        const language = normalizeSharecodeLanguage(item.language || detectLanguageFromFilename(path));
        normalized.files.push({
            kind: "text",
            path,
            content,
            language,
            highlighted_lines: normalizeHighlightedLines(item.highlighted_lines || item.line_highlights)
        });
    }

    for (const item of assets) {
        if (!item || typeof item !== "object") {
            continue;
        }
        const safePath = safeNormalizePath(item.path || item.name || "");
        if (!safePath) {
            continue;
        }
        normalized.files.push({
            kind: "asset",
            path: safePath,
            mime_type: item.mime_type || "application/octet-stream",
            size: typeof item.size === "number" ? item.size : 0,
            data_base64: typeof item.data_base64 === "string" ? item.data_base64 : "",
            url: item.url || "",
            source_project_id: item.source_project_id || server_share_project_id || "",
            source_stored_path: item.source_stored_path || item.stored_path || ""
        });
    }

    normalized.folders.sort((a, b) => a.localeCompare(b));

    if (typeof rawProject.active_file === "string") {
        normalized.activeFile = safeNormalizePath(rawProject.active_file);
    }

    return normalized;
}

function buildDefaultCode() {
    let defaultCode = "# -*- coding: utf-8 -*-\n";
    defaultCode += "# 欢迎使用 CodeMark\n";
    defaultCode += "# 支持多文件与项目化分享\n";
    defaultCode += "# 你可以在左侧创建文件，或上传文件夹\n";
    return defaultCode;
}

function resolveInitialState() {
    const isSharedCodePage = window.location.pathname.indexOf("/share/") === 0;
    const cache = loadSharecodeDraftCache();
    let project = {files: [], folders: [], activeFile: ""};
    let theme = SHARECODE_DEFAULT_THEME;
    let language = SHARECODE_DEFAULT_LANG;

    if (cache && typeof cache.theme === "string" && cache.theme) {
        theme = cache.theme;
    }
    if (cache && typeof cache.language === "string" && cache.language) {
        language = normalizeSharecodeLanguage(cache.language);
    }

    if (isSharedCodePage) {
        project = normalizeServerProject(server_pre_project);
        // 仅当服务端确实带回代码时才补一个兜底文件；空分享直接展示空状态
        const fallbackContent = typeof server_pre_code === "string" ? server_pre_code : "";
        if (!project.files.length && !project.folders.length && fallbackContent) {
            const fallbackLang = normalizeSharecodeLanguage(server_pre_lang);
            const fallbackPath = defaultFilenameForContent(fallbackLang, fallbackContent);
            project.files.push({
                kind: "text",
                path: fallbackPath,
                content: fallbackContent,
                language: looksLikeReactCode(fallbackContent) ? "javascript" : fallbackLang,
                highlighted_lines: []
            });
            project.activeFile = fallbackPath;
        }
    } else {
        const shouldKeepEmptyCacheProject = !!(cache && cache.project && cache.project.empty_project === true);
        if (cache && cache.project) {
            project = normalizeServerProject(cache.project);
        }
        if (!shouldKeepEmptyCacheProject && !project.files.length && !project.folders.length && server_pre_project) {
            project = normalizeServerProject(server_pre_project);
        }
        if (!shouldKeepEmptyCacheProject && !project.files.length && !project.folders.length && typeof server_pre_code === "string" && server_pre_code) {
            const lang = normalizeSharecodeLanguage(server_pre_lang);
            const filePath = defaultFilenameForContent(lang, server_pre_code);
            project.files.push({
                kind: "text",
                path: filePath,
                content: server_pre_code,
                language: looksLikeReactCode(server_pre_code) ? "javascript" : lang,
                highlighted_lines: []
            });
            project.activeFile = filePath;
        }
        if (!shouldKeepEmptyCacheProject && !project.files.length && !project.folders.length) {
            const lang = SHARECODE_DEFAULT_LANG;
            const filePath = defaultFilenameForLanguage(lang);
            project.files.push({
                kind: "text",
                path: filePath,
                content: buildDefaultCode(),
                language: lang,
                highlighted_lines: []
            });
            project.activeFile = filePath;
        }
    }

    if (!project.activeFile || !project.files.some(f => f.path === project.activeFile)) {
        const firstText = project.files.find(f => f.kind === "text");
        project.activeFile = firstText ? firstText.path : (project.files[0] ? project.files[0].path : "");
    }

    return {project, theme, language};
}
