import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * 1. Geminiを使用して記事の内容を生成する関数
 * モデル名を安定版の "gemini-1.5-flash" に修正しました。
 */
async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  // 安定して動作するモデル名を指定
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  const prompt = `
    Write a professional blog post in English. 
    Topic: The synergy between Pharmaceutical Sciences and Mathematical Logic. 
    Focus: How computational modeling and logic accelerate drug discovery at Kyoto University.
    Requirement: The first line must be the title. No markdown.
  `;
  
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const lines = text.split('\n').filter(l => l.trim() !== "");
    
    // タイトルと本文を分離
    const title = lines[0].replace(/[*#]/g, '').trim();
    const body = lines.slice(1).join('\n\n');
    
    console.log(`🤖 Gemini生成成功: ${title}`);
    return { title, body };
  } catch (e) {
    console.error("Gemini生成エラー:", e.message);
    throw e;
  }
}

/**
 * 2. メインの投稿処理
 */
(async () => {
  let browser;
  let page;
  try {
    // 記事の生成
    const { title, body } = await generateArticle();
    
    browser = await chromium.launch({ headless: true });
    const storageState = JSON.parse(process.env.NOTE_STATE);
    const context = await browser.newContext({ 
      storageState,
      viewport: { width: 1280, height: 1000 } 
    });
    page = await context.newPage();

    console.log("エディタへ直行中...");
    await page.goto('https://note.com/notes/new?type=text', { waitUntil: 'networkidle', timeout: 60000 });

    console.log("エディタの完全読み込みを待機（15秒）...");
    await page.waitForTimeout(15000); 

    

    console.log("入力シーケンス開始...");
    // 1. タイトル欄へ移動して入力
    await page.keyboard.press('Tab'); 
    await page.waitForTimeout(1000);
    await page.keyboard.type(title, { delay: 50 });
    
    // 2. 本文欄へ移動して入力
    await page.keyboard.press('Tab'); 
    await page.waitForTimeout(1000);
    await page.keyboard.type(body, { delay: 5 });
    
    await page.waitForTimeout(5000); // 反映待ち

    console.log("保存アクションを実行中...");
    
    // 手法1: ショートカット (Ctrl + S)
    await page.keyboard.down('Control');
    await page.keyboard.press('s');
    await page.keyboard.up('Control');
    console.log("ショートカットキーを送信しました。");
    await page.waitForTimeout(3000);

    // 手法2: 物理ボタンのクリック（予備）
    const saveSelectors = [
      'button:has-text("保存")',
      'button[data-testid="save-button"]',
      '.n-button--variant-primary',
      'header button:last-child'
    ];

    for (const selector of saveSelectors) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.isVisible()) {
          await btn.click({ force: true, timeout: 5000 });
          break;
        }
      } catch (e) { continue; }
    }

    await page.waitForTimeout(10000); 
    console.log(`🎉 ミッション完了！ 下書き保存を確認してください: ${title}`);

  } catch (e) {
    console.error("❌ 失敗内容:", e.message);
    if (page) {
      await page.screenshot({ path: 'error.png', fullPage: true });
      console.log("📸 エラー時のスクリーンショットを保存しました。");
    }
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
