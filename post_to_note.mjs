import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = "Write a professional blog post in English about the synergy of Pharmaceutical Sciences and Mathematics. Focus on drug discovery at Kyoto University. Title on the first line.";
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

    // 💡 Snippetから判明した正確な要素を狙います
    console.log("「投稿」ボタン（スプリットボタン）を探索中...");
    
    // 1. まずメニューを展開するために右側のボタンをクリック
    const menuTrigger = page.locator('header button[aria-label="投稿"], .a-split-button__right').first();
    await menuTrigger.waitFor({ state: 'visible', timeout: 15000 });
    await menuTrigger.click({ force: true });
    await page.waitForTimeout(2000);

    // 2. 「テキスト」を選択（URLが /notes/new?type=text であることを想定）
    console.log("「テキスト」形式を選択中...");
    const textOption = page.locator('a[href*="notes/new"], .o-navbarPrimary__postingButton').first();
    await textOption.click({ force: true });

    // 3. エディタ画面への遷移を確実に待つ
    console.log("エディタの読み込みを待機中...");
    await page.waitForURL(/notes\/new/, { timeout: 30000 });
    
    // 4. タイトルと本文の入力
    const titleArea = page.locator('.note-editor-title__input, textarea[placeholder*="タイトル"]').first();
    await titleArea.waitFor({ state: 'visible', timeout: 20000 });
    await titleArea.fill(title);
    
    const bodyArea = page.locator('.note-common-editor__editable').first();
    await bodyArea.waitFor({ state: 'visible' });
    await bodyArea.fill(body);
    console.log("記事の内容を入力しました。");

    // 5. 保存
    console.log("下書きとして保存中...");
    const saveButton = page.locator('button.n-button--primary, button:has-text("保存")').first();
    await saveButton.click();
    
    await page.waitForTimeout(10000);
    console.log(`🎉 完全成功！ noteに下書きが届きました: ${title}`);

  } catch (e) {
    console.error("❌ 失敗:", e.message);
    if (page) await page.screenshot({ path: 'error.png', fullPage: true });
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
