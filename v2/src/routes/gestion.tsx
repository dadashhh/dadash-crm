import { createFileRoute } from '@tanstack/react-router';
import { GestionPage } from '@/pages/GestionPage';

export const Route = createFileRoute('/gestion')({ component: GestionPage });
