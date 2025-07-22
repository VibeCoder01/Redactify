import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { ip, method, url } = request;
  const userAgent = request.headers.get('user-agent');
  
  console.log(`[ACCESS LOG] ${new Date().toISOString()} | ${method} ${url} | IP: ${ip} | User-Agent: ${userAgent}`);

  return NextResponse.next()
}

export const config = {
  matcher: '/:path*',
}
