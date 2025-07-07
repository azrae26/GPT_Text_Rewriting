# GPT文本重寫Chrome擴充功能

## 基本信息
- **項目類型**: Chrome擴充功能（Chrome Extension）
- **主要功能**: AI驅動的文本重寫、翻譯、生成工具
- **技術棧**: Vanilla JavaScript, Chrome Extensions API, HTML/CSS
- **架構模式**: 傳統全域變數模式（window.xxx），非ES6模組

## 核心功能模組
1. **文本重寫**: 使用多種AI模型進行文本改寫
2. **翻譯功能**: 支援多語言翻譯，集成Google翻譯
3. **多重生成**: 支援反思、優化的多階段文本生成
4. **文本高亮**: 關鍵字高亮顯示功能
5. **自動替換**: 文本自動替換管理
6. **股票功能**: 股票相關文本處理和爬蟲功能
7. **設定同步**: Google Drive雲端設定同步

## 文件結構
- **popup.js**: 主要入口點，UI事件處理（1744行）
- **settings.js**: 全域設定管理
- **content.js**: 內容腳本，與網頁互動
- **background.js**: 背景腳本
- 模組化組織：translate/, text_replace/, settings/, SettingsIO/等