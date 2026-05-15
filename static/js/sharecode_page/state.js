/* Sharecode state, constants, and server/static path configuration. */
window.addEventListener("pageshow", function (event) {
    if (event.persisted || (typeof window.performance !== "undefined" && window.performance.navigation.type === 2)) {
        window.location.reload();
    }
});

const SHARECODE_DRAFT_CACHE_KEY = "codemark:sharecode:draft:v2";
const SHARECODE_SIDEBAR_WIDTH_CACHE_KEY = "codemark:sharecode:sidebar-width:v1";
const SHARECODE_DRAFT_SAVE_DEBOUNCE_MS = 300;
const SHARECODE_DEFAULT_LANG = "python";
const SHARECODE_DEFAULT_THEME = "monokai";
const SHARE_VIEW_SOURCE = "source";
const SHARE_VIEW_PREVIEW = "preview";
const SHARE_VIEW_SPLIT = "split";
const SHARECODE_LINE_HIGHLIGHT_CLASS = "codemark-line-highlight";
const SHARECODE_LINE_HIGHLIGHT_GUTTER_CLASS = "codemark-line-highlight-gutter";
const SIDEBAR_DEFAULT_WIDTH = 236;
const SIDEBAR_MIN_WIDTH = 184;
const SIDEBAR_MAX_WIDTH = 520;
const LANGUAGE_TO_EXTENSION = {
    python: "py",
    javascript: "js",
    c_cpp: "cpp",
    java: "java",
    php: "php",
    ruby: "rb",
    golang: "go",
    html: "html",
    css: "css",
    markdown: "md"
};
const TEXT_EXTENSIONS = new Set([
    "py", "js", "ts", "tsx", "jsx", "java", "cpp", "cc", "c", "h", "hpp",
    "php", "rb", "go", "html", "htm", "css", "scss", "less", "md", "txt", "json",
    "yaml", "yml", "xml", "sh", "ini", "toml", "sql", "rs", "swift", "kt", "dart"
]);
const SHARECODE_STATIC_PATHS = window.SHARECODE_STATIC_PATHS || {};
const VSCODE_ICONS_BASE_PATH = SHARECODE_STATIC_PATHS.vscodeIconsBasePath || "/static/vendor/vscode-icons/svg/";
const VSCODE_ICON_NAME_SET = new Set(window.CODEMARK_VSCODE_ICON_NAMES || []);
const VSCODE_FILE_EXTENSION_ICON_ALIASES = {
    "7z": "file-type-zip",
    bash: "file-type-shell",
    bmp: "file-type-image",
    cjs: "file-type-js",
    clj: "file-type-clojure",
    cljc: "file-type-clojure",
    cljs: "file-type-clojurescript",
    cmd: "file-type-bat",
    cc: "file-type-cpp",
    cs: "file-type-csharp",
    cxx: "file-type-cpp",
    "d.ts": "file-type-typescriptdef",
    dart: "file-type-dartlang",
    eot: "file-type-font",
    erl: "file-type-erlang",
    ex: "file-type-elixir",
    exs: "file-type-elixir",
    fish: "file-type-shell",
    flac: "file-type-audio",
    fs: "file-type-fsharp",
    fsi: "file-type-fsharp",
    fsx: "file-type-fsharp",
    gif: "file-type-image",
    gz: "file-type-zip",
    h: "file-type-cheader",
    hcl: "file-type-terraform",
    hpp: "file-type-cppheader",
    hrl: "file-type-erlang",
    htm: "file-type-html",
    hxx: "file-type-cppheader",
    ipynb: "file-type-jupyter",
    jpeg: "file-type-image",
    jpg: "file-type-image",
    jsx: "file-type-reactjs",
    kt: "file-type-kotlin",
    kts: "file-type-kotlin",
    m4a: "file-type-audio",
    markdown: "file-type-markdown",
    md: "file-type-markdown",
    mjs: "file-type-js",
    mkv: "file-type-video",
    mov: "file-type-video",
    mp3: "file-type-audio",
    mp4: "file-type-video",
    ogg: "file-type-audio",
    otf: "file-type-font",
    pdf: "file-type-pdf2",
    png: "file-type-image",
    proto: "file-type-protobuf",
    py: "file-type-python",
    pyi: "file-type-python",
    ps1: "file-type-powershell",
    psd1: "file-type-powershell-psd",
    psm1: "file-type-powershell-psm",
    rar: "file-type-zip",
    rb: "file-type-ruby",
    rs: "file-type-rust",
    sass: "file-type-sass",
    scss: "file-type-scss",
    sh: "file-type-shell",
    sqlite3: "file-type-sqlite",
    svgz: "file-type-svg",
    text: "file-type-text",
    tar: "file-type-zip",
    tgz: "file-type-zip",
    txt: "file-type-text",
    ts: "file-type-typescript",
    tsx: "file-type-reactts",
    ttf: "file-type-font",
    wav: "file-type-audio",
    webm: "file-type-video",
    woff: "file-type-font",
    woff2: "file-type-font",
    yml: "file-type-yaml",
    zsh: "file-type-shell"
};
const VSCODE_FILE_NAME_ICON_ALIASES = {
    ".babelrc": "file-type-babel",
    ".dockerignore": "file-type-docker",
    ".editorconfig": "file-type-editorconfig",
    ".eslintignore": "file-type-eslint",
    ".eslintrc": "file-type-eslint",
    ".gitattributes": "file-type-git",
    ".gitignore": "file-type-git",
    ".gitlab-ci.yml": "file-type-gitlab",
    ".npmignore": "file-type-npm",
    ".npmrc": "file-type-npm",
    ".prettierignore": "file-type-prettier",
    ".prettierrc": "file-type-prettier",
    ".stylelintrc": "file-type-stylelint",
    ".yarnrc": "file-type-yarn",
    "babel.config.js": "file-type-babel",
    "bun.lockb": "file-type-bun",
    "cmakelists.txt": "file-type-cmake",
    "docker-compose.yaml": "file-type-docker",
    "docker-compose.yml": "file-type-docker",
    dockerfile: "file-type-docker",
    "eslint.config.js": "file-type-eslint",
    "eslint.config.mjs": "file-type-eslint",
    "eslint.config.ts": "file-type-eslint",
    gemfile: "file-type-bundler",
    "go.mod": "file-type-go",
    "go.sum": "file-type-go",
    gradle: "file-type-gradle",
    "jsconfig.json": "file-type-jsconfig",
    license: "file-type-license",
    makefile: "file-type-gnu",
    "package-lock.json": "file-type-npm",
    "package.json": "file-type-npm",
    "pnpm-lock.yaml": "file-type-pnpm",
    "postcss.config.js": "file-type-postcss",
    "pyproject.toml": "file-type-python",
    rakefile: "file-type-ruby",
    readme: "file-type-markdown",
    "readme.md": "file-type-markdown",
    "requirements.txt": "file-type-python",
    "rust-toolchain": "file-type-rust-toolchain",
    "tailwind.config.js": "file-type-tailwind",
    "tailwind.config.ts": "file-type-tailwind",
    "tsconfig.json": "file-type-tsconfig",
    "vite.config.js": "file-type-vite",
    "vite.config.mjs": "file-type-vite",
    "vite.config.ts": "file-type-vite",
    "vitest.config.js": "file-type-vitest",
    "vitest.config.ts": "file-type-vitest",
    "webpack.config.js": "file-type-webpack",
    "webpack.config.ts": "file-type-webpack",
    "yarn.lock": "file-type-yarn"
};
const VSCODE_CONFIG_STEM_ICON_ALIASES = {
    babel: "file-type-babel",
    biome: "file-type-biome",
    docker: "file-type-docker",
    eslint: "file-type-eslint",
    jest: "file-type-jest",
    next: "file-type-next",
    nuxt: "file-type-nuxt",
    postcss: "file-type-postcss",
    prettier: "file-type-prettier",
    prisma: "file-type-prisma",
    rollup: "file-type-rollup",
    stylelint: "file-type-stylelint",
    svelte: "file-type-svelte",
    tailwind: "file-type-tailwind",
    tsup: "file-type-tsup",
    vite: "file-type-vite",
    vitest: "file-type-vitest",
    vue: "file-type-vue",
    webpack: "file-type-webpack"
};
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "avif"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "flac", "aac", "m4a"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "mkv", "avi"]);
const ARCHIVE_EXTENSIONS = new Set(["zip", "rar", "7z", "tar", "gz", "tgz"]);

