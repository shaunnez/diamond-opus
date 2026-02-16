import { useMemo } from 'react';
import { Card, CardHeader } from '../ui';
import { type RunWithStats } from '../../api/analytics';
import { formatDateShort } from '../../utils/formatters';
import { BarChart3 } from 'lucide-react';

interface RunsChartProps {
  runs: RunWithStats[];
}

interface DayData {
  date: string;
  dateLabel: string;
  feeds: Record<string, number>;
  feedRecords: Record<string, number>;
  total: number;
  totalRecords: number;
}

// Feed color mapping
const FEED_COLORS: Record<string, string> = {
  nivoda: 'bg-blue-500',
  demo: 'bg-purple-500',
};

export function RunsChart({ runs }: RunsChartProps) {
  // Group runs by day and feed
  const chartData = useMemo(() => {
    // Get last 7 days
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);

    // Filter runs from last 7 days
    const recentRuns = runs.filter((run) => {
      const runDate = new Date(run.startedAt);
      return runDate >= sevenDaysAgo;
    });

    // Group by day
    const dayMap = new Map<string, DayData>();

    // Initialize all 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(now.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      dayMap.set(dateKey, {
        date: dateKey,
        dateLabel: formatDateShort(date.toISOString()),
        feeds: {},
        feedRecords: {},
        total: 0,
        totalRecords: 0,
      });
    }

    // Populate with actual run data
    recentRuns.forEach((run) => {
      const runDate = new Date(run.startedAt);
      const dateKey = runDate.toISOString().split('T')[0];
      const dayData = dayMap.get(dateKey);

      if (dayData) {
        dayData.feeds[run.feed] = (dayData.feeds[run.feed] || 0) + 1;
        dayData.feedRecords[run.feed] = (dayData.feedRecords[run.feed] || 0) + run.totalRecordsProcessed;
        dayData.total += 1;
        dayData.totalRecords += run.totalRecordsProcessed;
      }
    });

    return Array.from(dayMap.values());
  }, [runs]);

  const maxTotalRecords = Math.max(...chartData.map((d) => d.totalRecords), 1);
  const allFeeds = Array.from(new Set(runs.map((r) => r.feed)));

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  if (chartData.every((d) => d.totalRecords === 0)) {
    return null;
  }

  return (
    <Card className="mb-6">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Pipeline Activity (Last 7 Days)
          </span>
        }
        subtitle={`${runs.length} total runs · ${formatNumber(runs.reduce((sum, r) => sum + r.totalRecordsProcessed, 0))} records processed`}
      />
      <div className="mt-4">
        {/* Bar chart visualization */}
        <div className="space-y-3">
          {chartData.map((day, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="w-20 text-right text-xs text-stone-500 font-mono">
                {day.dateLabel}
              </div>
              <div className="flex-1 h-10 bg-stone-100 dark:bg-stone-800 rounded-lg overflow-hidden relative">
                {day.totalRecords > 0 ? (
                  <div className="h-full flex">
                    {allFeeds.map((feed) => {
                      const records = day.feedRecords[feed] || 0;
                      const percentage = (records / maxTotalRecords) * 100;
                      if (records === 0) return null;
                      const runCount = day.feeds[feed] || 0;
                      return (
                        <div
                          key={feed}
                          className={`h-full ${FEED_COLORS[feed] || 'bg-gray-500'} transition-all duration-300`}
                          style={{
                            width: `${percentage}%`,
                          }}
                          title={`${feed}: ${formatNumber(records)} records (${runCount} ${runCount === 1 ? 'run' : 'runs'})`}
                        />
                      );
                    })}
                  </div>
                ) : null}
                <div className="absolute inset-0 flex items-center px-3 pointer-events-none">
                  {day.totalRecords > 0 && (
                    <span className="text-xs font-medium text-white drop-shadow">
                      {formatNumber(day.totalRecords)} records · {day.total} {day.total === 1 ? 'run' : 'runs'}
                    </span>
                  )}
                </div>
              </div>
              <div className="w-16 text-right text-sm text-stone-500 font-mono">
                {day.totalRecords > 0 ? formatNumber(day.totalRecords) : ''}
              </div>
            </div>
          ))}
        </div>

        {/* Feed legend */}
        {allFeeds.length > 1 && (
          <div className="mt-6 flex items-center justify-center gap-4">
            <span className="text-sm text-stone-500">Feeds:</span>
            {allFeeds.map((feed) => (
              <div key={feed} className="flex items-center gap-2">
                <div className={`w-4 h-4 ${FEED_COLORS[feed] || 'bg-gray-500'} rounded`} />
                <span className="text-sm text-stone-700 dark:text-stone-300 capitalize">
                  {feed}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
