/* Searchable language selector enhancement for the sharecode page. */
const languageComboboxRegistry = new Map();
let activeLanguageCombobox = null;
let languageComboboxGlobalEventsBound = false;

function getLanguageOptionLabel(selectElement, value) {
    const option = Array.from(selectElement.options).find(item => item.value === value);
    return option ? option.textContent : getSharecodeLanguageConfig(value).label;
}

function getLanguageOptionSearchText(option) {
    const config = getSharecodeLanguageConfig(option.value);
    return [
        option.textContent,
        option.value,
        ...(config.aliases || []),
        ...(config.extensions || [])
    ].join(" ").toLowerCase();
}

function getVisibleLanguageOptions(state, query) {
    const normalizedQuery = String(query || "").trim().toLowerCase();
    return Array.from(state.select.options).filter(option => {
        if (!normalizedQuery) {
            return true;
        }
        return getLanguageOptionSearchText(option).indexOf(normalizedQuery) !== -1;
    });
}

function updateLanguageComboboxPosition(state) {
    if (!state || !state.menu.classList.contains("is-open")) {
        return;
    }
    const rect = state.combo.getBoundingClientRect();
    const margin = 6;
    const viewportPadding = 12;
    const maxAvailableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const maxAvailableAbove = rect.top - viewportPadding;
    const contentHeight = state.menu.scrollHeight || 320;
    const cappedContentHeight = Math.min(320, contentHeight);
    const placeAbove = maxAvailableBelow < cappedContentHeight && maxAvailableAbove > maxAvailableBelow;
    const availableHeight = placeAbove ? maxAvailableAbove : maxAvailableBelow;
    const desiredHeight = Math.min(cappedContentHeight, Math.max(120, availableHeight));
    const menuWidth = Math.max(rect.width, state.isMobile ? rect.width : 210);
    const maxLeft = window.innerWidth - menuWidth - viewportPadding;
    const left = Math.min(Math.max(rect.left, viewportPadding), Math.max(maxLeft, viewportPadding));
    const top = placeAbove
        ? Math.max(viewportPadding, rect.top - desiredHeight - margin)
        : Math.min(window.innerHeight - viewportPadding, rect.bottom + margin);

    state.menu.style.left = left + "px";
    state.menu.style.top = top + "px";
    state.menu.style.width = menuWidth + "px";
    state.menu.style.maxHeight = desiredHeight + "px";
}

function closeLanguageCombobox(state) {
    if (!state) {
        return;
    }
    state.combo.classList.remove("is-open");
    state.menu.classList.remove("is-open");
    state.input.setAttribute("aria-expanded", "false");
    state.input.removeAttribute("aria-activedescendant");
    state.input.placeholder = "";
    state.activeIndex = -1;
    syncLanguageComboboxDisplay(state);
    if (activeLanguageCombobox === state) {
        activeLanguageCombobox = null;
    }
}

function closeActiveLanguageCombobox() {
    closeLanguageCombobox(activeLanguageCombobox);
}

function renderLanguageComboboxOptions(state, query) {
    const visibleOptions = getVisibleLanguageOptions(state, query);
    const selectedValue = state.select.value;
    state.visibleOptions = visibleOptions;
    state.menu.innerHTML = "";

    if (!visibleOptions.length) {
        const empty = document.createElement("div");
        empty.className = "language-combobox-empty";
        empty.textContent = "No matches";
        state.menu.appendChild(empty);
        state.input.removeAttribute("aria-activedescendant");
        return;
    }

    if (state.activeIndex < 0 || state.activeIndex >= visibleOptions.length) {
        state.activeIndex = Math.max(visibleOptions.findIndex(option => option.value === selectedValue), 0);
    }

    visibleOptions.forEach((option, index) => {
        const item = document.createElement("button");
        const itemId = state.menu.id + "-option-" + index;
        item.type = "button";
        item.id = itemId;
        item.className = "language-combobox-option";
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", option.value === selectedValue ? "true" : "false");
        item.dataset.value = option.value;

        if (option.value === selectedValue) {
            item.classList.add("is-selected");
        }
        if (index === state.activeIndex) {
            item.classList.add("is-active");
            state.input.setAttribute("aria-activedescendant", itemId);
        }

        const check = document.createElement("i");
        check.className = "bi bi-check2 language-combobox-check";
        check.setAttribute("aria-hidden", "true");

        const label = document.createElement("span");
        label.className = "language-combobox-option-label";
        label.textContent = option.textContent;

        item.appendChild(check);
        item.appendChild(label);
        item.addEventListener("mousedown", function (event) {
            event.preventDefault();
            selectLanguageComboboxOption(state, option.value);
        });
        state.menu.appendChild(item);
    });
}

function openLanguageCombobox(state) {
    if (!state) {
        return;
    }
    if (activeLanguageCombobox && activeLanguageCombobox !== state) {
        closeLanguageCombobox(activeLanguageCombobox);
    }
    activeLanguageCombobox = state;
    state.combo.classList.add("is-open");
    state.menu.classList.add("is-open");
    state.input.setAttribute("aria-expanded", "true");
    state.input.placeholder = getLanguageOptionLabel(state.select, state.select.value);
    state.input.value = "";
    state.activeIndex = -1;
    renderLanguageComboboxOptions(state, "");
    updateLanguageComboboxPosition(state);
    requestAnimationFrame(function () {
        updateLanguageComboboxPosition(state);
    });
}

function selectLanguageComboboxOption(state, value) {
    const nextValue = normalizeSharecodeLanguage(value);
    const changed = state.select.value !== nextValue;
    state.select.value = nextValue;
    syncLanguageComboboxDisplay(state);
    closeLanguageCombobox(state);
    if (changed) {
        state.select.dispatchEvent(new Event("change", {bubbles: true}));
    }
}

