'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Car } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) {
      toast.error('Wprowadź email i hasło')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        if (error.message.includes('Invalid login')) {
          toast.error('Nieprawidłowy email lub hasło')
        } else {
          toast.error(error.message)
        }
        return
      }
      router.push('/')
      router.refresh()
    } catch {
      toast.error('Błąd logowania. Spróbuj ponownie.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="bg-white rounded-2xl shadow-2xl p-8">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-primary-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <Car size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Ewidencja Przejazdów</h1>
          <p className="text-sm text-gray-500 mt-1">Zaloguj się do swojego konta</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            label="Adres email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jan@firma.pl"
            autoComplete="email"
            required
          />

          <Input
            label="Hasło"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />

          <Button type="submit" loading={loading} className="w-full" size="lg">
            Zaloguj się
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400">
          System ewidencji przejazdów samochodowych
        </p>
      </div>
    </div>
  )
}
