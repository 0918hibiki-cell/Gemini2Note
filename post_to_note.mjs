import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

// ... (generateArticle 関数はそのまま使用)

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

    console.log("エディタの完全読み込みを待機（15秒）...");
    await page.waitForTimeout(15000); 

    console.log("入力シーケンス開始...");
    await page.keyboard.press('Tab'); // タイトルへ
    await page.waitForTimeout(1000);
    await page.keyboard.type(title, { delay: 50 });
    
    await page.keyboard.press('Tab'); // 本文へ
    await page.waitForTimeout(1000);
    await page.keyboard.type(body, { delay: 5 });
    
    // 💡 入力後の反映を待つためのバッファ
    await page.waitForTimeout(5000);

    console.log("保存アクションを実行中...");
    
    // 💡 手法1: キーボードショートカット (Ctrl + S) を試行
    await page.keyboard.down('Control');
    await page.keyboard.press('s');
    await page.keyboard.up('Control');
    console.log("ショートカットキー(Ctrl+S)を送信しました。");
    await page.waitForTimeout(3000);

    // 💡 手法2: 物理ボタンを複数の属性でしつこく探してクリック
    // 新エディタの保存ボタンに特化したセレクタ
    const saveSelectors = [
      'button:has-text("保存")',
      'button[data-testid="save-button"]',
      '.n-button--variant-primary',
      'header button:last-child', // ヘッダーの一番右側のボタン
      '.editor-header__actions button'
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

    if (!clicked) {
      console.log("ボタンが見つかりませんが、Ctrl+Sが効いている可能性があるため続行します。");
    }

    await page.waitForTimeout(10000); // 完了待機
    console.log(`🎉 ミッション完了！ 下書き保存を確認してください: ${title}`);

  } catch (e) {
    console.error("❌ 失敗内容:", e.message);
    if (page) await page.screenshot({ path: 'error.png', fullPage: true });
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
