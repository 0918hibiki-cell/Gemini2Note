import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
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
- Quotes/Dialogue/Quiz Restatement: Use "> " (with a space) at the start of every line you want to quote.
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
(Format strictly as follows for each of the 3 phrases. DO NOT use numbers like 1., 2., 3.)
**[English Phrase]（[Japanese Meaning]）**
[Short logical/scientific context or explanation in Japanese, 1-2 sentences.]

## 読解クイズ
(3-choice question in Japanese based on the story.)

--- PAID LINE ---
[有料エリア：ここから下は100円]

## 全文和訳
(Natural Japanese translation of the dialogue.)

## 重要語彙フルリスト
(Up to 7 phrases. Format strictly as: "1. **Word** : Meaning / Business usage tip". Do not use confusing numbering.)

## ロジカル・ディープダイブ
(Japanese column: Soft scientific/logical insight. No complex formulas.)

## クイズの解説
(First, restate the quiz question precisely using "> " at the beginning of the line.)
(Then, provide the logical reasoning for the correct answer.)
`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const lines = text.split('\n').filter(l => l.trim() !== "");
    
    const title = lines[0].replace(/[*#]/g, '').replace('タイトル：', '').trim();
    const bodyLines = lines.slice(1);
    
    console.log(`🤖 Gemini生成成功: ${title}`);
    return { title, bodyLines };
  } catch (e) {
    console.error("Gemini生成エラー:", e.message);
    throw e;
  }
}

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

    const titleArea = page.locator('h1[contenteditable="true"], .note-editor-title__input, textarea[placeholder*="タイトル"]').first();
    await titleArea.waitFor({ state: 'visible', timeout: 60000 });
    await page.waitForTimeout(3000);

    console.log("タイトルを入力中...");
    await titleArea.click();
    await page.keyboard.type(title, { delay: 50 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    console.log("本文を入力中（装飾トリガーを処理）...");
    
    let isFirstLine = true;
    let prevWasHeading = false; // 直前の行が見出しだったかどうかのフラグ

    for (const line of bodyLines) {
      const isHeading = line.match(/^##\s*(.*)/);
      const isQuote = line.match(/^>\s*(.*)/);

      // 行を打ち始める前の「Enter」の制御（ご指定のルールを完全適用）
      if (!isFirstLine) {
        if (prevWasHeading) {
          // 直前が見出しなら：追加のEnterは押さない（行末の1回のみで改行される）
        } else {
          // それ以外のすべての場合：追加でEnterを押し、空行を挟む（引用ブロックからの脱出も兼ねる）
          await page.keyboard.press('Enter');
        }
      }

      if (isHeading) {
        // 見出しの入力処理
        await page.keyboard.type('##');
        await page.keyboard.press('Space');
        await page.waitForTimeout(1000); // 変換待ち
        await page.keyboard.type(isHeading[1].trim(), { delay: 50 });
        prevWasHeading = true;
      } else if (isQuote) {
        // 引用の入力処理
        await page.keyboard.type('>');
        await page.keyboard.press('Space');
        await page.waitForTimeout(800); // 変換待ち
        await page.keyboard.type(isQuote[1].trim(), { delay: 10 });
        prevWasHeading = false;
      } else {
        // 平文の入力処理
        await page.keyboard.type(line, { delay: 10 });
        prevWasHeading = false;
      }

      // どのブロックであっても、打ち終わった後に必ず1回Enterを押す
      await page.keyboard.press('Enter');
      isFirstLine = false;
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
