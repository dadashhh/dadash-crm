import { createFileRoute } from '@tanstack/react-router';
import { MessageriePage } from '@/pages/MessageriePage';

export const Route = createFileRoute('/messagerie')({ component: MessageriePage });
