# 開發說明

給要修改程式或發佈新版的人。安裝和使用方式見 [README](../README.md)。

## 檔案

- `content.js`、`manifest.json`：外掛本體。所有平台都從這份 `content.js` 來。
- `model/`、`vendor/`：辨識模型和 TensorFlow.js 4.2.0，來自 [justin0u0/NTHU-OAuth-Decaptcha](https://github.com/justin0u0/NTHU-OAuth-Decaptcha) 和 npm，授權全文在 `APACHE-2.0.txt`。
- `safari/`：Xcode 的 Safari 包裝 App，直接引用根目錄的外掛檔案，不另外複製。
- `userscript/`：iPad / iPhone 用的使用者腳本，由 `userscript/build.sh` 從 `content.js` 產生。
- `bookmarklet/`：Android Chrome 書籤載入的腳本，由 `bookmarklet/build.sh` 從 `content.js` 產生。
- `.github/workflows/release.yml`：檢查每個 PR，推版本標籤時發佈所有平台。

## 這個 repo 自己寫的部分

- 頁面一打開就開始載入模型。驗證碼圖若還沒好，會先跑一次空白推論，把 WebGL 編譯提前做完；圖若已經好了，就直接辨識，不先跑空白圖。換圖時沿用已載入的模型。
- 單一 content script：頁面出現驗證碼就辨識，按重新整理換成新圖後再辨識一次。
- 驗證碼欄原本是 `type="number"`，`0123` 這類開頭是 0 的驗證碼會被瀏覽器收成 `123`。填入前會改成文字欄，把 4 個字完整留下。
- 只寫入驗證碼欄。帳號、密碼留給瀏覽器的密碼管理，也不會代按登入。
- 打包進來的 TensorFlow.js 已經沒有 `tensor.toFloat()`。推論改用 `tf.cast` 把像素轉成 0–1，否則模型載入後會在填入前就失敗。
- 電腦拿不到 WebGL 時，TensorFlow.js 會自動改用 CPU 引擎（`tfjs-backend-cpu`）。

## 修改程式

改了 `content.js` 之後，跑一次 `userscript/build.sh` 和 `bookmarklet/build.sh`，重新產生 iPad 和 Android 用的腳本，一起 commit。忘了跑的話，PR 和 `main` 上的檢查會失敗。

每個 PR 和推上 `main` 的 commit 都會打包一份 Edge / Chrome 的 zip，在那次執行的 **Actions** 頁面最下面可以下載，合併前就能實測。

想自己建 Safari App 的話，用 Xcode 打開 `safari/NTHU OAuth Captcha/NTHU OAuth Captcha.xcodeproj`，按 **Product → Run**，代替 README 裡 macOS Safari 安裝的第 1、2 步，不需要 Apple 開發者帳號。

## 版本號

只有使用者拿到的東西變了才發新版：`content.js`、`manifest.json`、`vendor/`、`model/`、兩個 `build.sh` 的產出、Safari App，或打包方式。只改 README、`docs/` 或不影響產出的 CI 設定，不用發版。

版本號照 `主版本.次版本.修正版本`：

- 修 bug、小調整：加最後一位，例如 1.0.2 → 1.0.3。
- 新功能或新平台：加中間一位，最後一位歸零，例如 1.0.3 → 1.1.0。
- 使用者必須手動處理才能繼續用：加第一位，例如 1.1.0 → 2.0.0。

只改到某個平台時也整組一起發，在 Release 說明寫明哪些平台有變。

## 發佈新版

需要這個 repo 的寫入權限。

1. 把 `manifest.json` 的 `version` 往上加，跑兩個 `build.sh`，推上 `main`。只推到 `main` 不會影響任何使用者。
2. 在那個 commit 上推同名的 `v` 開頭標籤，例如 `git tag v1.0.4 && git push origin v1.0.4`。標籤和 `version` 對不上時不會發佈。

GitHub Actions 會把 Edge / Chrome 的 zip 和 Safari App（同時支援 Apple 晶片和 Intel）附到同名的 Release。iPad 的使用者腳本和 Android 的書籤從 jsDelivr 的 `@latest` 載入，它跟著最新的標籤走；Actions 發佈後會清掉 jsDelivr 的快取，所以也在同一刻換成新版。

## 不要動的東西

已經安裝的舊版還會讀這些東西，改了會讓舊版壞掉或收不到更新：

- `bookmarklet/nthu-oauth-captcha.js` 和 `userscript/nthu-oauth-captcha.user.js` 的路徑。
- 已發佈的版本標籤。
- `main` 的歷史，不要 force push。舊的使用者腳本用 commit 編號讀模型。
