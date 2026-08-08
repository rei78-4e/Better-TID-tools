(function () {
  "use strict";

  const BTN_SUBMIT = "#ibtnOK";
  const BTN_CLOSE = "#ibtnClose";

  function isVisible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse"
    ) {
      return false;
    }

    return element.getClientRects().length > 0;
  }

  // ボタンの表示状態とヒントを同期
  function syncHint(buttonSelector, hintId, hintText) {
    const button = document.querySelector(buttonSelector);
    const existingHint = document.getElementById(hintId);

    if (!isVisible(button)) {
      if (existingHint) {
        existingHint.remove();
      }
      return;
    }

    let hint = existingHint;
    if (!hint) {
      hint = document.createElement("div");
      hint.id = hintId;
      hint.innerText = hintText;
      hint.style.color = "#0066cc";
      hint.style.fontSize = "13px";
      hint.style.marginTop = "4px";
      hint.style.textAlign = "center";
    }

    // ボタンの直後に挿入（すでに位置が違う場合も再配置）
    if (button.parentNode && hint.previousElementSibling !== button) {
      button.parentNode.insertBefore(hint, button.nextSibling);
    }
  }

  function syncAllHints() {
    syncHint(BTN_SUBMIT, "enter-key-hint", "Enterキー");
    syncHint(BTN_CLOSE, "esc-key-hint", "ESCキー");
  }

  syncAllHints();

  // DOM更新後にもヒントの表示状態を追従
  const observer = new MutationObserver(syncAllHints);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class", "hidden"],
  });

  // キーボードが押される度に実行
  document.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      // 出席ボタンのエレメントを取得
      // AAAのホーム画面にいると
      // 出席ボタンは常にDOMにあるがCSSで隠されているようなので
      // offsetParentで実際に画面に見えるかどうか判定
      const button = document.querySelector(BTN_SUBMIT);
      if (button && button.offsetParent !== null) {
        button.click();
        // 送信後のUI更新でボタンが消えるケースに対応
        setTimeout(syncAllHints, 0);
      }
    } else if (event.key === "Escape") {
      const button = document.querySelector(BTN_CLOSE);
      if (button && button.offsetParent !== null) {
        button.click();
        setTimeout(syncAllHints, 0);
      }
    }
  });
})(); // すぐに関数を実行
