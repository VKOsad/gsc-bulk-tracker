// Next.js instrumentation: runs once when the server process starts.
// We use it to start the in-app background schedulers (Clarity auto-collect,
// rank tracker position checks).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startClarityScheduler } = await import('@/lib/clarityScheduler');
    startClarityScheduler();
    const { startRankScheduler } = await import('@/lib/rankScheduler');
    startRankScheduler();
    const { startAeoScheduler } = await import('@/lib/aeoScheduler');
    startAeoScheduler();
    const { startAlertScheduler } = await import('@/lib/alertScheduler');
    startAlertScheduler();
    const { startDigestScheduler } = await import('@/lib/digestScheduler');
    startDigestScheduler();
    // Topvisor: polls waiting checks + syncs results, runs cost-capped auto-checks.
    // Gated by TOPVISOR_RANK_TRACKER_ENABLED (no-op when disabled).
    const { startTopvisorScheduler } = await import('@/lib/topvisor/topvisorScheduler');
    startTopvisorScheduler();
  }
}
