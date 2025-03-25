你好，我是悦创。

要使页面上显示的 Python 代码块可编辑，并且可以执行编辑后的代码，我们需要进行一些调整，确保代码块在一个可编辑的元素中，例如 `<textarea>` 或 `<pre contenteditable="true">`。

以下是如何调整现有的 `article.html` 页面，以便使代码块可编辑，并能够执行修改后的代码：

### 更新 `article.html` 以支持代码编辑

这个版本的页面模板中，我们会将每个Python代码块放入一个 `<textarea>` 中（而非仅仅是 `<pre>` 标签内），使得用户可以编辑代码。之后，执行按钮将运行编辑后的代码，并将结果显示在输出区域。

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Article</title>
    <script src="https://cdn.jsdelivr.net/pyodide/v0.21.0/full/pyodide.js"></script>
    <style>
        .code-block {
            border: 1px solid #ccc;
            padding: 10px;
            margin-top: 10px;
            position: relative;
        }
        .output {
            border: 1px solid #ccc;
            padding: 10px;
            margin-top: 5px;
            background-color: #f9f9f9;
            white-space: pre-wrap; /* Ensures formatting is maintained */
        }
        textarea {
            width: 100%;
            height: 150px;
            font-family: monospace;
        }
        button {
            position: absolute;
            right: 10px;
            top: 10px;
        }
    </style>
</head>
<body>
    <div id="content">
        {{ content|safe }}
    </div>

    <script>
        async function loadPyodideAndPackages() {
            self.pyodide = await loadPyodide({
                indexURL : "https://cdn.jsdelivr.net/pyodide/v0.21.0/full/"
            });
            await self.pyodide.loadPackage(['micropip']);
        }
        loadPyodideAndPackages();

        function createRunButton(textarea) {
            const button = document.createElement('button');
            button.textContent = 'Run Code';
            button.onclick = async function () {
                const outputElement = document.createElement('div');
                outputElement.className = 'output';
                textarea.parentNode.appendChild(outputElement);

                try {
                    // Redirect Python's stdout and stderr
                    self.pyodide.runPython(`
                        import sys
                        import io
                        sys.stdout = io.StringIO()
                        sys.stderr = io.StringIO()
                    `);

                    await self.pyodide.runPythonAsync(textarea.value);

                    // Capture Python's stdout and stderr
                    const stdout = self.pyodide.runPython('sys.stdout.getvalue()');
                    const stderr = self.pyodide.runPython('sys.stderr.getvalue()');

                    outputElement.textContent = stdout + stderr || 'No output.';
                } catch (error) {
                    outputElement.textContent = `Error:\n${error}`;
                }
            };
            return button;
        }

        window.onload = function() {
            const codeBlocks = document.querySelectorAll('pre > code.language-python');
            codeBlocks.forEach(codeBlock => {
                const textarea = document.createElement('textarea');
                textarea.value = codeBlock.textContent.trim();
                const container = document.createElement('div');
                container.className = 'code-block';
                codeBlock.parentNode.insertBefore(container, codeBlock);
                container.appendChild(textarea);
                container.appendChild(createRunButton(textarea));
                codeBlock.style.display = 'none'; // Hide original code block
            });
        }
    </script>
</body>
</html>
```

### 功能描述：

1. **代码块转换**：原始的 `<pre>` 标签中的代码被转移到 `<textarea>` 中，允许用户编辑。
2. **运行按钮**：每个 `<textarea>` 旁边都有一个运行按钮，点击后执行该区域的代码。
3. **输出显示**：代码执行的输出（或错误）显示在 `<textarea>` 下方的输出区域。

现在，用户可以在页面上直接编辑 Python 代码，并通过点击相应的运行按钮来执行修改后的代码，输出结果将显示在每个代码块下方。这样提供了一个交互式的学习或测试 Python 代码的环境。

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Article</title>
    <!-- 引入 Pyodide 库，允许在浏览器中运行 Python 代码 -->
    <script src="https://cdn.jsdelivr.net/pyodide/v0.21.0/full/pyodide.js"></script>
    <style>
        /* 代码块的样式定义 */
        .code-block {
            border: 1px solid #ccc;
            padding: 10px;
            margin-top: 10px;
            position: relative;
        }
        /* 输出区域的样式定义 */
        .output {
            border: 1px solid #ccc;
            padding: 10px;
            margin-top: 5px;
            background-color: #f9f9f9;
            white-space: pre-wrap; /* 保持格式化文本的格式 */
        }
        /* 可编辑文本区域的样式定义 */
        textarea {
            width: 100%;
            height: 150px;
            font-family: monospace; /* 使用等宽字体 */
        }
        /* 运行按钮的样式定义 */
        button {
            position: absolute;
            right: 10px;
            top: 10px;
        }
    </style>
</head>
<body>
    <div id="content">
        <!-- 安全地渲染文章内容 -->
        {{ content|safe }}
    </div>

    <script>
        /* 异步函数，用于加载并初始化 Pyodide */
        async function loadPyodideAndPackages() {
            self.pyodide = await loadPyodide({
                indexURL : "https://cdn.jsdelivr.net/pyodide/v0.21.0/full/"
            });
            // 加载额外的 Python 包，如果需要
            await self.pyodide.loadPackage(['micropip']);
        }
        loadPyodideAndPackages();

        /* 函数：为每个代码块创建一个运行按钮 */
        function createRunButton(textarea) {
            const button = document.createElement('button');
            button.textContent = 'Run Code';
            button.onclick = async function () {
                const outputElement = document.createElement('div');
                outputElement.className = 'output';
                textarea.parentNode.appendChild(outputElement);

                try {
                    // 重定向 Python 的标准输出和错误输出
                    self.pyodide.runPython(`
                        import sys
                        import io
                        sys.stdout = io.StringIO()
                        sys.stderr = io.StringIO()
                    `);

                    // 异步执行文本区域中的 Python 代码
                    await self.pyodide.runPythonAsync(textarea.value);

                    // 获取并显示 Python 的标准输出和错误输出
                    const stdout = self.pyodide.runPython('sys.stdout.getvalue()');
                    const stderr = self.pyodide.runPython('sys.stderr.getvalue()');

                    outputElement.textContent = stdout + stderr || 'No output.';
                } catch (error) {
                    // 捕获并显示执行错误
                    outputElement.textContent = `Error:\n${error}`;
                }
            };
            return button;
        }

        /* 当页面加载完成后执行的函数 */
        window.onload = function() {
            // 选择所有具有 Python 代码的块
            const codeBlocks = document.querySelectorAll('pre > code.language-python');
            codeBlocks.forEach(codeBlock => {
                // 为每个代码块创建一个可编辑的文本区域
                const textarea = document.createElement('textarea');
                textarea.value = codeBlock.textContent.trim(); // 移除多余的空格
                const container = document.createElement('div');
                container.className = 'code-block';
                codeBlock.parentNode.insertBefore(container, codeBlock);
                container.appendChild(textarea);
                container.appendChild(createRunButton(textarea));
                codeBlock.style.display = 'none'; // 隐藏原始的代码块
            });
        }
    </script>
</body>
</html>

```