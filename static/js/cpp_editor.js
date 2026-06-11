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
    const CPP_INTERACTIVE_POLL_INTERVAL_MS = 120;
    const CPP_INPUT_REVEAL_DELAY_MS = 500;
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
    let activeCppSessionId = "";
    let cppLastOutputSeq = 0;
    let cppPollTimer = null;
    let cppInputRevealTimer = null;
    let cppHasProgramOutput = false;
    let cppProgramOutputEndsWithNewline = true;
    let cppInputExpected = false;
    let cppOutputTruncationShown = false;
    let cppUsesTerminalEcho = false;
    let activeConsoleInputRow = null;
    let activeConsoleInputElement = null;

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

    function getStdinValue() {
        return "";
    }

    function normalizeCodeLanguage(language, fallback = "c_cpp") {
        if (typeof normalizeSharecodeLanguage === "function") {
            return normalizeSharecodeLanguage(language, fallback);
        }
        return String(language || fallback).trim().toLowerCase() || fallback;
    }

    function getActiveTextProjectFile() {
        if (typeof createProjectFileFromEditorInput === "function") {
            createProjectFileFromEditorInput();
        }
        if (typeof syncActiveEditorToProject === "function") {
            syncActiveEditorToProject();
        }
        if (typeof getActiveProjectFile !== "function") {
            return null;
        }
        const active = getActiveProjectFile();
        return active && active.kind === "text" ? active : null;
    }

    function getProjectPayloadForRequest(payloadOverride) {
        if (payloadOverride) {
            return payloadOverride;
        }
        if (typeof window.getEditorProjectSharePayload === "function") {
            return window.getEditorProjectSharePayload();
        }
        if (typeof buildSharePayload === "function") {
            if (typeof createProjectFileFromEditorInput === "function") {
                createProjectFileFromEditorInput();
            }
            if (typeof syncActiveEditorToProject === "function") {
                syncActiveEditorToProject();
            }
            return buildSharePayload();
        }
        return null;
    }

    function getPrimaryTextFileFromPayload(payload) {
        const textFiles = payload && Array.isArray(payload.text_files) ? payload.text_files : [];
        const activePath = typeof safeNormalizePath === "function"
            ? safeNormalizePath(payload && payload.active_file)
            : String(payload && payload.active_file || "");
        return textFiles.find(function (file) {
            const filePath = typeof safeNormalizePath === "function"
                ? safeNormalizePath(file && file.path)
                : String(file && file.path || "");
            return filePath && filePath === activePath;
        }) || textFiles[0] || null;
    }

    function buildCppRunRequestData() {
        let code = window.editor ? window.editor.getValue() : "";
        let activeFilePath = currentFilename || "main.cpp";
        let projectPayload = null;
        const activeFile = getActiveTextProjectFile();

        if (typeof getActiveProjectFile === "function" && !activeFile) {
            return {
                error: "当前选中的不是可运行的 C/C++ 文本文件。"
            };
        }

        if (activeFile) {
            const language = normalizeCodeLanguage(
                activeFile.language || (typeof detectLanguageFromFilename === "function" ? detectLanguageFromFilename(activeFile.path) : ""),
                "c_cpp"
            );
            if (language !== "c_cpp") {
                return {
                    error: "当前文件不是 C/C++ 文件，请切换到 .cpp/.cc/.cxx/.c/.h/.hpp 文件后再运行。"
                };
            }
            code = activeFile.content || "";
            activeFilePath = activeFile.path || activeFilePath;
            projectPayload = getProjectPayloadForRequest(null);
        }

        return {
            code: code,
            activeFile: activeFilePath,
            projectPayload: projectPayload
        };
    }

    function getCurrentEditorCodeForAction() {
        const activeFile = getActiveTextProjectFile();
        if (activeFile) {
            return activeFile.content || "";
        }
        return window.editor ? window.editor.getValue() : "";
    }

    function setCurrentEditorCodeFromAction(code) {
        if (!window.editor) {
            return;
        }
        window.editor.setValue(String(code || ""), -1);
        const activeFile = getActiveTextProjectFile();
        if (activeFile) {
            activeFile.content = window.editor.getValue();
        }
        scheduleDraftCacheSave();
        if (typeof scheduleSharecodeDraftCacheSave === "function") {
            scheduleSharecodeDraftCacheSave();
        }
        if (typeof renderActiveLineHighlights === "function") {
            renderActiveLineHighlights();
        }
    }

    function stripCppStringsAndLineComment(line) {
        let result = "";
        let quote = "";
        let escaped = false;
        for (let index = 0; index < line.length; index += 1) {
            const char = line[index];
            const next = line[index + 1] || "";
            if (quote) {
                if (escaped) {
                    escaped = false;
                } else if (char === "\\") {
                    escaped = true;
                } else if (char === quote) {
                    quote = "";
                }
                result += " ";
                continue;
            }
            if ((char === "\"" || char === "'")) {
                quote = char;
                result += " ";
                continue;
            }
            if (char === "/" && next === "/") {
                break;
            }
            result += char;
        }
        return result;
    }

    function formatCppCodeFallback(code) {
        const indentUnit = "    ";
        let indentLevel = 0;
        return String(code || "")
            .replace(/\r\n?/g, "\n")
            .split("\n")
            .map(function (rawLine) {
                const trimmed = rawLine.trim();
                if (!trimmed) {
                    return "";
                }
                if (trimmed.charAt(0) === "#") {
                    return trimmed;
                }

                const leadingClosers = (trimmed.match(/^\}+/) || [""])[0].length;
                const caseOutdent = /^(case\b.*:|default\s*:)/.test(trimmed) ? 1 : 0;
                const lineIndent = Math.max(0, indentLevel - leadingClosers - caseOutdent);
                const braceSource = stripCppStringsAndLineComment(trimmed);
                const openCount = (braceSource.match(/\{/g) || []).length;
                const closeCount = (braceSource.match(/\}/g) || []).length;
                const formattedLine = indentUnit.repeat(lineIndent) + trimmed;
                indentLevel = Math.max(0, indentLevel + openCount - closeCount);
                return formattedLine;
            })
            .join("\n")
            .replace(/[ \t]+$/gm, "")
            .replace(/\n{3,}/g, "\n\n")
            .trimEnd() + "\n";
    }

    function formatCode() {
        if (!window.editor) {
            return;
        }
        const activeFile = getActiveTextProjectFile();
        if (activeFile) {
            const language = normalizeCodeLanguage(
                activeFile.language || (typeof detectLanguageFromFilename === "function" ? detectLanguageFromFilename(activeFile.path) : ""),
                "c_cpp"
            );
            if (language !== "c_cpp") {
                alert("当前文件不是 C/C++ 文件，无法使用 C++ 格式化。");
                return;
            }
        }
        try {
            setCurrentEditorCodeFromAction(formatCppCodeFallback(getCurrentEditorCodeForAction()));
        } catch (error) {
            alert("格式化失败: " + error);
        }
    }

    function screenshotAndDownload() {
        const code = getCurrentEditorCodeForAction();
        const hiddenContainer = document.createElement("div");
        hiddenContainer.style.position = "fixed";
        hiddenContainer.style.top = "-9999px";
        hiddenContainer.style.left = "0";
        hiddenContainer.style.padding = "20px";
        hiddenContainer.style.backgroundColor = "#2f3129";
        hiddenContainer.style.color = "#fff";
        hiddenContainer.style.fontFamily = "Monaco, Menlo, Ubuntu Mono, Consolas, source-code-pro, monospace";
        hiddenContainer.style.fontSize = "16px";
        hiddenContainer.style.lineHeight = "1.5";
        hiddenContainer.style.whiteSpace = "pre";
        hiddenContainer.id = "hidden-cpp-screenshot-container";
        hiddenContainer.textContent = code;
        document.body.appendChild(hiddenContainer);

        html2canvas(hiddenContainer).then(function (canvas) {
            canvas.toBlob(function (blob) {
                if (blob) {
                    saveAs(blob, "cpp_code_screenshot.png");
                }
                if (hiddenContainer.parentNode) {
                    hiddenContainer.parentNode.removeChild(hiddenContainer);
                }
            });
        }).catch(function (error) {
            if (hiddenContainer.parentNode) {
                hiddenContainer.parentNode.removeChild(hiddenContainer);
            }
            alert("截图失败: " + error);
        });
    }

    function copyAllCode() {
        copyToClipboard(getCurrentEditorCodeForAction()).then(showCopySuccess);
    }

    function copyShareLinkInMenu() {
        const shareInput = document.getElementById("share-link-input");
        const shareLink = shareInput ? shareInput.value : "";
        if (!shareLink) {
            alert("暂无可分享的链接，请先点击分享按钮生成。");
            return;
        }
        copyToClipboard(shareLink).then(showCopySuccess);
    }

    function updateCppRunButtonVisibility() {
        let visible = true;
        if (typeof getActiveProjectFile === "function") {
            const active = getActiveProjectFile();
            if (active && active.kind === "text") {
                const language = normalizeCodeLanguage(
                    active.language || (typeof detectLanguageFromFilename === "function" ? detectLanguageFromFilename(active.path) : ""),
                    "c_cpp"
                );
                visible = language === "c_cpp";
            } else if (active) {
                visible = false;
            }
        }
        document.querySelectorAll(".cpp-run-btn").forEach(function (button) {
            button.style.display = visible ? "" : "none";
        });
    }

    function installRunButtonVisibilityHook() {
        const original = window.updatePythonRunButtonVisibility;
        if (typeof original !== "function" || original.__cppEditorWrapped) {
            return;
        }
        const wrapped = function () {
            original();
            updateCppRunButtonVisibility();
        };
        wrapped.__cppEditorWrapped = true;
        window.updatePythonRunButtonVisibility = wrapped;
        try {
            updatePythonRunButtonVisibility = wrapped;
        } catch (e) {
        }
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
        activeConsoleInputRow = null;
        activeConsoleInputElement = null;
    }

    function appendOutputText(text) {
        const output = getOutputElement();
        if (!output) {
            return;
        }
        const node = document.createTextNode(String(text ?? ""));
        if (activeConsoleInputRow && activeConsoleInputRow.parentNode === output) {
            output.insertBefore(node, activeConsoleInputRow);
        } else {
            output.appendChild(node);
        }
        scrollOutputToBottom();
    }

    function removeActiveConsoleInputRow() {
        if (activeConsoleInputRow && activeConsoleInputRow.parentNode) {
            activeConsoleInputRow.parentNode.removeChild(activeConsoleInputRow);
        }
        activeConsoleInputRow = null;
        activeConsoleInputElement = null;
    }

    function replaceActiveConsoleInputWithHistory(value) {
        const row = activeConsoleInputRow;
        if (!row || !row.parentNode) {
            return;
        }
        if (cppUsesTerminalEcho) {
            row.parentNode.removeChild(row);
        } else {
            row.replaceWith(document.createTextNode(String(value ?? "") + "\n"));
        }
        activeConsoleInputRow = null;
        activeConsoleInputElement = null;
        scrollOutputToBottom();
    }

    function showConsoleInputRow() {
        const output = getOutputElement();
        if (!output || !isCppRunning || !activeCppSessionId || activeConsoleInputRow) {
            return;
        }

        const row = document.createElement("div");
        row.className = "console-input-row";

        const inputElement = document.createElement("input");
        inputElement.type = "text";
        inputElement.className = "console-inline-input";
        inputElement.autocomplete = "off";
        inputElement.autocapitalize = "off";
        inputElement.spellcheck = false;
        row.appendChild(inputElement);

        inputElement.addEventListener("keydown", function (event) {
            if (event.key !== "Enter") {
                return;
            }
            event.preventDefault();
            submitConsoleInput(inputElement.value);
        });

        output.appendChild(row);
        activeConsoleInputRow = row;
        activeConsoleInputElement = inputElement;
        scrollOutputToBottom();
        window.requestAnimationFrame(function () {
            if (activeConsoleInputElement) {
                activeConsoleInputElement.focus();
            }
        });
    }

    function scheduleConsoleInputReveal() {
        if (cppInputRevealTimer) {
            clearTimeout(cppInputRevealTimer);
        }
        cppInputRevealTimer = setTimeout(function () {
            cppInputRevealTimer = null;
            if (isCppRunning && activeCppSessionId) {
                showConsoleInputRow();
            }
        }, CPP_INPUT_REVEAL_DELAY_MS);
    }

    function stripCppBlockComments(text) {
        return String(text || "").replace(/\/\*[\s\S]*?\*\//g, " ");
    }

    function looksLikeCppNeedsStdin(code) {
        const source = stripCppBlockComments(code)
            .split("\n")
            .map(stripCppStringsAndLineComment)
            .join("\n");
        return /(^|[^A-Za-z0-9_])(?:cin|wcin)\s*>>/.test(source)
            || /(^|[^A-Za-z0-9_])(?:scanf|fscanf|sscanf|getchar|fgets|gets)\s*\(/.test(source)
            || /(^|[^A-Za-z0-9_])(?:std::)?getline\s*\(\s*(?:std::)?cin\b/.test(source);
    }

    function setRunningState(running) {
        isCppRunning = running;
        document.querySelectorAll(".cpp-run-btn").forEach(function (button) {
            button.disabled = running;
            button.textContent = running ? "running" : "> run";
        });
    }

    function resetInteractiveRunState() {
        if (cppPollTimer) {
            clearTimeout(cppPollTimer);
            cppPollTimer = null;
        }
        if (cppInputRevealTimer) {
            clearTimeout(cppInputRevealTimer);
            cppInputRevealTimer = null;
        }
        removeActiveConsoleInputRow();
        activeCppSessionId = "";
        cppLastOutputSeq = 0;
        cppHasProgramOutput = false;
        cppProgramOutputEndsWithNewline = true;
        cppInputExpected = false;
        cppOutputTruncationShown = false;
        cppUsesTerminalEcho = false;
    }

    function buildCppRunFormData(runRequest) {
        const formData = new URLSearchParams();
        formData.set("code", runRequest.code);
        formData.set("active_file", runRequest.activeFile || "main.cpp");
        if (runRequest.projectPayload) {
            formData.set("project_payload", JSON.stringify(runRequest.projectPayload));
        }
        return formData;
    }

    async function postCppRunForm(url, formData, options = {}) {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                "X-CSRFToken": getCsrfToken()
            },
            body: formData.toString(),
            keepalive: !!options.keepalive
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
    }

    function appendInteractiveRunEvents(events) {
        let appendedProgramOutput = false;
        (events || []).forEach(function (event) {
            if (event && typeof event.seq === "number") {
                cppLastOutputSeq = Math.max(cppLastOutputSeq, event.seq);
            }
            const text = event && typeof event.text === "string" ? event.text : "";
            if (!text) {
                return;
            }
            if (!event || event.stream !== "system") {
                cppHasProgramOutput = true;
                cppProgramOutputEndsWithNewline = text.endsWith("\n");
                appendedProgramOutput = true;
            } else if (text.indexOf("[输出已截断]") !== -1) {
                cppOutputTruncationShown = true;
            }
            appendOutputText(text);
        });
        if (appendedProgramOutput && cppInputExpected && isCppRunning && activeCppSessionId && !activeConsoleInputRow) {
            showConsoleInputRow();
        }
    }

    function finishInteractiveRun(data) {
        if (cppPollTimer) {
            clearTimeout(cppPollTimer);
            cppPollTimer = null;
        }
        if (cppInputRevealTimer) {
            clearTimeout(cppInputRevealTimer);
            cppInputRevealTimer = null;
        }
        removeActiveConsoleInputRow();
        if (!cppHasProgramOutput) {
            appendOutputText("[程序运行结束，无输出]\n");
        } else if (!cppProgramOutputEndsWithNewline) {
            appendOutputText("\n");
        }
        if (data && data.timed_out) {
            appendOutputText("[运行超时，进程已终止]\n");
        } else if (data && typeof data.exit_code !== "undefined" && data.exit_code !== null) {
            appendOutputText(`[退出码: ${data.exit_code}]\n`);
        }
        if (data && data.output_truncated && !cppOutputTruncationShown) {
            appendOutputText("[输出已截断]\n");
        }
        activeCppSessionId = "";
        setRunningState(false);
    }

    async function pollInteractiveCppRun() {
        if (!activeCppSessionId) {
            return;
        }
        const formData = new URLSearchParams();
        formData.set("session_id", activeCppSessionId);
        formData.set("after_seq", String(cppLastOutputSeq));
        try {
            const data = await postCppRunForm(getConfig().runPollUrl, formData);
            if (!data.ok && data.stderr) {
                cppHasProgramOutput = true;
                cppProgramOutputEndsWithNewline = true;
                appendOutputText(data.stderr + "\n");
            }
            appendInteractiveRunEvents(data.events || []);
            if (data.done) {
                finishInteractiveRun(data);
                return;
            }
            cppPollTimer = setTimeout(pollInteractiveCppRun, CPP_INTERACTIVE_POLL_INTERVAL_MS);
        } catch (error) {
            appendOutputText("C++ 输出读取失败：" + error + "\n");
            finishInteractiveRun({exit_code: null, timed_out: false, output_truncated: false});
        }
    }

    async function submitConsoleInput(value) {
        if (!activeCppSessionId || !activeConsoleInputRow) {
            return;
        }
        const submittedValue = String(value ?? "");
        replaceActiveConsoleInputWithHistory(submittedValue);
        const formData = new URLSearchParams();
        formData.set("session_id", activeCppSessionId);
        formData.set("stdin", submittedValue);
        try {
            const data = await postCppRunForm(getConfig().runInputUrl, formData);
            if (!data.ok && data.stderr) {
                appendOutputText(data.stderr + "\n");
                return;
            }
            if (isCppRunning && activeCppSessionId) {
                scheduleConsoleInputReveal();
            }
        } catch (error) {
            appendOutputText("C++ 输入发送失败：" + error + "\n");
        }
    }

    function stopActiveCppSession(options = {}) {
        if (!activeCppSessionId || !getConfig().runStopUrl) {
            return;
        }
        const formData = new URLSearchParams();
        formData.set("session_id", activeCppSessionId);
        postCppRunForm(getConfig().runStopUrl, formData, {keepalive: !!options.keepalive}).catch(function () {
        });
        activeCppSessionId = "";
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
        resetInteractiveRunState();
        appendOutputText("Compiling C++...\n");
        setRunningState(true);
        try {
            const runRequest = buildCppRunRequestData();
            if (runRequest.error) {
                clearOutput();
                appendOutputText(runRequest.error + "\n");
                return;
            }

            if (!getConfig().runStartUrl) {
                const fallbackFormData = buildCppRunFormData(runRequest);
                fallbackFormData.set("stdin", getStdinValue());
                const fallbackData = await postCppRunForm(getConfig().runUrl, fallbackFormData);
                clearOutput();
                renderRunResult(fallbackData);
                return;
            }

            cppInputExpected = looksLikeCppNeedsStdin(runRequest.code);
            const data = await postCppRunForm(getConfig().runStartUrl, buildCppRunFormData(runRequest));
            clearOutput();
            if (data.done) {
                renderRunResult(data.result || data);
                return;
            }
            if (!data.ok || !data.session_id) {
                appendOutputText((data.stderr || "C++ 程序启动失败。") + "\n");
                return;
            }
            activeCppSessionId = data.session_id;
            cppUsesTerminalEcho = !!data.terminal_echo;
            scheduleConsoleInputReveal();
            pollInteractiveCppRun();
        } catch (error) {
            clearOutput();
            appendOutputText("C++ 运行请求失败：" + error + "\n");
        } finally {
            if (!activeCppSessionId) {
                setRunningState(false);
            }
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

        const initialCode = resolveInitialCode(DEFAULT_CPP_CODE);
        window.editor.setValue(initialCode, -1);
        window.editor.session.on("change", scheduleDraftCacheSave);

        saveDraftCache();
        if (typeof initializeEditorProjectSidebar === "function") {
            initializeEditorProjectSidebar({
                initialCode: window.editor.getValue(),
                initialLanguage: "c_cpp",
                defaultPath: currentFilename || "main.cpp"
            });
            updateCppRunButtonVisibility();
        }
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
        if (typeof window.initializeEditorProjectSidebar === "function") {
            return;
        }
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
        if (typeof beginEditorProjectUpload === "function" && beginEditorProjectUpload(elemId)) {
            return;
        }
        const elem = document.getElementById(elemId);
        if (elem) {
            elem.click();
        }
    }

    function save() {
        if (typeof saveEditorActiveProjectFile === "function" && saveEditorActiveProjectFile("main.cpp")) {
            return;
        }
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
                window.editor.insert(text);
                scheduleDraftCacheSave();
                if (typeof syncActiveEditorToProject === "function") {
                    syncActiveEditorToProject();
                }
                if (typeof scheduleSharecodeDraftCacheSave === "function") {
                    scheduleSharecodeDraftCacheSave();
                }
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

    function buildCppShareRequestData(payloadOverride) {
        const payload = getProjectPayloadForRequest(payloadOverride);
        const primaryFile = payloadOverride
            ? getPrimaryTextFileFromPayload(payloadOverride)
            : getActiveTextProjectFile();
        const code = primaryFile
            ? (primaryFile.content || "")
            : (window.editor ? window.editor.getValue() : "");
        const language = primaryFile
            ? normalizeCodeLanguage(
                primaryFile.language || (typeof detectLanguageFromFilename === "function" ? detectLanguageFromFilename(primaryFile.path) : ""),
                "c_cpp"
            )
            : "c_cpp";
        return {
            code: code,
            language: language,
            payload: payload
        };
    }

    async function generateShareLink(options = {}) {
        const requestData = buildCppShareRequestData(options.projectPayloadOverride || null);
        const formData = new URLSearchParams();
        formData.set("code", requestData.code);
        formData.set("language", requestData.language);
        formData.set("template", "cpp_editor");
        formData.set("theme", getCurrentThemeValue());
        if (requestData.payload) {
            formData.set("project_payload", JSON.stringify(requestData.payload));
        }

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

    function share(options) {
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
        generateShareLink(options || {}).catch(function (error) {
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

    function hideCustomContextMenu() {
        const menu = document.getElementById("custom-context-menu");
        if (menu) {
            menu.style.display = "none";
        }
    }

    function placeCustomContextMenu(menu, event) {
        menu.style.display = "block";
        const menuRect = menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        const left = Math.min(event.pageX, window.scrollX + viewportWidth - menuRect.width - 8);
        const top = Math.min(event.pageY, window.scrollY + viewportHeight - menuRect.height - 8);
        menu.style.left = Math.max(window.scrollX + 4, left) + "px";
        menu.style.top = Math.max(window.scrollY + 4, top) + "px";
    }

    function initCustomContextMenu() {
        const menu = document.getElementById("custom-context-menu");
        if (!menu) {
            return;
        }
        document.addEventListener("contextmenu", function (event) {
            const editorArea = document.getElementById("editorArea");
            if (!editorArea || !editorArea.contains(event.target)) {
                return;
            }
            event.preventDefault();
            hideProjectTreeContextMenuIfAvailable();
            placeCustomContextMenu(menu, event);
        });
        document.addEventListener("click", hideCustomContextMenu);
        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                hideCustomContextMenu();
            }
        });
        window.addEventListener("resize", hideCustomContextMenu);
        window.addEventListener("scroll", hideCustomContextMenu, true);
    }

    function hideProjectTreeContextMenuIfAvailable() {
        if (typeof hideProjectTreeContextMenu === "function") {
            hideProjectTreeContextMenu();
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
        window.toggleConsoleWrap = toggleConsoleWrap;
        window.collapseConsolePanel = collapseConsolePanel;
        window.expandConsolePanel = expandConsolePanel;
        window.formatCode = formatCode;
        window.screenshotAndDownload = screenshotAndDownload;
        window.copyAllCode = copyAllCode;
        window.copyShareLinkInMenu = copyShareLinkInMenu;
    }

    window.addEventListener("beforeunload", function () {
        stopActiveCppSession({keepalive: true});
        saveDraftCache();
    });
    window.addEventListener("pageshow", function (event) {
        if (event.persisted
            || (typeof window.performance !== "undefined" && window.performance.navigation.type === 2)) {
            window.location.reload();
        }
    });

    window.addEventListener("load", function () {
        exposeGlobals();
        installRunButtonVisibilityHook();
        initDesktopConsolePanel();
        initAceEditor();
        initThemeSelector();
        initFileInput();
        initCustomContextMenu();
        clearOutput();
        appendOutputText("C++ editor ready.\n");
    });
})();
