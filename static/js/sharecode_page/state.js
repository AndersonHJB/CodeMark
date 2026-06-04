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
const SHARECODE_LANGUAGES = [
    {value: "python", label: "Python", extension: "py", aceMode: "python", highlight: "python", aliases: ["py", "pyw", "pyi", "python3"], extensions: ["py", "pyw", "pyi"]},
    {value: "javascript", label: "JavaScript", extension: "js", aceMode: "javascript", highlight: "javascript", aliases: ["js", "mjs", "cjs", "node"], extensions: ["js", "mjs", "cjs"]},
    {value: "typescript", label: "TypeScript", extension: "ts", aceMode: "typescript", highlight: "typescript", aliases: ["ts", "mts", "cts"], extensions: ["ts", "mts", "cts"]},
    {value: "jsx", label: "JSX", extension: "jsx", aceMode: "jsx", highlight: "javascript", aliases: ["react"], extensions: ["jsx"]},
    {value: "tsx", label: "TSX", extension: "tsx", aceMode: "tsx", highlight: "typescript", aliases: ["react-ts", "reacttsx"], extensions: ["tsx"]},
    {value: "c_cpp", label: "C/C++", extension: "cpp", aceMode: "c_cpp", highlight: "cpp", aliases: ["c", "cc", "cpp", "cxx", "h", "hh", "hpp", "hxx", "c++"], extensions: ["c", "cc", "cpp", "cxx", "h", "hh", "hpp", "hxx", "ino"]},
    {value: "java", label: "Java", extension: "java", aceMode: "java", highlight: "java", aliases: ["jav"], extensions: ["java"]},
    {value: "php", label: "PHP", extension: "php", aceMode: "php", highlight: "php", aliases: ["phtml"], extensions: ["php", "inc", "phtml", "phps", "blade.php"]},
    {value: "ruby", label: "Ruby", extension: "rb", aceMode: "ruby", highlight: "ruby", aliases: ["rb", "rake"], extensions: ["rb", "ru", "gemspec", "rake"]},
    {value: "golang", label: "Go", extension: "go", aceMode: "golang", highlight: "go", aliases: ["go", "golang"], extensions: ["go"]},
    {value: "html", label: "HTML", extension: "html", aceMode: "html", highlight: "xml", aliases: ["htm", "xhtml"], extensions: ["html", "htm", "xhtml"]},
    {value: "css", label: "CSS", extension: "css", aceMode: "css", highlight: "css", aliases: [], extensions: ["css"]},
    {value: "scss", label: "SCSS", extension: "scss", aceMode: "scss", highlight: "scss", aliases: [], extensions: ["scss"]},
    {value: "sass", label: "Sass", extension: "sass", aceMode: "sass", highlight: "scss", aliases: [], extensions: ["sass"]},
    {value: "less", label: "Less", extension: "less", aceMode: "less", highlight: "less", aliases: [], extensions: ["less"]},
    {value: "markdown", label: "Markdown", extension: "md", aceMode: "markdown", highlight: "markdown", aliases: ["md", "mdown", "mkd", "mkdn"], extensions: ["md", "markdown", "mdown", "mkd", "mkdn"]},
    {value: "json", label: "JSON", extension: "json", aceMode: "json", highlight: "json", aliases: ["jsonc", "json5"], extensions: ["json", "jsonc", "json5"]},
    {value: "yaml", label: "YAML", extension: "yml", aceMode: "yaml", highlight: "yaml", aliases: ["yml"], extensions: ["yaml", "yml"]},
    {value: "xml", label: "XML", extension: "xml", aceMode: "xml", highlight: "xml", aliases: ["xsd", "xsl", "xslt"], extensions: ["xml", "xsd", "xsl", "xslt", "rdf", "rss", "wsdl"]},
    {value: "sql", label: "SQL", extension: "sql", aceMode: "sql", highlight: "sql", aliases: ["mysql", "pgsql", "postgres", "postgresql"], extensions: ["sql", "mysql", "pgsql"]},
    {value: "sh", label: "Shell/Bash", extension: "sh", aceMode: "sh", highlight: "shell", aliases: ["bash", "shell", "zsh", "fish", "ksh"], extensions: ["sh", "bash", "zsh", "fish", "ksh"]},
    {value: "csharp", label: "C#", extension: "cs", aceMode: "csharp", highlight: "csharp", aliases: ["cs", "c#"], extensions: ["cs", "csx"]},
    {value: "rust", label: "Rust", extension: "rs", aceMode: "rust", highlight: "rust", aliases: ["rs"], extensions: ["rs"]},
    {value: "swift", label: "Swift", extension: "swift", aceMode: "swift", highlight: "swift", aliases: [], extensions: ["swift"]},
    {value: "kotlin", label: "Kotlin", extension: "kt", aceMode: "kotlin", highlight: "kotlin", aliases: ["kt", "kts"], extensions: ["kt", "kts"]},
    {value: "dart", label: "Dart", extension: "dart", aceMode: "dart", highlight: "dart", aliases: [], extensions: ["dart"]},
    {value: "lua", label: "Lua", extension: "lua", aceMode: "lua", highlight: "lua", aliases: [], extensions: ["lua"]},
    {value: "r", label: "R", extension: "r", aceMode: "r", highlight: "r", aliases: ["rscript"], extensions: ["r", "rmd"]},
    {value: "perl", label: "Perl", extension: "pl", aceMode: "perl", highlight: "perl", aliases: ["pl", "pm"], extensions: ["pl", "pm", "pod", "t"]},
    {value: "scala", label: "Scala", extension: "scala", aceMode: "scala", highlight: "scala", aliases: [], extensions: ["scala", "sbt"]},
    {value: "groovy", label: "Groovy", extension: "groovy", aceMode: "groovy", highlight: "groovy", aliases: ["gradle"], extensions: ["groovy", "gradle"]},
    {value: "haskell", label: "Haskell", extension: "hs", aceMode: "haskell", highlight: "haskell", aliases: ["hs"], extensions: ["hs", "lhs"]},
    {value: "clojure", label: "Clojure", extension: "clj", aceMode: "clojure", highlight: "clojure", aliases: ["clj", "cljs", "cljc", "edn"], extensions: ["clj", "cljs", "cljc", "edn"]},
    {value: "elixir", label: "Elixir", extension: "ex", aceMode: "elixir", highlight: "elixir", aliases: ["ex", "exs"], extensions: ["ex", "exs"]},
    {value: "erlang", label: "Erlang", extension: "erl", aceMode: "erlang", highlight: "erlang", aliases: ["erl", "hrl"], extensions: ["erl", "hrl"]},
    {value: "julia", label: "Julia", extension: "jl", aceMode: "julia", highlight: "julia", aliases: ["jl"], extensions: ["jl"]},
    {value: "matlab", label: "MATLAB", extension: "m", aceMode: "matlab", highlight: "matlab", aliases: [], extensions: ["m"]},
    {value: "objectivec", label: "Objective-C", extension: "mm", aceMode: "objectivec", highlight: "objectivec", aliases: ["objc", "obj-c"], extensions: ["mm"]},
    {value: "powershell", label: "PowerShell", extension: "ps1", aceMode: "powershell", highlight: "powershell", aliases: ["ps1", "psm1", "psd1"], extensions: ["ps1", "psm1", "psd1"]},
    {value: "dockerfile", label: "Dockerfile", extension: "Dockerfile", aceMode: "dockerfile", highlight: "dockerfile", aliases: ["docker"], extensions: ["dockerfile"], filenames: ["Dockerfile"]},
    {value: "makefile", label: "Makefile", extension: "mk", aceMode: "makefile", highlight: "makefile", aliases: ["make"], extensions: ["mk", "mak", "make"], filenames: ["Makefile", "GNUmakefile"]},
    {value: "ini", label: "INI", extension: "ini", aceMode: "ini", highlight: "ini", aliases: ["cfg", "conf"], extensions: ["ini", "cfg", "prefs"]},
    {value: "toml", label: "TOML", extension: "toml", aceMode: "toml", highlight: "toml", aliases: [], extensions: ["toml"]},
    {value: "diff", label: "Diff/Patch", extension: "diff", aceMode: "diff", highlight: "diff", aliases: ["patch"], extensions: ["diff", "patch"]},
    {value: "graphql", label: "GraphQL", extension: "gql", aceMode: "graphqlschema", highlight: "graphql", aliases: ["gql", "graphqls"], extensions: ["gql", "graphql", "graphqls"]},
    {value: "terraform", label: "Terraform", extension: "tf", aceMode: "terraform", highlight: "hcl", aliases: ["tf", "tfvars", "hcl"], extensions: ["tf", "tfvars", "hcl"]},
    {value: "protobuf", label: "Protocol Buffers", extension: "proto", aceMode: "protobuf", highlight: "protobuf", aliases: ["proto"], extensions: ["proto"]},
    {value: "nginx", label: "Nginx", extension: "nginx", aceMode: "nginx", highlight: "nginx", aliases: [], extensions: ["nginx"]},
    {value: "vue", label: "Vue", extension: "vue", aceMode: "html", highlight: "xml", aliases: [], extensions: ["vue"]},
    {value: "plaintext", label: "Plain Text", extension: "txt", aceMode: "plain_text", highlight: "plaintext", aliases: ["txt", "text", "plain"], extensions: ["txt", "text", "log"]}
];
const SHARECODE_LANGUAGE_CONFIG = SHARECODE_LANGUAGES.reduce((map, language) => {
    map[language.value] = language;
    return map;
}, {});
const SHARECODE_LANGUAGE_VALUES = new Set(SHARECODE_LANGUAGES.map(language => language.value));
const LANGUAGE_TO_EXTENSION = SHARECODE_LANGUAGES.reduce((map, language) => {
    map[language.value] = language.extension;
    return map;
}, {});
const LANGUAGE_ALIASES = SHARECODE_LANGUAGES.reduce((map, language) => {
    map[language.value] = language.value;
    (language.aliases || []).forEach(alias => {
        map[String(alias).toLowerCase()] = language.value;
    });
    return map;
}, {});
const EXTENSION_LANGUAGE_MAP = SHARECODE_LANGUAGES.reduce((map, language) => {
    (language.extensions || [language.extension]).forEach(extension => {
        const normalized = String(extension || "").toLowerCase();
        if (normalized && normalized.indexOf(".") === -1 && !map[normalized]) {
            map[normalized] = language.value;
        }
    });
    return map;
}, {});
const MULTI_EXTENSION_LANGUAGE_MAP = SHARECODE_LANGUAGES.reduce((map, language) => {
    (language.extensions || []).forEach(extension => {
        const normalized = String(extension || "").toLowerCase();
        if (normalized.indexOf(".") !== -1) {
            map[normalized] = language.value;
        }
    });
    return map;
}, {});
const FILENAME_LANGUAGE_MAP = SHARECODE_LANGUAGES.reduce((map, language) => {
    (language.filenames || []).forEach(filename => {
        map[String(filename || "").toLowerCase()] = language.value;
    });
    return map;
}, {});
const TEXT_EXTENSIONS = new Set([
    ...Object.keys(EXTENSION_LANGUAGE_MAP),
    "env", "gitignore", "npmrc", "editorconfig", "properties", "lock"
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
const IMAGE_EXTENSIONS = new Set([
    "png", "apng",
    "jpg", "jpeg", "jpe", "jfif", "pjpeg", "pjp",
    "gif", "webp", "bmp", "dib",
    "svg", "svgz",
    "ico", "cur",
    "avif",
    "tif", "tiff",
    "heic", "heif",
    "jp2", "j2k", "jpf", "jpx"
]);
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
