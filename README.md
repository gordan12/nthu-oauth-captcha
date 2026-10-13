# 清大 OAuth 驗證碼自動填入

給 Edge 和 macOS Safari 用的登入小外掛。驗證碼辨識模型不是這個 repo 訓練的，權重直接使用 [justin0u0/NTHU-OAuth-Decaptcha](https://github.com/justin0u0/NTHU-OAuth-Decaptcha)（Copyright 2022 Justin Chen, Bronwin Chen，Apache License 2.0）。

用 Chrome、而且只想裝現成擴充功能的話，用他們的專案即可。他們另外附了訓練程式、驗證碼產生器和 Chrome 線上應用程式商店的安裝方式。

這個 repo 只留同學從 GitHub 下載後，在 Edge 或 Safari 載入的那一份外掛。

## 這個 repo 自己寫的部分

- 頁面一打開就開始載入模型。驗證碼圖若還沒好，會先跑一次空白推論，把 WebGL 編譯提前做完；圖若已經好了，就直接辨識，不先跑空白圖。換圖時沿用已載入的模型。
- 單一 content script：頁面出現驗證碼就辨識，按重新整理換成新圖後再辨識一次。
- 驗證碼欄原本是 `type="number"`，`0123` 這類開頭是 0 的驗證碼會被瀏覽器收成 `123`。填入前會改成文字欄，把 4 個字完整留下。
- 只寫入驗證碼欄。帳號、密碼留給瀏覽器的密碼管理，也不會代按登入。
- 打包進來的 TensorFlow.js 已經沒有 `tensor.toFloat()`。推論改用 `tf.cast` 把像素轉成 0–1，否則模型載入後會在填入前就失敗。

`model/` 與 `vendor/` 來自上面那個專案，授權全文在 `APACHE-2.0.txt`。`content.js` 和 `manifest.json` 是這個外掛自己的程式。`safari/` 是 Xcode 的 Safari 包裝 App，直接引用根目錄的同一份外掛檔案，不另外複製。`.github/workflows/safari.yml` 負責把它建好附到 Release。

## 安裝（Edge / Chrome）

1. 按 **Code → Download ZIP**，解壓縮。
2. 打開 `edge://extensions`（Chrome 則是 `chrome://extensions`）。
3. 打開**開發人員模式**。
4. 按**載入未封裝**，選解壓後裡面有 `manifest.json` 的那個資料夾。
5. 打開清大 OAuth 登入頁。驗證碼下方出現「驗證碼已填入」後，確認帳號密碼，再按登入。

## 安裝（macOS Safari）

需要 macOS 12 以上。

1. 到 [Releases](https://github.com/gordan12/nthu-oauth-captcha/releases/latest) 下載 `nthu-oauth-captcha-safari-*.zip`。用 Safari 下載會自動解開成「NTHU OAuth Captcha」；若下載項目裡還是 zip，雙擊就會解開。把它拖進「應用程式」。
2. 打開「NTHU OAuth Captcha」。macOS 會說無法確認是否含有惡意軟體，因為這個 App 沒有經過 Apple 公證。到**系統設定 → 隱私權與安全性**，往下按**仍要打開**，再打開一次。跳出的小視窗可以關掉。
3. Safari 打開**設定 → 進階**，勾選**顯示網頁開發者功能**。
4. 在**設定 → 開發者**勾選**允許未簽署的延伸功能**。
5. 在**設定 → 延伸功能**勾選「清大 OAuth 驗證碼自動填入」。
6. 打開清大 OAuth 登入頁，按網址列旁的外掛圖示，選**在此網站上一律允許**。之後同上，看到「驗證碼已填入」再按登入。

「允許未簽署的延伸功能」在 Safari 每次結束後會自動取消，重開 Safari 後要再勾一次。要免掉這一步，App 得用付費的 Apple 開發者帳號簽章。

想自己建的話，用 Xcode 打開 `safari/NTHU OAuth Captcha/NTHU OAuth Captcha.xcodeproj`，按 **Product → Run**，代替第 1、2 步，不需要 Apple 開發者帳號。

### 發佈新版

推一個 `v` 開頭的標籤（例如 `git tag v1.0.0 && git push origin v1.0.0`），GitHub Actions 會建出同時支援 Apple 晶片和 Intel 的 App，附到同名的 Release。

若某一張圖填錯，按驗證碼旁邊的重新整理圖示，外掛會換一張再辨識。

只作用於 `https://oauth.ccxp.nthu.edu.tw/v1.1/authorize.php`。校務系統首頁 `www.ccxp.nthu.edu.tw` 的 6 位驗證碼不在範圍內。
