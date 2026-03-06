// ... (generateArticle 関数はそのまま)

(async () => {
  let browser;
  try {
    const { title, body } = await generateArticle();
    // headless: true で実行
    browser = await chromium.launch();
    const storageState = JSON.parse(process.env.NOTE_STATE);
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    console.log("note投稿画面へ移動中...");
    // ネットワークが落ち着くまで待機
    await page.goto('https://note.com/posts/new', { waitUntil: 'networkidle' });

    console.log(`現在のURL: ${page.url()}`);

    // 💡 タイトル入力欄を複数の候補で探す
    const titleSelectors = [
      'textarea[placeholder="タイトル"]',
      '.note-editor-title textarea',
      'textarea.note-editor-title__input'
    ];

    let titleField = null;
    for (const selector of titleSelectors) {
      try {
        titleField = await page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
        if (titleField) break;
      } catch (e) { continue; }
    }

    if (!titleField) throw new Error("タイトル入力欄が見つかりませんでした。UIが変更された可能性があります。");
    
    await titleField.fill(title);
    console.log("タイトルを入力しました。");

    // 💡 本文入力欄（contenteditableな要素）を探す
    await page.waitForSelector('.note-common-editor__editable', { timeout: 10000 });
    await page.fill('.note-common-editor__editable', body);
    console.log("本文を入力しました。");

    console.log("下書き保存中...");
    // 保存ボタンをクリック（明示的に text を指定）
    await page.click('button:has-text("保存")');
    
    // 完了を待つ
    await page.waitForTimeout(10000);
    console.log(`✅ 成功: ${title}`);

  } catch (e) {
    console.error("❌ 失敗:", e.message);
    // 💡 失敗時にページのHTML構造を少しだけ出力してデバッグしやすくする
    // console.log(await page.content()); 
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
