// ─────────────────────────────────────────────────────────────────
// ComptaTab — Onglet comptabilité pour chatter / provider / model
// Affiche: solde net, en cours, historique paiements, notifications
//
// Dépendances: @supabase/supabase-js (déjà dans le projet)
// Intégration: importer et placer dans le router/tabs de l'app
// ─────────────────────────────────────────────────────────────────
import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

// Adjust import path to your existing Supabase singleton:
// import { supabase } from '../lib/supabase';
const supabase = createClient(
  (import.meta as Record<string, unknown> & { env: Record<string, string> }).env
    .VITE_SUPABASE_URL as string,
  (import.meta as Record<string, unknown> & { env: Record<string, string> }).env
    .VITE_SUPABASE_ANON_KEY as string,
);

// ── Types ─────────────────────────────────────

interface PaymentEvent {
  id: string;
  created_at: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  currency: string;
  kind: string;
  title: string | null;
  note: string | null;
  status: 'pending' | 'paid' | 'cancelled';
}

interface LedgerEntry {
  id: string;
  created_at: string;
  entry_type: string;
  amount: number;
  currency: string;
  title: string | null;
  counterparty_user_id: string | null;
  payment_event_id: string | null;
}

interface Notification {
  id: string;
  created_at: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
}

// ── Helpers ───────────────────────────────────

const fmtAmount = (amount: number, currency = 'EUR') =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amount);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const kindLabel: Record<string, string> = {
  salary: 'Salaire',
  bonus: 'Bonus',
  adjustment: 'Ajustement',
  provider_payment: 'Paiement provider',
  payment: 'Paiement',
};

// ── Component ─────────────────────────────────

