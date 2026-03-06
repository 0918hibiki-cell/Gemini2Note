import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * 1. 記事生成関数：Logic Link English Coach モード
 * 構成、有料ライン、装飾タグ（##, >）を厳密に制御します。
 */
async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  // 安定動作が確認されている2026年現在の最新モデルを指定
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `
Role: Logic Link English Coach (Sophisticated, insightful, and encouraging).
Target: Japanese business people (Beginner-Intermediate).

[Topic Selection Rule]
Select one topic from:
- Pharmacy Lite: (e.g., Placebo effect, Half-life of skills, Concentration of effort).
- Math/Logic: (e.g., False positives in business, Compound interest of habits).
- Personal Story: (e.g., Solving problems with logic in team management, Resilience in research).
*Make it interesting and relatable, not just dry business.*

[Formatting Rules for note.com]
- Headings: Use "## " (with a space) at the start of the line.
- Quotes/Dialogue: Use "> " (with a space) at the start of every line of dialogue.
- Bold: Use "**" to surround bold words (e.g., **word**).
- Paid Line: Use "--- PAID LINE ---" as a separator.
- Title: First line should be the title ONLY (in Japanese, format: [Problem/Hook] × [Logic/Math/Science term]).

[Structure]
(Title in Japanese)

## はじめに
(Japanese Intro: Logical perspective on daily life or work).

## Today's Story
(Dialogue in English: Use "> " for each speaker's line. Ensure the dialogue is engaging and relatable.)

## 最重要フレーズ Top 3
(3 key phrases with Japanese meanings and short logical context.)

## 読解クイズ
(3-choice question in Japanese based on the story.)

--- PAID LINE ---
[有料エリア：ここから下は100円]

## 全文和訳
(Natural Japanese translation of the dialogue.)

## 重要語彙フルリスト
(Up to 7 phrases including usage tips for business.)

## ロジカル・ディープダイブ
(Japanese column: Soft scientific/logical insight. No complex formulas.)

## クイズの解説
(Logical reasoning for the correct answer.)
`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    // 空行を排除しつつパース
    const lines = text.split('\n').filter(l => l.trim() !== "");
    
    // 1行目をタイトルとして抽出（マークダウン記号などを除去）
    const title = lines[0].replace(/[*#]/g, '').replace('タイトル：', '').trim();
    const bodyLines = lines.slice(1);
    
    console.log(`🤖 Gemini生成成功: ${title}`);
    return { title, bodyLines };
  } catch (e) {
    console.error("Gemini生成エラー:", e.message);
    throw e;
  }
}

/**
 * 2. 投稿実行ブロック：人間らしい入力シーケンス
 */
(async () => {
  let browser;
  let page;
  try {
    const { title, bodyLines } = await generateArticle();
    
    browser = await chromium.launch({ headless: true });
    const storageState = JSON.parse(process.env.NOTE_STATE);
    const context = await browser.newContext({
      storageState,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 1000 }
    });
    
    page = await context.newPage();
    console.log("エディタへ移動中...");
    await page.goto('https://note.com/notes/new?type=text', { waitUntil: 'networkidle', timeout: 60000 });

    // ロード完了を待機
    const titleArea = page.locator('h1[contenteditable="true"], .note-editor-title__input, textarea[placeholder*="タイトル"]').first();
    await titleArea.waitFor({ state: 'visible', timeout: 60000 });
    await page.waitForTimeout(3000);

    // タイトル入力
    console.log("タイトルを入力中...");
    await titleArea.click();
    await page.keyboard.type(title, { delay: 50 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    console.log("本文を入力中（装飾トリガーを処理）...");
    for (const line of bodyLines) {
      if (line.startsWith('## ')) {
        // 💡 見出しの前：2回Enterで確実にブロックを分離
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        
        await page.keyboard.type('## ', { delay: 100 });
        await page.waitForTimeout(1000); // noteエディタの見出し変換待ち
        await page.keyboard.type(line.replace('## ', ''));
        
        // 💡 見出しの後：2回Enterで平文へ戻す
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        
      } else if (line.startsWith('> ')) {
        // 💡 引用の開始
        await page.keyboard.type('> ', { delay: 100 });
        await page.waitForTimeout(800); // noteエディタの引用ブロック変換待ち
        await page.keyboard.type(line.replace('> ', ''));
        await page.keyboard.press('Enter');
        
      } else {
        // 通常のテキスト入力
        await page.keyboard.type(line, { delay: 10 });
        await page.keyboard.press('Enter');
      }
    }

    console.log("保存中...");
    await page.keyboard.down('Control');
    await page.keyboard.press('s');
    await page.keyboard.up('Control');
    await page.waitForTimeout(10000);
    
    console.log(`🎉 完了しました！: ${title}`);
  } catch (e) {
    console.error("❌ 失敗:", e.message);
    if (page) await page.screenshot({ path: 'error_fallback.png', fullPage: true });
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
