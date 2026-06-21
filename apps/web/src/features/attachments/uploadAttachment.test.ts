import type {
  AttachmentDownloadResponse,
  ConfirmUploadIntentResponse,
  CreateUploadIntentResponse
} from "@jixia/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { openAttachmentDownload, uploadAttachment } from "./uploadAttachment";

const originalWindow = window;

const intentResponse: CreateUploadIntentResponse = {
  intent: {
    id: "intent-1",
    documentId: "document-1",
    uploaderUserId: "user-1",
    blockType: "image",
    fileName: "figure.png",
    mimeType: "image/png",
    sizeBytes: 11,
    checksum: null,
    status: "pending",
    failureReason: null,
    failureDetail: null,
    expiresAt: "2026-06-16T11:00:00.000Z",
    confirmedAt: null,
    cleanedAt: null,
    createdAt: "2026-06-16T10:00:00.000Z",
    updatedAt: "2026-06-16T10:00:00.000Z"
  },
  upload: {
    method: "PUT",
    url: "https://storage.example.test/private-upload?signature=transient",
    requiredHeaders: { "content-type": "image/png" },
    expiresAt: "2026-06-16T11:00:00.000Z"
  }
};

const confirmResponse: ConfirmUploadIntentResponse = {
  intent: {
    ...intentResponse.intent,
    status: "confirmed",
    confirmedAt: "2026-06-16T10:01:00.000Z",
    updatedAt: "2026-06-16T10:01:00.000Z"
  },
  attachment: {
    id: "attachment-1",
    documentId: "document-1",
    uploadedByUserId: "user-1",
    fileName: "figure.png",
    mimeType: "image/png",
    sizeBytes: 11,
    checksum: null,
    etag: "etag-1",
    createdAt: "2026-06-16T10:01:00.000Z"
  }
};

const downloadResponse: AttachmentDownloadResponse = {
  attachment: confirmResponse.attachment,
  downloadUrl: "https://storage.example.test/private-download?signature=transient",
  expiresAt: "2026-06-16T10:16:00.000Z"
};

