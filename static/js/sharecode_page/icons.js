/* Sharecode file and folder icon resolution. */
function getPathExtension(path) {
    const safePath = safeNormalizePath(path).toLowerCase();
    const filename = safePath.split("/").pop() || "";
    const dotIndex = filename.lastIndexOf(".");
    if (dotIndex <= 0 || dotIndex === filename.length - 1) {
        return "";
    }
    return filename.slice(dotIndex + 1);
}

function createBootstrapIcon(iconName, className, label) {
    const icon = document.createElement("i");
    icon.className = ["bi", iconName, className].filter(Boolean).join(" ");
    icon.setAttribute("aria-hidden", "true");
    if (label) {
        icon.title = label;
    }
    return icon;
}

function hasVscodeIcon(iconId) {
    return !!(iconId && VSCODE_ICON_NAME_SET.has(iconId));
}

function getVscodeIconUrl(iconId) {
    const safeIconId = hasVscodeIcon(iconId) ? iconId : "default-file";
    return VSCODE_ICONS_BASE_PATH + encodeURIComponent(safeIconId) + ".svg";
}

function pickVscodeIcon(candidates, fallbackIconId) {
    for (const iconId of candidates) {
        if (hasVscodeIcon(iconId)) {
            return iconId;
        }
    }
    return hasVscodeIcon(fallbackIconId) ? fallbackIconId : "default-file";
}

function normalizeVscodeIconToken(rawValue) {
    return String(rawValue || "")
        .toLowerCase()
        .trim()
        .replace(/^\.+/, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function getProjectPathBaseName(path) {
    const safePath = safeNormalizePath(path);
    if (!safePath) {
        return "";
    }
    const parts = safePath.split("/");
    return parts[parts.length - 1] || "";
}

function getCompoundFileExtension(filename) {
    const lowerName = String(filename || "").toLowerCase();
    if (lowerName.endsWith(".d.ts")) {
        return "d.ts";
    }
    return getPathExtension(lowerName);
}

function getFileTypeIconByToken(token) {
    const safeToken = normalizeVscodeIconToken(token);
    return safeToken ? `file-type-${safeToken}` : "";
}

function getFolderTypeIconByToken(token, isCollapsed) {
    const safeToken = normalizeVscodeIconToken(token);
    if (!safeToken) {
        return "";
    }
    return `folder-type-${safeToken}${isCollapsed ? "" : "-opened"}`;
}

function getFileNameAliasIconId(filename) {
    const lowerName = String(filename || "").toLowerCase();
    if (VSCODE_FILE_NAME_ICON_ALIASES[lowerName]) {
        return VSCODE_FILE_NAME_ICON_ALIASES[lowerName];
    }
    const dotConfigPrefixes = [".babelrc", ".env", ".eslintrc", ".prettierrc", ".stylelintrc"];
    const dotConfigIconIds = {
        ".babelrc": "file-type-babel",
        ".env": "file-type-dotenv",
        ".eslintrc": "file-type-eslint",
        ".prettierrc": "file-type-prettier",
        ".stylelintrc": "file-type-stylelint"
    };
    for (const prefix of dotConfigPrefixes) {
        if (lowerName === prefix || lowerName.startsWith(prefix + ".")) {
            return dotConfigIconIds[prefix];
        }
    }
    return "";
}

function getConfigStemIconId(filename) {
    const lowerName = String(filename || "").toLowerCase().replace(/^\.+/, "");
    if (!lowerName.includes(".config.") && !lowerName.endsWith(".config")) {
        return "";
    }
    const stem = lowerName.split(".")[0];
    return VSCODE_CONFIG_STEM_ICON_ALIASES[stem] || "";
}

function getGenericAssetIconId(file, extension) {
    const mimeType = String((file && file.mime_type) || "").toLowerCase();
    if (mimeType.startsWith("image/") || IMAGE_EXTENSIONS.has(extension)) {
        return "file-type-image";
    }
    if (mimeType.startsWith("audio/") || AUDIO_EXTENSIONS.has(extension)) {
        return "file-type-audio";
    }
    if (mimeType.startsWith("video/") || VIDEO_EXTENSIONS.has(extension)) {
        return "file-type-video";
    }
    if (extension === "pdf" || mimeType === "application/pdf") {
        return "file-type-pdf2";
    }
    if (ARCHIVE_EXTENSIONS.has(extension) || mimeType.includes("zip") || mimeType.includes("compressed")) {
        return "file-type-zip";
    }
    return "";
}

function getTreeFileIconId(file) {
    const filename = getProjectPathBaseName(file && file.path);
    const lowerName = filename.toLowerCase();
    const extension = getCompoundFileExtension(lowerName);
    const stem = extension ? lowerName.slice(0, Math.max(0, lowerName.length - extension.length - 1)) : lowerName;
    const aliasIconId = getFileNameAliasIconId(lowerName);
    const configIconId = getConfigStemIconId(lowerName);
    const extensionAliasIconId = VSCODE_FILE_EXTENSION_ICON_ALIASES[extension] || "";
    const genericAssetIconId = file && file.kind === "asset" ? getGenericAssetIconId(file, extension) : "";

    return pickVscodeIcon([
        aliasIconId,
        configIconId,
        getFileTypeIconByToken(lowerName),
        getFileTypeIconByToken(stem),
        extensionAliasIconId,
        getFileTypeIconByToken(extension),
        genericAssetIconId
    ], "default-file");
}

function createVscodeTreeIcon(iconId, className, label) {
    const icon = document.createElement("span");
    icon.className = className;
    icon.setAttribute("aria-hidden", "true");
    if (label) {
        icon.title = label;
    }
    const image = document.createElement("img");
    image.className = "tree-vscode-icon-image";
    image.alt = "";
    image.decoding = "async";
    image.loading = "lazy";
    image.src = getVscodeIconUrl(iconId);
    image.addEventListener("error", function () {
        if (iconId !== "default-file") {
            image.src = getVscodeIconUrl("default-file");
        }
    }, {once: true});
    icon.appendChild(image);
    return icon;
}

function createTreeFileIcon(file) {
    return createVscodeTreeIcon(getTreeFileIconId(file || {}), "tree-file-icon", "File");
}

function getTreeFolderIconId(folderPath, isCollapsed) {
    const folderName = getProjectPathName(folderPath);
    const folderAliases = {
        "__tests__": "test",
        ".github": "github",
        ".vscode": "vscode",
        assets: "asset",
        build: "dist",
        components: "component",
        configs: "config",
        controllers: "controller",
        fonts: "fonts",
        img: "images",
        includes: "include",
        lib: "library",
        libs: "library",
        scripts: "script",
        sources: "src",
        styles: "style",
        tests: "test",
        typings: "typings"
    };
    const normalizedName = normalizeVscodeIconToken(folderName);
    const aliasName = folderAliases[folderName] || folderAliases[normalizedName] || "";
    return pickVscodeIcon([
        getFolderTypeIconByToken(aliasName, isCollapsed),
        getFolderTypeIconByToken(normalizedName, isCollapsed)
    ], isCollapsed ? "default-folder" : "default-folder-opened");
}

function createTreeFolderIcon(isCollapsed, folderPath) {
    return createVscodeTreeIcon(
        getTreeFolderIconId(folderPath, isCollapsed),
        "tree-folder-icon",
        isCollapsed ? "Folder" : "Open folder"
    );
}
