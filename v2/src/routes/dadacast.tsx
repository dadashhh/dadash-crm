import { createFileRoute } from '@tanstack/react-router';
import { DadacastPage } from '@/pages/DadacastPage';

export const Route = createFileRoute('/dadacast')({ component: DadacastPage });
