import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. Geminiで記事を生成する関数（ここが定義部分です）
async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  // 診断で「使用可能」と出たモデル名
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const prompt = `
    Write an insightful blog post in English. 
    Topic: How mathematical logic and computational modeling are transforming pharmaceutical discovery in 2026. 
    Focus: The synergy between the Kyoto University style of research and modern data science.
    Requirement: The first line must be the title. No markdown # symbols.
  `;
  
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const lines = text.split('\n').filter(l => l.trim() !== "");
    const title = lines[0].replace(/#/g, '').trim();
    const body = lines.slice(1).join('\n\n');
    
    console.log(`🤖 Gemini生成成功: ${title}`);
    return { title, body };
  } catch (e) {
    console.error("Gemini生成エラー:", e.message);
    throw e;
  }
}

// 2. メインの投稿処理
(async () => {
  let browser;
  try {
    // 記事生成
    const { title, body } = await generateArticle();
    
    browser = await chromium.launch();
    const storageState = JSON.parse(process.env.NOTE_STATE);
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    console.log("note投稿画面へ移動中...");
    // ネットワークが落ち着くまで待機（重要）
    await page.goto('https://note.com/posts/new', { waitUntil: 'networkidle' });

    console.log(`現在のURL: ${page.url()}`);
    if (page.url().includes('login')) {
      throw new Error("ログインが切れています。NOTE_STATEを更新してください。");
    }

    // タイトル入力欄を複数の方法で探す（堅牢化）
    const titleSelectors = [
      'textarea[placeholder="タイトル"]',
      '.note-editor-title textarea',
      'textarea.note-editor-title__input'
    ];

    let titleField = null;
    for (const selector of titleSelectors) {
      try {
        titleField = await page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
        if (titleField) break;
      } catch (e) { continue; }
    }

    if (!titleField) throw new Error("タイトル入力欄が見つかりません。");
    
    await titleField.fill(title);
    console.log("タイトル入力完了。");

    // 本文入力
    await page.waitForSelector('.note-common-editor__editable', { timeout: 10000 });
    await page.fill('.note-common-editor__editable', body);
    console.log("本文入力完了。");

    console.log("下書き保存中...");
    await page.click('button:has-text("保存")');
    
    // 保存完了を待つ
    await page.waitForTimeout(10000);
    console.log(`🎉 成功: ${title}`);

  } catch (e) {
    console.error("❌ 失敗:", e.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