describe("uploadAttachment", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("requests an intent uploads to the signed URL confirms and returns safe metadata", async () => {
    const fetchMock = mockFetchSequence(intentResponse, undefined, confirmResponse);
    const file = new File(["hello world"], "figure.png", { type: "image/png" });

    const result = await uploadAttachment({
      documentId: "document-1",
      blockType: "image",
      file
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/attachments/upload-intents",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          documentId: "document-1",
          blockType: "image",
          fileName: "figure.png",
          mimeType: "image/png",
          sizeBytes: 11
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      intentResponse.upload.url,
      expect.objectContaining({
        method: "PUT",
        body: file,
        credentials: "omit"
      })
    );
    const [, uploadInit] = fetchMock.mock.calls[1] ?? [];
    expect((uploadInit?.headers as Headers).get("content-type")).toBe("image/png");
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/attachments/upload-intents/intent-1/confirm",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ uploadIntentId: "intent-1" })
      })
    );
    expect(result).toEqual({
      attachmentId: "attachment-1",
      documentId: "document-1",
      blockType: "image",
      fileName: "figure.png",
      mimeType: "image/png",
      sizeBytes: 11,
      checksum: null,
      etag: "etag-1",
      createdAt: "2026-06-16T10:01:00.000Z"
    });
    expect(JSON.stringify(result)).not.toMatch(/storage|object|credential|signed|signature|uploadUrl|downloadUrl/i);
  });

  it("rewrites loopback local object-storage uploads to the private browser host without credentials", async () => {
    stubWindowLocation("http://10.128.253.195:5173/documents/document-1");
    const localIntentResponse: CreateUploadIntentResponse = {
      ...intentResponse,
      upload: {
        ...intentResponse.upload,
        url: "http://127.0.0.1:3000/local-object-storage/upload/intent-1?signature=transient"
      }
    };
    const fetchMock = mockFetchSequence(localIntentResponse, undefined, confirmResponse);
    const file = new File(["hello world"], "figure.png", { type: "image/png" });

    await uploadAttachment({
      documentId: "document-1",
      blockType: "image",
      file
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://10.128.253.195:3000/local-object-storage/upload/intent-1?signature=transient",
      expect.objectContaining({
        method: "PUT",
        body: file,
        credentials: "omit"
      })
    );
  });

  it("rejects API responses that expose object storage credentials or keys", async () => {
    const fetchMock = mockFetchSequence({
      ...intentResponse,
      intent: {
        ...intentResponse.intent,
        storageKey: "tmp/uploads/secret/figure.png"
      }
    });

    await expect(
      uploadAttachment({
        documentId: "document-1",
        blockType: "image",
        file: new Blob(["bad"], { type: "image/png" }),
        fileName: "figure.png"
      })
    ).rejects.toThrow(/unsupported storage fields/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects signed upload targets that require credential headers", async () => {
    mockFetchSequence({
      ...intentResponse,
      upload: {
        ...intentResponse.upload,
        requiredHeaders: {
          authorization: "Bearer secret"
        }
      }
    });

    await expect(
      uploadAttachment({
        documentId: "document-1",
        blockType: "image",
        file: new Blob(["bad"], { type: "image/png" }),
        fileName: "figure.png"
      })
    ).rejects.toThrow(/unsupported storage fields|unsupported credential headers/i);
  });

  it("redacts attachment secrets from API error messages before surfacing them", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error:
            "Upload failed at https://storage.example.test/private-upload?X-Amz-Signature=secret with Bearer secret-token"
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const upload = uploadAttachment({
      documentId: "document-1",
      blockType: "image",
      file: new Blob(["bad"], { type: "image/png" }),
      fileName: "figure.png"
    });
    const error = await upload.catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/\[redacted attachment url\].*\[redacted\]/i);
    expect((error as Error).message).not.toMatch(/storage\.example|signature=secret|bearer secret-token/i);
  });

  it("surfaces safe direct-upload diagnostics without leaking the signed URL", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(intentResponse))
      .mockRejectedValueOnce(new TypeError("Failed to fetch https://storage.example.test/private-upload?signature=secret"));
    vi.stubGlobal("fetch", fetchMock);

    const upload = uploadAttachment({
      documentId: "document-1",
      blockType: "image",
      file: new File(["hello world"], "figure.png", { type: "image/png" })
    });
    const error = await upload.catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/no HTTP response/i);
    expect((error as Error).message).toMatch(/page origin|request headers|cors\/preflight|public base URL/i);
    expect((error as Error).message).toContain("https://storage.example.test");
    expect((error as Error).message).not.toMatch(/private-upload|signature=secret/i);
  });

  it("requests a private download URL before opening without persisting the URL", async () => {
    const fetchMock = mockFetchSequence(downloadResponse);
    const opener = vi.fn();

    const attachment = await openAttachmentDownload({ attachmentId: "attachment-1", opener });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/attachments/attachment-1/download",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ attachmentId: "attachment-1" })
      })
    );
    expect(opener).toHaveBeenCalledWith(downloadResponse.downloadUrl);
    expect(attachment).toEqual(downloadResponse.attachment);
    expect(JSON.stringify(attachment)).not.toMatch(/storage|object|credential|signed|signature|downloadUrl/i);
  });

  it("rewrites loopback local object-storage downloads only for transient opener use", async () => {
    stubWindowLocation("http://10.128.253.195:5173/documents/document-1");
    const localDownloadResponse: AttachmentDownloadResponse = {
      ...downloadResponse,
      downloadUrl: "http://localhost:3000/local-object-storage/download/attachment-1?signature=transient"
    };
    const fetchMock = mockFetchSequence(localDownloadResponse);
    const opener = vi.fn();

    const attachment = await openAttachmentDownload({ attachmentId: "attachment-1", opener });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(opener).toHaveBeenCalledWith(
      "http://10.128.253.195:3000/local-object-storage/download/attachment-1?signature=transient"
    );
    expect(attachment).toEqual(downloadResponse.attachment);
    expect(JSON.stringify(attachment)).not.toMatch(/storage|object|credential|signed|signature|downloadUrl/i);
  });
});

type MockPayload = unknown | undefined;

function mockFetchSequence(...payloads: readonly MockPayload[]) {
  const fetchMock = vi.fn<typeof fetch>();

  for (const payload of payloads) {
    fetchMock.mockResolvedValueOnce(payload === undefined ? emptyResponse() : jsonResponse(payload));
  }

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function emptyResponse(): Response {
  return new Response(null, { status: 200 });
}

function stubWindowLocation(href: string): void {
  vi.stubGlobal(
    "window",
    Object.create(originalWindow, {
      location: {
        value: new URL(href)
      }
    })
  );
}
