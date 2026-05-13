import { cn } from '@/lib/utils/cn'
import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react'

interface AlertProps {
  variant?: 'error' | 'warning' | 'success' | 'info'
  title?: string
  children: React.ReactNode
  onClose?: () => void
  className?: string
}

const icons = {
  error: AlertCircle,
  warning: AlertTriangle,
  success: CheckCircle,
  info: Info
}

const styles = {
  error: 'bg-red-50 border-red-200 text-red-800',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  success: 'bg-green-50 border-green-200 text-green-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800'
}

const iconStyles = {
  error: 'text-red-500',
  warning: 'text-yellow-500',
  success: 'text-green-500',
  info: 'text-blue-500'
}

export function Alert({ variant = 'info', title, children, onClose, className }: AlertProps) {
  const Icon = icons[variant]
  return (
    <div className={cn('flex gap-3 rounded-lg border p-4 text-sm', styles[variant], className)}>
      <Icon size={18} className={cn('shrink-0 mt-0.5', iconStyles[variant])} />
      <div className="flex-1">
        {title && <p className="font-semibold mb-1">{title}</p>}
        <div>{children}</div>
      </div>
      {onClose && (
        <button onClick={onClose} className="shrink-0 hover:opacity-70">
          <X size={16} />
        </button>
      )}
    </div>
  )
}
