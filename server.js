import "dotenv/config";
import express from "express";
import OpenAI from "openai";

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json({ limit: "30kb" }));
app.use(express.static("public"));

app.post("/api/grade", async (req, res) => {
  const { sentence, answer, points } = req.body ?? {};
  if (
    typeof sentence !== "string" || typeof answer !== "string" ||
    !sentence.trim() || !answer.trim() ||
    !Array.isArray(points) || points.length < 1 || points.length > 8 ||
    points.some((point) => typeof point !== "string")
  ) {
    return res.status(400).json({ error: "英文・日本語訳・攻略ポイントを確認してください。" });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "サーバーにOPENAI_API_KEYが設定されていません。.envを設定してください。" });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `あなたは高校生向け英語長文読解ゲームの採点AIです。
日本語訳を模範訳との文字列一致ではなく意味で評価し、自然な言い換えは正解として認めてください。
主語・動作・否定・時制・逆接・理由など意味を左右する要素を確認してください。
攻略ポイントごとに0〜20点で採点。十分理解できていれば20点、一部曖昧なら部分点、誤読なら低得点。
主語や否定など重大な誤読があれば criticalError を true にしてください。
理解不足の場合、最初は答えを言わず、考え直すための短い日本語ヒントを出してください。全て理解できていれば hint は空文字。
次のJSON形式だけを返してください：
{"items":[{"point":"攻略ポイント","score":0,"feedback":"判定理由"}],"criticalError":false,"hint":"再挑戦用ヒント","modelTranslation":"自然な日本語訳","overallFeedback":"全体への短いコメント"}
itemsは入力された攻略ポイントと同じ数・同じ順番にしてください。`
        },
        { role: "user", content: JSON.stringify({ sentence, answer, points }) }
      ]
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("AIから採点結果を受け取れませんでした。");
    const result = JSON.parse(raw);
    if (!Array.isArray(result.items) || result.items.length !== points.length) {
      throw new Error("採点結果の形式が正しくありません。");
    }
    const items = result.items.map((item, index) => ({
      point: points[index],
      score: Math.max(0, Math.min(20, Math.round(Number(item.score) || 0))),
      feedback: String(item.feedback || "")
    }));
    const total = items.reduce((sum, item) => sum + item.score, 0);
    const score = result.criticalError ? Math.min(total, 89) : total;
    res.json({
      score, items,
      criticalError: Boolean(result.criticalError),
      hint: String(result.hint || ""),
      modelTranslation: String(result.modelTranslation || ""),
      overallFeedback: String(result.overallFeedback || ""),
      cleared: score >= 90,
      perfect: score === 100
    });
  } catch (error) {
    console.error("Grading error:", error);
    res.status(500).json({ error: "採点中にエラーが起きました。時間をおいてもう一度試してください。" });
  }
});

app.listen(port, () => console.log(`ENGLISH QUEST is running at http://localhost:${port}`));
