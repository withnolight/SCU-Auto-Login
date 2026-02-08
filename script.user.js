// ==UserScript==
// @name         SCU-Auto-login
// @namespace    http://tampermonkey.net/
// @version      2026-02-08
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

  function initCredentials() {
    let username = GM_getValue("scu_username");
    let password = GM_getValue("scu_password");
    let apiUrl = GM_getValue("scu_api_url");

    if (!username || !password || !apiUrl) {
      alert("检测到首次运行，请设置您的教务系统账号信息以开启自动填充。");
      username = prompt("请输入学号:");
      password = prompt("请输入密码:");
      apiUrl = prompt(
        "请输入 OCR 服务器地址 (例如 http://127.0.0.1:5000/api/ocr):"
      );

      if (username && password && apiUrl) {
        GM_setValue("scu_username", username);
        GM_setValue("scu_password", password);
        GM_setValue("scu_api_url", apiUrl);
        alert("设置成功！刷新页面即可生效。请同意油猴的跨域请求权限！");
      } else {
        alert("取消设置，脚本将不会自动填充。");
      }
      return null;
    }

    return { username, password, apiUrl };
  }

  function getBase64Image(imgElement) {
    const canvas = document.createElement("canvas");
    canvas.width = imgElement.naturalWidth;
    canvas.height = imgElement.naturalHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(imgElement, 0, 0);

    return canvas.toDataURL("image/png");
  }

  function recognizeCaptcha(base64, apiUrl) {
    GM_xmlhttpRequest({
      method: "POST",
      url: apiUrl,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ image: base64 }),
      onload(response) {
        const res = JSON.parse(response.responseText);
        console.log("识别结果：", res);
        if (res.status === "success") {
          DOM.captchaInput.value = res.code;
        }
        DOM.loginButton.click();
      },
      onerror(err) {
        console.error("传输失败", err);
      },
    });
  }

  function handleCaptchaImage(apiUrl) {
    const img = DOM.captchaImg;
    if (!img) return;

    const process = () => {
      const base64 = getBase64Image(img);
      recognizeCaptcha(base64, apiUrl);
    };

    img.onload = process;
    if (img.complete) process();
  }

  function main() {
    const credentials = initCredentials();
    if (!credentials) return;

    DOM.usernameInput.value = credentials.username;
    DOM.passwordInput.value = credentials.password;

    handleCaptchaImage(credentials.apiUrl);
  }

  main();
})();