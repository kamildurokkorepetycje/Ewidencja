import { cn } from '@/lib/utils/cn'

interface CardProps {
  children: React.ReactNode
  className?: string
  title?: string
  description?: string
  actions?: React.ReactNode
}

export function Card({ children, className, title, description, actions }: CardProps) {
  return (
    <div className={cn('surface', className)}>
      {(title || actions) && (
        <div className="surface-header flex items-center justify-between">
          <div>
            {title && <h3 className="section-title">{title}</h3>}
            {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: React.ReactNode
  trend?: { value: number; label: string }
  className?: string
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'gray'
}

export function StatCard({ title, value, subtitle, icon, color = 'blue', className }: StatCardProps) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    yellow: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-violet-50 text-violet-600',
    gray: 'bg-slate-100 text-slate-600'
  }
  return (
    <div
      className={cn(
        'surface p-5 flex items-start gap-4',
        className
      )}
    >
      {icon && (
        <div className={cn('p-2.5 rounded-lg shrink-0', colorMap[color])}>{icon}</div>
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-500 truncate">{title}</p>
        <p className="text-2xl font-bold text-slate-950 mt-1 tabular-nums">{value}</p>
        {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
      </div>
    </div>
  )
}
