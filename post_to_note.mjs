import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = "Write a sophisticated blog post in English about Pharmaceutical Sciences and Mathematics. Title on the first line.";
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const lines = text.split('\n').filter(l => l.trim() !== "");
  const title = lines[0].replace(/#/g, '').trim();
  const body = lines.slice(1).join('\n\n');
  console.log(`🤖 Gemini生成: ${title}`);
  return { title, body };
}

(async () => {
  let browser;
  try {
    const { title, body } = await generateArticle();
    browser = await chromium.launch();
    const context = await browser.newContext({ storageState: JSON.parse(process.env.NOTE_STATE) });
    const page = await context.newPage();

    console.log("noteへ移動中...");
    await page.goto('https://note.com/posts/new', { waitUntil: 'networkidle', timeout: 60000 });

    // 💡 邪魔なポップアップがあれば「Esc」キーで消す
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);

    // 💡 ページ内のすべてのテキストエリアをスキャンして、タイトル欄を特定する
    console.log("入力欄をスキャン中...");
    const textareas = await page.$$eval('textarea', els => els.map(el => ({ ph: el.placeholder, cl: el.className })));
    console.log("見つかったtextarea:", textareas);

    // 💡 placeholderに「タイトル」を含む要素を最優先で探す
    const titleField = page.locator('textarea[placeholder*="タイトル"], .note-editor-title__input, .note-editor-title textarea').first();
    
    await titleField.waitFor({ state: 'visible', timeout: 20000 });
    await titleField.fill(title);
    console.log("タイトル入力完了。");

    // 本文入力（こちらも柔軟に指定）
    const bodyField = page.locator('.note-common-editor__editable, [role="textbox"]').first();
    await bodyField.fill(body);
    console.log("本文入力完了。");

    console.log("保存中...");
    await page.click('button:has-text("保存")');
    await page.waitForTimeout(10000);
    
    console.log(`🎉 成功: ${title}`);

  } catch (e) {
    console.error("❌ 失敗時のURL:", page ? page.url() : "unknown");
    console.error("❌ エラー内容:", e.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
