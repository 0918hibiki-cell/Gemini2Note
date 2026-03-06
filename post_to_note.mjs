import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = "Write a professional blog post in English about the synergy of Pharmaceutical Sciences and Mathematics. Title on the first line. No markdown.";
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const lines = text.split('\n').filter(l => l.trim() !== "");
  const title = lines[0].replace(/[*#]/g, '').trim();
  const body = lines.slice(1).join('\n\n');
  console.log(`🤖 Gemini生成: ${title}`);
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

    console.log("noteトップページへ移動中...");
    await page.goto('https://note.com/', { waitUntil: 'networkidle', timeout: 60000 });

    console.log("投稿プロセスを開始...");
    // 💡 投稿ボタンをURLで直接狙う（確実）
    await page.goto('https://note.com/notes/new?type=text', { waitUntil: 'networkidle' });

    console.log("エディタの完全な読み込みを待機中（10秒）...");
    await page.waitForTimeout(10000); 

    // 💡 戦略転換：セレクタを無視して「Tabキー」でフォーカスを回す
    console.log("記事入力シーケンスを開始...");
    
    // 1. タイトル欄へ移動
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);
    // 2. タイトルを入力
    console.log("タイトルを入力中...");
    await page.keyboard.type(title, { delay: 30 });
    await page.waitForTimeout(1000);

    // 3. 本文欄へ Tab で移動
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);
    // 4. 本文を入力
    console.log("本文を入力中...");
    await page.keyboard.type(body, { delay: 10 });
    await page.waitForTimeout(2000);

    // 5. 保存ボタンをクリック
    console.log("保存シーケンス...");
    // 保存ボタンは ID や固有の属性で狙い撃ち
    const saveButton = page.locator('button:has-text("保存"), [data-testid="save-button"], .n-button--primary').first();
    await saveButton.click({ force: true });
    
    await page.waitForTimeout(10000);
    console.log(`🎉 成功！: ${title}`);

  } catch (e) {
    console.error("❌ 失敗内容:", e.message);
    if (page) await page.screenshot({ path: 'error.png', fullPage: true });
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
