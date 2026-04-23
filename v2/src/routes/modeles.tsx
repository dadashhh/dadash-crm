import { createFileRoute } from '@tanstack/react-router';
import { ModelesPage } from '@/pages/ModelesPage';

export const Route = createFileRoute('/modeles')({ component: ModelesPage });
