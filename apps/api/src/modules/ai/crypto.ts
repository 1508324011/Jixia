import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export class AICryptoError extends Error {
  constructor(message = "AI credential encryption is unavailable") {
    super(message);
    this.name = "AICryptoError";
  }
}

export type AIKeyCipher = {
  readonly encrypt: (plaintext: string) => string;
  readonly decrypt: (ciphertext: string) => string;
};

const algorithm = "aes-256-gcm";
const encodingPrefix = "v1";
const ivByteLength = 12;

function masterKeyFromEnv(): string {
  const value = process.env.MASTER_KEY?.trim();

  if (!value) {
    throw new AICryptoError();
  }

  return value;
}

function deriveKey(masterKey: string): Buffer {
  return createHash("sha256").update(masterKey).digest();
}

export function createAIKeyCipher(getMasterKey: () => string = masterKeyFromEnv): AIKeyCipher {
  function key(): Buffer {
    return deriveKey(getMasterKey());
  }

  return {
    encrypt(plaintext: string): string {
      if (!plaintext) {
        throw new AICryptoError("AI credential is required");
      }

      const iv = randomBytes(ivByteLength);
      const cipher = createCipheriv(algorithm, key(), iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const authTag = cipher.getAuthTag();

      return [encodingPrefix, iv.toString("base64url"), authTag.toString("base64url"), ciphertext.toString("base64url")].join(":");
    },

    decrypt(ciphertext: string): string {
      const [version, encodedIv, encodedAuthTag, encodedCiphertext] = ciphertext.split(":");

      if (version !== encodingPrefix || !encodedIv || !encodedAuthTag || !encodedCiphertext) {
        throw new AICryptoError("AI credential ciphertext is invalid");
      }

      const decipher = createDecipheriv(algorithm, key(), Buffer.from(encodedIv, "base64url"));
      decipher.setAuthTag(Buffer.from(encodedAuthTag, "base64url"));

      return Buffer.concat([
        decipher.update(Buffer.from(encodedCiphertext, "base64url")),
        decipher.final()
      ]).toString("utf8");
    }
  };
}

export function createKeyPreview(apiKey: string): string {
  const trimmed = apiKey.trim();

  if (trimmed.length <= 8) {
    return "••••";
  }

  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}