let sharecodeDraftSaveTimer = null;
let projectFiles = [];
let projectFolders = [];
let activeFilePath = "";
let collapsedFolderPaths = new Set();
let projectTreeSelectionVisible = false;
let selectedProjectFilePaths = new Set();
let selectedProjectFolderPaths = new Set();
let sidebarOpen = false;
let editorReady = false;
let projectTreeContextTarget = null;
let projectTreeSelectedFolderPath = "";
let pendingProjectUploadTargetPath = "";
let projectUploadDialogTargetPath = "";
let projectTreeRenameTarget = null;
let projectTreeInlineDeleteTarget = null;
let projectTreeCreateTarget = null;
let pendingProjectConfirmAction = null;
let projectNoticeTimer = null;
let sidebarResizeState = null;
let sidebarResizeFrame = null;
let projectTreeDragState = null;
let projectTreeCurrentDropTarget = null;
let projectExternalUploadTargetElement = null;
let shareViewMode = SHARE_VIEW_SOURCE;
let htmlPreviewRefreshTimer = null;
let htmlPreviewVisibleRefreshRequestId = 0;
let htmlPreviewFrameWriteToken = 0;
let projectArchiveDownloadBusy = false;
let projectUploadProgressState = null;
let projectUploadProgressRenderFrame = null;
let projectUploadProgressAutoCloseTimer = null;
let activeLineHighlightMarkers = [];
