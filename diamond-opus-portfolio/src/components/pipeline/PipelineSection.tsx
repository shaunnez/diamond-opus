import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import SectionWrapper from '../shared/SectionWrapper';
import SectionTitle from '../shared/SectionTitle';
import { easing } from '../../utils/constants';

interface PipelineStep {
  id: string;
  label: string;
  description: string;
  color: string;
}

const steps: PipelineStep[] = [
  { id: 'scheduler', label: 'Scheduler', description: 'Partitions work using adaptive density scanning', color: '#B8860B' },
  { id: 'servicebus', label: 'Service Bus', description: 'Azure Service Bus with 3 queues', color: '#0078D4' },
  { id: 'workers', label: 'Workers (x200)', description: '200 concurrent workers process one page each', color: '#B8860B' },
  { id: 'raw', label: 'Raw Storage', description: 'Feed-specific raw diamond tables', color: '#4A4A4A' },
  { id: 'consolidator', label: 'Consolidator', description: 'Maps, prices, rates, and upserts', color: '#B8860B' },
  { id: 'canonical', label: 'Canonical DB', description: 'Unified diamonds table with pricing', color: '#4A4A4A' },
  { id: 'api', label: 'API', description: 'LRU cache, ETag, <50ms responses', color: '#B8860B' },
  { id: 'clients', label: 'Clients', description: 'Dashboard + Storefront', color: '#2D6A4F' },
];

// Desktop SVG positions
const svgNodes = [
  { x: 50, y: 60 }, { x: 200, y: 60 }, { x: 380, y: 60 }, { x: 560, y: 60 },
  { x: 560, y: 180 }, { x: 380, y: 180 }, { x: 200, y: 180 }, { x: 50, y: 180 },
];

const connections = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7],
];

export default function PipelineSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <SectionWrapper id="pipeline">
      <div ref={ref}>
        <SectionTitle title="The Pipeline" subtitle="Eight steps from supplier to storefront" />

        {/* Desktop: SVG diagram */}
        <div className="mt-12 hidden md:block">
          <svg viewBox="0 0 680 260" className="mx-auto w-full max-w-[800px]" fill="none">
            {connections.map(([fromIdx, toIdx], i) => {
              const from = svgNodes[fromIdx];
              const to = svgNodes[toIdx];
              return (
                <motion.line
                  key={`conn-${i}`}
                  x1={from.x + 55} y1={from.y + 20}
                  x2={to.x + 5} y2={to.y + 20}
                  stroke="#B8860B" strokeWidth="1" strokeDasharray="4 4"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={inView ? { pathLength: 1, opacity: 0.5 } : {}}
                  transition={{ duration: 0.6, delay: 0.3 + i * 0.15 }}
                />
              );
            })}
            {steps.map((step, i) => {
              const pos = svgNodes[i];
              return (
                <motion.g
                  key={step.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={inView ? { opacity: 1, scale: 1 } : {}}
                  transition={{ duration: 0.5, delay: 0.2 + i * 0.12 }}
                >
                  <rect x={pos.x} y={pos.y} width={110} height={40} rx={8}
                    fill="#FAF9F7" stroke={step.color} strokeWidth="1.5" />
                  <text x={pos.x + 55} y={pos.y + 25} fill="#1A1A1A" fontSize="11"
                    fontFamily="Inter, sans-serif" textAnchor="middle">
                    {step.label}
                  </text>
                </motion.g>
              );
            })}
          </svg>
        </div>

        {/* Mobile: vertical step list */}
        <div className="mt-8 space-y-0 md:hidden">
          {steps.map((step, i) => (
            <motion.div
              key={step.id}
              className="relative flex items-start gap-4 py-4"
              initial={{ opacity: 0, x: -20 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.15 + i * 0.1, ease: easing.luxury }}
            >
              {/* Step number + vertical line */}
              <div className="flex flex-col items-center">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-600 text-cream"
                  style={{ backgroundColor: step.color }}
                >
                  {i + 1}
                </div>
                {i < steps.length - 1 && (
                  <div className="mt-1 h-full w-px bg-border" />
                )}
              </div>

              {/* Content */}
              <div className="min-w-0 pb-2">
                <p className="font-sans text-sm font-600 text-charcoal">{step.label}</p>
                <p className="mt-1 font-sans text-xs leading-relaxed text-warm-gray-500">
                  {step.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Annotation cards (desktop only, hidden on mobile since the vertical list already has descriptions) */}
        <div className="mt-12 hidden grid-cols-2 gap-4 md:grid lg:grid-cols-4">
          {steps.map((step, i) => (
            <motion.div
              key={step.id}
              className="rounded-lg border border-border bg-pearl p-4"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.08 }}
            >
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: step.color }} />
                <span className="font-sans text-xs font-500 uppercase tracking-[0.08em] text-warm-gray-600">
                  {step.label}
                </span>
              </div>
              <p className="mt-2 font-sans text-sm leading-relaxed text-warm-gray-500">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </SectionWrapper>
  );
}
