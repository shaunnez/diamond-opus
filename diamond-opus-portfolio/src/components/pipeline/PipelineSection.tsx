import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import SectionWrapper from '../shared/SectionWrapper';
import SectionTitle from '../shared/SectionTitle';

interface PipelineNode {
  id: string;
  label: string;
  icon: string;
  x: number;
  y: number;
  color: string;
}

interface Connection {
  from: string;
  to: string;
}

const nodes: PipelineNode[] = [
  { id: 'scheduler', label: 'Scheduler', icon: 'clock', x: 50, y: 60, color: '#B8860B' },
  { id: 'servicebus', label: 'Service Bus', icon: 'layers', x: 200, y: 60, color: '#0078D4' },
  { id: 'workers', label: 'Workers (x200)', icon: 'grid', x: 380, y: 60, color: '#B8860B' },
  { id: 'raw', label: 'Raw Storage', icon: 'db', x: 560, y: 60, color: '#4A4A4A' },
  { id: 'consolidator', label: 'Consolidator', icon: 'merge', x: 560, y: 180, color: '#B8860B' },
  { id: 'canonical', label: 'Canonical DB', icon: 'db', x: 380, y: 180, color: '#4A4A4A' },
  { id: 'api', label: 'API', icon: 'server', x: 200, y: 180, color: '#B8860B' },
  { id: 'clients', label: 'Clients', icon: 'users', x: 50, y: 180, color: '#2D6A4F' },
];

const connections: Connection[] = [
  { from: 'scheduler', to: 'servicebus' },
  { from: 'servicebus', to: 'workers' },
  { from: 'workers', to: 'raw' },
  { from: 'raw', to: 'consolidator' },
  { from: 'consolidator', to: 'canonical' },
  { from: 'canonical', to: 'api' },
  { from: 'api', to: 'clients' },
];

const annotations: Record<string, string> = {
  scheduler: 'Partitions work using adaptive density scanning',
  servicebus: 'Azure Service Bus with 3 queues',
  workers: '200 concurrent workers process one page each',
  raw: 'Feed-specific raw diamond tables',
  consolidator: 'Maps, prices, rates, and upserts',
  canonical: 'Unified diamonds table with pricing',
  api: 'LRU cache, ETag, <50ms responses',
  clients: 'Dashboard + Storefront',
};

function NodeIcon({ icon, color }: { icon: string; color: string }) {
  const paths: Record<string, string> = {
    clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4v6l4 2',
    layers: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
    grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    db: 'M12 2C6.5 2 2 4 2 6.5V17.5C2 20 6.5 22 12 22s10-2 10-4.5V6.5C22 4 17.5 2 12 2zM2 10c0 2.5 4.5 4.5 10 4.5s10-2 10-4.5',
    merge: 'M18 8A3 3 0 1 0 12 8a3 3 0 0 0 6 0zM6 15a3 3 0 1 0 6 0 3 3 0 0 0-6 0zM8.6 13.5l5-3',
    server: 'M2 4h20v5H2zM2 13h20v5H2zM6 6.5h.01M6 15.5h.01',
    users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  };

  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[icon] || paths.server} />
    </svg>
  );
}

export default function PipelineSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  return (
    <SectionWrapper id="pipeline">
      <div ref={containerRef}>
        <SectionTitle title="The Pipeline" subtitle="Eight steps from supplier to storefront" />

        {/* SVG Diagram */}
        <div className="relative mt-12 overflow-x-auto">
          <svg viewBox="0 0 680 260" className="mx-auto w-full max-w-[800px]" fill="none">
            {/* Connections */}
            {connections.map((conn, i) => {
              const from = nodes.find((n) => n.id === conn.from)!;
              const to = nodes.find((n) => n.id === conn.to)!;
              const fromX = from.x + 55;
              const fromY = from.y + 20;
              const toX = to.x + 5;
              const toY = to.y + 20;

              return (
                <motion.line
                  key={`${conn.from}-${conn.to}`}
                  x1={fromX}
                  y1={fromY}
                  x2={toX}
                  y2={toY}
                  stroke="#B8860B"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  initial={{ pathLength: 0, opacity: 0 }}
                  whileInView={{ pathLength: 1, opacity: 0.5 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.3 + i * 0.15 }}
                />
              );
            })}

            {/* Particles flowing along connections */}
            {connections.map((conn, i) => {
              const from = nodes.find((n) => n.id === conn.from)!;
              const to = nodes.find((n) => n.id === conn.to)!;

              return (
                <motion.circle
                  key={`particle-${conn.from}-${conn.to}`}
                  r="3"
                  fill="#D4A94C"
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: [0, 1, 1, 0] }}
                  viewport={{ once: true }}
                  transition={{
                    duration: 2,
                    delay: 1.5 + i * 0.3,
                    repeat: Infinity,
                    repeatDelay: 1,
                  }}
                  style={{
                    offsetPath: `path('M ${from.x + 55} ${from.y + 20} L ${to.x + 5} ${to.y + 20}')`,
                  }}
                  animate={{
                    offsetDistance: ['0%', '100%'],
                  }}
                />
              );
            })}

            {/* Nodes */}
            {nodes.map((node, i) => (
              <motion.g
                key={node.id}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 + i * 0.12 }}
              >
                <rect
                  x={node.x}
                  y={node.y}
                  width={110}
                  height={40}
                  rx={8}
                  fill="#FAF9F7"
                  stroke={node.color}
                  strokeWidth="1.5"
                />
                <foreignObject x={node.x + 8} y={node.y + 8} width={24} height={24}>
                  <NodeIcon icon={node.icon} color={node.color} />
                </foreignObject>
                <text
                  x={node.x + 36}
                  y={node.y + 25}
                  fill="#1A1A1A"
                  fontSize="11"
                  fontFamily="Inter, sans-serif"
                >
                  {node.label}
                </text>
              </motion.g>
            ))}
          </svg>
        </div>

        {/* Annotations */}
        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {nodes.map((node, i) => (
            <motion.div
              key={node.id}
              className="rounded-lg border border-border bg-pearl p-4"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.08 }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: node.color }}
                />
                <span className="font-sans text-xs font-500 uppercase tracking-[0.08em] text-warm-gray-600">
                  {node.label}
                </span>
              </div>
              <p className="mt-2 font-sans text-sm leading-relaxed text-warm-gray-500">
                {annotations[node.id]}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </SectionWrapper>
  );
}
