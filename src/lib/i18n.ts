/**
 * Lightweight i18n: two locales, one dictionary, cookie-selected.
 * Server components call `await getT()`; client components receive `locale`
 * and call `tr(locale)`. Keys are English source strings, so missing
 * translations fall back to readable English.
 */
export type Locale = "en" | "zh-TW";
export const LOCALES: Locale[] = ["en", "zh-TW"];
export const LOCALE_COOKIE = "bd_locale";

const zh: Record<string, string> = {
  // nav / shell
  "Overview": "總覽", "Projects": "專案", "Discover": "探索", "Leads": "潛在客戶", "Campaigns": "推廣活動", "Messages": "訊息",
  "Analytics": "分析", "Agents": "代理", "Settings": "設定", "Mode": "模式",
  "agents available": "個代理可用", "agents running": "個代理執行中",
  "new candidates — existing leads excluded": "個新候選 — 已存在的潛客會自動排除",
  "positive outcomes": "正向結果", "contacted leads": "已聯繫潛客", "qualified leads": "合格潛客",
  "Simulated delivery · no external APIs": "模擬寄送・不呼叫外部 API", "Discover → Research → Qualify → Engage → Learn": "探索 → 研究 → 評估 → 接觸 → 學習",
  // overview
  "Project": "專案", "Leads Found": "找到的潛客", "Qualified": "已評估合格", "Reviewed": "已審核", "Outreach Approved": "已核准觸及",
  "Replies": "回覆", "Positive Response Rate": "正向回應率", "positive": "正向", "contacted": "已聯繫", "Pipeline Funnel": "管線漏斗",
  "Top Qualified Leads": "最高分潛客", "View all": "查看全部", "HIGH FIT": "高度契合", "MEDIUM FIT": "中度契合", "LOW FIT": "低度契合", "REJECT": "排除",
  // orchestrator
  "Agent Orchestrator": "代理編排器", "Live — jobs running": "即時 — 任務執行中", "Idle — animations run only while jobs are active": "閒置 — 只有任務執行時才會有動畫",
  "Start Demo": "開始示範", "Run demo again": "再跑一次示範", "Running…": "執行中…", "Demo": "示範",
  "Discovery Agent": "探索代理", "Research Agent": "研究代理", "Qualification Agent": "評估代理", "Outreach Agent": "觸及代理", "Reply Agent": "回覆代理", "Learning Agent": "學習代理",
  "DISCOVER": "探索", "RESEARCH": "研究", "QUALIFY": "評估", "ENGAGE": "接觸", "REPLY": "回覆", "LEARN": "學習",
  "Input": "輸入", "Completed": "完成", "Failed": "失敗", "Remaining": "剩餘", "Current": "目前", "Last": "最近", "Elapsed": "耗時",
  "Learn ↺ Discover — outcomes feed the next targeting round": "學習 ↺ 探索 — 結果回饋到下一輪目標選擇",
  "Repository must be a GitHub repository URL (https://github.com/owner/repo) — or leave it empty": "GitHub 儲存庫必須是 GitHub 網址（https://github.com/owner/repo），或留空",
  "Activity stream": "活動紀錄", "Demo playback": "示範播放",
  "Recorded demo playing": "錄製示範播放中",
  "Recorded replay — isolated from dashboard data": "錄製重播 — 獨立於儀表板資料",
  "Recovered": "重試恢復", "Attempts": "嘗試次數",
  "Research completed": "研究完成", "leads researched": "個潛客研究完成", "source failure recovered on retry": "次來源失敗經重試恢復",
  "Press Start Demo to watch Discover → Research → Qualify → Engage → Reply → Learn run end to end — including one injected source failure with retry.":
    "按下「開始示範」，完整看一遍 探索 → 研究 → 評估 → 接觸 → 回覆 → 學習，包含一次刻意注入的來源失敗與重試。",
  "It is a deterministic browser-side replay of one real agent run (recorded with the mock provider): every visitor plays their own copy, the approval pause waits for YOUR click, and nothing external is ever sent.":
    "這是一段確定性的瀏覽器端重播，內容來自一次真實代理執行的錄製（使用 mock provider）：每位訪客各自播放自己的副本，核准暫停會等「你」親手按下核准，全程不會寄出任何真實訊息。",
  "RUNNING": "執行中", "READY": "就緒", "QUEUED": "排隊中", "IDLE": "閒置", "COMPLETED": "已完成", "FAILED": "失敗", "RETRYING": "重試中",
  // leads
  "Lead": "潛客", "Score": "分數", "Intent": "意圖", "Status": "狀態", "Source": "來源", "Last Research": "最近研究", "of": "／",
  "all": "全部", "qualified": "合格", "reviewing": "審核中", "approved": "已核准", "rejected": "已排除", "All projects": "全部專案",
  "High": "高", "Medium": "中", "Low": "低", "withheld": "暫不評分", "Withheld": "暫不評分", "individual": "個人",
  "overview": "總覽", "research": "研究", "evidence": "證據", "messages": "訊息", "activity": "活動",
  "Fit Score": "契合分數", "Why this lead?": "為什麼是這個潛客？", "RISKS": "風險", "View Evidence": "查看證據", "Generate Outreach": "產生觸及信", "Open Messages": "開啟訊息", "Reject": "排除",
  "Research": "研究", "Re-research": "重新研究", "Re-qualify": "重新評估", "Ignore": "忽略",
  "Insufficient evidence — score withheld": "證據不足 — 暫不評分", "Not qualified yet.": "尚未評估。", "Not researched yet.": "尚未研究。",
  "Product Fit": "產品契合", "Problem Evidence": "問題證據", "Intent Signal": "意圖訊號", "Role Relevance": "角色相關", "Data Confidence": "資料信心",
  "Research synthesis": "研究摘要", "Narrative is assembled from structured evidence only — see the Evidence tab for sources.": "摘要僅由結構化證據組成 — 來源請見「證據」分頁。",
  "Contradicting signals": "矛盾訊號", "Evidence": "證據", "supports": "支持", "confidence": "信心", "observed": "觀察於", "source": "來源", "Audit trail": "稽核紀錄",
  // discover
  "Controlled sources only": "僅使用受控來源", "demo seed pool": "示範種子池", "Run full pipeline": "執行完整管線",
  "Sources": "來源", "total": "合計", "Nothing discovered yet.": "尚未探索任何潛客。", "Discovering for": "探索條件",
  "Candidates awaiting research / review": "等待研究／審核的候選", "No pending candidates. Run Discover to find more, or see": "沒有待處理候選。按「探索」找更多，或前往",
  "for qualified ones.": "查看合格潛客。", "Why discovered?": "為何被探索？", "Recent discovery runs": "最近的探索執行",
  "This project has no ICP yet.": "這個專案還沒有 ICP。", "Define or generate one": "先定義或生成一份", "before discovery.": "再進行探索。",
  "Web Search": "網路搜尋", "Developer Sources": "開發者來源", "Company Pages": "公司頁面", "Imported Leads": "匯入名單", "Manual": "手動", "Demo pool": "示範池",
  "edit in ICP": "到 ICP 編輯", "Search queries are built from the ICP: industries + positive signals + technologies.": "搜尋 query 由 ICP 組成：產業＋正向訊號＋相關技術。",
  "View qualified leads": "查看合格潛客", "View all leads": "查看全部潛客",
  "new signals from": "個新訊號，來自", "documents": "份文件", "already known": "個已存在", "below confidence threshold": "個低於信心門檻", "self-published pages skipped": "頁自家內容已略過",
  "ICP Suggest": "ICP 建議", "a source failed": "有來源失敗",
  "Retry send": "重試寄送", "Delivery failed — fix the cause (recipient, provider) and retry. Nothing was sent.": "寄送失敗 — 排除原因（收件人、供應商）後重試。沒有任何信被寄出。",
  "candidates are discovered but not researched yet — nothing can be qualified until they are.": "位候選已探索但尚未研究 — 研究完成前不會有合格潛客。",
  "Research them on Discover, or run the full pipeline": "到探索頁研究，或執行完整管線", "Rejected": "已排除", "added": "已新增",
  "ICP": "理想客戶 ICP", "next step": "下一步",
  "Run full pipeline unlocks after steps 1–2 — click the highlighted step to complete it.": "「執行完整管線」要先完成步驟 1–2 才會啟用 — 點亮起的步驟前往完成。",
  "Import leads from CSV": "從 CSV 匯入潛客", "Headers": "欄位", "existing leads are skipped": "已存在的潛客會自動略過",
  "Import CSV": "匯入 CSV", "leads imported from CSV": "位潛客已從 CSV 匯入",
  "comma-separate for multiple recipients": "多位收件人以逗號分隔",
  // agents run table (data-string labels)
  "score withheld": "評分保留（證據不足）", "evidence records": "筆證據", "signals": "個訊號", "existing": "已存在", "below threshold": "低於門檻",
  "discovery": "探索", "qualification": "評估", "outreach": "觸及", "reply": "回覆", "learning": "學習", "product understanding": "產品理解", "icp suggest": "ICP 建議",
  // projects
  "Every BD campaign belongs to a project.": "每個 BD 活動都隸屬於一個專案。", "New project": "新增專案", "leads": "位潛客",
  "No description yet.": "尚無描述。", "Product understood": "已理解產品", "Understanding pending": "待理解產品", "ICP pending": "待建立 ICP",
  "Describe what you are promoting. The Product Understanding Agent takes it from here.": "描述你要推廣的產品，接下來交給產品理解代理。",
  "Product name": "產品名稱", "Category": "類別", "Description": "描述", "Website": "網站", "GitHub repository": "GitHub 儲存庫", "Create project": "建立專案", "optional": "選填",
  "product": "產品", "understanding": "理解", "Activity": "活動", "Entities": "追蹤實體", "Product profile": "產品資料", "Save": "儲存", "Pipeline for this project": "此專案的管線",
  "Product Understanding": "產品理解", "pending": "待處理", "Discovery": "探索", "Open Discover": "前往探索",
  "The platform must understand what is being promoted before it looks for anyone to promote it to.": "平台必須先理解要推廣的是什麼，才會去找該推廣給誰。",
  "Run Product Understanding Agent": "執行產品理解代理", "README": "README", "optional; treated as untrusted data": "選填；視為不可信資料",
  "optional — auto-fetched from the GitHub repository when empty; treated as untrusted data": "選填 — 留空且專案有 GitHub 網址時會自動抓取；視為不可信資料",
  "Tavily search only — no fallback source": "目前僅使用 Tavily 搜尋，無備援來源", "Manual notes": "手動備註",
  "Anything the description does not say": "描述裡沒提到的事", "Re-run": "重新執行", "Understand product": "理解產品", "Structured output": "結構化輸出",
  "Problems solved": "解決的問題", "Value propositions": "價值主張", "Target roles": "目標角色", "Target company types": "目標公司類型", "Suggest ICP from this": "由此建議 ICP",
  "Not run yet. The agent returns structured JSON only — the UI never shows raw model text.": "尚未執行。代理只回傳結構化 JSON— 介面不會顯示原始模型文字。",
  "Step 2 — define who to look for": "步驟 2 — 定義要找誰",
  "The product is understood. Let the ICP Suggestion Agent derive buyer industries, roles and observable buying signals from it — every field can be edited before you save.": "產品已理解。讓 ICP 建議代理從理解結果推導買方產業、目標角色與可觀察的購買訊號 — 每個欄位在儲存前都能修改。",
  "Suggest ICP from product understanding": "依產品理解建議 ICP",
  "Or expand the form below, fill it in by hand and save it as a manual ICP.": "或展開下方表單手動填寫，儲存為手動 ICP。",
  "Run Product Understanding first (step 1) — the suggestion is derived from it. You can still fill in the form by hand.": "請先執行產品理解（步驟 1）— ICP 建議由它推導。你也可以手動填寫表單。",
  "Go to Product Understanding": "前往產品理解", "Fill in manually": "手動填寫",
  "Ideal Customer Profile": "理想客戶輪廓", "AI suggest": "AI 建議", "Run Product Understanding first": "請先執行產品理解", "Target entity": "目標實體",
  "Company": "公司", "Individual": "個人", "Both": "兩者", "Company size min": "公司規模下限", "Company size max": "公司規模上限",
  "Industries": "產業", "Regions": "地區", "Relevant technology": "相關技術", "Business problems": "業務問題", "Positive signals": "正向訊號", "Exclusion criteria": "排除條件",
  "one per line": "一行一個", "observable facts: hiring, launches, posts": "可觀察的事實：招募、發布、貼文", "negative signals": "負向訊號",
  "Save as manual ICP": "儲存為手動 ICP", "No ICP yet": "尚無 ICP", "Preview": "預覽", "Entity": "實體", "Industry": "產業", "Size": "規模", "Roles": "角色", "Negative signals": "負向訊號",
  "Suggest with AI or fill in manually.": "用 AI 建議或手動填寫。", "Agent runs": "代理執行", "No runs yet.": "尚無執行紀錄。",
  // messages
  "Generate outreach": "產生觸及信", "Grounded on": "依據", "positive evidence items": "條正向證據", "Tone": "語氣", "Professional": "專業", "Friendly": "友善", "Concise": "簡潔",
  "Generate draft": "產生草稿", "No drafts yet — generate one above.": "尚無草稿 — 請在上方產生。", "Nothing here yet.": "這裡還沒有內容。",
  "Edit": "編輯", "Regenerate": "重新產生", "Approve & Send": "核准並寄出", "Simulated delivery in DEMO mode": "示範模式為模擬寄送",
  "Subject": "主旨", "Body": "內文", "claims must stay within the cited evidence": "內容必須限於引用的證據", "Cancel": "取消", "Save as v": "儲存為 v",
  "Evidence used": "使用的證據", "Delivered via": "寄送方式", "simulated": "模擬", "thread": "對話串", "Awaiting classification…": "等待分類…",
  "Simulate a reply": "模擬回信", "Inject a reply (testing)": "注入回信（測試）", "runs the real Reply Agent": "會執行真正的回覆代理",
  "treated as untrusted data": "視為不可信資料", "Receive reply": "接收回信", "Record outcome": "記錄結果", "manual · overrides are additional rows": "手動・覆寫會新增一列而非取代",
  "Check inbox now": "立即檢查收件匣", "Outcome": "結果", "Notes": "備註", "Record": "記錄", "Outcome recorded": "已記錄結果", "by": "由", "needs human": "需要人工",
  "Recipient (public business address)": "收件人（公開商務信箱）", "DEMO_RECIPIENT_OVERRIDE wins when set": "設定 DEMO_RECIPIENT_OVERRIDE 時以其為準",
  "Human-in-the-loop queue: nothing leaves without approval.": "人工審核佇列：未經核准不會寄出任何訊息。",
  "Drafts awaiting review": "待審核草稿", "Nothing waiting. Generate drafts from a qualified lead.": "沒有待審項目。請從合格潛客產生草稿。",
  "Replies needing a human": "需要人工判斷的回信", "All inbound replies were classified with confidence.": "所有來信都已高信心分類。", "Unmatched inbound": "無法比對的來信", "no lead": "無潛客", "Recent inbound": "最近來信",
  // analytics
  "Every number is recomputed from rows — nothing is stored as a metric.": "每個數字都由資料列即時計算 — 不儲存任何指標。",
  "Discovered": "已探索", "Researched": "已研究", "Approved": "已核准", "Contacted": "已聯繫", "Reply Rate": "回覆率", "replies": "則回覆", "Qualified → Positive": "合格 → 正向",
  "Pipeline funnel": "管線漏斗", "count per stage": "各階段數量", "Reply breakdown": "回覆分類", "latest classification per contacted lead": "每位已聯繫潛客的最新分類", "No replies yet.": "尚無回覆。",
  "Positive response by score band": "各分數區間的正向回應率", "does the score predict outcomes?": "分數能否預測結果？", "Record outcomes to see this.": "記錄結果後才會顯示。",
  "Qualification distribution": "評估分布", "withheld (insufficient evidence)": "筆暫不評分（證據不足）", "Evidence category performance": "證據類別表現",
  "positive rate among leads carrying the category": "具備該類證據的潛客正向率", "Replies over time": "回覆趨勢", "per week (week starting)": "每週（週起始日）",
  "Lead source performance": "來源表現", "Qualified rate": "合格率", "Positive": "正向", "Agent operations": "代理營運", "latency p50 · failure rate · tokens": "延遲 p50・失敗率・token",
  "Agent": "代理", "Runs": "執行", "Failure rate": "失敗率", "p50 latency": "p50 延遲", "Tokens": "Token",
  // agents page
  "Every run is a row: explicit state, latency, tokens, retries, errors. No chain-of-thought stored.": "每次執行都是一列：明確狀態、延遲、token、重試、錯誤。不儲存思維鏈。",
  "Run": "執行", "Time": "時間", "Latency": "延遲", "Retries": "重試", "Output / Error": "輸出／錯誤",
  "Search leads…": "搜尋潛客…", "Clear": "清除", "No leads match.": "沒有符合的潛客。",
  // settings
  "Runtime status — read-only. Values come from environment variables; keys never reach the browser.": "執行狀態 — 唯讀。值來自環境變數；金鑰不會傳到瀏覽器。",
  "Application mode": "應用模式", "LLM provider": "LLM 供應商", "Delivery": "寄送", "Inbound": "收信", "Database": "資料庫", "Discovery sources": "探索來源", "Pipeline batch": "管線批次", "Sender": "寄件人",
  "Recipient override": "測試收件人（所有外寄轉送到此）", "configured": "已設定", "not set": "未設定", "required in LIVE": "LIVE 必填", "in-memory (resets on restart)": "記憶體（重啟即清空）",
  "Interface language": "介面語言", "Fixture dataset": "示範資料集", "leads_n": "位潛客", "evidence_n": "條證據", "Regenerate with": "重新產生：",
  "How to switch to LIVE": "如何切換到 LIVE", "Set APP_MODE=live in .env.local plus the keys marked required, restart the dev server. Every Approve & Send then goes to DEMO_RECIPIENT_OVERRIDE.": "在 .env.local 設 APP_MODE=live 與標示必填的金鑰後重啟 dev server。之後每次「核准並寄出」都會寄到 DEMO_RECIPIENT_OVERRIDE。",
  // campaigns
  "One campaign per project: the outreach funnel, what is waiting on you, and the latest replies.": "每個專案一個活動：觸及漏斗、待你處理的事項、以及最新回覆。",
  "Awaiting review": "待審核", "Needs a human": "需要人工", "Open project": "開啟專案", "Latest reply": "最新回覆", "No campaign activity yet.": "尚無活動紀錄。",
  // manual add-lead (discover)
  "Add a lead manually": "手動新增潛客",
  "e.g. a company that messaged you on LinkedIn — Research will fetch its real website": "例如在 LinkedIn 私訊你的公司 — 研究代理會抓取它的真實網站",
  "Company / person": "公司／個人",
  "Why?": "原因",
  "Asked about WareTwin on LinkedIn": "在 LinkedIn 詢問 WareTwin",
  "Add lead": "新增潛客",
  // enum values (lead status · outcomes · sources · supports)
  "DISCOVERED": "已探索", "RESEARCHING": "研究中", "RESEARCHED": "已研究", "QUALIFIED": "已合格", "REJECTED": "已拒絕",
  "REVIEW": "待審核", "DRAFTED": "已擬稿", "APPROVED": "已核准", "CONTACTED": "已聯繫", "REPLIED": "已回覆", "OUTCOME RECORDED": "結果已記錄",
  "positive_reply": "正面回覆", "negative_reply": "負面回覆", "interested": "有興趣", "meeting_requested": "要求會議",
  "not_relevant": "不相關", "auto_reply": "自動回覆", "unclassified": "未分類", "no_response": "無回應",
  "search": "網路搜尋", "github": "GitHub", "company_page": "公司頁面", "csv": "CSV 匯入", "manual": "手動", "fixture": "示範資料",
  "DRAFT": "草稿", "SENT": "已寄出", "SUPERSEDED": "已被取代",
  "directional": "方向性", "moderate": "中等信心", "strong": "較強證據", "small sample": "小樣本",
  // demo playback approval pause
  "Human approval required": "需要人工核准",
  "The pipeline is paused — nothing is sent until you approve.": "管線已暫停 — 你核准之前不會寄出任何東西。",
  "Approve & continue": "核准並繼續", "View draft": "查看草稿",
  "It pauses at the first draft and waits for you to approve — human-in-the-loop, enforced.": "示範會在第一封草稿處暫停，等你親手核准才繼續 — 人工在迴圈中，是強制的。",
  "product fit": "產品契合", "problem evidence": "問題證據", "intent signal": "意圖訊號", "role relevance": "角色相關", "data confidence": "資料信心",
  // tracked entities (v0.3 §3)
  "Tracked entities": "追蹤實體",
  "Mention Discovery searches for these names, aliases and identifiers": "提及偵測會搜尋這些名稱、別名與識別碼",
  "None yet — the first mention scan derives one from the project name and repository, or add one below.": "尚無 — 第一次掃描提及時會從專案名稱與 Repo 自動推導一個，也可在下方新增。",
  "Aliases": "別名", "Identifiers": "識別碼", "Remove": "移除", "Track a new entity": "追蹤新實體",
  "Canonical name": "正式名稱", "Related topics": "相關主題", "comma separated": "逗號分隔",
  "e.g. GitHub repo path": "例如 GitHub repo 路徑", "Canonical URL": "正式網址", "Track entity": "追蹤實體",
  "company": "公司", "repository": "儲存庫", "person": "個人", "technology": "技術",
  // mention discovery (v0.3 §4B, §25–§28)
  "Prospects": "候選潛客", "Mentions": "提及訊號", "Scan mentions": "掃描提及",
  "High relevance": "高商業相關", "Languages": "語言數", "Converted to leads": "已轉為潛客",
  "Public mentions of your tracked entities": "追蹤實體的公開提及",
  "Tracking": "追蹤中", "derived on first scan": "首次掃描時自動推導", "edit": "編輯",
  "No signals yet — press Scan mentions. A mention is never a lead by itself; you decide what converts.": "尚無訊號 — 按「掃描提及」開始。提及本身不會自動變成潛客；由你決定哪些值得轉換。",
  "confirmed": "確認", "likely": "很可能", "review": "待確認", "relevance": "相關性", "converted": "已轉換",
  "high": "高", "medium": "中", "low": "低", "none": "無",
  "sentiment": "情緒", "intent": "意圖", "query": "查詢",
  "Convert to Lead": "轉為潛客", "Organization mentioned": "被提及的組織", "Website (optional)": "網站（選填）",
  "Name the organization this mention is about — the source platform is not the buyer": "請填寫這則提及談論的組織 — 來源平台不是買方",
  "evaluation": "評估中", "adoption": "已採用", "comparison": "比較", "recommendation": "推薦",
  "technical_reference": "技術參考", "criticism": "批評", "question": "提問", "neutral": "中性", "negative": "負面",
  "blog": "部落格", "news": "新聞", "forum": "論壇", "documentation": "文件", "product_page": "產品頁",
  "press_release": "新聞稿", "social": "社群", "website": "網站", "job_posting": "徵才",
  // settings v0.3 sources + live-mode playback note
  "Prospect sources": "候選潛客來源", "Mention sources": "提及訊號來源",
  "manual + CSV always on": "手動與 CSV 匯入永遠可用", "needs SEARCH_API_KEY": "需要 SEARCH_API_KEY",
  "Demo playback is available in DEMO mode only — it creates a fresh simulated project, which stays separate from your real LIVE data. Set APP_MODE=demo in .env.local and restart to run it.": "示範播放只在 DEMO 模式提供 — 它會建立全新的模擬專案，與你 LIVE 模式的真實資料完全分開。在 .env.local 設 APP_MODE=demo 並重啟即可執行。",
  // review v2: positioning, maturity labels, engagement rename
  "Engagement": "觸及總覽",
  "Evidence-first AI Prospecting & Signal Intelligence — traceable evidence, reproducible qualification, visible agent execution, human-controlled outreach.":
    "證據優先的 AI 潛客開發與訊號情報 — 可追溯的證據、可重現的評估、可見的代理執行、人工控制的觸及。",
  "experimental": "實驗性",
  "safe sandbox — every send is rerouted here": "安全沙盒 — 所有寄送轉送到此",
  "REAL OUTREACH ENABLED — sends go to leads": "已啟用真實觸及 — 信件會寄給潛客本人",
  "LIVE data resets on restart — configure Supabase for persistence": "LIVE 資料重啟即清空 — 設定 Supabase 才能持久保存",
  "The first draft demonstrates the human approval gate — the demo pauses until you act. Remaining simulated drafts auto-advance to keep the demo brisk; nothing external is ever sent.":
    "第一封草稿示範人工核准關卡 — 示範會暫停直到你動作；其餘模擬草稿自動推進以維持節奏。全程不會寄出任何真實訊息。",
  "human edited": "人工編輯", "Evidence grounding is not revalidated after manual edits": "人工編輯後不會重新驗證證據關聯",
  // misc
  "Scheduled for a later phase (see docs/ROADMAP.md).": "排定於後續階段（見 docs/ROADMAP.md）。", "Language": "語言",
};

const dict: Record<Locale, Record<string, string>> = { en: {}, "zh-TW": zh };

export function tr(locale: Locale) {
  return (key: string): string => dict[locale][key] ?? key;
}
export type T = ReturnType<typeof tr>;

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "zh-TW";
}
