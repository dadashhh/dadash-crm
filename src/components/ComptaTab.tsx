// ─────────────────────────────────────────────────────────────────────────────
// ComptaTab — Onglet comptabilite pour chatter / provider / model / gerant
//
// Affiche: solde net, en cours, historique paiements, notifications (3 types)
// Notifications:
//   - kind = 'tx'      => onglet TX        (transactions, mouvements)
//   - kind = 'spender' => onglet Spenders  (alertes spenders)
//   - kind = 'payment' => onglet Paiements (paiements internes)
//   - kind IS NULL     => assimile a 'tx'  (backward compat)
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

// Adjust to your existing Supabase singleton:
// import { supabase } from '../lib/supabase';
const supabase = createClient(
  (import.meta as Record<string, unknown> & { env: Record<string, string> }).env
    .VITE_SUPABASE_URL as string,
  (import.meta as Record<string, unknown> & { env: Record<string, string> }).env
    .VITE_SUPABASE_ANON_KEY as string,
);

// ── Types ─────────────────────────────────────────────────────────────────────

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
  // is_read is the canonical column; read is kept for backward compat
  is_read: boolean;
  read: boolean;
  // kind drives the 3-tab system; NULL is treated as 'tx'
  kind: 'tx' | 'spender' | 'payment' | null;
}

type NotifCategory = 'tx' | 'spender' | 'payment';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

/** Effective category for a notification (NULL => 'tx') */
const notifEffectiveKind = (n: Notification): NotifCategory =>
  (n.kind ?? 'tx') as NotifCategory;

