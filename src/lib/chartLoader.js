let chartCtorPromise = null;

export async function getChartCtor() {
    if (!chartCtorPromise) {
        chartCtorPromise = import('chart.js/auto').then(mod => mod.Chart);
    }
    return chartCtorPromise;
}
