(function () {
    "use strict";

    function setMessage(messageElement, text, isError) {
        if (!messageElement) {
            return;
        }
        messageElement.textContent = text || "";
        messageElement.classList.toggle("is-error", !!isError);
    }

    function initRandomSlugButton() {
        const input = document.getElementById("id_slug");
        if (!input || !input.dataset.randomSlugUrl || input.dataset.randomSlugReady === "1") {
            return;
        }

        input.dataset.randomSlugReady = "1";

        const button = document.createElement("button");
        const message = document.createElement("span");

        button.type = "button";
        button.className = "button blog-vip-random-slug-button";
        button.textContent = "随机链接";
        button.setAttribute("aria-label", "生成随机不重复的 URL 标识");

        message.className = "blog-vip-random-slug-message";
        message.setAttribute("aria-live", "polite");

        input.insertAdjacentElement("afterend", message);
        input.insertAdjacentElement("afterend", button);

        button.addEventListener("click", function () {
            const originalText = button.textContent;
            button.disabled = true;
            button.textContent = "生成中";
            setMessage(message, "", false);

            window.fetch(input.dataset.randomSlugUrl, {
                credentials: "same-origin",
                headers: {
                    "Accept": "application/json",
                    "X-Requested-With": "XMLHttpRequest"
                }
            })
                .then(function (response) {
                    return response.json().then(function (payload) {
                        if (!response.ok || !payload.ok || !payload.slug) {
                            throw new Error(payload.message || "生成失败");
                        }
                        return payload.slug;
                    });
                })
                .then(function (slug) {
                    input.value = slug;
                    input.dispatchEvent(new Event("input", {bubbles: true}));
                    input.dispatchEvent(new Event("change", {bubbles: true}));
                    setMessage(message, "已生成未占用标识", false);
                })
                .catch(function (error) {
                    setMessage(message, error.message || "生成失败", true);
                })
                .finally(function () {
                    button.disabled = false;
                    button.textContent = originalText;
                });
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initRandomSlugButton);
    } else {
        initRandomSlugButton();
    }
}());
