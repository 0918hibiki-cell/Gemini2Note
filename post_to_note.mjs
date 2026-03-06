import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = `Write a sophisticated blog post in English. Topic: The synergy between Pharmaceutical Sciences and Mathematical Logic. Title on the first line. No markdown.`;
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const lines = text.split('\n').filter(l => l.trim() !== "");
  const title = lines[0].replace(/[*#]/g, '').trim();
  const body = lines.slice(1).join('\n\n');
  console.log(`🤖 Gemini生成成功: ${title}`);
  return { title, body };
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

    // 💡 ロード画面の「...」が消え、タイトル入力欄が現れるまで最大 60 秒待機
    console.log("エディタの完全読み込みを待機中...");
    const titleArea = page.locator('h1[contenteditable="true"], .note-editor-title__input, textarea[placeholder*="タイトル"]').first();
    await titleArea.waitFor({ state: 'visible', timeout: 60000 });
    console.log("ロード完了。入力準備が整いました。");

    // 入力前に一瞬待機してフォーカスを安定させる
    await page.waitForTimeout(2000);

    console.log("入力シーケンス開始...");
    // 直接タイトル欄をクリックしてフォーカス
    await titleArea.click();
    await page.keyboard.type(title, { delay: 50 });
    
    // Tabキーで本文へ移動
    await page.keyboard.press('Tab'); 
    await page.waitForTimeout(1000);
    
    // 本文を入力
    await page.keyboard.type(body, { delay: 10 });
    await page.waitForTimeout(5000);

    // 証拠写真1: 入力完了確認
    await page.screenshot({ path: 'input_check.png' });
    console.log("📸 入力完了の証拠を撮影しました。");

    console.log("保存中...");
    // Ctrl + S
    await page.keyboard.down('Control');
    await page.keyboard.press('s');
    await page.keyboard.up('Control');

    // 物理ボタンも押す（より汎用的なクラス名で）
    const saveButton = page.locator('.n-button--variant-primary, button:has-text("保存")').first();
    if (await saveButton.isVisible()) {
      await saveButton.click({ force: true });
    }

    // 保存通信が終わるのを十分待つ
    console.log("保存の完了を待機しています...");
    await page.waitForTimeout(15000); 
    
    // 最終証拠写真
    await page.screenshot({ path: 'final_check.png' });
    console.log(`🎉 プロセス完遂: ${title}`);

  } catch (e) {
    console.error("❌ エラー:", e.message);
    if (page) await page.screenshot({ path: 'error.png', fullPage: true });
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
