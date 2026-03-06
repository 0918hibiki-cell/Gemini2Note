import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. Gemini 2.5 Flashを使用して記事を生成
async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  // リストで「使用可能」と確認された最新モデル
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
    const title = lines[0].replace(/[*#]/g, '').trim();
    const body = lines.slice(1).join('\n\n');
    
    console.log(`🤖 Geminiが記事を執筆しました: ${title}`);
    return { title, body };
  } catch (e) {
    console.error("Gemini生成エラー:", e.message);
    throw e;
  }
}

// 2. Playwrightを使用してnoteに投稿
(async () => {
  let browser;
  let page;
  try {
    // 記事生成
    const { title, body } = await generateArticle();
    
    // ブラウザ起動
    browser = await chromium.launch({ headless: true });
    const storageState = JSON.parse(process.env.NOTE_STATE);
    const context = await browser.newContext({ storageState });
    page = await context.newPage();

    // 404を避けるため、直接投稿画面ではなくトップページから入る
    console.log("noteトップページへ移動中...");
    await page.goto('https://note.com/', { waitUntil: 'networkidle' });

    // ログイン状態を確認（error.pngの解析に基づきアイコンの存在をチェック）
    console.log("「投稿」ボタンをクリックしています...");
    // 投稿ボタン（ペンマーク）をクリック
    const postButton = page.locator('.o-noteHeader__postButton, button:has-text("投稿")');
    await postButton.waitFor({ state: 'visible', timeout: 15000 });
    await postButton.click();

    // 「テキスト」を選択
    console.log("「テキスト」形式を選択中...");
    const textOption = page.locator('a:has-text("テキスト"), [data-type="text"]');
    await textOption.waitFor({ state: 'visible', timeout: 10000 });
    await textOption.click();

    // エディタの読み込みを待機
    console.log("エディタを起動しています...");
    const titleSelector = 'textarea[placeholder*="タイトル"]';
    await page.waitForSelector(titleSelector, { timeout: 30000 });

    // タイトルと本文を入力
    await page.fill(titleSelector, title);
    await page.fill('.note-common-editor__editable', body);
    console.log("タイトルと本文の入力が完了しました。");

    // 下書き保存
    console.log("下書きとして保存中...");
    await page.click('button:has-text("保存")');
    
    // 保存処理の完了待機
    await page.waitForTimeout(10000);
    
    console.log(`🎉 ミッション完了！ noteに下書きが保存されました: ${title}`);

  } catch (e) {
    console.error("❌ 実行プロセス失敗:", e.message);
    if (page) {
      // 失敗時の証拠を画像で残す（GitHub ActionsのArtifactsで確認可能）
      await page.screenshot({ path: 'error.png', fullPage: true });
      console.log("📸 デバッグ用スクリーンショット 'error.png' を作成しました。");
    }
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
