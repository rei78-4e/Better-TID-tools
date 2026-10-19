// =====================================================================
// manaba-file-rename-main.js  (world: "MAIN" / ページ側の JavaScript 世界)
//
// ■ 役割
//   フォーム送信をフックし、拡張機能がファイル名を確認している間だけ
//   送信を止める。UI もファイル操作も持たない、50 行程度の小さな門番。
//
// ■ なぜページ側の世界が必要か
//   manaba.submit_with_button() は submit イベントを発火しない
//   form.submit() を直接呼ぶ（webat.js で確認済み）:
//
//     manaba.submit_with_button = function (form, button_name) {
//       ...
//       form.appendChild(hidden);
//       form.submit();          // ← submit イベントは飛ばない
//     };
//
//   隔離された世界からは submit イベントを監視しても止められず、
//   HTMLFormElement.prototype を差し替えられるのもページ側だけ。
//
// ■ 連携方法
//   manaba-file-rename.js が <html data-btid-hold-submit> を付けている間は
//   送信を無視する。DOM 属性は両方の世界から見えるので、これで受け渡す。
//   ※ HOLD_ATTRIBUTE は manaba-file-rename.js と必ず同じ値にする
// =====================================================================

(function () {
  "use strict";

  /** manaba-file-rename.js と共有するフラグ属性 */
  const HOLD_ATTRIBUTE = "data-btid-hold-submit";

  const proto = HTMLFormElement.prototype;

  /** 拡張機能が「今は送信させない」と言っているか */
  function isHeld() {
    return document.documentElement.hasAttribute(HOLD_ATTRIBUTE);
  }

  // form.submit(): submit イベントを発火しないため、ここでしか止められない
  const originalSubmit = proto.submit;
  proto.submit = function () {
    if (isHeld()) return;
    return originalSubmit.apply(this, arguments);
  };

  // form.requestSubmit(): 通常の送信経路。念のため同じように止める
  if (typeof proto.requestSubmit === "function") {
    const originalRequestSubmit = proto.requestSubmit;
    proto.requestSubmit = function () {
      if (isHeld()) return;
      return originalRequestSubmit.apply(this, arguments);
    };
  }
})();
