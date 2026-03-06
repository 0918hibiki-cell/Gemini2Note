import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. Geminiで記事を生成
async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
  
  // Hibikiさんの興味関心に基づいたプロンプト
  const prompt = "Write a short blog post in English about the intersection of Pharmaceutical Sciences and Mathematics. Focus on how logical modeling helps drug discovery. Keep it insightful for international students. Include a title at the top.";
  
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const lines = text.split('\n');
  return { title: lines[0].replace('# ', ''), body: lines.slice(1).join('\n') };
}

// 2. noteに投稿
(async () => {
  const { title, body } = await generateArticle();
  const browser = await chromium.launch();
  // Secretsからログイン情報を読み込む
  const storageState = JSON.parse(process.env.NOTE_STATE);
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();

  console.log("noteの投稿画面へ移動中...");
  await page.goto('https://note.com/posts/new');
  
  // タイトルと本文を入力
  await page.fill('.note-editor-title textarea', title);
  await page.fill('.note-common-editor__editable', body);
  
  // 下書き保存ボタンをクリック（保存されるまで少し待機）
  await page.click('button:has-text("保存")');
  await page.waitForTimeout(3000);
  
  console.log(`成功: 記事「${title}」を下書き保存しました。`);
  await browser.close();
})();
