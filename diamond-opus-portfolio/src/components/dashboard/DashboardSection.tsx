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
];

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: 'bg-emerald/15 text-emerald',
    running: 'bg-amber/15 text-amber',
    failed: 'bg-ruby/15 text-ruby',
  };

  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-500 uppercase sm:px-2 sm:text-[10px] ${colors[status] || colors.completed}`}>
      {status}
    </span>
  );
}

function RunTypeBadge({ type }: { type: string }) {
  return (
    <span className="rounded bg-charcoal/5 px-1.5 py-0.5 font-mono text-[9px] text-warm-gray-500 sm:px-2 sm:text-[10px]">
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
          className="mt-8 overflow-hidden rounded-xl border border-warm-gray-600/30 bg-obsidian sm:mt-12"
          initial={{ opacity: 0, y: 40 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 1, ease: easing.luxury }}
        >
          {/* Window chrome */}
          <div className="flex items-center gap-1.5 border-b border-warm-gray-600/20 px-3 py-2 sm:gap-2 sm:px-4 sm:py-3">
            <div className="h-2 w-2 rounded-full bg-ruby/60" />
            <div className="h-2 w-2 rounded-full bg-amber/60" />
            <div className="h-2 w-2 rounded-full bg-emerald/60" />
            <span className="ml-2 truncate font-mono text-[10px] text-warm-gray-500 sm:ml-4 sm:text-xs">
              diamond-opus / dashboard
            </span>
          </div>

          <div className="p-3 sm:p-6">
            {/* Stats row */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
              {stats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  className="rounded-lg border border-warm-gray-600/20 bg-charcoal p-2.5 sm:p-4"
                  initial={{ opacity: 0, y: 10 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.4 + i * 0.1, duration: 0.5 }}
                >
                  <p className="font-sans text-[9px] uppercase tracking-wide text-warm-gray-400 sm:text-[10px]">
                    {stat.label}
                  </p>
                  <p className="mt-0.5 font-serif text-base font-600 text-cream sm:mt-1 sm:text-xl">{stat.value}</p>
                  {stat.change && (
                    <p className="mt-0.5 font-mono text-[10px] text-emerald sm:text-xs">{stat.change}</p>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Recent runs - card list on mobile, table on desktop */}
            <motion.div
              className="mt-4 sm:mt-6"
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ delay: 0.8, duration: 0.8 }}
            >
              <p className="mb-2 font-sans text-[10px] uppercase tracking-wide text-warm-gray-400 sm:mb-3 sm:text-xs">
                Recent Runs
              </p>

              {/* Mobile: card list */}
              <div className="space-y-2 sm:hidden">
                {recentRuns.map((run, i) => (
                  <div key={i} className="rounded-lg border border-warm-gray-600/20 bg-charcoal p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] text-cream">{run.feed}</span>
                      <StatusBadge status={run.status} />
                    </div>
                    <div className="mt-1.5 flex items-center gap-3 text-[10px] text-warm-gray-400">
                      <RunTypeBadge type={run.type} />
                      <span className="font-mono">{run.duration}</span>
                      <span className="ml-auto font-mono text-gold">{run.diamonds}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden overflow-hidden rounded-lg border border-warm-gray-600/20 sm:block">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-warm-gray-600/20 bg-charcoal">
                      <th className="px-4 py-2 text-left font-sans text-[10px] uppercase tracking-wider text-warm-gray-400">Feed</th>
                      <th className="px-4 py-2 text-left font-sans text-[10px] uppercase tracking-wider text-warm-gray-400">Type</th>
                      <th className="px-4 py-2 text-left font-sans text-[10px] uppercase tracking-wider text-warm-gray-400">Status</th>
                      <th className="px-4 py-2 text-left font-sans text-[10px] uppercase tracking-wider text-warm-gray-400">Duration</th>
                      <th className="px-4 py-2 text-right font-sans text-[10px] uppercase tracking-wider text-warm-gray-400">Diamonds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentRuns.map((run, i) => (
                      <tr key={i} className="border-b border-warm-gray-600/10 last:border-0">
                        <td className="px-4 py-2.5 font-mono text-xs text-cream">{run.feed}</td>
                        <td className="px-4 py-2.5"><RunTypeBadge type={run.type} /></td>
                        <td className="px-4 py-2.5"><StatusBadge status={run.status} /></td>
                        <td className="px-4 py-2.5 font-mono text-xs text-warm-gray-400">{run.duration}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-gold">{run.diamonds}</td>
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
