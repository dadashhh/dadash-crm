import { createFileRoute } from '@tanstack/react-router';
import { SwisscamPage } from '@/pages/SwisscamPage';

export const Route = createFileRoute('/swisscam')({ component: SwisscamPage });
