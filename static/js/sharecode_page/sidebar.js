/* Sharecode sidebar sizing and viewport helpers. */
function isMobileViewport() {
    return window.matchMedia("(max-width: 768px)").matches;
}

function clampSidebarWidth(width) {
    const numericWidth = Number(width);
    if (!Number.isFinite(numericWidth)) {
        return SIDEBAR_DEFAULT_WIDTH;
    }
    const viewportMax = Math.max(SIDEBAR_MIN_WIDTH, window.innerWidth - 360);
    const maxWidth = Math.min(SIDEBAR_MAX_WIDTH, viewportMax);
    return Math.round(Math.max(SIDEBAR_MIN_WIDTH, Math.min(numericWidth, maxWidth)));
}

function readCachedSidebarWidth() {
    try {
        const raw = localStorage.getItem(SHARECODE_SIDEBAR_WIDTH_CACHE_KEY);
        const width = Number(raw);
        return Number.isFinite(width) && width > 0 ? width : null;
    } catch (e) {
        return null;
    }
}

function writeCachedSidebarWidth(width) {
    try {
        localStorage.setItem(SHARECODE_SIDEBAR_WIDTH_CACHE_KEY, String(clampSidebarWidth(width)));
    } catch (e) {
    }
}

function applySidebarWidth(width, persist) {
    if (isMobileViewport()) {
        document.documentElement.style.removeProperty("--sidebar-width");
        return;
    }
    const nextWidth = clampSidebarWidth(width);
    document.documentElement.style.setProperty("--sidebar-width", nextWidth + "px");
    if (persist) {
        writeCachedSidebarWidth(nextWidth);
    }
    if (window.editor && typeof window.editor.resize === "function") {
        if (sidebarResizeFrame) {
            cancelAnimationFrame(sidebarResizeFrame);
        }
        sidebarResizeFrame = requestAnimationFrame(function () {
            sidebarResizeFrame = null;
            if (window.editor && typeof window.editor.resize === "function") {
                window.editor.resize();
            }
        });
    }
}

function applyCachedSidebarWidth() {
    if (isMobileViewport()) {
        document.documentElement.style.removeProperty("--sidebar-width");
        return;
    }
    const cachedWidth = readCachedSidebarWidth();
    if (cachedWidth) {
        applySidebarWidth(cachedWidth, false);
    }
}

function bindSidebarResize() {
    const handle = document.getElementById("sidebarResizeHandle");
    const sidebar = document.getElementById("projectSidebar");
    if (!handle || !sidebar) {
        return;
    }
    handle.addEventListener("pointerdown", function (e) {
        if (isMobileViewport() || !sidebarOpen) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        const rect = sidebar.getBoundingClientRect();
        sidebarResizeState = {
            pointerId: e.pointerId,
            left: rect.left,
            width: rect.width
        };
        document.body.classList.add("sidebar-resizing");
        handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", function (e) {
        if (!sidebarResizeState || sidebarResizeState.pointerId !== e.pointerId) {
            return;
        }
        e.preventDefault();
        applySidebarWidth(e.clientX - sidebarResizeState.left, false);
    });
    function finishResize(e) {
        if (!sidebarResizeState || sidebarResizeState.pointerId !== e.pointerId) {
            return;
        }
        e.preventDefault();
        const nextWidth = e.clientX - sidebarResizeState.left;
        sidebarResizeState = null;
        document.body.classList.remove("sidebar-resizing");
        applySidebarWidth(nextWidth, true);
        try {
            handle.releasePointerCapture(e.pointerId);
        } catch (err) {
        }
    }
    handle.addEventListener("pointerup", finishResize);
    handle.addEventListener("pointercancel", finishResize);
}
