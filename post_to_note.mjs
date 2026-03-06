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

    console.log("投稿ボタンをクリック中...");
    const menuTrigger = page.locator('header button[aria-label="投稿"], .a-split-button__right').first();
    await menuTrigger.waitFor({ state: 'visible', timeout: 15000 });
    await menuTrigger.click({ force: true });
    await page.waitForTimeout(3000);

    console.log("「テキスト」形式を選択中...");
    const textOption = page.locator('a[href*="notes/new"], a[href*="editor.note.com"], .o-navbarPrimary__postingButton').first();
    await textOption.click({ force: true });

    console.log("新エディタの読み込みを待機中...");
    await page.waitForURL(/editor\.note\.com\/new/, { timeout: 30000 });
    // エディタの初期化を待つ
    await page.waitForTimeout(5000);

    // 💡 新エディタの「タイトル」を多角的に探索
    console.log("タイトルを入力中...");
    const titleSelectors = [
      'h1[contenteditable="true"]',
      '.note-editor-title__input',
      'textarea[placeholder*="タイトル"]',
      'div[role="textbox"]:near(h1)',
      '.editor-title'
    ];
    
    let titleField = null;
    for (const sel of titleSelectors) {
      try {
        titleField = page.locator(sel).first();
        if (await titleField.isVisible({ timeout: 2000 })) break;
      } catch (e) { continue; }
    }

    // もしセレクタで見つからない場合は、タブキーで移動して入力（力技）
    if (!titleField || !(await titleField.isVisible())) {
      console.log("セレクタで見つからないため、キーボード操作を試行します...");
      await page.keyboard.press('Tab');
      await page.keyboard.type(title, { delay: 50 });
    } else {
      await titleField.click();
      await titleField.fill(title);
    }

    // 💡 本文の入力
    console.log("本文を入力中...");
    const bodyArea = page.locator('.note-common-editor__editable, .ProseMirror, [contenteditable="true"]').nth(1);
    await bodyArea.waitFor({ state: 'visible', timeout: 10000 });
    await bodyArea.click();
    await bodyArea.fill(body);

    console.log("下書きとして保存中...");
    const saveButton = page.locator('button:has-text("保存"), .n-button--primary, button.n-button--variant-primary').first();
    await saveButton.click();
    
    await page.waitForTimeout(10000);
    console.log(`🎉 成功！ noteに下書きが保存されました: ${title}`);

  } catch (e) {
    console.error("❌ 失敗:", e.message);
    if (page) await page.screenshot({ path: 'error.png', fullPage: true });
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
