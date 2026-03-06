import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  // 💡 リストで[使用可能]と確認できた、最新の安定モデルを指定します
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const prompt = `
    Write a sophisticated blog post in English. 
    Topic: The synergy between Pharmaceutical Sciences and Mathematical Logic in 2026. 
    Focus: How computational modeling accelerates drug discovery.
    Tone: Logical, academic, and insightful for international researchers.
    Requirement: The very first line of your response must be the title (no markdown # symbols).
  `;
  
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const lines = text.split('\n').filter(l => l.trim() !== "");
    
    // 最初の1行をタイトル、残りを本文として分離
    const title = lines[0].replace(/#/g, '').trim();
    const body = lines.slice(1).join('\n\n');
    return { title, body };
  } catch (e) {
    console.error("Gemini生成エラー:", e.message);
    throw e;
  }
}

(async () => {
  let browser;
  try {
    const { title, body } = await generateArticle();
    
    // ブラウザの起動（GitHub Actionsの環境用）
    browser = await chromium.launch();
    const storageState = JSON.parse(process.env.NOTE_STATE);
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    console.log("note投稿画面へ移動しています...");
    await page.goto('https://note.com/posts/new');
    
    // 要素が現れるのを待って入力
    await page.waitForSelector('.note-editor-title textarea');
    await page.fill('.note-editor-title textarea', title);
    
    await page.waitForSelector('.note-common-editor__editable');
    await page.fill('.note-common-editor__editable', body);
    
    console.log("下書きとして保存中...");
    await page.click('button:has-text("保存")');
    
    // 保存完了を確実にするため、少し長めに待機
    await page.waitForTimeout(10000);
    
    console.log(`🎉 完全成功！ noteに下書きが作成されました: ${title}`);
  } catch (e) {
    console.error("❌ 実行プロセス失敗:", e);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
