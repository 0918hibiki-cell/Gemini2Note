import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const prompt = `
    Role: Logic Link English Coach.
    Target: Japanese business people.
    
    [Formatting Rules for Automation]
    - Headings: Use "## " at the start of the line.
    - Bold: Use "**" to surround bold words (e.g., **word**).
    - Lists: Do NOT include numbers at the start of lines for lists (I will add them).
    - Paid Line: Use "--- PAID LINE ---" as a separator.
    - Title: First line should be the title ONLY (no headers).
    
    [Structure]
    (Title in Japanese)
    ## はじめに
    (Intro in Japanese)
    ## Today's Story
    (Dialogue in English)
    ## 最重要フレーズ Top 3
    (Key phrases)
    ## 読解クイズ
    (Questions)
    --- PAID LINE ---
    ## 全文和訳
    ## 重要語彙フルリスト
    ## ロジカル・ディープダイブ
    ## クイズの解説
  `;
  
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const lines = text.split('\n').filter(l => l.trim() !== "");
  const title = lines[0].replace(/[*#]/g, '').trim();
  const bodyLines = lines.slice(1);
  
  return { title, bodyLines };
}

(async () => {
  let browser;
  let page;
  try {
    const { title, bodyLines } = await generateArticle();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ 
      storageState: JSON.parse(process.env.NOTE_STATE),
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 1000 } 
    });
    page = await context.newPage();

    console.log("エディタへ移動中...");
    await page.goto('https://note.com/notes/new?type=text', { waitUntil: 'networkidle' });
    const titleArea = page.locator('h1[contenteditable="true"], .note-editor-title__input, textarea[placeholder*="タイトル"]').first();
    await titleArea.waitFor({ state: 'visible', timeout: 60000 });

    // タイトルの入力
    await titleArea.click();
    await page.keyboard.type(title);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    console.log("Markdownトリガーで本文を入力中...");
    for (const line of bodyLines) {
      // 💡 行頭の「## 」でnoteの見出し機能をトリガーする
      await page.keyboard.type(line, { delay: 10 }); 
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500); // 1行ごとにエディタの反映を待つ
    }

    // 保存
    console.log("保存中...");
    await page.keyboard.down('Control');
    await page.keyboard.press('s');
    await page.keyboard.up('Control');
    await page.waitForTimeout(10000);
    console.log(`🎉 完了しました！: ${title}`);

  } catch (e) {
    console.error("❌ 失敗:", e.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
