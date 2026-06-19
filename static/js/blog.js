(function () {
    function readCookie(name) {
        const cookies = document.cookie ? document.cookie.split("; ") : [];
        for (let index = 0; index < cookies.length; index += 1) {
            const parts = cookies[index].split("=");
            if (parts.shift() === name) {
                return decodeURIComponent(parts.join("="));
            }
        }
        return "";
    }

    function csrfToken() {
        return readCookie("csrftoken");
    }

    function parseResponse(response) {
        return response.text().then(function (text) {
            let data = {};
            if (text) {
                try {
                    data = JSON.parse(text);
                } catch (error) {
                    data = {};
                }
            }
            if (!response.ok || !data.ok) {
                throw new Error(data.message || "请求失败");
            }
            return data;
        });
    }

    function openLoginDialog() {
        const loginButton = Array.from(document.querySelectorAll("[data-account-open-login]"))
            .find(function (button) {
                return !button.hidden;
            });
        if (loginButton) {
            loginButton.click();
        }
    }

    function initLoginPrompt() {
        if (document.body.dataset.blogLoginPrompt === "1") {
            window.setTimeout(openLoginDialog, 120);
        }
    }

    function initPostActions() {
        const post = document.querySelector("[data-blog-post]");
        if (!post) {
            return;
        }
        const likeButton = post.querySelector("[data-blog-like]");
        const bookmarkButton = post.querySelector("[data-blog-bookmark]");
        const likeCount = post.querySelector("[data-like-count]");

        function toggle(url, button, activeText, inactiveText, onData) {
            if (!url || !button) {
                return;
            }
            button.disabled = true;
            fetch(url, {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Accept": "application/json",
                    "X-CSRFToken": csrfToken()
                }
            })
                .then(parseResponse)
                .then(function (data) {
                    button.classList.toggle("is-active", !!data.active);
                    button.textContent = data.active ? activeText : inactiveText;
                    if (onData) {
                        onData(data);
                    }
                })
                .catch(function (error) {
                    if (error.message === "请先登录") {
                        openLoginDialog();
                        return;
                    }
                    window.alert(error.message);
                })
                .finally(function () {
                    button.disabled = false;
                });
        }

        if (likeButton) {
            likeButton.addEventListener("click", function () {
                toggle(post.dataset.likeUrl, likeButton, "已点赞", "点赞", function (data) {
                    if (likeCount) {
                        likeCount.textContent = data.count;
                    }
                });
            });
        }
        if (bookmarkButton) {
            bookmarkButton.addEventListener("click", function () {
                toggle(post.dataset.bookmarkUrl, bookmarkButton, "已收藏", "收藏");
            });
        }
    }

    function initCommentReplies() {
        document.querySelectorAll("[data-comment-reply-form]").forEach(function (form) {
            form.hidden = true;
        });
        document.querySelectorAll("[data-comment-reply-target]").forEach(function (button) {
            button.addEventListener("click", function () {
                const targetId = button.dataset.commentReplyTarget;
                const form = document.querySelector("[data-comment-reply-form='" + targetId + "']");
                if (!form) {
                    return;
                }
                document.querySelectorAll("[data-comment-reply-form]").forEach(function (replyForm) {
                    if (replyForm !== form) {
                        replyForm.hidden = true;
                    }
                });
                form.hidden = !form.hidden;
                if (!form.hidden) {
                    const textarea = form.querySelector("textarea");
                    if (textarea) {
                        textarea.focus();
                    }
                }
            });
        });

        document.querySelectorAll("[data-comment-reply-cancel]").forEach(function (button) {
            button.addEventListener("click", function () {
                const form = button.closest("[data-comment-reply-form]");
                if (form) {
                    form.hidden = true;
                }
            });
        });
    }

    function initCopyLinks() {
        document.querySelectorAll("[data-copy-link]").forEach(function (button) {
            button.addEventListener("click", function () {
                const link = button.dataset.copyLink || "";
                const label = button.dataset.copyLabel || "复制链接";
                const originalText = button.textContent;
                const done = function () {
                    button.textContent = "已复制";
                    window.setTimeout(function () {
                        button.textContent = originalText;
                        button.classList.remove("is-active");
                        if (document.activeElement === button) {
                            button.blur();
                        }
                    }, 1600);
                };
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(link).then(done).catch(function () {
                        window.prompt(label, link);
                    });
                    return;
                }
                window.prompt(label, link);
            });
        });
    }

    function initEditor() {
        const editor = document.querySelector("[data-blog-editor]");
        if (!editor) {
            return;
        }
        const uploadUrl = editor.dataset.uploadUrl;
        const modeInput = editor.querySelector("#blogContentFormat");
        const textarea = editor.querySelector("#blogContent");
        const richEditor = editor.querySelector("[data-rich-editor]");
        const status = editor.querySelector("[data-blog-editor-status]");
        const markdownTools = editor.querySelector("[data-markdown-tools]");
        const richTools = editor.querySelector("[data-rich-tools]");
        const imageInput = editor.querySelector("[data-blog-image-input]");
        let currentMode = modeInput.value || "markdown";

        function showStatus(message, isError) {
            if (!status) {
                return;
            }
            status.textContent = message;
            status.hidden = false;
            status.classList.toggle("is-error", !!isError);
            window.clearTimeout(showStatus.timer);
            showStatus.timer = window.setTimeout(function () {
                status.hidden = true;
            }, isError ? 4200 : 2200);
        }

        function syncToTextarea() {
            if (currentMode === "richtext" && richEditor && textarea) {
                textarea.value = richEditor.innerHTML.trim();
            }
        }

        function setMode(mode) {
            currentMode = mode === "richtext" ? "richtext" : "markdown";
            modeInput.value = currentMode;
            editor.querySelectorAll("[data-blog-mode]").forEach(function (button) {
                button.classList.toggle("is-active", button.dataset.blogMode === currentMode);
            });
            if (textarea) {
                textarea.hidden = currentMode !== "markdown";
            }
            if (richEditor) {
                richEditor.hidden = currentMode !== "richtext";
                if (currentMode === "richtext" && !richEditor.innerHTML.trim() && textarea.value.trim()) {
                    richEditor.textContent = textarea.value;
                }
            }
            if (markdownTools) {
                markdownTools.hidden = currentMode !== "markdown";
            }
            if (richTools) {
                richTools.hidden = currentMode !== "richtext";
            }
        }

        function insertIntoTextarea(text) {
            if (!textarea) {
                return;
            }
            const start = textarea.selectionStart || 0;
            const end = textarea.selectionEnd || 0;
            const before = textarea.value.slice(0, start);
            const after = textarea.value.slice(end);
            textarea.value = before + text + after;
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = start + text.length;
        }

        function wrapSelection(prefix, suffix, placeholder) {
            if (!textarea) {
                return;
            }
            const start = textarea.selectionStart || 0;
            const end = textarea.selectionEnd || 0;
            const selected = textarea.value.slice(start, end) || placeholder;
            const replacement = prefix + selected + suffix;
            textarea.value = textarea.value.slice(0, start) + replacement + textarea.value.slice(end);
            textarea.focus();
            textarea.selectionStart = start + prefix.length;
            textarea.selectionEnd = start + prefix.length + selected.length;
        }

        function insertMarkdownSnippet(type) {
            const snippets = {
                bold: function () {
                    wrapSelection("**", "**", "加粗文字");
                },
                italic: function () {
                    wrapSelection("*", "*", "强调文字");
                },
                code: function () {
                    wrapSelection("`", "`", "code");
                },
                quote: function () {
                    insertIntoTextarea("\n> 引用内容\n");
                },
                list: function () {
                    insertIntoTextarea("\n- 列表项\n- 列表项\n");
                },
                link: function () {
                    wrapSelection("[", "](https://example.com)", "链接文字");
                }
            };
            if (snippets[type]) {
                snippets[type]();
            }
        }

        function insertRichHtml(html) {
            if (!richEditor) {
                return;
            }
            richEditor.focus();
            document.execCommand("insertHTML", false, html);
            syncToTextarea();
        }

        function insertImage(data) {
            if (currentMode === "richtext") {
                insertRichHtml(data.html);
            } else {
                insertIntoTextarea("\n" + data.markdown + "\n");
            }
            showStatus("图片已上传并插入");
        }

        function uploadImage(file) {
            if (!file || !uploadUrl) {
                return Promise.resolve();
            }
            const formData = new FormData();
            formData.append("image", file);
            showStatus("正在上传图片...");
            return fetch(uploadUrl, {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Accept": "application/json",
                    "X-CSRFToken": csrfToken()
                },
                body: formData
            })
                .then(parseResponse)
                .then(insertImage)
                .catch(function (error) {
                    if (error.message === "请先登录") {
                        openLoginDialog();
                        return;
                    }
                    showStatus(error.message, true);
                });
        }

        function handlePaste(event) {
            const items = event.clipboardData && event.clipboardData.items;
            if (!items) {
                return;
            }
            for (let index = 0; index < items.length; index += 1) {
                const item = items[index];
                if (item.kind === "file" && item.type.indexOf("image/") === 0) {
                    const file = item.getAsFile();
                    if (file) {
                        event.preventDefault();
                        uploadImage(file);
                        return;
                    }
                }
            }
        }

        editor.querySelectorAll("[data-blog-mode]").forEach(function (button) {
            button.addEventListener("click", function () {
                if (currentMode === "richtext") {
                    syncToTextarea();
                }
                setMode(button.dataset.blogMode);
            });
        });

        editor.querySelectorAll("[data-blog-insert]").forEach(function (button) {
            button.addEventListener("click", function () {
                insertMarkdownSnippet(button.dataset.blogInsert);
            });
        });

        editor.querySelectorAll("[data-rich-command]").forEach(function (button) {
            button.addEventListener("click", function () {
                richEditor.focus();
                document.execCommand(button.dataset.richCommand, false, button.dataset.richValue || null);
                syncToTextarea();
            });
        });

        editor.querySelectorAll("[data-rich-link]").forEach(function (button) {
            button.addEventListener("click", function () {
                const url = window.prompt("输入链接地址");
                if (!url) {
                    return;
                }
                richEditor.focus();
                document.execCommand("createLink", false, url);
                syncToTextarea();
            });
        });

        if (imageInput) {
            imageInput.addEventListener("change", function () {
                const file = imageInput.files && imageInput.files[0];
                uploadImage(file).finally(function () {
                    imageInput.value = "";
                });
            });
        }
        if (textarea) {
            textarea.addEventListener("paste", handlePaste);
        }
        if (richEditor) {
            richEditor.addEventListener("paste", handlePaste);
            richEditor.addEventListener("input", syncToTextarea);
        }
        editor.addEventListener("submit", syncToTextarea);
        setMode(currentMode);
    }

    initLoginPrompt();
    initPostActions();
    initCommentReplies();
    initCopyLinks();
    initEditor();
})();
