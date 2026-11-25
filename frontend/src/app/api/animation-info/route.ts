import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    totalFrames: 80,
    width: 1280,
    height: 720,
    aspectRatio: 16 / 9,
    fps: 16,
    urlPattern: '/api/animation-frame/{index}',
  });
}
