// =============================================================================
// ComptaTab -- Onglet comptabilite / paiements internes
//
// Roles supportes : gerant | chatter | model | provider
//
// Flows:
//   A. Gerant -> chatter/model   : commission/bonus/remboursement
//   B. Provider -> gerant        : reversement_ca / declaration
//
// Onglets:
//   Resume     -- solde calcule depuis paiements_internes (validated)
//   Paiements  -- paiements_internes avec boutons Contester
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
  role: string;
  timezone: string | null;
}

interface PaiementInterne {
  id: string;
  created_at: string;
  createur_id: string;
  createur_role: string;
  createur_name: string | null;
  destinataire_id: string;
  destinataire_type: string;
  destinataire_name: string | null;
  type: string;
  montant: number;
  devise: string;
  note: string | null;
  statut: 'draft' | 'pending' | 'validated' | 'contested' | 'cancelled';
  validated_at: string | null;
  contested_at: string | null;
  contestation_message: string | null;
  calcul_detail: Record<string, unknown>;
  facture_numero: string | null;
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

type NotifCategory = 'tx' | 'spender' | 'payment';
type MainTab = 'resume' | 'paiements' | 'notifs';

// =============================================================================
// Helpers
// =============================================================================

const TYPE_LABELS: Record<string, string> = {
  commission:      'Commission',
  bonus:           'Bonus',
  remboursement:   'Remboursement',
  reversement_ca:  'Reversement CA',
  autre:           'Autre',
};

const STATUS_LABELS: Record<string, string> = {
  draft:     'Brouillon',
  pending:   'En attente',
  validated: 'Valide',
  contested: 'Conteste',
  cancelled: 'Annule',
};

const fmtAmount = (amount: number, currency = 'CHF') =>
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
  const [payments, setPayments] = useState<PaiementInterne[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [gerantProfiles, setGerantProfiles] = useState<UserProfile[]>([]);

  // UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MainTab>('paiements');
  const [notifCategory, setNotifCategory] = useState<NotifCategory>('payment');

  // Action state
  const [actingOn, setActingOn] = useState<Set<string>>(new Set());
  const [contestingId, setContestingId] = useState<string | null>(null);
  const [contestMessage, setContestMessage] = useState('');
  const [showDeclareForm, setShowDeclareForm] = useState(false);
  const [declareForm, setDeclareForm] = useState({
    to_user_id: '',
    amount: '',
    currency: 'CHF',
    note: '',
  });
  const [declareError, setDeclareError] = useState<string | null>(null);
  const [declareLoading, setDeclareLoading] = useState(false);

  const contestInputRef = useRef<HTMLInputElement>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async (uid: string, role: string) => {
    setLoading(true);
    setError(null);

    const isGerant = ['gerant','admin','ceo'].includes(role);

    // Build paiements_internes query -- RLS handles row filtering
    let paymentsQuery = supabase
      .from('paiements_internes')
      .select('id, created_at, createur_id, createur_role, createur_name, destinataire_id, destinataire_type, destinataire_name, type, montant, devise, note, statut, validated_at, contested_at, contestation_message, calcul_detail, facture_numero')
      .order('created_at', { ascending: false })
      .limit(200);

    // Gerant sees all (RLS already handles this), but we filter out cancelled for cleaner view
    if (isGerant) {
      paymentsQuery = paymentsQuery.neq('statut', 'draft');
    }

    const [paymentsRes, notifsRes] = await Promise.all([
      paymentsQuery,

      // Notifications
      supabase
        .from('notifications')
        .select('id, created_at, type, title, message, read, is_read, kind')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    if (paymentsRes.error) { setError(paymentsRes.error.message); setLoading(false); return; }
    if (notifsRes.error)   { setError(notifsRes.error.message);   setLoading(false); return; }

    const paiements = (paymentsRes.data ?? []) as PaiementInterne[];
    setPayments(paiements);

    // Calculate balance from validated payments
    const validated = paiements.filter((p) => p.statut === 'validated');
    const totalReceived = validated
      .filter((p) => p.destinataire_id === uid)
      .reduce((acc, p) => acc + p.montant, 0);
    const totalSent = validated
      .filter((p) => p.createur_id === uid)
      .reduce((acc, p) => acc + p.montant, 0);
    setSoldeNet(totalReceived - totalSent);

    // Normalize notifications
    const rawNotifs = (notifsRes.data ?? []) as Array<Notification & { is_read?: boolean }>;
    setNotifications(rawNotifs.map((n) => ({
      ...n,
      is_read: n.is_read ?? n.read ?? false,
      read:    n.read    ?? n.is_read ?? false,
    })));

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
        .select('id, name, role, timezone')
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
            .select('id, name, role, timezone')
            .in('role', ['gerant','admin','ceo']);
          setGerantProfiles((gerants ?? []) as UserProfile[]);
        }
      }
    };
    init();
  }, [load]);

  // ── Derived ───────────────────────────────────────────────────────────────

  // Payments pending my action (I am the receiver, status=pending)
  const pendingToConfirm = payments.filter(
    (p) => p.destinataire_id === userId && p.statut === 'pending'
  );

  // Counts
  const pendingCount = payments.filter((p) => p.statut === 'pending').length;
  const validatedTotal = payments
    .filter((p) => p.statut === 'validated' && p.destinataire_id === userId)
    .reduce((acc, p) => acc + p.montant, 0);

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

  const validatePayment = async (id: string) => {
    setActing(id, true);
    const { error: e } = await supabase
      .from('paiements_internes')
      .update({ statut: 'validated', validated_at: new Date().toISOString() })
      .eq('id', id);
    if (e) { alert('Erreur: ' + e.message); setActing(id, false); return; }
    setPayments((prev) =>
      prev.map((p) => p.id === id ? { ...p, statut: 'validated', validated_at: new Date().toISOString() } : p)
    );
    setActing(id, false);
    if (userId && userRole) load(userId, userRole);
  };

  const openContest = (id: string) => {
    setContestingId(id);
    setContestMessage('');
    setTimeout(() => contestInputRef.current?.focus(), 50);
  };

  const submitContest = async () => {
    if (!contestingId) return;
    setActing(contestingId, true);
    const { error: e } = await supabase
      .from('paiements_internes')
      .update({
        statut: 'contested',
        contested_at: new Date().toISOString(),
        contestation_message: contestMessage || null,
      })
      .eq('id', contestingId);
    if (e) { alert('Erreur: ' + e.message); setActing(contestingId, false); return; }
    setPayments((prev) =>
      prev.map((p) => p.id === contestingId ? {
        ...p,
        statut: 'contested',
        contested_at: new Date().toISOString(),
        contestation_message: contestMessage || null,
      } : p)
    );
    setActing(contestingId, false);
    setContestingId(null);
    setContestMessage('');
  };

  const cancelPayment = async (id: string) => {
    if (!window.confirm('Annuler ce paiement ?')) return;
    setActing(id, true);
    const { error: e } = await supabase
      .from('paiements_internes')
      .update({ statut: 'cancelled' })
      .eq('id', id);
    if (e) { alert('Erreur: ' + e.message); setActing(id, false); return; }
    setPayments((prev) =>
      prev.map((p) => p.id === id ? { ...p, statut: 'cancelled' } : p)
    );
    setActing(id, false);
  };

  const submitDeclare = async () => {
    setDeclareError(null);
    if (!userId) return;
    const amt = parseFloat(declareForm.amount);
    if (!declareForm.to_user_id) { setDeclareError('Selectionnez un destinataire'); return; }
    if (isNaN(amt) || amt <= 0)  { setDeclareError('Montant invalide');             return; }

    const recipient = gerantProfiles.find((g) => g.id === declareForm.to_user_id);

    setDeclareLoading(true);
    const { error: e } = await supabase
      .from('paiements_internes')
      .insert({
        createur_id:       userId,
        createur_role:     'provider',
        createur_name:     profile?.name ?? null,
        destinataire_id:   declareForm.to_user_id,
        destinataire_type: 'gerant',
        destinataire_name: recipient?.name ?? null,
        type:              'reversement_ca',
        montant:           amt,
        devise:            declareForm.currency,
        note:              declareForm.note || null,
        statut:            'pending',
        calcul_detail:     {},
      });
    setDeclareLoading(false);

    if (e) { setDeclareError(e.message); return; }

    setShowDeclareForm(false);
    setDeclareForm({ to_user_id: '', amount: '', currency: 'CHF', note: '' });
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

        {/* Pending */}
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700">
          <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">En attente</p>
          <p className="text-lg font-bold text-amber-400">
            {pendingCount}
          </p>
          {pendingCount > 0 && (
            <p className="text-xs text-zinc-500">
              paiement{pendingCount > 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Validated total (received) */}
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700">
          <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Recu (valide)</p>
          <p className="text-lg font-bold text-violet-400">
            {fmtAmount(validatedTotal)}
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
                          {g.name ?? g.id} ({g.role})
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
                        <option>CHF</option>
                        <option>EUR</option>
                        <option>USD</option>
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

          {/* Contestation reason input (inline, when contesting) */}
          {contestingId && (
            <div className="bg-zinc-900 rounded-xl border border-red-700/50 p-4 flex flex-col gap-3">
              <p className="text-sm font-medium text-white">Motif de la contestation (optionnel)</p>
              <input
                ref={contestInputRef}
                type="text"
                value={contestMessage}
                onChange={(e) => setContestMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitContest()}
                placeholder="Ex: montant incorrect, periode en attente..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              />
              <div className="flex gap-2">
                <button
                  onClick={submitContest}
                  disabled={actingOn.has(contestingId)}
                  className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-500 disabled:opacity-50 transition-colors"
                >
                  {actingOn.has(contestingId) ? '...' : 'Confirmer la contestation'}
                </button>
                <button
                  onClick={() => setContestingId(null)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm hover:text-white transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* Pending to confirm section (for destinataire) */}
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
                        {TYPE_LABELS[p.type] ?? p.type}
                        {p.destinataire_name ? ` - ${p.destinataire_name}` : ''}
                      </span>
                      <span className="text-sm text-emerald-400 font-semibold">
                        +{fmtAmount(p.montant, p.devise)}
                      </span>
                      {p.note && (
                        <span className="text-xs text-zinc-400 italic">{p.note}</span>
                      )}
                      {p.createur_name && (
                        <span className="text-xs text-zinc-500">De: {p.createur_name}</span>
                      )}
                      <span className="text-xs text-zinc-500">{fmtDate(p.created_at, userTz)}</span>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {isGerant && (
                        <button
                          onClick={() => validatePayment(p.id)}
                          disabled={actingOn.has(p.id)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500 disabled:opacity-50 transition-colors"
                        >
                          {actingOn.has(p.id) ? '...' : 'Valider'}
                        </button>
                      )}
                      <button
                        onClick={() => openContest(p.id)}
                        disabled={actingOn.has(p.id) || contestingId === p.id}
                        className="px-3 py-1.5 rounded-lg bg-red-700/60 text-red-300 text-xs font-medium hover:bg-red-600/60 disabled:opacity-50 transition-colors"
                      >
                        Contester
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
            {payments.filter((p) => p.statut !== 'pending' || p.destinataire_id !== userId).length === 0
              && pendingToConfirm.length === 0 && (
              <p className="text-zinc-500 text-center py-6">Aucun paiement.</p>
            )}
            {payments
              .filter((p) => !(p.statut === 'pending' && p.destinataire_id === userId))
              .map((p) => {
                const isReceiver  = p.destinataire_id === userId;
                const isSender    = p.createur_id === userId;
                const isValidated = p.statut === 'validated';
                const isContested = p.statut === 'contested';
                const isCancelled = p.statut === 'cancelled';
                const isPending   = p.statut === 'pending';
                const canCancel   = isPending && isGerant;

                return (
                  <div
                    key={p.id}
                    className={`rounded-lg px-4 py-3 border ${
                      isCancelled || isContested ? 'bg-zinc-900 border-zinc-800 opacity-60' : 'bg-zinc-900 border-zinc-800'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-sm font-medium text-white truncate">
                          {TYPE_LABELS[p.type] ?? p.type}
                          {isGerant && p.destinataire_name ? ` - ${p.destinataire_name}` : ''}
                        </span>
                        {p.note && (
                          <span className="text-xs text-zinc-400 italic">{p.note}</span>
                        )}
                        {isContested && p.contestation_message && (
                          <span className="text-xs text-red-400">Motif: {p.contestation_message}</span>
                        )}
                        {p.facture_numero && (
                          <span className="text-xs text-zinc-500">Facture: {p.facture_numero}</span>
                        )}
                        <span className="text-xs text-zinc-500">
                          {fmtDate(
                            isValidated && p.validated_at ? p.validated_at : p.created_at,
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
                          {fmtAmount(p.montant, p.devise)}
                        </span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-full ${
                            isValidated  ? 'bg-emerald-900/40 text-emerald-400'
                            : isContested ? 'bg-red-900/40    text-red-400'
                            : isCancelled ? 'bg-red-900/40    text-red-400'
                            : isPending   ? 'bg-amber-900/40  text-amber-400'
                            : 'text-zinc-400'
                          }`}
                        >
                          {STATUS_LABELS[p.statut] ?? p.statut}
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
      {/* Tab: Resume (solde from validated paiements)                      */}
      {/* ================================================================ */}
      {activeTab === 'resume' && (
        <div className="flex flex-col gap-2">
          {payments.filter((p) => p.statut === 'validated').length === 0 && (
            <p className="text-zinc-500 text-center py-6">Aucun mouvement valide.</p>
          )}
          {payments
            .filter((p) => p.statut === 'validated')
            .map((p) => {
              const isReceiver = p.destinataire_id === userId;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between bg-zinc-900 rounded-lg px-4 py-3 border border-zinc-800"
                >
                  <div className="flex flex-col">
                    <span className="text-sm text-white">
                      {TYPE_LABELS[p.type] ?? p.type}
                      {isGerant && p.destinataire_name ? ` - ${p.destinataire_name}` : ''}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {fmtDate(p.validated_at ?? p.created_at, userTz)}
                    </span>
                  </div>
                  <span
                    className={`font-semibold text-sm ${
                      isReceiver ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {isReceiver ? '+' : '-'}
                    {fmtAmount(p.montant, p.devise)}
                  </span>
                </div>
              );
            })}
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
