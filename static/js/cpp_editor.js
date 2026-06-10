(function () {
    const DEFAULT_CPP_CODE = [
        "#include <iostream>",
        "#include <string>",
        "using namespace std;",
        "",
        "int main() {",
        "    cout << \"Hello from CodeMark C++!\" << endl;",
        "    return 0;",
        "}",
        ""
    ].join("\n");
    const DRAFT_CACHE_KEY = "codemark:cpp-editor:draft:v1";
    const DRAFT_SAVE_DEBOUNCE_MS = 300;
    const DESKTOP_CONSOLE_AUTO_COLLAPSE_BREAKPOINT = 1260;
    const DESKTOP_CONSOLE_DEFAULT_WIDTH = 420;
    const DESKTOP_CONSOLE_MIN_WIDTH = 300;
    const DESKTOP_EDITOR_MIN_WIDTH = 460;
    const SUPPORTED_THEMES = new Set([
        "monokai",
        "github",
        "tomorrow",
        "kuroir",
        "twilight",
        "vibrant_ink",
        "xcode",
        "textmate",
        "terminal",
        "solarized_dark",
        "solarized_light"
    ]);

    let editorDraftSaveTimer = null;
    let isCppRunning = false;
    let desktopConsoleWrapped = false;
    let desktopConsoleCollapsedByAuto = false;
    let desktopConsoleManualOverride = false;
    let currentFilename = "main.cpp";

    function getConfig() {
        return window.CPP_EDITOR_CONFIG || {};
    }

    function getCookieValue(name) {
        const cookieText = document.cookie || "";
        const parts = cookieText.split(";").map(function (part) {
            return part.trim();
        });
        const prefix = name + "=";
        for (const part of parts) {
            if (part.indexOf(prefix) === 0) {
                return decodeURIComponent(part.slice(prefix.length));
            }
        }
        return "";
    }

    function getCsrfToken() {
        return getConfig().csrfToken || getCookieValue("csrftoken");
    }

    function normalizeTheme(theme, fallback = "monokai") {
        return SUPPORTED_THEMES.has(theme) ? theme : fallback;
    }

    function getCurrentThemeValue() {
        const selector = document.getElementById("theme-selector");
        return normalizeTheme(selector ? selector.value : server_pre_theme);
    }

    function applyEditorTheme(theme) {
        if (!window.editor) {
            return;
        }
        window.editor.setTheme("ace/theme/" + normalizeTheme(theme));
    }

    function loadDraftCache() {
        try {
            const raw = localStorage.getItem(DRAFT_CACHE_KEY);
            if (!raw) {
                return null;
            }
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? parsed : null;
        } catch (e) {
            return null;
        }
    }

    function saveDraftCache() {
        if (!window.editor) {
            return;
        }
        try {
            localStorage.setItem(DRAFT_CACHE_KEY, JSON.stringify({
                code: window.editor.getValue(),
                stdin: getStdinValue(),
                filename: currentFilename,
                theme: getCurrentThemeValue(),
                updatedAt: Date.now()
            }));
        } catch (e) {
        }
    }

    function scheduleDraftCacheSave() {
        if (editorDraftSaveTimer) {
            clearTimeout(editorDraftSaveTimer);
        }
        editorDraftSaveTimer = setTimeout(saveDraftCache, DRAFT_SAVE_DEBOUNCE_MS);
    }

    function resolveInitialCode(defaultCode) {
        const isSharedPage = window.location.pathname.indexOf("/share/") === 0;
        if (isSharedPage) {
            return typeof server_pre_code === "string" ? server_pre_code : defaultCode;
        }
        if (typeof server_pre_code === "string" && server_pre_code) {
            return server_pre_code;
        }
        const cache = loadDraftCache();
        if (cache && typeof cache.code === "string") {
            if (cache.filename) {
                currentFilename = cache.filename;
            }
            return cache.code;
        }
        return defaultCode;
    }

    function resolveInitialStdin() {
        const isSharedPage = window.location.pathname.indexOf("/share/") === 0;
        if (isSharedPage) {
            return "";
        }
        const cache = loadDraftCache();
        return cache && typeof cache.stdin === "string" ? cache.stdin : "";
    }

    function getStdinValue() {
        const stdinInput = document.getElementById("stdin-input");
        return stdinInput ? stdinInput.value : "";
    }

    function getDesktopConsoleElement() {
        return document.getElementById("console");
    }

    function getMobileConsoleElement() {
        return document.getElementById("mobile-console-output");
    }

    function getOutputElement() {
        return getDesktopConsoleElement() || getMobileConsoleElement();
    }

    function scrollOutputToBottom() {
        const output = getOutputElement();
        if (output) {
            output.scrollTop = output.scrollHeight;
        }
    }

    function clearOutput() {
        const output = getOutputElement();
        if (output) {
            output.textContent = "";
        }
    }

    function appendOutputText(text) {
        const output = getOutputElement();
        if (!output) {
            return;
        }
        output.appendChild(document.createTextNode(String(text ?? "")));
        scrollOutputToBottom();
    }

    function setRunningState(running) {
        isCppRunning = running;
        document.querySelectorAll(".cpp-run-btn").forEach(function (button) {
            button.disabled = running;
            button.textContent = running ? "running" : "> run";
        });
    }

    function getEditorMainRow() {
        return document.getElementById("editor-main-row");
    }

    function isConsolePanelCollapsed() {
        const layoutRow = getEditorMainRow();
        return !!layoutRow && layoutRow.classList.contains("console-collapsed");
    }

    function setConsoleWidth(widthPx) {
        const layoutRow = getEditorMainRow();
        if (!layoutRow || !Number.isFinite(widthPx)) {
            return;
        }
        layoutRow.style.setProperty("--desktop-console-width", `${Math.round(widthPx)}px`);
    }

    function refreshConsoleWrapToggleLabel() {
        const wrapButton = document.getElementById("console-wrap-toggle");
        if (!wrapButton) {
            return;
        }
        wrapButton.textContent = desktopConsoleWrapped ? "自动换行：开" : "自动换行：关";
        wrapButton.setAttribute("aria-pressed", desktopConsoleWrapped ? "true" : "false");
    }

    function setConsoleWrapMode(enabled) {
        desktopConsoleWrapped = !!enabled;
        const consoleElement = getDesktopConsoleElement();
        if (consoleElement) {
            consoleElement.classList.toggle("console-wrap-enabled", desktopConsoleWrapped);
        }
        refreshConsoleWrapToggleLabel();
    }

    function setConsolePanelCollapsed(collapsed, options = {}) {
        const layoutRow = getEditorMainRow();
        if (!layoutRow) {
            return;
        }
        const isCollapsed = !!collapsed;
        layoutRow.classList.toggle("console-collapsed", isCollapsed);

        const expandTrigger = document.getElementById("console-expand-trigger");
        if (expandTrigger) {
            expandTrigger.classList.toggle("show", isCollapsed);
        }

        if (options.auto) {
            desktopConsoleCollapsedByAuto = isCollapsed;
        } else if (!isCollapsed) {
            desktopConsoleCollapsedByAuto = false;
        }

        if (window.editor && typeof window.editor.resize === "function") {
            window.requestAnimationFrame(function () {
                window.editor.resize();
            });
        }
    }

    function collapseConsolePanel(options = {}) {
        if (!options.auto) {
            desktopConsoleManualOverride = true;
        }
        setConsolePanelCollapsed(true, options);
    }

    function expandConsolePanel(options = {}) {
        if (!options.auto) {
            desktopConsoleManualOverride = true;
        }
        setConsolePanelCollapsed(false, options);
    }

    function toggleConsoleWrap() {
        setConsoleWrapMode(!desktopConsoleWrapped);
        scrollOutputToBottom();
    }

    function handleDesktopConsoleAutoCollapse() {
        if (desktopConsoleManualOverride) {
            return;
        }
        const shouldAutoCollapse = window.innerWidth <= DESKTOP_CONSOLE_AUTO_COLLAPSE_BREAKPOINT;
        if (shouldAutoCollapse && !isConsolePanelCollapsed()) {
            collapseConsolePanel({auto: true});
            return;
        }
        if (!shouldAutoCollapse && isConsolePanelCollapsed() && desktopConsoleCollapsedByAuto) {
            expandConsolePanel({auto: true});
        }
    }

    function initDesktopConsoleResizer() {
        const resizer = document.getElementById("console-resizer");
        const consoleColumn = document.getElementById("console-column");
        if (!resizer || !consoleColumn) {
            return;
        }

        resizer.addEventListener("mousedown", function (event) {
            if (isConsolePanelCollapsed()) {
                return;
            }
            event.preventDefault();

            const startX = event.clientX;
            const startWidth = consoleColumn.getBoundingClientRect().width || DESKTOP_CONSOLE_DEFAULT_WIDTH;
            document.body.classList.add("console-resizing");

            function handleMouseMove(moveEvent) {
                const delta = startX - moveEvent.clientX;
                const maxWidth = Math.max(
                    DESKTOP_CONSOLE_MIN_WIDTH,
                    window.innerWidth - DESKTOP_EDITOR_MIN_WIDTH
                );
                const nextWidth = Math.min(
                    maxWidth,
                    Math.max(DESKTOP_CONSOLE_MIN_WIDTH, startWidth + delta)
                );
                setConsoleWidth(nextWidth);
                if (window.editor && typeof window.editor.resize === "function") {
                    window.editor.resize();
                }
            }

            function stopResize() {
                document.body.classList.remove("console-resizing");
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", stopResize);
            }

            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", stopResize);
        });
    }

    function initDesktopConsolePanel() {
        if (!getDesktopConsoleElement()) {
            return;
        }
        setConsoleWidth(DESKTOP_CONSOLE_DEFAULT_WIDTH);
        setConsoleWrapMode(false);
        handleDesktopConsoleAutoCollapse();
        initDesktopConsoleResizer();
        window.addEventListener("resize", handleDesktopConsoleAutoCollapse);
    }

    function showOutputPanelForRun() {
        const mobileConsole = document.getElementById("mobileConsole");
        if (mobileConsole) {
            mobileConsole.style.bottom = "0";
            return;
        }
        if (isConsolePanelCollapsed()) {
            setConsolePanelCollapsed(false, {auto: true});
        }
    }

    function renderRunResult(data) {
        const stdout = data && data.stdout ? String(data.stdout) : "";
        const stderr = data && data.stderr ? String(data.stderr) : "";
        const stage = data && data.stage ? data.stage : "run";

        if (stage === "environment" || stage === "validate") {
            appendOutputText(stderr || "运行环境不可用。\n");
            return;
        }

        if (stage === "compile") {
            if (stdout) {
                appendOutputText(stdout);
                if (!stdout.endsWith("\n")) {
                    appendOutputText("\n");
                }
            }
            appendOutputText(stderr || "编译失败。\n");
            if (data && data.timed_out) {
                appendOutputText("\n[编译超时]\n");
            }
            if (data && data.output_truncated) {
                appendOutputText("\n[输出已截断]\n");
            }
            return;
        }

        if (stdout) {
            appendOutputText(stdout);
            if (!stdout.endsWith("\n")) {
                appendOutputText("\n");
            }
        }
        if (stderr) {
            appendOutputText("[stderr]\n" + stderr);
            if (!stderr.endsWith("\n")) {
                appendOutputText("\n");
            }
        }
        if (!stdout && !stderr) {
            appendOutputText("[程序运行结束，无输出]\n");
        }
        if (data && data.timed_out) {
            appendOutputText("[运行超时，进程已终止]\n");
        } else if (data && typeof data.exit_code !== "undefined" && data.exit_code !== null) {
            appendOutputText(`[退出码: ${data.exit_code}]\n`);
        }
        if (data && data.output_truncated) {
            appendOutputText("[输出已截断]\n");
        }
    }

    async function runCppCode() {
        if (!window.editor || isCppRunning) {
            return;
        }
        showOutputPanelForRun();
        clearOutput();
        appendOutputText("Compiling and running C++...\n");
        setRunningState(true);
        try {
            const formData = new URLSearchParams();
            formData.set("code", window.editor.getValue());
            formData.set("stdin", getStdinValue());
            const response = await fetch(getConfig().runUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                    "X-CSRFToken": getCsrfToken()
                },
                body: formData.toString()
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            clearOutput();
            renderRunResult(data);
        } catch (error) {
            clearOutput();
            appendOutputText("C++ 运行请求失败：" + error + "\n");
        } finally {
            setRunningState(false);
        }
    }

    function initAceEditor() {
        const config = getConfig();
        ace.config.set("basePath", config.aceBasePath || "/static/js/ace/");
        window.editor = ace.edit("editor");
        const cache = loadDraftCache();
        const initialTheme = normalizeTheme(
            cache && cache.theme ? cache.theme : server_pre_theme,
            "monokai"
        );
        applyEditorTheme(initialTheme);
        window.editor.session.setMode("ace/mode/c_cpp");
        window.editor.setOptions({
            fontSize: config.isMobile ? "18pt" : "20pt",
            enableBasicAutocompletion: true,
            enableLiveAutocompletion: true,
            enableSnippets: true,
            scrollPastEnd: config.isMobile ? 1 : 0,
            autoScrollEditorIntoView: !!config.isMobile
        });
        if (config.isMobile) {
            window.editor.renderer.setScrollMargin(0, 300, 0, 0);
        }

        window.editor.commands.addCommand({
            name: "duplicateLine",
            bindKey: {win: "Ctrl-D", mac: "Command-D"},
            exec: function (aceEditor) {
                aceEditor.execCommand("copylinesdown");
            }
        });
        window.editor.commands.addCommand({
            name: "runCppCode",
            bindKey: {win: "Ctrl-B", mac: "Command-B"},
            exec: runCppCode
        });

        window.editor.setValue(resolveInitialCode(DEFAULT_CPP_CODE), -1);
        window.editor.session.on("change", scheduleDraftCacheSave);

        const stdinInput = document.getElementById("stdin-input");
        if (stdinInput) {
            stdinInput.value = resolveInitialStdin();
            stdinInput.addEventListener("input", scheduleDraftCacheSave);
        }
        saveDraftCache();
    }

    function initThemeSelector() {
        const selector = document.getElementById("theme-selector");
        if (!selector) {
            return;
        }
        const initialTheme = normalizeTheme(server_pre_theme);
        selector.value = initialTheme;
        if (window.$ && typeof $(".selectpicker").selectpicker === "function") {
            $(".selectpicker").selectpicker({
                style: "btn-dark",
                size: 10
            });
            $("#theme-selector").selectpicker("val", initialTheme);
            $("#theme-selector").on("changed.bs.select", function () {
                applyEditorTheme(this.value);
                scheduleDraftCacheSave();
            });
            return;
        }
        selector.addEventListener("change", function () {
            applyEditorTheme(selector.value);
            scheduleDraftCacheSave();
        });
    }

    function initFileInput() {
        const fileInput = document.getElementById("file-input");
        if (!fileInput) {
            return;
        }
        fileInput.addEventListener("change", function () {
            const file = fileInput.files && fileInput.files[0];
            if (!file) {
                return;
            }
            const reader = new FileReader();
            reader.onload = function () {
                currentFilename = file.name || "main.cpp";
                if (window.editor) {
                    window.editor.setValue(String(reader.result || ""), -1);
                    scheduleDraftCacheSave();
                }
                fileInput.value = "";
            };
            reader.readAsText(file);
        });
    }

    function performClick(elemId) {
        const elem = document.getElementById(elemId);
        if (elem) {
            elem.click();
        }
    }

    function save() {
        if (!window.editor) {
            return;
        }
        const filename = currentFilename || "main.cpp";
        const blob = new Blob([window.editor.getValue()], {type: "text/plain;charset=utf-8"});
        saveAs(blob, filename);
    }

    function pasteCode() {
        if (!navigator.clipboard || !navigator.clipboard.readText) {
            alert("浏览器不支持剪贴板 API。");
            return;
        }
        navigator.clipboard.readText().then(function (text) {
            if (text && text.trim() !== "") {
                window.editor.setValue(text, -1);
                scheduleDraftCacheSave();
            } else {
                alert("剪贴板为空或不支持读取。");
            }
        }).catch(function (err) {
            alert("无法读取剪贴板: " + err);
        });
        closeSidebar();
    }

    function home() {
        window.location.href = "/";
    }

    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).catch(function () {
                fallbackCopyText(text);
            });
        }
        fallbackCopyText(text);
        return Promise.resolve();
    }

    function fallbackCopyText(text) {
        const input = document.createElement("textarea");
        input.value = text;
        input.style.position = "fixed";
        input.style.left = "-9999px";
        document.body.appendChild(input);
        input.focus();
        input.select();
        try {
            document.execCommand("copy");
        } finally {
            document.body.removeChild(input);
        }
    }

    function showCopySuccess() {
        const success = document.getElementById("copy-success");
        if (!success) {
            return;
        }
        success.style.display = "block";
        setTimeout(function () {
            success.style.display = "none";
        }, 1800);
    }

    function copyLinkManually() {
        const input = document.getElementById("share-link-input");
        if (!input || !input.value) {
            return;
        }
        copyToClipboard(input.value).then(showCopySuccess);
    }

    function renderSharePreview(qrcodeCanvas) {
        const container = document.getElementById("final-image-container");
        const editorArea = document.getElementById("editorArea");
        if (!container || !editorArea || !qrcodeCanvas || typeof html2canvas !== "function") {
            return;
        }
        container.textContent = "";
        html2canvas(editorArea, {
            backgroundColor: "#2f3129",
            scale: Math.min(2, window.devicePixelRatio || 1)
        }).then(function (editorCanvas) {
            const padding = 22;
            const qrSize = 180;
            const finalCanvas = document.createElement("canvas");
            finalCanvas.width = Math.max(editorCanvas.width, 680);
            finalCanvas.height = editorCanvas.height + qrSize + padding * 3;
            const ctx = finalCanvas.getContext("2d");
            ctx.fillStyle = "#2f3129";
            ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
            ctx.drawImage(editorCanvas, 0, 0);
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(padding, editorCanvas.height + padding, qrSize + padding * 2, qrSize + padding);
            ctx.drawImage(qrcodeCanvas, padding * 2, editorCanvas.height + padding * 1.5, qrSize, qrSize);
            ctx.fillStyle = "#f4f5f0";
            ctx.font = "700 22px Monaco, Consolas, monospace";
            ctx.fillText("CodeMark C++", qrSize + padding * 4, editorCanvas.height + padding * 2.4);
            ctx.font = "16px Monaco, Consolas, monospace";
            ctx.fillText("Scan to open and run this code.", qrSize + padding * 4, editorCanvas.height + padding * 3.6);

            const img = document.createElement("img");
            img.src = finalCanvas.toDataURL("image/png");
            img.style.maxWidth = "90%";
            container.appendChild(img);
        }).catch(function () {
        });
    }

    async function generateShareLink() {
        const formData = new URLSearchParams();
        formData.set("code", window.editor ? window.editor.getValue() : "");
        formData.set("language", "c_cpp");
        formData.set("template", "cpp_editor");
        formData.set("theme", getCurrentThemeValue());

        const response = await fetch(getConfig().uploadUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
            },
            body: formData.toString()
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const shareLink = data.share_link || "";
        const qrcode = document.getElementById("qrcode");
        if (qrcode) {
            qrcode.textContent = "";
        }
        if (window.$ && $.fn && typeof $.fn.qrcode === "function") {
            $("#qrcode").qrcode({
                text: shareLink,
                width: 200,
                height: 200
            });
        }
        const modalTitle = document.querySelector("#share-modal .modal-title");
        if (modalTitle) {
            modalTitle.textContent = "";
            modalTitle.appendChild(document.createTextNode("Code link: "));
            const link = document.createElement("a");
            link.href = shareLink;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = shareLink;
            modalTitle.appendChild(link);
        }
        const input = document.getElementById("share-link-input");
        if (input) {
            input.value = shareLink;
        }
        const qrcodeCanvas = document.querySelector("#qrcode canvas");
        renderSharePreview(qrcodeCanvas);
        copyToClipboard(shareLink).then(showCopySuccess);
    }

    function share() {
        const qrcode = document.getElementById("qrcode");
        const input = document.getElementById("share-link-input");
        const container = document.getElementById("final-image-container");
        if (qrcode) {
            qrcode.textContent = "";
        }
        if (input) {
            input.value = "";
        }
        if (container) {
            container.textContent = "";
        }
        if (window.$ && typeof $("#share-modal").modal === "function") {
            $("#share-modal").modal("show");
        }
        generateShareLink().catch(function (error) {
            const target = document.getElementById("qrcode");
            if (target) {
                target.textContent = "分享链接生成失败：" + error;
            }
        });
    }

    function toggleSidebar() {
        const sidebar = document.getElementById("sidebarMenu");
        if (sidebar) {
            sidebar.classList.toggle("show");
        }
    }

    function closeSidebar() {
        const sidebar = document.getElementById("sidebarMenu");
        if (sidebar) {
            sidebar.classList.remove("show");
        }
    }

    function closeMobileConsole() {
        const mobileConsole = document.getElementById("mobileConsole");
        if (mobileConsole) {
            mobileConsole.style.bottom = "-70%";
        }
    }

    function toggleMobileStdinPanel() {
        const panel = document.getElementById("cppMobileStdinPanel");
        if (panel) {
            panel.classList.toggle("show");
        }
    }

    function exposeGlobals() {
        window.runCppCode = runCppCode;
        window.performClick = performClick;
        window.save = save;
        window.pasteCode = pasteCode;
        window.home = home;
        window.share = share;
        window.copyLinkManually = copyLinkManually;
        window.toggleSidebar = toggleSidebar;
        window.closeSidebar = closeSidebar;
        window.closeMobileConsole = closeMobileConsole;
        window.toggleMobileStdinPanel = toggleMobileStdinPanel;
        window.toggleConsoleWrap = toggleConsoleWrap;
        window.collapseConsolePanel = collapseConsolePanel;
        window.expandConsolePanel = expandConsolePanel;
    }

    window.addEventListener("beforeunload", saveDraftCache);
    window.addEventListener("pageshow", function (event) {
        if (event.persisted
            || (typeof window.performance !== "undefined" && window.performance.navigation.type === 2)) {
            window.location.reload();
        }
    });

    window.addEventListener("load", function () {
        exposeGlobals();
        initDesktopConsolePanel();
        initAceEditor();
        initThemeSelector();
        initFileInput();
        clearOutput();
        appendOutputText("C++ editor ready.\n");
    });
})();
