// =====================================================================
// manaba-file-rename.js
//
// manaba のレポート提出画面（/ct/course_*_report*）で、ファイルを選択・
// ドロップした瞬間にアップロードされてしまう挙動を止め、先にファイル名を
// 確認・変更できるダイアログを表示する。
//
// ■ 元のページの挙動（サーバー側ではなく、ページの JavaScript が原因）
//   <input id="AFFirstInput" onchange="...manaba.submit_with_button(...)">
//   <div class="dropzone" ondrop="dropHandler(event,'AFFirstInput')">
//   → 選んだ / ドロップした瞬間にフォームが POST される
//
// ■ このファイルの構成
//   1. 定数
//   2. 文言
//   3. 初期化
//   4. ページの自動送信を止める
//   5. ドラッグ＆ドロップ（ページ全体）
//   6. 送信ガード
//   7. ファイル処理（決定 → input.files 反映 → 送信）
//   8. 補助関数
//   9. ファイル名ダイアログ
//
// ■ 送信方法
//   決定後は File を同名で作り直して input.files に入れ、本来の「Upload」
//   ボタンを押したのと同じ requestSubmit を行う。送信処理自体は書き換えない
//   ので、manaba の onsubmit="manaba.sessioncheck()" もそのまま動く。
//
// ■ ページ側の世界について
//   manaba.submit_with_button() は submit イベントを発火しない form.submit()
//   を使うため、この隔離された世界からは止められない。
//   manaba-file-rename-main.js（world: "MAIN"）が HOLD_ATTRIBUTE を見て止める。
// =====================================================================

