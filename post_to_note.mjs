import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const prompt = `
    Role: Logic Link English Coach (Logical, insightful, and professional).
    Target: Japanese business people (Beginner-Intermediate level).
    
    [Important Instruction for Content]
    1. Title: MUST be in Japanese. Combine a common business problem with a mathematical/logical/pharmaceutical term.
    2. Format: Do NOT use markdown headers (#). Use **Bold Text** for sections.
    
    [Structure]
    --- FREE AREA ---
    **タイトル** (Japanese Title)
    **はじめに** (Japanese Intro: Hook the reader with a logical/scientific perspective).
    **Today's Story** (English Dialogue: Middle school level + alpha, focus on logical thinking).
    **最重要フレーズ Top 3** (3 key expressions with Japanese meanings).
    **読解クイズ** (3-choice question in Japanese).

    --- PAID LINE (Separator) ---
    [有料エリア：ここから下は100円]

    **全文和訳** (Natural Japanese translation).
    **重要語彙フルリスト** (Up to 7 phrases including the Top 3 with usage tips).
    **ロジカル・ディープダイブ** (Japanese column: Pharmaceutical or Statistical insight. No complex math).
    **クイズの解説** (Logical reasoning for the answer).

    Tone: Sophisticated but encouraging. 
  `;
  
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const lines = text.split('\n').filter(l => l.trim() !== "");
    
    // タイトル（1行目）と本文を分離
    const title = lines[0].replace(/[*#]/g, '').trim();
    const body = lines.slice(1).join('\n\n');
    
    console.log(`🤖 Gemini生成成功: ${title}`);
    return { title, body };
  } catch (e) {
    console.error("Gemini生成エラー:", e.message);
    throw e;
  }
}

(async () => {
  let browser;
  let page;
  try {
    const { title, body } = await generateArticle();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ 
      storageState: JSON.parse(process.env.NOTE_STATE),
      viewport: { width: 1280, height: 1000 } 
    });
    page = await context.newPage();

    console.log("エディタへ直行中...");
    await page.goto('https://note.com/notes/new?type=text', { waitUntil: 'networkidle', timeout: 60000 });
    
    // エディタの完全読み込みを待機
    const titleArea = page.locator('h1[contenteditable="true"], .note-editor-title__input, textarea[placeholder*="タイトル"]').first();
    await titleArea.waitFor({ state: 'visible', timeout: 60000 });
    await page.waitForTimeout(3000);

    console.log("入力シーケンス開始...");
    await titleArea.click();
    await page.keyboard.type(title, { delay: 50 });
    
    await page.keyboard.press('Tab'); 
    await page.waitForTimeout(1000);
    await page.keyboard.type(body, { delay: 10 });
    
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'input_check.png' });

    console.log("保存中...");
    await page.keyboard.down('Control');
    await page.keyboard.press('s');
    await page.keyboard.up('Control');

    const saveButton = page.locator('.n-button--variant-primary, button:has-text("保存")').first();
    if (await saveButton.isVisible()) await saveButton.click({ force: true });

    await page.waitForTimeout(10000); 
    await page.screenshot({ path: 'final_check.png' });
    console.log(`🎉 完了しました！ noteを確認してください: ${title}`);

  } catch (e) {
    console.error("❌ 失敗:", e.message);
    if (page) await page.screenshot({ path: 'error.png', fullPage: true });
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
