注释：

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Article</title>
    <!-- 引入 Pyodide JavaScript 库，使我们可以在浏览器中运行 Python 代码 -->
    <script src="https://cdn.jsdelivr.net/pyodide/v0.21.0/full/pyodide.js"></script>
    <style>
        /* 定义代码块和输出框的基本样式 */
        .code-block {
            border: 1px solid #ccc;
            padding: 10px;
            margin-top: 10px;
        }
        .output {
            border: 1px solid #ccc;
            padding: 10px;
            margin-top: 5px;
            background-color: #f9f9f9;
            white-space: pre-wrap; /* 保持输出格式，如空格和换行 */
        }
    </style>
</head>
<body>
    <!-- 展示由 Flask 渲染的 Markdown 内容 -->
    <div id="content">
        {{ content|safe }}
    </div>

    <script>
        // 异步函数加载 Pyodide，并预加载任何必需的 Python 包
        async function loadPyodideAndPackages() {
            self.pyodide = await loadPyodide({
                indexURL : "https://cdn.jsdelivr.net/pyodide/v0.21.0/full/"
            });
            // 这里加载额外的 Python 包，如 micropip，可以根据需要加载其他包
            await self.pyodide.loadPackage(['micropip']);
        }
        loadPyodideAndPackages();

        // 为每个代码块创建一个运行按钮
        function createRunButton(codeBlock) {
            const button = document.createElement('button');
            button.textContent = 'Run Code';
            button.onclick = async function () {
                const outputElement = document.createElement('div');
                outputElement.className = 'output';
                codeBlock.parentNode.appendChild(outputElement);

                try {
                    // 重定向 Python 的标准输出和错误输出到 StringIO 对象
                    self.pyodide.runPython(`
                        import sys
                        import io
                        sys.stdout = io.StringIO()
                        sys.stderr = io.StringIO()
                    `);

                    // 执行 Python 代码块中的代码
                    await self.pyodide.runPythonAsync(codeBlock.textContent);

                    // 从 StringIO 获取并显示输出和错误
                    const stdout = self.pyodide.runPython('sys.stdout.getvalue()');
                    const stderr = self.pyodide.runPython('sys.stderr.getvalue()');

                    // 如果有输出或错误，显示它们，否则显示 "No output."
                    outputElement.textContent = stdout + stderr || 'No output.';
                } catch (error) {
                    // 捕获并显示任何在执行 Python 代码时发生的错误
                    outputElement.textContent = `Error:\n${error}`;
                }
            };
            return button;
        }

        // 当页面加载完成时，为支持 Python 的每个代码块添加运行按钮
        window.onload = function() {
            const codeBlocks = document.querySelectorAll('pre > code');
            codeBlocks.forEach(codeBlock => {
                if (codeBlock.classList.contains('language-python')) {
                    const container = document.createElement('div');
                    container.className = 'code-block';
                    codeBlock.parentNode.insertBefore(container, codeBlock);
                    container.appendChild(codeBlock);
                    container.appendChild(createRunButton(codeBlock));
                }
            });
        }
    </script>
</body>
</html>

```