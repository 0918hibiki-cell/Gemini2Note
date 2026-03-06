import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const prompt = `
    Role: Logic Link English Coach.
    [Content] Logic-based business English (Pharmacy/Math metaphors).
    
    [Strict Formatting Rules]
    - Title: Japanese (Line 1).
    - Headings: Use "## " for sections.
    - Dialogue: Start ONLY the first line of the conversation with "> ". The rest of the dialogue lines should have NO prefix.
    - Separators: Do NOT use "---". Use empty lines instead.
    - Paid Line: Just text "[有料エリア：ここから下は100円]".
    
    [Structure]
    Title
    ## はじめに
    ## Today's Story (Start with "> " on the first dialogue line)
    ## 最重要フレーズ Top 3
    ... (Paid contents below)
  `;
  
  const result = await model.generateContent(prompt);
  const lines = result.response.text().trim().split('\n').filter(l => l.trim() !== "");
  return { title: lines[0].replace(/[*#]/g, '').trim(), bodyLines: lines.slice(1) };
}

(async () => {
  let browser;
  let page;
  try {
    const { title, bodyLines } = await generateArticle();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: JSON.parse(process.env.NOTE_STATE) });
    page = await context.newPage();

    await page.goto('https://note.com/notes/new?type=text', { waitUntil: 'networkidle', timeout: 60000 });
    const titleArea = page.locator('h1[contenteditable="true"], .note-editor-title__input, textarea[placeholder*="タイトル"]').first();
    await titleArea.waitFor({ state: 'visible' });

    // タイトル入力
    await titleArea.click();
    await page.keyboard.type(title);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    console.log("Standardized Protocolによる入力開始...");
    let inQuote = false;

    for (let i = 0; i < bodyLines.length; i++) {
      const line = bodyLines[i];
      const nextLine = bodyLines[i + 1] || "";

      if (line.startsWith('## ')) {
        // 見出し前：二連改行でブロックを確実に分離
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.keyboard.type('## ', { delay: 100 });
        await page.waitForTimeout(800);
        await page.keyboard.type(line.replace('## ', ''));
        // 見出し後：二連改行で平文へ
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
      } 
      else if (line.startsWith('> ')) {
        // 引用開始のトリガー
        inQuote = true;
        await page.keyboard.type('> ', { delay: 100 });
        await page.waitForTimeout(500);
        await page.keyboard.type(line.replace('> ', ''));
        await page.keyboard.press('Enter');
      } 
      else {
        await page.keyboard.type(line);
        await page.keyboard.press('Enter');
        
        // 💡 引用ブロックの終了判定：次の行が見出しの場合、2回Enterで引用を脱出
        if (inQuote && nextLine.startsWith('## ')) {
          await page.keyboard.press('Enter');
          inQuote = false;
        }
      }
      await page.waitForTimeout(300);
    }

    // 保存
    await page.keyboard.down('Control');
    await page.keyboard.press('s');
    await page.keyboard.up('Control');
    await page.waitForTimeout(10000);
    console.log(`🎉 完璧な装飾で保存完了: ${title}`);

  } catch (e) {
    console.error("❌ 失敗:", e.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
