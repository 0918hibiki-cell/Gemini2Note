import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * 1. 記事生成関数
 * 実績のある gemini-2.5-flash を固定で使用します。
 */
async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const prompt = `
    Write a sophisticated blog post in English. 
    Topic: The synergy between Pharmaceutical Sciences and Mathematical Logic at Kyoto University. 
    Focus: How computational modeling and logic accelerate drug discovery.
    Requirement: The first line must be the title. No markdown formatting like #.
  `;
  
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const lines = text.split('\n').filter(l => l.trim() !== "");
    
    // タイトルと本文を論理的に分離
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
 * 2. 投稿実行メインブロック
 */
(async () => {
  let browser;
  let page;
  try {
    const { title, body } = await generateArticle();
    
    browser = await chromium.launch({ headless: true });
    const storageState = JSON.parse(process.env.NOTE_STATE);
    const context = await browser.newContext({ 
      storageState,
      viewport: { width: 1280, height: 1000 } 
    });
    page = await context.newPage();

    // 404を回避しつつ、エディタURLへ直接アクセス
    console.log("エディタへ移動中...");
    await page.goto('https://note.com/notes/new?type=text', { waitUntil: 'networkidle', timeout: 60000 });

    // 新エディタ（editor.note.com）の重いロードを考慮した待機
    console.log("エディタの完全読み込みを待機（15秒）...");
    await page.waitForTimeout(15000); 

    console.log("入力シーケンス開始（Tabキー制御）...");
    
    // 手順1: 最初の要素（通常はタイトル欄）へフォーカス
    await page.keyboard.press('Tab'); 
    await page.waitForTimeout(1000);
    // タイトル入力
    await page.keyboard.type(title, { delay: 50 });
    
    // 手順2: 本文欄へ Tab で移動
    await page.keyboard.press('Tab'); 
    await page.waitForTimeout(1000);
    // 本文入力
    await page.keyboard.type(body, { delay: 10 });
    
    // 自動保存が走るための待機バッファ
    await page.waitForTimeout(5000);

    console.log("保存アクションを実行中...");
    
    // 手法1: 保存ショートカット (Ctrl + S)
    await page.keyboard.down('Control');
    await page.keyboard.press('s');
    await page.keyboard.up('Control');
    console.log("ショートカット送信完了");
    await page.waitForTimeout(3000);

    // 手法2: 物理保存ボタンへのフォールバック
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
          console.log(`物理クリック成功: ${selector}`);
          break;
        }
      } catch (e) { continue; }
    }

    await page.waitForTimeout(10000); 
    console.log(`🎉 完了しました。noteの下書きを確認してください: ${title}`);

  } catch (e) {
    console.error("❌ エラー発生:", e.message);
    if (page) {
      await page.screenshot({ path: 'error.png', fullPage: true });
      console.log("📸 エラー画面を保存しました。Artifactsを確認してください。");
    }
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
