(function () {
    const config = window.CODEMARK_ACCOUNT_CONFIG || {};
    let accountState = Object.assign({
        isAuthenticated: false,
        displayName: "登录 CodeMark",
        email: "",
        username: "",
        bio: "",
        avatarUrl: config.defaultAvatarUrl || ""
    }, window.CODEMARK_ACCOUNT_INITIAL || {});

    const dialog = document.querySelector("[data-account-dialog]");
    const toast = document.querySelector("[data-account-toast]");
    const loginForm = document.querySelector("[data-account-login-form]");
    const registerForm = document.querySelector("[data-account-register-form]");
    const profileForm = document.querySelector("[data-account-profile-form]");
    const sendCodeButton = document.querySelector("[data-account-send-code]");
    const randomDefaultAvatarButton = document.querySelector("[data-account-use-random-default]");
    const randomProfileButtons = document.querySelectorAll("[data-account-random-profile]");
    let toastTimer = null;
    let sendCodeTimer = null;
    let pendingAvatarPreviewUrl = "";

    function readCookie(name) {
        const cookies = document.cookie ? document.cookie.split("; ") : [];
        for (let i = 0; i < cookies.length; i += 1) {
            const parts = cookies[i].split("=");
            if (parts.shift() === name) {
                return decodeURIComponent(parts.join("="));
            }
        }
        return "";
    }

    function csrfToken() {
        const cookieToken = readCookie("csrftoken");
        if (cookieToken) {
            return cookieToken;
        }
        if (config.csrfToken && config.csrfToken !== "NOTPROVIDED") {
            return config.csrfToken;
        }
        return "";
    }

    function showToast(message, isError) {
        if (!toast) {
            return;
        }
        toast.textContent = message;
        toast.classList.toggle("is-error", !!isError);
        toast.hidden = false;
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(function () {
            toast.hidden = true;
        }, 2800);
    }

    function apiErrorMessage(response) {
        if (response.status === 401) {
            return "请先登录";
        }
        if (response.status === 403) {
            return "请求校验失败，请刷新页面后重试";
        }
        if (response.status >= 500) {
            return "服务器暂时无法处理，请稍后重试";
        }
        return "请求失败";
    }

    function parseApiResponse(response) {
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
                throw new Error(data.message || apiErrorMessage(response));
            }
            return data;
        });
    }

    function jsonRequest(url, payload) {
        return fetch(url, {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrfToken()
            },
            body: JSON.stringify(payload || {})
        }).then(parseApiResponse);
    }

    function getRequest(url) {
        return fetch(url, {
            method: "GET",
            credentials: "same-origin",
            headers: {
                "Accept": "application/json"
            }
        }).then(parseApiResponse);
    }

    function formRequest(url, formData) {
        return fetch(url, {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "X-CSRFToken": csrfToken()
            },
            body: formData
        }).then(parseApiResponse);
    }

    function refreshSession() {
        if (!config.sessionUrl) {
            return;
        }
        fetch(config.sessionUrl, {
            method: "GET",
            credentials: "same-origin",
            headers: {
                "Accept": "application/json"
            }
        })
            .then(parseApiResponse)
            .then(function (data) {
                updateAccountUi(data.user);
            })
            .catch(function () {});
    }

    function setButtonLoading(button, loadingText) {
        if (!button) {
            return function () {};
        }
        const originalHtml = button.innerHTML;
        button.disabled = true;
        if (loadingText) {
            button.textContent = loadingText;
        }
        return function () {
            button.disabled = false;
            button.innerHTML = originalHtml;
        };
    }

    function updateAccountUi(user) {
        if (user) {
            accountState = Object.assign({}, accountState, {
                isAuthenticated: !!user.is_authenticated,
                displayName: user.display_name || (user.is_authenticated ? user.username : "登录 CodeMark"),
                email: user.email || "",
                username: user.username || "",
                bio: user.bio || "",
                avatarUrl: user.avatar_url || config.defaultAvatarUrl || accountState.avatarUrl
            });
        }

        const subtitle = accountState.isAuthenticated
            ? (accountState.email || "已登录")
            : "登录 / 注册";
        const displayName = accountState.displayName || (accountState.isAuthenticated ? "CodeMark 用户" : "登录 CodeMark");

        document.querySelectorAll("[data-account-name]").forEach(function (node) {
            node.textContent = displayName;
        });
        document.querySelectorAll("[data-account-topbar-name]").forEach(function (node) {
            node.textContent = accountState.isAuthenticated ? displayName : "登录";
        });
        document.querySelectorAll("[data-account-subtitle]").forEach(function (node) {
            node.textContent = accountState.isAuthenticated ? subtitle : "使用邮箱验证码注册";
        });
        document.querySelectorAll("[data-account-avatar], [data-account-profile-avatar]").forEach(function (node) {
            node.src = accountState.avatarUrl || config.defaultAvatarUrl || "";
        });
        document.querySelectorAll("[data-account-auth-only]").forEach(function (node) {
            node.hidden = !accountState.isAuthenticated;
        });
        document.querySelectorAll("[data-account-guest-only]").forEach(function (node) {
            node.hidden = accountState.isAuthenticated;
        });
        document.querySelectorAll("[data-account-profile-form] input[name='display_name']").forEach(function (node) {
            node.value = accountState.isAuthenticated ? displayName : "";
        });
        document.querySelectorAll("[data-account-profile-form] textarea[name='bio']").forEach(function (node) {
            node.value = accountState.isAuthenticated ? accountState.bio : "";
        });
        document.querySelectorAll("[data-account-dialog-subtitle]").forEach(function (node) {
            node.textContent = accountState.isAuthenticated
                ? "管理头像、昵称和个人简介"
                : "登录或注册后可逐步解锁个人功能";
        });
        switchPanel(accountState.isAuthenticated ? "profile" : "login");
    }

    function closeMenus() {
        document.querySelectorAll("[data-account-menu]").forEach(function (menu) {
            menu.hidden = true;
        });
        document.querySelectorAll("[data-account-trigger]").forEach(function (button) {
            button.setAttribute("aria-expanded", "false");
        });
        document.querySelectorAll("#projectSidebar.account-menu-open").forEach(function (sidebar) {
            sidebar.classList.remove("account-menu-open");
        });
    }

    function openDialog(mode) {
        if (!dialog) {
            return;
        }
        closeMenus();
        dialog.hidden = false;
        switchPanel(mode || (accountState.isAuthenticated ? "profile" : "login"));
    }

    function closeDialog() {
        if (dialog) {
            dialog.hidden = true;
        }
    }

    function switchPanel(mode) {
        mode = accountState.isAuthenticated ? "profile" : (mode === "register" ? "register" : "login");
        document.querySelectorAll("[data-account-tab]").forEach(function (tab) {
            const active = tab.dataset.accountTab === mode;
            const visible = accountState.isAuthenticated
                ? tab.dataset.accountTab === "profile"
                : tab.dataset.accountTab !== "profile";
            tab.classList.toggle("is-active", active);
            tab.hidden = !visible;
        });
        document.querySelectorAll("[data-account-panel]").forEach(function (panel) {
            const active = panel.dataset.accountPanel === mode;
            panel.classList.toggle("is-active", active);
            panel.hidden = !active;
        });
    }

    function currentRegisterEmail() {
        const input = registerForm && registerForm.querySelector("input[name='email']");
        return input ? input.value.trim() : "";
    }

    function startCodeCountdown(seconds) {
        if (!sendCodeButton) {
            return;
        }
        let remain = seconds;
        sendCodeButton.disabled = true;
        sendCodeButton.textContent = remain + "s";
        window.clearInterval(sendCodeTimer);
        sendCodeTimer = window.setInterval(function () {
            remain -= 1;
            if (remain <= 0) {
                window.clearInterval(sendCodeTimer);
                sendCodeButton.disabled = false;
                sendCodeButton.textContent = "发送验证码";
                return;
            }
            sendCodeButton.textContent = remain + "s";
        }, 1000);
    }

    function setFormField(form, fieldName, value) {
        const field = form && form.querySelector("[name='" + fieldName + "']");
        if (!field) {
            return;
        }
        field.value = value || "";
        field.dispatchEvent(new Event("input", {bubbles: true}));
    }

    function applyRandomProfile(form, fieldName, profile) {
        if (!profile) {
            return;
        }
        if (fieldName === "display_name") {
            setFormField(form, "display_name", profile.display_name);
            if (form === profileForm) {
                const previewName = form.querySelector("[data-account-name]");
                if (previewName) {
                    previewName.textContent = profile.display_name || "CodeMark 用户";
                }
            }
            return;
        }
        if (fieldName === "bio") {
            setFormField(form, "bio", profile.bio);
        }
    }

    function formatFileSize(bytes) {
        if (!bytes && bytes !== 0) {
            return "";
        }
        if (bytes < 1024 * 1024) {
            return Math.max(1, Math.round(bytes / 1024)) + " KB";
        }
        return (bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "") + " MB";
    }

    function setProfileAvatarPreview(src) {
        document.querySelectorAll("[data-account-profile-avatar]").forEach(function (img) {
            img.src = src || config.defaultAvatarUrl || "";
        });
    }

    function clearPendingAvatarPreview() {
        if (pendingAvatarPreviewUrl) {
            URL.revokeObjectURL(pendingAvatarPreviewUrl);
            pendingAvatarPreviewUrl = "";
        }
    }

    function setAvatarUploadState(file, detailText) {
        if (!profileForm) {
            return;
        }
        const upload = profileForm.querySelector("[data-account-avatar-upload]");
        const title = profileForm.querySelector("[data-account-avatar-upload-title]");
        const fileName = profileForm.querySelector("[data-account-avatar-file-name]");
        if (upload) {
            upload.classList.toggle("has-file", !!file);
        }
        if (title) {
            title.textContent = file ? "已选择头像" : "上传图片";
        }
        if (fileName) {
            fileName.textContent = file
                ? file.name + " · " + formatFileSize(file.size)
                : (detailText || "JPG、PNG、WebP、GIF");
        }
    }

    function resetAvatarInput(detailText) {
        if (!profileForm) {
            return;
        }
        const avatarInput = profileForm.querySelector("[data-account-avatar-input]");
        if (avatarInput) {
            avatarInput.value = "";
        }
        clearPendingAvatarPreview();
        setAvatarUploadState(null, detailText);
    }

    function pulseDefaultAvatarStrip(avatarUrl) {
        if (!profileForm) {
            return;
        }
        const strip = profileForm.querySelector("[data-account-default-avatar-strip]");
        if (!strip) {
            return;
        }
        strip.querySelectorAll("img").forEach(function (img) {
            const rawSrc = img.getAttribute("src") || "";
            const isCurrent = !!avatarUrl && (avatarUrl === img.src || avatarUrl.endsWith(rawSrc));
            img.classList.toggle("is-current", isCurrent);
        });
        strip.classList.add("is-pulsing");
        window.setTimeout(function () {
            strip.classList.remove("is-pulsing");
        }, 900);
    }

    document.addEventListener("click", function (event) {
        const trigger = event.target.closest("[data-account-trigger]");
        if (trigger) {
            const slot = trigger.closest("[data-account-sidebar]");
            const menu = slot && slot.querySelector("[data-account-menu]");
            const willOpen = menu && menu.hidden;
            closeMenus();
            if (menu && willOpen) {
                menu.hidden = false;
                trigger.setAttribute("aria-expanded", "true");
                const sidebar = trigger.closest("#projectSidebar");
                if (sidebar) {
                    sidebar.classList.add("account-menu-open");
                }
            }
            return;
        }

        if (!event.target.closest("[data-account-sidebar]")) {
            closeMenus();
        }
    });

    document.querySelectorAll("[data-account-open-login]").forEach(function (button) {
        button.addEventListener("click", function () {
            openDialog("login");
        });
    });
    document.querySelectorAll("[data-account-open-register]").forEach(function (button) {
        button.addEventListener("click", function () {
            openDialog("register");
        });
    });
    document.querySelectorAll("[data-account-open-profile]").forEach(function (button) {
        button.addEventListener("click", function () {
            openDialog("profile");
        });
    });
    document.querySelectorAll("[data-account-close]").forEach(function (button) {
        button.addEventListener("click", closeDialog);
    });
    if (dialog) {
        dialog.addEventListener("click", function (event) {
            if (event.target === dialog) {
                closeDialog();
            }
        });
    }

    document.querySelectorAll("[data-account-tab]").forEach(function (button) {
        button.addEventListener("click", function () {
            switchPanel(button.dataset.accountTab);
        });
    });
    document.querySelectorAll("[data-account-switch-register]").forEach(function (button) {
        button.addEventListener("click", function () {
            switchPanel("register");
        });
    });
    document.querySelectorAll("[data-account-switch-login]").forEach(function (button) {
        button.addEventListener("click", function () {
            switchPanel("login");
        });
    });

    document.querySelectorAll("[data-account-logout]").forEach(function (button) {
        button.addEventListener("click", function () {
            const restore = setButtonLoading(button, "正在退出");
            jsonRequest(config.logoutUrl, {})
                .then(function (data) {
                    updateAccountUi(data.user);
                    closeDialog();
                    closeMenus();
                    showToast(data.message || "已退出登录");
                })
                .catch(function (error) {
                    showToast(error.message, true);
                })
                .finally(restore);
        });
    });

    if (sendCodeButton) {
        sendCodeButton.addEventListener("click", function () {
            const email = currentRegisterEmail();
            if (!email) {
                showToast("请先输入邮箱", true);
                return;
            }
            const restore = setButtonLoading(sendCodeButton, "发送中");
            jsonRequest(config.sendCodeUrl, {email: email, purpose: "register"})
                .then(function (data) {
                    showToast(data.message || "验证码已发送");
                    startCodeCountdown(60);
                })
                .catch(function (error) {
                    showToast(error.message, true);
                    restore();
                });
        });
    }

    randomProfileButtons.forEach(function (button) {
        button.addEventListener("click", function () {
            const form = button.closest("form");
            const fieldName = button.dataset.accountRandomProfile;
            if (!form || !fieldName) {
                return;
            }
            if (!config.randomProfileUrl) {
                showToast("随机资料接口未配置", true);
                return;
            }

            const restore = setButtonLoading(button, "抽取中");
            getRequest(config.randomProfileUrl)
                .then(function (data) {
                    applyRandomProfile(form, fieldName, data.profile);
                    showToast(fieldName === "bio" ? "已随机生成个人简介" : "已随机生成昵称");
                })
                .catch(function (error) {
                    showToast(error.message, true);
                })
                .finally(restore);
        });
    });

    if (loginForm) {
        loginForm.addEventListener("submit", function (event) {
            event.preventDefault();
            const button = loginForm.querySelector("button[type='submit']");
            const restore = setButtonLoading(button, "登录中");
            const payload = Object.fromEntries(new FormData(loginForm).entries());
            jsonRequest(config.loginUrl, payload)
                .then(function (data) {
                    updateAccountUi(data.user);
                    closeDialog();
                    showToast(data.message || "登录成功");
                })
                .catch(function (error) {
                    showToast(error.message, true);
                })
                .finally(restore);
        });
    }

    if (registerForm) {
        registerForm.addEventListener("submit", function (event) {
            event.preventDefault();
            const button = registerForm.querySelector("button[type='submit']");
            const restore = setButtonLoading(button, "注册中");
            const payload = Object.fromEntries(new FormData(registerForm).entries());
            jsonRequest(config.registerUrl, payload)
                .then(function (data) {
                    updateAccountUi(data.user);
                    registerForm.reset();
                    closeDialog();
                    showToast(data.message || "注册成功");
                })
                .catch(function (error) {
                    showToast(error.message, true);
                })
                .finally(restore);
        });
    }

    if (profileForm) {
        const avatarInput = profileForm.querySelector("[data-account-avatar-input]");
        const avatarUpload = profileForm.querySelector("[data-account-avatar-upload]");
        if (avatarInput) {
            avatarInput.addEventListener("change", function () {
                const file = avatarInput.files && avatarInput.files[0];
                if (!file) {
                    resetAvatarInput();
                    setProfileAvatarPreview(accountState.avatarUrl || config.defaultAvatarUrl || "");
                    return;
                }
                const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
                if (file.type && allowedTypes.indexOf(file.type) === -1) {
                    resetAvatarInput("请选择 JPG、PNG、WebP 或 GIF");
                    setProfileAvatarPreview(accountState.avatarUrl || config.defaultAvatarUrl || "");
                    showToast("头像仅支持 JPG、PNG、WebP 或 GIF", true);
                    return;
                }
                clearPendingAvatarPreview();
                pendingAvatarPreviewUrl = URL.createObjectURL(file);
                setProfileAvatarPreview(pendingAvatarPreviewUrl);
                setAvatarUploadState(file);
            });
        }
        if (avatarUpload && avatarInput) {
            avatarUpload.addEventListener("keydown", function (event) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    avatarInput.click();
                }
            });
        }

        profileForm.addEventListener("submit", function (event) {
            event.preventDefault();
            const button = profileForm.querySelector("button[type='submit']");
            const restore = setButtonLoading(button, "保存中");
            formRequest(config.profileUrl, new FormData(profileForm))
                .then(function (data) {
                    updateAccountUi(data.user);
                    resetAvatarInput("已同步最新头像");
                    showToast(data.message || "资料已更新");
                })
                .catch(function (error) {
                    showToast(error.message, true);
                })
                .finally(restore);
        });
    }

    if (randomDefaultAvatarButton && profileForm) {
        randomDefaultAvatarButton.addEventListener("click", function () {
            if (!accountState.isAuthenticated) {
                showToast("请先登录", true);
                return;
            }
            const avatarInput = profileForm.querySelector("[data-account-avatar-input]");
            const formData = new FormData(profileForm);
            formData.delete("avatar");
            formData.set("use_random_default_avatar", "1");

            const restore = setButtonLoading(randomDefaultAvatarButton, "抽取中");
            formRequest(config.profileUrl, formData)
                .then(function (data) {
                    if (avatarInput) {
                        avatarInput.value = "";
                    }
                    updateAccountUi(data.user);
                    resetAvatarInput("已切换为随机默认头像");
                    pulseDefaultAvatarStrip(data.user && data.user.avatar_url);
                    showToast(data.message || "已使用随机默认头像");
                })
                .catch(function (error) {
                    showToast(error.message, true);
                })
                .finally(restore);
        });
    }

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            closeDialog();
            closeMenus();
        }
    });

    updateAccountUi(accountState);
    refreshSession();
})();
