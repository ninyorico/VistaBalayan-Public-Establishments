import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, LogIn, LogOut, Save, Trash2, UserRound } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { Button } from '../../components/ui/button'

interface PublicReview {
  id: string
  establishment_id: string
  rating: number
  reviewer_name: string | null
  comment: string | null
  moderation_status: string
  created_at: string
  updated_at: string
}

const getAuthDisplayName = (user: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null) => {
  const metadata = user?.user_metadata || {}
  const metadataName = [metadata.display_name, metadata.full_name, metadata.name]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
  if (metadataName) return metadataName.trim().slice(0, 80)
  return user?.email?.split('@')[0]?.trim().slice(0, 80) || ''
}

export default function PublicAccount() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState({ display_name: '' })
  const [reviews, setReviews] = useState<PublicReview[]>([])
  const [establishments, setEstablishments] = useState<Record<string, string>>({})
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editRating, setEditRating] = useState(0)
  const [editComment, setEditComment] = useState('')
  const [loading, setLoading] = useState(true)

  const loadAccount = async () => {
    setLoading(true)
    const { data: userData } = await supabase.auth.getUser()
    const currentUser = userData.user
    setUser(currentUser)
    if (!currentUser) {
      setLoading(false)
      return
    }
    const [{ data: profileData }, { data: reviewData }] = await Promise.all([
      supabase.from('public_user_profiles').select('display_name').eq('id', currentUser.id).maybeSingle(),
      supabase.rpc('get_public_user_reviews'),
    ])
    setProfile({ display_name: profileData?.display_name || getAuthDisplayName(currentUser) })
    const nextReviews = (reviewData || []) as PublicReview[]
    setReviews(nextReviews)
    const ids = [...new Set(nextReviews.map((review) => review.establishment_id))]
    if (ids.length) {
      const { data } = await supabase.from('establishments').select('id,name').in('id', ids)
      setEstablishments(Object.fromEntries((data || []).map((item) => [item.id, item.name])))
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadAccount()
    const { data: listener } = supabase.auth.onAuthStateChange(() => void loadAccount())
    return () => listener.subscription.unsubscribe()
  }, [])

  const signIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setMessage(error ? error.message : 'Signed in. Check your verification status before submitting reviews.')
  }

  const signUp = async () => {
    const { error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${window.location.origin}/account` } })
    setMessage(error ? error.message : 'Account created. Check your email to verify the account.')
  }

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/account` } })
    if (error) setMessage(error.message)
  }

  const recoverPassword = async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/account` })
    setMessage(error ? error.message : 'If an account exists for that email, a recovery message was sent.')
  }

  const saveProfile = async () => {
    if (!user || !profile.display_name.trim()) return
    const displayName = profile.display_name.trim().slice(0, 80)
    const { error } = await supabase.from('public_user_profiles').upsert({ id: user.id, display_name: displayName })
    if (error) {
      setMessage(error.message)
      return
    }
    const { error: metadataError } = await supabase.auth.updateUser({ data: { display_name: displayName } })
    setMessage(metadataError ? metadataError.message : 'Profile saved. This name will appear on your future reviews.')
  }

  const requestAccountDeletion = async () => {
    if (!user || !window.confirm('Send an account-removal request? Your public reviews will be removed from display after the request is processed.')) return
    const { error } = await supabase.rpc('request_public_account_deletion', { p_reason: 'Requested by public account holder' })
    setMessage(error ? error.message : 'Your account-removal request was recorded for processing.')
  }

  const saveReview = async () => {
    if (!editing || editRating < 1) return
    const { error } = await supabase.rpc('update_establishment_rating', { p_rating_id: editing, p_rating: editRating, p_comment: editComment.trim() || null, p_reviewer_name: profile.display_name.trim() || null })
    setMessage(error ? error.message : 'Review submitted for moderation again.')
    setEditing(null)
    if (!error) await loadAccount()
  }

  const deleteReview = async (id: string) => {
    if (!window.confirm('Delete your review? This removes it from public display.')) return
    const { error } = await supabase.rpc('delete_establishment_rating', { p_rating_id: id })
    setMessage(error ? error.message : 'Your review was removed.')
    if (!error) await loadAccount()
  }

  if (loading) return <main className="min-h-screen bg-[#E0E5EC] p-8 text-[#193364]">Loading account…</main>

  return (
    <main className="min-h-screen bg-[#E0E5EC] px-4 py-8 text-[#193364] sm:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4"><ArrowLeft className="h-4 w-4" /> Back to tourism listings</Link>
        <section className="rounded-[2rem] bg-[#E0E5EC] p-6 shadow-[10px_10px_22px_rgba(163,177,198,.55),-10px_-10px_22px_rgba(255,255,255,.72)]">
          <div className="flex items-start gap-3"><UserRound className="mt-1 h-6 w-6" /><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Public account</p><h1 className="mt-1 text-2xl font-semibold">Manage your feedback</h1></div></div>
          {!user ? (
            <div className="mt-6 space-y-3">
              <p className="text-sm leading-6 text-slate-600">Browse the public site without an account. Sign in or create an account to submit and manage verified ratings and reviews.</p>
              <Button type="button" onClick={() => void signInWithGoogle()} className="w-full rounded-2xl bg-[#193364] text-white"><LogIn className="h-4 w-4" /> Continue with Google</Button>
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="Email address" className="w-full rounded-2xl border border-[#AFB3B5] bg-[#F5F8FF] p-3 text-sm" />
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Password" className="w-full rounded-2xl border border-[#AFB3B5] bg-[#F5F8FF] p-3 text-sm" />
              <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => void signIn()} variant="outline" className="rounded-xl">Sign in</Button><Button type="button" onClick={() => void signUp()} variant="outline" className="rounded-xl">Create account</Button><Button type="button" onClick={() => void recoverPassword()} variant="ghost" className="rounded-xl">Forgot password?</Button></div>
            </div>
          ) : (
            <>
              <p className="mt-5 text-sm text-slate-600">Signed in as <strong>{user.email}</strong>. Verification: {user.email_confirmed_at ? 'Verified' : 'Not verified'}.</p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row"><div className="flex-1"><label htmlFor="public-display-name" className="mb-1 block text-xs font-semibold text-slate-600">Display name</label><input id="public-display-name" value={profile.display_name} onChange={(event) => setProfile({ display_name: event.target.value.slice(0, 80) })} placeholder="Your Google profile name" className="w-full rounded-2xl border border-[#AFB3B5] bg-[#F5F8FF] p-3 text-sm" /><p className="mt-1 text-xs text-slate-500">Defaults to your Google profile name. You can change it anytime.</p></div><Button type="button" onClick={() => void saveProfile()} className="rounded-2xl bg-[#193364] text-white"><Save className="h-4 w-4" /> Save profile</Button><Button type="button" onClick={() => void supabase.auth.signOut()} variant="outline" className="rounded-2xl"><LogOut className="h-4 w-4" /> Sign out</Button></div>
              <div className="mt-3"><Button type="button" onClick={() => void requestAccountDeletion()} variant="ghost" className="rounded-xl text-xs text-rose-700">Request account removal</Button></div>
              {!user.email_confirmed_at && <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">Verify your email before submitting a rating or review.</p>}
            </>
          )}
          {message && <p className="mt-4 rounded-2xl bg-[#F5F8FF] p-3 text-sm text-slate-600" role="status">{message}</p>}
        </section>

        {user && <section className="rounded-[2rem] bg-[#E0E5EC] p-6 shadow-[10px_10px_22px_rgba(163,177,198,.55),-10px_-10px_22px_rgba(255,255,255,.72)]"><h2 className="text-xl font-semibold">Your ratings and reviews</h2><div className="mt-4 space-y-3">{reviews.length === 0 ? <p className="rounded-2xl bg-[#F5F8FF] p-4 text-sm text-slate-600">You have not submitted any ratings or reviews.</p> : reviews.map((review) => <article key={review.id} className="rounded-2xl bg-[#F5F8FF] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{establishments[review.establishment_id] || 'Establishment'}</p><p className="text-sm text-slate-600">{review.rating}/5 · {review.moderation_status}</p></div><div className="flex gap-2"><Button type="button" variant="outline" className="rounded-xl text-xs" onClick={() => { setEditing(review.id); setEditRating(review.rating); setEditComment(review.comment || '') }}>Edit</Button><Button type="button" variant="ghost" className="rounded-xl text-xs text-rose-700" onClick={() => void deleteReview(review.id)}><Trash2 className="h-4 w-4" /> Delete</Button></div></div>{review.comment && <p className="mt-2 text-sm leading-6 text-slate-600">{review.comment}</p>}{editing === review.id && <div className="mt-3 space-y-2"><input type="number" min="1" max="5" value={editRating} onChange={(event) => setEditRating(Number(event.target.value))} className="w-full rounded-xl border border-[#AFB3B5] bg-white p-2 text-sm" /><textarea value={editComment} onChange={(event) => setEditComment(event.target.value.slice(0, 500))} className="w-full rounded-xl border border-[#AFB3B5] bg-white p-2 text-sm" rows={3} /><Button type="button" onClick={() => void saveReview()} className="rounded-xl bg-[#193364] text-white">Save changes</Button></div>}</article>)}</div></section>}
      </div>
    </main>
  )
}
