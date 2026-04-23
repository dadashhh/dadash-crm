import { createFileRoute } from '@tanstack/react-router';
import { SpendersPage } from '@/pages/SpendersPage';

export const Route = createFileRoute('/spenders')({ component: SpendersPage });
