import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * 1. Geminiを使用して記事の内容を生成する関数
 * この定義が抜けていたため、ReferenceErrorが発生していました。
 */
async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  // Gemini 3 Flashモデルを使用
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash" });
  
  const prompt = `
    Write a professional blog post in English. 
    Topic: The synergy between Pharmaceutical Sciences and Mathematical Logic. 
    Focus: How computational modeling and logic accelerate drug discovery.
    Requirement: The first line must be the title. No markdown.
  `;
  
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const lines = text.split('\n').filter(l => l.trim() !== "");
    
    // 最初の1行をタイトル、残りを本文として分離
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
    // 記事の生成を開始
    const { title, body } = await generateArticle();
    
    browser = await chromium.launch({ headless: true });
    const storageState = JSON.parse(process.env.NOTE_STATE);
    const context = await browser.newContext({ 
      storageState,
      viewport: { width: 1280, height: 1000 } 
    });
    page = await context.newPage();

    console.log("エディタへ直行中...");
    // 404を回避するためにセッションを維持しつつエディタURLへ
    await page.goto('https://note.com/notes/new?type=text', { waitUntil: 'networkidle', timeout: 60000 });

    console.log("エディタの完全読み込みを待機（15秒）...");
    await page.waitForTimeout(15000); 

    

    console.log("入力シーケンス開始...");
    // 1. タイトル欄へフォーカス
    await page.keyboard.press('Tab'); 
    await page.waitForTimeout(1000);
    await page.keyboard.type(title, { delay: 50 });
    
    // 2. 本文欄へ Tab で移動
    await page.keyboard.press('Tab'); 
    await page.waitForTimeout(1000);
    await page.keyboard.type(body, { delay: 5 });
    
    // 入力後の自動保存を待つバッファ
    await page.waitForTimeout(5000);

    console.log("保存アクションを実行中...");
    
    // 手法1: ショートカット (Ctrl + S) での保存を試行
    await page.keyboard.down('Control');
    await page.keyboard.press('s');
    await page.keyboard.up('Control');
    console.log("ショートカットキーを送信しました。");
    await page.waitForTimeout(3000);

    // 手法2: 物理ボタンのクリック
    const saveSelectors = [
      'button:has-text("保存")',
      'button[data-testid="save-button"]',
      '.n-button--variant-primary',
      'header button:last-child'
    ];

    let clicked = false;
    for (const selector of saveSelectors) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.isVisible()) {
          await btn.click({ force: true, timeout: 5000 });
          console.log(`ボタンクリック成功: ${selector}`);
          clicked = true;
          break;
        }
      } catch (e) { continue; }
    }

    await page.waitForTimeout(10000); 
    console.log(`🎉 完了しました！: ${title}`);

  } catch (e) {
    console.error("❌ 失敗内容:", e.message);
    if (page) {
      // クラッシュ時のみスクリーンショットを撮影
      await page.screenshot({ path: 'error.png', fullPage: true });
      console.log("📸 エラー画面を保存しました。");
    }
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
