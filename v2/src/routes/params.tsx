import { createFileRoute } from '@tanstack/react-router';
import { ParamsPage } from '@/pages/ParamsPage';

export const Route = createFileRoute('/params')({ component: ParamsPage });
