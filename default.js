const DefaultSettings = {
  // 模型相關預設值
  model: 'gemini-1.5-flash',
  fullRewriteModel: 'gemini-1.5-flash',
  shortRewriteModel: 'gemini-1.5-flash',
  autoRewriteModel: 'gemini-1.5-flash',
  translateModel: 'gemini-1.5-flash',

  // 勾選框預設狀態
  confirmModel: false,      // 確認模型：預設不勾選
  confirmContent: false,    // 確認內容：預設不勾選
  removeHash: true,        // 刪除##：預設勾選
  removeStar: true,        // 刪除**：預設勾選

  // 全文改寫預設設定
  fullRewriteInstruction: 
`按以下要求替換文字：
若為"前二季"改為"2024年前二季"。
若為"前三季"改為"2024年前三季"。
若為"前四季"改為"2024年前四季"。
若為"第一季"改為"2024年第一季"。
若為"第二季"改為"2024年第二季"。
若為"第三季"改為"2024年第三季"。
若為"第四季"改為"2024年第四季"。
若為"第1季"改為"2024年第一季"。
若為"第2季"改為"2024年第二季"。
若為"第3季"改為"2024年第三季"。
若為"第4季"改為"2024年第四季"。
若為"Q1"改為"2024年第一季"。
若為"Q2"改為"2024年第二季"。
若為"Q3"改為"2024年第三季"。
若為"Q4"改為"2024年第四季"。
若為月份，改為例如2024年2月，以此類推。
若為"上半年"改為"2024年上半年"，以此類推。
若為"下半年"改為"2024年下半年"，以此類推。
若為"全年"改為"2024年全年"。
若為"年底"改為"2024年年底"。
若為去年改為2023年。
若為今年改為2024年。
若為明年改為2025年。
若為後年改為2026年。
若為今明年改為2024.2025年。
若為明後年改為2025.2026年。

不要替換的文字：
上一季、上季。

直接輸出結果，不要有其他廢話，只需改寫，也不要自己新增符號。避免輸出『改寫後：』。
即使標題與內文一樣，也不要省略標題。
文末若有2個句點改為1個。`,

  // 10字內改寫預設設定
  shortRewriteInstruction:
`按以下要求替換文字：
1.若為"前一季"改為"2024年前一季"，以此類推。
1.若為"第一季"改為"2024年第一季"，以此類推。
1.若為"第1季"改為"2024年第一季"，以此類推。
2.若為"Q1"改為"2024年第一季"，以此類推。
3.若為月份，改為例如2024年2月，以此類推。
4.若為"上半年"改為"2024年上半年"，以此類推。
4.若為"下半年"改為"2024年下半年"，以此類推。
5.若為"全年"改為"2024年全年"。
5.若為"年底"改為"2024年年底"。
6.若為去年改為2023年。
7.若為今年改為2024年。
8.若為明年改為2025年。
9.若為後年改為2026年。
10.若為今明年改為2024.2025年。
11.若為明後年改為2025.2026年。
12.直接輸出結果，不要有其他廢話，只需改寫，也不要換行，也不要自己新增符號。避免輸出『改寫後：』。`,

  // 雙擊改寫預設設定
  autoRewritePatterns: 
`/(去|今|明|後)年\s*第([一二三四]|[1-4])季/
/(去|今|明|後)年\s*Q[1-4]/
/Q\s*[1-4]/

/(?:前|第)?\s*[一二三四1-4]\s*季/

/(去|今|明|後)年\s*(十[一二]?|[一二三四五六七八九])月/
/(去|今|明|後)年\s*(1[0-2]|[1-9])\s*月/

/(十[一二]?|[一二三四五六七八九])月/
/(1[0-2]|[1-9])\s*月/
/(1[0-2]|[1-9])\s*M|M\s*(1[0-2]|[1-9])/

/今\s*明\s*年/
/今、\s*明\s*年/
/今、\s*明\s*兩\s*年/
/明\s*後\s*年/
/明、\s*後\s*年/
/明、\s*後\s*兩\s*年/

/[上下]\s*半\s*年/
/(全|去|今|明|後)\s*年/
/年\s*底/`,

  // 翻譯預設設定
  translateInstruction: 
`Role and Goal: '翻譯專家'，會將收到的內容翻譯成繁體中文。

要求：若已是繁體中文，則不需任何處理直接輸出原文。
要求：有TOEFL托福滿分120的能力，能準確理解原文的意思並翻譯。
要求：句子更通順容易理解。

要求：確保原文內容沒有遺失，例如標題、或Speaker...等。
要求：某些技術性名詞或專有名詞，翻成繁體中文不好懂的，請維持英文。
要求：不要有任何簡體中文，若有請翻譯成繁體中文。
要求：如果開頭為人名，請不要在前面加『講者』。

不用翻譯的詞：
token。
Cooler Master。
對於年與(季|上下半年|月)的表達法，如4Q23，23Q4、24Q1、1Q24、2H24、25M8、11M25，這類不需翻譯。。

翻譯要求：
Speaker翻譯為講者。
盈利翻譯為盈餘。
對於high teens、mid-twenties、low-single digits這類用詞，請翻譯為高十位數、中二十位數、低個位數。
million(m)翻謴為100萬。
billion(b)翻譯10億。
yoy翻譯為年增或年減。
flat yoy翻譯為年持平。
qoq正數翻譯為季增。
qoq負數翻譯為季增。
flat qoq翻譯為季持平。
mom正數翻譯為月增。
mom負數翻譯為月減。
flat mom翻譯為月持平。
revenue翻譯為營收。
sales翻譯為營收。
CPU sockets翻譯為CPU插槽。
Fabless翻譯為IC設計公司。

公司名中英文對照：
EMC=台光電
ITEQ=聯茂
TUC=台燿
Yageo=國巨
GCE=金像電
Parade=譜瑞-KY
Auras=雙鴻

# 輸出格式要求
- 僅輸出譯文結果。
- 使用全形『：』作為冒號。
- 每個段落之間保留空行。
- 不要使用markdown。
- 不要標示標題及粗體。`
};

window.DefaultSettings = DefaultSettings;
