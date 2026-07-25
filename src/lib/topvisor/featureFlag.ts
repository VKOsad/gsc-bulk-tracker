// Central feature flag for the Topvisor Rank Tracker. When disabled the Topvisor UI
// is hidden and its scheduler does not run; the legacy Rank Tracker is unaffected and
// no data is removed. Default: enabled (unless TOPVISOR_RANK_TRACKER_ENABLED="false").
import { isEncryptionConfigured } from "@/lib/crypto/secretBox";

export function isRankTrackerEnabled(): boolean {
  return process.env.TOPVISOR_RANK_TRACKER_ENABLED !== "false";
}

/**
 * Topvisor can only be *connected* when both the feature flag is on AND a valid
 * 32-byte TOPVISOR_ENCRYPTION_KEY is configured (needed to encrypt the API key).
 */
export function canConnectTopvisor(): boolean {
  return isRankTrackerEnabled() && isEncryptionConfigured();
}
