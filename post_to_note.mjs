import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. Geminiで記事を生成（エラーハンドリングを強化）
async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  // 2026年時点で最も安定しているモデルを指定（新しいキーなら2.0が通るはずです）
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  
  const prompt = `
    Write a short, insightful blog post in English. 
    Topic: The intersection of Pharmaceutical Sciences and Mathematical Modeling in 2026.
    Target: International students and researchers.
    Format: Start with the title on the first line, followed by the body. 
    Tone: Professional yet engaging, reflecting a logical and scientific perspective.
  `;
  
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    
    // Markdownの装飾（# タイトル）などを取り除く処理
    const lines = text.split('\n').filter(line => line.trim() !== "");
    const title = lines[0].replace(/#/g, '').trim();
    const body = lines.slice(1).join('\n\n');
    
    return { title, body };
  } catch (error) {
    console.error("Gemini生成エラー:", error.message);
    throw error;
  }
}

// 2. noteに投稿
(async () => {
  let browser;
  try {
    const { title, body } = await generateArticle();
    
    // ブラウザの起動（GitHub Actions上で動くための設定）
    browser = await chromium.launch({ headless: true });
    const storageState = JSON.parse(process.env.NOTE_STATE);
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    console.log("noteの投稿画面へ移動中...");
    await page.goto('https://note.com/posts/new');
    
    // タイトルと本文を入力（確実に要素が現れるまで待機）
    await page.waitForSelector('.note-editor-title textarea');
    await page.fill('.note-editor-title textarea', title);
    
    await page.waitForSelector('.note-common-editor__editable');
    await page.fill('.note-common-editor__editable', body);
    
    // 下書き保存ボタンをクリック
    console.log("下書きを保存しています...");
    await page.click('button:has-text("保存")');
    
    // 保存完了の目安として少し待機
    await page.waitForTimeout(5000);
    
    console.log(`✅ 成功: 記事「${title}」を下書き保存しました！`);
  } catch (error) {
    console.error("❌ 実行失敗:", error);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
