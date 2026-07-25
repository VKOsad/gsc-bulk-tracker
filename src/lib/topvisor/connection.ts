// Server-only Topvisor connection helper: stores/loads the per-user encrypted API
// key and builds a ready-to-use service. The API key is decrypted ONLY here, only on
// the server, and is never returned to callers, logged, or included in errors.

import { prisma } from "@/lib/prisma";
import { sealSecret, openSecret } from "@/lib/crypto/secretBox";
import { createTopvisorClient } from "./client";
import { createTopvisorService, type TopvisorService } from "./service";
import { TopvisorError } from "./errors";

export interface ConnectionStatus {
  connected: boolean;
  apiUserId: string | null;
  keyMasked: string | null; // never the real key — a fixed placeholder when present
  status: string; // unverified | connected | error | disconnected
  lastVerifiedAt: string | null;
  lastError: string | null;
}

/** Build a Topvisor service for a user from their stored, decrypted credentials. */
export async function getServiceForUser(userId: string): Promise<TopvisorService> {
  const conn = await prisma.topvisorConnection.findUnique({ where: { userId } });
  if (!conn) {
    throw new TopvisorError("TOPVISOR_NOT_CONNECTED", "Topvisor is not connected");
  }
  const apiKey = openSecret({
    ciphertext: conn.encryptedApiKey,
    iv: conn.keyIv,
    authTag: conn.keyAuthTag,
  });
  const client = createTopvisorClient({ apiUserId: conn.apiUserId, apiKey });
  return createTopvisorService(client);
}

export async function hasConnection(userId: string): Promise<boolean> {
  const c = await prisma.topvisorConnection.findUnique({ where: { userId }, select: { id: true } });
  return !!c;
}

/** Status for the Settings UI — masked, never the key. */
export async function getConnectionStatus(userId: string): Promise<ConnectionStatus> {
  const conn = await prisma.topvisorConnection.findUnique({ where: { userId } });
  if (!conn) {
    return { connected: false, apiUserId: null, keyMasked: null, status: "disconnected", lastVerifiedAt: null, lastError: null };
  }
  return {
    connected: conn.status === "connected",
    apiUserId: conn.apiUserId,
    keyMasked: "••••••••••••", // presence indicator only; the real key never leaves the server
    status: conn.status,
    lastVerifiedAt: conn.lastVerifiedAt ? conn.lastVerifiedAt.toISOString() : null,
    lastError: conn.lastError,
  };
}

/**
 * Verify credentials against Topvisor, then store them encrypted (upsert). Verifying
 * first means a bad key is reported without silently persisting a broken connection —
 * but we still store it (status="error") so the user sees the state and can fix it.
 */
export async function saveConnection(
  userId: string,
  apiUserId: string,
  apiKey: string,
): Promise<ConnectionStatus> {
  let status = "connected";
  let lastError: string | null = null;
  let lastVerifiedAt: Date | null = new Date();

  try {
    const svc = createTopvisorService(createTopvisorClient({ apiUserId, apiKey }));
    await svc.verifyConnection();
  } catch (err) {
    status = "error";
    lastError = err instanceof TopvisorError ? err.code : "TOPVISOR_REMOTE_ERROR";
    lastVerifiedAt = null;
  }

  const sealed = sealSecret(apiKey);
  await prisma.topvisorConnection.upsert({
    where: { userId },
    create: {
      userId,
      apiUserId,
      encryptedApiKey: sealed.ciphertext,
      keyIv: sealed.iv,
      keyAuthTag: sealed.authTag,
      status,
      lastError,
      lastVerifiedAt,
    },
    update: {
      apiUserId,
      encryptedApiKey: sealed.ciphertext,
      keyIv: sealed.iv,
      keyAuthTag: sealed.authTag,
      status,
      lastError,
      lastVerifiedAt,
    },
  });

  return getConnectionStatus(userId);
}

/** Re-test the currently stored connection and update its status. */
export async function testConnection(userId: string): Promise<ConnectionStatus> {
  const conn = await prisma.topvisorConnection.findUnique({ where: { userId } });
  if (!conn) {
    return getConnectionStatus(userId);
  }
  let status = "connected";
  let lastError: string | null = null;
  let lastVerifiedAt: Date | null = new Date();
  try {
    const svc = await getServiceForUser(userId);
    await svc.verifyConnection();
  } catch (err) {
    status = "error";
    lastError = err instanceof TopvisorError ? err.code : "TOPVISOR_REMOTE_ERROR";
    lastVerifiedAt = null;
  }
  await prisma.topvisorConnection.update({
    where: { userId },
    data: { status, lastError, lastVerifiedAt },
  });
  return getConnectionStatus(userId);
}

export async function deleteConnection(userId: string): Promise<void> {
  await prisma.topvisorConnection.deleteMany({ where: { userId } });
}
