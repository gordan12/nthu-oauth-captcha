# 清大 OAuth 驗證碼自動填入

在清大校務資訊系統 OAuth 登入頁自動辨識並填入 4 位驗證碼。適用於 eeclass 等會導向 `oauth.ccxp.nthu.edu.tw` 的登入。

帳號和密碼仍由瀏覽器自己的密碼管理填入。這個外掛只填驗證碼，不會讀取或送出帳號密碼，也不會代按登入。

只作用於：

`https://oauth.ccxp.nthu.edu.tw/v1.1/authorize.php`

校務系統首頁 `www.ccxp.nthu.edu.tw` 的 6 位驗證碼不在範圍內。

## 安裝

1. 按 **Code → Download ZIP**，解壓縮。
2. 打開 `edge://extensions`（Chrome 則是 `chrome://extensions`）。
3. 打開**開發人員模式**。
4. 按**載入未封裝**，選解壓後裡面有 `manifest.json` 的那個資料夾。
5. 打開清大 OAuth 登入頁。驗證碼下方出現「驗證碼已填入」後，確認帳號密碼，再按登入。

若某一張圖填錯，按驗證碼旁邊的重新整理圖示，外掛會換一張再辨識。

## 授權

辨識模型與打包的 TensorFlow.js 來自 [NTHU-OAuth-Decaptcha](https://github.com/justin0u0/NTHU-OAuth-Decaptcha)（Copyright 2022 Justin Chen, Bronwin Chen），採用 Apache License 2.0。授權全文在 `APACHE-2.0.txt`。
