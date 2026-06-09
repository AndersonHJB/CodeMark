/* Materialize the editor project into Pyodide before running Python. */
(function () {
    const PYODIDE_PROJECT_ROOT = "/codemark_project";

    function getPyodideFs() {
        const runtime = window.pyodide || (typeof pyodide !== "undefined" ? pyodide : null);
        return runtime && runtime.FS ? runtime.FS : null;
    }

    function normalizeProjectRunPath(path) {
        if (typeof safeNormalizePath === "function") {
            return safeNormalizePath(path);
        }
        if (typeof path !== "string") {
            return "";
        }
        const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/{2,}/g, "/").trim();
        if (!normalized || normalized.split("/").some(part => !part || part === "." || part === "..")) {
            return "";
        }
        return normalized;
    }

    function toPyodideProjectPath(path) {
        const safePath = normalizeProjectRunPath(path);
        return safePath ? `${PYODIDE_PROJECT_ROOT}/${safePath}` : "";
    }

    function getParentPath(path) {
        const slashIndex = path.lastIndexOf("/");
        return slashIndex > 0 ? path.slice(0, slashIndex) : PYODIDE_PROJECT_ROOT;
    }

    function ensureDirectory(fs, path) {
        if (!path || fs.analyzePath(path).exists) {
            return;
        }
        if (typeof fs.mkdirTree === "function") {
            fs.mkdirTree(path);
            return;
        }
        const parent = getParentPath(path);
        if (parent && parent !== path) {
            ensureDirectory(fs, parent);
        }
        if (!fs.analyzePath(path).exists) {
            fs.mkdir(path);
        }
    }

    function removeDirectoryContents(fs, path) {
        if (!fs.analyzePath(path).exists) {
            return;
        }
        fs.readdir(path).forEach(name => {
            if (name === "." || name === "..") {
                return;
            }
            const childPath = `${path}/${name}`;
            const stat = fs.lstat(childPath);
            if (fs.isDir(stat.mode)) {
                removeDirectoryContents(fs, childPath);
                fs.rmdir(childPath);
            } else {
                fs.unlink(childPath);
            }
        });
    }

    function dataUrlToBytes(dataUrl) {
        const rawValue = String(dataUrl || "");
        const commaIndex = rawValue.indexOf(",");
        if (commaIndex < 0) {
            return new Uint8Array();
        }
        const meta = rawValue.slice(0, commaIndex).toLowerCase();
        const payload = rawValue.slice(commaIndex + 1);
        const binary = meta.includes(";base64") ? atob(payload) : decodeURIComponent(payload);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    async function getAssetBytes(assetFile) {
        if (assetFile.data_base64) {
            return dataUrlToBytes(assetFile.data_base64);
        }
        const source = typeof resolveAssetPreviewSource === "function"
            ? resolveAssetPreviewSource(assetFile)
            : (assetFile.url || "");
        if (!source) {
            return null;
        }
        const response = await fetch(source, {credentials: "same-origin"});
        if (!response.ok) {
            return null;
        }
        return new Uint8Array(await response.arrayBuffer());
    }

    async function writeProjectFile(fs, file) {
        const targetPath = toPyodideProjectPath(file && file.path);
        if (!targetPath) {
            return;
        }
        ensureDirectory(fs, getParentPath(targetPath));
        if (file.kind === "asset") {
            const bytes = await getAssetBytes(file);
            if (bytes) {
                fs.writeFile(targetPath, bytes);
            }
            return;
        }
        fs.writeFile(targetPath, String(file.content || ""), {encoding: "utf8"});
    }

    async function prepareEditorPyodideRunContext() {
        const fs = getPyodideFs();
        if (!fs) {
            return {
                code: window.editor ? window.editor.getValue() : "",
                filename: "<codemark-editor>",
                mainDir: "",
                projectRoot: ""
            };
        }

        if (typeof createProjectFileFromEditorInput === "function") {
            createProjectFileFromEditorInput();
        }
        if (typeof syncActiveEditorToProject === "function") {
            syncActiveEditorToProject();
        }

        ensureDirectory(fs, PYODIDE_PROJECT_ROOT);
        removeDirectoryContents(fs, PYODIDE_PROJECT_ROOT);

        const folders = Array.isArray(window.projectFolders) ? window.projectFolders : projectFolders;
        for (const folderPath of folders || []) {
            const targetPath = toPyodideProjectPath(folderPath);
            if (targetPath) {
                ensureDirectory(fs, targetPath);
            }
        }

        const files = Array.isArray(window.projectFiles) ? window.projectFiles : projectFiles;
        for (const file of files || []) {
            await writeProjectFile(fs, file);
        }

        const active = typeof getActiveProjectFile === "function" ? getActiveProjectFile() : null;
        const filename = normalizeProjectRunPath(active && active.path) || "code.py";
        const mainDir = filename.includes("/") ? filename.slice(0, filename.lastIndexOf("/")) : "";
        fs.chdir(PYODIDE_PROJECT_ROOT);

        return {
            code: active && active.kind === "text" ? String(active.content || "") : (window.editor ? window.editor.getValue() : ""),
            filename: filename,
            mainDir: mainDir,
            projectRoot: PYODIDE_PROJECT_ROOT
        };
    }

    window.prepareEditorPyodideRunContext = prepareEditorPyodideRunContext;
})();
