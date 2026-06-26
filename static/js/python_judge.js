(function () {
    const config = window.PYTHON_JUDGE_CONFIG || {};
    const bootstrap = config.bootstrap || {};
    const problems = Array.isArray(bootstrap.problems) ? bootstrap.problems : [];
    const DEFAULT_CODE = [
        "import sys",
        "",
        "def solve():",
        "    data = sys.stdin.read().strip().split()",
        "    # 在这里编写你的解法",
        "    pass",
        "",
        "if __name__ == \"__main__\":",
        "    solve()",
        ""
    ].join("\n");

    let activeSlug = bootstrap.activeSlug || (problems[0] && problems[0].slug) || "";
    let activeFilter = "all";
    let editor = null;
    let runner = null;
    let saveTimer = null;
    let applyingProblem = false;
    let isBusy = false;

    const nodes = {
        app: document.querySelector("[data-python-judge-app]"),
        authGate: document.querySelector("[data-auth-gate]"),
        problemList: document.querySelector("[data-problem-list]"),
        filters: document.querySelectorAll("[data-filter]"),
        pyodideStatus: document.querySelector("[data-pyodide-status]"),
        title: document.querySelector("[data-problem-title]"),
        summary: document.querySelector("[data-problem-summary]"),
        difficulty: document.querySelector("[data-problem-difficulty]"),
        tags: document.querySelector("[data-problem-tags]"),
        statement: document.querySelector("[data-problem-statement]"),
        inputDescription: document.querySelector("[data-input-description]"),
        outputDescription: document.querySelector("[data-output-description]"),
        constraints: document.querySelector("[data-constraints]"),
        sampleList: document.querySelector("[data-sample-list]"),
        markButton: document.querySelector("[data-mark-button]"),
        saveState: document.querySelector("[data-save-state]"),
        customInput: document.querySelector("[data-custom-input]"),
        resultTitle: document.querySelector("[data-result-title]"),
        resultSummary: document.querySelector("[data-result-summary]"),
        resultList: document.querySelector("[data-result-list]"),
        historyList: document.querySelector("[data-history-list]"),
        recordCount: document.querySelector("[data-record-count]"),
        statAccepted: document.querySelector("[data-stat-accepted]"),
        statAttempted: document.querySelector("[data-stat-attempted]"),
        statMarked: document.querySelector("[data-stat-marked]"),
        actions: document.querySelectorAll("[data-action]")
    };

    function readCookie(name) {
        const cookies = document.cookie ? document.cookie.split("; ") : [];
        for (let i = 0; i < cookies.length; i += 1) {
            const parts = cookies[i].split("=");
            if (parts.shift() === name) {
                return decodeURIComponent(parts.join("="));
            }
        }
        return "";
    }

    function csrfToken() {
        return readCookie("csrftoken") || config.csrfToken || "";
    }

    function textNode(tagName, className, text) {
        const node = document.createElement(tagName);
        if (className) {
            node.className = className;
        }
        if (text !== undefined && text !== null) {
            node.textContent = text;
        }
        return node;
    }

    function activeProblem() {
        return problems.find(function (problem) {
            return problem.slug === activeSlug;
        }) || problems[0] || null;
    }

    function hasPersistedState(problem) {
        return !!(problem && problem.state && (problem.state.updatedAt || problem.state.lastSubmittedAt));
    }

    function codeForProblem(problem) {
        if (!problem) {
            return DEFAULT_CODE;
        }
        if (hasPersistedState(problem)) {
            return problem.state.code || "";
        }
        return problem.starterCode || DEFAULT_CODE;
    }

    function customInputForProblem(problem) {
        if (!problem || !problem.state) {
            return "";
        }
        return problem.state.customInput || "";
    }

    function sampleTests(problem) {
        const tests = (problem && Array.isArray(problem.tests)) ? problem.tests : [];
        const samples = tests.filter(function (test) {
            return test.isSample;
        });
        return samples.length ? samples : tests.filter(function (test) {
            return !test.isHidden;
        });
    }

    function normalizeOutput(value) {
        return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/[ \t]+\n/g, "\n").trimEnd();
    }

    function formatDate(value) {
        if (!value) {
            return "";
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return "";
        }
        return date.toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function statusLabel(status) {
        if (status === "accepted") {
            return "全部通过";
        }
        if (status === "attempted") {
            return "已尝试";
        }
        if (status === "failed" || status === "wrong_answer") {
            return "未通过";
        }
        if (status === "error" || status === "runtime_error") {
            return "运行错误";
        }
        return "未开始";
    }

    function updateStats() {
        let accepted = 0;
        let attempted = 0;
        let marked = 0;
        problems.forEach(function (problem) {
            const state = problem.state || {};
            if (state.status === "accepted") {
                accepted += 1;
                attempted += 1;
            } else if (state.status === "attempted") {
                attempted += 1;
            }
            if (state.marked) {
                marked += 1;
            }
        });
        if (nodes.statAccepted) {
            nodes.statAccepted.textContent = accepted;
        }
        if (nodes.statAttempted) {
            nodes.statAttempted.textContent = attempted;
        }
        if (nodes.statMarked) {
            nodes.statMarked.textContent = marked;
        }
    }

    function filteredProblems() {
        if (activeFilter === "marked") {
            return problems.filter(function (problem) {
                return problem.state && problem.state.marked;
            });
        }
        if (activeFilter === "accepted") {
            return problems.filter(function (problem) {
                return problem.state && problem.state.status === "accepted";
            });
        }
        return problems;
    }

    function renderProblemList() {
        if (!nodes.problemList) {
            return;
        }
        nodes.problemList.innerHTML = "";
        const visibleProblems = filteredProblems();
        if (!visibleProblems.length) {
            nodes.problemList.appendChild(textNode("div", "pyjudge-empty", "没有匹配的题目"));
            return;
        }
        visibleProblems.forEach(function (problem) {
            const state = problem.state || {};
            const item = document.createElement("button");
            item.type = "button";
            item.className = "pyjudge-problem-item" + (problem.slug === activeSlug ? " is-active" : "");
            item.dataset.slug = problem.slug;

            const copy = document.createElement("span");
            copy.appendChild(textNode("span", "pyjudge-problem-name", problem.title));
            const meta = textNode("span", "pyjudge-problem-meta");
            const status = textNode("span", "pyjudge-mini-pill");
            status.textContent = statusLabel(state.status);
            if (state.status === "accepted") {
                status.classList.add("is-accepted");
            } else if (state.status === "attempted") {
                status.classList.add("is-attempted");
            }
            meta.appendChild(status);
            meta.appendChild(textNode("span", "pyjudge-mini-pill", problem.difficultyLabel || "入门"));
            if (state.marked) {
                meta.appendChild(textNode("span", "pyjudge-mini-pill is-marked", "标记"));
            }
            copy.appendChild(meta);

            const count = textNode("span", "pyjudge-mini-pill", (problem.testCount || 0) + " 测试");
            item.appendChild(copy);
            item.appendChild(count);
            nodes.problemList.appendChild(item);
        });
    }

    function renderSamples(problem) {
        nodes.sampleList.innerHTML = "";
        const samples = sampleTests(problem);
        if (!samples.length) {
            nodes.sampleList.appendChild(textNode("div", "pyjudge-empty", "暂无样例"));
            return;
        }
        samples.forEach(function (sample, index) {
            const item = textNode("div", "pyjudge-sample");
            const title = textNode("div", "pyjudge-sample-title");
            title.appendChild(textNode("span", "", sample.title || "样例 " + (index + 1)));
            title.appendChild(textNode("span", "", "期望输出"));
            const body = textNode("pre");
            body.textContent = "输入\n" + (sample.stdin || "(空输入)") + "\n\n输出\n" + (sample.expectedStdout || "(空输出)");
            item.appendChild(title);
            item.appendChild(body);
            nodes.sampleList.appendChild(item);
        });
    }

    function renderHistory(problem) {
        const submissions = (problem && Array.isArray(problem.submissions)) ? problem.submissions : [];
        nodes.historyList.innerHTML = "";
        nodes.recordCount.textContent = submissions.length + " 次提交";
        if (!submissions.length) {
            nodes.historyList.appendChild(textNode("div", "pyjudge-empty", "还没有提交记录"));
            return;
        }
        submissions.forEach(function (submission) {
            const item = textNode("div", "pyjudge-history-item");
            const status = textNode("span", "pyjudge-history-status is-" + submission.status, statusLabel(submission.status));
            item.appendChild(status);
            item.appendChild(textNode("span", "", submission.passedCount + "/" + submission.totalCount + " 通过 · " + submission.runtimeMs + "ms"));
            item.appendChild(textNode("span", "", formatDate(submission.createdAt)));
            nodes.historyList.appendChild(item);
        });
    }

    function renderProblem() {
        const problem = activeProblem();
        if (!problem) {
            if (nodes.title) {
                nodes.title.textContent = "暂无题目";
            }
            return;
        }
        nodes.title.textContent = problem.title;
        nodes.summary.textContent = problem.summary || "完成题目后可以运行样例、提交全部测试并保存记录。";
        nodes.difficulty.textContent = problem.difficultyLabel || "入门";
        nodes.statement.textContent = problem.statement || "暂无题目描述";
        nodes.inputDescription.textContent = problem.inputDescription || "暂无输入说明";
        nodes.outputDescription.textContent = problem.outputDescription || "暂无输出说明";
        nodes.constraints.textContent = problem.constraints || "暂无数据范围";
        nodes.tags.innerHTML = "";
        (problem.tags || []).forEach(function (tag) {
            nodes.tags.appendChild(textNode("span", "pyjudge-tag", tag));
        });
        if (!problem.tags || !problem.tags.length) {
            nodes.tags.appendChild(textNode("span", "pyjudge-tag", "Python"));
        }
        const marked = !!(problem.state && problem.state.marked);
        nodes.markButton.classList.toggle("is-marked", marked);
        nodes.markButton.setAttribute("aria-pressed", marked ? "true" : "false");
        renderSamples(problem);
        renderHistory(problem);
    }

    function renderAll() {
        updateStats();
        renderProblemList();
        renderProblem();
    }

    function setSaveState(text) {
        if (nodes.saveState) {
            nodes.saveState.textContent = text;
        }
    }

    function setBusy(nextBusy, label) {
        isBusy = !!nextBusy;
        nodes.actions.forEach(function (button) {
            if (button.dataset.action !== "clear") {
                button.disabled = isBusy;
            }
        });
        if (label) {
            setSaveState(label);
        }
    }

    function setPyodideStatus(text, state) {
        if (!nodes.pyodideStatus) {
            return;
        }
        nodes.pyodideStatus.textContent = text;
        nodes.pyodideStatus.classList.toggle("is-ready", state === "ready");
        nodes.pyodideStatus.classList.toggle("is-error", state === "error");
    }

    function apiPost(url, payload) {
        return fetch(url, {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrfToken(),
                "Accept": "application/json"
            },
            body: JSON.stringify(payload || {})
        }).then(function (response) {
            return response.text().then(function (text) {
                let data = {};
                if (text) {
                    try {
                        data = JSON.parse(text);
                    } catch (error) {
                        data = {};
                    }
                }
                if (!response.ok || !data.ok) {
                    if (response.status === 401 && nodes.authGate) {
                        nodes.authGate.hidden = false;
                    }
                    throw new Error(data.message || "请求失败");
                }
                return data;
            });
        });
    }

    function currentProgressPayload(problem, overrides) {
        const state = problem.state || {};
        const nextStatus = overrides && overrides.status
            ? overrides.status
            : (state.status === "accepted" ? "accepted" : "attempted");
        return {
            problem_slug: problem.slug,
            code: editor ? editor.getValue() : codeForProblem(problem),
            custom_input: nodes.customInput ? nodes.customInput.value : "",
            marked: !!state.marked,
            status: nextStatus,
            last_result: overrides && overrides.lastResult ? overrides.lastResult : state.lastResult || {}
        };
    }

    function saveCurrentProgress(showState, overrides) {
        const problem = activeProblem();
        if (!problem || !bootstrap.isAuthenticated) {
            return Promise.resolve(null);
        }
        const payload = currentProgressPayload(problem, overrides || {});
        if (!problem.state) {
            problem.state = {};
        }
        problem.state.code = payload.code;
        problem.state.customInput = payload.custom_input;
        problem.state.status = payload.status;
        problem.state.lastResult = payload.last_result;

        if (showState) {
            setSaveState("保存中...");
        }
        return apiPost(config.saveProgressUrl, payload)
            .then(function (data) {
                problem.state = Object.assign({}, problem.state, data.state || {});
                if (showState) {
                    setSaveState("已保存 " + new Date().toLocaleTimeString("zh-CN", {hour: "2-digit", minute: "2-digit"}));
                }
                renderAll();
                return data;
            })
            .catch(function (error) {
                setSaveState(error.message || "保存失败");
                return null;
            });
    }

    function scheduleSave() {
        if (applyingProblem || !bootstrap.isAuthenticated) {
            return;
        }
        window.clearTimeout(saveTimer);
        setSaveState("有未保存修改");
        saveTimer = window.setTimeout(function () {
            saveCurrentProgress(false);
        }, 1000);
    }

    function applyProblemToEditor(problem) {
        applyingProblem = true;
        if (editor) {
            editor.session.setValue(codeForProblem(problem));
            editor.clearSelection();
        }
        if (nodes.customInput) {
            nodes.customInput.value = customInputForProblem(problem);
        }
        setSaveState(hasPersistedState(problem) ? "已载入上次答案" : "使用初始代码");
        applyingProblem = false;
    }

    function selectProblem(slug) {
        if (slug === activeSlug) {
            return;
        }
        const previous = activeProblem();
        if (previous && editor && bootstrap.isAuthenticated) {
            previous.state = previous.state || {};
            previous.state.code = editor.getValue();
            previous.state.customInput = nodes.customInput.value;
            saveCurrentProgress(false);
        }
        activeSlug = slug;
        const problem = activeProblem();
        applyProblemToEditor(problem);
        renderAll();
        clearResults();
    }

    function outputBlock(label, value) {
        if (!value) {
            return "";
        }
        return label + "\n" + value;
    }

    function resultOutputText(result, mode) {
        if (mode === "run") {
            return [
                outputBlock("标准输出", result.stdout || "(无输出)"),
                outputBlock("标准错误", result.stderr),
                outputBlock("错误", result.error)
            ].filter(Boolean).join("\n\n");
        }
        if (result.hidden) {
            return result.passed ? "隐藏测试已通过。" : (result.error || "隐藏测试未通过。");
        }
        const parts = [];
        if (!result.passed) {
            parts.push("期望输出\n" + (result.expectedStdout || "(空输出)"));
        }
        parts.push("实际输出\n" + (result.stdout || "(无输出)"));
        if (result.stderr) {
            parts.push("标准错误\n" + result.stderr);
        }
        if (result.error) {
            parts.push("错误\n" + result.error);
        }
        return parts.join("\n\n");
    }

    function renderResults(results, title, summary, mode) {
        nodes.resultTitle.textContent = title || "运行结果";
        nodes.resultSummary.textContent = summary || "";
        nodes.resultList.innerHTML = "";
        if (!results.length) {
            nodes.resultList.appendChild(textNode("div", "pyjudge-empty", "没有可显示的结果"));
            return;
        }
        results.forEach(function (result, index) {
            const item = textNode("div", "pyjudge-result-item");
            if (mode === "run") {
                item.classList.add(result.ok ? "is-run" : "is-error");
            } else {
                item.classList.add(result.passed ? "is-pass" : "is-fail");
            }
            const line = textNode("div", "pyjudge-result-line");
            line.appendChild(textNode("span", "", result.title || "运行 " + (index + 1)));
            const rightText = mode === "run"
                ? (result.ok ? "完成 · " + result.durationMs + "ms" : "错误")
                : ((result.passed ? "通过" : "未通过") + " · " + result.durationMs + "ms");
            line.appendChild(textNode("span", "", rightText));
            const output = textNode("pre", "pyjudge-output", resultOutputText(result, mode));
            item.appendChild(line);
            item.appendChild(output);
            nodes.resultList.appendChild(item);
        });
    }

    function clearResults() {
        nodes.resultTitle.textContent = "运行结果";
        nodes.resultSummary.textContent = "等待运行";
        nodes.resultList.innerHTML = "";
        nodes.resultList.appendChild(textNode("div", "pyjudge-empty", "运行、测试或提交后会显示输出。"));
    }

    function createWorkerScript(baseUrl) {
        const wrapper = [
            "import contextlib, io, json, sys, traceback",
            "_stdout = io.StringIO()",
            "_stderr = io.StringIO()",
            "_old_stdin = sys.stdin",
            "_ok = True",
            "_error = ''",
            "try:",
            "    sys.stdin = io.StringIO(CODEMARK_STDIN)",
            "    with contextlib.redirect_stdout(_stdout), contextlib.redirect_stderr(_stderr):",
            "        exec(CODEMARK_SOURCE, {'__name__': '__main__'})",
            "except SystemExit as exc:",
            "    _ok = getattr(exc, 'code', 0) in (None, 0)",
            "    if not _ok:",
            "        _error = 'SystemExit: ' + str(exc)",
            "except BaseException:",
            "    _ok = False",
            "    _error = traceback.format_exc(limit=8)",
            "finally:",
            "    sys.stdin = _old_stdin",
            "_stdout_value = _stdout.getvalue()",
            "_stderr_value = _stderr.getvalue()",
            "_truncated = False",
            "if len(_stdout_value) > CODEMARK_MAX_OUTPUT:",
            "    _stdout_value = _stdout_value[:CODEMARK_MAX_OUTPUT] + '\\n...输出过长，已截断'",
            "    _truncated = True",
            "if len(_stderr_value) > CODEMARK_MAX_OUTPUT:",
            "    _stderr_value = _stderr_value[:CODEMARK_MAX_OUTPUT] + '\\n...错误输出过长，已截断'",
            "    _truncated = True",
            "json.dumps({'ok': _ok, 'stdout': _stdout_value, 'stderr': _stderr_value, 'error': _error, 'truncated': _truncated}, ensure_ascii=False)"
        ].join("\n");

        return [
            "const PYODIDE_BASE_URL = " + JSON.stringify(baseUrl) + ";",
            "const WRAPPER = " + JSON.stringify(wrapper) + ";",
            "let pyodideReady = (async function () {",
            "    importScripts(PYODIDE_BASE_URL + 'pyodide.js');",
            "    const pyodide = await loadPyodide({indexURL: PYODIDE_BASE_URL});",
            "    self.postMessage({type: 'ready'});",
            "    return pyodide;",
            "})().catch(function (error) {",
            "    self.postMessage({type: 'load-error', error: String(error && (error.stack || error.message) || error)});",
            "    throw error;",
            "});",
            "self.onmessage = async function (event) {",
            "    const message = event.data || {};",
            "    if (message.type !== 'run') { return; }",
            "    const startedAt = performance.now();",
            "    try {",
            "        const pyodide = await pyodideReady;",
            "        pyodide.globals.set('CODEMARK_SOURCE', message.code || '');",
            "        pyodide.globals.set('CODEMARK_STDIN', message.stdin || '');",
            "        pyodide.globals.set('CODEMARK_MAX_OUTPUT', message.maxOutput || 65536);",
            "        const raw = await pyodide.runPythonAsync(WRAPPER);",
            "        const result = JSON.parse(raw);",
            "        result.durationMs = Math.round(performance.now() - startedAt);",
            "        self.postMessage({type: 'result', id: message.id, result: result});",
            "    } catch (error) {",
            "        self.postMessage({type: 'result', id: message.id, result: {ok: false, stdout: '', stderr: '', error: String(error && (error.stack || error.message) || error), durationMs: Math.round(performance.now() - startedAt)}});",
            "    }",
            "};"
        ].join("\n");
    }

    function PyodideRunner(baseUrl) {
        this.baseUrl = baseUrl;
        this.worker = null;
        this.pending = null;
        this.runId = 0;
        this.ready = false;
        this.readyPromise = null;
        this.readyResolve = null;
        this.readyReject = null;
    }

    PyodideRunner.prototype.ensureWorker = function () {
        if (this.worker) {
            return this.ready ? Promise.resolve() : this.readyPromise;
        }
        setPyodideStatus("加载中", "loading");
        this.ready = false;
        this.readyPromise = new Promise(function (resolve, reject) {
            this.readyResolve = resolve;
            this.readyReject = reject;
        }.bind(this));
        const blob = new Blob([createWorkerScript(this.baseUrl)], {type: "application/javascript"});
        const workerUrl = URL.createObjectURL(blob);
        this.worker = new Worker(workerUrl);
        URL.revokeObjectURL(workerUrl);
        this.worker.onmessage = this.handleMessage.bind(this);
        this.worker.onerror = this.handleError.bind(this);
        return this.readyPromise;
    };

    PyodideRunner.prototype.handleMessage = function (event) {
        const message = event.data || {};
        if (message.type === "ready") {
            this.ready = true;
            setPyodideStatus("已就绪", "ready");
            if (this.readyResolve) {
                this.readyResolve();
            }
            return;
        }
        if (message.type === "load-error") {
            this.ready = false;
            setPyodideStatus("加载失败", "error");
            if (this.readyReject) {
                this.readyReject(new Error(message.error || "Pyodide 加载失败"));
            }
            if (this.pending) {
                this.pending.reject(new Error(message.error || "Pyodide 加载失败"));
                this.pending = null;
            }
            return;
        }
        if (message.type !== "result" || !this.pending || message.id !== this.pending.id) {
            return;
        }
        window.clearTimeout(this.pending.timer);
        const resolve = this.pending.resolve;
        this.pending = null;
        resolve(message.result || {ok: false, stdout: "", stderr: "", error: "没有返回结果", durationMs: 0});
    };

    PyodideRunner.prototype.handleError = function (error) {
        setPyodideStatus("运行异常", "error");
        if (this.pending) {
            window.clearTimeout(this.pending.timer);
            this.pending.reject(new Error(error.message || "Pyodide Worker 异常"));
            this.pending = null;
        }
        this.reset();
    };

    PyodideRunner.prototype.reset = function () {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.ready = false;
        this.readyPromise = null;
        this.readyResolve = null;
        this.readyReject = null;
    };

    PyodideRunner.prototype.run = function (code, stdin, timeoutMs) {
        const self = this;
        return this.ensureWorker().then(function () {
            if (self.pending) {
                return Promise.reject(new Error("已有代码正在运行"));
            }
            const id = ++self.runId;
            const worker = self.worker;
            return new Promise(function (resolve, reject) {
                const timer = window.setTimeout(function () {
                    if (self.pending && self.pending.id === id) {
                        self.pending = null;
                        self.reset();
                        setPyodideStatus("已终止", "error");
                        resolve({
                            ok: false,
                            stdout: "",
                            stderr: "",
                            error: "运行超时，已终止。本题单个测试点限制 " + timeoutMs + "ms。",
                            durationMs: timeoutMs,
                            timeout: true
                        });
                    }
                }, timeoutMs + 120);
                self.pending = {id: id, resolve: resolve, reject: reject, timer: timer};
                worker.postMessage({
                    type: "run",
                    id: id,
                    code: code,
                    stdin: stdin,
                    maxOutput: 65536
                });
            });
        }).catch(function (error) {
            return {
                ok: false,
                stdout: "",
                stderr: "",
                error: error.message || "Pyodide 加载失败",
                durationMs: 0
            };
        });
    };

    function ensureRunner() {
        if (!runner) {
            runner = new PyodideRunner(config.pyodideBaseUrl || "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/");
        }
        return runner;
    }

    function testResultFromRun(test, runResult, index) {
        const actual = normalizeOutput(runResult.stdout);
        const expected = normalizeOutput(test.expectedStdout);
        return {
            title: test.title || "测试点 " + (index + 1),
            hidden: !!test.isHidden,
            ok: !!runResult.ok,
            passed: !!runResult.ok && actual === expected,
            stdout: runResult.stdout || "",
            stderr: runResult.stderr || "",
            error: runResult.error || "",
            expectedStdout: test.expectedStdout || "",
            durationMs: runResult.durationMs || 0,
            timeout: !!runResult.timeout
        };
    }

    async function runSingle() {
        const problem = activeProblem();
        if (!problem || isBusy) {
            return;
        }
        if (!bootstrap.isAuthenticated) {
            nodes.authGate.hidden = false;
            return;
        }
        setBusy(true, "运行中...");
        const code = editor.getValue();
        const stdin = nodes.customInput.value || "";
        try {
            const result = await ensureRunner().run(code, stdin, problem.timeLimitMs || 1500);
            renderResults([{
                title: "自定义输入",
                ok: result.ok,
                stdout: result.stdout || "",
                stderr: result.stderr || "",
                error: result.error || "",
                durationMs: result.durationMs || 0
            }], result.ok ? "运行完成" : "运行错误", result.ok ? "代码已执行完成" : "请根据错误信息修改代码", "run");
            await saveCurrentProgress(false, {
                status: problem.state && problem.state.status === "accepted" ? "accepted" : "attempted",
                lastResult: {status: result.ok ? "run" : "error", runtimeMs: result.durationMs || 0}
            });
        } catch (error) {
            renderResults([{title: "运行失败", ok: false, error: error.message || "运行失败", durationMs: 0}], "运行失败", "Pyodide 未能完成本次运行", "run");
        } finally {
            setBusy(false);
        }
    }

    async function runTestSet(mode) {
        const problem = activeProblem();
        if (!problem || isBusy) {
            return;
        }
        if (!bootstrap.isAuthenticated) {
            nodes.authGate.hidden = false;
            return;
        }
        const tests = mode === "submit" ? (problem.tests || []) : sampleTests(problem);
        if (!tests.length) {
            renderResults([], "没有测试点", "请先在后台为题目添加测试点", "test");
            return;
        }
        setBusy(true, mode === "submit" ? "提交判题中..." : "样例测试中...");
        const code = editor.getValue();
        const results = [];
        const startedAt = performance.now();
        try {
            for (let i = 0; i < tests.length; i += 1) {
                const runResult = await ensureRunner().run(code, tests[i].stdin || "", problem.timeLimitMs || 1500);
                results.push(testResultFromRun(tests[i], runResult, i));
                const passedSoFar = results.filter(function (result) {
                    return result.passed;
                }).length;
                renderResults(
                    results,
                    mode === "submit" ? "提交中" : "样例测试",
                    passedSoFar + "/" + tests.length + " 已通过",
                    "test"
                );
            }
            const passedCount = results.filter(function (result) {
                return result.passed;
            }).length;
            const totalCount = tests.length;
            const hasRuntimeError = results.some(function (result) {
                return !result.ok;
            });
            const accepted = passedCount === totalCount;
            const runtimeMs = Math.round(performance.now() - startedAt);
            renderResults(
                results,
                accepted ? "全部通过" : "仍需修改",
                passedCount + "/" + totalCount + " 通过 · " + runtimeMs + "ms",
                "test"
            );
            const lastResult = {
                status: accepted ? "accepted" : (hasRuntimeError ? "error" : "failed"),
                passedCount: passedCount,
                totalCount: totalCount,
                runtimeMs: runtimeMs
            };
            if (mode === "submit") {
                await submitResult(problem, code, results, lastResult);
            } else {
                await saveCurrentProgress(false, {
                    status: accepted && totalCount === (problem.tests || []).length ? "accepted" : "attempted",
                    lastResult: lastResult
                });
            }
        } catch (error) {
            renderResults([{title: "判题失败", ok: false, passed: false, error: error.message || "判题失败", durationMs: 0}], "判题失败", "Pyodide 未能完成测试", "test");
        } finally {
            setBusy(false);
        }
    }

    function submitResult(problem, code, results, summary) {
        const payload = {
            problem_slug: problem.slug,
            code: code,
            status: summary.status,
            passed_count: summary.passedCount,
            total_count: summary.totalCount,
            runtime_ms: summary.runtimeMs,
            results: results.map(function (result) {
                return {
                    title: result.title,
                    hidden: result.hidden,
                    passed: result.passed,
                    ok: result.ok,
                    durationMs: result.durationMs,
                    timeout: result.timeout,
                    error: result.error ? result.error.slice(0, 1200) : ""
                };
            })
        };
        return apiPost(config.submitUrl, payload).then(function (data) {
            problem.state = Object.assign({}, problem.state || {}, data.state || {});
            problem.submissions = problem.submissions || [];
            if (data.submission) {
                problem.submissions.unshift(data.submission);
                problem.submissions = problem.submissions.slice(0, 6);
            }
            renderAll();
            setSaveState(summary.status === "accepted" ? "已提交：全部通过" : "已提交：未通过");
            return data;
        }).catch(function (error) {
            setSaveState(error.message || "提交保存失败");
        });
    }

    function toggleMark() {
        const problem = activeProblem();
        if (!problem) {
            return;
        }
        if (!bootstrap.isAuthenticated) {
            nodes.authGate.hidden = false;
            return;
        }
        problem.state = problem.state || {status: "todo"};
        problem.state.marked = !problem.state.marked;
        renderAll();
        saveCurrentProgress(true, {
            status: problem.state.status || "todo",
            lastResult: problem.state.lastResult || {}
        });
    }

    function initAce() {
        if (!window.ace) {
            setSaveState("Ace 编辑器加载失败");
            return;
        }
        if (config.aceBasePath) {
            window.ace.config.set("basePath", config.aceBasePath);
        }
        editor = window.ace.edit("pyjudgeEditor");
        editor.setTheme("ace/theme/github");
        editor.session.setMode("ace/mode/python");
        editor.session.setUseWorker(false);
        editor.setOptions({
            fontSize: "14px",
            tabSize: 4,
            useSoftTabs: true,
            showPrintMargin: false,
            wrap: true,
            enableBasicAutocompletion: true,
            enableLiveAutocompletion: true
        });
        editor.session.on("change", scheduleSave);
        applyProblemToEditor(activeProblem());
    }

    function bindEvents() {
        if (nodes.problemList) {
            nodes.problemList.addEventListener("click", function (event) {
                const item = event.target.closest("[data-slug]");
                if (item) {
                    selectProblem(item.dataset.slug);
                }
            });
        }
        nodes.filters.forEach(function (button) {
            button.addEventListener("click", function () {
                activeFilter = button.dataset.filter || "all";
                nodes.filters.forEach(function (other) {
                    other.classList.toggle("is-active", other === button);
                });
                renderProblemList();
            });
        });
        if (nodes.markButton) {
            nodes.markButton.addEventListener("click", toggleMark);
        }
        if (nodes.customInput) {
            nodes.customInput.addEventListener("input", scheduleSave);
        }
        nodes.actions.forEach(function (button) {
            button.addEventListener("click", function () {
                const action = button.dataset.action;
                if (action === "save") {
                    saveCurrentProgress(true);
                } else if (action === "run") {
                    runSingle();
                } else if (action === "test") {
                    runTestSet("test");
                } else if (action === "submit") {
                    runTestSet("submit");
                } else if (action === "clear") {
                    clearResults();
                }
            });
        });
    }

    function watchLoginAndReload() {
        if (bootstrap.isAuthenticated) {
            return;
        }
        if (nodes.authGate) {
            nodes.authGate.hidden = false;
        }
        const authProbe = document.querySelector("[data-account-auth-only]");
        if (!authProbe || !window.MutationObserver) {
            return;
        }
        const observer = new MutationObserver(function () {
            if (!authProbe.hidden) {
                observer.disconnect();
                window.location.reload();
            }
        });
        observer.observe(authProbe, {attributes: true, attributeFilter: ["hidden"]});
    }

    function init() {
        renderAll();
        clearResults();
        initAce();
        bindEvents();
        watchLoginAndReload();
        setPyodideStatus("准备中", "loading");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
