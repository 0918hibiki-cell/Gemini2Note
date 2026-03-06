import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';

const WEBHOOK_URL = process.env.GAS_WEBHOOK_URL;

// 💡 1. GASから過去のデータを取得する（重複回避）
async function fetchPastData() {
  if (!WEBHOOK_URL) return { topics: [], phrases: [] };
  try {
    const res = await fetch(WEBHOOK_URL);
    return await res.json();
  } catch (e) {
    console.log("⚠️ 過去データの取得に失敗しました。スキップします。");
    return { topics: [], phrases: [] };
  }
}

// 💡 2. 記事生成
async function generateArticle(pastData) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  // 安定の gemini-2.5-flash で固定
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const pastTopicsStr = pastData.topics.join(', ');
  const pastPhrasesStr = pastData.phrases.join(', ');

  // 👇 省略してしまった詳細なフォーマットルールを完全に復元しました
  const prompt = `
Role: Logic Link English Coach (Sophisticated, insightful, and encouraging).
Target: Japanese business people (Beginner-Intermediate).

[CRITICAL INSTRUCTION FOR UNIQUENESS]
Do NOT use any of the following past topics: ${pastTopicsStr || "None yet"}
Do NOT use any of the following past English phrases/words: ${pastPhrasesStr || "None yet"}

[Topic Selection Rule]
Select one NEW topic from:
- Pharmacy Lite: (e.g., Placebo effect, Half-life of skills, Concentration of effort).
- Math/Logic: (e.g., False positives in business, Compound interest of habits).
- Personal Story: (e.g., Solving problems with logic in team management, Resilience in research).
*Make it interesting and relatable, not just dry business.*

[Formatting Rules for note.com]
- Headings: Use "## " (with a space) at the start of the line.
- Quotes/Dialogue: Use "> " (with a space) at the start of every line you want to quote.
- Bold: Use "**" to surround bold words (e.g., **word**). The script will parse this into actual bold text.
- Paid Line: Use "--- PAID LINE ---" as a separator.
- Title: First line should be the title ONLY. Use a compelling question format in Japanese (e.g., "なぜ「プラセボ効果」が英語の習得を加速させるのか？"). Do NOT use brackets like [ ] or ×.

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

## 【コラム】[Generate an insightful Japanese title for this column]
(Japanese column: Soft scientific/logical insight. No complex formulas.)

## クイズの解説
(Format strictly as follows. Restate the question and choices using "> ". The question text MUST be bolded.)
> **[Question text]**
> A. [Choice A text]
> B. [Choice B text]
> C. [Choice C text]

**正解は [Correct Letter]. [Correct Choice Text]** です。
[Provide the logical reasoning for the correct answer in plain text without bold.]

--- SYSTEM METADATA ---
META_TOPIC: [Generate a short 1-2 word tag for today's topic, e.g., 偽陽性, 複利効果]
META_PHRASES: [Comma separated list of ALL English phrases/words taught today]
HASHTAGS: [Generate 5 relevant hashtags in Japanese separated by spaces, starting with #]
`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().replace(/\r/g, '');
    const lines = text.split('\n').map(l => l.trim());
    
    const title = lines[0].replace(/[*#]/g, '').replace('タイトル：', '').trim();
    
    // 💡 メタデータの抽出処理
    const metaIndex = lines.findIndex(l => l.startsWith('--- SYSTEM METADATA ---'));
    let bodyEndIndex = lines.length;
    let metaTopic = "", metaPhrases = "", hashtagsStr = "";
    
    if (metaIndex !== -1) {
      bodyEndIndex = metaIndex;
      for (let i = metaIndex + 1; i < lines.length; i++) {
        if (lines[i].startsWith('META_TOPIC:')) metaTopic = lines[i].replace('META_TOPIC:', '').trim();
        if (lines[i].startsWith('META_PHRASES:')) metaPhrases = lines[i].replace('META_PHRASES:', '').trim();
        if (lines[i].startsWith('HASHTAGS:')) hashtagsStr = lines[i].replace('HASHTAGS:', '').trim();
      }
    }
    
    // 固定タグとAI生成タグの合体
    const presetTags = ['#英語学習', '#ビジネス英語', '#ロジカルシンキング', '#大人の勉強垢'];
    const aiTags = hashtagsStr.split(/\s+/).filter(t => t.startsWith('#'));
    const hashtags = [...new Set([...presetTags, ...aiTags])];

    // Today's Storyの抽出（スプレッドシートへの記録用）
    let storyLines = [];
    let isStory = false;
    for (let i = 1; i < bodyEndIndex; i++) {
      if (lines[i].startsWith("## Today's Story")) {
        isStory = true;
        continue;
      }
      if (isStory && lines[i].startsWith("## ")) {
        isStory = false;
      }
      if (isStory) {
        storyLines.push(lines[i]);
      }
    }
    const storyText = storyLines.join('\n').trim();

    // 本文の抽出
    const bodyLines = lines.slice(1, bodyEndIndex);
    
    console.log(`🤖 Gemini生成成功: ${title}`);
    return { title, bodyLines, hashtags, metaTopic, metaPhrases, storyText };
  } catch (e) {
    console.error("Gemini生成エラー:", e.message);
    throw e;
  }
}

// 💡 太字制御付きタイピング関数（最も安定していたバージョン）
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

// 💡 3. メイン処理（noteへの書き込み ＋ GASへの送信）
(async () => {
  let browser;
  let page;
  try {
    const pastData = await fetchPastData();
    const { title, bodyLines, hashtags, metaTopic, metaPhrases, storyText } = await generateArticle(pastData);
    
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

    if (hashtags && hashtags.length > 0) {
      console.log("ハッシュタグを入力中...");
      await page.keyboard.press('Enter'); 
      for (const tag of hashtags) {
        await page.keyboard.type(tag, { delay: 50 });
        await page.keyboard.press('Enter'); 
        await page.waitForTimeout(500);
      }
    }

    console.log("保存中...");
    await page.keyboard.down('Control');
    await page.keyboard.press('s');
    await page.keyboard.up('Control');
    await page.waitForTimeout(10000);
    
    // 💡 GASへリクエストを送信し、スプレッドシート記録とLINE通知を実行
    if (WEBHOOK_URL) {
      console.log("GASへデータを送信中...");
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: "成功 🎉",
          title_text: title,
          topic: metaTopic,
          phrases: metaPhrases,
          hashtags: hashtags.join(' '),
          story: storyText
        })
      });
    }

    console.log(`🎉 完了しました！: ${title}`);
  } catch (e) {
    console.error("❌ 失敗:", e.message);
    if (page) await page.screenshot({ path: 'error_fallback.png', fullPage: true });
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
