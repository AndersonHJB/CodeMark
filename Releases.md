# 版本介绍

## CodeMark-V0.5 2024-07-21 22:57:43

1. 实现代码运行 
2. 代码编辑 
3. 代码框跟随用户编辑变化
   1. 初始化时设定 `textarea` 的高度：在页面加载时，根据代码内容自动调整 `textarea` 的初始高度。
   2. 编辑时动态调整高度：当用户编辑 `textarea` 中的内容时，自动调整其高度以适应新增内容。
   3. 最小高度限制：设置一个最小高度，确保即使代码框内没有内容，也保持一定的显示效果。

## CodeMark-V0.5.1 2024-07-22 12:02:55

1. 行号显示：通过 lineNumbersDiv 显示每行的行号，确保与代码对齐。 
2. 动态行号更新：通过updateLineNumbers函数动态更新行号，以匹配 textarea 中的行数。
3. 布局调整：使用 flex 布局对齐行号和代码输入区。
4. 输出框位置调整：输出框始终显示在代码框的下方。
5. 改进代码字体大小。

## CodeMark-V0.5.2 2024-07-22 12:29:06

1. 动态高度调整：通过计算 textarea.scrollHeight，在页面加载时立即调整 textarea 的高度，确保它能够根据初始内容自适应高度。

## CodeMark-V0.5.3 2024-07-22 22:00:35

添加了以下几个主要修改来实现 Control/Command+Enter 快捷键执行代码的功能：

1. **增加快捷键执行功能的函数绑定**：
    - 在创建"Run Code"按钮的 `createRunButton` 函数中，我添加了一个额外的事件监听器，它监听 `keydown` 事件。这个监听器设置在 `textarea` 元素上，用于捕捉键盘事件。

2. **快捷键处理逻辑**：
    - 事件监听器检查是否同时按下了 Ctrl 键（`e.ctrlKey`）或 Command 键（`e.metaKey`）和Enter键（`e.key === 'Enter'`）。如果这两个条件同时满足，它将调用 `runCode` 函数，这个函数是从原有的点击事件中提取出来的，以便重复使用。

3. **代码重构以支持重用**：
    - 将 `button.onclick` 中的代码移动到了新的 `runCode` 函数中。这样做不仅让 `onclick` 处理和快捷键处理可以共用相同的代码，同时也使代码更整洁、易于维护。

这些修改使得用户可以通过快捷键直接运行代码，而不需要鼠标点击按钮，提高了界面的交互效率。