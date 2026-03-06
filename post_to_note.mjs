import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const prompt = `
    Write a professional blog post in English. 
    Topic: The synergy between Pharmaceutical Sciences and Mathematical Logic. 
    Focus: How computational modeling and logic accelerate drug discovery at Kyoto University.
    Requirement: The first line must be the title. No markdown.
  `;
  
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const lines = text.split('\n').filter(l => l.trim() !== "");
    const title = lines[0].replace(/[*#]/g, '').trim();
    const body = lines.slice(1).join('\n\n');
    console.log(`🤖 Gemini生成成功: ${title}`);
    return { title, body };
  } catch (e) {
    console.error("Gemini生成エラー:", e.message);
    throw e;
  }
}

(async () => {
  let browser;
  let page;
  try {
    const { title, body } = await generateArticle();
    
    browser = await chromium.launch({ headless: true });
    const storageState = JSON.parse(process.env.NOTE_STATE);
    const context = await browser.newContext({ 
      storageState,
      viewport: { width: 1280, height: 800 } 
    });
    page = await context.newPage();

    console.log("noteトップページへ移動中...");
    await page.goto('https://note.com/', { waitUntil: 'networkidle', timeout: 60000 });

    // 💡 画面上の「投稿」ボタン（ペンマーク）を、クラス名やテキストに関わらず「位置」で特定
    console.log("「投稿」ボタンをクリックしています...");
    
    // ヘッダー内のボタン要素をすべて取得し、その中から「投稿」を含むもの、
    // またはヘッダー右側の特定のボタンを狙い撃ちします
    const postButton = page.locator('header button, header .o-noteHeader__postButton').filter({ 
      hasText: /投稿/ 
    }).first();

    // 予備：もし見つからない場合は、リンク先URLで直接探す
    const postLinkFallback = page.locator('header a[href*="/posts/new"]').first();

    if (await postButton.isVisible()) {
      await postButton.click({ force: true, delay: 500 });
    } else {
      await postLinkFallback.click({ force: true, delay: 500 });
    }

    // メニュー表示を待つ
    await page.waitForTimeout(3000);

    // 💡 「テキスト」選択も、URLの末尾が type=text であるものを狙う
    console.log("「テキスト」形式を選択中...");
    const textOption = page.locator('a[href*="type=text"]').first();
    await textOption.click({ force: true });

    // エディタ画面への遷移を確実に待つ
    console.log("エディタの読み込みを待機中...");
    await page.waitForURL(/posts\/new/, { timeout: 30000 });
    
    // タイトルと本文を入力
    const titleArea = page.locator('.note-editor-title__input, textarea[placeholder*="タイトル"]').first();
    await titleArea.waitFor({ state: 'visible', timeout: 20000 });
    await titleArea.fill(title);
    
    const bodyArea = page.locator('.note-common-editor__editable').first();
    await bodyArea.fill(body);
    console.log("記事の内容を入力しました。");

    // 保存（プライマリボタンとして特定）
    console.log("下書きとして保存中...");
    const saveButton = page.locator('button.n-button--primary, button:has-text("保存")').first();
    await saveButton.click();
    
    await page.waitForTimeout(10000);
    
    console.log(`🎉 完全成功！ noteに下書きが届きました: ${title}`);

  } catch (e) {
    console.error("❌ 最終失敗:", e.message);
    if (page) {
      await page.screenshot({ path: 'error.png', fullPage: true });
      // デバッグ用にHTML構造も一部出力
      const html = await page.evaluate(() => document.querySelector('header')?.innerHTML);
      console.log("Header HTML Snippet:", html);
    }
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
