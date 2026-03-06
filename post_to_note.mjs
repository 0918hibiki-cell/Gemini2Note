import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';

async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = `Write a professional blog post in English about Pharmaceutical Sciences and Mathematics. Focus on logical modeling and drug discovery. The first line must be the title. No markdown.`;
  
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const lines = text.split('\n').filter(l => l.trim() !== "");
    const title = lines[0].replace(/[*#]/g, '').trim();
    const body = lines.slice(1).join('\n\n');
    console.log(`🤖 Gemini生成成功: ${title}`);
    return { title, body };
  } catch (e) {
    console.error("Gemini Error:", e.message);
    throw e;
  }
}

(async () => {
  let browser;
  let page;
  try {
    const { title, body } = await generateArticle();

    // 💡 共有ドキュメントの知恵：storageStateを一時ファイルとして書き出す
    const tempStatePath = './temp-state.json';
    fs.writeFileSync(tempStatePath, process.env.NOTE_STATE);

    browser = await chromium.launch({ headless: true });
    // 一時ファイルからコンテキストを作成
    const context = await browser.newContext({ storageState: tempStatePath });
    page = await context.newPage();

    console.log("noteトップページへ移動中...");
    await page.goto('https://note.com/', { waitUntil: 'load', timeout: 60000 });

    // 💡 404回避：URL直叩きではなく、ヘッダーの「投稿」ボタンを物理的に探す
    console.log("投稿ボタンを探索中...");
    const postButton = page.locator('.o-noteHeader__postButton, button:has-text("投稿")').first();
    await postButton.waitFor({ state: 'visible', timeout: 15000 });
    await postButton.click();

    // 「テキスト」を選択
    console.log("テキスト形式を選択中...");
    const textOption = page.locator('a:has-text("テキスト"), [data-type="text"]').first();
    await textOption.waitFor({ state: 'visible', timeout: 10000 });
    await textOption.click();

    // 💡 エディタ画面への遷移をURLで検知（共有ドキュメントのwaitForURLロジック）
    await page.waitForURL(/posts\/new\?type=text/, { timeout: 30000 });
    console.log("エディタ画面に到達しました。");

    // 入力
    await page.waitForSelector('textarea[placeholder*="タイトル"]', { timeout: 20000 });
    await page.fill('textarea[placeholder*="タイトル"]', title);
    
    // 本文（リッチエディタへの確実な入力）
    const editor = page.locator('.note-common-editor__editable');
    await editor.click();
    await editor.fill(body);
    
    console.log("下書きとして保存中...");
    // 💡 ドキュメントに記載の通り、is_public: false の挙動を再現
    await page.click('button:has-text("保存")');
    
    // 保存完了を確実にするための待機
    await page.waitForTimeout(10000);
    console.log(`🎉 投稿成功: ${title}`);

    // 後片付け
    fs.unlinkSync(tempStatePath);

  } catch (e) {
    console.error("❌ 失敗:", e.message);
    if (page) await page.screenshot({ path: 'error.png', fullPage: true });
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
