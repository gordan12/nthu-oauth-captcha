# 清大 OAuth 驗證碼自動填入

給 Edge、Chrome、macOS Safari 和 iPad / iPhone Safari 用的登入小外掛。驗證碼辨識模型不是這個 repo 訓練的，權重直接使用 [justin0u0/NTHU-OAuth-Decaptcha](https://github.com/justin0u0/NTHU-OAuth-Decaptcha)（Copyright 2022 Justin Chen, Bronwin Chen，Apache License 2.0）。

用 Chrome、而且只想裝現成擴充功能的話，用他們的專案即可。他們另外附了訓練程式、驗證碼產生器和 Chrome 線上應用程式商店的安裝方式。

給同學用的檔案都列在下面的「下載」，不用下載整個原始碼。

## 這個 repo 自己寫的部分

- 頁面一打開就開始載入模型。驗證碼圖若還沒好，會先跑一次空白推論，把 WebGL 編譯提前做完；圖若已經好了，就直接辨識，不先跑空白圖。換圖時沿用已載入的模型。
- 單一 content script：頁面出現驗證碼就辨識，按重新整理換成新圖後再辨識一次。
- 驗證碼欄原本是 `type="number"`，`0123` 這類開頭是 0 的驗證碼會被瀏覽器收成 `123`。填入前會改成文字欄，把 4 個字完整留下。
- 只寫入驗證碼欄。帳號、密碼留給瀏覽器的密碼管理，也不會代按登入。
- 打包進來的 TensorFlow.js 已經沒有 `tensor.toFloat()`。推論改用 `tf.cast` 把像素轉成 0–1，否則模型載入後會在填入前就失敗。

`model/` 與 `vendor/` 來自上面那個專案，授權全文在 `APACHE-2.0.txt`。`content.js` 和 `manifest.json` 是這個外掛自己的程式。`safari/` 是 Xcode 的 Safari 包裝 App，直接引用根目錄的同一份外掛檔案，不另外複製。`.github/workflows/safari.yml` 負責把它建好附到 Release。`userscript/` 是給 iPad 用的使用者腳本，由 `userscript/build.sh` 從 `content.js` 產生。

## 下載

- Edge / Chrome：[Releases](https://github.com/gordan12/nthu-oauth-captcha/releases/latest) 裡的 `nthu-oauth-captcha-chrome-*.zip`
- macOS Safari：[Releases](https://github.com/gordan12/nthu-oauth-captcha/releases/latest) 裡的 `nthu-oauth-captcha-safari-*.zip`
- iPad / iPhone Safari：[nthu-oauth-captcha.user.js](https://raw.githubusercontent.com/gordan12/nthu-oauth-captcha/main/userscript/nthu-oauth-captcha.user.js)（要先裝 Userscripts，見下面的安裝步驟）

## 安裝

### Edge / Chrome

1. 下載 `nthu-oauth-captcha-chrome-*.zip`，解壓縮。
2. 打開 `edge://extensions`（Chrome 則是 `chrome://extensions`）。
3. 打開**開發人員模式**。
4. 按**載入未封裝**，選解壓後裡面有 `manifest.json` 的那個資料夾。
5. 打開清大 OAuth 登入頁。驗證碼下方出現「驗證碼已填入」後，確認帳號密碼，再按登入。

### macOS Safari

需要 macOS 12 以上。

1. 下載 `nthu-oauth-captcha-safari-*.zip`。用 Safari 下載會自動解開成「NTHU OAuth Captcha」；若下載項目裡還是 zip，雙擊就會解開。把它拖進「應用程式」。
2. 打開「NTHU OAuth Captcha」。macOS 會說無法確認是否含有惡意軟體，因為這個 App 沒有經過 Apple 公證。到**系統設定 → 隱私權與安全性**，往下按**仍要打開**，再打開一次。跳出的小視窗可以關掉。
3. Safari 打開**設定 → 進階**，勾選**顯示網頁開發者功能**。
4. 在**設定 → 開發者**勾選**允許未簽署的延伸功能**。
5. 在**設定 → 延伸功能**勾選「清大 OAuth 驗證碼自動填入」。
6. 打開清大 OAuth 登入頁，按網址列旁的外掛圖示，選**在此網站上一律允許**。驗證碼下方出現「驗證碼已填入」後，確認帳號密碼，再按登入。

「允許未簽署的延伸功能」在 Safari 每次結束後會自動取消，重開 Safari 後要再勾一次。要免掉這一步，App 得用付費的 Apple 開發者帳號簽章；或者改照下面 iPad / iPhone 的 Userscripts 做法，Mac 的 Safari 也適用，不用每次重開都勾。

### iPad / iPhone Safari

iPad 的 Safari 不能直接載入外掛檔案，這裡改用免費的 Userscripts 外掛執行同一份程式。TensorFlow.js 和模型第一次會從 jsDelivr 下載。

1. 從 App Store 安裝「Userscripts」，打開一次，照指示選一個存放腳本的資料夾。
2. 到**設定 → Safari → 延伸功能**（較新的 iPadOS 在**設定 → App → Safari → 延伸功能**），打開 Userscripts。
3. 用 Safari 打開上面「下載」裡的 `nthu-oauth-captcha.user.js` 連結，從網址列的延伸功能選單點 Userscripts，按安裝。
4. 打開清大 OAuth 登入頁，Safari 問 Userscripts 的權限時選允許。驗證碼下方出現「驗證碼已填入」後，確認帳號密碼，再按登入。

## 使用

若某一張圖填錯，按驗證碼旁邊的重新整理圖示，外掛會換一張再辨識。

只作用於 `https://oauth.ccxp.nthu.edu.tw/v1.1/authorize.php`。校務系統首頁 `www.ccxp.nthu.edu.tw` 的 6 位驗證碼不在範圍內。

## 開發

想自己建 Safari App 的話，用 Xcode 打開 `safari/NTHU OAuth Captcha/NTHU OAuth Captcha.xcodeproj`，按 **Product → Run**，代替 macOS Safari 安裝的第 1、2 步，不需要 Apple 開發者帳號。

改了 `content.js` 之後，跑一次 `userscript/build.sh` 重新產生 iPad 用的使用者腳本。

發佈新版（需要這個 repo 的寫入權限）：推一個 `v` 開頭的標籤（例如 `git tag v1.0.1 && git push origin v1.0.1`），GitHub Actions 會把 Edge / Chrome 的 zip 和 Safari App 一起附到同名的 Release。Safari App 同時支援 Apple 晶片和 Intel。fork 的話要先在 fork 的 **Actions** 頁面啟用，Release 會建在自己的 fork。
