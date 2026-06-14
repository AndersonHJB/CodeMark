(function () {
    const form = document.querySelector("[data-home-search-form]");
    const searchInput = document.querySelector("[data-home-search]");
    const status = document.querySelector("[data-search-status]");
    const emptyResults = document.querySelector("[data-empty-results]");
    const catalog = document.querySelector("[data-home-catalog]");

    if (!searchInput || !catalog) {
        return;
    }

    const columns = Array.from(catalog.querySelectorAll(".learning-column"));
    const rows = Array.from(catalog.querySelectorAll(".article-item, .branch-item"));

    const normalize = (value) => value.trim().toLocaleLowerCase("zh-CN");

    const updateFilter = () => {
        const query = normalize(searchInput.value);
        let visibleArticleCount = 0;

        rows.forEach((row) => {
            const matches = !query || normalize(row.textContent).includes(query);
            row.hidden = !matches;

            if (matches && row.classList.contains("article-item")) {
                visibleArticleCount += 1;
            }

            const details = row.querySelector("details");
            if (details && query && matches) {
                details.open = true;
            }
        });

        columns.forEach((column) => {
            const hasVisibleRow = Boolean(column.querySelector(".article-item:not([hidden]), .branch-item:not([hidden])"));
            column.hidden = Boolean(query && !hasVisibleRow);
        });

        if (status) {
            status.textContent = query ? `${visibleArticleCount} 个匹配结果` : "搜索文档、代码、专栏";
        }

        if (emptyResults) {
            emptyResults.hidden = !(query && visibleArticleCount === 0);
        }
    };

    form?.addEventListener("submit", (event) => {
        event.preventDefault();
        updateFilter();
    });

    searchInput.addEventListener("input", updateFilter);

    window.addEventListener("keydown", (event) => {
        const isMacShortcut = event.metaKey && event.key.toLowerCase() === "k";
        const isCtrlShortcut = event.ctrlKey && event.key.toLowerCase() === "k";

        if (!isMacShortcut && !isCtrlShortcut) {
            return;
        }

        event.preventDefault();
        searchInput.focus();
        searchInput.select();
    });
})();
