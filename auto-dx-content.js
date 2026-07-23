(function() {
    "use strict";

    const DATA = {
        // DXリテラシーテスト2024
        391: false, 392: false, 393: true, 394: true, 395: false, 396: false, 397: true, 398: false, 399: true, 400: true,
        401: false, 402: false, 403: true, 404: true, 405: false, 406: false, 407: true, 408: false, 409: false, 410: true,
        411: false, 412: false, 413: false, 414: true, 415: false, 416: true, 417: true, 418: true, 419: false, 420: true,

        // IT/DXリテラシーテスト2025
        482: true, 483: false, 484: false, 485: true, 486: true, 487: false, 488: false, 489: false, 491: false, 492: false,
        493: false, 494: false, 495: true, 497: false, 498: true, 499: true, 500: false, 501: false, 502: false, 503: true,
        504: false, 505: false, 506: false, 507: false, 508: false, 510: false, 511: true, 512: false, 513: false, 514: true,
        515: false, 516: false, 517: false, 518: true, 519: true, 520: true, 521: false, 522: false, 523: false, 524: false,
        525: true, 526: false, 527: true,

        // DXリテラシーテスト2026
        576: true, 577: false, 578: true, 579: false, 580: false, 581: false, 582: false, 583: false, 584: false, 585: true,
        586: false, 587: false, 588: false, 589: false, 590: true, 591: true, 592: true, 593: false, 594: true, 595: false,
        596: true, 597: true, 598: true, 599: true, 600: true, 601: false, 602: true, 603: true, 604: true, 605: false,
        606: false, 607: false, 608: true, 609: true, 610: false
    };

    // Firefox は browser、Chrome は chrome を提供する
    const extensionApi = globalThis.browser ?? globalThis.chrome;

    const banner = document.createElement("div");
    banner.id = "auto-dx-test-chrome-extension-banner";
    banner.className = "auto-dx-test-banner";

    const icon = document.createElement("img");
    icon.src = extensionApi.runtime.getURL("icons/auto-dx-icon32.png");
    icon.alt = "";
    icon.className = "auto-dx-test-banner-icon";

    const text = document.createElement("span");
    text.textContent = "自動回答する場合は、最初の問題まで移動してください。";
    text.className = "auto-dx-test-banner-text";

    const switchWrapper = document.createElement("label");
    switchWrapper.className = "auto-dx-test-banner-switch";

    const switchInput = document.createElement("input");
    switchInput.type = "checkbox";
    switchInput.className = "auto-dx-test-switch-input";

    const switchSlider = document.createElement("span");
    switchSlider.className = "auto-dx-test-switch-slider";

    const switchLabel = document.createElement("span");
    switchLabel.textContent = "自動で回答を開始";
    switchLabel.className = "auto-dx-test-switch-label";

    switchWrapper.appendChild(switchInput);
    switchWrapper.appendChild(switchSlider);
    switchWrapper.appendChild(switchLabel);

    banner.appendChild(icon);
    banner.appendChild(text);
    banner.appendChild(switchWrapper);
    document.body.appendChild(banner);

    const STORAGE_KEY = "autoDxTestSwitchOn";
    const testUrlPattern = /^https:\/\/itlexam\.jikeigroup\.net\/test\/[^/]+\/[^/]+/;
    const confirmUrlPattern = /^https:\/\/itlexam\.jikeigroup\.net\/test\/[^/]+\/[^/]+\/confirm\/?/;

    function doAnswering() {
        const maruDiv = document.querySelector(".row-answer-maru");
        const batsuDiv = document.querySelector(".row-answer-batsu");
        if (!maruDiv || !batsuDiv) {
            return;
        }

        const maruA = maruDiv.querySelector("a[onclick]");
        const batsuA = batsuDiv.querySelector("a[onclick]");
        if (!maruA || !batsuA) {
            return;
        }

        const onclickAttr = maruA.getAttribute("onclick") || batsuA.getAttribute("onclick") || "";
        const match = onclickAttr.match(/OnSubmitForm\(event,\s*'[^']+',\s*(\d+)\s*,/);
        if (!match) {
            alert("問題番号が取得できませんでした。");
            return;
        }

        const qid = Number(match[1]);
        const answer = DATA[qid];
        if (answer === undefined) {
            alert("回答が不明です。");
            return;
        }

        maruA.removeAttribute("onclick");
        batsuA.removeAttribute("onclick");
        maruA.removeAttribute("href");
        batsuA.removeAttribute("href");

        if (answer) {
            maruA.click();
        } else {
            batsuA.click();
        }
    }

    if (confirmUrlPattern.test(location.href)) {
        alert("解答が終了しました。");
        localStorage.setItem(STORAGE_KEY, "false");
        switchInput.checked = false;
    }

    const storedSwitchState = localStorage.getItem(STORAGE_KEY);
    const isOn = storedSwitchState === null ? true : storedSwitchState === "true";
    if (storedSwitchState === null) {
        localStorage.setItem(STORAGE_KEY, "true");
    }
    switchInput.checked = isOn;

    if (isOn && testUrlPattern.test(location.href)) {
        doAnswering();
    }

    switchInput.addEventListener("change", () => {
        if (switchInput.checked) {
            if (!confirm("自動解答をオンにしますか？")) {
                switchInput.checked = false;
                return;
            }
            localStorage.setItem(STORAGE_KEY, "true");
            if (testUrlPattern.test(location.href)) {
                doAnswering();
            }
            return;
        }
        localStorage.setItem(STORAGE_KEY, "false");
    });
})();
