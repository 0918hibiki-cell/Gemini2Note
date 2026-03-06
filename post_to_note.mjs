import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';

async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = `Write a professional blog post in English about the synergy of Pharmaceutical Sciences and Mathematics. The first line must be the title. No markdown.`;
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
    browser = await chromium.launch();
    const storageState = JSON.parse(process.env.NOTE_STATE);
    const context = await browser.newContext({ storageState });
    page = await context.newPage();

    console.log("noteへ移動中...");
    await page.goto('https://note.com/posts/new', { waitUntil: 'networkidle' });

    // 💡 邪魔なポップアップを消すために複数回Escを押す
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);
    await page.keyboard.press('Escape');

    console.log("入力欄を探索中...");
    
    // 💡 UI変更に備え、より汎用的な「テキスト入力」を探してクリックしてから入力
    const titleArea = page.locator('textarea, [contenteditable="true"]').first();
    await titleArea.waitFor({ state: 'attached', timeout: 20000 });
    
    // タイトル入力
    await page.type('textarea[placeholder*="タイトル"]', title, { delay: 100 });
    console.log("タイトル入力完了。");

    // 本文入力
    await page.click('.note-common-editor__editable');
    await page.fill('.note-common-editor__editable', body);
    console.log("本文入力完了。");

    console.log("保存中...");
    await page.click('button:has-text("保存")');
    await page.waitForTimeout(10000);
    
    console.log(`🎉 成功！ noteに下書き保存されました: ${title}`);

  } catch (e) {
    console.error("❌ エラー発生:", e.message);
    if (page) {
      await page.screenshot({ path: 'error.png', fullPage: true });
      console.log("📸 エラー時のスクリーンショットを 'error.png' として保存しました。");
    }
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
