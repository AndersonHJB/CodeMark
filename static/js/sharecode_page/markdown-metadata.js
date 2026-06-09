/* Markdown metadata editor helpers for the Sharecode Ace editor. */
let markdownMetadataDateButton = null;
let markdownMetadataDateUpdateFrame = null;
let markdownMetadataDateAutofillBound = false;

function padMarkdownMetadataDatePart(value) {
    return String(value).padStart(2, "0");
}

function formatMarkdownMetadataCurrentDate(date) {
    const d = date || new Date();
    return [
        d.getFullYear(),
        padMarkdownMetadataDatePart(d.getMonth() + 1),
        padMarkdownMetadataDatePart(d.getDate())
    ].join("-") + " " + [
        padMarkdownMetadataDatePart(d.getHours()),
        padMarkdownMetadataDatePart(d.getMinutes()),
        padMarkdownMetadataDatePart(d.getSeconds())
    ].join(":");
}

function ensureMarkdownMetadataDateButton() {
    if (markdownMetadataDateButton) {
        return markdownMetadataDateButton;
    }
    const button = document.createElement("button");
    button.id = "markdownMetadataDateAutofillButton";
    button.className = "markdown-date-autofill-button";
    button.type = "button";
    button.setAttribute("aria-hidden", "true");
    button.innerHTML = '<i class="bi bi-calendar-plus" aria-hidden="true"></i><span>填充当前日期</span>';
    button.addEventListener("mousedown", function (event) {
        event.preventDefault();
    });
    button.addEventListener("click", function (event) {
        event.preventDefault();
        insertMarkdownMetadataCurrentDate();
    });
    document.body.appendChild(button);
    markdownMetadataDateButton = button;
    return button;
}

function isMarkdownMetadataDateAutofillContext() {
    if (!window.editor) {
        return false;
    }
    const editorElement = document.getElementById("editor");
    const editorStyle = editorElement && window.getComputedStyle ? window.getComputedStyle(editorElement) : null;
    if (!editorElement
        || editorElement.style.display === "none"
        || (editorStyle && (editorStyle.display === "none" || editorStyle.visibility === "hidden"))
        || !editorElement.getClientRects().length) {
        return false;
    }
    const active = typeof getActiveProjectFile === "function" ? getActiveProjectFile() : null;
    if (active && active.kind === "text") {
        return typeof isMarkdownDocumentFile === "function" && isMarkdownDocumentFile(active);
    }
    return typeof getCurrentLanguageValue === "function" && getCurrentLanguageValue() === "markdown";
}

