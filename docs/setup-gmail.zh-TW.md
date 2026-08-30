# Gmail 設定（Live 模式：用你的 Gmail 寄信與收回信）

只要做一次，大約 10 分鐘。全程不需要網域、Resend 或 Cloudflare Tunnel。

## 1. Google Cloud 建 OAuth 用戶端

1. 開 https://console.cloud.google.com/ → 左上專案選單 → **New Project**，名稱隨意（例如 `ai-bd-platform`）。
2. 左側 **APIs & Services → Library** → 搜尋 **Gmail API** → **Enable**。
3. **APIs & Services → OAuth consent screen**
   - User type 選 **External** → Create。
   - App name 填 `AI BD Platform`，支援信箱填你的 Gmail，其餘可留白 → Save。
   - Scopes 頁可直接 Save（程式啟動授權時會自己帶 scope）。
   - **Test users** 頁按 **Add users**，填入你要授權的 Gmail（例如 `you@example.com`）→ Save。
     這一步很重要：App 在「Testing」狀態時，只有列在這裡的帳號能授權。
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type：**Desktop app**
   - 名稱隨意 → Create → 記下 **Client ID** 與 **Client secret**。

## 2. 取得 Refresh Token

在專案資料夾的 `.env.local` 先加：

```
GMAIL_CLIENT_ID=剛剛的 Client ID
GMAIL_CLIENT_SECRET=剛剛的 Client secret
```

然後執行：

```
npm run gmail:auth
```

瀏覽器會跳出 Google 授權畫面（因為 App 是 Testing 狀態，會出現「Google hasn't verified this app」，按 **Continue** 即可）。同意後回到終端機，會印出：

```
GMAIL_USER=you@example.com
GMAIL_REFRESH_TOKEN=1//0g...
```

把這兩行也貼進 `.env.local`。

## 3. 完整的 .env.local（Live + Gmail）

```
APP_MODE=live
LLM_PROVIDER=openai            # 或 anthropic / google
LLM_MODEL=gpt-4o-mini
OPENAI_API_KEY=sk-...

MAIL_PROVIDER=gmail
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_USER=you@example.com
GMAIL_REFRESH_TOKEN=...
GMAIL_POLL_SECONDS=10
DEMO_RECIPIENT_OVERRIDE=you@example.com   # 所有寄出都到這裡（安全）
MAIL_FROM_NAME=Wayne                          # 選填
```

重啟 `npm run dev`。側欄 Mode 變成 **LIVE**，Settings 頁會顯示 `GmailDeliveryAdapter · you@example.com` 與 `GmailPollingSource · every 10s`。

## 4. 錄影時的流程

1. Lead → Messages 分頁 → Generate draft → **Approve & Send**。
2. 你的 Gmail 收到一封信（寄件人也是你自己）。
3. 在 Gmail **直接回覆**那封信（回覆才會留在同一個 thread，系統靠 thread 比對）。
4. 10 秒內平台的 Messages 分頁自動出現回信、Reply Agent 分類、outcome。
   等不及可以按 **Check inbox now**。

## 5. 常見問題

- **`No refresh_token returned`**：之前授權過。到 https://myaccount.google.com/permissions 移除 `AI BD Platform`，再跑一次 `npm run gmail:auth`。
- **`Gmail token refresh failed: 400 invalid_grant`**：Testing 狀態的 App，refresh token 7 天會過期。重跑 `npm run gmail:auth` 換新的；或到 OAuth consent screen 按 **Publish app**（不需要送審，只是脫離 Testing 狀態）就不會過期。
- **回信沒被抓到**：確認是用 Gmail 的「回覆」而不是新信；確認回信不是從 `GMAIL_USER` 自己寄出（poller 會排除 `-from:自己`）。如果你寄給自己又回給自己，請把 `DEMO_RECIPIENT_OVERRIDE` 設成另一個你能登入的信箱，或用第二個 Gmail 回。
- **Reply Agent 判成 needs human**：信心不足時只標記不自動記 outcome，到 Messages 頁用 Record outcome 手動記。

## 6. 部署到 Vercel 測試 Live

- 寄信：把所有 `GMAIL_*`、`APP_MODE=live` 等環境變數填進 Vercel 專案設定即可。
- 收信：Vercel 沒有常駐程序，收件匣輪詢改由「開著的頁面」驅動 — Messages 頁開著時每 5 秒自動檢查一次；沒開頁面時用 Check inbox now。無人值守收信請部署到 Render 或改 Gmail push。
- 資料庫：Vercel 上跑 Live 必須設 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`（記憶體儲存在 serverless 上不可靠）。
- OAuth 同意畫面記得 Publish app，避免 refresh token 七天過期。
- 建議公開 Demo（APP_MODE=demo）與 Live 測試分成兩個 Vercel 專案。

## 7. 之後公司要用

| 情境 | 做法 | 程式要改嗎 |
|---|---|---|
| 公司共用信箱，多人協作 | Workspace 管理員開 `bd@公司網域`，用它跑一次 `gmail:auth`；同事在 Gmail 用「委派」看信；`MAIL_REPLY_TO` 設成 Google Group 讓大家收到副本 | 不用 |
| 每個業務用自己的信箱寄 | Workspace 管理員建 service account 並啟用 domain-wide delegation | 換成 `DomainWideDelegationProvider`（介面已預留） |
| 大量外寄 | 換 `MAIL_PROVIDER=resend` + 自己的網域 | 不用 |
