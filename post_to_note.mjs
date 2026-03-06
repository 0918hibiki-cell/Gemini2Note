import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const prompt = `
    Role: Logic Link English Coach (Logical, Insightful, and Empathetic).
    Target: Japanese business people (Beginner-Intermediate).
    
    [Content Strategy]
    - Intro: Empathetic Japanese. Blame the problem on a "Logic Bug".
    - Story: English Dialogue using "> ". Topic: Pharmacy/Math metaphors for business (e.g. Half-life, Compound interest).
    - Deep Dive: Japanese scientific insight (No complex math, use soft logical models).

    [Formatting Rules for note.com]
    - Headings: Use "## " (with a space).
    - Blockquote: Use "> " (with a space) for EACH line of dialogue.
    - Title: Japanese (Problem x Scientific Term) on line 1.
  `;
  
  const result = await model.generateContent(prompt);
  const lines = result.response.text().trim().split('\n').filter(l => l.trim() !== "");
  return { title: lines[0].replace(/[*#]/g, '').trim(), bodyLines: lines.slice(1) };
}

(async () => {
  let browser;
  let page;
  try {
    const { title, bodyLines } = await generateArticle();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: JSON.parse(process.env.NOTE_STATE) });
    page = await context.newPage();

    await page.goto('https://note.com/notes/new?type=text', { waitUntil: 'networkidle' });
    const titleArea = page.locator('h1[contenteditable="true"], .note-editor-title__input, textarea[placeholder*="タイトル"]').first();
    await titleArea.waitFor({ state: 'visible' });

    // タイトル入力
    await titleArea.click();
    await page.keyboard.type(title, { delay: 50 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    console.log("ダブル・エンター・プロトコルで入力中...");
    for (let i = 0; i < bodyLines.length; i++) {
      const line = bodyLines[i];
      const nextLine = bodyLines[i + 1] || "";

      if (line.startsWith('## ')) {
        // 見出し入力の前に改行を入れてブロックを分離
        await page.keyboard.press('Enter');
        await page.keyboard.type('## ', { delay: 100 });
        await page.waitForTimeout(700);
        await page.keyboard.type(line.replace('## ', ''));
        // 💡 稲福さんの発見：見出しの後は2回Enterで平文に戻る
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
      } 
      else if (line.startsWith('> ')) {
        await page.keyboard.type('> ', { delay: 100 });
        await page.waitForTimeout(400);
        await page.keyboard.type(line.replace('> ', ''));
        await page.keyboard.press('Enter');
        
        // 💡 稲福さんの発見：引用ブロックの最後は追加のEnterで平文に戻る
        if (!nextLine.startsWith('> ')) {
          await page.keyboard.press('Enter');
        }
      } 
      else {
        await page.keyboard.type(line);
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(300);
    }

    // 保存
    await page.keyboard.down('Control');
    await page.keyboard.press('s');
    await page.keyboard.up('Control');
    await page.waitForTimeout(10000);
    console.log(`🎉 完璧な体裁で保存完了: ${title}`);

  } catch (e) {
    console.error("❌ エラー:", e.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