function moveLanguageComboboxActiveOption(state, offset) {
    const options = state.visibleOptions || [];
    if (!options.length) {
        return;
    }
    state.activeIndex = (state.activeIndex + offset + options.length) % options.length;
    renderLanguageComboboxOptions(state, state.input.value);
    const activeItem = state.menu.querySelector(".language-combobox-option.is-active");
    if (activeItem) {
        activeItem.scrollIntoView({block: "nearest"});
    }
}

function bindLanguageComboboxKeyboard(state) {
    state.input.addEventListener("keydown", function (event) {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!state.menu.classList.contains("is-open")) {
                openLanguageCombobox(state);
                return;
            }
            moveLanguageComboboxActiveOption(state, 1);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            if (!state.menu.classList.contains("is-open")) {
                openLanguageCombobox(state);
                return;
            }
            moveLanguageComboboxActiveOption(state, -1);
        } else if (event.key === "Enter") {
            if (!state.menu.classList.contains("is-open")) {
                return;
            }
            event.preventDefault();
            const option = (state.visibleOptions || [])[state.activeIndex];
            if (option) {
                selectLanguageComboboxOption(state, option.value);
            }
        } else if (event.key === "Escape") {
            if (state.menu.classList.contains("is-open")) {
                event.preventDefault();
                closeLanguageCombobox(state);
            }
        }
    });
}

function bindLanguageComboboxGlobalEvents() {
    if (languageComboboxGlobalEventsBound) {
        return;
    }
    languageComboboxGlobalEventsBound = true;

    document.addEventListener("mousedown", function (event) {
        if (!activeLanguageCombobox) {
            return;
        }
        if (
            activeLanguageCombobox.combo.contains(event.target) ||
            activeLanguageCombobox.menu.contains(event.target)
        ) {
            return;
        }
        closeActiveLanguageCombobox();
    }, true);

    window.addEventListener("resize", function () {
        updateLanguageComboboxPosition(activeLanguageCombobox);
    });

    document.addEventListener("scroll", function () {
        updateLanguageComboboxPosition(activeLanguageCombobox);
    }, true);
}

function syncLanguageComboboxDisplay(state) {
    if (!state) {
        return;
    }
    const label = getLanguageOptionLabel(state.select, state.select.value);
    if (state.menu.classList.contains("is-open")) {
        state.input.placeholder = label;
        renderLanguageComboboxOptions(state, state.input.value);
        updateLanguageComboboxPosition(state);
    } else {
        state.input.value = label;
    }
}

function syncLanguageComboboxes() {
    languageComboboxRegistry.forEach(syncLanguageComboboxDisplay);
}

function enhanceLanguageSelector(selectElement) {
    if (!selectElement || selectElement.dataset.searchableLanguageReady === "true") {
        return;
    }

    selectElement.dataset.searchableLanguageReady = "true";
    selectElement.classList.add("language-combobox-native");

    const isMobile = selectElement.id.indexOf("mobile") !== -1;
    const combobox = document.createElement("div");
    combobox.className = "language-combobox" + (isMobile ? " is-mobile" : " is-desktop");

    const field = document.createElement("div");
    field.className = "language-combobox-field";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "language-combobox-input";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-label", "Language");

    const chevron = document.createElement("span");
    chevron.className = "language-combobox-chevron";
    chevron.setAttribute("aria-hidden", "true");

    const menu = document.createElement("div");
    menu.id = selectElement.id + "-search-menu";
    menu.className = "language-combobox-menu";
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", "Language options");
    input.setAttribute("aria-controls", menu.id);

    field.appendChild(input);
    field.appendChild(chevron);
    combobox.appendChild(field);
    selectElement.insertAdjacentElement("afterend", combobox);
    document.body.appendChild(menu);

    const state = {
        select: selectElement,
        combo: combobox,
        input: input,
        menu: menu,
        isMobile: isMobile,
        activeIndex: -1,
        visibleOptions: []
    };

    languageComboboxRegistry.set(selectElement.id, state);
    syncLanguageComboboxDisplay(state);

    input.addEventListener("focus", function () {
        openLanguageCombobox(state);
    });
    input.addEventListener("click", function () {
        if (!state.menu.classList.contains("is-open")) {
            openLanguageCombobox(state);
        }
    });
    input.addEventListener("input", function () {
        if (!state.menu.classList.contains("is-open")) {
            openLanguageCombobox(state);
        }
        state.activeIndex = 0;
        renderLanguageComboboxOptions(state, input.value);
        updateLanguageComboboxPosition(state);
    });
    input.addEventListener("blur", function () {
        setTimeout(function () {
            if (state.combo.contains(document.activeElement) || state.menu.contains(document.activeElement)) {
                return;
            }
            closeLanguageCombobox(state);
        }, 0);
    });
    field.addEventListener("mousedown", function (event) {
        if (event.target !== input) {
            const wasOpen = state.menu.classList.contains("is-open");
            event.preventDefault();
            input.focus();
            if (wasOpen) {
                closeLanguageCombobox(state);
            } else {
                openLanguageCombobox(state);
            }
        }
    });
    selectElement.addEventListener("change", function () {
        syncLanguageComboboxDisplay(state);
    });
    bindLanguageComboboxKeyboard(state);
    bindLanguageComboboxGlobalEvents();
}

function initializeSearchableLanguageSelectors() {
    enhanceLanguageSelector(document.getElementById("lang-selector-desktop"));
    enhanceLanguageSelector(document.getElementById("lang-selector-mobile"));
    syncLanguageComboboxes();
}
