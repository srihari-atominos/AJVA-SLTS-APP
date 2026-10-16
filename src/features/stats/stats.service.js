/**
 * stats.service.js
 * The header summary (vehicle count, labor-time row count, years, markets)
 * spans two other features' data, so this service calls THEIR services —
 * never their repositories directly — for each half of the numbers.
 */
function makeStatsService(vehiclesService, laborOpsService) {
  async function getStats() {
    const [v, laborTimeRows] = await Promise.all([
      vehiclesService.getStatsCounts(),
      laborOpsService.getCount(),
    ]);
    return {
      vehicles: v.count,
      laborTimeRows,
      years: v.years,
      markets: v.markets,
    };
  }

  return { getStats };
}

module.exports = { makeStatsService };
