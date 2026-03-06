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
(Format strictly as follows. Do not use numbers. Do not insert empty lines between the phrase and its explanation.)
**[English Phrase]（[Japanese Meaning]）**
[Short logical/scientific context or explanation in Japanese, 1-2 sentences.]

## 読解クイズ
(3-choice question in Japanese based on the story. Include the question and 3 options.)

--- PAID LINE ---
[有料エリア：ここから下は100円]

## 全文和訳
(Natural Japanese translation of the dialogue. Use "> " for each speaker's line to match the English format.)

## 重要語彙フルリスト
(Up to 7 phrases. Format strictly as follows. Do not use numbers. Do not insert empty lines between the word and its tip.)
**[English Word] : [Japanese Meaning]**
[Business usage tip or example in Japanese.]

## ロジカル・ディープダイブ
(Japanese column: Soft scientific/logical insight. No complex formulas.)

## クイズの解説
(First, restate the quiz question AND ALL 3 CHOICES precisely using "> " at the beginning of each line.)
> [Question text]
> [Choice 1]
> [Choice 2]
> [Choice 3]

(Then, provide the logical reasoning for the correct answer.)
`;

  try {
    const result = await model.generateContent(prompt);
    // 改行コードを正規化し、AIが意図的に作った「空行」も配列として残す
    const text = result.response.text().trim().replace(/\r/g, '');
    const lines = text.split('\n').map(l => l.trim());
    
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
    
    let isInQuote = false;

    for (let i = 0; i < bodyLines.length; i++) {
      const line = bodyLines[i];
      const isHeading = line.match(/^##\s*(.*)/);
      const isQuote = line.match(/^>\s*(.*)/);

      // 💡 引用ブロックからの脱出（今の行が引用じゃないのに、引用モードに入っていたら抜ける）
      if (isInQuote && !isQuote) {
        await page.keyboard.press('Enter'); 
        await page.waitForTimeout(500);
        isInQuote = false;
      }

      if (isHeading) {
        await page.keyboard.type('## ');
        await page.waitForTimeout(1000); // 変換待ち
        await page.keyboard.type(isHeading[1].trim(), { delay: 50 });
        await page.keyboard.press('Enter');
      } else if (isQuote) {
        if (!isInQuote) {
          // 引用ブロックの開始
          await page.keyboard.type('> ');
          await page.waitForTimeout(800); // 変換待ち
          isInQuote = true;
        }
        // 既に引用ブロック内にいる場合は `> ` を省いてテキストだけ打ち込む（分断を防ぐ）
        await page.keyboard.type(isQuote[1].trim(), { delay: 10 });
        await page.keyboard.press('Enter');
      } else if (line === '') {
        // AIが生成した空行をそのままEnterとして反映
        await page.keyboard.press('Enter');
      } else {
        // 通常テキスト
        await page.keyboard.type(line, { delay: 10 });
        await page.keyboard.press('Enter');
      }
    }

    // 最後に引用が開きっぱなしなら閉じる
    if (isInQuote) {
      await page.keyboard.press('Enter');
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
