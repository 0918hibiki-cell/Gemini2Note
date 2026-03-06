import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const prompt = `
    Role: Logic Link English Coach.
    Target: Japanese business people.
    
    [Formatting Rules for Script]
    - Use "[H]" at the start of a line for Middle Headings.
    - Use "[B]" at the start of a line for Bold text.
    - Title should be on the first line (no tags).
    
    [Structure]
    Title (Japanese)
    [H] はじめに (Japanese Intro)
    [H] Today's Story (English Dialogue)
    [H] 最重要フレーズ Top 3
    (List phrases here)
    [H] 読解クイズ
    
    --- PAID LINE ---
    [有料エリア：ここから下は100円]

    [H] 全文和訳
    [H] 重要語彙フルリスト
    [H] ロジカル・ディープダイブ
    [H] クイズの解説
  `;
  
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const lines = text.split('\n').filter(l => l.trim() !== "");
  const title = lines[0].replace(/[*#]/g, '').trim();
  const bodyLines = lines.slice(1);
  
  console.log(`🤖 Gemini生成成功: ${title}`);
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

    // タイトル入力
    await titleArea.click();
    await page.keyboard.type(title);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    console.log("本文を装飾しながら入力中...");
    for (const line of bodyLines) {
      if (line.startsWith('[H]')) {
        // 見出し(H2)のショートカット: Ctrl + Alt + 2
        await page.keyboard.down('Control');
        await page.keyboard.down('Alt');
        await page.keyboard.press('2');
        await page.keyboard.up('Alt');
        await page.keyboard.up('Control');
        await page.keyboard.type(line.replace('[H]', '').trim());
      } else if (line.startsWith('[B]')) {
        // 太字のショートカット: Ctrl + B
        await page.keyboard.down('Control');
        await page.keyboard.press('b');
        await page.keyboard.up('Control');
        await page.keyboard.type(line.replace('[B]', '').trim());
        await page.keyboard.down('Control');
        await page.keyboard.press('b'); // 解除
        await page.keyboard.up('Control');
      } else {
        await page.keyboard.type(line);
      }
      await page.keyboard.press('Enter');
    }

    // 保存処理
    console.log("保存中...");
    await page.keyboard.down('Control');
    await page.keyboard.press('s');
    await page.keyboard.up('Control');
    await page.waitForTimeout(10000);
    console.log(`🎉 完了！装飾された下書きを確認してください: ${title}`);

  } catch (e) {
    console.error("❌ エラー:", e.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
