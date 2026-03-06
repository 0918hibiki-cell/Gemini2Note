import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  // 💡 モデル名を「gemini-1.5-flash」に変更。これが最もクォータ（枠）が安定しています。
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  const prompt = `
    Write an insightful blog post in English. 
    Topic: The intersection of Pharmaceutical Sciences and Mathematics. 
    Focus on how logical modeling helps drug discovery.
    Keep it professional and academic for Kyoto University students.
    Ensure the first line is the title.
  `;
  
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const lines = text.split('\n').filter(l => l.trim() !== "");
    return { title: lines[0].replace(/#/g, '').trim(), body: lines.slice(1).join('\n\n') };
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

    console.log("note投稿画面へ...");
    await page.goto('https://note.com/posts/new');
    await page.waitForSelector('.note-editor-title textarea');
    await page.fill('.note-editor-title textarea', title);
    await page.fill('.note-common-editor__editable', body);
    
    console.log("下書き保存中...");
    await page.click('button:has-text("保存")');
    await page.waitForTimeout(5000);
    console.log(`✅ 成功: ${title}`);
  } catch (e) {
    console.error("❌ 失敗:", e);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
