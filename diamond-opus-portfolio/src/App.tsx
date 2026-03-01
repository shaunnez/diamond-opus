import { lazy, Suspense } from 'react';
import HeroSection from './components/hero/HeroSection';
import ThesisSection from './components/hero/ThesisSection';
import GoldDivider from './components/shared/GoldDivider';

// Lazy load sections below the fold
const PipelineSection = lazy(() => import('./components/pipeline/PipelineSection'));
const HeatmapSection = lazy(() => import('./components/heatmap/HeatmapSection'));
const WorkersSection = lazy(() => import('./components/workers/WorkersSection'));
const ConsolidationSection = lazy(() => import('./components/consolidation/ConsolidationSection'));
const InfraSection = lazy(() => import('./components/infrastructure/InfraSection'));
const PerformanceSection = lazy(() => import('./components/performance/PerformanceSection'));
const DashboardSection = lazy(() => import('./components/dashboard/DashboardSection'));
const StorefrontSection = lazy(() => import('./components/storefront/StorefrontSection'));
const FooterSection = lazy(() => import('./components/footer/FooterSection'));

function SectionFallback() {
  return <div className="flex min-h-[50vh] items-center justify-center" />;
}

export default function App() {
  return (
    <main>
      {/* Section 1: Hero — full viewport, charcoal */}
      <HeroSection />

      {/* Section 2: The Thesis — cream background with stats */}
      <ThesisSection />

      <GoldDivider withDiamond />

      <Suspense fallback={<SectionFallback />}>
        {/* Section 3: The Pipeline — architecture overview */}
        <PipelineSection />

        <GoldDivider />

        {/* Section 4: Intelligent Partitioning — heatmap visualization */}
        <HeatmapSection />

        <GoldDivider withDiamond />

        {/* Section 5: Elastic Scale — worker grid */}
        <WorkersSection />

        <GoldDivider />

        {/* Section 6: Data Alchemy — consolidation */}
        <ConsolidationSection />

        <GoldDivider withDiamond />

        {/* Section 7: Infrastructure — Azure architecture */}
        <InfraSection />

        <GoldDivider />

        {/* Section 8: API Performance — caching */}
        <PerformanceSection />

        <GoldDivider withDiamond />

        {/* Section 9: Dashboard — operational intelligence */}
        <DashboardSection />

        <GoldDivider />

        {/* Section 10: Storefront — customer experience */}
        <StorefrontSection />

        {/* Section 11: Footer */}
        <FooterSection />
      </Suspense>
    </main>
  );
}
