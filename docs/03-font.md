在 HTML 代码中，字体大小主要通过 CSS 样式控制。具体的字体大小设置分布在几个不同的部分：

1. **整体页面的字体大小**：这是在`body`标签的样式中设置的，用于定义整个页面的默认字体大小。

2. **标题的字体大小**：这是在`h1, h2, h3`标签的样式中设置的，用于定义标题的字体大小。

3. **代码区域的字体大小**：在`textarea`和`.line-numbers`样式中可以定义代码区域的字体大小。

### 修改示例

#### 1. 修改整体页面的字体大小

在`body`样式中修改`font-size`属性。例如，要将整体字体大小改为20px，可以这样做：

```css
body {
    font-family: 'Open Sans', sans-serif;
    line-height: 1.6;
    font-size: 20px;  /* 修改这里的值来改变整体字体大小 */
    background-color: #fff;
    color: #333;
    padding: 20px;
    margin: 0;
}
```

#### 2. 修改标题的字体大小

在`h1, h2, h3`样式中修改`font-size`属性。例如，要改变标题的字体大小：

```css
h1, h2, h3 {
    font-family: 'Merriweather', serif;
    color: #444;
    font-size: 24px; /* 添加或修改这里的值来改变标题的字体大小 */
}
```

#### 3. 修改代码区域的字体大小

在`textarea`和`.line-numbers`样式中修改`font-size`属性。例如，要改变代码区域的字体大小：

```css
textarea, .line-numbers {
    font-size: 16px; /* 修改这里的值来改变代码区域的字体大小 */
    font-family: 'Monaco', 'Menlo', monospace;
    line-height: 1.5;
}
```

根据需要，可以调整上述 CSS 样式中的 `font-size` 属性值来达到你想要的字体大小效果。