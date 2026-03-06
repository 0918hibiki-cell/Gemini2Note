import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

async function generateArticle() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = `Write a sophisticated blog post in English. Topic: The synergy between Pharmaceutical Sciences and Mathematical Logic. Title on the first line. No markdown.`;
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const lines = text.split('\n').filter(l => l.trim() !== "");
  const title = lines[0].replace(/[*#]/g, '').trim();
  const body = lines.slice(1).join('\n\n');
  console.log(`🤖 Gemini生成成功: ${title}`);
  return { title, body };
}

(async () => {
  let browser;
  let page;
  try {
    const { title, body } = await generateArticle();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ 
      storageState: JSON.parse(process.env.NOTE_STATE),
      // 💡 人間らしく見せるためのUser-Agent設定
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 1000 } 
    });
    page = await context.newPage();

    // 1. まずはトップページへ行き、セッションを「温める」
    console.log("noteトップページへ移動中...");
    await page.goto('https://note.com/', { waitUntil: 'networkidle', timeout: 60000 });
    
    // ログイン状態（ユーザーアイコンなど）が出るまで少し待つ
    await page.waitForTimeout(5000);

    // 2. トップページから「投稿」をクリックして遷移を開始（直接URLを叩かない）
    console.log("トップページからエディタへ遷移を開始...");
    const postButton = page.locator('header button[aria-label="投稿"], .a-split-button__right').first();
    await postButton.click();
    await page.waitForTimeout(2000);
    
    const textOption = page.locator('a[href*="notes/new"], .o-navbarPrimary__postingButton').first();
    await textOption.click();

    // 3. 「3つの点」が消えるまで粘り強く待機
    console.log("エディタの起動を待機中（3つの点が消えるのを待ちます）...");
    
    // 💡 修正の核心：タイトルの入力欄が現れるまで、最大90秒待つ
    const titleArea = page.locator('h1[contenteditable="true"], .note-editor-title__input, textarea[placeholder*="タイトル"]').first();
    
    // タイムアウトを長めに設定し、その間3つの点がどうなっているか監視
    await titleArea.waitFor({ state: 'visible', timeout: 90000 });
    console.log("エディタの起動を確認しました。");

    // 4. 入力シーケンス
    await page.waitForTimeout(3000);
    await titleArea.click();
    await page.keyboard.type(title, { delay: 50 });
    
    await page.keyboard.press('Tab'); 
    await page.waitForTimeout(1000);
    await page.keyboard.type(body, { delay: 10 });
    
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'input_check.png' });

    // 5. 保存
    console.log("保存中...");
    await page.keyboard.down('Control');
    await page.keyboard.press('s');
    await page.keyboard.up('Control');
    
    const saveButton = page.locator('.n-button--variant-primary, button:has-text("保存")').first();
    if (await saveButton.isVisible()) await saveButton.click({ force: true });

    await page.waitForTimeout(15000); 
    await page.screenshot({ path: 'final_check.png' });
    console.log(`🎉 成功: ${title}`);

  } catch (e) {
    console.error("❌ エラー:", e.message);
    if (page) await page.screenshot({ path: 'error.png', fullPage: true });
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
