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
  total: number;
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
        total: 0,
      });
    }

    // Populate with actual run data
    recentRuns.forEach((run) => {
      const runDate = new Date(run.startedAt);
      const dateKey = runDate.toISOString().split('T')[0];
      const dayData = dayMap.get(dateKey);

      if (dayData) {
        dayData.feeds[run.feed] = (dayData.feeds[run.feed] || 0) + 1;
        dayData.total += 1;
      }
    });

    return Array.from(dayMap.values());
  }, [runs]);

  const maxTotal = Math.max(...chartData.map((d) => d.total), 1);
  const allFeeds = Array.from(new Set(runs.map((r) => r.feed)));

  if (chartData.every((d) => d.total === 0)) {
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
        subtitle={`${runs.length} total runs`}
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
                {day.total > 0 ? (
                  <div className="h-full flex">
                    {allFeeds.map((feed) => {
                      const count = day.feeds[feed] || 0;
                      const percentage = (count / maxTotal) * 100;
                      if (count === 0) return null;
                      return (
                        <div
                          key={feed}
                          className={`h-full ${FEED_COLORS[feed] || 'bg-gray-500'} transition-all duration-300`}
                          style={{
                            width: `${percentage}%`,
                          }}
                          title={`${feed}: ${count} runs`}
                        />
                      );
                    })}
                  </div>
                ) : null}
                <div className="absolute inset-0 flex items-center px-3 pointer-events-none">
                  {day.total > 0 && (
                    <span className="text-xs font-medium text-white drop-shadow">
                      {day.total} {day.total === 1 ? 'run' : 'runs'}
                    </span>
                  )}
                </div>
              </div>
              <div className="w-12 text-sm text-stone-500">
                {day.total > 0 ? day.total : ''}
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
