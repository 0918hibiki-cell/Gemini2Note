import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

const WEBHOOK_URL = process.env.GAS_WEBHOOK_URL;

// 💡 1. GASから過去のデータを取得する
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

// 💡 2. 記事生成（過去データを除外）
async function generateArticle(pastData) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const pastTopicsStr = pastData.topics.join(', ');
  const pastPhrasesStr = pastData.phrases.join(', ');

  const prompt = `
Role: Logic Link English Coach (Sophisticated, insightful, and encouraging).
Target: Japanese business people (Beginner-Intermediate).

[CRITICAL INSTRUCTION FOR UNIQUENESS]
Do NOT use any of the following past topics: ${pastTopicsStr || "None yet"}
Do NOT use any of the following past English phrases/words: ${pastPhrasesStr || "None yet"}

[Topic Selection Rule]
Select one NEW topic from: Pharmacy Lite, Math/Logic, or Personal Story.

[Formatting Rules for note.com]
- Headings: Use "## "
- Quotes/Dialogue: Use "> "
- Bold: Use "**word**"
- Paid Line: Use "--- PAID LINE ---"
- Title: First line should be the title ONLY (compelling question format, no brackets).

[Structure]
(Title in Japanese)

## はじめに
(Intro)

## Today's Story
(Dialogue in English. Bold name and colon: "**Name:** ")

## 最重要フレーズ Top 3
1. **[English Phrase]**: [Japanese] / [Explanation]
**[Phrase]**: [Japanese] / [Explanation]
**[Phrase]**: [Japanese] / [Explanation]

## 読解クイズ
**[Question text]**
A. [Choice A]
B. [Choice B]
C. [Choice C]

--- PAID LINE ---
[有料エリア：ここから下は100円]

## 全文和訳
(Translation. Bold name and colon: "**Name:** ")

## 重要語彙フルリスト
1. **[Word]**: [Japanese] / [Tip]
**[Word]**: [Japanese] / [Tip]
(Up to 7 words)

## 【コラム】[Insightful Title]
(Column)

## クイズの解説
> **[Question text]**
> A. [Choice A]
> B. [Choice B]
> C. [Choice C]

**正解は [Correct Letter]. [Correct Choice Text]** です。
[Explanation in plain text]

--- SYSTEM METADATA ---
META_TOPIC: [Generate a short 1-2 word tag for today's topic, e.g., 偽陽性, 複利効果]
META_PHRASES: [Comma separated list of ALL English phrases/words taught today]
HASHTAGS: [Generate 5 hashtags starting with #]
`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().replace(/\r/g, '');
    const lines = text.split('\n').map(l => l.trim());
    
    const title = lines[0].replace(/[*#]/g, '').trim();
    
    // メタデータの抽出
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
    
    // ハッシュタグの合体
    const presetTags = ['#英語学習', '#ビジネス英語', '#ロジカルシンキング', '#大人の勉強垢'];
    const aiTags = hashtagsStr.split(/\s+/).filter(t => t.startsWith('#'));
    const hashtags = [...new Set([...presetTags, ...aiTags])];

    // Today's Storyの抽出（スプレッドシート用）
    let storyLines = [];
    let isStory = false;
    for (let i = 1; i < bodyEndIndex; i++) {
      if (lines[i].startsWith("## Today's Story")) { isStory = true; continue; }
      if (isStory && lines[i].startsWith("## ")) { isStory = false; }
      if (isStory) storyLines.push(lines[i]);
    }
    const storyText = storyLines.join('\n').trim();

    const bodyLines = lines.slice(1, bodyEndIndex);
    
    console.log(`🤖 Gemini生成成功: ${title}`);
    return { title, bodyLines, hashtags, metaTopic, metaPhrases, storyText };
  } catch (e) {
    console.error("Gemini生成エラー:", e.message);
    throw e;
  }
}

async function typeWithBold(page, text) {
  const parts = text.split('**');
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1 && parts[i].length > 0) {
      await page.keyboard.down('Control'); await page.keyboard.press('b'); await page.keyboard.up('Control');
      await page.waitForTimeout(50);
      await page.keyboard.type(parts[i], { delay: 10 });
      await page.keyboard.down('Control'); await page.keyboard.press('b'); await page.keyboard.up('Control');
      await page.waitForTimeout(50);
    } else if (parts[i].length > 0) {
      await page.keyboard.type(parts[i], { delay: 10 });
    }
  }
}

// 💡 3. メイン処理とGASへのデータ送信
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
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      viewport: { width: 1280, height: 1000 }
    });
    
    page = await context.newPage();
    console.log("エディタへ移動中...");
    await page.goto('https://note.com/notes/new?type=text', { waitUntil: 'networkidle', timeout: 60000 });

    const titleArea = page.locator('h1[contenteditable="true"], .note-editor-title__input, textarea[placeholder*="タイトル"]').first();
    await titleArea.waitFor({ state: 'visible', timeout: 60000 });
    await page.waitForTimeout(3000);

    await titleArea.click();
    await page.keyboard.type(title, { delay: 50 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    let isInQuote = false;
    for (let i = 0; i < bodyLines.length; i++) {
      const line = bodyLines[i];
      const isHeading = line.match(/^##\s*(.*)/);
      const isQuote = line.match(/^>\s*(.*)/);

      if (isInQuote && !isQuote) { await page.keyboard.press('Enter'); await page.waitForTimeout(500); isInQuote = false; }

      if (isHeading) {
        await page.keyboard.type('## '); await page.waitForTimeout(1000);
        await typeWithBold(page, isHeading[1].trim()); await page.keyboard.press('Enter');
      } else if (isQuote) {
        if (!isInQuote) { await page.keyboard.type('> '); await page.waitForTimeout(800); isInQuote = true; }
        await typeWithBold(page, isQuote[1].trim()); await page.keyboard.press('Enter');
      } else if (line === '') {
        await page.keyboard.press('Enter');
      } else {
        await typeWithBold(page, line); await page.keyboard.press('Enter');
      }
    }
    if (isInQuote) await page.keyboard.press('Enter');

    if (hashtags && hashtags.length > 0) {
      await page.keyboard.press('Enter'); 
      for (const tag of hashtags) {
        await page.keyboard.type(tag, { delay: 50 }); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
      }
    }

    await page.keyboard.down('Control'); await page.keyboard.press('s'); await page.keyboard.up('Control');
    await page.waitForTimeout(10000);
    
    // 💡 スプレッドシート記録 ＆ LINE通知をGASへリクエスト
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
