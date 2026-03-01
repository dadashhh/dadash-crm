// =============================================================================
// ComptaTab -- Onglet comptabilite / paiements internes
//
// Roles supportes : gerant | chatter | model | provider
//
// Flows:
//   A. Gerant -> chatter/model   : salary/bonus/adjustment
//   B. Provider -> gerant        : provider_deposit / declaration
//   Sur status=confirmed: ledger_entries (debit + credit), notif emetteur
//   Sur status=rejected/cancelled: notif emetteur, pas de ledger
//
// Onglets:
//   Resume     -- ledger_entries (solde)
//   Paiements  -- payment_events avec boutons Confirmer/Refuser
//              -- formulaire de declaration pour provider
//   Notifs     -- 3 categories: Paiements | TX | Spenders
//
// Dates: affichees en timezone du viewer (profiles.timezone)
// =============================================================================
import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// Replace with your app's Supabase singleton if available:
// import { supabase } from '../lib/supabase';
const supabase = createClient(
  (import.meta as Record<string, unknown> & { env: Record<string, string> }).env
    .VITE_SUPABASE_URL as string,
  (import.meta as Record<string, unknown> & { env: Record<string, string> }).env
    .VITE_SUPABASE_ANON_KEY as string,
);

// =============================================================================
// Types
// =============================================================================

interface UserProfile {
  id: string;
  name: string | null;
  username: string | null;
  role: string;
  timezone: string | null;
}

interface PaymentEvent {
  id: string;
  created_at: string;
  created_by: string | null;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  currency: string;
  kind: string;
  title: string | null;
  note: string;
  status: 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'paid' | 'validated' | 'declared';
  confirmed_at: string | null;
  rejected_at: string | null;
  rejected_reason: string;
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
  is_read: boolean;
  read: boolean;
  kind: 'tx' | 'spender' | 'payment' | null;
}

interface PaymentKpis {
  pending_incoming_count: number;
  pending_incoming_amount: number;
  pending_outgoing_count: number;
  received_30d: number;
  paid_30d: number;
}

type NotifCategory = 'tx' | 'spender' | 'payment';
type MainTab = 'resume' | 'paiements' | 'notifs';

// =============================================================================
// Helpers
// =============================================================================

const KIND_LABELS: Record<string, string> = {
  salary:           'Salaire',
  bonus:            'Bonus',
  adjustment:       'Ajustement',
  provider_deposit: 'Depot provider',
  provider_payment: 'Paiement provider',
  declaration:      'Declaration',
  payment:          'Paiement',
};

const STATUS_LABELS: Record<string, string> = {
  pending:   'En attente',
  confirmed: 'Confirme',
  rejected:  'Refuse',
  cancelled: 'Annule',
  paid:      'Paye',
  validated: 'Valide',
  declared:  'Declare',
};

const fmtAmount = (amount: number, currency = 'EUR') =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amount);

/** Format date with optional viewer timezone */
const fmtDate = (iso: string, tz?: string | null) =>
  new Intl.DateTimeFormat('fr-FR', {
    day:      '2-digit',
    month:    '2-digit',
    year:     'numeric',
    hour:     '2-digit',
    minute:   '2-digit',
    timeZone: tz ?? undefined,
  }).format(new Date(iso));

const notifEffectiveKind = (n: Notification): NotifCategory =>
  (n.kind ?? 'tx') as NotifCategory;

// =============================================================================
// Component
// =============================================================================

