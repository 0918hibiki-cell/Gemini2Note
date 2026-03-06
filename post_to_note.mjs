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
- Quotes/Dialogue: Use "> " (with a space) at the start of every line you want to quote.
- Bold: Use "**" to surround bold words (e.g., **word**). The script will parse this into actual bold text.
- Paid Line: Use "--- PAID LINE ---" as a separator.
- Title: First line should be the title ONLY (in Japanese, format: [Problem/Hook] × [Logic/Math/Science term]).

[Structure]
(Title in Japanese)

## はじめに
(Japanese Intro: Logical perspective on daily life or work).

## Today's Story
(Dialogue in English: Use "> " for each speaker's line. The speaker's name and the colon MUST be bolded, like "**Name:** ". Ensure the dialogue is engaging and relatable.)

## 最重要フレーズ Top 3
(Format strictly as follows. ONLY the first item should start with "1. ". Do NOT write "2. ", "3. " for the others. ONLY the English phrase should be bolded.)
1. **[English Phrase]**: [Japanese Meaning] / [Short logical/scientific context or explanation in Japanese, 1-2 sentences]
**[English Phrase]**: [Japanese Meaning] / [Short logical/scientific context or explanation in Japanese, 1-2 sentences]
**[English Phrase]**: [Japanese Meaning] / [Short logical/scientific context or explanation in Japanese, 1-2 sentences]

## 読解クイズ
(3-choice question in Japanese based on the story. Use A, B, C for the choices. The question text MUST be bolded.)
**[Question text]**
A. [Choice A text]
B. [Choice B text]
C. [Choice C text]

--- PAID LINE ---
[有料エリア：ここから下は100円]

## 全文和訳
(Natural Japanese translation of the dialogue. Use "> " for each speaker's line. The speaker's name and the colon MUST be bolded, like "**Name:** ", to match the English format.)

## 重要語彙フルリスト
(Up to 7 phrases. MUST be completely different from the phrases used in "最重要フレーズ Top 3". Do not overlap. Format strictly as follows. ONLY the first item should start with "1. ". Do NOT write "2. ", "3. " etc. for the others. ONLY the English word should be bolded.)
1. **[English Word]**: [Japanese Meaning] / [Business usage tip or example in Japanese]
**[English Word]**: [Japanese Meaning] / [Business usage tip or example in Japanese]
(Continue for up to 7 words, without typing numbers for them...)

## ロジカル・ディープダイブ
(Japanese column: Soft scientific/logical insight. No complex formulas.)

## クイズの解説
(Format strictly as follows. Restate the question and choices using "> ". The question text MUST be bolded.)
> **[Question text]**
> A. [Choice A text]
> B. [Choice B text]
> C. [Choice C text]

**正解は [Correct Letter]. [Correct Choice Text]** です。
[Provide the logical reasoning for the correct answer in plain text without bold.]
`;

  try {
    const result = await model.generateContent(prompt);
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

async function typeWithBold(page, text) {
  const parts = text.split('**');
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1 && parts[i].length > 0) {
      await page.keyboard.down('Control');
      await page.keyboard.press('b');
      await page.keyboard.up('Control');
      await page.waitForTimeout(50);
      
      await page.keyboard.type(parts[i], { delay: 10 });
      
      await page.keyboard.down('Control');
      await page.keyboard.press('b');
      await page.keyboard.up('Control');
      await page.waitForTimeout(50);
    } else if (parts[i].length > 0) {
      await page.keyboard.type(parts[i], { delay: 10 });
    }
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

    console.log("本文を入力中...");
    
    let isInQuote = false;

    for (let i = 0; i < bodyLines.length; i++) {
      const line = bodyLines[i];
      const isHeading = line.match(/^##\s*(.*)/);
      const isQuote = line.match(/^>\s*(.*)/);

      if (isInQuote && !isQuote) {
        await page.keyboard.press('Enter'); 
        await page.waitForTimeout(500);
        isInQuote = false;
      }

      if (isHeading) {
        await page.keyboard.type('## ');
        await page.waitForTimeout(1000);
        await typeWithBold(page, isHeading[1].trim());
        await page.keyboard.press('Enter');
      } else if (isQuote) {
        if (!isInQuote) {
          await page.keyboard.type('> ');
          await page.waitForTimeout(800);
          isInQuote = true; 
        }
        await typeWithBold(page, isQuote[1].trim());
        await page.keyboard.press('Enter');
      } else if (line === '') {
        await page.keyboard.press('Enter');
      } else {
        await typeWithBold(page, line);
        await page.keyboard.press('Enter');
      }
    }

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
