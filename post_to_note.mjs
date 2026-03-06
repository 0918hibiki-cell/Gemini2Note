import { GoogleGenerativeAI } from "@google/generative-ai";

(async () => {
  console.log("--- API Key Connectivity Check ---");
  try {
    // 1. APIから利用可能なモデルのリストを直接取得する
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const data = await response.json();

    if (data.error) {
      console.error("❌ API Error:", data.error.message);
      return;
    }

    console.log("--- 稲福さんのキーで利用可能なモデル一覧 ---");
    data.models.forEach(m => {
      // 投稿に使える「generateContent」をサポートしているモデルだけを表示
      if (m.supportedGenerationMethods.includes("generateContent")) {
        console.log(`[使用可能]: ${m.name.replace("models/", "")}`);
      }
    });
    console.log("-----------------------------------------");
    console.log("上記の中から、もっとも『Flash』に近い名前を選んで次に進みます。");

  } catch (error) {
    console.error("❌ 通信エラー:", error.message);
  }
})();
