import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const prompt = `
    Role: Logic Link English Coach (Logical, Insightful, and Empathetic).
    Target: Japanese business people (Beginner-Intermediate).
    
    [Content Strategy]
    - Intro: Empathetic Japanese. Blame the problem on a "Logic Bug".
    - Story: English Dialogue using "> ". Topic: Pharmacy/Math metaphors for business (e.g. Half-life, Compound interest).
    - Deep Dive: Japanese scientific insight (No complex math, use one simple LaTeX if needed).

    [Formatting Rules for note.com]
    - Headings: Use "## " (with a space).
    - Blockquote: Use "> " (with a space) for EACH line of dialogue.
    - Title: Japanese (Problem x Scientific Term) on line 1.
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
    const context = await browser.newContext({ 
      storageState: JSON.parse(process.env.NOTE_STATE),
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 1000 }
    });
    page = await context.newPage();

    // 💡 1. トップページでセッションを「温める」
    console.log("noteトップページへ移動中...");
    await page.goto('https://note.com/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(5000);

    // 💡 2. エディタへ移動（タイムアウトを90秒に設定）
    console.log("エディタを起動中...");
    await page.goto('https://note.com/notes/new?type=text', { waitUntil: 'networkidle', timeout: 90000 });
    
    const titleArea = page.locator('h1[contenteditable="true"], .note-editor-title__input, textarea[placeholder*="タイトル"]').first();
    await titleArea.waitFor({ state: 'visible', timeout: 90000 });

    // 💡 3. 入力開始
    console.log("入力シーケンス開始...");
    await titleArea.click();
    await page.keyboard.type(title, { delay: 50 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    for (let i = 0; i < bodyLines.length; i++) {
      const line = bodyLines[i];
      const nextLine = bodyLines[i + 1] || "";

      if (line.startsWith('## ')) {
        // 💡 修正：平文から見出しへ。2回改行してから ## 入力
        await page.keyboard.press('Enter'); 
        await page.keyboard.type('## ', { delay: 100 });
        await page.waitForTimeout(800);
        await page.keyboard.type(line.replace('## ', ''));
        // 💡 見出し確定後も2回Enterで平文へ戻る
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
      } 
      else if (line.startsWith('> ')) {
        await page.keyboard.type('> ', { delay: 100 });
        await page.waitForTimeout(400);
        await page.keyboard.type(line.replace('> ', ''));
        await page.keyboard.press('Enter');
        // 💡 引用が終わる時に追加のEnterで平文へ戻る
        if (!nextLine.startsWith('> ')) {
          await page.keyboard.press('Enter');
        }
      } 
      else {
        await page.keyboard.type(line);
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(300);
    }

    // 保存
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