export function ComptaTab() {
  const [userId, setUserId] = useState<string | null>(null);
  const [soldeNet, setSoldeNet] = useState<number>(0);
  const [enCours, setEnCours] = useState<number>(0);
  const [payments, setPayments] = useState<PaymentEvent[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'resume' | 'historique' | 'notifs'>('resume');

  const load = useCallback(async (uid: string) => {
    setLoading(true);
    setError(null);

    // Parallel fetches
    const [ledgerRes, pendingRes, paymentsRes, notifsRes] = await Promise.all([
      // Solde net = sum of all ledger_entries
      supabase
        .from('ledger_entries')
        .select('amount, currency, entry_type, title, created_at, counterparty_user_id, payment_event_id, id')
        .eq('owner_user_id', uid)
        .order('created_at', { ascending: false })
        .limit(100),

      // En cours = payment_events where I'm receiver + pending
      supabase
        .from('payment_events')
        .select('amount, currency')
        .eq('to_user_id', uid)
        .eq('status', 'pending'),

      // Historique paiements (sent or received)
      supabase
        .from('payment_events')
        .select('id, created_at, from_user_id, to_user_id, amount, currency, kind, title, note, status')
        .or(`to_user_id.eq.${uid},from_user_id.eq.${uid}`)
        .order('created_at', { ascending: false })
        .limit(50),

      // Notifications
      supabase
        .from('notifications')
        .select('id, created_at, type, title, message, read')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

    if (ledgerRes.error) { setError(ledgerRes.error.message); setLoading(false); return; }
    if (pendingRes.error) { setError(pendingRes.error.message); setLoading(false); return; }
    if (paymentsRes.error) { setError(paymentsRes.error.message); setLoading(false); return; }
    if (notifsRes.error) { setError(notifsRes.error.message); setLoading(false); return; }

    const ledgerData = (ledgerRes.data ?? []) as LedgerEntry[];
    const net = ledgerData.reduce((acc, e) => acc + (e.amount ?? 0), 0);
    const pending = (pendingRes.data ?? []).reduce((acc: number, e: { amount: number }) => acc + (e.amount ?? 0), 0);

    setSoldeNet(net);
    setEnCours(pending);
    setLedger(ledgerData);
    setPayments((paymentsRes.data ?? []) as PaymentEvent[]);
    setNotifications((notifsRes.data ?? []) as Notification[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) load(uid);
    });
  }, [load]);

  const markRead = async (notifId: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', notifId);
    setNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, read: true } : n)),
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-zinc-400">
        Chargement…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-400 bg-red-900/20 rounded-lg">
        Erreur: {error}
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="flex flex-col gap-4 p-4 max-w-2xl mx-auto">

      {/* ── Solde + En cours ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-700">
          <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Solde net</p>
          <p className={`text-2xl font-bold ${soldeNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {fmtAmount(soldeNet)}
          </p>
        </div>
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-700">
          <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">En cours</p>
          <p className="text-2xl font-bold text-amber-400">{fmtAmount(enCours)}</p>
          <p className="text-xs text-zinc-500 mt-1">paiements pending</p>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-zinc-900 rounded-lg p-1">
        {(['resume', 'historique', 'notifs'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === tab
                ? 'bg-violet-600 text-white font-medium'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            {tab === 'resume' && 'Résumé'}
            {tab === 'historique' && 'Historique'}
            {tab === 'notifs' && (
              <span className="flex items-center justify-center gap-1">
                Notifications
                {unreadCount > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                    {unreadCount}
                  </span>
                )}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Résumé (ledger) ── */}
      {activeTab === 'resume' && (
        <div className="flex flex-col gap-2">
          {ledger.length === 0 && (
            <p className="text-zinc-500 text-center py-6">Aucun mouvement enregistré.</p>
          )}
          {ledger.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between bg-zinc-900 rounded-lg px-4 py-3 border border-zinc-800"
            >
              <div className="flex flex-col">
                <span className="text-sm text-white">
                  {entry.title ?? kindLabel[entry.entry_type] ?? entry.entry_type}
                </span>
                <span className="text-xs text-zinc-500">{fmtDate(entry.created_at)}</span>
              </div>
              <span
                className={`font-semibold text-sm ${
                  entry.amount >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {entry.amount >= 0 ? '+' : ''}
                {fmtAmount(entry.amount, entry.currency)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab: Historique paiements ── */}
      {activeTab === 'historique' && (
        <div className="flex flex-col gap-2">
          {payments.length === 0 && (
            <p className="text-zinc-500 text-center py-6">Aucun paiement trouvé.</p>
          )}
          {payments.map((p) => {
            const isReceiver = p.to_user_id === userId;
            const statusColor =
              p.status === 'paid'
                ? 'text-emerald-400'
                : p.status === 'cancelled'
                ? 'text-red-400'
                : 'text-amber-400';
            return (
              <div
                key={p.id}
                className="bg-zinc-900 rounded-lg px-4 py-3 border border-zinc-800"
              >
                <div className="flex justify-between items-start">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-white">
                      {p.title ?? kindLabel[p.kind] ?? p.kind}
                    </span>
                    <span className="text-xs text-zinc-500">{fmtDate(p.created_at)}</span>
                    {p.note && (
                      <span className="text-xs text-zinc-400 italic">{p.note}</span>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`font-semibold text-sm ${
                        isReceiver ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {isReceiver ? '+' : '-'}
                      {fmtAmount(p.amount, p.currency)}
                    </span>
                    <span className={`text-xs ${statusColor}`}>{p.status}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Tab: Notifications ── */}
      {activeTab === 'notifs' && (
        <div className="flex flex-col gap-2">
          {notifications.length === 0 && (
            <p className="text-zinc-500 text-center py-6">Aucune notification.</p>
          )}
          {notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => !n.read && markRead(n.id)}
              className={`rounded-lg px-4 py-3 border cursor-pointer transition-colors ${
                n.read
                  ? 'bg-zinc-900 border-zinc-800 opacity-60'
                  : 'bg-zinc-800 border-violet-700/50 hover:border-violet-600'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-white">{n.title}</span>
                  <span className="text-xs text-zinc-400">{n.message}</span>
                  <span className="text-xs text-zinc-500 mt-1">{fmtDate(n.created_at)}</span>
                </div>
                {!n.read && (
                  <span className="mt-1 w-2 h-2 rounded-full bg-violet-500 shrink-0" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Refresh ── */}
      <button
        onClick={() => userId && load(userId)}
        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors text-center py-2"
      >
        Actualiser
      </button>
    </div>
  );
}
