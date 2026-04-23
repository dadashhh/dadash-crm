import { createFileRoute } from '@tanstack/react-router';
import { LiveOpsPage } from '@/pages/LiveOpsPage';

export const Route = createFileRoute('/live-ops')({ component: LiveOpsPage });
