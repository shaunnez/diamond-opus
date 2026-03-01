import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import SectionWrapper from '../shared/SectionWrapper';
import SectionTitle from '../shared/SectionTitle';
import { easing } from '../../utils/constants';

const stats = [
  { label: 'Total Diamonds', value: '487,231', change: '+12,450' },
  { label: 'Active Feeds', value: '3', change: '' },
  { label: 'Last Sync', value: '2m ago', change: '' },
  { label: 'Success Rate', value: '99.7%', change: '' },
];

const recentRuns = [
  { feed: 'nivoda-natural', type: 'incremental', status: 'completed', duration: '4m 12s', diamonds: '12,450' },
  { feed: 'nivoda-labgrown', type: 'incremental', status: 'completed', duration: '2m 34s', diamonds: '3,210' },
  { feed: 'nivoda-natural', type: 'full', status: 'completed', duration: '47m 08s', diamonds: '487,231' },
  { feed: 'demo', type: 'full', status: 'completed', duration: '0m 42s', diamonds: '500' },
];

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: 'bg-emerald/15 text-emerald',
    running: 'bg-amber/15 text-amber',
    failed: 'bg-ruby/15 text-ruby',
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-500 uppercase ${colors[status] || colors.completed}`}>
      {status}
    </span>
  );
}

function RunTypeBadge({ type }: { type: string }) {
  return (
    <span className="rounded bg-charcoal/5 px-2 py-0.5 font-mono text-[10px] text-warm-gray-500">
      {type}
    </span>
  );
}

export default function DashboardSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <SectionWrapper id="dashboard" dark>
      <div ref={ref}>
        <SectionTitle title="Operational Intelligence" subtitle="15-page React dashboard for real-time pipeline monitoring" light />

        {/* Mockup frame */}
        <motion.div
          className="mt-12 overflow-hidden rounded-xl border border-warm-gray-600/30 bg-obsidian"
          initial={{ opacity: 0, y: 40 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 1, ease: easing.luxury }}
        >
          {/* Window chrome */}
          <div className="flex items-center gap-2 border-b border-warm-gray-600/20 px-4 py-3">
            <div className="h-2.5 w-2.5 rounded-full bg-ruby/60" />
            <div className="h-2.5 w-2.5 rounded-full bg-amber/60" />
            <div className="h-2.5 w-2.5 rounded-full bg-emerald/60" />
            <span className="ml-4 font-mono text-xs text-warm-gray-500">
              diamond-opus / dashboard
            </span>
          </div>

          <div className="p-6">
            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {stats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  className="rounded-lg border border-warm-gray-600/20 bg-charcoal p-4"
                  initial={{ opacity: 0, y: 10 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.4 + i * 0.1, duration: 0.5 }}
                >
                  <p className="font-sans text-[10px] uppercase tracking-wide text-warm-gray-400">
                    {stat.label}
                  </p>
                  <p className="mt-1 font-serif text-xl font-600 text-cream">{stat.value}</p>
                  {stat.change && (
                    <p className="mt-0.5 font-mono text-xs text-emerald">{stat.change}</p>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Recent runs table */}
            <motion.div
              className="mt-6"
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ delay: 0.8, duration: 0.8 }}
            >
              <p className="mb-3 font-sans text-xs uppercase tracking-wide text-warm-gray-400">
                Recent Runs
              </p>
              <div className="overflow-hidden rounded-lg border border-warm-gray-600/20">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-warm-gray-600/20 bg-charcoal">
                      <th className="px-4 py-2 text-left font-sans text-[10px] uppercase tracking-wider text-warm-gray-400">
                        Feed
                      </th>
                      <th className="px-4 py-2 text-left font-sans text-[10px] uppercase tracking-wider text-warm-gray-400">
                        Type
                      </th>
                      <th className="px-4 py-2 text-left font-sans text-[10px] uppercase tracking-wider text-warm-gray-400">
                        Status
                      </th>
                      <th className="hidden px-4 py-2 text-left font-sans text-[10px] uppercase tracking-wider text-warm-gray-400 md:table-cell">
                        Duration
                      </th>
                      <th className="hidden px-4 py-2 text-right font-sans text-[10px] uppercase tracking-wider text-warm-gray-400 md:table-cell">
                        Diamonds
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentRuns.map((run, i) => (
                      <tr key={i} className="border-b border-warm-gray-600/10 last:border-0">
                        <td className="px-4 py-2.5 font-mono text-xs text-cream">{run.feed}</td>
                        <td className="px-4 py-2.5">
                          <RunTypeBadge type={run.type} />
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={run.status} />
                        </td>
                        <td className="hidden px-4 py-2.5 font-mono text-xs text-warm-gray-400 md:table-cell">
                          {run.duration}
                        </td>
                        <td className="hidden px-4 py-2.5 text-right font-mono text-xs text-gold md:table-cell">
                          {run.diamonds}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </SectionWrapper>
  );
}
