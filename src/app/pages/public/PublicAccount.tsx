import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Camera, LogIn, LogOut, Trash2, UserRound, X } from 'lucide-react'
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

interface PublicAccountProps {
  embedded?: boolean
  onClose?: () => void
}

const getAuthDisplayName = (user: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null) => {
  const metadata = user?.user_metadata || {}
  const metadataName = [metadata.full_name, metadata.name, metadata.display_name]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
  if (metadataName) return metadataName.trim().slice(0, 80)
  return user?.email?.split('@')[0]?.trim().slice(0, 80) || 'Google user'
}

const getAuthAvatarUrl = (user: { user_metadata?: Record<string, unknown> | null } | null) => {
  const metadata = user?.user_metadata || {}
  const value = metadata.avatar_url || metadata.picture
  return typeof value === 'string' && value.trim() ? value : ''
}

export default function PublicAccount({ embedded = false, onClose }: PublicAccountProps) {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState({ avatar_url: '' })
  const [reviews, setReviews] = useState<PublicReview[]>([])
  const [establishments, setEstablishments] = useState<Record<string, string>>({})
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editRating, setEditRating] = useState(0)
  const [editComment, setEditComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

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
      supabase.from('public_user_profiles').select('avatar_url').eq('id', currentUser.id).maybeSingle(),
      supabase.rpc('get_public_user_reviews'),
    ])
    setProfile({ avatar_url: profileData?.avatar_url || getAuthAvatarUrl(currentUser) })
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

  const uploadProfilePhoto = async (file: File) => {
    if (!user) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setMessage('Choose a JPG, PNG, or WebP image up to 5 MB.')
      return
    }
    setUploadingPhoto(true)
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await supabase.storage.from('public-profile-photos').upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false })
    if (uploadError) {
      setMessage(uploadError.message)
      setUploadingPhoto(false)
      return
    }
    const { data } = supabase.storage.from('public-profile-photos').getPublicUrl(path)
    const { error: profileError } = await supabase.from('public_user_profiles').upsert({ id: user.id, display_name: getAuthDisplayName(user), avatar_url: data.publicUrl })
    setMessage(profileError ? profileError.message : 'Profile picture updated.')
    if (!profileError) setProfile({ avatar_url: data.publicUrl })
    setUploadingPhoto(false)
  }

  const requestAccountDeletion = async () => {
    if (!user || !window.confirm('Send an account-removal request? Your public reviews will be removed from display after the request is processed.')) return
    const { error } = await supabase.rpc('request_public_account_deletion', { p_reason: 'Requested by public account holder' })
    setMessage(error ? error.message : 'Your account-removal request was recorded for processing.')
  }

  const saveReview = async () => {
    if (!editing || editRating < 1) return
    const { error } = await supabase.rpc('update_establishment_rating', { p_rating_id: editing, p_rating: editRating, p_comment: editComment.trim() || null, p_reviewer_name: getAuthDisplayName(user) })
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

  if (loading) return (
    <main className={`${embedded ? 'relative bg-[#E0E5EC] p-5 sm:p-6' : 'min-h-screen bg-[#E0E5EC] px-4 py-8 text-[#193364] sm:px-8'}`} aria-busy="true" aria-label="Loading account">
      <div className="mx-auto max-w-3xl space-y-5 animate-pulse">
        {embedded && <div className="absolute right-4 top-4 h-8 w-8 rounded-xl bg-[#cbd3df]" />}
        <section className="rounded-[2rem] bg-[#E0E5EC] p-5 shadow-[10px_10px_22px_rgba(163,177,198,.55),-10px_-10px_22px_rgba(255,255,255,.72)] sm:p-6">
          <div className="flex items-start gap-3">
            <div className="h-6 w-6 rounded-full bg-[#cbd3df]" />
            <div className="flex-1 space-y-2"><div className="h-3 w-24 rounded bg-[#cbd3df]" /><div className="h-7 w-56 max-w-full rounded bg-[#cbd3df]" /></div>
          </div>
          <div className="mt-6 space-y-3"><div className="h-4 w-full rounded bg-[#cbd3df]" /><div className="h-4 w-4/5 rounded bg-[#cbd3df]" /><div className="h-10 w-full rounded-2xl bg-[#cbd3df]" /><div className="h-10 w-full rounded-2xl bg-[#cbd3df]" /><div className="h-10 w-full rounded-2xl bg-[#cbd3df]" /></div>
        </section>
      </div>
    </main>
  )

  return (
    <main className={`${embedded ? 'relative bg-[#E0E5EC]' : 'min-h-screen bg-[#E0E5EC] px-4 py-8 text-[#193364] sm:px-8'}`}>
      <div className="mx-auto max-w-3xl space-y-5">
        {embedded ? (
          <div className="absolute right-3 top-3 z-10"><Button type="button" onClick={onClose} variant="ghost" className="rounded-xl" aria-label="Close account"><X className="h-5 w-5" /></Button></div>
        ) : (
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4"><ArrowLeft className="h-4 w-4" /> Back to tourism listings</Link>
        )}
        <section className="rounded-[2rem] bg-[#E0E5EC] p-5 shadow-[10px_10px_22px_rgba(163,177,198,.55),-10px_-10px_22px_rgba(255,255,255,.72)] sm:p-6">
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
              <div className="mt-5 grid grid-cols-[auto,minmax(0,1fr)] items-center gap-x-4 gap-y-3 sm:grid-cols-[auto,minmax(0,1fr),auto]">
                <div className="relative row-span-2 h-20 w-20 overflow-hidden rounded-full border-2 border-white bg-[#E5E8E1] shadow-[inset_3px_3px_7px_rgba(163,177,198,.35),inset_-3px_-3px_7px_rgba(255,255,255,.65)]">
                  {profile.avatar_url ? <img src={profile.avatar_url} alt={`${getAuthDisplayName(user)} profile`} className="h-full w-full object-cover" /> : <UserRound className="absolute inset-0 m-auto h-9 w-9 text-[#193364]" />}
                </div>
                <div className="min-w-0"><p className="truncate text-sm text-slate-600">Signed in as <strong>{user.email}</strong>.</p><p className="mt-1 text-lg font-semibold text-[#193364]">{getAuthDisplayName(user)}</p><p className="text-xs text-slate-500">Name is taken from your Google profile and cannot be changed here.</p></div>
                <label className="col-start-2 inline-flex w-fit cursor-pointer items-center gap-2 rounded-2xl bg-[#193364] px-4 py-2.5 text-sm font-semibold text-white sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:self-center"><Camera className="h-4 w-4" /> {uploadingPhoto ? 'Uploading…' : 'Change photo'}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploadingPhoto} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadProfilePhoto(file); event.currentTarget.value = '' }} /></label>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2"><Button type="button" onClick={() => void supabase.auth.signOut()} variant="outline" className="rounded-2xl"><LogOut className="h-4 w-4" /> Sign out</Button><span className="text-xs text-slate-500">Verification: {user.email_confirmed_at ? 'Verified' : 'Not verified'}.</span></div>
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
