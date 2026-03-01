import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import SectionWrapper from '../shared/SectionWrapper';
import SectionTitle from '../shared/SectionTitle';
import { easing } from '../../utils/constants';

interface Service {
  name: string;
  type: 'app' | 'queue' | 'storage' | 'registry';
  badge?: string;
}

const containerApps: Service[] = [
  { name: 'API', type: 'app' },
  { name: 'Workers', type: 'app', badge: '0-200' },
  { name: 'Consolidator', type: 'app' },
  { name: 'Ingestion Proxy', type: 'app', badge: '1 replica' },
  { name: 'Dashboard', type: 'app' },
  { name: 'Storefront', type: 'app' },
  { name: 'Scheduler (Natural)', type: 'app' },
  { name: 'Scheduler (Lab)', type: 'app' },
];

const serviceBusQueues: Service[] = [
  { name: 'work-items', type: 'queue' },
  { name: 'work-done', type: 'queue' },
  { name: 'consolidate', type: 'queue' },
];

const storageServices: Service[] = [
  { name: 'Blob Storage (Watermarks)', type: 'storage' },
  { name: 'Container Registry', type: 'registry' },
  { name: 'PostgreSQL', type: 'storage' },
];

const cicdSteps = [
  'Typecheck',
  'Build',
  'Test',
  'Docker Build (8 images)',
  'Terraform Apply',
  'Deploy',
];

function ServiceCard({ service, delay, inView }: { service: Service; delay: number; inView: boolean }) {
  const colors: Record<Service['type'], { bg: string; border: string; text: string }> = {
    app: { bg: 'bg-pearl', border: 'border-gold/40', text: 'text-charcoal' },
    queue: { bg: 'bg-charcoal', border: 'border-azure/40', text: 'text-cream' },
    storage: { bg: 'bg-pearl', border: 'border-warm-gray-400/30', text: 'text-charcoal' },
    registry: { bg: 'bg-pearl', border: 'border-warm-gray-400/30', text: 'text-charcoal' },
  };

  const c = colors[service.type];

  return (
    <motion.div
      className={`rounded-lg border ${c.border} ${c.bg} px-4 py-3`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={inView ? { opacity: 1, scale: 1 } : {}}
      transition={{ duration: 0.5, delay, ease: easing.luxury }}
    >
      <div className="flex items-center justify-between">
        <span className={`font-sans text-sm font-500 ${c.text}`}>{service.name}</span>
        {service.badge && (
          <span className="rounded-full bg-gold/15 px-2 py-0.5 font-mono text-[10px] text-gold">
            {service.badge}
          </span>
        )}
      </div>
    </motion.div>
  );
}

export default function InfraSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <SectionWrapper id="infrastructure" dark>
      <div ref={ref}>
        <SectionTitle title="Infrastructure as Code" subtitle="Terraform-managed Azure Container Apps with KEDA scaling" light />

        <div className="mt-12 grid gap-8 lg:grid-cols-3">
          {/* Container Apps */}
          <div className="lg:col-span-2">
            <motion.div
              className="rounded-xl border border-gold/20 p-6"
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ duration: 0.8, ease: easing.luxury }}
            >
              <div className="mb-4 flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-gold" />
                <span className="font-sans text-xs uppercase tracking-[0.08em] text-warm-gray-400">
                  Container Apps Environment
                </span>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {containerApps.map((s, i) => (
                  <ServiceCard key={s.name} service={s} delay={0.2 + i * 0.08} inView={inView} />
                ))}
              </div>
            </motion.div>
          </div>

          {/* Side services */}
          <div className="space-y-4">
            {/* Service Bus */}
            <motion.div
              className="rounded-xl border border-azure/20 p-4"
              initial={{ opacity: 0, x: 20 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.5, duration: 0.8, ease: easing.luxury }}
            >
              <div className="mb-3 flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-azure" />
                <span className="font-sans text-xs uppercase tracking-[0.08em] text-warm-gray-400">
                  Service Bus
                </span>
              </div>
              <div className="space-y-2">
                {serviceBusQueues.map((q, i) => (
                  <ServiceCard key={q.name} service={q} delay={0.7 + i * 0.1} inView={inView} />
                ))}
              </div>
            </motion.div>

            {/* Storage */}
            <motion.div
              className="rounded-xl border border-warm-gray-600/30 p-4"
              initial={{ opacity: 0, x: 20 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.8, duration: 0.8, ease: easing.luxury }}
            >
              <div className="mb-3 flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-warm-gray-400" />
                <span className="font-sans text-xs uppercase tracking-[0.08em] text-warm-gray-400">
                  Data Services
                </span>
              </div>
              <div className="space-y-2">
                {storageServices.map((s, i) => (
                  <ServiceCard key={s.name} service={s} delay={1 + i * 0.1} inView={inView} />
                ))}
              </div>
            </motion.div>
          </div>
        </div>

        {/* Rate limiting callout */}
        <motion.div
          className="mt-8 rounded-lg border border-gold/20 p-4 text-center"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 1.5, duration: 0.8 }}
        >
          <p className="font-sans text-sm text-warm-gray-400">
            <span className="font-mono text-gold">Single-replica ingestion proxy</span>
            <span className="mx-2 text-warm-gray-600">—</span>
            Token bucket rate limiter (25 req/s) with FIFO queue. The single throttle point for all Nivoda API access.
          </p>
        </motion.div>

        {/* CI/CD Pipeline */}
        <motion.div
          className="mt-12"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 1.8, duration: 0.8, ease: easing.luxury }}
        >
          <h3 className="mb-6 text-center font-sans text-xs uppercase tracking-[0.12em] text-warm-gray-400">
            CI/CD Pipeline
          </h3>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {cicdSteps.map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <motion.div
                  className="rounded-md border border-warm-gray-600/30 px-4 py-2"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={inView ? { opacity: 1, scale: 1 } : {}}
                  transition={{ delay: 2 + i * 0.1, duration: 0.4 }}
                >
                  <span className="font-sans text-xs text-cream">{step}</span>
                </motion.div>
                {i < cicdSteps.length - 1 && (
                  <svg viewBox="0 0 24 24" className="h-3 w-3 text-warm-gray-600" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </SectionWrapper>
  );
}
