import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const prompt = `Write a professional blog post in English about the synergy of Pharmaceutical Sciences and Mathematics. 
  Focus on logical modeling and drug discovery. The first line must be the title. No markdown symbols.`;
  
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const lines = text.split('\n').filter(l => l.trim() !== "");
    const title = lines[0].replace(/[*#]/g, '').trim();
    const body = lines.slice(1).join('\n\n');
    console.log(`🤖 Gemini生成: ${title}`);
    return { title, body };
  } catch (e) {
    console.error("Gemini生成エラー:", e.message);
    throw e;
  }
}

(async () => {
  let browser;
  let page; // 💡 スコープを外に出すことで、catchブロックからも参照可能にします
  try {
    const { title, body } = await generateArticle();
    
    browser = await chromium.launch();
    const storageState = JSON.parse(process.env.NOTE_STATE);
    const context = await browser.newContext({ storageState });
    page = await context.newPage();

    console.log("noteへ移動中...");
    await page.goto('https://note.com/posts/new', { waitUntil: 'networkidle', timeout: 60000 });

    // 邪魔なポップアップを消す
    await page.keyboard.press('Escape');
    await page.waitForTimeout(3000);

    // タイトル入力（複数の属性でしつこく探します）
    const titleSelector = 'textarea[placeholder*="タイトル"], .note-editor-title__input, .note-editor-title textarea';
    await page.waitForSelector(titleSelector, { timeout: 20000 });
    await page.fill(titleSelector, title);
    console.log("タイトル入力完了。");

    // 本文入力
    const bodySelector = '.note-common-editor__editable, [role="textbox"]';
    await page.waitForSelector(bodySelector, { timeout: 10000 });
    await page.fill(bodySelector, body);
    console.log("本文入力完了。");

    console.log("下書き保存中...");
    await page.click('button:has-text("保存")');
    
    // 保存完了を確実にするための待機
    await page.waitForTimeout(10000);
    
    console.log(`🎉 成功！ noteに下書き保存されました: ${title}`);

  } catch (e) {
    console.error("❌ 失敗内容:", e.message);
    if (page) console.log("エラー発生時のURL:", page.url());
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
