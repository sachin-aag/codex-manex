import { createHmac, timingSafeEqual } from "node:crypto";

type GitHubMethod = "GET" | "POST" | "PATCH";

type GitHubRequestOptions = {
  method?: GitHubMethod;
  body?: unknown;
};

type GitHubIssue = {
  id: number;
  number: number;
  html_url: string;
  title: string;
  body: string | null;
  state: "open" | "closed";
  updated_at: string;
  assignees: Array<{ login: string }>;
  labels: Array<{ name: string }>;
};

type GitHubProjectItem = {
  id: number;
  project_url: string;
  item_url: string | null;
  content_type: string;
};

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getGitHubConfig() {
  const token = getRequiredEnv("GITHUB_TOKEN");
  const repoOwner = getRequiredEnv("GITHUB_REPO_OWNER");
  const repoName = getRequiredEnv("GITHUB_REPO_NAME");
  const projectOwner = process.env.GITHUB_PROJECT_OWNER ?? repoOwner;
  const projectNumber = process.env.GITHUB_PROJECT_NUMBER
    ? Number(process.env.GITHUB_PROJECT_NUMBER)
    : undefined;
  const projectOwnerType = process.env.GITHUB_PROJECT_OWNER_TYPE === "org" ? "org" : "user";
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

  return {
    token,
    repoOwner,
    repoName,
    repoSlug: `${repoOwner}/${repoName}`,
    projectOwner,
    projectNumber,
    projectOwnerType,
    webhookSecret,
  };
}

async function githubRequest<T>(
  path: string,
  options: GitHubRequestOptions = {},
): Promise<T> {
  const { token } = getGitHubConfig();
  const response = await fetch(`https://api.github.com${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2026-03-10",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`GitHub API ${options.method ?? "GET"} ${path} failed (${response.status}): ${message}`);
  }

  return (await response.json()) as T;
}

export async function createGitHubIssue(payload: {
  title: string;
  body: string;
}) {
  const { repoOwner, repoName } = getGitHubConfig();
  return githubRequest<GitHubIssue>(`/repos/${repoOwner}/${repoName}/issues`, {
    method: "POST",
    body: {
      title: payload.title,
      body: payload.body,
    },
  });
}

export async function updateGitHubIssue(
  issueNumber: number,
  payload: {
    title: string;
    body: string;
  },
) {
  const { repoOwner, repoName } = getGitHubConfig();
  return githubRequest<GitHubIssue>(`/repos/${repoOwner}/${repoName}/issues/${issueNumber}`, {
    method: "PATCH",
    body: {
      title: payload.title,
      body: payload.body,
    },
  });
}

export async function getGitHubIssue(issueNumber: number) {
  const { repoOwner, repoName } = getGitHubConfig();
  return githubRequest<GitHubIssue>(`/repos/${repoOwner}/${repoName}/issues/${issueNumber}`);
}

export async function addIssueToGitHubProject(issueNumber: number) {
  const config = getGitHubConfig();
  if (!config.projectNumber) {
    return null;
  }

  const ownerPath =
    config.projectOwnerType === "org"
      ? `/orgs/${config.projectOwner}/projectsV2/${config.projectNumber}/items`
      : `/users/${config.projectOwner}/projectsV2/${config.projectNumber}/items`;

  return githubRequest<GitHubProjectItem>(ownerPath, {
    method: "POST",
    body: {
      type: "Issue",
      owner: config.repoOwner,
      repo: config.repoName,
      number: issueNumber,
    },
  });
}

export function getGitHubProjectUrl() {
  const config = getGitHubConfig();
  if (!config.projectNumber) {
    return undefined;
  }
  return config.projectOwnerType === "org"
    ? `https://github.com/orgs/${config.projectOwner}/projects/${config.projectNumber}`
    : `https://github.com/users/${config.projectOwner}/projects/${config.projectNumber}`;
}

export function verifyGitHubWebhookSignature(
  payload: string,
  signatureHeader: string | null,
) {
  const { webhookSecret } = getGitHubConfig();
  if (!webhookSecret) {
    throw new Error("Missing required environment variable: GITHUB_WEBHOOK_SECRET");
  }
  if (!signatureHeader) {
    return false;
  }

  const expected = createHmac("sha256", webhookSecret).update(payload).digest("hex");
  const received = signatureHeader.replace(/^sha256=/, "");
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export type {
  GitHubIssue,
  GitHubProjectItem,
};
