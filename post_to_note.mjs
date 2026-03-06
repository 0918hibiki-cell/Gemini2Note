import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const prompt = `
    Role: Logic Link English Coach.
    Target: Japanese business people (Beginner-Intermediate level).
    
    [Instruction]
    - Title: Create a catchy title in JAPANESE (Problem + Logic/Math term).
    - Format: NO markdown headers (#). Use **Bold Text** for sections.
    
    [Structure]
    --- FREE AREA ---
    **タイトル** (Japanese Title)
    **はじめに** (Japanese Intro: Logical perspective on daily life).
    **Today's Story** (English Dialogue: Middle school level + alpha).
    **最重要フレーズ Top 3** (Key expressions with Japanese meanings).
    **読解クイズ** (3-choice question in Japanese).

    --- PAID LINE ---
    [有料エリア：ここから下は100円]

    **全文和訳** (Natural Japanese translation).
    **重要語彙フルリスト** (Up to 7 phrases).
    **ロジカル・ディープダイブ** (Japanese column: Pharmaceutical or Statistical insight).
    **クイズの解説** (Logical reasoning).
  `;
  
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const lines = text.split('\n').filter(l => l.trim() !== "");
    const title = lines[0].replace(/[*#]/g, '').replace('**タイトル**', '').trim();
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
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 1000 } 
    });
    page = await context.newPage();

    // 💡 1. トップページ経由でセッションを温める（重要）
    console.log("noteトップページへ移動中...");
    await page.goto('https://note.com/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(5000);

    // 💡 2. ボタン操作でエディタへ（直行URLより安定します）
    console.log("エディタへ遷移中...");
    const postButton = page.locator('header button[aria-label="投稿"], .a-split-button__right').first();
    await postButton.click();
    await page.waitForTimeout(2000);
    const textOption = page.locator('a[href*="notes/new"], .o-navbarPrimary__postingButton').first();
    await textOption.click();

    // 💡 3. エディタの起動を粘り強く待つ
    console.log("エディタの起動を待機中...");
    const titleArea = page.locator('h1[contenteditable="true"], .note-editor-title__input, textarea[placeholder*="タイトル"]').first();
    await titleArea.waitFor({ state: 'visible', timeout: 90000 });
    
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

    await page.waitForTimeout(15000); 
    await page.screenshot({ path: 'final_check.png' });
    console.log(`🎉 完了しました！: ${title}`);

  } catch (e) {
    console.error("❌ 失敗:", e.message);
    if (page) await page.screenshot({ path: 'error.png', fullPage: true });
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
