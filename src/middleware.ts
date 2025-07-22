import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { geo } = request;
  const userAgent = request.headers.get('user-agent');
  
  const logData = {
    message: "User access",
    timestamp: new Date().toISOString(),
    userAgent,
    geo,
  };

  console.log(JSON.stringify(logData));

  return NextResponse.next()
}

export const config = {
  matcher: '/:path*',
}
