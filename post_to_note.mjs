import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * 1. 記事生成関数：Logic Link English Coach モード
 * 構成、有料ライン、装飾タグ（##, >）を厳密に制御します。
 */
async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const prompt = `
    Role: Logic Link English Coach (Sophisticated, insightful, and encouraging).
    Target: Japanese business people (Beginner-Intermediate).
    
    [Topic Selection Rule]
    Select one topic from:
    - Pharmacy Lite: (e.g., Placebo effect, Half-life of skills, Concentration of effort).
    - Math/Logic: (e.g., False positives in business, Compound interest of habits).
    - Personal Story: (e.g., Solving problems with GAS in Cambodia, Resilience in research).
    *Make it interesting and relatable, not just dry business.*

    [Formatting Rules for note.com]
    - Headings: Use "## " (with a space) at the start of the line.
    - Blockquote (for Dialogue): Use "> " at the start of each dialogue line.
    - Bold: Use "**" to surround key words (e.g., **Key Expression**).
    - Spacing: Always put one empty line before and after headings.
    - Lists: Do NOT use auto-numbering. Use simple bullet points if needed.

    [Structure]
    Line 1: Title (Japanese: Problem + Logic/Math/Pharmacy term)

    --- FREE AREA ---
    ## はじめに
    (Intro in Japanese: Emotional/Cinematic empathy. Shift the blame to a "logic bug".)

    ## Today's Story
    (Dialogue in English: Use "> " for each speaker's line. Ensure the dialogue is engaging.)

    ## 最重要フレーズ Top 3
    (3 phrases with Japanese meanings and short logical context.)

    ## 読解クイズ
    (3-choice question in Japanese based on the story.)

    --- PAID LINE ---
    [有料エリア：ここから下は100円]

    ## 全文和訳
    (Natural Japanese translation.)

    ## 重要語彙フルリスト
    (Up to 7 phrases including usage tips for business.)

    ## ロジカル・ディープダイブ
    (Japanese column: Soft scientific/logical insight. No complex formulas.)

    ## クイズの解説
    (Logical reasoning for the correct answer.)
  `;
  
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const lines = text.split('\n').filter(l => l.trim() !== "");
    
    // 1行目をタイトルとして抽出
    const title = lines[0].replace(/[*#]/g, '').replace('タイトル：', '').trim();
    const bodyLines = lines.slice(1);
    
    console.log(`🤖 Gemini生成成功: ${title}`);
    return { title, bodyLines };
  } catch (e) {
    console.error("Gemini生成エラー:", e.message);
    throw e;
  }
}

/**
 * 2. 投稿実行ブロック：人間らしい入力シーケンス
 */
(async () => {
  let browser;
  let page;
  try {
    const { title, bodyLines } = await generateArticle();
    
    browser = await chromium.launch({ headless: true });
    const storageState = JSON.parse(process.env.NOTE_STATE);
    const context = await browser.newContext({ 
      storageState,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 1000 } 
    });
    page = await context.newPage();

    console.log("エディタへ移動中...");
    await page.goto('https://note.com/notes/new?type=text', { waitUntil: 'networkidle', timeout: 60000 });

    // ロード完了を待機
    const titleArea = page.locator('h1[contenteditable="true"], .note-editor-title__input, textarea[placeholder*="タイトル"]').first();
    await titleArea.waitFor({ state: 'visible', timeout: 60000 });
    await page.waitForTimeout(3000);

    // タイトル入力
    console.log("タイトルを入力中...");
    await titleArea.click();
    await page.keyboard.type(title, { delay: 50 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    console.log("本文を入力中（装飾トリガーを処理）...");
    for (const line of bodyLines) {
      if (line.trim() === "") {
        await page.keyboard.press('Enter');
        continue;
      }

      // 💡 Markdownトリガーを確実に発火させるため、文字ごとにディレイを入れて入力
      await page.keyboard.type(line, { delay: 20 });
      await page.keyboard.press('Enter');
      
      // 見出しや引用の変換処理を待つための微小なバッファ
      if (line.startsWith('##') || line.startsWith('>')) {
        await page.waitForTimeout(800);
      }
    }

    // 入力完了後の確認
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'input_check.png' });

    console.log("保存アクション...");
    await page.keyboard.down('Control');
    await page.keyboard.press('s');
    await page.keyboard.up('Control');

    const saveButton = page.locator('.n-button--variant-primary, button:has-text("保存")').first();
    if (await saveButton.isVisible()) await saveButton.click({ force: true });

    await page.waitForTimeout(10000); 
    await page.screenshot({ path: 'final_check.png' });
    console.log(`🎉 ミッション完遂！: ${title}`);

  } catch (e) {
    console.error("❌ エラー:", e.message);
    if (page) await page.screenshot({ path: 'error.png', fullPage: true });
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
