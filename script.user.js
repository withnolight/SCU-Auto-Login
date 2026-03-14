// ==UserScript==
// @name         SCU-Auto-login
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  快速登录四川大学教务系统！
// @author       withnolight
// @match        http://zhjw.scu.edu.cn/login*
// @icon         http://zhjw.scu.edu.cn/img/icon/favicon.ico
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      *
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  const DOM = {
    usernameInput: document.getElementById("input_username"),
    passwordInput: document.getElementById("input_password"),
    loginButton: document.getElementById("loginButton"),
    captchaInput: document.getElementById("input_checkcode"),
    captchaImg: document.getElementById("captchaImg"),
  };

  function parseApiUrls(input) {
    if (!input || typeof input !== "string") return [];
    return [...new Set(input.split(/[\n,;]+/).map((url) => url.trim()).filter(Boolean))];
  }

  function initCredentials() {
    let username = GM_getValue("scu_username");
    let password = GM_getValue("scu_password");
    const storedApiUrls = GM_getValue("scu_api_urls");
    const legacyApiUrl = GM_getValue("scu_api_url");
    let apiUrls = [];

    if (Array.isArray(storedApiUrls)) {
      apiUrls = storedApiUrls.map((url) => String(url).trim()).filter(Boolean);
    } else if (typeof storedApiUrls === "string") {
      apiUrls = parseApiUrls(storedApiUrls);
    }

    if (apiUrls.length === 0 && legacyApiUrl) {
      apiUrls = [String(legacyApiUrl).trim()].filter(Boolean);
    }

    const urlParams = new URLSearchParams(window.location.search);
    const isConfig = urlParams.get("config") === "1";

    if (isConfig || !username || !password || apiUrls.length === 0) {
      alert(
        isConfig
          ? "正在重新配置用户信息..."
          : "检测到首次运行，请设置您的教务系统账号信息以开启自动填充。"
      );
      username = prompt("请输入学号:", username || "");
      password = prompt("请输入密码:", password || "");
      const apiInput = prompt(
        "请输入 OCR 服务器地址（支持多个，使用英文逗号或换行分隔）:",
        apiUrls.join("\n")
      );
      apiUrls = parseApiUrls(apiInput || "");

      if (username && password && apiUrls.length > 0) {
        GM_setValue("scu_username", username);
        GM_setValue("scu_password", password);
        GM_setValue("scu_api_urls", apiUrls);
        GM_setValue("scu_api_url", apiUrls[0]);
        alert("设置成功！刷新页面即可生效。请同意油猴的跨域请求权限！");
        if (isConfig) {
          window.location.search = "";
          return null;
        }
      } else {
        alert("取消设置，脚本将不会自动填充。");
      }
      return null;
    }

    return { username, password, apiUrls };
  }

  function getBase64Image(imgElement) {
    const canvas = document.createElement("canvas");
    canvas.width = imgElement.naturalWidth;
    canvas.height = imgElement.naturalHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(imgElement, 0, 0);

    return canvas.toDataURL("image/png");
  }

  function recognizeCaptcha(base64, apiUrls) {
    const requests = [];
    let settled = false;
    let pending = apiUrls.length;

    const abortOthers = (winnerRequest) => {
      requests.forEach((req) => {
        if (req !== winnerRequest && req && typeof req.abort === "function") {
          req.abort();
        }
      });
    };

    apiUrls.forEach((apiUrl) => {
      const req = GM_xmlhttpRequest({
        method: "POST",
        url: apiUrl,
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({ image: base64 }),
        onload(response) {
          if (settled) return;
          pending -= 1;

          try {
            const res = JSON.parse(response.responseText);
            console.log(`识别结果 [${apiUrl}]：`, res);
            if (res.status === "success" && res.code) {
              settled = true;
              DOM.captchaInput.value = String(res.code);
              abortOthers(req);
              DOM.loginButton.click();
              return;
            }
          } catch (err) {
            console.error(`响应解析失败 [${apiUrl}]`, err);
          }

          if (pending === 0) {
            console.error("所有 OCR API 都未返回可用验证码，请检查服务状态。");
          }
        },
        onerror(err) {
          if (settled) return;
          pending -= 1;
          console.error(`传输失败 [${apiUrl}]`, err);
          if (pending === 0) {
            console.error("所有 OCR API 请求均失败，请检查网络和接口地址。");
          }
        },
      });

      requests.push(req);
    });
  }

  function handleCaptchaImage(apiUrls) {
    const img = DOM.captchaImg;
    if (!img) return;

    const process = () => {
      const base64 = getBase64Image(img);
      recognizeCaptcha(base64, apiUrls);
    };

    img.onload = process;
    if (img.complete) process();
  }

  function main() {
    const credentials = initCredentials();
    if (!credentials) return;

    DOM.usernameInput.value = credentials.username;
    DOM.passwordInput.value = credentials.password;

    handleCaptchaImage(credentials.apiUrls);
  }

  main();
})();