import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = "Write a professional blog post in English about the synergy of Pharmaceutical Sciences and Mathematics at Kyoto University. Title on the first line.";
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
      viewport: { width: 1280, height: 800 } 
    });
    page = await context.newPage();

    console.log("noteトップページへ移動中...");
    await page.goto('https://note.com/', { waitUntil: 'networkidle', timeout: 60000 });

    console.log("「投稿」ボタンをクリック中...");
    const menuTrigger = page.locator('header button[aria-label="投稿"], .a-split-button__right').first();
    await menuTrigger.waitFor({ state: 'visible', timeout: 15000 });
    await menuTrigger.click({ force: true });
    await page.waitForTimeout(2000);

    console.log("「テキスト」形式を選択中...");
    const textOption = page.locator('a[href*="notes/new"], .o-navbarPrimary__postingButton').first();
    await textOption.click({ force: true });

    // 💡 修正ポイント：新ドメイン "editor.note.com" を待ち受けに加える
    console.log("新エディタの読み込みを待機中...");
    await page.waitForURL(/editor\.note\.com\/new|notes\/new/, { timeout: 30000 });
    
    // 💡 新エディタに対応した汎用セレクタ
    const titleArea = page.locator('textarea[placeholder*="タイトル"], .note-editor-title__input').first();
    await titleArea.waitFor({ state: 'visible', timeout: 20000 });
    await titleArea.fill(title);
    
    const bodyArea = page.locator('.note-common-editor__editable, [role="textbox"], .ProseMirror').first();
    await bodyArea.waitFor({ state: 'visible' });
    await bodyArea.fill(body);
    console.log("記事の内容を入力しました。");

    console.log("下書きとして保存中...");
    // 保存ボタンもより確実に（n-button--primary など）
    const saveButton = page.locator('button:has-text("保存"), .n-button--primary').first();
    await saveButton.click();
    
    await page.waitForTimeout(10000);
    console.log(`🎉 ミッション完了！ noteに下書きが保存されました: ${title}`);

  } catch (e) {
    console.error("❌ 失敗:", e.message);
    if (page) await page.screenshot({ path: 'error.png', fullPage: true });
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