(function () {
  "use strict";

  /* ================================================================
   * 1. 定数
   * ================================================================ */

  const INPUT_ID = "AFFirstInput";
  const SUBMIT_NAME = "action_ReportStudent_submitdone";
  const DROPZONE_SELECTOR = ".dropzone";

  /** manaba-file-rename-main.js と共有する「送信を止める」フラグ */
  const HOLD_ATTRIBUTE = "data-btid-hold-submit";
  /** 読み込まれている版（DevTools での確認用） */
  const VERSION_ATTRIBUTE = "data-btid-file-rename";
  /** 初期化済みの目印（二重初期化の防止） */
  const READY_ATTRIBUTE = "data-btid-rename-ready";

  /** ダイアログを開いた直後の誤クリック・誤キー入力を無視する時間 (ms) */
  const OPENING_GUARD_MS = 150;

  /** ファイル名に使えない文字（パス区切り・制御文字） */
  const INVALID_NAME_PATTERN = /[\/\\\u0000-\u001f]/;

  /* ================================================================
   * 2. 文言
   * ================================================================ */

  const MESSAGES = {
    en: {
      title: "Rename the file before uploading",
      originalLabel: "Selected file",
      nameLabel: "File name",
      hint: "This name is sent to the server as-is, and it is what the instructor will see.",
      noteMultiple:
        "Only the first file is used, because this assignment accepts a single file.",
      upload: "Upload with this name",
      keep: "Upload without renaming",
      cancel: "Cancel",
      errorEmpty: "Please enter a file name.",
      errorInvalid: 'A file name cannot contain the characters "/" or "\\".',
      errorReserved: 'The name "." or ".." cannot be used.',
      logFailed: "[Better-TID-tools] Failed to rename the file",
    },
    ja: {
      title: "アップロード前にファイル名を変更",
      originalLabel: "選択したファイル",
      nameLabel: "ファイル名",
      hint: "入力した名前がそのままサーバーに送信され、教員側にもこの名前で表示されます。",
      noteMultiple:
        "この課題は1ファイルのみ提出できます。最初のファイルだけを使用します。",
      upload: "この名前でアップロード",
      keep: "そのままアップロード",
      cancel: "キャンセル",
      errorEmpty: "ファイル名を入力してください。",
      errorInvalid: "ファイル名に「/」や「\\」は使用できません。",
      errorReserved: "「.」や「..」はファイル名として使用できません。",
      logFailed: "[Better-TID-tools] ファイル名の変更に失敗しました",
    },
  };

  /* ================================================================
   * 3. 初期化
   * ================================================================ */

  const input = document.getElementById(INPUT_ID);
  if (!input || input.getAttribute(READY_ATTRIBUTE) === "1") {
    return;
  }
  input.setAttribute(READY_ATTRIBUTE, "1");

  const T = MESSAGES[isEnglishPage() ? "en" : "ja"];

  exposeVersion();
  disablePageAutoSubmit(input);
  const submitGuard = installSubmitGuard(input);
  enablePageWideDrop();

  // 同じファイルを二重に処理しないためのフラグ
  let busy = false;

  // change を直接呼ぶページ側コードにも追従できるよう、プロパティとして設定する
  input.onchange = function () {
    handleFiles(input.files);
  };

  /* ================================================================
   * 4. ページの自動送信を止める
   * ================================================================ */

  /**
   * 自動送信の原因はページのインライン属性なので、それを外せば止まる。
   *   <input onchange="...manaba.submit_with_button(...)">
   *   <div class="dropzone" ondrop="dropHandler(...)" ondragover="...">
   */
  function disablePageAutoSubmit(fileInput) {
    fileInput.removeAttribute("onchange");

    const dropzone =
      fileInput.closest(DROPZONE_SELECTOR) || fileInput.parentElement;
    if (!dropzone) return;

    dropzone.removeAttribute("ondrop");
    dropzone.removeAttribute("ondragover");
  }

  /* ================================================================
   * 5. ドラッグ＆ドロップ（ページ全体で受け付ける）
   * ----------------------------------------------------------------
   * 元の .dropzone は 117x41px しかないため、少し外して落とすと
   * ページ側のハンドラが無く、ブラウザがファイルを直接開いてしまう。
   * ================================================================ */

  function enablePageWideDrop() {
    document.addEventListener("dragover", onPageDragOver, true);
    document.addEventListener("drop", onPageDrop, true);
  }

  function onPageDragOver(ev) {
    if (!containsFiles(ev.dataTransfer)) return;

    // preventDefault しないと drop が発生せず、ブラウザがファイルを開く
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "copy";
  }

  function onPageDrop(ev) {
    if (!containsFiles(ev.dataTransfer)) return;

    ev.preventDefault();
    ev.stopPropagation(); // ページ側の drop ハンドラ（自動アップロード）を止める

    // dataTransfer はイベント終了後に読めなくなるので、先に取り出しておく
    const files = Array.from(ev.dataTransfer.files);

    // ダイアログは次のタスクで開く。ドラッグ終了時のクリックが
    // 開いたばかりのダイアログのボタンに当たるのを避けるため。
    setTimeout(function () {
      handleFiles(files);
    }, 0);
  }

  /** ドラッグ中のデータにファイルが含まれているか */
  function containsFiles(dataTransfer) {
    if (!dataTransfer || !dataTransfer.types) return false;
    return Array.prototype.indexOf.call(dataTransfer.types, "Files") !== -1;
  }

  /* ================================================================
   * 6. 送信ガード
   * ----------------------------------------------------------------
   * ダイアログ表示中は、どの経路からの送信も止める。
   *   1) submit イベント … このファイルの form リスナーで止める
   *   2) form.submit()   … submit イベントが発生しない。
   *                        manaba-file-rename-main.js（ページ側の世界）が
   *                        HOLD_ATTRIBUTE を見て止める。
   * ================================================================ */

  function installSubmitGuard(fileInput) {
    let armed = false;

    const form = fileInput.form;
    if (form) {
      form.addEventListener("submit", onFormSubmit, true);
    }

    // キャプチャ段階なので、ページ側の change リスナーより先に実行される
    document.addEventListener("change", onDocumentChange, true);

    function onFormSubmit(ev) {
      if (!armed) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
    }

    function onDocumentChange(ev) {
      if (ev.target === fileInput) arm();
    }

    function arm() {
      armed = true;
      document.documentElement.setAttribute(HOLD_ATTRIBUTE, "1");
    }

    function release() {
      armed = false;
      document.documentElement.removeAttribute(HOLD_ATTRIBUTE);
    }

    return { arm: arm, release: release };
  }

  /* ================================================================
   * 7. ファイル処理
   * ================================================================ */

  async function handleFiles(fileList) {
    if (busy) return;

    const files = Array.from(fileList || []);
    const file = files[0];
    if (!file) {
      submitGuard.release();
      resetInput();
      return;
    }

    submitGuard.arm();
    busy = true;

    try {
      const decision = await askFileName(file, files.length > 1);

      if (decision === null) {
        // キャンセル: 何も送信しない。同じファイルを選び直せるようリセットする
        submitGuard.release();
        resetInput();
        return;
      }

      const target = decision === true ? file : renameFile(file, decision);
      setInputFile(target);

      submitGuard.release(); // ここから先は通常どおり送信する
      submitUpload();
    } catch (err) {
      console.error(T.logFailed, err);
      submitGuard.release();
      resetInput();
    } finally {
      busy = false;
    }
  }

  /** 中身と MIME タイプはそのままに、名前だけ変えた File を作る */
  function renameFile(file, name) {
    if (name === file.name) return file;
    return new File([file], name, {
      type: file.type,
      lastModified: file.lastModified,
    });
  }

  /** 同じファイルをもう一度選べるように入力を空にする */
  function resetInput() {
    try {
      input.value = "";
    } catch (_) {
      /* 無視 */
    }
  }

  /** 元のページと同じく「input.files に入れてから送信」する */
  function setInputFile(file) {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
  }

  /** 本来の「Upload」ボタンを押したのと同じ送信を行う */
  function submitUpload() {
    const form = input.form;
    if (!form) return;

    submitGuard.release(); // ページ側の世界のフックを外す

    const button = findSubmitButton(form);

    if (typeof form.requestSubmit === "function") {
      // 送信ボタン経由と同じ扱い。onsubmit="manaba.sessioncheck()" も実行される
      if (button) {
        form.requestSubmit(button);
      } else {
        form.requestSubmit();
      }
    } else if (button) {
      button.click();
    } else {
      form.submit();
    }
  }

  function findSubmitButton(form) {
    return form.querySelector(
      `input[type="submit"][name="${SUBMIT_NAME}"], button[type="submit"][name="${SUBMIT_NAME}"]`,
    );
  }

  /* ================================================================
   * 8. 補助関数
   * ================================================================ */

  /** manaba の表示言語が英語か */
  function isEnglishPage() {
    const lang = (
      document.documentElement.lang ||
      navigator.language ||
      ""
    ).toLowerCase();
    return lang.startsWith("en");
  }

  /** 読み込まれている版を DevTools から確認できるようにする（コンソールには出さない） */
  function exposeVersion() {
    try {
      document.documentElement.setAttribute(
        VERSION_ATTRIBUTE,
        chrome.runtime.getManifest().version,
      );
    } catch (_) {
      /* 拡張機能のコンテキストが無効な場合は無視 */
    }
  }

  /** ファイル名から拡張子を取り出す（".jpg" 形式 / 無ければ空文字） */
  function getExtension(fileName) {
    const lastDot = fileName.lastIndexOf(".");
    return lastDot > 0 ? fileName.slice(lastDot) : "";
  }

  /* ================================================================
   * 9. ファイル名ダイアログ
   * ----------------------------------------------------------------
   * ページ側の CSS の影響を受けないよう Shadow DOM 内で完結させる。
   *   resolve(true)   … そのままアップロード
   *   resolve("name") … その名前でアップロード
   *   resolve(null)   … キャンセル
   * ================================================================ */

  const DIALOG_HTML = `
    <style>
      :host { all: initial; }
      dialog.panel {
        box-sizing: border-box; width: min(540px, calc(100vw - 40px));
        max-height: calc(100vh - 40px); overflow: auto;
        margin: auto; padding: 20px 22px;
        border: none; border-radius: 12px;
        background: #fff; color: #1f2328;
        font-family: system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif;
        font-size: 14px; line-height: 1.5; text-align: left;
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
      }
      dialog.panel::backdrop { background: rgba(0, 0, 0, 0.45); }
      .title { margin: 0 0 14px; font-size: 17px; font-weight: 700; }
      .row { display: flex; gap: 8px; align-items: baseline; margin-bottom: 10px; }
      .label { font-size: 12px; font-weight: 600; color: #5b6572; }
      .original { font-size: 13px; word-break: break-all; }
      input.name {
        box-sizing: border-box; width: 100%; margin-top: 4px; padding: 8px 10px;
        border: 1px solid #b9c0c8; border-radius: 6px;
        font: inherit; color: inherit; background: #fff;
      }
      input.name:focus { outline: 2px solid #2f6fd0; outline-offset: 1px; border-color: #2f6fd0; }
      .hint { margin-top: 8px; font-size: 12px; color: #5b6572; }
      .note { margin-top: 6px; font-size: 12px; color: #a3560b; }
      .error { margin-top: 6px; font-size: 12px; color: #c02a2a; }
      .error:empty { display: none; }
      .actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; margin-top: 18px; }
      button.btn {
        font: inherit; padding: 7px 14px; border-radius: 6px; cursor: pointer;
        border: 1px solid #9aa4ae; background: #f6f7f9; color: #1f2328;
      }
      button.btn:hover { background: #eceff3; }
      button.btn.primary { border-color: #2f6fd0; background: #2f6fd0; color: #fff; }
      button.btn.primary:hover { background: #2a63ba; }
    </style>
    <dialog class="panel" aria-labelledby="bt-title">
      <div class="title" id="bt-title"></div>
      <div class="row">
        <span class="label" data-ref="originalLabel"></span>
        <span class="original" data-ref="originalName"></span>
      </div>
      <label class="label" for="bt-name" data-ref="nameLabel"></label>
      <input class="name" id="bt-name" type="text" spellcheck="false" autocomplete="off">
      <div class="hint" data-ref="hint"></div>
      <div class="note" data-ref="note"></div>
      <div class="error" data-ref="error"></div>
      <div class="actions">
        <button class="btn primary" type="button" data-act="upload"></button>
        <button class="btn" type="button" data-act="keep"></button>
        <button class="btn" type="button" data-act="cancel"></button>
      </div>
    </dialog>`;

  function askFileName(file, multiple) {
    return new Promise(function (resolve) {
      const host = document.createElement("div");
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = DIALOG_HTML;

      const ref = function (name) {
        return shadow.querySelector('[data-ref="' + name + '"]');
      };

      const els = {
        dialog: shadow.querySelector("dialog.panel"),
        title: shadow.getElementById("bt-title"),
        originalLabel: ref("originalLabel"),
        originalName: ref("originalName"),
        nameLabel: ref("nameLabel"),
        nameInput: shadow.getElementById("bt-name"),
        hint: ref("hint"),
        note: ref("note"),
        error: ref("error"),
        actions: shadow.querySelector(".actions"),
        uploadButton: shadow.querySelector('[data-act="upload"]'),
        keepButton: shadow.querySelector('[data-act="keep"]'),
        cancelButton: shadow.querySelector('[data-act="cancel"]'),
      };

      const extension = getExtension(file.name);
      const gate = createActivationGate(shadow);

      fillDialog(els, file, multiple);
      els.nameInput.value = file.name;

      /* ---------- 閉じる ---------- */
      function close(value) {
        shadow.removeEventListener("keydown", onKeyDown);
        if (els.dialog.open) els.dialog.close();
        host.remove();
        resolve(value);
      }

      /* ---------- 「この名前でアップロード」 ---------- */
      function submitName() {
        const result = normalizeFileName(els.nameInput.value, extension);
        if (result.error) {
          els.error.textContent = result.error;
          els.nameInput.focus();
          return;
        }
        close(result.name);
      }

      /* ---------- 入力チェック ---------- */
      function normalizeFileName(rawValue, ext) {
        const name = rawValue.trim();
        if (!name) return { error: T.errorEmpty };
        if (name === "." || name === "..") return { error: T.errorReserved };
        if (INVALID_NAME_PATTERN.test(name)) return { error: T.errorInvalid };

        // 拡張子が消えてしまった場合は元の拡張子を補う
        const withExtension = ext && !name.includes(".") ? name + ext : name;
        return { name: withExtension };
      }

      /* ---------- ボタン ---------- */
      function onActionClick(ev) {
        const button =
          ev.target && ev.target.closest
            ? ev.target.closest("[data-act]")
            : null;
        if (!button) return;
        if (!gate.acceptsClick(ev)) return;

        if (button.dataset.act === "upload") submitName();
        else if (button.dataset.act === "keep") close(true);
        else close(null);
      }

      /* ---------- キーボード ---------- */
      // Enter で確定 / Esc で中止
      // （<dialog> のネイティブな Esc は環境によって発火しないことがあるため自前でも処理する）
      function onKeyDown(ev) {
        if (ev.key === "Escape") {
          ev.preventDefault();
          ev.stopPropagation();
          close(null);
        } else if (ev.key === "Enter") {
          ev.preventDefault();
          ev.stopPropagation();
          if (gate.isOpening()) return; // 開いた直後の誤入力を無視
          submitName();
        }
      }

      els.dialog.addEventListener("cancel", function (ev) {
        ev.preventDefault(); // ネイティブの close を止めて、後始末を自前で行う
        close(null);
      });
      els.actions.addEventListener("click", onActionClick);
      shadow.addEventListener("keydown", onKeyDown);

      document.body.appendChild(host);
      els.dialog.showModal(); // トップレイヤー表示 + 背景の不活性化 + フォーカストラップ

      // 拡張子の手前までを選択状態にして、すぐ上書きできるようにする
      els.nameInput.focus();
      els.nameInput.setSelectionRange(0, file.name.length - extension.length);
    });
  }

  /** ダイアログの固定文言を流し込む（ファイル名は必ず textContent で入れる） */
  function fillDialog(els, file, multiple) {
    els.title.textContent = T.title;
    els.originalLabel.textContent = T.originalLabel;
    els.originalName.textContent = file.name;
    els.nameLabel.textContent = T.nameLabel;
    els.hint.textContent = T.hint;
    els.note.textContent = multiple ? T.noteMultiple : "";
    els.uploadButton.textContent = T.upload;
    els.keepButton.textContent = T.keep;
    els.cancelButton.textContent = T.cancel;
  }

  /**
   * ダイアログを開いた直後の誤操作を弾くゲート。
   *   - 開いてすぐ（OPENING_GUARD_MS 未満）のクリック / Enter
   *   - ダブルクリックの2回目（detail >= 2）
   *   - ダイアログ内で実際に押していないクリック（ドラッグ終了時など）
   */
  function createActivationGate(shadow) {
    const openedAt = Date.now();
    let pressedInside = false;

    shadow.addEventListener(
      "pointerdown",
      function () {
        pressedInside = true;
      },
      true,
    );

    shadow.addEventListener(
      "pointerup",
      function () {
        // click は pointerup の直後に発火するので、その後にフラグを戻す
        setTimeout(function () {
          pressedInside = false;
        }, 0);
      },
      true,
    );

    function isOpening() {
      return Date.now() - openedAt < OPENING_GUARD_MS;
    }

    function acceptsClick(ev) {
      if (isOpening()) return false;
      if (ev.detail >= 2) return false;
      return pressedInside;
    }

    return { isOpening: isOpening, acceptsClick: acceptsClick };
  }
})();
