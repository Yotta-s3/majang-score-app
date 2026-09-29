import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const isSupabaseConfigured = Boolean(url && key)

export const supabase = isSupabaseConfigured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null

let pendingAnonymousSignIn: Promise<void> | undefined

export const ensureAnonymousSession = async () => {
  if (!supabase) throw new Error('Supabaseの接続情報が設定されていません。')

  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (data.session) return

  if (!pendingAnonymousSignIn) {
    pendingAnonymousSignIn = supabase.auth
      .signInAnonymously()
      .then(({ data: signInData, error: signInError }) => {
        if (signInError) throw signInError
        if (!signInData.session) throw new Error('匿名ログインを開始できませんでした。')
      })
      .finally(() => {
        pendingAnonymousSignIn = undefined
      })
  }
  await pendingAnonymousSignIn
}