// ── Component ─────────────────────────────────────────────────────────────────

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
  // Active category within the notifications tab
  const [notifCategory, setNotifCategory] = useState<NotifCategory>('payment');

  // ── Data loading ──────────────────────────────────────────────────────────

  const load = useCallback(async (uid: string) => {
    setLoading(true);
    setError(null);

    const [ledgerRes, pendingRes, paymentsRes, notifsRes] = await Promise.all([
      // Solde net
      supabase
        .from('ledger_entries')
        .select('amount, currency, entry_type, title, created_at, counterparty_user_id, payment_event_id, id')
        .eq('owner_user_id', uid)
        .order('created_at', { ascending: false })
        .limit(100),

      // En cours (payment_events pending)
      supabase
        .from('payment_events')
        .select('amount, currency')
        .eq('to_user_id', uid)
        .eq('status', 'pending'),

      // Historique paiements
      supabase
        .from('payment_events')
        .select('id, created_at, from_user_id, to_user_id, amount, currency, kind, title, note, status')
        .or(`to_user_id.eq.${uid},from_user_id.eq.${uid}`)
        .order('created_at', { ascending: false })
        .limit(50),

      // Notifications — inclut kind + is_read
      supabase
        .from('notifications')
        .select('id, created_at, type, title, message, read, is_read, kind')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    if (ledgerRes.error)    { setError(ledgerRes.error.message);    setLoading(false); return; }
    if (pendingRes.error)   { setError(pendingRes.error.message);   setLoading(false); return; }
    if (paymentsRes.error)  { setError(paymentsRes.error.message);  setLoading(false); return; }
    if (notifsRes.error)    { setError(notifsRes.error.message);    setLoading(false); return; }

    const ledgerData = (ledgerRes.data ?? []) as LedgerEntry[];
    // Balance: receiver_credit adds, payer_debit subtracts (amounts always positive)
    const net = ledgerData.reduce((acc, e) =>
      acc + (e.entry_type === 'receiver_credit' ? e.amount : -e.amount), 0);
    const pending = (pendingRes.data ?? []).reduce(
      (acc: number, e: { amount: number }) => acc + (e.amount ?? 0), 0);

    setSoldeNet(net);
    setEnCours(pending);
    setLedger(ledgerData);
    setPayments((paymentsRes.data ?? []) as PaymentEvent[]);

    // Normalize notifications: ensure is_read mirrors read when is_read is missing
    const rawNotifs = (notifsRes.data ?? []) as Array<Notification & { is_read?: boolean }>;
    const normalizedNotifs: Notification[] = rawNotifs.map((n) => ({
      ...n,
      is_read: n.is_read ?? n.read ?? false,
      read:    n.read    ?? n.is_read ?? false,
    }));
    setNotifications(normalizedNotifs);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) load(uid);
    });
  }, [load]);

  // ── Actions ───────────────────────────────────────────────────────────────

  /** Mark a single notification as read (updates both is_read and read). */
  const markRead = async (notifId: string) => {
    await supabase
      .from('notifications')
      .update({ is_read: true, read: true })
      .eq('id', notifId);
    setNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, is_read: true, read: true } : n)),
    );
  };

  /**
   * Mark all unread notifications of a category as read.
   * Uses the SECURITY DEFINER RPC which handles the 'tx' / NULL equivalence.
   */
  const markAllRead = async (category: NotifCategory) => {
    await supabase.rpc('rpc_mark_notifications_read', { p_kind: category });
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.is_read) return n;
        if (notifEffectiveKind(n) === category) {
          return { ...n, is_read: true, read: true };
        }
        return n;
      }),
    );
  };

  // ── Derived counts ────────────────────────────────────────────────────────

  const txUnread       = notifications.filter((n) => notifEffectiveKind(n) === 'tx'      && !n.is_read).length;
  const spenderUnread  = notifications.filter((n) => notifEffectiveKind(n) === 'spender' && !n.is_read).length;
  const paymentUnread  = notifications.filter((n) => notifEffectiveKind(n) === 'payment' && !n.is_read).length;
  const totalUnread    = notifications.filter((n) => !n.is_read).length;

  const unreadByCat: Record<NotifCategory, number> = {
    tx:      txUnread,
    spender: spenderUnread,
    payment: paymentUnread,
  };

  const filteredNotifs = notifications.filter(
    (n) => notifEffectiveKind(n) === notifCategory,
  );

  // ── Render guards ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-zinc-400">
        Chargement...
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

  // ── UI ────────────────────────────────────────────────────────────────────

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

      {/* ── Onglets principaux ── */}
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
            {tab === 'resume'    && 'Resume'}
            {tab === 'historique' && 'Historique'}
            {tab === 'notifs' && (
              <span className="flex items-center justify-center gap-1">
                Notifications
                {totalUnread > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                    {totalUnread}
                  </span>
                )}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Resume (ledger) ── */}
      {activeTab === 'resume' && (
        <div className="flex flex-col gap-2">
          {ledger.length === 0 && (
            <p className="text-zinc-500 text-center py-6">Aucun mouvement enregistre.</p>
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
                  entry.entry_type === 'receiver_credit' ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {entry.entry_type === 'receiver_credit' ? '+' : '-'}
                {fmtAmount(Math.abs(entry.amount), entry.currency)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab: Historique paiements ── */}
      {activeTab === 'historique' && (
        <div className="flex flex-col gap-2">
          {payments.length === 0 && (
            <p className="text-zinc-500 text-center py-6">Aucun paiement trouve.</p>
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
        <div className="flex flex-col gap-3">

          {/* Category chips + mark-all-read */}
          <div className="flex items-center gap-2 flex-wrap">
            {(
              [
                { cat: 'payment' as const, label: 'Paiements' },
                { cat: 'tx'      as const, label: 'TX'        },
                { cat: 'spender' as const, label: 'Spenders'  },
              ] as { cat: NotifCategory; label: string }[]
            ).map(({ cat, label }) => {
              const count = unreadByCat[cat];
              const active = notifCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setNotifCategory(cat)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    active
                      ? 'bg-violet-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                  }`}
                >
                  {label}
                  {count > 0 && (
                    <span
                      className={`min-w-[16px] h-4 flex items-center justify-center rounded-full text-[10px] font-bold px-1 ${
                        active ? 'bg-white text-violet-600' : 'bg-red-500 text-white'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Mark all read — current category */}
            {unreadByCat[notifCategory] > 0 && (
              <button
                onClick={() => markAllRead(notifCategory)}
                className="ml-auto text-xs text-zinc-500 hover:text-zinc-200 transition-colors underline underline-offset-2"
              >
                Tout marquer lu
              </button>
            )}
          </div>

          {/* Notification feed for active category */}
          {filteredNotifs.length === 0 ? (
            <p className="text-zinc-500 text-center py-6">
              Aucune notification
              {notifCategory === 'payment' ? ' de paiement' :
               notifCategory === 'spender' ? ' spender'     : ' TX'}.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredNotifs.map((n) => (
                <div
                  key={n.id}
                  onClick={() => !n.is_read && markRead(n.id)}
                  className={`rounded-lg px-4 py-3 border transition-colors ${
                    n.is_read
                      ? 'bg-zinc-900 border-zinc-800 opacity-60 cursor-default'
                      : 'bg-zinc-800 border-violet-700/50 hover:border-violet-500 cursor-pointer'
                  }`}
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-sm font-medium text-white truncate">{n.title}</span>
                      <span className="text-xs text-zinc-400 leading-relaxed">{n.message}</span>
                      <span className="text-xs text-zinc-500 mt-1">{fmtDate(n.created_at)}</span>
                    </div>
                    {!n.is_read && (
                      <span className="mt-1 w-2 h-2 rounded-full bg-violet-500 shrink-0" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
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
