import { createFileRoute } from '@tanstack/react-router';
import { ZooMapPage } from '@/pages/ZooMapPage';

export const Route = createFileRoute('/zoo-map')({ component: ZooMapPage });
