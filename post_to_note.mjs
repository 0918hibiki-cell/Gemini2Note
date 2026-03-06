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
    - NO separators like "---". Use empty lines.
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

    // 💡 ロード安定化：トップページ経由でログイン状態を確定
    console.log("noteトップページでセッションを確認中...");
    await page.goto('https://note.com/', { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(5000);

    console.log("エディタへ移動中...");
    await page.goto('https://note.com/notes/new?type=text', { waitUntil: 'networkidle', timeout: 120000 });
    
    const titleArea = page.locator('h1[contenteditable="true"], .note-editor-title__input, textarea[placeholder*="タイトル"]').first();
    // 💡 修正：タイムアウトを90秒に延長し、確実に表示を待つ
    await titleArea.waitFor({ state: 'visible', timeout: 90000 });

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
        // 💡 稲福さんの知見：平文から見出しへは2回改行が必要
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);
        await page.keyboard.type('## ', { delay: 100 });
        await page.waitForTimeout(1000); // モード変換待ち
        await page.keyboard.type(line.replace('## ', ''));
        // 💡 見出し確定後の改行
        await page.keyboard.press('Enter');
      } 
      else if (line.startsWith('> ')) {
        // 引用開始
        inQuote = true;
        await page.keyboard.type('> ', { delay: 100 });
        await page.waitForTimeout(800);
        await page.keyboard.type(line.replace('> ', ''));
        await page.keyboard.press('Enter');
      } 
      else {
        await page.keyboard.type(line);
        await page.keyboard.press('Enter');
        
        // 💡 稲福さんの知見：引用から平文へ戻るには2回Enterが必要
        if (inQuote && (nextLine.startsWith('## ') || nextLine === "")) {
          await page.keyboard.press('Enter');
          inQuote = false;
        }
      }
      await page.waitForTimeout(400);
    }

    // 保存
    console.log("保存中...");
    await page.keyboard.down('Control');
    await page.keyboard.press('s');
    await page.keyboard.up('Control');
    await page.waitForTimeout(10000);
    console.log(`🎉 成功: ${title}`);

  } catch (e) {
    console.error("❌ エラー:", e.message);
    if (page) await page.screenshot({ path: 'error.png', fullPage: true });
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
