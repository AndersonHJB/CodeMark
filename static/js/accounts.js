(function () {
    const config = window.CODEMARK_ACCOUNT_CONFIG || {};
    let accountState = Object.assign({
        isAuthenticated: false,
        displayName: "登录 CodeMark",
        email: "",
        username: "",
        avatarUrl: config.defaultAvatarUrl || ""
    }, window.CODEMARK_ACCOUNT_INITIAL || {});

    const dialog = document.querySelector("[data-account-dialog]");
    const toast = document.querySelector("[data-account-toast]");
    const loginForm = document.querySelector("[data-account-login-form]");
    const registerForm = document.querySelector("[data-account-register-form]");
    const profileForm = document.querySelector("[data-account-profile-form]");
    const sendCodeButton = document.querySelector("[data-account-send-code]");
    const randomDefaultAvatarButton = document.querySelector("[data-account-use-random-default]");
    let toastTimer = null;
    let sendCodeTimer = null;

    function csrfToken() {
        if (config.csrfToken && config.csrfToken !== "NOTPROVIDED") {
            return config.csrfToken;
        }
        const match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : "";
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

    function jsonRequest(url, payload) {
        return fetch(url, {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrfToken()
            },
            body: JSON.stringify(payload || {})
        }).then(function (response) {
            return response.json().then(function (data) {
                if (!response.ok || !data.ok) {
                    throw new Error(data.message || "请求失败");
                }
                return data;
            });
        });
    }

    function formRequest(url, formData) {
        return fetch(url, {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "X-CSRFToken": csrfToken()
            },
            body: formData
        }).then(function (response) {
            return response.json().then(function (data) {
                if (!response.ok || !data.ok) {
                    throw new Error(data.message || "请求失败");
                }
                return data;
            });
        });
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
        if (mode === "profile" && !accountState.isAuthenticated) {
            mode = "login";
        }
        document.querySelectorAll("[data-account-tab]").forEach(function (tab) {
            const active = tab.dataset.accountTab === mode;
            tab.classList.toggle("is-active", active);
            tab.hidden = tab.dataset.accountTab === "profile" && !accountState.isAuthenticated;
        });
        document.querySelectorAll("[data-account-panel]").forEach(function (panel) {
            panel.classList.toggle("is-active", panel.dataset.accountPanel === mode);
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
        const avatarInput = profileForm.querySelector("input[name='avatar']");
        if (avatarInput) {
            avatarInput.addEventListener("change", function () {
                const file = avatarInput.files && avatarInput.files[0];
                if (!file) {
                    return;
                }
                document.querySelectorAll("[data-account-profile-avatar]").forEach(function (img) {
                    img.src = URL.createObjectURL(file);
                });
            });
        }

        profileForm.addEventListener("submit", function (event) {
            event.preventDefault();
            const button = profileForm.querySelector("button[type='submit']");
            const restore = setButtonLoading(button, "保存中");
            formRequest(config.profileUrl, new FormData(profileForm))
                .then(function (data) {
                    updateAccountUi(data.user);
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
            const avatarInput = profileForm.querySelector("input[name='avatar']");
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
})();
