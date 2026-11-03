import { EvilBarChart } from "@ekra/ui/components/evilcharts/charts/recharts-bar-chart";
import { EvilLineChart } from "@ekra/ui/components/evilcharts/charts/recharts-line-chart";
import type { ChartConfig } from "@ekra/ui/components/evilcharts/ui/recharts-chart";
import type { activeSeries } from "@/lib/reports";

// the brand token already switches with the theme, so both themes name it
const BRAND = { light: ["var(--brand)"], dark: ["var(--brand)"] };

const activeConfig = {
	learners: { label: "Active learners", colors: BRAND },
} satisfies ChartConfig;

/** Learners active each day, as a line. */
export function ActiveLearnersChart({
	data,
}: {
	data: ReturnType<typeof activeSeries>;
}) {
	return (
		<EvilLineChart
			data={data}
			config={activeConfig}
			curveType="monotone"
			className="aspect-auto h-[220px]"
		>
			<EvilLineChart.Grid />
			<EvilLineChart.XAxis dataKey="label" minTickGap={24} />
			<EvilLineChart.YAxis allowDecimals={false} />
			<EvilLineChart.Tooltip />
			<EvilLineChart.Line dataKey="learners" strokeWidth={2} />
		</EvilLineChart>
	);
}

const activityConfig = {
	count: { label: "Activities", colors: BRAND },
} satisfies ChartConfig;

/** The most active learners, one horizontal bar each. */
export function MostActiveChart({
	data,
}: {
	data: { name: string; count: number }[];
}) {
	return (
		// one 40px row per learner keeps a short list from stretching
		<div style={{ height: data.length * 40 + 28 }}>
			<EvilBarChart
				data={data}
				config={activityConfig}
				layout="horizontal"
				className="aspect-auto h-full"
			>
				<EvilBarChart.XAxis allowDecimals={false} />
				<EvilBarChart.YAxis dataKey="name" width={96} />
				<EvilBarChart.Tooltip />
				<EvilBarChart.Bar dataKey="count" />
			</EvilBarChart>
		</div>
	);
}
