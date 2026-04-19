import OpenAI from "openai";

import type { GitHubIssueComment } from "@/lib/github";

const DEFAULT_DISCUSSION_MODEL = "gpt-5.4";
const MAX_COMMENT_INPUTS = 6;
const MAX_BODY_CHARS = 600;
const MAX_LINE_CHARS = 140;

function getOpenAIKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key ? key : null;
}

function getDiscussionModel(): string {
  return (
    process.env.OPENAI_GITHUB_DISCUSSION_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    DEFAULT_DISCUSSION_MODEL
  );
}

function normalizeWhitespace(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

export function extractGitHubDiscussionTakeaways(summary: string | null | undefined) {
  if (!summary) return [];
  return summary
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
}

function limitText(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 1).trimEnd()}...`;
}

function toSentence(value: string) {
  const trimmed = value.trim().replace(/[.!?]+$/, "");
  return trimmed ? `${trimmed}.` : "";
}

function splitIntoTwoLines(value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return null;

  const explicitLines = value
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  if (explicitLines.length >= 2) {
    return [
      limitText(toSentence(explicitLines[0]), MAX_LINE_CHARS),
      limitText(toSentence(explicitLines[1]), MAX_LINE_CHARS),
    ].join("\n");
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  if (sentences.length >= 2) {
    return [
      limitText(toSentence(sentences[0]), MAX_LINE_CHARS),
      limitText(toSentence(sentences[1]), MAX_LINE_CHARS),
    ].join("\n");
  }

  const midpoint = Math.max(40, Math.floor(normalized.length / 2));
  const splitAt = normalized.indexOf(" ", midpoint);
  if (splitAt > 0) {
    return [
      limitText(toSentence(normalized.slice(0, splitAt)), MAX_LINE_CHARS),
      limitText(toSentence(normalized.slice(splitAt + 1)), MAX_LINE_CHARS),
    ].join("\n");
  }

  return [
    limitText(toSentence(normalized), MAX_LINE_CHARS),
    "Recent GitHub discussion is active, but the latest thread needs a manual read for detail.",
  ].join("\n");
}

function buildFallbackSummary(comments: GitHubIssueComment[]) {
  const meaningful = comments
    .map((comment) => ({
      author: normalizeWhitespace(comment.user?.login),
      body: normalizeWhitespace(comment.body),
    }))
    .filter((comment) => comment.body)
    .slice(0, 2);

  if (meaningful.length === 0) {
    return null;
  }

  const [latest, previous] = meaningful;
  const lineOne = latest.author
    ? `${latest.author}: ${limitText(latest.body, 96)}`
    : `Latest engineering update: ${limitText(latest.body, 92)}`;
  const lineTwo = previous
    ? previous.author
      ? `Recent follow-up from ${previous.author}: ${limitText(previous.body, 74)}`
      : `Recent follow-up: ${limitText(previous.body, 92)}`
    : "Recent GitHub discussion is active and awaiting the next owner update.";

  return [
    limitText(toSentence(lineOne), MAX_LINE_CHARS),
    limitText(toSentence(lineTwo), MAX_LINE_CHARS),
  ].join("\n");
}

export async function buildGitHubDiscussionSummary(params: {
  issueTitle: string;
  issueBody?: string | null;
  comments: GitHubIssueComment[];
}) {
  const meaningfulComments = params.comments
    .map((comment) => ({
      ...comment,
      body: normalizeWhitespace(comment.body),
    }))
    .filter((comment) => comment.body)
    .slice(0, MAX_COMMENT_INPUTS);

  if (meaningfulComments.length === 0) {
    return null;
  }

  const apiKey = getOpenAIKey();
  if (!apiKey) {
    return buildFallbackSummary(meaningfulComments);
  }

  const payload = JSON.stringify(
    {
      issueTitle: normalizeWhitespace(params.issueTitle),
      issueBody: limitText(normalizeWhitespace(params.issueBody), MAX_BODY_CHARS),
      comments: meaningfulComments.map((comment) => ({
        author: comment.user?.login ?? "unknown",
        updatedAt: comment.updated_at,
        body: limitText(comment.body ?? "", MAX_BODY_CHARS),
      })),
    },
    null,
    2,
  );

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: getDiscussionModel(),
      max_completion_tokens: 160,
      messages: [
        {
          role: "system",
          content:
            "Summarize the GitHub engineering conversation for a quality manager in exactly two plain-text lines. No bullets, no markdown, no headings. Keep it concise, concrete, and grounded only in the supplied issue discussion. Line 1 should capture the current status or effort signal, such as difficulty, confidence, ETA, or delivery status when present. Line 2 should capture the blocker, decision, owner update, or next step when present. Prefer direct phrasing like 'Easy fix, team estimates 1 day.' when the discussion supports it. Do not hedge with generic filler and do not invent facts.",
        },
        {
          role: "user",
          content: payload,
        },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim() ?? "";
    return splitIntoTwoLines(content) ?? buildFallbackSummary(meaningfulComments);
  } catch {
    return buildFallbackSummary(meaningfulComments);
  }
}
