import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const prompt = `Write an insightful blog post in English about Pharmaceutical Sciences and Mathematical Logic. Focus on drug discovery. Title on the first line.`;
  
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const lines = text.split('\n').filter(l => l.trim() !== "");
    const title = lines[0].replace(/#/g, '').trim();
    const body = lines.slice(1).join('\n\n');
    
    // 💡 Geminiが何を生成したかログに出して「前進」を確認する
    console.log(`🤖 Geminiが記事を生成しました: ${title}`);
    return { title, body };
  } catch (e) {
    console.error("Gemini Error:", e.message);
    throw e;
  }
}

(async () => {
  let browser;
  try {
    const { title, body } = await generateArticle();
    browser = await chromium.launch();
    const storageState = JSON.parse(process.env.NOTE_STATE);
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    console.log("note投稿画面へ移動中...");
    await page.goto('https://note.com/posts/new');

    // 💡 ログインできているか、リダイレクトされていないかURLを確認
    console.log(`現在のURL: ${page.url()}`);
    if (page.url().includes('login')) {
      throw new Error("❌ ログイン情報が期限切れのようです。再度NOTE_STATEを更新してください。");
    }

    // 💡 より柔軟なセレクタ（placeholder属性など）を使用
    await page.waitForSelector('textarea[placeholder="タイトル"]', { timeout: 15000 });
    await page.fill('textarea[placeholder="タイトル"]', title);
    
    // 本文入力（noteの仕様に合わせた汎用的なセレクタ）
    await page.waitForSelector('.note-common-editor__editable', { timeout: 15000 });
    await page.fill('.note-common-editor__editable', body);
    
    console.log("下書き保存中...");
    await page.click('button:has-text("保存")');
    await page.waitForTimeout(7000);
    
    console.log(`✅ 成功: ${title}`);
  } catch (e) {
    console.error("❌ 失敗:", e.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