export function ComptaTab() {
  // Auth + profile
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const userId = profile?.id ?? null;
  const userRole = profile?.role ?? '';
  const userTz = profile?.timezone ?? null;

  // Data
  const [soldeNet, setSoldeNet] = useState(0);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [payments, setPayments] = useState<PaymentEvent[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [kpis, setKpis] = useState<PaymentKpis | null>(null);
  const [gerantProfiles, setGerantProfiles] = useState<UserProfile[]>([]);

  // UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MainTab>('paiements');
  const [notifCategory, setNotifCategory] = useState<NotifCategory>('payment');

  // Action state
  const [actingOn, setActingOn] = useState<Set<string>>(new Set());
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showDeclareForm, setShowDeclareForm] = useState(false);
  const [declareForm, setDeclareForm] = useState({
    to_user_id: '',
    amount: '',
    currency: 'EUR',
    kind: 'provider_deposit',
    note: '',
  });
  const [declareError, setDeclareError] = useState<string | null>(null);
  const [declareLoading, setDeclareLoading] = useState(false);

  const rejectInputRef = useRef<HTMLInputElement>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async (uid: string, role: string) => {
    setLoading(true);
    setError(null);

    const isGerant = ['gerant','admin','ceo'].includes(role);

    const [ledgerRes, paymentsRes, notifsRes, kpisRes] = await Promise.all([
      // Ledger entries for balance
      supabase
        .from('ledger_entries')
        .select('id, created_at, entry_type, amount, currency, title, counterparty_user_id, payment_event_id')
        .eq('owner_user_id', uid)
        .order('created_at', { ascending: false })
        .limit(100),

      // Payment events (gerant sees all, others see only their own via RLS)
      supabase
        .from('payment_events')
        .select('id, created_at, created_by, from_user_id, to_user_id, amount, currency, kind, title, note, status, confirmed_at, rejected_at, rejected_reason')
        .or(isGerant ? 'status.neq.deleted' : `from_user_id.eq.${uid},to_user_id.eq.${uid}`)
        .order('created_at', { ascending: false })
        .limit(100),

      // Notifications
      supabase
        .from('notifications')
        .select('id, created_at, type, title, message, read, is_read, kind')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(100),

      // KPIs
      supabase.rpc('rpc_my_payment_kpis'),
    ]);

    if (ledgerRes.error)   { setError(ledgerRes.error.message);   setLoading(false); return; }
    if (paymentsRes.error) { setError(paymentsRes.error.message); setLoading(false); return; }
    if (notifsRes.error)   { setError(notifsRes.error.message);   setLoading(false); return; }

    // Balance
    const entries = (ledgerRes.data ?? []) as LedgerEntry[];
    const net = entries.reduce(
      (acc, e) => acc + (e.entry_type === 'receiver_credit' ? e.amount : -e.amount), 0
    );
    setSoldeNet(net);
    setLedger(entries);

    setPayments((paymentsRes.data ?? []) as PaymentEvent[]);

    // Normalize notifications
    const rawNotifs = (notifsRes.data ?? []) as Array<Notification & { is_read?: boolean }>;
    setNotifications(rawNotifs.map((n) => ({
      ...n,
      is_read: n.is_read ?? n.read ?? false,
      read:    n.read    ?? n.is_read ?? false,
    })));

    if (kpisRes.data) setKpis(kpisRes.data as PaymentKpis);

    setLoading(false);
  }, []);

  // Initial load: get profile first, then data
  useEffect(() => {
    const init = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id;
      if (!uid) { setLoading(false); return; }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, name, username, role, timezone')
        .eq('id', uid)
        .single();

      const p = profileData as UserProfile | null;
      setProfile(p);

      if (p) {
        await load(p.id, p.role);

        // For providers: fetch gerant list for declaration form
        if (p.role === 'provider') {
          const { data: gerants } = await supabase
            .from('profiles')
            .select('id, name, username, role, timezone')
            .in('role', ['gerant','admin','ceo']);
          setGerantProfiles((gerants ?? []) as UserProfile[]);
        }
      }
    };
    init();
  }, [load]);

  // ── Derived ───────────────────────────────────────────────────────────────

  // Payments pending my action (I am the receiver)
  const pendingToConfirm = payments.filter(
    (p) => p.to_user_id === userId && p.status === 'pending'
  );

  // Notification counts
  const txUnread      = notifications.filter((n) => notifEffectiveKind(n) === 'tx'      && !n.is_read).length;
  const spenderUnread = notifications.filter((n) => notifEffectiveKind(n) === 'spender' && !n.is_read).length;
  const paymentUnread = notifications.filter((n) => notifEffectiveKind(n) === 'payment' && !n.is_read).length;
  const totalUnread   = notifications.filter((n) => !n.is_read).length;
  const unreadByCat: Record<NotifCategory, number> = {
    tx: txUnread, spender: spenderUnread, payment: paymentUnread,
  };
  const filteredNotifs = notifications.filter((n) => notifEffectiveKind(n) === notifCategory);

  // ── Actions ───────────────────────────────────────────────────────────────

  const setActing = (id: string, on: boolean) =>
    setActingOn((prev) => { const s = new Set(prev); on ? s.add(id) : s.delete(id); return s; });

  const confirm = async (id: string) => {
    setActing(id, true);
    const { error: e } = await supabase.rpc('rpc_confirm_payment_event', { p_id: id });
    if (e) { alert('Erreur: ' + e.message); setActing(id, false); return; }
    setPayments((prev) =>
      prev.map((p) => p.id === id ? { ...p, status: 'confirmed', confirmed_at: new Date().toISOString() } : p)
    );
    setActing(id, false);
    if (userId && userRole) load(userId, userRole); // refresh kpis + ledger
  };

  const openReject = (id: string) => {
    setRejectingId(id);
    setRejectReason('');
    setTimeout(() => rejectInputRef.current?.focus(), 50);
  };

  const submitReject = async () => {
    if (!rejectingId) return;
    setActing(rejectingId, true);
    const { error: e } = await supabase.rpc('rpc_reject_payment_event', {
      p_id: rejectingId, p_reason: rejectReason,
    });
    if (e) { alert('Erreur: ' + e.message); setActing(rejectingId, false); return; }
    setPayments((prev) =>
      prev.map((p) => p.id === rejectingId ? { ...p, status: 'rejected', rejected_at: new Date().toISOString(), rejected_reason: rejectReason } : p)
    );
    setActing(rejectingId, false);
    setRejectingId(null);
    setRejectReason('');
  };

  const cancelPayment = async (id: string) => {
    if (!confirm('Annuler ce paiement ?')) return;
    setActing(id, true);
    const { error: e } = await supabase.rpc('rpc_cancel_payment_event', { p_id: id });
    if (e) { alert('Erreur: ' + e.message); setActing(id, false); return; }
    setPayments((prev) =>
      prev.map((p) => p.id === id ? { ...p, status: 'cancelled' } : p)
    );
    setActing(id, false);
  };

  const submitDeclare = async () => {
    setDeclareError(null);
    const amt = parseFloat(declareForm.amount);
    if (!declareForm.to_user_id) { setDeclareError('Selectionnez un destinataire'); return; }
    if (isNaN(amt) || amt <= 0)  { setDeclareError('Montant invalide');             return; }

    setDeclareLoading(true);
    const { error: e } = await supabase.rpc('rpc_create_payment_event', {
      p_to_user_id: declareForm.to_user_id,
      p_amount:     amt,
      p_currency:   declareForm.currency,
      p_kind:       declareForm.kind,
      p_note:       declareForm.note,
    });
    setDeclareLoading(false);

    if (e) { setDeclareError(e.message); return; }

    setShowDeclareForm(false);
    setDeclareForm({ to_user_id: '', amount: '', currency: 'EUR', kind: 'provider_deposit', note: '' });
    if (userId && userRole) load(userId, userRole);
  };

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true, read: true }).eq('id', id);
    setNotifications((prev) =>
      prev.map((n) => n.id === id ? { ...n, is_read: true, read: true } : n)
    );
  };

  const markAllRead = async (category: NotifCategory) => {
    await supabase.rpc('rpc_mark_notifications_read', { p_kind: category });
    setNotifications((prev) =>
      prev.map((n) =>
        n.is_read || notifEffectiveKind(n) !== category
          ? n
          : { ...n, is_read: true, read: true }
      )
    );
  };

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
      <div className="p-4 text-red-400 bg-red-900/20 rounded-lg text-sm">
        Erreur: {error}
      </div>
    );
  }

  // ── UI ────────────────────────────────────────────────────────────────────

  const isGerant   = ['gerant','admin','ceo'].includes(userRole);
  const isProvider = userRole === 'provider';

  return (
    <div className="flex flex-col gap-4 p-4 max-w-2xl mx-auto">

      {/* ── KPI Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        {/* Balance */}
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700">
          <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Solde</p>
          <p className={`text-lg font-bold ${soldeNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {fmtAmount(soldeNet)}
          </p>
        </div>

        {/* Pending incoming */}
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700">
          <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">En attente</p>
          <p className="text-lg font-bold text-amber-400">
            {kpis ? fmtAmount(kpis.pending_incoming_amount) : '...'}
          </p>
          {kpis && kpis.pending_incoming_count > 0 && (
            <p className="text-xs text-zinc-500">
              {kpis.pending_incoming_count} paiement{kpis.pending_incoming_count > 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Received 30d */}
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700">
          <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Recu 30j</p>
          <p className="text-lg font-bold text-violet-400">
            {kpis ? fmtAmount(kpis.received_30d) : '...'}
          </p>
        </div>
      </div>

      {/* ── Main tabs ──────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-zinc-900 rounded-lg p-1">
        {(
          [
            { id: 'paiements' as const, label: 'Paiements' },
            { id: 'resume'    as const, label: 'Solde' },
            { id: 'notifs'    as const, label: 'Notifications' },
          ] as { id: MainTab; label: string }[]
        ).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === id
                ? 'bg-violet-600 text-white font-medium'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            {id === 'notifs' ? (
              <span className="flex items-center justify-center gap-1">
                {label}
                {totalUnread > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                    {totalUnread}
                  </span>
                )}
              </span>
            ) : id === 'paiements' && pendingToConfirm.length > 0 ? (
              <span className="flex items-center justify-center gap-1">
                {label}
                <span className="bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                  {pendingToConfirm.length}
                </span>
              </span>
            ) : label}
          </button>
        ))}
      </div>

      {/* ================================================================ */}
      {/* Tab: Paiements                                                   */}
      {/* ================================================================ */}
      {activeTab === 'paiements' && (
        <div className="flex flex-col gap-4">

          {/* Provider: declare payment form toggle */}
          {isProvider && (
            <div>
              {!showDeclareForm ? (
                <button
                  onClick={() => setShowDeclareForm(true)}
                  className="w-full py-2.5 rounded-lg border border-dashed border-violet-700 text-violet-400 text-sm hover:bg-violet-900/20 transition-colors"
                >
                  + Declarer un paiement
                </button>
              ) : (
                <div className="bg-zinc-900 rounded-xl border border-violet-700/50 p-4 flex flex-col gap-3">
                  <p className="text-sm font-medium text-white">Declarer un paiement</p>

                  {/* Recipient */}
                  <div>
                    <label className="text-xs text-zinc-400 mb-1 block">Destinataire</label>
                    <select
                      value={declareForm.to_user_id}
                      onChange={(e) => setDeclareForm((f) => ({ ...f, to_user_id: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                    >
                      <option value="">Selectionnez...</option>
                      {gerantProfiles.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name ?? g.username ?? g.id} ({g.role})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Amount + Currency */}
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-zinc-400 mb-1 block">Montant</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={declareForm.amount}
                        onChange={(e) => setDeclareForm((f) => ({ ...f, amount: e.target.value }))}
                        placeholder="0.00"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div className="w-24">
                      <label className="text-xs text-zinc-400 mb-1 block">Devise</label>
                      <select
                        value={declareForm.currency}
                        onChange={(e) => setDeclareForm((f) => ({ ...f, currency: e.target.value }))}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                      >
                        <option>EUR</option>
                        <option>USD</option>
                        <option>CHF</option>
                        <option>GBP</option>
                      </select>
                    </div>
                  </div>

                  {/* Note */}
                  <div>
                    <label className="text-xs text-zinc-400 mb-1 block">Note (optionnel)</label>
                    <input
                      type="text"
                      value={declareForm.note}
                      onChange={(e) => setDeclareForm((f) => ({ ...f, note: e.target.value }))}
                      placeholder="Reference, periode..."
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                    />
                  </div>

                  {declareError && (
                    <p className="text-xs text-red-400">{declareError}</p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={submitDeclare}
                      disabled={declareLoading}
                      className="flex-1 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-50 transition-colors"
                    >
                      {declareLoading ? 'Envoi...' : 'Envoyer'}
                    </button>
                    <button
                      onClick={() => setShowDeclareForm(false)}
                      className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm hover:text-white transition-colors"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Rejection reason input (inline, when rejecting) */}
          {rejectingId && (
            <div className="bg-zinc-900 rounded-xl border border-red-700/50 p-4 flex flex-col gap-3">
              <p className="text-sm font-medium text-white">Motif du refus (optionnel)</p>
              <input
                ref={rejectInputRef}
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitReject()}
                placeholder="Ex: montant incorrect, periode en attente..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              />
              <div className="flex gap-2">
                <button
                  onClick={submitReject}
                  disabled={actingOn.has(rejectingId)}
                  className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-500 disabled:opacity-50 transition-colors"
                >
                  {actingOn.has(rejectingId) ? '...' : 'Confirmer le refus'}
                </button>
                <button
                  onClick={() => setRejectingId(null)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm hover:text-white transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* Pending to confirm section */}
          {pendingToConfirm.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-zinc-400 uppercase tracking-wide">
                A confirmer ({pendingToConfirm.length})
              </p>
              {pendingToConfirm.map((p) => (
                <div
                  key={p.id}
                  className="bg-zinc-800 rounded-lg border border-amber-700/50 px-4 py-3"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-sm font-medium text-white">
                        {p.title ?? KIND_LABELS[p.kind] ?? p.kind}
                      </span>
                      <span className="text-sm text-emerald-400 font-semibold">
                        +{fmtAmount(p.amount, p.currency)}
                      </span>
                      {p.note && (
                        <span className="text-xs text-zinc-400 italic">{p.note}</span>
                      )}
                      <span className="text-xs text-zinc-500">{fmtDate(p.created_at, userTz)}</span>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => confirm(p.id)}
                        disabled={actingOn.has(p.id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500 disabled:opacity-50 transition-colors"
                      >
                        {actingOn.has(p.id) ? '...' : 'Confirmer'}
                      </button>
                      <button
                        onClick={() => openReject(p.id)}
                        disabled={actingOn.has(p.id) || rejectingId === p.id}
                        className="px-3 py-1.5 rounded-lg bg-red-700/60 text-red-300 text-xs font-medium hover:bg-red-600/60 disabled:opacity-50 transition-colors"
                      >
                        Refuser
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Full payments history */}
          <div className="flex flex-col gap-2">
            {pendingToConfirm.length > 0 && (
              <p className="text-xs text-zinc-400 uppercase tracking-wide">Historique</p>
            )}
            {payments.filter((p) => p.status !== 'pending' || p.to_user_id !== userId).length === 0
              && pendingToConfirm.length === 0 && (
              <p className="text-zinc-500 text-center py-6">Aucun paiement.</p>
            )}
            {payments
              .filter((p) => !(p.status === 'pending' && p.to_user_id === userId))
              .map((p) => {
                const isReceiver  = p.to_user_id === userId;
                const isSender    = p.from_user_id === userId;
                const isConfirmed = ['confirmed','paid','validated'].includes(p.status);
                const isRejected  = ['rejected','cancelled'].includes(p.status);
                const isPending   = p.status === 'pending';
                const canCancel   =
                  isPending &&
                  (p.created_by === userId || p.from_user_id === userId) &&
                  !isReceiver;

                return (
                  <div
                    key={p.id}
                    className={`rounded-lg px-4 py-3 border ${
                      isRejected ? 'bg-zinc-900 border-zinc-800 opacity-60' : 'bg-zinc-900 border-zinc-800'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-sm font-medium text-white truncate">
                          {p.title ?? KIND_LABELS[p.kind] ?? p.kind}
                        </span>
                        {p.note && (
                          <span className="text-xs text-zinc-400 italic">{p.note}</span>
                        )}
                        {isRejected && p.rejected_reason && (
                          <span className="text-xs text-red-400">Motif: {p.rejected_reason}</span>
                        )}
                        <span className="text-xs text-zinc-500">
                          {fmtDate(
                            isConfirmed && p.confirmed_at ? p.confirmed_at : p.created_at,
                            userTz
                          )}
                        </span>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`font-semibold text-sm ${
                            isReceiver ? 'text-emerald-400'
                            : isSender  ? 'text-red-400'
                            : 'text-zinc-300'
                          }`}
                        >
                          {isReceiver ? '+' : isSender ? '-' : ''}
                          {fmtAmount(p.amount, p.currency)}
                        </span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-full ${
                            isConfirmed  ? 'bg-emerald-900/40 text-emerald-400'
                            : isRejected ? 'bg-red-900/40    text-red-400'
                            : isPending  ? 'bg-amber-900/40  text-amber-400'
                            : 'text-zinc-400'
                          }`}
                        >
                          {STATUS_LABELS[p.status] ?? p.status}
                        </span>
                        {canCancel && (
                          <button
                            onClick={() => cancelPayment(p.id)}
                            disabled={actingOn.has(p.id)}
                            className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                          >
                            Annuler
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Tab: Resume (ledger)                                              */}
      {/* ================================================================ */}
      {activeTab === 'resume' && (
        <div className="flex flex-col gap-2">
          {ledger.length === 0 && (
            <p className="text-zinc-500 text-center py-6">Aucun mouvement enregistre.</p>
          )}
          {ledger.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between bg-zinc-900 rounded-lg px-4 py-3 border border-zinc-800"
            >
              <div className="flex flex-col">
                <span className="text-sm text-white">
                  {e.title ?? KIND_LABELS[e.entry_type] ?? e.entry_type}
                </span>
                <span className="text-xs text-zinc-500">{fmtDate(e.created_at, userTz)}</span>
              </div>
              <span
                className={`font-semibold text-sm ${
                  e.entry_type === 'receiver_credit' ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {e.entry_type === 'receiver_credit' ? '+' : '-'}
                {fmtAmount(Math.abs(e.amount), e.currency)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ================================================================ */}
      {/* Tab: Notifications                                                */}
      {/* ================================================================ */}
      {activeTab === 'notifs' && (
        <div className="flex flex-col gap-3">

          {/* Category chips */}
          <div className="flex items-center gap-2 flex-wrap">
            {(
              [
                { cat: 'payment' as const, label: 'Paiements' },
                { cat: 'tx'      as const, label: 'TX'        },
                { cat: 'spender' as const, label: 'Spenders'  },
              ] as { cat: NotifCategory; label: string }[]
            ).map(({ cat, label }) => {
              const count  = unreadByCat[cat];
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
            {unreadByCat[notifCategory] > 0 && (
              <button
                onClick={() => markAllRead(notifCategory)}
                className="ml-auto text-xs text-zinc-500 hover:text-zinc-200 transition-colors underline underline-offset-2"
              >
                Tout marquer lu
              </button>
            )}
          </div>

          {/* Notification feed */}
          {filteredNotifs.length === 0 ? (
            <p className="text-zinc-500 text-center py-6">
              Aucune notification{notifCategory === 'payment' ? ' de paiement' : notifCategory === 'spender' ? ' spender' : ' TX'}.
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
                      <span className="text-sm font-medium text-white">{n.title}</span>
                      <span className="text-xs text-zinc-400 leading-relaxed">{n.message}</span>
                      <span className="text-xs text-zinc-500 mt-1">{fmtDate(n.created_at, userTz)}</span>
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
        onClick={() => userId && userRole && load(userId, userRole)}
        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors text-center py-2"
      >
        Actualiser
      </button>
    </div>
  );
}
