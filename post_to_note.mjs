import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = "Write a professional blog post in English about the synergy of Pharmaceutical Sciences and Mathematics. The first line must be the title. No markdown.";
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

    // 1. 投稿ボタンをクリック
    console.log("投稿ボタンをクリックしています...");
    const postButton = page.locator('.o-noteHeader__postButton, button:has(svg), [aria-label="投稿"]').first();
    await postButton.click({ force: true });
    
    // 💡 メニューが表示されるのを少し待つ（アニメーション対策）
    await page.waitForTimeout(3000);

    // 2. 「テキスト」形式をURLで確実に特定してクリック
    console.log("テキスト形式を選択中...");
    // 文字が「□」でも、リンク先のURLには "/posts/new?type=text" が含まれることを利用
    const textLink = page.locator('a[href*="type=text"]').first();
    
    // もしリンクが見つからない場合の予備（メニューの1番目の項目）
    if (await textLink.count() === 0) {
      console.log("URLリンクが見つからないため、メニューの第1項目を試行します...");
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
    } else {
      await textLink.click({ force: true });
    }

    // 3. エディタ画面への遷移を待機
    console.log("エディタの読み込みを待機中...");
    await page.waitForURL(/posts\/new/, { timeout: 30000 });

    // 4. タイトルと本文の入力
    const titleArea = page.locator('.note-editor-title__input, textarea[placeholder*="タイトル"]').first();
    await titleArea.waitFor({ state: 'visible', timeout: 20000 });
    await titleArea.fill(title);
    
    const bodyArea = page.locator('.note-common-editor__editable').first();
    await bodyArea.fill(body);
    console.log("入力が完了しました。");

    // 5. 保存（文字に頼らず、ボタンの属性で指定）
    console.log("下書き保存中...");
    const saveButton = page.locator('button.n-button--primary, button:has-text("保存")').first();
    await saveButton.click();
    
    await page.waitForTimeout(10000);
    console.log(`🎉 成功！ noteに下書き保存されました: ${title}`);

  } catch (e) {
    console.error("❌ 失敗内容:", e.message);
    if (page) await page.screenshot({ path: 'error.png', fullPage: true });
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
