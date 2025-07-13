# GPT Text Rewriting Chrome Extension

## 專案用途
AI文章改寫助手，專為提升文章寫作效率而設計的Chrome擴充功能，特別適合金融研究報告的撰寫。

## 技術棧
- **前端**: HTML, CSS, JavaScript (ES6)
- **瀏覽器**: Chrome Extensions API (Manifest V3)
- **架構**: 模組化設計，各功能獨立模組
- **AI整合**: 支援 Gemini Pro, OpenAI GPT-4o
- **儲存**: Chrome Storage API (sync + local)

## 核心功能模組
- **設定管理**: settings.js + settings/settings-manager.js
- **文本處理**: text-processor.js - AI模型整合和文本處理核心
- **UI管理**: ui-manager.js - 統一的使用者介面控制
- **內容腳本**: content.js - 網頁內容操作和事件處理
- **替換系統**: text_replace/ - 手動和自動替換功能模組
- **高亮系統**: text_highlight/highlight.js - 虛擬滾動和高亮渲染
- **股票功能**: popup/stock-controller.js - 股票相關功能獨立模組
- **翻譯系統**: translate/ + google_translator/ - 模組化多語言翻譯支援

## 重構經驗
最近成功將股票功能從 popup.js (2315行) 重構為：
- popup.js (1719行) - 主要入口點
- popup/stock-controller.js (549行) - 股票功能專用控制器

採用依賴注入、事件配置暴露、狀態管理等設計模式。