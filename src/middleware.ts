import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { geo } = request
  const userAgent = request.headers.get('user-agent')

  const ip =
    request.ip ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    null
  
  const logData = {
    message: "User access",
    timestamp: new Date().toISOString(),
    ip,
    userAgent,
    geo,
  };

  console.log(JSON.stringify(logData));

  return NextResponse.next()
}

export const config = {
  matcher: '/:path*',
}
