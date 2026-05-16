/* Sharecode line-number selection and Ace marker rendering. */
function normalizeHighlightedLines(rawLines) {
    let source = [];
    if (Array.isArray(rawLines)) {
        source = rawLines;
    } else if (typeof rawLines === "string") {
        source = rawLines.split(/[\s,]+/);
    }

    const seen = new Set();
    const normalized = [];
    source.forEach(item => {
        const lineNumber = Number(item);
        if (Number.isInteger(lineNumber) && lineNumber > 0 && !seen.has(lineNumber)) {
            seen.add(lineNumber);
            normalized.push(lineNumber);
        }
    });
    return normalized.sort((a, b) => a - b);
}

function getEditorDocumentLineCount() {
    if (!window.editor || !editor.session) {
        return 0;
    }
    return editor.session.getLength();
}

function clampHighlightedLinesToEditor(rawLines) {
    const lineCount = getEditorDocumentLineCount();
    return normalizeHighlightedLines(rawLines).filter(lineNumber => lineNumber <= lineCount);
}

function getAceRangeConstructor() {
    if (window.ace && typeof ace.require === "function") {
        const rangeModule = ace.require("ace/range");
        return rangeModule && rangeModule.Range;
    }
    return window.ace && ace.Range;
}

function clearActiveLineHighlightMarkers() {
    if (!window.editor || !editor.session || !activeLineHighlightMarkers.length) {
        activeLineHighlightMarkers = [];
        return;
    }

    activeLineHighlightMarkers.forEach(marker => {
        if (marker.markerId !== null && marker.markerId !== undefined) {
            editor.session.removeMarker(marker.markerId);
        }
        if (typeof editor.session.removeGutterDecoration === "function" && marker.row >= 0) {
            editor.session.removeGutterDecoration(marker.row, SHARECODE_LINE_HIGHLIGHT_GUTTER_CLASS);
        }
    });
    activeLineHighlightMarkers = [];
}

function renderActiveLineHighlights() {
    clearActiveLineHighlightMarkers();
    if (!window.editor || !editor.session) {
        return;
    }

    const active = getActiveProjectFile();
    if (!active || active.kind !== "text") {
        return;
    }

    const highlightedLines = clampHighlightedLinesToEditor(active.highlighted_lines);
    if (!highlightedLines.length) {
        return;
    }

    const Range = getAceRangeConstructor();
    if (!Range) {
        return;
    }

    highlightedLines.forEach(lineNumber => {
        const row = lineNumber - 1;
        const markerId = editor.session.addMarker(
            new Range(row, 0, row, 1),
            SHARECODE_LINE_HIGHLIGHT_CLASS,
            "fullLine"
        );
        if (typeof editor.session.addGutterDecoration === "function") {
            editor.session.addGutterDecoration(row, SHARECODE_LINE_HIGHLIGHT_GUTTER_CLASS);
        }
        activeLineHighlightMarkers.push({markerId, row});
    });
}

function refreshActiveLineHighlights() {
    renderActiveLineHighlights();
}

function getLineHighlightRange(startLine, endLine, lineCount) {
    const start = Math.max(1, Math.min(startLine, endLine));
    const end = Math.min(lineCount, Math.max(startLine, endLine));
    const lines = [];
    for (let line = start; line <= end; line++) {
        lines.push(line);
    }
    return lines;
}

function getActiveLineHighlightAnchor(active, lineCount) {
    const anchorLine = Number(active && active.line_highlight_anchor);
    if (!Number.isInteger(anchorLine) || anchorLine < 1 || anchorLine > lineCount) {
        return 0;
    }
    return anchorLine;
}

function toggleActiveLineHighlight(lineNumber, options) {
    const active = getActiveProjectFile();
    if (!active || active.kind !== "text") {
        return;
    }

    syncActiveEditorToProject();
    const targetLine = Number(lineNumber);
    const lineCount = getEditorDocumentLineCount();
    if (!Number.isInteger(targetLine) || targetLine < 1 || targetLine > lineCount) {
        return;
    }

    const highlightedSet = new Set(clampHighlightedLinesToEditor(active.highlighted_lines));
    const opts = options || {};
    const anchorLine = getActiveLineHighlightAnchor(active, lineCount);
    if (opts.rangeSelect && anchorLine) {
        getLineHighlightRange(anchorLine, targetLine, lineCount).forEach(line => {
            highlightedSet.add(line);
        });
    } else {
        if (highlightedSet.has(targetLine)) {
            highlightedSet.delete(targetLine);
        } else {
            highlightedSet.add(targetLine);
        }
        active.line_highlight_anchor = targetLine;
    }
    active.highlighted_lines = Array.from(highlightedSet).sort((a, b) => a - b);
    renderActiveLineHighlights();
    scheduleSharecodeDraftCacheSave();
}

function handleEditorGutterLineHighlightClick(e) {
    const domEvent = e && e.domEvent;
    const target = domEvent && domEvent.target;
    if (!target || domEvent.button !== 0) {
        return;
    }

    const gutterCell = typeof target.closest === "function"
        ? target.closest(".ace_gutter-cell")
        : target;
    if (!gutterCell || String(gutterCell.className || "").indexOf("ace_gutter-cell") === -1) {
        return;
    }

    const active = getActiveProjectFile();
    if (!active || active.kind !== "text") {
        return;
    }

    const position = typeof e.getDocumentPosition === "function" ? e.getDocumentPosition() : null;
    const row = position && Number.isInteger(position.row) ? position.row : -1;
    if (row < 0) {
        return;
    }

    toggleActiveLineHighlight(row + 1, {rangeSelect: !!domEvent.shiftKey});
    if (typeof e.stop === "function") {
        e.stop();
    } else {
        domEvent.preventDefault();
        domEvent.stopPropagation();
    }
}

function bindEditorLineHighlightSelection() {
    if (!window.editor || typeof editor.on !== "function") {
        return;
    }
    editor.on("guttermousedown", handleEditorGutterLineHighlightClick);
}
