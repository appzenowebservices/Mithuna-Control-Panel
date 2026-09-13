import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetExperimental = vi.hoisted(() => vi.fn());
const mockIssueService = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  addComment: vi.fn(),
  listComments: vi.fn(),
}));
const mockFetch = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  instanceSettingsService: () => ({ getExperimental: mockGetExperimental }),
  issueService: () => mockIssueService,
}));

vi.mock("../routes/authz.js", () => ({
  getActorInfo: () => ({ actorId: "user-1", agentId: null, runId: null }),
  assertCompanyAccess: () => {},
}));

vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal("fetch", mockFetch);
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sseResponse(events: Array<Record<string, unknown>>): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const evt of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

async function createApp(deploymentMode: "local_trusted" | "authenticated" = "local_trusted") {
  const { boardChatRoutes } = await import("../routes/board-chat.js");
  const app = express();
  app.use(express.json());
  app.use("/api", boardChatRoutes({} as any, { deploymentMode }));
  return app;
}

describe("POST /api/board/chat/stream feature flag guard (PAP-137)", () => {
  it("returns 403 FEATURE_DISABLED when enableConferenceRoomChat is off", async () => {
    mockGetExperimental.mockResolvedValue({ enableConferenceRoomChat: false });
    const app = await createApp();

    const res = await request(app)
      .post("/api/board/chat/stream")
      .send({ companyId: "company-1", message: "hello" });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: "Conference Room Chat is not enabled",
      code: "FEATURE_DISABLED",
    });
    // The guard must fire before anything is persisted.
    expect(mockIssueService.addComment).not.toHaveBeenCalled();
    expect(mockIssueService.create).not.toHaveBeenCalled();
  });

  it("returns 403 DEPLOYMENT_MODE_UNSUPPORTED outside local_trusted even with the flag on", async () => {
    mockGetExperimental.mockResolvedValue({ enableConferenceRoomChat: true });
    const app = await createApp("authenticated");

    const res = await request(app)
      .post("/api/board/chat/stream")
      .send({ companyId: "company-1", message: "hello" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("DEPLOYMENT_MODE_UNSUPPORTED");
    expect(mockIssueService.addComment).not.toHaveBeenCalled();
  });

  it("lets requests past the guard when the flag is on (400 on missing body, not 403)", async () => {
    mockGetExperimental.mockResolvedValue({ enableConferenceRoomChat: true });
    const app = await createApp();

    // Omit the body so the request stops at validation — proves the guard
    // admitted it without starting a hermes chat.
    const res = await request(app).post("/api/board/chat/stream").send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "companyId and message are required" });
  });
});

