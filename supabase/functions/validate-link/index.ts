// Judges whether a submitted chain word forms a valid compound word / common
// two-word phrase with the previous word. Runs after the word is already in
// the chain (see src/supabase/round.ts checkLink) — never blocks submission.
// Deploy: `supabase functions deploy validate-link`
// Requires the ANTHROPIC_API_KEY secret: `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`
import Anthropic from "npm:@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

Deno.serve(async (req) => {
  try {
    const { previousWord, newWord } = await req.json();
    if (typeof previousWord !== "string" || typeof newWord !== "string") {
      return new Response(JSON.stringify({ valid: true, reason: "missing-input" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      tools: [
        {
          name: "judge_link",
          description:
            "Judge whether two consecutive words in a word-chain game form a valid link.",
          input_schema: {
            type: "object",
            properties: {
              valid: { type: "boolean" },
              reason: { type: "string" },
            },
            required: ["valid", "reason"],
            additionalProperties: false,
          },
          strict: true,
        },
      ],
      tool_choice: { type: "tool", name: "judge_link" },
      messages: [
        {
          role: "user",
          content:
            `In a word-chain party game, does "${newWord}" form a valid compound word or ` +
            `common two-word phrase with "${previousWord}"? Check both orders — ` +
            `"${previousWord} ${newWord}" and "${newWord} ${previousWord}" — joined solid, ` +
            `hyphenated, or as two words. Be lenient: accept anything a native English speaker ` +
            `would recognize as a real, reasonably common word or phrase.`,
        },
      ],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    const result = (toolUse?.input as { valid?: boolean; reason?: string } | undefined) ?? {};

    return new Response(
      JSON.stringify({ valid: result.valid ?? true, reason: result.reason ?? "" }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error(err);
    // Fail open — an infra/API error should never falsely flag or block a link.
    return new Response(JSON.stringify({ valid: true, reason: "validation-error" }), {
      headers: { "Content-Type": "application/json" },
    });
  }
});
