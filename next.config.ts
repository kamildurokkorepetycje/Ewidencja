import type { NextConfig } from 'next'
import withPWAInit from '@ducanh2912/next-pwa'

const withPWA = withPWAInit({
  dest: 'public',
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  // Re-enable only after upgrading/retesting the worker; the current generated worker fails at runtime.
  disable: true,
  workboxOptions: {
    disableDevLogs: true
  }
})

const nextConfig: NextConfig = {
  serverExternalPackages: ['jspdf', 'jspdf-autotable']
}

export default withPWA(nextConfig)
