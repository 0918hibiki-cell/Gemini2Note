import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const prompt = `Write a sophisticated blog post in English. Topic: The synergy between Pharmaceutical Sciences and Mathematical Logic. Title on the first line. No markdown.`;
  
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const lines = text.split('\n').filter(l => l.trim() !== "");
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
    const storageState = JSON.parse(process.env.NOTE_STATE);
    const context = await browser.newContext({ storageState, viewport: { width: 1280, height: 1000 } });
    page = await context.newPage();

    console.log("エディタへ直行中...");
    await page.goto('https://note.com/notes/new?type=text', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(15000); 

    // 💡 エディタがフォーカスされるように一度画面中央をクリック
    await page.mouse.click(640, 500);
    await page.waitForTimeout(1000);

    console.log("入力シーケンス開始...");
    await page.keyboard.press('Tab'); 
    await page.waitForTimeout(1000);
    await page.keyboard.type(title, { delay: 30 }); // タイトル入力
    
    await page.keyboard.press('Tab'); 
    await page.waitForTimeout(1000);
    await page.keyboard.type(body, { delay: 5 }); // 本文入力
    
    await page.waitForTimeout(5000);

    // 💡 証拠写真1: 入力が完了した状態を撮影
    await page.screenshot({ path: 'input_check.png' });
    console.log("📸 入力確認用スクリーンショットを保存しました。");

    console.log("保存アクションを実行中...");
    // 手法1: Ctrl+S
    await page.keyboard.down('Control');
    await page.keyboard.press('s');
    await page.keyboard.up('Control');
    
    // 手法2: 保存ボタンをクラス名で直接クリック
    const saveButton = page.locator('button:has-text("保存"), .n-button--variant-primary').first();
    if (await saveButton.isVisible()) {
      await saveButton.click({ force: true });
      console.log("物理保存ボタンをクリックしました。");
    }

    // 💡 保存が完了（「保存しました」の表示を待つ代わりに長めに待機）
    console.log("保存通信の完了を待機中...");
    await page.waitForTimeout(15000); 
    
    // 💡 証拠写真2: 保存操作後の状態を撮影
    await page.screenshot({ path: 'final_check.png' });
    
    console.log(`🎉 完了しました。画像を確認してください: ${title}`);

  } catch (e) {
    console.error("❌ 失敗内容:", e.message);
    if (page) await page.screenshot({ path: 'error.png', fullPage: true });
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
