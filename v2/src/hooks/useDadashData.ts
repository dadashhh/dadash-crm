import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useEffect } from 'react';

/* ────────────── MODELS ────────────── */
export function useModels() {
  return useQuery({
    queryKey: ['models'],
    queryFn: async () => {
      const { data, error } = await supabase.from('models')
        .select('id,name,emoji,color,platform,active,account_status,nationality,languages,age,avatar_url,bio')
        .eq('active', true).order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ────────────── CHATTERS / TEAM ────────────── */
export function useChatters() {
  return useQuery({
    queryKey: ['chatters'],
    queryFn: async () => {
      const { data, error } = await supabase.from('team_members')
        .select('id,full_name,email,role,assigned_models,commission_rate,status')
        .in('role', ['chatter', 'mc', 'manager']).order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ────────────── PROVIDERS ────────────── */
export function useProviders() {
  return useQuery({
    queryKey: ['providers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('providers')
        .select('id,name,fee_pct,payment_method,email,active')
        .eq('active', true).order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ────────────── PRODUCTS / CATALOGUE ────────────── */
export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products')
        .select('id,name,category,price_chf,currency,icon,duration_minutes,description,active,model_id')
        .eq('active', true).order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ────────────── SPENDERS ────────────── */
export function useSpenders(opts?: { limit?: number; search?: string }) {
  return useQuery({
    queryKey: ['spenders', opts],
    queryFn: async () => {
      let q = supabase.from('spenders')
        .select('id,display_name,first_name,last_name,username,telegram_username,language,country,total_spent,avg_basket,vip_score,status,classification,is_scammer,scam_flag,last_active_date,last_purchase_date,model_id,created_at,first_contact_date,scam_count,risk_level')
        .is('deleted_at', null)
        .order('total_spent', { ascending: false, nullsFirst: false });
      if (opts?.limit) q = q.limit(opts.limit);
      if (opts?.search) q = q.or(`display_name.ilike.%${opts.search}%,username.ilike.%${opts.search}%,first_name.ilike.%${opts.search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSpendersCount() {
  return useQuery({
    queryKey: ['spenders-count'],
    queryFn: async () => {
      const { count, error } = await supabase.from('spenders')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/* ────────────── TRANSACTIONS ────────────── */
export function useTransactions(opts?: { limit?: number; status?: string; days?: number }) {
  return useQuery({
    queryKey: ['transactions', opts],
    queryFn: async () => {
      let q = supabase.from('transactions')
        .select('id,date,amount,amount_chf,currency,status,chatter_id,model_id,provider_id,spender_id,spender_handle,product,notes,created_at,validated_at,payment_method,product_id,net_amount_chf')
        .order('date', { ascending: false, nullsFirst: false });
      if (opts?.limit) q = q.limit(opts.limit);
      if (opts?.status) q = q.eq('status', opts.status);
      if (opts?.days) {
        const since = new Date(Date.now() - opts.days * 86400000).toISOString();
        q = q.gte('date', since);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTransactionStats() {
  return useQuery({
    queryKey: ['tx-stats'],
    queryFn: async () => {
      const [total, validated, pending, refused, ca] = await Promise.all([
        supabase.from('transactions').select('*', { count: 'exact', head: true }),
        supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('status', 'validated'),
        supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('transactions').select('*', { count: 'exact', head: true }).in('status', ['refused', 'cancelled']),
        supabase.from('transactions').select('amount_chf').eq('status', 'validated'),
      ]);
      const caBrut = (ca.data ?? []).reduce((a, r) => a + Number(r.amount_chf || 0), 0);
      const validatedCount = validated.count ?? 0;
      return {
        total: total.count ?? 0,
        validated: validatedCount,
        pending: pending.count ?? 0,
        refused: refused.count ?? 0,
        caBrut,
        aov: validatedCount > 0 ? caBrut / validatedCount : 0,
      };
    },
  });
}

/* ────────────── TG CONVERSATIONS ────────────── */
export function useTgConversations(opts?: { limit?: number; modelId?: string; chatterId?: string }) {
  return useQuery({
    queryKey: ['tg-convs', opts],
    queryFn: async () => {
      let q = supabase.from('tg_conversations')
        .select('id,tg_chat_id,spender_id,model_id,assigned_chatter_id,status,last_message_at,display_name,username,tg_display_name,tg_first_name,tg_last_name')
        .order('last_message_at', { ascending: false, nullsFirst: false });
      if (opts?.limit) q = q.limit(opts.limit);
      if (opts?.modelId) q = q.eq('model_id', opts.modelId);
      if (opts?.chatterId) q = q.eq('assigned_chatter_id', opts.chatterId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTgMessages(conversationId?: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['tg-msgs', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await supabase.from('tg_messages')
        .select('id,conversation_id,direction,text,sender_profile_id,created_at,inserted_at,model_id,meta')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!conversationId,
  });

  // Realtime subscription
  useEffect(() => {
    if (!conversationId) return;
    const ch = supabase.channel(`tg-msgs-${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'tg_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, () => qc.invalidateQueries({ queryKey: ['tg-msgs', conversationId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, qc]);

  return q;
}

/* ────────────── MUTATIONS ────────────── */
export function useValidateTx() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions')
        .update({ status: 'validated', validated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['tx-stats'] });
    },
  });
}

export function useRefuseTx() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { error } = await supabase.from('transactions')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancellation_reason: reason ?? null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['tx-stats'] });
    },
  });
}

export function useCreateTx() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tx: {
      amount: number; currency?: string; model_id?: string; chatter_id?: string;
      provider_id?: string; spender_id?: string; product?: string; notes?: string;
    }) => {
      const { data, error } = await supabase.from('transactions')
        .insert({
          amount: tx.amount,
          currency: tx.currency ?? 'CHF',
          status: 'pending',
          model_id: tx.model_id ?? null,
          chatter_id: tx.chatter_id ?? null,
          provider_id: tx.provider_id ?? null,
          spender_id: tx.spender_id ?? null,
          product: tx.product ?? null,
          notes: tx.notes ?? null,
          date: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['tx-stats'] });
    },
  });
}

export function useSendMessage() {
  return useMutation({
    mutationFn: async ({ conversationId, text, modelId }: { conversationId: string; text: string; modelId?: string }) => {
      const { error } = await supabase.from('tg_messages')
        .insert({
          conversation_id: conversationId,
          direction: 'outbound',
          text,
          model_id: modelId ?? null,
          created_at: new Date().toISOString(),
        });
      if (error) throw error;
    },
  });
}