function getMarkdownMetadataEmptyDateLineInfo() {
    if (!isMarkdownMetadataDateAutofillContext() || !window.editor.session) {
        return null;
    }
    const cursor = window.editor.getCursorPosition();
    const row = cursor && Number.isFinite(cursor.row) ? cursor.row : 0;
    const line = window.editor.session.getLine(row) || "";
    const match = line.match(/^(\s*date\s*:\s*)(.*)$/i);
    if (!match) {
        return null;
    }
    const rawValue = match[2] || "";
    const value = typeof stripMarkdownMetadataInlineComment === "function"
        ? stripMarkdownMetadataInlineComment(rawValue)
        : rawValue.replace(/\s+#.*$/, "").trim();
    if (value) {
        return null;
    }
    return {
        row,
        line,
        prefix: match[1]
    };
}

function hideMarkdownMetadataDateAutofillButton() {
    const button = ensureMarkdownMetadataDateButton();
    button.classList.remove("is-visible");
    button.setAttribute("aria-hidden", "true");
}

function updateMarkdownMetadataDateAutofillButton() {
    markdownMetadataDateUpdateFrame = null;
    const button = ensureMarkdownMetadataDateButton();
    const info = getMarkdownMetadataEmptyDateLineInfo();
    if (!info || !window.editor || !window.editor.renderer) {
        hideMarkdownMetadataDateAutofillButton();
        return;
    }
    let coords = null;
    try {
        coords = window.editor.renderer.textToScreenCoordinates(info.row, info.line.length);
    } catch (e) {
        coords = null;
    }
    if (!coords) {
        hideMarkdownMetadataDateAutofillButton();
        return;
    }
    button.classList.add("is-visible");
    button.setAttribute("aria-hidden", "false");

    const viewportPadding = 10;
    let left = coords.pageX + 12;
    let top = coords.pageY - 6;
    const rect = button.getBoundingClientRect();
    const maxLeft = Math.max(viewportPadding, window.innerWidth - rect.width - viewportPadding);
    const maxTop = Math.max(viewportPadding, window.innerHeight - rect.height - viewportPadding);
    left = Math.min(Math.max(viewportPadding, left), maxLeft);
    top = Math.min(Math.max(viewportPadding, top), maxTop);
    button.style.left = left + "px";
    button.style.top = top + "px";
}

function scheduleMarkdownMetadataDateAutofillUpdate() {
    if (markdownMetadataDateUpdateFrame) {
        return;
    }
    markdownMetadataDateUpdateFrame = window.requestAnimationFrame
        ? window.requestAnimationFrame(updateMarkdownMetadataDateAutofillButton)
        : setTimeout(updateMarkdownMetadataDateAutofillButton, 16);
}

function getMarkdownMetadataAceRangeConstructor() {
    if (typeof getAceRangeConstructor === "function") {
        return getAceRangeConstructor();
    }
    if (window.ace && typeof window.ace.require === "function") {
        const rangeModule = window.ace.require("ace/range");
        return rangeModule && rangeModule.Range;
    }
    return null;
}

function insertMarkdownMetadataCurrentDate() {
    const info = getMarkdownMetadataEmptyDateLineInfo();
    if (!info || !window.editor || !window.editor.session) {
        hideMarkdownMetadataDateAutofillButton();
        return;
    }
    const Range = getMarkdownMetadataAceRangeConstructor();
    if (!Range) {
        return;
    }
    const value = formatMarkdownMetadataCurrentDate();
    const prefix = /\s$/.test(info.prefix) ? info.prefix : info.prefix + " ";
    const nextLine = prefix + value;
    window.editor.session.replace(new Range(info.row, 0, info.row, info.line.length), nextLine);
    window.editor.focus();
    window.editor.moveCursorTo(info.row, nextLine.length);
    scheduleMarkdownMetadataDateAutofillUpdate();
}

function bindMarkdownMetadataDateAutofill() {
    if (markdownMetadataDateAutofillBound || !window.editor || !window.editor.session) {
        return;
    }
    markdownMetadataDateAutofillBound = true;
    ensureMarkdownMetadataDateButton();
    window.editor.selection.on("changeCursor", scheduleMarkdownMetadataDateAutofillUpdate);
    window.editor.session.on("change", scheduleMarkdownMetadataDateAutofillUpdate);
    window.editor.session.on("changeScrollTop", scheduleMarkdownMetadataDateAutofillUpdate);
    window.editor.session.on("changeScrollLeft", scheduleMarkdownMetadataDateAutofillUpdate);
    window.editor.renderer.on("afterRender", scheduleMarkdownMetadataDateAutofillUpdate);
    window.addEventListener("resize", scheduleMarkdownMetadataDateAutofillUpdate);
    document.querySelectorAll("[data-share-view-mode], #previewFullscreenButton").forEach(control => {
        control.addEventListener("click", function () {
            setTimeout(scheduleMarkdownMetadataDateAutofillUpdate, 0);
        });
    });
    document.querySelectorAll("#lang-selector-desktop, #lang-selector-mobile").forEach(control => {
        control.addEventListener("change", scheduleMarkdownMetadataDateAutofillUpdate);
    });
    scheduleMarkdownMetadataDateAutofillUpdate();
}
