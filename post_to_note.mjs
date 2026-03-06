import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';

async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = "Write a sophisticated blog post in English about Pharmaceutical Sciences and Mathematics. Focus on drug discovery. Title on the first line. No markdown.";
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
    const context = await browser.newContext({ 
      storageState: JSON.parse(process.env.NOTE_STATE),
      viewport: { width: 1920, height: 1080 } // 💡 画面を広くしてボタンを確実に出す
    });
    page = await context.newPage();

    console.log("noteトップページへ移動中...");
    await page.goto('https://note.com/', { waitUntil: 'networkidle', timeout: 60000 });

    // 💡 投稿ボタンを「URL」や「アイコンの形」で多角的に探す
    console.log("投稿ボタンを探索中...");
    const postButton = page.locator([
      'a[href*="/posts/new"]', // 投稿画面への直接リンク
      '.o-noteHeader__postButton',
      'button:has(svg)', // ペンアイコンを持つボタン
      'button:has-text("投稿")'
    ].join(', ')).first();

    await postButton.waitFor({ state: 'attached', timeout: 20000 });
    await postButton.click({ force: true }); // 💡 強制クリック

    // 「テキスト」形式を選択
    console.log("テキスト形式を選択中...");
    const textOption = page.locator('a:has-text("テキスト"), [data-type="text"], a[href$="type=text"]').first();
    await textOption.waitFor({ state: 'attached', timeout: 15000 });
    await textOption.click({ force: true });

    // エディタ画面への遷移待ち
    await page.waitForURL(/posts\/new/, { timeout: 30000 });
    console.log("エディタ画面に到達しました。");

    // 入力処理（プレースホルダーに頼らず、クラス名で指定）
    const titleArea = page.locator('.note-editor-title__input, textarea[placeholder*="タイトル"]').first();
    await titleArea.waitFor({ state: 'visible', timeout: 20000 });
    await titleArea.fill(title);
    
    const bodyArea = page.locator('.note-common-editor__editable');
    await bodyArea.fill(body);
    
    console.log("保存中...");
    await page.click('button:has-text("保存")');
    await page.waitForTimeout(10000);
    
    console.log(`🎉 成功！: ${title}`);

  } catch (e) {
    console.error("❌ 失敗:", e.message);
    if (page) await page.screenshot({ path: 'error.png', fullPage: true });
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