describe("board-chat hermes relay", () => {
  function stubHermesUp(options: { model?: string; provider?: string; events?: Array<Record<string, unknown>> } = {}) {
    const { model = "acme/model", provider = "acme", events } = options;
    mockFetch.mockImplementation((url: string, opts: any) => {
      if (url.endsWith("/model")) {
        return Promise.resolve(jsonResponse({ model, provider }));
      }
      if (url.endsWith("/chat")) {
        const body = JSON.parse(opts.body);
        expect(body.model).toBe(model);
        expect(body.provider).toBe(provider);
        return Promise.resolve(sseResponse(events ?? []));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
  }

  it("streams hermes chunks to the client and persists the reply", async () => {
    mockGetExperimental.mockResolvedValue({ enableConferenceRoomChat: true });
    mockIssueService.list.mockResolvedValue([
      { id: "issue-1", title: "Board Operations", status: "todo" },
    ]);
    mockIssueService.addComment.mockResolvedValue({ id: "comment-1" });
    mockIssueService.listComments.mockResolvedValue([]);

    stubHermesUp({
      events: [
        { type: "content", content: "Hello, " },
        { type: "content", content: "Board!" },
        { type: "done", session_id: "s1" },
      ],
    });

    const app = await createApp();
    const res = await request(app)
      .post("/api/board/chat/stream")
      .send({ companyId: "company-1", message: "hello" });

    expect(res.status).toBe(200);
    expect(res.text).toContain(`{"type":"start","issueId":"issue-1"}`);
    expect(res.text).toContain(`{"type":"chunk","text":"Hello, "}`);
    expect(res.text).toContain(`{"type":"chunk","text":"Board!"}`);
    expect(res.text).toContain(`"type":"done"`);

    // The chat request carries the board skill plus the concrete control-plane
    // connection values the skill needs (env vars aren't exported to hermes).
    const chatCall = mockFetch.mock.calls.find(([url]) =>
      String(url).endsWith("/chat"),
    );
    expect(chatCall).toBeDefined();
    const chatBody = JSON.parse(chatCall![1].body as string);
    expect(chatBody.message).toBe("hello");
    expect(chatBody.model).toBe("acme/model");
    expect(chatBody.provider).toBe("acme");
    expect(chatBody.system_prompt).toContain("Paperclip Control Plane Connection");
    expect(chatBody.system_prompt).toContain("PAPERCLIP_COMPANY_ID = company-1");

    expect(mockIssueService.addComment).toHaveBeenCalledWith(
      "issue-1",
      "Hello, Board!",
      { userId: "board-concierge" },
    );
  });

  it("emits an error event when the hermes server is unreachable", async () => {
    mockGetExperimental.mockResolvedValue({ enableConferenceRoomChat: true });
    mockIssueService.list.mockResolvedValue([
      { id: "issue-1", title: "Board Operations", status: "todo" },
    ]);
    mockIssueService.addComment.mockResolvedValue({ id: "comment-1" });
    mockIssueService.listComments.mockResolvedValue([]);

    mockFetch.mockImplementation((url: string) => {
      if (url.endsWith("/model")) return Promise.resolve(jsonResponse({}));
      return Promise.reject(
        Object.assign(new TypeError("fetch failed"), {
          cause: { code: "ECONNREFUSED" },
        }),
      );
    });

    const app = await createApp();
    const res = await request(app)
      .post("/api/board/chat/stream")
      .send({ companyId: "company-1", message: "hello" });

    expect(res.status).toBe(200);
    expect(res.text).toContain(`"type":"error"`);
    expect(res.text).toContain("Could not reach the hermes agent");
    // The user's message is persisted up front, but no board reply may be.
    const conciergeCalls = mockIssueService.addComment.mock.calls.filter(
      (call) => (call[2] as { userId?: string })?.userId === "board-concierge",
    );
    expect(conciergeCalls).toHaveLength(0);
  });
});

describe("board-chat client disconnect", () => {
  it("aborts the hermes fetch when the client disconnects mid-stream", async () => {
    mockGetExperimental.mockResolvedValue({ enableConferenceRoomChat: true });
    mockIssueService.list.mockResolvedValue([
      { id: "issue-1", title: "Board Operations", status: "todo" },
    ]);
    mockIssueService.addComment.mockResolvedValue({ id: "comment-1" });
    mockIssueService.listComments.mockResolvedValue([]);

    let chatSignal: AbortSignal | undefined;
    mockFetch.mockImplementation((url: string, opts: any) => {
      if (url.endsWith("/model")) {
        return Promise.resolve(jsonResponse({ model: "m", provider: "p" }));
      }
      chatSignal = opts?.signal;
      // A body stream that never resolves keeps the relay awaiting reads.
      const body = new ReadableStream({
        start() {
          /* hold open forever */
        },
      });
      return Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      );
    });

    const app = await createApp();

    const req = request(app)
      .post("/api/board/chat/stream")
      .send({ companyId: "company-1", message: "hello" });
    // Start the request without awaiting the (never-ending) SSE response.
    const pending = req.then(
      () => undefined,
      () => undefined,
    );

    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    await vi.waitFor(() => expect(chatSignal).toBeDefined());
    expect(chatSignal!.aborted).toBe(false);

    // Client walks away mid-stream.
    req.abort();
    await vi.waitFor(() => expect(chatSignal!.aborted).toBe(true));
    await pending;
  });
});

describe("board-chat history role classification", () => {
  it("treats only board-concierge comments as assistant turns", async () => {
    const { isConciergeReply } = await import("../routes/board-chat.js");

    // The relay's own persisted replies.
    expect(
      isConciergeReply({ authorAgentId: null, authorUserId: "board-concierge" }),
    ).toBe(true);

    // A human board user.
    expect(isConciergeReply({ authorAgentId: null, authorUserId: "user-1" })).toBe(
      false,
    );

    // An agent commenting on the standing issue is NOT this assistant — its
    // words must not be serialized as the assistant's own prior turns.
    expect(
      isConciergeReply({ authorAgentId: "agent-1", authorUserId: null }),
    ).toBe(false);

    // Defensive: an agent comment can never impersonate the concierge even if
    // both author fields are somehow set.
    expect(
      isConciergeReply({ authorAgentId: "agent-1", authorUserId: "board-concierge" }),
    ).toBe(false);
  });
});
